import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import { InMemoryItemRepository } from "../src/repositories/inMemoryItemRepository.js";
import type { LibraryItem } from "../src/db/schema.js";
import { TranslationClient } from "@citedocs/zotero-core";
import type { ZoteroItem } from "@citedocs/shared";

describe("GET/POST /api/items route with ownership & tenant isolation", () => {
  let app: FastifyInstance;
  let inMemoryRepo: InMemoryItemRepository;

  const studentAlice = "alice-uuid-001";
  const studentBob = "bob-uuid-002";

  const natureDoiFixture: ZoteroItem = {
    key: "NAT3392Y",
    version: 1,
    itemType: "journalArticle",
    title: "The changing landscape of atherosclerosis",
    creators: [
      {
        creatorType: "author",
        firstName: "Peter",
        lastName: "Libby",
      },
    ],
    publicationTitle: "Nature",
    volume: "592",
    issue: "7855",
    pages: "524-533",
    date: "2021-04-21",
    DOI: "10.1038/s41586-021-03392-y",
    tags: [{ tag: "cardiology" }],
    collections: [],
  };

  const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/search")) {
      const body = String(init?.body || "");
      if (body.includes("10.1038/s41586-021-03392-y")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => [natureDoiFixture],
        };
      }
    }
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "Not found",
    };
  });

  const mockClient = new TranslationClient({
    baseUrl: "http://localhost:1969",
    fetchFn: mockFetch as unknown as typeof fetch,
  });

  beforeAll(async () => {
    inMemoryRepo = new InMemoryItemRepository();
    app = await buildApp({ itemRepo: inMemoryRepo, zoteroClient: mockClient });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    inMemoryRepo.clear();
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/items",
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toContain("session");
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
    // 1. Create item for Alice
    await inMemoryRepo.create(studentAlice, {
      title: "Alice's Paper",
      itemType: "journalArticle",
      version: 0,
    });

    // Alice's items
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

  describe("Add by identifier integration in items route", () => {
    it("POST /api/items/from-identifier requires auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/items/from-identifier",
        payload: { identifier: "10.1038/s41586-021-03392-y" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("POST /api/items/from-identifier persists item owned by requesting user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/items/from-identifier",
        headers: { "x-user-id": studentAlice },
        payload: { identifier: "10.1038/s41586-021-03392-y" },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.item.id).toBeDefined();

      const stored = await inMemoryRepo.getById(studentAlice, data.item.id);
      expect(stored).not.toBeNull();
      expect(stored!.ownerUserId).toBe(studentAlice);
      expect(stored!.title).toBe("The changing landscape of atherosclerosis");
      expect(stored!.publicationTitle).toBe("Nature");
      expect(stored!.doi).toBe("10.1038/s41586-021-03392-y");
      expect(stored!.parsedDate).toBe("2021-04-21");

      const metadata = stored!.metadata as Record<string, unknown>;
      expect(metadata.creators).toEqual(natureDoiFixture.creators);
      expect(metadata.containerTitle).toBe("Nature");

      // Bob cannot view Alice's newly imported item
      const bobGet = await app.inject({
        method: "GET",
        url: `/api/items/${data.item.id}`,
        headers: { "x-user-id": studentBob },
      });
      expect(bobGet.statusCode).toBe(403);
    });
  });
});
