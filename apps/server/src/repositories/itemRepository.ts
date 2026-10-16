import { eq, and, desc, ilike, or } from "drizzle-orm";
import { getDb, type CitedocsDb } from "../db/client.js";
import { libraryItems, type LibraryItem, type NewLibraryItem } from "../db/schema.js";
import { assertOwnership } from "./ownership.js";
import { NotFoundError, OwnershipError } from "./errors.js";

export interface ItemListOptions {
  itemType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class ItemRepository {
  private db: CitedocsDb;

  constructor(dbInstance?: CitedocsDb) {
    this.db = dbInstance || getDb();
  }

  /**
   * Retrieves all items belonging to the authenticated user.
   * Cross-user items are never returned.
   */
  async list(userId: string, options: ItemListOptions = {}): Promise<LibraryItem[]> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const conditions = [eq(libraryItems.ownerUserId, userId)];

    if (options.itemType) {
      conditions.push(eq(libraryItems.itemType, options.itemType));
    }

    if (options.search) {
      const term = `%${options.search}%`;
      conditions.push(
        or(
          ilike(libraryItems.title, term),
          ilike(libraryItems.publicationTitle, term),
          ilike(libraryItems.doi, term)
        )!
      );
    }

    const query = this.db
      .select()
      .from(libraryItems)
      .where(and(...conditions))
      .orderBy(desc(libraryItems.dateModified));

    if (options.limit) {
      query.limit(options.limit);
    }
    if (options.offset) {
      query.offset(options.offset);
    }

    return await query;
  }

  /**
   * Retrieves an item by its ID, enforcing ownership.
   * If the item belongs to another user, throws an OwnershipError.
   */
  async getById(userId: string, itemId: string): Promise<LibraryItem | null> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const rows = await this.db
      .select()
      .from(libraryItems)
      .where(eq(libraryItems.id, itemId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const item = rows[0];
    assertOwnership(item.ownerUserId, userId, "Library item");
    return item;
  }

  /**
   * Creates a new library item strictly bound to the authenticated user.
   */
  async create(
    userId: string,
    data: Omit<NewLibraryItem, "id" | "ownerUserId" | "dateAdded" | "dateModified">
  ): Promise<LibraryItem> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const now = new Date();
    const rows = await this.db
      .insert(libraryItems)
      .values({
        ...data,
        ownerUserId: userId,
        dateAdded: now,
        dateModified: now,
      })
      .returning();

    return rows[0];
  }

  /**
   * Updates an existing library item after verifying that the requesting user owns it.
   */
  async update(
    userId: string,
    itemId: string,
    data: Partial<Omit<NewLibraryItem, "id" | "ownerUserId" | "dateAdded">>
  ): Promise<LibraryItem> {
    const existing = await this.getById(userId, itemId);
    if (!existing) {
      throw new NotFoundError(`Library item ${itemId} not found`);
    }

    const rows = await this.db
      .update(libraryItems)
      .set({
        ...data,
        dateModified: new Date(),
      })
      .where(and(eq(libraryItems.id, itemId), eq(libraryItems.ownerUserId, userId)))
      .returning();

    if (rows.length === 0) {
      throw new NotFoundError(`Library item ${itemId} not found`);
    }

    return rows[0];
  }

  /**
   * Deletes a library item after verifying that the requesting user owns it.
   */
  async delete(userId: string, itemId: string): Promise<boolean> {
    const existing = await this.getById(userId, itemId);
    if (!existing) {
      throw new NotFoundError(`Library item ${itemId} not found`);
    }

    const rows = await this.db
      .delete(libraryItems)
      .where(and(eq(libraryItems.id, itemId), eq(libraryItems.ownerUserId, userId)))
      .returning();

    return rows.length > 0;
  }
}
