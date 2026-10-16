import type { ZoteroItem } from "@citedocs/shared";
import {
  type LibraryTarget,
  type SyncStatus,
  type SyncOptions,
  type SyncResult,
  type ConflictDetail,
  getLibraryId,
} from "./types.js";
import { ZoteroWebApiClient } from "./api-client.js";
import { type SyncStore, InMemorySyncStore } from "./sync-store.js";
import { ZoteroVersionConflictError, ZoteroApiError } from "./errors.js";

/**
 * Deep equality checker for primitives, arrays, and plain objects.
 */
export function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!areValuesEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!areValuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Merges a local item and a remote item field-by-field.
 * Conflict policy:
 * - Remote wins on fields changed remotely.
 * - Local wins on fields changed only locally.
 * - When both changed the same field to different values, remote wins and the conflict is reported.
 */
export function mergeZoteroItemFieldWise(
  baseItem: ZoteroItem | undefined,
  localItem: ZoteroItem,
  remoteItem: ZoteroItem,
): { merged: ZoteroItem; conflicts: ConflictDetail[] } {
  const merged: ZoteroItem = {
    ...remoteItem,
    // Start with remoteItem as base, maintaining remote key and newest remote version
    key: remoteItem.key,
    version: remoteItem.version,
  };

  const conflicts: ConflictDetail[] = [];
  const allKeys = new Set<string>([
    ...Object.keys(localItem),
    ...Object.keys(remoteItem),
    ...(baseItem ? Object.keys(baseItem) : []),
  ]);

  for (const field of allKeys) {
    if (field === "key" || field === "version") continue;

    const localRecord = localItem as unknown as Record<string, unknown>;
    const remoteRecord = remoteItem as unknown as Record<string, unknown>;
    const baseRecord = baseItem ? (baseItem as unknown as Record<string, unknown>) : undefined;
    const mergedRecord = merged as unknown as Record<string, unknown>;

    const localVal = localRecord[field];
    const remoteVal = remoteRecord[field];
    const baseVal = baseRecord ? baseRecord[field] : undefined;

    if (baseItem) {
      const localChanged = !areValuesEqual(localVal, baseVal);
      const remoteChanged = !areValuesEqual(remoteVal, baseVal);

      if (localChanged && remoteChanged) {
        if (!areValuesEqual(localVal, remoteVal)) {
          // True conflict: both modified field to different values.
          // Remote wins, conflict exposed in results.
          mergedRecord[field] = remoteVal;
          conflicts.push({
            itemKey: localItem.key,
            field,
            localValue: localVal,
            remoteValue: remoteVal,
            resolvedValue: remoteVal,
            resolution: "remote-wins",
          });
        } else {
          mergedRecord[field] = remoteVal;
        }
      } else if (remoteChanged) {
        // Changed only remotely
        mergedRecord[field] = remoteVal;
      } else if (localChanged) {
        // Changed only locally: local wins!
        mergedRecord[field] = localVal;
      } else {
        mergedRecord[field] = remoteVal ?? baseVal;
      }
    } else {
      // 2-way fallback when base is unavailable
      if (areValuesEqual(localVal, remoteVal)) {
        mergedRecord[field] = remoteVal;
      } else if (localVal !== undefined && (remoteVal === undefined || remoteVal === "")) {
        // Local has a value, remote does not: local wins
        mergedRecord[field] = localVal;
      } else if (remoteVal !== undefined && (localVal === undefined || localVal === "")) {
        // Remote has a value, local does not: remote wins
        mergedRecord[field] = remoteVal;
      } else {
        // Conflict: remote wins
        mergedRecord[field] = remoteVal;
        conflicts.push({
          itemKey: localItem.key,
          field,
          localValue: localVal,
          remoteValue: remoteVal,
          resolvedValue: remoteVal,
          resolution: "remote-wins",
        });
      }
    }
  }

  return { merged, conflicts };
}

export interface SyncEngineConstructorOptions {
  client: ZoteroWebApiClient;
  store: SyncStore;
  target: LibraryTarget;
  maxConflictRetries?: number;
}

