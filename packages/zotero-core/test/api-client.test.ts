import { describe, it, expect, vi } from "vitest";
import {
  ZoteroWebApiClient,
  generateWriteToken,
  parseLinkHeader,
  ZoteroVersionConflictError,
  ZoteroRateLimitError,
  ZoteroApiError,
  redactApiKey,
} from "../src/index.js";
import type { ZoteroItem } from "@citedocs/shared";
import page1Fixture from "../fixtures/items-page1.json";
import page2Fixture from "../fixtures/items-page2.json";

describe("ZoteroWebApiClient", () => {
  const SECRET_KEY = "super_secret_zotero_key_12345";
  const USER_ID = "998877";

  describe("Utility Helpers", () => {
    it("generates a 32-character hexadecimal write token", () => {
      const token = generateWriteToken();
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[0-9a-f]{32}$/);
    });

    it("parses standard RFC 5988 Link headers", () => {
      const header =
        '<https://api.zotero.org/users/123/items?start=50&limit=50>; rel="next", <https://api.zotero.org/users/123/items?start=150&limit=50>; rel="last"';
      const parsed = parseLinkHeader(header);
      expect(parsed.next).toBe("https://api.zotero.org/users/123/items?start=50&limit=50");
      expect(parsed.last).toBe("https://api.zotero.org/users/123/items?start=150&limit=50");
    });

    it("redacts sensitive keys from error strings and URLs", () => {
      const text = `Failed to fetch https://api.zotero.org/users/123/items?key=${SECRET_KEY} with header Zotero-API-Key: ${SECRET_KEY}`;
      const redacted = redactApiKey(text, SECRET_KEY);
      expect(redacted).not.toContain(SECRET_KEY);
      expect(redacted).toContain("[REDACTED]");
    });
  });

  describe("GET /keys/current", () => {
    it("validates key and retrieves user permissions, redacting the raw key", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            key: SECRET_KEY,
            userId: USER_ID,
            username: "cite_student",
            access: {
              user: { library: true, files: true, notes: true, write: true },
              groups: { all: true },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const keyInfo = await client.getCurrentKey();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.zotero.org/keys/current",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Zotero-API-Version": "3",
            "Zotero-API-Key": SECRET_KEY,
          }),
        }),
      );

      expect(keyInfo.userId).toBe(USER_ID);
      expect(keyInfo.username).toBe("cite_student");
      expect(keyInfo.access.user?.write).toBe(true);
      // Ensure API key is never returned or leaked in keyInfo
      expect(keyInfo.key).toBe("[REDACTED]");
    });
  });

  describe("Pagination & getAllItems (>100 items)", () => {
    it("paginates across multiple pages following Link rel=next header", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("start=0")) {
          return new Response(JSON.stringify(page1Fixture), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Last-Modified-Version": "200",
              "Total-Results": "120",
              Link: '<https://api.zotero.org/users/998877/items?start=60&limit=60>; rel="next", <https://api.zotero.org/users/998877/items?start=60&limit=60>; rel="last"',
            },
          });
        }
        if (url.includes("start=60")) {
          return new Response(JSON.stringify(page2Fixture), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Last-Modified-Version": "205",
              "Total-Results": "120",
            },
          });
        }
        return new Response("[]", { status: 200 });
      });

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await client.getAllItems({ type: "user", userId: USER_ID }, { limit: 60 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.items).toHaveLength(120);
      expect(result.items[0].key).toBe("ITEM001");
      expect(result.items[119].key).toBe("ITEM120");
      expect(result.lastModifiedVersion).toBe(205);
      expect(result.totalResults).toBe(120);
    });
  });

  describe("Batched getItemsByKeys (<= 50 keys per chunk)", () => {
    it("chunks requests into groups of at most 50 keys", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        const itemKeyParam = new URL(url).searchParams.get("itemKey");
        const keys = itemKeyParam ? itemKeyParam.split(",") : [];
        const items = keys.map((k) => ({
          key: k,
          version: 100,
          itemType: "journalArticle",
          title: `Title for ${k}`,
          creators: [],
          tags: [],
          collections: [],
        }));
        return new Response(JSON.stringify(items), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const requestedKeys = Array.from({ length: 85 }, (_, i) => `KEY${String(i).padStart(3, "0")}`);
      const items = await client.getItemsByKeys({ type: "user", userId: USER_ID }, requestedKeys);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(items).toHaveLength(85);

      // Verify first request had 50 keys
      const firstCallUrl = mockFetch.mock.calls[0][0] as string;
      const firstKeys = new URL(firstCallUrl).searchParams.get("itemKey")?.split(",");
      expect(firstKeys).toHaveLength(50);

      // Verify second request had 35 keys
      const secondCallUrl = mockFetch.mock.calls[1][0] as string;
      const secondKeys = new URL(secondCallUrl).searchParams.get("itemKey")?.split(",");
      expect(secondKeys).toHaveLength(35);
    });
  });

  describe("Batched createOrUpdateItems (<= 50 items per chunk with Write Token)", () => {
    it("pushes in batches of <= 50 and updates version between batches", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        callCount++;
        const headers = init.headers as Record<string, string>;
        expect(headers["Zotero-Write-Token"]).toBeDefined();
        expect(headers["Zotero-Write-Token"]).toHaveLength(32);

        if (callCount === 1) {
          expect(headers["If-Unmodified-Since-Version"]).toBe("50");
          return new Response(
            JSON.stringify({
              success: { "0": "KEY001" },
              unchanged: {},
              failed: {},
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Last-Modified-Version": "51",
              },
            },
          );
        } else {
          // Batch 2 must use the updated version 51 from batch 1
          expect(headers["If-Unmodified-Since-Version"]).toBe("51");
          return new Response(
            JSON.stringify({
              success: { "0": "KEY051" },
              unchanged: {},
              failed: {},
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Last-Modified-Version": "52",
              },
            },
          );
        }
      });

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const itemsToPush = Array.from({ length: 65 }, (_, i) => ({
        key: `TEMP${i}`,
        itemType: "journalArticle" as const,
        title: `Pushed Item ${i}`,
        creators: [],
        tags: [],
        collections: [],
      }));

      const res = await client.createOrUpdateItems({ type: "user", userId: USER_ID }, itemsToPush, {
        ifUnmodifiedSinceVersion: 50,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.lastModifiedVersion).toBe(52);
    });
  });

  describe("Batched deleteItems", () => {
    it("deletes items in chunks of <= 50 keys", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: { "Last-Modified-Version": "60" },
        }),
      );

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const keysToDelete = Array.from({ length: 70 }, (_, i) => `DEL${i}`);
      const res = await client.deleteItems({ type: "user", userId: USER_ID }, keysToDelete, {
        ifUnmodifiedSinceVersion: 55,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.deletedKeys).toHaveLength(70);
      expect(res.lastModifiedVersion).toBe(60);
    });
  });

  describe("Rate Limiting, Backoff and Retry-After", () => {
    it("respects Backoff header on response via injected sleep without real waiting", async () => {
      const mockSleep = vi.fn().mockResolvedValue(undefined);
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            Backoff: "15",
          },
        }),
      );

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
        sleepFn: mockSleep,
      });

      await client.getItems({ type: "user", userId: USER_ID });

      expect(mockSleep).toHaveBeenCalledWith(15000);
    });

    it("handles 429 Too Many Requests with Retry-After and retries successfully", async () => {
      const mockSleep = vi.fn().mockResolvedValue(undefined);
      let callCount = 0;

      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response("Too Many Requests", {
            status: 429,
            headers: { "Retry-After": "8" },
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
        sleepFn: mockSleep,
      });

      const result = await client.getItems({ type: "user", userId: USER_ID });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockSleep).toHaveBeenCalledWith(8000);
      expect(result.data).toEqual([]);
    });

    it("throws ZoteroRateLimitError when retries are exhausted", async () => {
      const mockSleep = vi.fn().mockResolvedValue(undefined);
      const mockFetch = vi.fn().mockResolvedValue(
        new Response("Rate limit exceeded", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      );

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
        sleepFn: mockSleep,
        maxRetries: 2,
      });

      await expect(client.getItems({ type: "user", userId: USER_ID })).rejects.toThrow(
        ZoteroRateLimitError,
      );
      expect(mockSleep).toHaveBeenCalledTimes(2);
    });
  });

  describe("Concurrency & Conflict (HTTP 412)", () => {
    it("throws ZoteroVersionConflictError on 412 Precondition Failed", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response("Precondition Failed: library modified", {
          status: 412,
        }),
      );

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(
        client.createOrUpdateItems({ type: "user", userId: USER_ID }, [{ key: "K1", title: "T" } as ZoteroItem]),
      ).rejects.toThrow(ZoteroVersionConflictError);
    });
  });

  describe("API Key Redaction in Errors", () => {
    it("never exposes the API key in thrown error messages or response bodies", async () => {
      const mockFetch = vi.fn().mockRejectedValue(
        new Error(`Connection failed for key ${SECRET_KEY} to https://api.zotero.org`),
      );

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      try {
        await client.getItems({ type: "user", userId: USER_ID });
        expect.unreachable("Should have thrown error");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ZoteroApiError);
        const apiError = err as ZoteroApiError;
        expect(apiError.message).not.toContain(SECRET_KEY);
        expect(apiError.message).toContain("[REDACTED]");
        expect(String(apiError)).not.toContain(SECRET_KEY);
      }
    });

    it("redacts API key if server returns error body mentioning key", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(`Invalid API key ${SECRET_KEY} provided`, {
          status: 403,
        }),
      );

      const client = new ZoteroWebApiClient({
        apiKey: SECRET_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      try {
        await client.getCurrentKey();
        expect.unreachable("Should have thrown error");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ZoteroApiError);
        const apiError = err as ZoteroApiError;
        expect(apiError.responseBody).not.toContain(SECRET_KEY);
        expect(apiError.responseBody).toContain("[REDACTED]");
        expect(apiError.message).not.toContain(SECRET_KEY);
      }
    });
  });
});
