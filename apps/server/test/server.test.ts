import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { clearItemStore } from "../src/routes/zotero.js";
import { TranslationClient } from "@citedocs/zotero-core";
import type { FastifyInstance } from "fastify";
import type { ZoteroItem } from "@citedocs/shared";

describe("@citedocs/server", () => {
  let app: FastifyInstance;

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
    app = await buildApp({ zoteroClient: mockClient });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clearItemStore();
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
  });

  describe("Zotero Translation Routes (M2 Part B Acceptance)", () => {
    it("POST /api/zotero/translate: resolves DOI 10.1038/s41586-021-03392-y with title, authors, year, and DOI", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        payload: {
          identifier: "10.1038/s41586-021-03392-y",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      expect(data.success).toBe(true);
      expect(data.persisted).toBe(true);
      expect(data.persistenceMode).toBe("in-memory");
      expect(data.todo).toContain("TODO(persist)");

      // Zotero-shaped assertions
      expect(data.items).toHaveLength(1);
      const item = data.item;
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
        payload: {
          query: "https://doi.org/10.1038/s41586-021-03392-y",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.item.title).toBe("The changing landscape of atherosclerosis");
      expect(data.csl.DOI).toBe("10.1038/s41586-021-03392-y");
    });

    it("respects per-user auth stub (X-User-Id header) and isolates items", async () => {
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

      // Check stored items for student-user-42
      const userItemsRes = await app.inject({
        method: "GET",
        url: "/api/items",
        headers: {
          "x-user-id": "student-user-42",
        },
      });
      expect(userItemsRes.statusCode).toBe(200);
      const userItems = JSON.parse(userItemsRes.body);
      expect(userItems.total).toBe(1);
      expect(userItems.items[0].userId).toBe("student-user-42");

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
      expect(otherItems.total).toBe(0);
    });

    it("returns 400 Bad Request on empty or missing identifier", async () => {
      const res1 = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        payload: {},
      });
      expect(res1.statusCode).toBe(400);
      const data1 = JSON.parse(res1.body);
      expect(data1.error).toBe("Invalid input");

      const res2 = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        payload: { identifier: "   " },
      });
      expect(res2.statusCode).toBe(400);
    });

    it("returns 502 Bad Gateway when translation-server fails", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
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
});