/**
 * Two-way incremental synchronization engine implementing Zotero's documented sync protocol.
 * Pulls downstream changes via ?format=versions&since= and /deleted?since=,
 * applies them to a pluggable SyncStore, then pushes pending local creations/updates/deletions
 * with If-Unmodified-Since-Version and Zotero-Write-Token in batches of <= 50.
 *
 * Automatically resolves optimistic concurrency conflicts (HTTP 412) via field-wise merge.
 */
export class SyncEngine {
  protected client: ZoteroWebApiClient;
  protected store: SyncStore;
  protected target: LibraryTarget;
  protected status: SyncStatus = "idle";
  protected maxConflictRetries: number;

  constructor(options: SyncEngineConstructorOptions) {
    this.client = options.client;
    this.store = options.store;
    this.target = options.target;
    this.maxConflictRetries = options.maxConflictRetries ?? 3;
  }

  public getStatus(): SyncStatus {
    return this.status;
  }

  public async getLibraryVersion(): Promise<number> {
    return await this.store.getLibraryVersion(getLibraryId(this.target));
  }

  /**
   * Executes a complete two-way synchronization cycle:
   * 1. Pull Phase: fetches remote updates and deletions, applies them locally.
   * 2. Push Phase: pushes staged local changes in batches of <= 50.
   * 3. On 412: re-pulls conflicting remote items, performs field-wise merge, records conflicts.
   */
  async sync(): Promise<SyncResult> {
    this.status = "pulling";
    const libraryId = getLibraryId(this.target);
    let currentLibVersion = await this.store.getLibraryVersion(libraryId);

    let pulledCount = 0;
    let deletedRemotelyCount = 0;
    let pushedCreatedCount = 0;
    let pushedUpdatedCount = 0;
    let pushedDeletedCount = 0;
    const allConflicts: ConflictDetail[] = [];
    const updatedItemsList: ZoteroItem[] = [];
    const deletedItemKeysList: string[] = [];

    try {
      // -------------------------------------------------------------
      // 1. PULL PHASE
      // -------------------------------------------------------------
      if (currentLibVersion === 0) {
        // Initial full sync: fetch all library items with pagination
        const allItemsResult = await this.client.getAllItems(this.target);
        if (allItemsResult.items.length > 0) {
          await this.store.upsertRemoteItems(libraryId, allItemsResult.items);
          pulledCount = allItemsResult.items.length;
          updatedItemsList.push(...allItemsResult.items);
        }
        currentLibVersion = allItemsResult.lastModifiedVersion;
        await this.store.setLibraryVersion(libraryId, currentLibVersion);
      } else {
        // Incremental pull: fetch modified keys and deleted tombstones
        const versionsRes = await this.client.getItemVersions(this.target, { since: currentLibVersion });
        const changedKeys = versionsRes.status !== 304 && versionsRes.data ? Object.keys(versionsRes.data) : [];

        if (changedKeys.length > 0) {
          const changedItems = await this.client.getItemsByKeys(this.target, changedKeys);
          await this.store.upsertRemoteItems(libraryId, changedItems);
          pulledCount = changedItems.length;
          updatedItemsList.push(...changedItems);
        }

        const deletedRes = await this.client.getDeleted(this.target, currentLibVersion);
        const deletedKeys = deletedRes.data.items || [];
        if (deletedKeys.length > 0) {
          await this.store.deleteRemoteItems(libraryId, deletedKeys);
          deletedRemotelyCount = deletedKeys.length;
          deletedItemKeysList.push(...deletedKeys);
        }

        const newVersion = Math.max(
          currentLibVersion,
          versionsRes.lastModifiedVersion ?? 0,
          deletedRes.lastModifiedVersion ?? 0,
        );
        if (newVersion > currentLibVersion) {
          currentLibVersion = newVersion;
          await this.store.setLibraryVersion(libraryId, currentLibVersion);
        }
      }

      // -------------------------------------------------------------
      // 2. PUSH PHASE (with 412 Conflict Resolution & Retry)
      // -------------------------------------------------------------
      this.status = "pushing";
      let pushAttempt = 0;

      while (pushAttempt <= this.maxConflictRetries) {
        pushAttempt++;
        const localChanges = await this.store.getLocalChanges(libraryId);
        const hasChanges =
          localChanges.created.length > 0 ||
          localChanges.updated.length > 0 ||
          localChanges.deletedKeys.length > 0;

        if (!hasChanges) {
          break;
        }

        try {
          // Push created and updated items in batches of <= 50
          const itemsToPush = [...localChanges.created, ...localChanges.updated];
          if (itemsToPush.length > 0) {
            const writeRes = await this.client.createOrUpdateItems(this.target, itemsToPush, {
              ifUnmodifiedSinceVersion: currentLibVersion,
            });

            const createdMap: Record<string, string> = {};
            const updatedKeys: string[] = [];

            for (let i = 0; i < localChanges.created.length; i++) {
              const origKey = localChanges.created[i].key;
              const serverKey = writeRes.success[String(i)] || writeRes.success[origKey] || origKey;
              createdMap[origKey] = serverKey;
            }

            for (let i = 0; i < localChanges.updated.length; i++) {
              const origKey = localChanges.updated[i].key;
              updatedKeys.push(origKey);
            }

            await this.store.markChangesSynced(
              libraryId,
              {
                created: createdMap,
                updated: updatedKeys,
              },
              writeRes.lastModifiedVersion ?? currentLibVersion,
            );

            pushedCreatedCount += localChanges.created.length;
            pushedUpdatedCount += localChanges.updated.length;
            if (writeRes.lastModifiedVersion) {
              currentLibVersion = writeRes.lastModifiedVersion;
            }
          }

          // Push deleted items in batches of <= 50
          if (localChanges.deletedKeys.length > 0) {
            const delRes = await this.client.deleteItems(this.target, localChanges.deletedKeys, {
              ifUnmodifiedSinceVersion: currentLibVersion,
            });

            await this.store.markChangesSynced(
              libraryId,
              {
                deleted: delRes.deletedKeys,
              },
              delRes.lastModifiedVersion ?? currentLibVersion,
            );

            pushedDeletedCount += delRes.deletedKeys.length;
            if (delRes.lastModifiedVersion) {
              currentLibVersion = delRes.lastModifiedVersion;
            }
          }

          break; // Successfully pushed all pending changes!
        } catch (err: unknown) {
          if (
            err instanceof ZoteroVersionConflictError ||
            (err instanceof ZoteroApiError && err.statusCode === 412)
          ) {
            this.status = "conflict";
            if (pushAttempt > this.maxConflictRetries) {
              this.status = "error";
              throw err;
            }

            // Conflict detected:
            // 1. Re-pull changed remote items
            const versionsRes = await this.client.getItemVersions(this.target, { since: currentLibVersion });
            const changedKeys = versionsRes.status !== 304 && versionsRes.data ? Object.keys(versionsRes.data) : [];

            let remoteItems: ZoteroItem[] = [];
            if (changedKeys.length > 0) {
              remoteItems = await this.client.getItemsByKeys(this.target, changedKeys);
            }
            const remoteMap = new Map<string, ZoteroItem>(remoteItems.map((i) => [i.key, i]));

            // Apply remote deletions
            const deletedRes = await this.client.getDeleted(this.target, currentLibVersion);
            if (deletedRes.data.items?.length > 0) {
              await this.store.deleteRemoteItems(libraryId, deletedRes.data.items);
              deletedRemotelyCount += deletedRes.data.items.length;
            }

            currentLibVersion = Math.max(
              currentLibVersion,
              versionsRes.lastModifiedVersion ?? 0,
              deletedRes.lastModifiedVersion ?? 0,
            );
            await this.store.setLibraryVersion(libraryId, currentLibVersion);

            // 2. Perform field-wise merge for updated local items
            for (const localItem of localChanges.updated) {
              const remoteItem = remoteMap.get(localItem.key);
              if (remoteItem) {
                const baseItem = this.store.getBaseItem
                  ? await this.store.getBaseItem(libraryId, localItem.key)
                  : undefined;
                const { merged, conflicts } = mergeZoteroItemFieldWise(baseItem, localItem, remoteItem);
                allConflicts.push(...conflicts);

                if (this.store instanceof InMemorySyncStore) {
                  this.store.stageUpdate(libraryId, merged);
                } else {
                  await this.store.upsertRemoteItems(libraryId, [merged]);
                }
              }
            }

            // Upsert non-conflicting remote items
            const nonConflicting = remoteItems.filter(
              (r) => !localChanges.updated.some((l) => l.key === r.key),
            );
            if (nonConflicting.length > 0) {
              await this.store.upsertRemoteItems(libraryId, nonConflicting);
              pulledCount += nonConflicting.length;
            }

            this.status = "pushing";
            continue;
          }

          this.status = "error";
          throw err;
        }
      }

      this.status = "idle";
      return {
        libraryVersion: currentLibVersion,
        pulledCount,
        deletedRemotelyCount,
        pushedCreatedCount,
        pushedUpdatedCount,
        pushedDeletedCount,
        conflicts: allConflicts,
        updatedItems: updatedItemsList,
        deletedItemKeys: deletedItemKeysList,
        newLibraryVersion: currentLibVersion,
      };
    } catch (err: unknown) {
      this.status = "error";
      throw err;
    }
  }
}

