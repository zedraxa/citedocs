import type { ZoteroItem } from "@citedocs/shared";
import type { LocalChanges } from "./types.js";

/**
 * Pluggable storage abstraction for two-way synchronization.
 * Allows CiteDocs to back sync storage in-memory for unit tests,
 * or with PostgreSQL / Drizzle ORM per user in production.
 */
export interface SyncStore {
  /**
   * Retrieves the Last-Modified-Version recorded for the specified library.
   * Returns 0 if the library has never been synchronized.
   */
  getLibraryVersion(libraryId: string): Promise<number>;

  /**
   * Updates the Last-Modified-Version recorded for the specified library.
   */
  setLibraryVersion(libraryId: string, version: number): Promise<void>;

  /**
   * Retrieves all pending local changes (created items, modified items, deleted keys)
   * that need to be pushed upstream to Zotero.
   */
  getLocalChanges(libraryId: string): Promise<LocalChanges>;

  /**
   * Marks specified local changes as successfully committed upstream,
   * updating their version and clearing pending dirty flags.
   */
  markChangesSynced(
    libraryId: string,
    synced: {
      created?: Record<string, string>; // mapping from client key to server assigned key
      updated?: string[];
      deleted?: string[];
    },
    newVersion: number,
  ): Promise<void>;

  /**
   * Upserts remote items pulled from Zotero into the local store.
   */
  upsertRemoteItems(libraryId: string, items: ZoteroItem[]): Promise<void>;

  /**
   * Permanently deletes items removed remotely from the local store.
   */
  deleteRemoteItems(libraryId: string, itemKeys: string[]): Promise<void>;

  /**
   * Retrieves a single item by key from the local store.
   */
  getItem(libraryId: string, key: string): Promise<ZoteroItem | undefined>;

  /**
   * Retrieves all items in the specified library from the local store.
   */
  getAllItems(libraryId: string): Promise<ZoteroItem[]>;

  /**
   * Retrieves the clean base state of an item before local modifications (for 3-way merge).
   */
  getBaseItem?(libraryId: string, key: string): Promise<ZoteroItem | undefined>;
}

/**
 * In-memory reference implementation of SyncStore.
 * Provides per-library isolated storage and helper methods to stage local edits for testing.
 */
export class InMemorySyncStore implements SyncStore {
  private libraryVersions = new Map<string, number>();
  // libraryId -> Map<key, ZoteroItem>
  private items = new Map<string, Map<string, ZoteroItem>>();
  // libraryId -> Map<key, ZoteroItem> (original snapshot before local modification)
  private baseItems = new Map<string, Map<string, ZoteroItem>>();

  // Pending changes per library
  private pendingCreated = new Map<string, Map<string, ZoteroItem>>();
  private pendingUpdated = new Map<string, Map<string, ZoteroItem>>();
  private pendingDeleted = new Map<string, Set<string>>();

  private getItemsMap(libraryId: string): Map<string, ZoteroItem> {
    let map = this.items.get(libraryId);
    if (!map) {
      map = new Map();
      this.items.set(libraryId, map);
    }
    return map;
  }

  private getBaseItemsMap(libraryId: string): Map<string, ZoteroItem> {
    let map = this.baseItems.get(libraryId);
    if (!map) {
      map = new Map();
      this.baseItems.set(libraryId, map);
    }
    return map;
  }

  async getLibraryVersion(libraryId: string): Promise<number> {
    return this.libraryVersions.get(libraryId) ?? 0;
  }

  async setLibraryVersion(libraryId: string, version: number): Promise<void> {
    this.libraryVersions.set(libraryId, version);
  }

  /**
   * Stages a newly created item to be pushed to remote during next sync.
   */
  stageCreate(libraryId: string, item: ZoteroItem): void {
    const createdMap = this.pendingCreated.get(libraryId) ?? new Map<string, ZoteroItem>();
    createdMap.set(item.key, { ...item });
    this.pendingCreated.set(libraryId, createdMap);

    this.getItemsMap(libraryId).set(item.key, { ...item });
  }

