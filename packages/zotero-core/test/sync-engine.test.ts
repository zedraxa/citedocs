import { describe, it, expect, vi } from "vitest";
import {
  SyncEngine,
  InMemorySyncStore,
  ZoteroWebApiClient,
  ZoteroApiError,
  mergeZoteroItemFieldWise,
} from "../src/index.js";
import type { ZoteroItem } from "@citedocs/shared";
import page1Fixture from "../fixtures/items-page1.json";
import page2Fixture from "../fixtures/items-page2.json";
import updatedFixture from "../fixtures/items-updated.json";

describe("SyncEngine Acceptance Tests", () => {
  const API_KEY_ALICE = "alice_secret_api_key_777";
  const USER_ID_ALICE = "alice123";

  describe("1. Initial full sync of a user library (>100 items)", () => {
    it("paginates correctly across multiple pages and stores Last-Modified-Version", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("start=0")) {
          return new Response(JSON.stringify(page1Fixture), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Last-Modified-Version": "100",
              "Total-Results": "120",
              Link: '<https://api.zotero.org/users/alice123/items?start=60&limit=60>; rel="next"',
            },
          });
        }
        if (url.includes("start=60")) {
          return new Response(JSON.stringify(page2Fixture), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Last-Modified-Version": "105",
              "Total-Results": "120",
            },
          });
        }
        return new Response("[]", { status: 200 });
      });

      const client = new ZoteroWebApiClient({
        apiKey: API_KEY_ALICE,
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const store = new InMemorySyncStore();
      const engine = new SyncEngine({
        client,
        store,
        target: { type: "user", userId: USER_ID_ALICE },
      });

      // Verify pre-sync library version is 0
      expect(await store.getLibraryVersion("user:alice123")).toBe(0);

      const result = await engine.sync();

      expect(result.pulledCount).toBe(120);
      expect(result.libraryVersion).toBe(105);

      // Verify all 120 items are present in the store
      const storedItems = await store.getAllItems("user:alice123");
      expect(storedItems).toHaveLength(120);
      expect(await store.getLibraryVersion("user:alice123")).toBe(105);

      const item1 = await store.getItem("user:alice123", "ITEM001");
      expect(item1?.title).toBe("Item 001 Title");

      const item120 = await store.getItem("user:alice123", "ITEM120");
      expect(item120?.title).toBe("Item 120 Title");
    });
  });

  describe("2. Incremental sync with since=<version>", () => {
    it("only fetches changed keys and applies /deleted removals", async () => {
      const store = new InMemorySyncStore();
      // Setup initial store state at version 105 with item 10, item 20, item 50, item 51
      const initialItems: ZoteroItem[] = [
        {
          key: "ITEM010",
          version: 100,
          itemType: "journalArticle",
          title: "Item 010 Old Title",
          creators: [],
          tags: [],
          collections: [],
        },
        {
          key: "ITEM020",
          version: 100,
          itemType: "journalArticle",
          title: "Item 020 Old Title",
          creators: [],
          tags: [],
          collections: [],
        },
        {
          key: "ITEM050",
          version: 100,
          itemType: "journalArticle",
          title: "Item 050 To Be Deleted",
          creators: [],
          tags: [],
          collections: [],
        },
        {
          key: "ITEM051",
          version: 100,
          itemType: "journalArticle",
          title: "Item 051 To Be Deleted",
          creators: [],
          tags: [],
          collections: [],
        },
      ];
      await store.upsertRemoteItems("user:alice123", initialItems);
      await store.setLibraryVersion("user:alice123", 105);

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        // 1. Version check request
        if (url.includes("format=versions")) {
          expect(url).toContain("since=105");
          return new Response(
            JSON.stringify({
              ITEM010: 110,
              ITEM020: 115,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Last-Modified-Version": "120",
              },
            },
          );
        }

        // 2. Fetch changed items by keys
        if (url.includes("itemKey=")) {
          expect(decodeURIComponent(url)).toContain("ITEM010,ITEM020");
          return new Response(JSON.stringify(updatedFixture), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Last-Modified-Version": "120",
            },
          });
        }

        // 3. Fetch deleted items
        if (url.includes("/deleted")) {
          expect(url).toContain("since=105");
          return new Response(
            JSON.stringify({
              items: ["ITEM050", "ITEM051"],
              collections: [],
              searches: [],
              tags: [],
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Last-Modified-Version": "120",
              },
            },
          );
        }

        return new Response("[]", { status: 200 });
      });

      const client = new ZoteroWebApiClient({
        apiKey: API_KEY_ALICE,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const engine = new SyncEngine({
        client,
        store,
        target: { type: "user", userId: USER_ID_ALICE },
      });

      const result = await engine.sync();

      expect(result.pulledCount).toBe(2);
      expect(result.deletedRemotelyCount).toBe(2);
      expect(result.libraryVersion).toBe(120);

      // Verify updated items
      const updated10 = await store.getItem("user:alice123", "ITEM010");
      expect(updated10?.title).toBe("Item 010 Updated Title");
      expect(updated10?.version).toBe(110);

      const updated20 = await store.getItem("user:alice123", "ITEM020");
      expect(updated20?.title).toBe("Item 020 Updated Title");
      expect(updated20?.version).toBe(115);

      // Verify deleted items are removed from store
      expect(await store.getItem("user:alice123", "ITEM050")).toBeUndefined();
      expect(await store.getItem("user:alice123", "ITEM051")).toBeUndefined();
      expect(await store.getLibraryVersion("user:alice123")).toBe(120);
    });
  });

  describe("3. Local create/update/delete pushed in batches of <=50 with Zotero-Write-Token", () => {
    it("pushes staged creations, updates, and deletions with write tokens and updates version", async () => {
      const store = new InMemorySyncStore();
      await store.setLibraryVersion("user:alice123", 120);

      // Stage 60 created items
      for (let i = 1; i <= 60; i++) {
        store.stageCreate("user:alice123", {
          key: `NEW${String(i).padStart(3, "0")}`,
          version: 0,
          itemType: "journalArticle",
          title: `New Item ${i}`,
          creators: [],
          tags: [],
          collections: [],
        });
      }

      // Stage 1 updated item
      store.stageUpdate("user:alice123", {
        key: "EXISTING_ITEM",
        version: 120,
        itemType: "journalArticle",
        title: "Locally Updated Existing Item",
        creators: [],
        tags: [],
        collections: [],
      });

      // Stage 2 deleted items
      store.stageDelete("user:alice123", "TO_DELETE_1");
      store.stageDelete("user:alice123", "TO_DELETE_2");

      let postBatchCount = 0;
      let deleteBatchCount = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;

        // Pull phase (no remote changes)
        if (init.method === "GET" && url.includes("format=versions")) {
          return new Response(null, {
            status: 304,
            headers: { "Last-Modified-Version": "120" },
          });
        }
        if (init.method === "GET" && url.includes("/deleted")) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Last-Modified-Version": "120" },
          });
        }

        // Push created & updated items
        if (init.method === "POST" && url.includes("/items")) {
          postBatchCount++;
          expect(headers["Zotero-Write-Token"]).toHaveLength(32);

          if (postBatchCount === 1) {
            // First batch: 50 items with version 120
            expect(headers["If-Unmodified-Since-Version"]).toBe("120");
            const body = JSON.parse(init.body as string) as ZoteroItem[];
            expect(body).toHaveLength(50);

            const successMap: Record<string, string> = {};
            body.forEach((item, idx) => {
              successMap[String(idx)] = item.key;
            });

            return new Response(JSON.stringify({ success: successMap, unchanged: {}, failed: {} }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Last-Modified-Version": "125",
              },
            });
          } else {
            // Second batch: remaining 11 items with updated version 125
            expect(headers["If-Unmodified-Since-Version"]).toBe("125");
            const body = JSON.parse(init.body as string) as ZoteroItem[];
            expect(body).toHaveLength(11);

            const successMap: Record<string, string> = {};
            body.forEach((item, idx) => {
              successMap[String(idx)] = item.key;
            });

            return new Response(JSON.stringify({ success: successMap, unchanged: {}, failed: {} }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Last-Modified-Version": "126",
              },
            });
          }
        }

        // Push deletions
        if (init.method === "DELETE" && url.includes("/items")) {
          deleteBatchCount++;
          expect(headers["Zotero-Write-Token"]).toHaveLength(32);
          expect(headers["If-Unmodified-Since-Version"]).toBe("126");

          const itemKeys = new URL(url).searchParams.get("itemKey")?.split(",");
          expect(itemKeys).toEqual(["TO_DELETE_1", "TO_DELETE_2"]);

          return new Response(null, {
            status: 204,
            headers: { "Last-Modified-Version": "127" },
          });
        }

        return new Response("[]", { status: 200 });
      });

      const client = new ZoteroWebApiClient({
        apiKey: API_KEY_ALICE,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const engine = new SyncEngine({
        client,
        store,
        target: { type: "user", userId: USER_ID_ALICE },
      });

      const result = await engine.sync();

      expect(postBatchCount).toBe(2);
      expect(deleteBatchCount).toBe(1);
      expect(result.pushedCreatedCount).toBe(60);
      expect(result.pushedUpdatedCount).toBe(1);
      expect(result.pushedDeletedCount).toBe(2);
      expect(result.libraryVersion).toBe(127);

      // Verify no pending local changes remain in store
      const pending = await store.getLocalChanges("user:alice123");
      expect(pending.created).toHaveLength(0);
      expect(pending.updated).toHaveLength(0);
      expect(pending.deletedKeys).toHaveLength(0);
      expect(await store.getLibraryVersion("user:alice123")).toBe(127);
    });
  });

  describe("4. Optimistic concurrency conflict (412) triggers re-pull + field-wise merge", () => {
    it("handles 412 on push, re-pulls remote changes, performs field-wise merge and exposes conflicts", async () => {
      const store = new InMemorySyncStore();
      await store.setLibraryVersion("user:alice123", 50);

      const baseItem: ZoteroItem = {
        key: "CONF001",
        version: 50,
        itemType: "journalArticle",
        title: "Base Document Title",
        publicationTitle: "Base Journal",
        pages: "1-10",
        volume: "10",
        creators: [{ creatorType: "author", firstName: "Alice", lastName: "Smith" }],
        tags: [{ tag: "test" }],
        collections: [],
      };
      // Upsert base item so it is recorded as base state
      await store.upsertRemoteItems("user:alice123", [baseItem]);

      // Local modifies title and pages:
      // - title: "Local Modified Title"
      // - pages: "15-30"
      // Note: publicationTitle was NOT modified locally ("Base Journal")
      const localModified: ZoteroItem = {
        ...baseItem,
        title: "Local Modified Title",
        pages: "15-30",
      };
      store.stageUpdate("user:alice123", localModified);

      // Remote concurrently changed title and publicationTitle:
      // - title: "Remote Modified Title" (conflicts with local!)
      // - publicationTitle: "Remote Advanced Journal" (remote only!)
      // - pages: "1-10" (remote did not modify)
      const remoteModified: ZoteroItem = {
        ...baseItem,
        version: 55,
        title: "Remote Modified Title",
        publicationTitle: "Remote Advanced Journal",
        pages: "1-10",
      };

      let pushAttempt = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        // Initial pull (library version 50, no updates yet)
        if (init.method === "GET" && url.includes("format=versions") && url.includes("since=50") && pushAttempt === 0) {
          return new Response(null, {
            status: 304,
            headers: { "Last-Modified-Version": "50" },
          });
        }
        if (init.method === "GET" && url.includes("/deleted") && url.includes("since=50")) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Last-Modified-Version": "50" },
          });
        }

        // Push attempt
        if (init.method === "POST" && url.includes("/items")) {
          pushAttempt++;
          if (pushAttempt === 1) {
            // First push attempt fails with 412 Precondition Failed
            return new Response("Precondition Failed: version mismatch", {
              status: 412,
              headers: { "Content-Type": "text/plain" },
            });
          } else {
            // Second push attempt (after merge) with new version 55 succeeds!
            const headers = init.headers as Record<string, string>;
            expect(headers["If-Unmodified-Since-Version"]).toBe("55");
            const body = JSON.parse(init.body as string) as ZoteroItem[];
            const item = body[0];

            // Verify merged properties:
            // 1. Conflict on title: remote wins
            expect(item.title).toBe("Remote Modified Title");
            // 2. publicationTitle changed remotely: remote wins
            expect(item.publicationTitle).toBe("Remote Advanced Journal");
            // 3. pages changed only locally: local wins!
            expect(item.pages).toBe("15-30");

            return new Response(
              JSON.stringify({
                success: { "0": "CONF001" },
                unchanged: {},
                failed: {},
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Last-Modified-Version": "56",
                },
              },
            );
          }
        }

        // Re-pull triggered by 412:
        if (init.method === "GET" && url.includes("format=versions")) {
          return new Response(JSON.stringify({ CONF001: 55 }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Last-Modified-Version": "55",
            },
          });
        }
        if (init.method === "GET" && url.includes("itemKey=CONF001")) {
          return new Response(JSON.stringify([remoteModified]), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Last-Modified-Version": "55",
            },
          });
        }
        if (init.method === "GET" && url.includes("/deleted")) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Last-Modified-Version": "55" },
          });
        }

        return new Response("[]", { status: 200 });
      });

      const client = new ZoteroWebApiClient({
        apiKey: API_KEY_ALICE,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const engine = new SyncEngine({
        client,
        store,
        target: { type: "user", userId: USER_ID_ALICE },
      });

      const result = await engine.sync();

      expect(pushAttempt).toBe(2);
      expect(result.libraryVersion).toBe(56);
      expect(result.conflicts).toHaveLength(1);

      const conflict = result.conflicts[0];
      expect(conflict.itemKey).toBe("CONF001");
      expect(conflict.field).toBe("title");
      expect(conflict.localValue).toBe("Local Modified Title");
      expect(conflict.remoteValue).toBe("Remote Modified Title");
      expect(conflict.resolvedValue).toBe("Remote Modified Title");
      expect(conflict.resolution).toBe("remote-wins");

      // Verify the merged item in store
      const storedItem = await store.getItem("user:alice123", "CONF001");
      expect(storedItem?.title).toBe("Remote Modified Title");
      expect(storedItem?.publicationTitle).toBe("Remote Advanced Journal");
      expect(storedItem?.pages).toBe("15-30");
      expect(await store.getLibraryVersion("user:alice123")).toBe(56);
    });

    it("evaluates standalone mergeZoteroItemFieldWise accurately", () => {
      const base: ZoteroItem = {
        key: "ITEM1",
        version: 1,
        itemType: "journalArticle",
        title: "Base Title",
        publicationTitle: "Base Journal",
        pages: "1-10",
        volume: "1",
        creators: [],
        tags: [],
        collections: [],
      };

      const local: ZoteroItem = {
        ...base,
        title: "Local Title", // changed locally
        volume: "2", // changed locally
      };

      const remote: ZoteroItem = {
        ...base,
        version: 3,
        title: "Remote Title", // changed remotely (conflict with local)
        publicationTitle: "Remote Journal", // changed remotely (no local change)
      };

      const { merged, conflicts } = mergeZoteroItemFieldWise(base, local, remote);

      // Title: conflict -> remote wins
      expect(merged.title).toBe("Remote Title");
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].field).toBe("title");
      expect(conflicts[0].resolution).toBe("remote-wins");

      // PublicationTitle: remote changed -> remote wins
      expect(merged.publicationTitle).toBe("Remote Journal");

      // Volume: local changed -> local wins
      expect(merged.volume).toBe("2");

      // Pages: neither changed -> preserved
      expect(merged.pages).toBe("1-10");
      expect(merged.version).toBe(3);
    });
  });

  describe("5. Rate limiting / Backoff / 429 honored via injected sleep", () => {
    it("backs off and retries when encountering 429 during sync", async () => {
      const mockSleep = vi.fn().mockResolvedValue(undefined);
      let callCount = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (callCount === 1) {
          return new Response("Too Many Requests", {
            status: 429,
            headers: { "Retry-After": "7" },
          });
        }
        if (url.includes("format=versions")) {
          return new Response(null, {
            status: 304,
            headers: { "Last-Modified-Version": "100" },
          });
        }
        if (url.includes("/deleted")) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Last-Modified-Version": "100" },
          });
        }
        return new Response("[]", { status: 200 });
      });

      const client = new ZoteroWebApiClient({
        apiKey: API_KEY_ALICE,
        fetchFn: mockFetch as unknown as typeof fetch,
        sleepFn: mockSleep,
      });

      const store = new InMemorySyncStore();
      await store.setLibraryVersion("user:alice123", 100);

      const engine = new SyncEngine({
        client,
        store,
        target: { type: "user", userId: USER_ID_ALICE },
      });

      await engine.sync();

      // Assert injected sleep was called with 7000ms
      expect(mockSleep).toHaveBeenCalledWith(7000);
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe("6. Two users with different API keys and InMemorySyncStores (Isolation Test)", () => {
    it("ensures two distinct students never see or access each other's data", async () => {
      const USER_A = "student_alpha";
      const USER_B = "student_beta";
      const KEY_A = "secret_key_alpha_111";
      const KEY_B = "secret_key_beta_222";

      const itemA: ZoteroItem = {
        key: "ALPHA001",
        version: 10,
        itemType: "journalArticle",
        title: "Confidential Research by Alpha",
        creators: [{ creatorType: "author", firstName: "Student", lastName: "Alpha" }],
        tags: [],
        collections: [],
      };

      const itemB: ZoteroItem = {
        key: "BETA001",
        version: 20,
        itemType: "journalArticle",
        title: "Independent Thesis by Beta",
        creators: [{ creatorType: "author", firstName: "Student", lastName: "Beta" }],
        tags: [],
        collections: [],
      };

      // Mock fetch enforcing strict tenant/key isolation:
      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const apiKey = (init.headers as Record<string, string>)["Zotero-API-Key"];

        if (url.includes(`/users/${USER_A}/`)) {
          // Reject if not using User A's API key
          if (apiKey !== KEY_A) {
            return new Response("Forbidden: Cross-tenant access denied", { status: 403 });
          }
          if (url.includes("/items")) {
            return new Response(JSON.stringify([itemA]), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Last-Modified-Version": "10",
                "Total-Results": "1",
              },
            });
          }
        }

        if (url.includes(`/users/${USER_B}/`)) {
          // Reject if not using User B's API key
          if (apiKey !== KEY_B) {
            return new Response("Forbidden: Cross-tenant access denied", { status: 403 });
          }
          if (url.includes("/items")) {
            return new Response(JSON.stringify([itemB]), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Last-Modified-Version": "20",
                "Total-Results": "1",
              },
            });
          }
        }

        return new Response("[]", { status: 200 });
      });

      // User A setup
      const storeA = new InMemorySyncStore();
      const clientA = new ZoteroWebApiClient({
        apiKey: KEY_A,
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const engineA = new SyncEngine({
        client: clientA,
        store: storeA,
        target: { type: "user", userId: USER_A },
      });

      // User B setup
      const storeB = new InMemorySyncStore();
      const clientB = new ZoteroWebApiClient({
        apiKey: KEY_B,
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const engineB = new SyncEngine({
        client: clientB,
        store: storeB,
        target: { type: "user", userId: USER_B },
      });

      // Synchronize both users
      await engineA.sync();
      await engineB.sync();

      // Verify User A's store only contains User A's items
      const itemsA = await storeA.getAllItems(`user:${USER_A}`);
      expect(itemsA).toHaveLength(1);
      expect(itemsA[0].key).toBe("ALPHA001");
      expect(itemsA[0].title).toBe("Confidential Research by Alpha");
      expect(await storeA.getItem(`user:${USER_A}`, "BETA001")).toBeUndefined();

      // Verify User B's store only contains User B's items
      const itemsB = await storeB.getAllItems(`user:${USER_B}`);
      expect(itemsB).toHaveLength(1);
      expect(itemsB[0].key).toBe("BETA001");
      expect(itemsB[0].title).toBe("Independent Thesis by Beta");
      expect(await storeB.getItem(`user:${USER_B}`, "ALPHA001")).toBeUndefined();

      // Verify querying store A with User B's library ID returns nothing
      expect(await storeA.getAllItems(`user:${USER_B}`)).toEqual([]);
      expect(await storeB.getAllItems(`user:${USER_A}`)).toEqual([]);
    });
  });

  describe("7. API key redaction in thrown sync errors", () => {
    it("guarantees API key is never exposed in thrown error messages during sync failure", async () => {
      const LEAKY_KEY = "super_classified_zotero_key_9999";
      const mockFetch = vi.fn().mockImplementation(async () => {
        throw new Error(`Upstream connection crashed with apiKey=${LEAKY_KEY}`);
      });

      const client = new ZoteroWebApiClient({
        apiKey: LEAKY_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const store = new InMemorySyncStore();
      const engine = new SyncEngine({
        client,
        store,
        target: { type: "user", userId: "student_redacted" },
      });

      try {
        await engine.sync();
        expect.unreachable("Sync should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ZoteroApiError);
        const zErr = err as ZoteroApiError;
        expect(zErr.message).not.toContain(LEAKY_KEY);
        expect(zErr.message).toContain("[REDACTED]");
        expect(String(zErr)).not.toContain(LEAKY_KEY);
      }
    });
  });
});