/**
 * Backward-compatible wrapper preserving the initial ZoteroSyncEngine API
 * while leveraging ZoteroWebApiClient, InMemorySyncStore and SyncEngine under the hood.
 */
export class ZoteroSyncEngine extends SyncEngine {
  private userId: string;
  private apiKey: string;
  private currentVersion: number;

  constructor(options: SyncOptions, initialVersion = 0) {
    const userId = options.userId || "0";
    const apiKey = options.apiKey || "dummy";
    const client = new ZoteroWebApiClient({
      apiKey,
      baseUrl: options.baseUrl,
      fetchFn: options.fetchFn,
    });
    const store = new InMemorySyncStore();
    const target: LibraryTarget = { type: "user", userId };

    super({ client, store, target });
    this.userId = userId;
    this.apiKey = apiKey;
    this.currentVersion = initialVersion;
    this.store.setLibraryVersion(getLibraryId(target), initialVersion);
  }

  public getVersion(): number {
    return this.currentVersion;
  }

  public getUserId(): string {
    return this.userId;
  }

  public getHeaders(write = false): Record<string, string> {
    const headers: Record<string, string> = {
      "Zotero-API-Version": "3",
      "Zotero-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };

    if (this.currentVersion > 0) {
      if (write) {
        headers["If-Unmodified-Since-Version"] = String(this.currentVersion);
      } else {
        headers["If-Modified-Since-Version"] = String(this.currentVersion);
      }
    }

    return headers;
  }

  async checkUpdates(): Promise<{ hasUpdates: boolean; serverVersion: number }> {
    this.status = "pulling";
    try {
      const res = await this.client.getItemVersions(this.target, { since: this.currentVersion });
      this.status = "idle";
      if (res.status === 304) {
        return { hasUpdates: false, serverVersion: this.currentVersion };
      }
      const serverVersion = res.lastModifiedVersion ?? this.currentVersion;
      return {
        hasUpdates: serverVersion > this.currentVersion,
        serverVersion,
      };
    } catch (err) {
      this.status = "error";
      throw err;
    }
  }

  public evaluateConflict(localItem: ZoteroItem, remoteItem: ZoteroItem): boolean {
    if (localItem.key !== remoteItem.key) return false;
    return remoteItem.version > localItem.version;
  }

  public updateLocalVersion(newVersion: number): void {
    if (newVersion > this.currentVersion) {
      this.currentVersion = newVersion;
      this.store.setLibraryVersion(getLibraryId(this.target), newVersion);
    }
  }
}
