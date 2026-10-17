import { ItemRepository, type ItemListOptions } from "./itemRepository.js";
import { type LibraryItem, type NewLibraryItem } from "../db/schema.js";
import { OwnershipError, NotFoundError } from "./errors.js";
import type { CitedocsDb } from "../db/client.js";

/**
 * In-memory implementation of ItemRepository for testing and lightweight environments.
 * Strictly enforces user ownership and data isolation without touching PostgreSQL.
 */
export class InMemoryItemRepository extends ItemRepository {
  private itemsMap = new Map<string, LibraryItem>();

  constructor() {
    // Pass a dummy object as dbInstance so getDb() / pg.Pool is never called
    super({} as CitedocsDb);
  }

  clear(): void {
    this.itemsMap.clear();
  }

  override async list(userId: string, options: ItemListOptions = {}): Promise<LibraryItem[]> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    let items = Array.from(this.itemsMap.values()).filter((item) => item.ownerUserId === userId);

    if (options.itemType) {
      items = items.filter((item) => item.itemType === options.itemType);
    }

    if (options.search) {
      const term = options.search.toLowerCase();
      items = items.filter(
        (item) =>
          Boolean(item.title && item.title.toLowerCase().includes(term)) ||
          Boolean(item.publicationTitle && item.publicationTitle.toLowerCase().includes(term)) ||
          Boolean(item.doi && item.doi.toLowerCase().includes(term))
      );
    }

    if (options.offset) {
      items = items.slice(options.offset);
    }
    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  override async getById(userId: string, itemId: string): Promise<LibraryItem | null> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const item = this.itemsMap.get(itemId);
    if (!item) {
      return null;
    }

    if (item.ownerUserId !== userId) {
      throw new OwnershipError("Access denied: Library item belongs to another user");
    }

    return item;
  }

  override async create(
    userId: string,
    data: Omit<NewLibraryItem, "id" | "ownerUserId" | "dateAdded" | "dateModified">
  ): Promise<LibraryItem> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const id = `item-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const item: LibraryItem = {
      id,
      ownerUserId: userId,
      zoteroKey: data.zoteroKey ?? null,
      version: data.version ?? 0,
      itemType: data.itemType ?? "journalArticle",
      title: data.title ?? "Adsız",
      parsedDate: data.parsedDate ?? null,
      publicationTitle: data.publicationTitle ?? null,
      doi: data.doi ?? null,
      url: data.url ?? null,
      abstractNote: data.abstractNote ?? null,
      metadata: data.metadata ?? {},
      dateAdded: now,
      dateModified: now,
    };
    this.itemsMap.set(id, item);
    return item;
  }

  override async update(
    userId: string,
    itemId: string,
    data: Partial<Omit<NewLibraryItem, "id" | "ownerUserId" | "dateAdded">>
  ): Promise<LibraryItem> {
    const existing = await this.getById(userId, itemId);
    if (!existing) {
      throw new NotFoundError(`Library item ${itemId} not found`);
    }

    const updated: LibraryItem = {
      ...existing,
      ...data,
      dateModified: new Date(),
    };
    this.itemsMap.set(itemId, updated);
    return updated;
  }

  override async delete(userId: string, itemId: string): Promise<boolean> {
    const existing = await this.getById(userId, itemId);
    if (!existing) {
      throw new NotFoundError(`Library item ${itemId} not found`);
    }

    return this.itemsMap.delete(itemId);
  }
}
