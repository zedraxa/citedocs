import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { InMemoryItemRepository } from "../src/repositories/inMemoryItemRepository.js";
import { TranslationClient } from "@citedocs/zotero-core";
import type { FastifyInstance } from "fastify";
import type { ZoteroItem } from "@citedocs/shared";

describe("@citedocs/server", () => {
  let app: FastifyInstance;
  let inMemoryRepo: InMemoryItemRepository;

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
      if (body.includes("10.1038/s41586-021-03392-y") || body.includes("s41586")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => [natureDoiFixture],
        };
      }
      if (body.includes("upstream-failure")) {
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => "Upstream translator crashed",
        };
      }
    }
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "Identifier not resolved",
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

  describe("System & CSL Endpoints", () => {
    it("responds to /health with ok status", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ok");
      expect(body.service).toBe("citedocs-server");
    });

    it("returns available CSL styles on /api/csl/styles", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/csl/styles",
      });

      expect(res.statusCode).toBe(200);
      const styles = JSON.parse(res.body);
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThanOrEqual(10);
      expect(styles.some((s: { id: string }) => s.id === "apa")).toBe(true);
    });

    it("searches CSL styles with query parameter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/csl/styles?q=ieee",
      });

      expect(res.statusCode).toBe(200);
      const styles = JSON.parse(res.body);
      expect(styles).toHaveLength(1);
      expect(styles[0].id).toBe("ieee");
    });

    it("buildApp() succeeds with default options (no route collisions)", async () => {
      const defaultApp = await buildApp();
      const res = await defaultApp.inject({
        method: "GET",
        url: "/health",
      });
      expect(res.statusCode).toBe(200);
      await defaultApp.close();
    });
  });

  describe("Zotero Translation Routes & Authentication", () => {
    it("rejects unauthenticated requests without X-User-Id header with 401", async () => {
      const resTranslate = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        payload: { identifier: "10.1038/s41586-021-03392-y" },
      });
      expect(resTranslate.statusCode).toBe(401);
      expect(JSON.parse(resTranslate.body).error).toBe("Unauthorized");

      const resFromId = await app.inject({
        method: "POST",
        url: "/api/items/from-identifier",
        payload: { identifier: "10.1038/s41586-021-03392-y" },
      });
      expect(resFromId.statusCode).toBe(401);
      expect(JSON.parse(resFromId.body).error).toBe("Unauthorized");

      const resSearch = await app.inject({
        method: "POST",
        url: "/api/zotero/search",
        payload: { identifier: "10.1038/s41586-021-03392-y" },
      });
      expect(resSearch.statusCode).toBe(401);
      expect(JSON.parse(resSearch.body).error).toBe("Unauthorized");
    });

    it("POST /api/zotero/translate: resolves DOI 10.1038/s41586-021-03392-y with title, authors, year, and DOI", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        headers: {
          "x-user-id": "student-user-42",
        },
        payload: {
          identifier: "10.1038/s41586-021-03392-y",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      expect(data.success).toBe(true);
      expect(data.persisted).toBe(true);

      // Zotero-shaped assertions
      expect(data.items).toHaveLength(1);
      const item = data.item;
      expect(item.id).toBeDefined();
      expect(item.title).toBe("The changing landscape of atherosclerosis");
      expect(item.creators).toHaveLength(1);
      expect(item.creators[0].lastName).toBe("Libby");
      expect(item.creators[0].firstName).toBe("Peter");
      expect(item.date).toBe("2021-04-21");
      expect(item.DOI).toBe("10.1038/s41586-021-03392-y");

      // CSL-shaped assertions
      expect(data.cslItems).toHaveLength(1);
      const csl = data.csl;
      expect(csl.title).toBe("The changing landscape of atherosclerosis");
      expect(csl.author).toHaveLength(1);
      expect(csl.author[0].family).toBe("Libby");
      expect(csl.author[0].given).toBe("Peter");
      expect(csl.DOI).toBe("10.1038/s41586-021-03392-y");
      expect(csl.issued?.["date-parts"]?.[0]?.[0]).toBe(2021);
    });

    it("POST /api/items/from-identifier: alias route resolves identifier and supports { query }", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/items/from-identifier",
        headers: {
          "x-user-id": "student-user-42",
        },
        payload: {
          query: "https://doi.org/10.1038/s41586-021-03392-y",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.item.id).toBeDefined();
      expect(data.item.title).toBe("The changing landscape of atherosclerosis");
      expect(data.csl.DOI).toBe("10.1038/s41586-021-03392-y");
    });

    it("respects per-user auth stub (X-User-Id header) and isolates items in ItemRepository", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        headers: {
          "x-user-id": "student-user-42",
        },
        payload: {
          identifier: "10.1038/s41586-021-03392-y",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.userId).toBe("student-user-42");
      expect(data.item.id).toBeDefined();

      // Check stored items for student-user-42 via single source of truth (GET /api/items)
      const userItemsRes = await app.inject({
        method: "GET",
        url: "/api/items",
        headers: {
          "x-user-id": "student-user-42",
        },
      });
      expect(userItemsRes.statusCode).toBe(200);
      const userItems = JSON.parse(userItemsRes.body);
      expect(Array.isArray(userItems)).toBe(true);
      expect(userItems).toHaveLength(1);
      expect(userItems[0].ownerUserId).toBe("student-user-42");
      expect(userItems[0].id).toBe(data.item.id);

      // Check stored items for another student (should not see student-user-42's private items)
      const otherUserRes = await app.inject({
        method: "GET",
        url: "/api/items",
        headers: {
          "x-user-id": "other-student-99",
        },
      });
      expect(otherUserRes.statusCode).toBe(200);
      const otherItems = JSON.parse(otherUserRes.body);
      expect(Array.isArray(otherItems)).toBe(true);
      expect(otherItems).toHaveLength(0);
    });

    it("returns 400 Bad Request on empty or missing identifier", async () => {
      const res1 = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        headers: {
          "x-user-id": "student-user-42",
        },
        payload: {},
      });
      expect(res1.statusCode).toBe(400);
      const data1 = JSON.parse(res1.body);
      expect(data1.error).toBe("Invalid input");

      const res2 = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        headers: {
          "x-user-id": "student-user-42",
        },
        payload: { identifier: "   " },
      });
      expect(res2.statusCode).toBe(400);
    });

    it("returns 502 Bad Gateway when translation-server fails", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        headers: {
          "x-user-id": "student-user-42",
        },
        payload: {
          identifier: "upstream-failure",
        },
      });

      expect(res.statusCode).toBe(502);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("Failed to resolve identifier via translation server");
      expect(data.upstreamStatus).toBe(500);
    });
  });

  describe("M2 Integration Acceptance Requirements", () => {
    const userA = "student-alice-acceptance";
    const userB = "student-bob-acceptance";

    it("POST /api/items/from-identifier as user A stores the item via ItemRepository with full metadata", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/items/from-identifier",
        headers: {
          "x-user-id": userA,
        },
        payload: {
          identifier: "10.1038/s41586-021-03392-y",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.item).toBeDefined();
      expect(data.item.id).toBeDefined();

      // Verify item stored in ItemRepository
      const stored = await inMemoryRepo.getById(userA, data.item.id);
      expect(stored).not.toBeNull();
      expect(stored!.ownerUserId).toBe(userA);
      expect(stored!.title).toBe("The changing landscape of atherosclerosis");
      expect(stored!.publicationTitle).toBe("Nature");
      expect(stored!.doi).toBe("10.1038/s41586-021-03392-y");
      expect(stored!.parsedDate).toBe("2021-04-21");

      const metadata = stored!.metadata as Record<string, unknown>;
      expect(metadata).toBeDefined();
      expect(metadata.creators).toEqual(natureDoiFixture.creators);
      expect(metadata.containerTitle).toBe("Nature");

      // GET /api/items as user A lists it
      const listResA = await app.inject({
        method: "GET",
        url: "/api/items",
        headers: { "x-user-id": userA },
      });
      expect(listResA.statusCode).toBe(200);
      const itemsA = JSON.parse(listResA.body);
      expect(itemsA).toHaveLength(1);
      expect(itemsA[0].id).toBe(data.item.id);
      expect(itemsA[0].ownerUserId).toBe(userA);

      // GET /api/items as user B does not list it
      const listResB = await app.inject({
        method: "GET",
        url: "/api/items",
        headers: { "x-user-id": userB },
      });
      expect(listResB.statusCode).toBe(200);
      const itemsB = JSON.parse(listResB.body);
      expect(itemsB).toHaveLength(0);

      // GET /api/items/:id as user B returns 403 Forbidden
      const getItemResB = await app.inject({
        method: "GET",
        url: `/api/items/${data.item.id}`,
        headers: { "x-user-id": userB },
      });
      expect(getItemResB.statusCode).toBe(403);
      expect(JSON.parse(getItemResB.body).error).toBe("Forbidden");

      // GET /api/items/:id with non-existent id as user B returns 404 Not Found
      const getNonExistent = await app.inject({
        method: "GET",
        url: "/api/items/non-existent-id-999",
        headers: { "x-user-id": userB },
      });
      expect(getNonExistent.statusCode).toBe(404);
    });
  });
});
