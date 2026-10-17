import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { InMemoryItemRepository } from "../src/repositories/inMemoryItemRepository.js";
import { InMemoryZoteroCredentialRepository } from "../src/repositories/inMemoryZoteroRepository.js";
import { ZoteroAccountService } from "../src/zotero/accountService.js";
import { ZoteroProxyService } from "../src/zotero/proxyService.js";
import { ZoteroCache } from "../src/zotero/cache.js";

describe("Zotero Server-Side Cache & Proxy (apps/server)", () => {
  describe("ZoteroCache Unit Tests", () => {
    it("builds deterministic cache keys with user isolation and sorted query parameters", () => {
      const key1 = ZoteroCache.buildKey("student-alice", "users:112233", "/users/112233/items/", {
        limit: "25",
        sort: "dateAdded",
        direction: "desc",
      });
      const key2 = ZoteroCache.buildKey("student-alice", "users:112233", "users/112233/items", {
        direction: "desc",
        limit: "25",
        sort: "dateAdded",
      });
      const keyBob = ZoteroCache.buildKey("student-bob", "users:112233", "users/112233/items", {
        limit: "25",
        sort: "dateAdded",
        direction: "desc",
      });

      expect(key1).toBe(key2);
      expect(key1).toContain("student-alice::users:112233");
      expect(keyBob).toContain("student-bob::users:112233");
      expect(key1).not.toBe(keyBob);
    });

    it("extracts library ID correctly from various paths", () => {
      expect(ZoteroCache.extractLibraryId("/users/42/items")).toBe("users:42");
      expect(ZoteroCache.extractLibraryId("users/abc_xyz/collections/123/items")).toBe("users:abc_xyz");
      expect(ZoteroCache.extractLibraryId("groups/98765/items")).toBe("groups:98765");
      expect(ZoteroCache.extractLibraryId("keys/current")).toBe("general");
    });

    it("stores and retrieves fresh cache entries", () => {
      const cache = new ZoteroCache({ ttlMs: 10_000 });
      cache.set({
        key: "user1::lib1::items",
        userId: "user1",
        libraryId: "lib1",
        subPath: "items",
        status: 200,
        headers: { "last-modified-version": "100" },
        data: [{ id: "item1" }],
        lastModifiedVersion: "100",
      });

      const res = cache.get("user1::lib1::items");
      expect(res).not.toBeNull();
      expect(res?.isStale).toBe(false);
      expect(res?.entry.data).toEqual([{ id: "item1" }]);
      expect(res?.entry.lastModifiedVersion).toBe("100");
    });

    it("never stores responses with HTTP status >= 400", () => {
      const cache = new ZoteroCache();
      cache.set({
        key: "user1::lib1::error",
        userId: "user1",
        libraryId: "lib1",
        subPath: "error",
        status: 404,
        headers: {},
        data: { error: "Not Found" },
      });
      cache.set({
        key: "user1::lib1::server-error",
        userId: "user1",
        libraryId: "lib1",
        subPath: "server-error",
        status: 500,
        headers: {},
        data: { error: "Internal Server Error" },
      });

      expect(cache.get("user1::lib1::error")).toBeNull();
      expect(cache.get("user1::lib1::server-error")).toBeNull();
      expect(cache.size).toBe(0);
    });

    it("evicts least recently used items when capacity is reached", () => {
      const cache = new ZoteroCache({ maxEntries: 2, ttlMs: 60_000 });
      cache.set({
        key: "k1",
        userId: "u1",
        libraryId: "l1",
        subPath: "p1",
        status: 200,
        headers: {},
        data: 1,
      });
      cache.set({
        key: "k2",
        userId: "u1",
        libraryId: "l1",
        subPath: "p2",
        status: 200,
        headers: {},
        data: 2,
      });

      // Access k1 so k2 becomes the oldest (LRU)
      cache.get("k1");

      // Insert k3 -> should evict k2
      cache.set({
        key: "k3",
        userId: "u1",
        libraryId: "l1",
        subPath: "p3",
        status: 200,
        headers: {},
        data: 3,
      });

      expect(cache.size).toBe(2);
      expect(cache.get("k1")).not.toBeNull();
      expect(cache.get("k3")).not.toBeNull();
      expect(cache.get("k2")).toBeNull();
    });

    it("invalidates all entries belonging to a library", () => {
      const cache = new ZoteroCache();
      cache.set({ key: "u1::users:42::items", userId: "u1", libraryId: "users:42", subPath: "items", status: 200, headers: {}, data: [] });
      cache.set({ key: "u1::users:42::tags", userId: "u1", libraryId: "users:42", subPath: "tags", status: 200, headers: {}, data: [] });
      cache.set({ key: "u1::users:99::items", userId: "u1", libraryId: "users:99", subPath: "items", status: 200, headers: {}, data: [] });

      expect(cache.size).toBe(3);

      const count = cache.invalidateLibrary("u1", "users:42");
      expect(count).toBe(2);
      expect(cache.size).toBe(1);
      expect(cache.get("u1::users:42::items")).toBeNull();
      expect(cache.get("u1::users:42::tags")).toBeNull();
      expect(cache.get("u1::users:99::items")).not.toBeNull();
    });

    it("tracks and honors Backoff / Retry-After windows", () => {
      const cache = new ZoteroCache();
      expect(cache.getBackoffRemaining("u1", "users:42")).toBe(0);

      cache.setBackoff("u1", "users:42", 5);
      const remaining = cache.getBackoffRemaining("u1", "users:42");
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(5);
    });
  });

  describe("ZoteroProxyService Integration with Fastify App", () => {
    let itemRepo: InMemoryItemRepository;
    let zoteroRepo: InMemoryZoteroCredentialRepository;
    let mockFetch: ReturnType<typeof vi.fn>;
    let accountService: ZoteroAccountService;
    let proxyService: ZoteroProxyService;
    let app: Awaited<ReturnType<typeof buildApp>>;

    const userAlice = "user-alice-uuid";
    const userBob = "user-bob-uuid";
    const keyAlice = "valid_zotero_api_key_alice_123";
    const keyBob = "valid_zotero_api_key_bob_456";

    beforeEach(async () => {
      itemRepo = new InMemoryItemRepository();
      zoteroRepo = new InMemoryZoteroCredentialRepository();

      mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        // Key validation mock
        if (url.includes("/keys/current")) {
          const authKey = (init?.headers as Record<string, string>)?.["Zotero-API-Key"];
          if (authKey === keyAlice) {
            return {
              ok: true,
              status: 200,
              headers: new Headers({ "content-type": "application/json" }),
              json: async () => ({ key: keyAlice, userId: 112233, username: "alice" }),
            };
          }
          if (authKey === keyBob) {
            return {
              ok: true,
              status: 200,
              headers: new Headers({ "content-type": "application/json" }),
              json: async () => ({ key: keyBob, userId: 445566, username: "bob" }),
            };
          }
          return { ok: false, status: 401, headers: new Headers(), json: async () => ({}) };
        }

        // Upstream Zotero API mock
        if (url.includes("api.zotero.org")) {
          const headers = (init?.headers as Record<string, string>) || {};
          const method = init?.method || "GET";

          // If write method
          if (method === "POST" || method === "PUT" || method === "DELETE") {
            return {
              ok: true,
              status: 200,
              headers: new Headers({
                "content-type": "application/json",
                "last-modified-version": "43",
              }),
              json: async () => ({ successful: { "0": { key: "NEW_ITEM" } } }),
            };
          }

          // Error simulation url
          if (url.includes("/simulated-error")) {
            return {
              ok: false,
              status: 500,
              headers: new Headers({ "content-type": "application/json" }),
              json: async () => ({ error: "Internal Server Error" }),
            };
          }

          // Backoff simulation url
          if (url.includes("/simulated-backoff")) {
            return {
              ok: false,
              status: 429,
              headers: new Headers({
                "content-type": "application/json",
                backoff: "10",
                "retry-after": "10",
              }),
              json: async () => ({ error: "Too Many Requests" }),
            };
          }

          // Conditional request 304 simulation
          const ifModifiedSince = headers["If-Modified-Since-Version"];
          if (ifModifiedSince === "42") {
            return {
              ok: true,
              status: 304,
              headers: new Headers({
                "content-type": "application/json",
                "last-modified-version": "42",
              }),
              text: async () => "",
            };
          }

          // Regular GET 200 response
          const isAlice = headers["Zotero-API-Key"] === keyAlice;
          return {
            ok: true,
            status: 200,
            headers: new Headers({
              "content-type": "application/json",
              "last-modified-version": "42",
              "total-results": "1",
            }),
            json: async () => [
              {
                key: isAlice ? "ITEM_ALICE_1" : "ITEM_BOB_1",
                version: 42,
                data: { title: isAlice ? "Alice Paper" : "Bob Paper" },
              },
            ],
          };
        }

        return { ok: false, status: 404, headers: new Headers(), text: async () => "Not found" };
      });

      accountService = new ZoteroAccountService({
        credentialRepo: zoteroRepo,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      proxyService = new ZoteroProxyService({
        accountService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      app = await buildApp({
        itemRepo,
        zoteroCredentialRepo: zoteroRepo,
        zoteroAccountService: accountService,
        zoteroProxyService: proxyService,
      });

      await accountService.linkApiKey(userAlice, keyAlice);
      await accountService.linkApiKey(userBob, keyBob);
    });

    it("serves cache hit on repeated GET requests without calling upstream", async () => {
      // First request -> Cache MISS
      const res1 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/items?limit=25",
        headers: { "x-user-id": userAlice },
      });

      expect(res1.statusCode).toBe(200);
      expect(res1.headers["x-cache"]).toBe("MISS");
      expect(res1.headers["last-modified-version"]).toBe("42");
      const items1 = res1.json();
      expect(items1[0].key).toBe("ITEM_ALICE_1");

      const callsAfterFirst = mockFetch.mock.calls.length;

      // Second request -> Cache HIT
      const res2 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/items?limit=25",
        headers: { "x-user-id": userAlice },
      });

      expect(res2.statusCode).toBe(200);
      expect(res2.headers["x-cache"]).toBe("HIT");
      expect(res2.headers["last-modified-version"]).toBe("42");
      const items2 = res2.json();
      expect(items2[0].key).toBe("ITEM_ALICE_1");

      // No new upstream fetch call was made!
      expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
    });

    it("guarantees per-user isolation: Alice and Bob never share cached data", async () => {
      // Alice queries
      const resAlice = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/shared/items",
        headers: { "x-user-id": userAlice },
      });
      expect(resAlice.statusCode).toBe(200);
      expect(resAlice.json()[0].data.title).toBe("Alice Paper");

      // Bob queries same URL
      const resBob = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/shared/items",
        headers: { "x-user-id": userBob },
      });
      expect(resBob.statusCode).toBe(200);
      expect(resBob.json()[0].data.title).toBe("Bob Paper");
      // Bob receives his own data, not Alice's
      expect(resBob.json()[0].key).toBe("ITEM_BOB_1");
    });

    it("returns HTTP 304 Not Modified when client sends If-Modified-Since-Version matching cache", async () => {
      // Warm up cache
      await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/items",
        headers: { "x-user-id": userAlice },
      });

      const callsBefore = mockFetch.mock.calls.length;

      // Client requests with If-Modified-Since-Version: 42
      const res304 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/items",
        headers: {
          "x-user-id": userAlice,
          "if-modified-since-version": "42",
        },
      });

      expect(res304.statusCode).toBe(304);
      expect(res304.headers["x-cache"]).toBe("HIT");
      expect(res304.headers["last-modified-version"]).toBe("42");
      // No upstream call made!
      expect(mockFetch.mock.calls.length).toBe(callsBefore);
    });

    it("revalidates with upstream using If-Modified-Since-Version when cache entry is stale", async () => {
      // Prime cache
      const cache = proxyService.getCache();
      const cacheKey = ZoteroCache.buildKey(userAlice, "users:112233", "users/112233/items", {});
      cache.set({
        key: cacheKey,
        userId: userAlice,
        libraryId: "users:112233",
        subPath: "users/112233/items",
        status: 200,
        headers: { "last-modified-version": "42" },
        data: [{ key: "STALE_ITEM" }],
        lastModifiedVersion: "42",
        ttlMs: -1, // Expired immediately (stale)
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/items",
        headers: { "x-user-id": userAlice },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["x-cache"]).toBe("REVALIDATED");
      expect(res.json()[0].key).toBe("STALE_ITEM");

      // Verify proxy sent If-Modified-Since-Version: 42 to upstream
      const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(call[1].headers["If-Modified-Since-Version"]).toBe("42");
    });

    it("invalidates library cache after write operations (POST/PUT/DELETE)", async () => {
      // 1. GET to cache the read
      const get1 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/items",
        headers: { "x-user-id": userAlice },
      });
      expect(get1.headers["x-cache"]).toBe("MISS");

      // 2. GET again confirms cache HIT
      const get2 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/items",
        headers: { "x-user-id": userAlice },
      });
      expect(get2.headers["x-cache"]).toBe("HIT");

      // 3. POST write through proxy
      const writeRes = await app.inject({
        method: "POST",
        url: "/api/zotero/proxy/users/112233/items",
        headers: { "x-user-id": userAlice },
        payload: [{ itemType: "book", title: "New Book" }],
      });
      expect(writeRes.statusCode).toBe(200);

      // 4. Subsequent GET must be a cache MISS (cache was invalidated)
      const get3 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/items",
        headers: { "x-user-id": userAlice },
      });
      expect(get3.headers["x-cache"]).toBe("MISS");
    });

    it("never caches errors or auth failures", async () => {
      // Upstream returns 500 error
      const res1 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/simulated-error",
        headers: { "x-user-id": userAlice },
      });
      expect(res1.statusCode).toBe(500);

      const callsBefore = mockFetch.mock.calls.length;

      // Second request must NOT be served from cache; must call upstream again
      const res2 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/simulated-error",
        headers: { "x-user-id": userAlice },
      });
      expect(res2.statusCode).toBe(500);
      expect(mockFetch.mock.calls.length).toBe(callsBefore + 1);
    });

    it("honors Backoff header from upstream Zotero API", async () => {
      // Trigger upstream backoff response
      const res1 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/simulated-backoff",
        headers: { "x-user-id": userAlice },
      });
      expect(res1.statusCode).toBe(429);
      expect(res1.headers["backoff"]).toBe("10");

      const callsBefore = mockFetch.mock.calls.length;

      // Immediate uncached request to same library must be blocked with 429 without touching upstream
      const res2 = await app.inject({
        method: "GET",
        url: "/api/zotero/proxy/users/112233/other-items",
        headers: { "x-user-id": userAlice },
      });
      expect(res2.statusCode).toBe(429);
      expect(res2.json().error).toBe("Zotero API backoff active");
      // Zero upstream calls made
      expect(mockFetch.mock.calls.length).toBe(callsBefore);
    });
  });
});
