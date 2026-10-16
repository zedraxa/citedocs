import { describe, it, expect, vi } from "vitest";
import {
  zoteroItemToCSL,
  parseDateToCSL,
  TranslationClient,
  TranslationServerError,
  normalizeIdentifier,
  normalizeZoteroItem,
  generateZoteroKey,
  ZoteroSyncEngine,
} from "../src/index.js";
import type { ZoteroItem } from "@citedocs/shared";

describe("@citedocs/zotero-core", () => {
  const sampleZoteroItem: ZoteroItem = {
    key: "ZOT12345",
    version: 4,
    itemType: "journalArticle",
    title: "Deep Reinforcement Learning in Scientific Workflows",
    creators: [
      {
        creatorType: "author",
        firstName: "Yusuf",
        lastName: "Kavak",
      },
      {
        creatorType: "author",
        firstName: "Alan",
        lastName: "Turing",
      },
    ],
    publicationTitle: "Journal of Artificial Intelligence Research",
    volume: "75",
    issue: "3",
    pages: "100-125",
    date: "2024-03-15",
    DOI: "10.1613/jair.1.12345",
    tags: [{ tag: "ai" }],
    collections: ["C1"],
  };

  /**
   * Reference fixture for acceptance: Nature paper with DOI 10.1038/s41586-021-03392-y
   */
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
    ISSN: "0028-0836, 1476-4687",
    url: "https://www.nature.com/articles/s41586-021-03392-y",
    abstractNote: "Atherosclerosis is an inflammatory disease of the arterial wall...",
    libraryCatalog: "Crossref",
    tags: [{ tag: "cardiovascular" }],
    collections: [],
  };

  describe("CSL Conversion", () => {
    it("converts ZoteroItem into standard CSLItem", () => {
      const csl = zoteroItemToCSL(sampleZoteroItem);

      expect(csl.id).toBe("ZOT12345");
      expect(csl.type).toBe("article-journal");
      expect(csl.title).toBe("Deep Reinforcement Learning in Scientific Workflows");
      expect(csl.author).toHaveLength(2);
      expect(csl.author?.[0].family).toBe("Kavak");
      expect(csl.author?.[1].given).toBe("Alan");
      expect(csl["container-title"]).toBe("Journal of Artificial Intelligence Research");
      expect(csl.volume).toBe("75");
      expect(csl.page).toBe("100-125");
      expect(csl.DOI).toBe("10.1613/jair.1.12345");
    });

    it("correctly parses diverse date formats into CSL dates", () => {
      const d1 = parseDateToCSL("2024-03-15");
      expect(d1["date-parts"]).toEqual([[2024, 3, 15]]);

      const d2 = parseDateToCSL("1999");
      expect(d2["date-parts"]).toEqual([[1999]]);

      const d3 = parseDateToCSL("circa 1850");
      expect(d3["date-parts"]).toEqual([[1850]]);
    });

    it("converts nature DOI fixture into complete CSLItem with year, authors, title, DOI", () => {
      const csl = zoteroItemToCSL(natureDoiFixture);

      expect(csl.title).toBe("The changing landscape of atherosclerosis");
      expect(csl.author).toHaveLength(1);
      expect(csl.author?.[0].family).toBe("Libby");
      expect(csl.author?.[0].given).toBe("Peter");
      expect(csl.DOI).toBe("10.1038/s41586-021-03392-y");
      expect(csl["container-title"]).toBe("Nature");
      expect(csl.volume).toBe("592");
      expect(csl.issue).toBe("7855");
      expect(csl.page).toBe("524-533");

      // Verify year is correctly extracted into date-parts
      const year = csl.issued?.["date-parts"]?.[0]?.[0];
      expect(year).toBe(2021);
    });
  });

  describe("Identifier Normalization & Key Generation", () => {
    it("normalizes diverse identifier formats", () => {
      expect(normalizeIdentifier("10.1038/s41586-021-03392-y")).toBe(
        "10.1038/s41586-021-03392-y",
      );
      expect(normalizeIdentifier("https://doi.org/10.1038/s41586-021-03392-y")).toBe(
        "10.1038/s41586-021-03392-y",
      );
      expect(normalizeIdentifier("http://dx.doi.org/10.1038/s41586-021-03392-y")).toBe(
        "10.1038/s41586-021-03392-y",
      );
      expect(normalizeIdentifier("doi: 10.1038/s41586-021-03392-y")).toBe(
        "10.1038/s41586-021-03392-y",
      );
      expect(normalizeIdentifier("arxiv:2104.12345")).toBe("2104.12345");
      expect(normalizeIdentifier("pmid:33883728")).toBe("33883728");
      expect(normalizeIdentifier("isbn:978-0199695140")).toBe("978-0199695140");
    });

    it("generates a valid 8-char uppercase alphanumeric Zotero key", () => {
      const key = generateZoteroKey();
      expect(key).toHaveLength(8);
      expect(key).toMatch(/^[2-9A-Z]{8}$/);
    });

    it("normalizes incomplete raw Zotero items with default fields and generated key", () => {
      const incomplete = {
        title: "Incomplete Item",
      };
      const normalized = normalizeZoteroItem(incomplete);

      expect(normalized.title).toBe("Incomplete Item");
      expect(normalized.key).toHaveLength(8);
      expect(normalized.version).toBe(0);
      expect(normalized.itemType).toBe("journalArticle");
      expect(normalized.creators).toEqual([]);
      expect(normalized.tags).toEqual([]);
      expect(normalized.collections).toEqual([]);
    });
  });

  describe("TranslationClient - M2 Acceptance & DOI Fixture", () => {
    it("submits DOI 10.1038/s41586-021-03392-y and retrieves complete bibliographic metadata", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [natureDoiFixture],
      });

      const client = new TranslationClient({
        baseUrl: "http://localhost:1969",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const items = await client.searchByIdentifier("10.1038/s41586-021-03392-y");

      // Verify the translation-server /search contract: POST text/plain with raw identifier
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:1969/search",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "text/plain; charset=utf-8",
          }),
          body: "10.1038/s41586-021-03392-y",
        }),
      );

      expect(items).toHaveLength(1);
      const item = items[0];

      // M2 Acceptance assertions: title, authors, year, DOI fields present
      expect(item.title).toBe("The changing landscape of atherosclerosis");
      expect(item.creators).toHaveLength(1);
      expect(item.creators[0].creatorType).toBe("author");
      expect(item.creators[0].firstName).toBe("Peter");
      expect(item.creators[0].lastName).toBe("Libby");
      expect(item.date).toBe("2021-04-21");
      expect(item.DOI).toBe("10.1038/s41586-021-03392-y");
      expect(item.publicationTitle).toBe("Nature");
    });

    it("translates DOI and converts into both Zotero and CSL shapes via translateAndConvert", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [natureDoiFixture],
      });

      const client = new TranslationClient({
        baseUrl: "http://localhost:1969",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await client.translateAndConvert("https://doi.org/10.1038/s41586-021-03392-y");

      expect(result.items).toHaveLength(1);
      expect(result.cslItems).toHaveLength(1);

      // Verify primary item
      expect(result.primaryItem?.title).toBe("The changing landscape of atherosclerosis");
      expect(result.primaryItem?.DOI).toBe("10.1038/s41586-021-03392-y");

      // Verify primary CSL item
      expect(result.primaryCsl?.title).toBe("The changing landscape of atherosclerosis");
      expect(result.primaryCsl?.DOI).toBe("10.1038/s41586-021-03392-y");
      expect(result.primaryCsl?.author?.[0].family).toBe("Libby");
      expect(result.primaryCsl?.issued?.["date-parts"]?.[0]?.[0]).toBe(2021);
    });

    it("handles URL web translation via POST /web", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [natureDoiFixture],
      });

      const client = new TranslationClient({
        baseUrl: "http://localhost:1969",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const items = await client.translateWeb("https://www.nature.com/articles/s41586-021-03392-y");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:1969/web",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "text/plain; charset=utf-8",
          }),
          body: "https://www.nature.com/articles/s41586-021-03392-y",
        }),
      );
      expect(items).toHaveLength(1);
    });

    it("handles raw bibliographic text import via POST /import", async () => {
      const bibtex = `@article{libby2021, title={The changing landscape of atherosclerosis}}`;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [natureDoiFixture],
      });

      const client = new TranslationClient({
        baseUrl: "http://localhost:1969",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const items = await client.importRaw(bibtex, "application/x-bibtex");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:1969/import",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-bibtex",
          }),
          body: bibtex,
        }),
      );
      expect(items).toHaveLength(1);
    });

    it("handles item export via POST /export?format=bibtex", async () => {
      const exportedBibtex = `@article{libby2021...}`;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => exportedBibtex,
      });

      const client = new TranslationClient({
        baseUrl: "http://localhost:1969",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await client.exportItems([natureDoiFixture], "bibtex");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:1969/export?format=bibtex",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify([natureDoiFixture]),
        }),
      );
      expect(result).toBe(exportedBibtex);
    });

    it("throws TranslationServerError with status code when upstream returns non-200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "No translator found for identifier",
      });

      const client = new TranslationClient({
        baseUrl: "http://localhost:1969",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(client.searchByIdentifier("invalid-doi-123")).rejects.toThrow(
        TranslationServerError,
      );

      try {
        await client.searchByIdentifier("invalid-doi-123");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(TranslationServerError);
        const serverErr = err as TranslationServerError;
        expect(serverErr.statusCode).toBe(404);
        expect(serverErr.responseBody).toBe("No translator found for identifier");
      }
    });

    it("throws error immediately if empty identifier is provided", async () => {
      const client = new TranslationClient();
      await expect(client.searchByIdentifier("   ")).rejects.toThrow(
        "Identifier cannot be empty",
      );
    });

    it("checks isAlive method correctly", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const client = new TranslationClient({
        baseUrl: "http://localhost:1969",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const alive = await client.isAlive();
      expect(alive).toBe(true);
    });

    // Optional live integration test gated by environment variable
    const liveServerUrl = process.env.TRANSLATION_SERVER_URL;
    (liveServerUrl ? it : it.skip)(
      "resolves live identifier against TRANSLATION_SERVER_URL",
      async () => {
        const liveClient = new TranslationClient({ baseUrl: liveServerUrl });
        const alive = await liveClient.isAlive();
        if (alive) {
          const results = await liveClient.searchByIdentifier("10.1038/s41586-021-03392-8");
          expect(results.length).toBeGreaterThan(0);
          expect(results[0].title).toBeDefined();
        }
      },
    );
  });

  describe("ZoteroSyncEngine", () => {
    it("handles sync headers and version tracking in ZoteroSyncEngine", () => {
      const engine = new ZoteroSyncEngine(
        {
          userId: "123456",
          apiKey: "secretKey",
        },
        10,
      );

      const readHeaders = engine.getHeaders(false);
      expect(readHeaders["Zotero-API-Version"]).toBe("3");
      expect(readHeaders["Zotero-API-Key"]).toBe("secretKey");
      expect(readHeaders["If-Modified-Since-Version"]).toBe("10");

      const writeHeaders = engine.getHeaders(true);
      expect(writeHeaders["If-Unmodified-Since-Version"]).toBe("10");

      engine.updateLocalVersion(15);
      expect(engine.getVersion()).toBe(15);
    });

    it("detects sync concurrency conflicts", () => {
      const engine = new ZoteroSyncEngine({ userId: "123", apiKey: "key" }, 5);
      const local = { ...sampleZoteroItem, version: 5 };
      const remote = { ...sampleZoteroItem, version: 6 };

      expect(engine.evaluateConflict(local, remote)).toBe(true);
      expect(engine.evaluateConflict(local, { ...remote, version: 5 })).toBe(false);
    });
  });
});