  /**
   * Stages an updated item to be pushed to remote during next sync.
   */
  stageUpdate(libraryId: string, item: ZoteroItem): void {
    const updatedMap = this.pendingUpdated.get(libraryId) ?? new Map<string, ZoteroItem>();
    updatedMap.set(item.key, { ...item });
    this.pendingUpdated.set(libraryId, updatedMap);

    // Save previous state as baseItem if not already saved
    const existing = this.getItemsMap(libraryId).get(item.key);
    if (existing && !this.getBaseItemsMap(libraryId).has(item.key)) {
      this.getBaseItemsMap(libraryId).set(item.key, { ...existing });
    }

    this.getItemsMap(libraryId).set(item.key, { ...item });
  }

  /**
   * Stages an item deletion to be pushed to remote during next sync.
   */
  stageDelete(libraryId: string, key: string): void {
    const deletedSet = this.pendingDeleted.get(libraryId) ?? new Set<string>();
    deletedSet.add(key);
    this.pendingDeleted.set(libraryId, deletedSet);

    // Remove from local items map
    this.getItemsMap(libraryId).delete(key);
  }

  async getLocalChanges(libraryId: string): Promise<LocalChanges> {
    const created = Array.from(this.pendingCreated.get(libraryId)?.values() ?? []);
    const updated = Array.from(this.pendingUpdated.get(libraryId)?.values() ?? []);
    const deletedKeys = Array.from(this.pendingDeleted.get(libraryId)?.values() ?? []);

    return {
      created,
      updated,
      deletedKeys,
    };
  }

  async markChangesSynced(
    libraryId: string,
    synced: {
      created?: Record<string, string>;
      updated?: string[];
      deleted?: string[];
    },
    newVersion: number,
  ): Promise<void> {
    const itemsMap = this.getItemsMap(libraryId);
    const baseMap = this.getBaseItemsMap(libraryId);

    // 1. Process created items
    if (synced.created) {
      const createdPending = this.pendingCreated.get(libraryId);
      for (const [tempKey, serverKey] of Object.entries(synced.created)) {
        const item = itemsMap.get(tempKey) ?? createdPending?.get(tempKey);
        if (item) {
          itemsMap.delete(tempKey);
          const updatedItem = { ...item, key: serverKey, version: newVersion };
          itemsMap.set(serverKey, updatedItem);
          baseMap.set(serverKey, { ...updatedItem });
        }
        createdPending?.delete(tempKey);
      }
    }

    // 2. Process updated items
    if (synced.updated) {
      const updatedPending = this.pendingUpdated.get(libraryId);
      for (const key of synced.updated) {
        const item = itemsMap.get(key);
        if (item) {
          item.version = newVersion;
          baseMap.set(key, { ...item });
        }
        updatedPending?.delete(key);
      }
    }

    // 3. Process deleted items
    if (synced.deleted) {
      const deletedPending = this.pendingDeleted.get(libraryId);
      for (const key of synced.deleted) {
        itemsMap.delete(key);
        baseMap.delete(key);
        deletedPending?.delete(key);
      }
    }

    this.libraryVersions.set(libraryId, newVersion);
  }

  async upsertRemoteItems(libraryId: string, items: ZoteroItem[]): Promise<void> {
    const itemsMap = this.getItemsMap(libraryId);
    const baseMap = this.getBaseItemsMap(libraryId);

    for (const item of items) {
      itemsMap.set(item.key, { ...item });
      baseMap.set(item.key, { ...item });

      // If this item was pending local update and now remote is applied, clean pending update
      this.pendingUpdated.get(libraryId)?.delete(item.key);
      this.pendingCreated.get(libraryId)?.delete(item.key);
    }
  }

  async deleteRemoteItems(libraryId: string, itemKeys: string[]): Promise<void> {
    const itemsMap = this.getItemsMap(libraryId);
    const baseMap = this.getBaseItemsMap(libraryId);

    for (const key of itemKeys) {
      itemsMap.delete(key);
      baseMap.delete(key);
      this.pendingUpdated.get(libraryId)?.delete(key);
      this.pendingDeleted.get(libraryId)?.delete(key);
    }
  }

  async getItem(libraryId: string, key: string): Promise<ZoteroItem | undefined> {
    const item = this.getItemsMap(libraryId).get(key);
    return item ? { ...item } : undefined;
  }

  async getAllItems(libraryId: string): Promise<ZoteroItem[]> {
    return Array.from(this.getItemsMap(libraryId).values()).map((i) => ({ ...i }));
  }

  async getBaseItem(libraryId: string, key: string): Promise<ZoteroItem | undefined> {
    const item = this.getBaseItemsMap(libraryId).get(key);
    return item ? { ...item } : undefined;
  }
}
