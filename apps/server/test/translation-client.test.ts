import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TranslationClient,
  TranslationServerError,
  normalizeIdentifier,
} from "@citedocs/zotero-core";
import { buildApp } from "../src/index.js";
import { InMemoryItemRepository } from "../src/repositories/inMemoryItemRepository.js";

describe("TranslationClient & Server Integration (Unit Tests with Mock)", () => {
  const dummyUserId = "00000000-0000-0000-0000-000000000001";

  const sampleEinsteinZoteroItem = {
    key: "EINSTEIN1",
    version: 1,
    itemType: "journalArticle",
    title: "Can Quantum-Mechanical Description of Physical Reality be Considered Complete?",
    creators: [
      { firstName: "A.", lastName: "Einstein", creatorType: "author" },
      { firstName: "B.", lastName: "Podolsky", creatorType: "author" },
      { firstName: "N.", lastName: "Rosen", creatorType: "author" },
    ],
    publicationTitle: "Physical Review",
    volume: "47",
    issue: "10",
    pages: "777-780",
    date: "1935-05-15",
    DOI: "10.1103/PhysRev.47.777",
    tags: [{ tag: "quantum" }],
  };

  describe("Direct TranslationClient Unit Methods", () => {
    it("normalizes identifiers correctly before sending to translation server", () => {
      expect(normalizeIdentifier("  10.1103/PhysRev.47.777  ")).toBe("10.1103/PhysRev.47.777");
      expect(normalizeIdentifier("https://doi.org/10.1103/PhysRev.47.777")).toBe("10.1103/PhysRev.47.777");
      expect(normalizeIdentifier("doi: 10.1103/PhysRev.47.777")).toBe("10.1103/PhysRev.47.777");
      expect(normalizeIdentifier("arxiv: 2103.00020")).toBe("2103.00020");
      expect(normalizeIdentifier("pmid: 12345678")).toBe("12345678");
      expect(normalizeIdentifier("isbn: 978-0-13-468599-1")).toBe("978-0-13-468599-1");
    });

    it("searchByIdentifier sends POST /search with text/plain body and parses ZoteroItem", async () => {
      const mockFetch = vi.fn().mockImplementation((url, init) => {
        expect(url).toBe("http://mock-translation-server:1969/search");
        expect(init.method).toBe("POST");
        expect(init.headers["Content-Type"]).toContain("text/plain");
        expect(init.body).toBe("10.1103/PhysRev.47.777");

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([sampleEinsteinZoteroItem]),
        });
      });

      const client = new TranslationClient({
        baseUrl: "http://mock-translation-server:1969",
        fetchFn: mockFetch,
      });

      const items = await client.searchByIdentifier("https://doi.org/10.1103/PhysRev.47.777");
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Can Quantum-Mechanical Description of Physical Reality be Considered Complete?");
      expect(items[0].DOI).toBe("10.1103/PhysRev.47.777");
      expect(items[0].creators).toHaveLength(3);
    });

    it("handles translation server 404 or errors by throwing TranslationServerError", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("No translator found for identifier"),
      });

      const client = new TranslationClient({
        baseUrl: "http://mock-translation-server:1969",
        fetchFn: mockFetch,
      });

      await expect(client.searchByIdentifier("10.0000/invalid")).rejects.toThrow(TranslationServerError);
    });

    it("translateWeb sends POST /web with URL payload", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ title: "Nature News Article", itemType: "magazineArticle" }]),
      });

      const client = new TranslationClient({
        baseUrl: "http://mock-translation-server:1969",
        fetchFn: mockFetch,
      });

      const items = await client.translateWeb("https://www.nature.com/articles/d41586-021-00001-x");
      expect(items[0].title).toBe("Nature News Article");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://mock-translation-server:1969/web",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("importRaw sends POST /import with BibTeX payload", async () => {
      const bibtex = `@article{einstein1935, author={Einstein, A.}, title={EPR}, year={1935}}`;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ title: "EPR", itemType: "journalArticle" }]),
      });

      const client = new TranslationClient({
        baseUrl: "http://mock-translation-server:1969",
        fetchFn: mockFetch,
      });

      const items = await client.importRaw(bibtex, "application/x-bibtex");
      expect(items[0].title).toBe("EPR");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://mock-translation-server:1969/import",
        expect.objectContaining({
          method: "POST",
          body: bibtex,
          headers: expect.objectContaining({ "Content-Type": "application/x-bibtex" }),
        })
      );
    });

    it("exportItems sends POST /export with items array and requested format", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("@article{einstein...}"),
      });

      const client = new TranslationClient({
        baseUrl: "http://mock-translation-server:1969",
        fetchFn: mockFetch,
      });

      const exported = await client.exportItems([sampleEinsteinZoteroItem], "bibtex");
      expect(exported).toBe("@article{einstein...}");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://mock-translation-server:1969/export?format=bibtex",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("Fastify Server Routes & Translation Server Client Integration", () => {
    let itemRepo: InMemoryItemRepository;
    let mockFetch: ReturnType<typeof vi.fn>;
    let zoteroClient: TranslationClient;

    beforeEach(() => {
      itemRepo = new InMemoryItemRepository();
      mockFetch = vi.fn().mockImplementation((url) => {
        if (url.includes("/search")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([sampleEinsteinZoteroItem]),
          });
        }
        return Promise.reject(new Error("Unknown route"));
      });

      zoteroClient = new TranslationClient({
        baseUrl: "http://translation-server:1969",
        fetchFn: mockFetch,
      });
    });

    it("POST /api/items/from-identifier successfully resolves DOI and persists to user library", async () => {
      const app = await buildApp({
        itemRepo,
        zoteroClient,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/items/from-identifier",
        headers: {
          "x-user-id": dummyUserId,
          "content-type": "application/json",
        },
        payload: {
          identifier: "10.1103/PhysRev.47.777",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(data.persisted).toBe(true);
      expect(data.userId).toBe(dummyUserId);
      expect(data.item.title).toBe("Can Quantum-Mechanical Description of Physical Reality be Considered Complete?");
      expect(data.item.doi).toBe("10.1103/PhysRev.47.777");
      expect(data.csl.type).toBe("article-journal");

      // Verify persistence in repository
      const userItems = await itemRepo.list(dummyUserId);
      expect(userItems).toHaveLength(1);
      expect(userItems[0].ownerUserId).toBe(dummyUserId);
      expect(userItems[0].title).toBe("Can Quantum-Mechanical Description of Physical Reality be Considered Complete?");
    });

    it("POST /api/zotero/translate returns 502 when translation server is down or unreachable", async () => {
      const failingFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:1969"));
      const offlineClient = new TranslationClient({
        baseUrl: "http://offline-server:1969",
        fetchFn: failingFetch,
      });

      const app = await buildApp({
        itemRepo,
        zoteroClient: offlineClient,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/translate",
        headers: {
          "x-user-id": dummyUserId,
          "content-type": "application/json",
        },
        payload: {
          identifier: "10.1103/PhysRev.47.777",
        },
      });

      expect(res.statusCode).toBe(502);
      const data = res.json();
      expect(data.error).toBe("Failed to resolve identifier via translation server");
    });
  });

  describe("Optional Smoke Check Against Live Translation Server", () => {
    it("runs live smoke query if translation server is responding, otherwise skips safely", async () => {
      const liveUrl = process.env.TRANSLATION_SERVER_URL || "http://localhost:1969";
      let isLive = false;

      try {
        const check = await fetch(`${liveUrl}/search`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "10.1103/PhysRev.47.777",
          signal: AbortSignal.timeout(1000),
        });
        isLive = check.ok;
      } catch {
        isLive = false;
      }

      if (!isLive) {
        // Live server not running in test runner environment; test passes as smoke skipped
        expect(true).toBe(true);
        return;
      }

      const client = new TranslationClient({ baseUrl: liveUrl });
      const items = await client.searchByIdentifier("10.1103/PhysRev.47.777");
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].title).toContain("Quantum-Mechanical");
    });
  });
});
