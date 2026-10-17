import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import { InMemoryZoteroCredentialRepository } from "../src/repositories/inMemoryZoteroRepository.js";
import { ZoteroAccountService } from "../src/zotero/accountService.js";
import { ZoteroImportService } from "../src/zotero/importService.js";

describe("Zotero Reference Import Endpoints (apps/server)", () => {
  let app: FastifyInstance;
  let zoteroRepo: InMemoryZoteroCredentialRepository;
  let accountService: ZoteroAccountService;
  let importService: ZoteroImportService;
  let mockFetch: ReturnType<typeof vi.fn>;

  const originalEnv = { ...process.env };
  const userId = "student-test-import-user";
  const validApiKey = "zotero_import_api_key_123456";
  const zoteroUserId = "887766";

  const sampleBibtex = `@article{knuth1984,
  author = {Donald E. Knuth},
  title = {Literate Programming},
  journal = {The Computer Journal},
  year = {1984},
  volume = {27},
  pages = {97--111},
  doi = {10.1093/comjnl/27.2.97}
}`;

  const sampleParsedItem = {
    itemType: "journalArticle",
    title: "Literate Programming",
    creators: [{ creatorType: "author", firstName: "Donald E.", lastName: "Knuth" }],
    date: "1984",
    publicationTitle: "The Computer Journal",
    volume: "27",
    pages: "97--111",
    DOI: "10.1093/comjnl/27.2.97",
    key: "OLD_KEY",
    version: 1,
  };

  beforeEach(async () => {
    zoteroRepo = new InMemoryZoteroCredentialRepository();
    mockFetch = vi.fn();

    process.env.TRANSLATION_SERVER_URL = "http://translation-server:1969";

    accountService = new ZoteroAccountService({
      credentialRepo: zoteroRepo,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    importService = new ZoteroImportService({
      credentialRepo: zoteroRepo,
      fetchFn: mockFetch as unknown as typeof fetch,
      translationServerUrl: "http://translation-server:1969",
    });

    app = await buildApp({
      zoteroCredentialRepo: zoteroRepo,
      zoteroAccountService: accountService,
      zoteroImportService: importService,
      zoteroFetchFn: mockFetch as unknown as typeof fetch,
    });
    await app.ready();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Authentication & validation limits", () => {
    it("requires authentication (returns 401)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        payload: { data: sampleBibtex },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects empty data with 400 Bad Request and Turkish message", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: "   " },
      });
      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("Validation failed");
      expect(data.message).toContain("boş olamaz");
    });

    it("rejects empty items array with 400 Bad Request", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { items: [] },
      });
      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.message).toContain("boş olamaz");
    });

    it("enforces 2 MB file / text payload limit with 413 Payload Too Large", async () => {
      // 2 MB + 10 bytes string
      const largeData = "x".repeat(2 * 1024 * 1024 + 10);
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: largeData },
      });
      expect(res.statusCode).toBe(413);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("Payload Too Large");
      expect(data.message).toContain("2 MB");
    });

    it("enforces 500 items max limit with 400 Too Many Items", async () => {
      const excessiveItems = Array.from({ length: 501 }, (_, i) => ({
        itemType: "journalArticle",
        title: `Item ${i + 1}`,
      }));

      // Mock translation-server returning 501 items
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => excessiveItems,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: sampleBibtex },
      });
      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.message).toContain("500");
      expect(data.message).toContain("501");
    });
  });

  describe("Format detection & translation-server integration", () => {
    it("sniffs BibTeX from content and sends application/x-bibtex to translation-server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [sampleParsedItem],
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: sampleBibtex, save: false },
      });

      expect(res.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://translation-server:1969/import",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-bibtex; charset=utf-8",
          }),
          body: sampleBibtex,
        }),
      );
    });

    it("sniffs RIS from content and sends application/x-research-info-systems", async () => {
      const risData = `TY  - JOUR\nTI  - Test Paper\nER  - `;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ itemType: "journalArticle", title: "Test Paper" }],
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: risData, save: false },
      });

      expect(res.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://translation-server:1969/import",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/x-research-info-systems; charset=utf-8",
          }),
        }),
      );
    });

    it("sniffs CSL-JSON from content and sends application/json", async () => {
      const jsonContent = JSON.stringify([{ type: "article-journal", title: "CSL Paper" }]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ itemType: "journalArticle", title: "CSL Paper" }],
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: jsonContent, save: false },
      });

      expect(res.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://translation-server:1969/import",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json; charset=utf-8",
          }),
        }),
      );
    });

    it("respects filename extension (.xml / .rdf) for EndNote XML and Zotero RDF", async () => {
      const xmlContent = `<records><record><title>XML Paper</title></record></records>`;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ itemType: "journalArticle", title: "XML Paper" }],
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: xmlContent, filename: "library.xml", save: false },
      });

      expect(res.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://translation-server:1969/import",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/xml; charset=utf-8",
          }),
        }),
      );
    });

    it("handles translation-server 404 / 422 with Turkish error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });
      // Fallback text/plain also fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: "invalid bibliographic data", save: false },
      });

      expect(res.statusCode).toBe(422);
      const data = JSON.parse(res.body);
      expect(data.message).toContain("Geçerli bir kaynak bulunamadı");
    });

    it("handles translation-server 502 / network outage with Turkish error message", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: sampleBibtex, save: false },
      });

      expect(res.statusCode).toBe(502);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("Translation failed");
      expect(data.message).toContain("Çeviri sunucusuna ulaşılamadı");
    });
  });

  describe("Preview and Unlinked User Behavior", () => {
    it("returns preview without saving when save=false", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [sampleParsedItem],
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: sampleBibtex, save: false },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.saved).toBe(false);
      expect(data.total).toBe(1);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe("Literate Programming");
      expect(data.items[0].authors).toBe("Donald E. Knuth");
      expect(data.items[0].year).toBe("1984");
      expect(data.items[0].doi).toBe("10.1093/comjnl/27.2.97");
      expect(data.rawItems).toBeDefined();

      // Zotero API must NOT be called
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns 409 Conflict with parsed preview when unlinked user tries to save", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [sampleParsedItem],
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: sampleBibtex, save: true },
      });

      expect(res.statusCode).toBe(409);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("Zotero account not linked");
      expect(data.message).toContain("Zotero hesabınızı bağlamalısınız");
      expect(data.total).toBe(1);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe("Literate Programming");
      expect(data.rawItems).toBeDefined();

      // Only translation-server called, not Zotero API
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Linked User & Batch Writing to Zotero API", () => {
    beforeEach(async () => {
      await zoteroRepo.save(userId, {
        apiKey: validApiKey,
        zoteroUserId,
        syncEnabled: true,
      });
    });

    it("successfully imports and saves single reference into linked Zotero library", async () => {
      // 1. Translation server returns item
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [sampleParsedItem],
      });

      // 2. Zotero API POST /users/:zoteroUserId/items returns success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          successful: {
            "0": { key: "ZOTERO_NEW_KEY_999", version: 1 },
          },
        }),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: sampleBibtex, save: true },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.saved).toBe(true);
      expect(data.total).toBe(1);
      expect(data.savedCount).toBe(1);
      expect(data.failedCount).toBe(0);
      expect(data.savedItems[0].key).toBe("ZOTERO_NEW_KEY_999");
      expect(data.savedItems[0].title).toBe("Literate Programming");
      expect(data.message).toContain("başarıyla eklendi");

      // Verify Zotero API call parameters
      const [zUrl, zInit] = mockFetch.mock.calls[1];
      expect(zUrl).toBe(`https://api.zotero.org/users/${zoteroUserId}/items`);
      expect(zInit.headers["Zotero-API-Key"]).toBe(validApiKey);
      expect(zInit.headers["Zotero-API-Version"]).toBe("3");
    });

    it("respects Zotero 50-items-per-request limit by chunking 120 items into 3 batches", async () => {
      const generatedItems = Array.from({ length: 120 }, (_, i) => ({
        itemType: "journalArticle",
        title: `Paper ${i + 1}`,
        creators: [{ creatorType: "author", firstName: "Author", lastName: `${i + 1}` }],
        date: "2023",
      }));

      // 1. Translation server returns 120 items
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => generatedItems,
      });

      // 2. Batch 1 (items 0..49)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          successful: Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [String(i), { key: `K1_${i}` }]),
          ),
        }),
      });

      // 3. Batch 2 (items 50..99)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          successful: Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [String(i), { key: `K2_${i}` }]),
          ),
        }),
      });

      // 4. Batch 3 (items 100..119)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          successful: Object.fromEntries(
            Array.from({ length: 20 }, (_, i) => [String(i), { key: `K3_${i}` }]),
          ),
        }),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: sampleBibtex, save: true },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.total).toBe(120);
      expect(data.savedCount).toBe(120);
      expect(data.failedCount).toBe(0);
      expect(data.savedItems).toHaveLength(120);

      // Verify that mockFetch was called 4 times: 1 for translation-server, 3 for Zotero batches
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Check batch sizes
      const batch1Payload = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(batch1Payload).toHaveLength(50);

      const batch2Payload = JSON.parse(mockFetch.mock.calls[2][1].body);
      expect(batch2Payload).toHaveLength(50);

      const batch3Payload = JSON.parse(mockFetch.mock.calls[3][1].body);
      expect(batch3Payload).toHaveLength(20);
    });

    it("accurately reports partial failures in Zotero batch write", async () => {
      const items = [
        { itemType: "journalArticle", title: "Valid Paper 1" },
        { itemType: "journalArticle", title: "Invalid Paper 2" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => items,
      });

      // Zotero returns 1 successful, 1 failed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          successful: {
            "0": { key: "KEY_1" },
          },
          failed: {
            "1": { code: 400, message: "Geçersiz tarih alanı" },
          },
        }),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: { data: sampleBibtex, save: true },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.savedCount).toBe(1);
      expect(data.failedCount).toBe(1);
      expect(data.savedItems).toHaveLength(1);
      expect(data.failedItems).toHaveLength(1);
      expect(data.failedItems[0].title).toBe("Invalid Paper 2");
      expect(data.failedItems[0].reason).toContain("Geçersiz tarih");
      expect(data.message).toContain("1 kaynak Zotero kütüphanenize başarıyla eklendi, 1 kaynak eklenemedi");
    });

    it("supports direct saving of pre-parsed items without contacting translation-server", async () => {
      // Direct submission of items array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          successful: {
            "0": { key: "DIRECT_KEY_1" },
          },
        }),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/import",
        headers: { "x-user-id": userId },
        payload: {
          items: [sampleParsedItem],
          save: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.savedCount).toBe(1);
      expect(data.savedItems[0].key).toBe("DIRECT_KEY_1");

      // Translation-server was NOT called, only Zotero API
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain("api.zotero.org");
    });
  });
});
