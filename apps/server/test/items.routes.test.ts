import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import { ItemRepository } from "../src/repositories/itemRepository.js";
import { OwnershipError, NotFoundError } from "../src/repositories/errors.js";
import type { LibraryItem } from "../src/db/schema.js";

class InMemoryItemRepository extends ItemRepository {
  private itemsMap = new Map<string, LibraryItem>();

  override async list(userId: string): Promise<LibraryItem[]> {
    if (!userId) throw new OwnershipError("Unauthenticated: valid user ID is required");
    return Array.from(this.itemsMap.values()).filter((item) => item.ownerUserId === userId);
  }

  override async getById(userId: string, itemId: string): Promise<LibraryItem | null> {
    if (!userId) throw new OwnershipError("Unauthenticated: valid user ID is required");
    const item = this.itemsMap.get(itemId);
    if (!item) return null;
    if (item.ownerUserId !== userId) {
      throw new OwnershipError("Access denied: Library item belongs to another user");
    }
    return item;
  }

  override async create(
    userId: string,
    data: Partial<NewLibraryItem>
  ): Promise<LibraryItem> {
    if (!userId) throw new OwnershipError("Unauthenticated: valid user ID is required");
    const id = `item-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const item: LibraryItem = {
      id,
      ownerUserId: userId,
      zoteroKey: data.zoteroKey || null,
      version: 0,
      itemType: data.itemType || "journalArticle",
      title: data.title || "Untitled",
      parsedDate: data.parsedDate || null,
      publicationTitle: data.publicationTitle || null,
      doi: data.doi || null,
      url: data.url || null,
      abstractNote: data.abstractNote || null,
      metadata: data.metadata || {},
      dateAdded: now,
      dateModified: now,
    };
    this.itemsMap.set(id, item);
    return item;
  }

  override async update(
    userId: string,
    itemId: string,
    data: Partial<NewLibraryItem>
  ): Promise<LibraryItem> {
    const existing = await this.getById(userId, itemId);
    if (!existing) throw new NotFoundError(`Item ${itemId} not found`);
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
    if (!existing) throw new NotFoundError(`Item ${itemId} not found`);
    return this.itemsMap.delete(itemId);
  }
}

describe("GET/POST /api/items route with ownership & tenant isolation", () => {
  let app: FastifyInstance;
  let inMemoryRepo: InMemoryItemRepository;

  const studentAlice = "alice-uuid-001";
  const studentBob = "bob-uuid-002";

  beforeAll(async () => {
    inMemoryRepo = new InMemoryItemRepository();
    app = await buildApp({ itemRepo: inMemoryRepo });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated requests without X-User-Id header with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/items",
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toContain("X-User-Id");
  });

  it("creates a library item scoped strictly to authenticated student", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: {
        "x-user-id": studentAlice,
      },
      payload: {
        title: "CRDT and Real-Time Editing in Education",
        itemType: "journalArticle",
        doi: "10.1145/1234567",
      },
    });

    expect(res.statusCode).toBe(201);
    const item = JSON.parse(res.body);
    expect(item.id).toBeDefined();
    expect(item.ownerUserId).toBe(studentAlice);
    expect(item.title).toBe("CRDT and Real-Time Editing in Education");
  });

  it("lists items belonging only to the requesting user", async () => {
    // 1. Alice's items
    const aliceRes = await app.inject({
      method: "GET",
      url: "/api/items",
      headers: {
        "x-user-id": studentAlice,
      },
    });
    expect(aliceRes.statusCode).toBe(200);
    const aliceItems = JSON.parse(aliceRes.body);
    expect(aliceItems.length).toBeGreaterThanOrEqual(1);
    expect(aliceItems.every((it: LibraryItem) => it.ownerUserId === studentAlice)).toBe(true);

    // 2. Bob's items (isolation check - Bob must NOT see Alice's item)
    const bobRes = await app.inject({
      method: "GET",
      url: "/api/items",
      headers: {
        "x-user-id": studentBob,
      },
    });
    expect(bobRes.statusCode).toBe(200);
    const bobItems = JSON.parse(bobRes.body);
    expect(bobItems.length).toBe(0);
  });

  it("prevents Bob from fetching Alice's item by ID (returns 403 Forbidden)", async () => {
    // Create an item for Alice
    const createRes = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { "x-user-id": studentAlice },
      payload: { title: "Alice's Private Research" },
    });
    const aliceItem = JSON.parse(createRes.body);

    // Alice fetches it successfully
    const aliceGetRes = await app.inject({
      method: "GET",
      url: `/api/items/${aliceItem.id}`,
      headers: { "x-user-id": studentAlice },
    });
    expect(aliceGetRes.statusCode).toBe(200);

    // Bob tries to fetch Alice's item
    const bobGetRes = await app.inject({
      method: "GET",
      url: `/api/items/${aliceItem.id}`,
      headers: { "x-user-id": studentBob },
    });
    expect(bobGetRes.statusCode).toBe(403);
    const body = JSON.parse(bobGetRes.body);
    expect(body.error).toBe("Forbidden");
    expect(body.message).toContain("belongs to another user");
  });

  it("prevents Bob from updating or deleting Alice's item (returns 403 Forbidden)", async () => {
    // Create an item for Alice
    const createRes = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { "x-user-id": studentAlice },
      payload: { title: "Alice's Protected Book" },
    });
    const aliceItem = JSON.parse(createRes.body);

    // Bob tries to update
    const bobPutRes = await app.inject({
      method: "PUT",
      url: `/api/items/${aliceItem.id}`,
      headers: { "x-user-id": studentBob },
      payload: { title: "Attacked Title" },
    });
    expect(bobPutRes.statusCode).toBe(403);

    // Bob tries to delete
    const bobDeleteRes = await app.inject({
      method: "DELETE",
      url: `/api/items/${aliceItem.id}`,
      headers: { "x-user-id": studentBob },
    });
    expect(bobDeleteRes.statusCode).toBe(403);

    // Alice can update her own item
    const alicePutRes = await app.inject({
      method: "PUT",
      url: `/api/items/${aliceItem.id}`,
      headers: { "x-user-id": studentAlice },
      payload: { title: "Alice's Updated Book" },
    });
    expect(alicePutRes.statusCode).toBe(200);
    expect(JSON.parse(alicePutRes.body).title).toBe("Alice's Updated Book");

    // Alice can delete her own item
    const aliceDeleteRes = await app.inject({
      method: "DELETE",
      url: `/api/items/${aliceItem.id}`,
      headers: { "x-user-id": studentAlice },
    });
    expect(aliceDeleteRes.statusCode).toBe(200);
    expect(JSON.parse(aliceDeleteRes.body).success).toBe(true);
  });

  it("returns 404 when item does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/items/non-existent-item",
      headers: { "x-user-id": studentAlice },
    });
    expect(res.statusCode).toBe(404);
  });
});
