import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import { InMemoryZoteroCredentialRepository } from "../src/repositories/inMemoryZoteroRepository.js";
import { ZoteroAccountService } from "../src/zotero/accountService.js";
import { _clearPendingOAuthState } from "../src/zotero/oauth1.js";

describe("Zotero ONLYOFFICE Cite Panel & OAuth Endpoints (apps/server)", () => {
  let app: FastifyInstance;
  let zoteroRepo: InMemoryZoteroCredentialRepository;
  let accountService: ZoteroAccountService;
  let mockFetch: ReturnType<typeof vi.fn>;

  const originalEnv = { ...process.env };
  const userId = "student-cite-user-1";
  const validApiKey = "zotero_valid_api_key_test_123456";
  const zoteroUserId = "987654";

  beforeEach(async () => {
    _clearPendingOAuthState();
    zoteroRepo = new InMemoryZoteroCredentialRepository();
    mockFetch = vi.fn();

    process.env.ZOTERO_OAUTH_CLIENT_KEY = "test-client-key";
    process.env.ZOTERO_OAUTH_CLIENT_SECRET = "test-client-secret";
    process.env.PUBLIC_URL = "https://docs.citedocs.test";
    process.env.TRANSLATION_SERVER_URL = "http://translation-server:1969";

    accountService = new ZoteroAccountService({
      credentialRepo: zoteroRepo,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    app = await buildApp({
      zoteroCredentialRepo: zoteroRepo,
      zoteroAccountService: accountService,
      zoteroFetchFn: mockFetch as unknown as typeof fetch,
    });
    await app.ready();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _clearPendingOAuthState();
  });

  describe("GET /api/zotero/plugin-credentials", () => {
    it("requires authentication (returns 401)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/plugin-credentials",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns linked: false when student has no linked Zotero credentials", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/plugin-credentials",
        headers: { "x-user-id": userId },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.linked).toBe(false);
      expect(data.oauthAvailable).toBe(true);
      expect(data.apiKey).toBeUndefined();
    });

    it("returns linked: true, zoteroUserId, and apiKey when student is linked", async () => {
      await zoteroRepo.save(userId, {
        apiKey: validApiKey,
        zoteroUserId,
        syncEnabled: true,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/plugin-credentials",
        headers: { "x-user-id": userId },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["cache-control"]).toContain("no-store");

      const data = JSON.parse(res.body);
      expect(data.linked).toBe(true);
      expect(data.zoteroUserId).toBe(zoteroUserId);
      expect(data.apiKey).toBe(validApiKey);
      expect(data.oauthAvailable).toBe(true);
    });

    it("automatically resolves and caches zoteroUserId if missing from DB", async () => {
      await zoteroRepo.save(userId, {
        apiKey: validApiKey,
        syncEnabled: true,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ key: validApiKey, userID: 554433 }),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/plugin-credentials",
        headers: { "x-user-id": userId },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.linked).toBe(true);
      expect(data.zoteroUserId).toBe("554433");

      // Verify cached in repo
      const stored = await zoteroRepo.get(userId);
      expect(stored?.zoteroUserId).toBe("554433");
    });
  });

  describe("Zotero OAuth 1.0a Endpoints (/start & /return)", () => {
    it("GET /api/zotero/oauth/start returns 501 when OAuth is not configured", async () => {
      delete process.env.ZOTERO_OAUTH_CLIENT_KEY;
      delete process.env.ZOTERO_OAUTH_CLIENT_SECRET;

      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/oauth/start",
        headers: { "x-user-id": userId, accept: "application/json" },
      });
      expect(res.statusCode).toBe(501);
      expect(JSON.parse(res.body).error).toMatch(/not configured/i);
    });

    it("GET /api/zotero/oauth/start redirects to returnTo with Turkish error query param when OAuth is not configured during browser navigation", async () => {
      delete process.env.ZOTERO_OAUTH_CLIENT_KEY;
      delete process.env.ZOTERO_OAUTH_CLIENT_SECRET;

      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/oauth/start?returnTo=/editor?doc=doc-abc",
        headers: { "x-user-id": userId, accept: "text/html" },
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("/editor?doc=doc-abc");
      expect(res.headers.location).toContain("zotero=not_configured");
      expect(res.headers.location).toContain("zotero_error=");
      expect(decodeURIComponent(res.headers.location!)).toContain("Zotero OAuth bağlantısı sunucuda yapılandırılmamış.");
    });

    it("GET /api/zotero/oauth/start redirects to returnTo with Turkish error query param when upstream fails during browser navigation", async () => {
      process.env.ZOTERO_OAUTH_CLIENT_KEY = "test-key";
      process.env.ZOTERO_OAUTH_CLIENT_SECRET = "test-secret";

      mockFetch.mockRejectedValueOnce(new Error("Zotero upstream network timeout"));

      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/oauth/start?returnTo=/editor?doc=doc-fail",
        headers: { "x-user-id": userId, accept: "text/html" },
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("/editor?doc=doc-fail");
      expect(res.headers.location).toContain("zotero=error");
      expect(res.headers.location).toContain("zotero_error=");
      expect(decodeURIComponent(res.headers.location!)).toContain("Zotero sunucusu ile bağlantı kurulamadı.");
    });

    it("GET /api/zotero/oauth/start redirects to /login when unauthenticated during browser navigation", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/oauth/start?returnTo=/editor?doc=doc-anon",
        headers: { accept: "text/html" },
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe(`/login?returnTo=${encodeURIComponent("/editor?doc=doc-anon")}`);
    });

    it("GET /api/zotero/oauth/start redirects to zotero.org/oauth/authorize on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "oauth_token=req-tok-123&oauth_token_secret=req-sec-456&oauth_callback_confirmed=true",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/oauth/start?returnTo=/editor?doc=doc-abc",
        headers: { "x-user-id": userId },
      });

      expect(res.statusCode).toBe(302);
      const redirectUrl = res.headers.location;
      expect(redirectUrl).toContain("https://www.zotero.org/oauth/authorize");
      expect(redirectUrl).toContain("oauth_token=req-tok-123");
      expect(redirectUrl).toContain("write_access=1");
    });

    it("GET /api/zotero/oauth/return redirects with zotero=denied if denied or tokens missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/oauth/return",
        headers: { "x-user-id": userId },
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/documents?zotero=denied");
    });

    it("GET /api/zotero/oauth/return finishes OAuth flow, links key, and redirects to returnTo with zotero=connected", async () => {
      // Step 1: Start OAuth to register pending state
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "oauth_token=test-tok-ok&oauth_token_secret=test-sec-ok&oauth_callback_confirmed=true",
      });

      await app.inject({
        method: "GET",
        url: "/api/zotero/oauth/start?returnTo=/editor?doc=doc-77",
        headers: { "x-user-id": userId },
      });

      // Step 2: Mock access token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          "oauth_token=acc-tok&oauth_token_secret=NEW_LINKED_API_KEY_999&userID=887766&username=cite_scholar",
      });

      // Step 3: Mock accountService key validation during linkApiKey
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          key: "NEW_LINKED_API_KEY_999",
          userId: 887766,
          username: "cite_scholar",
          access: { user: { library: true, files: true, notes: true, write: true } },
        }),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/zotero/oauth/return?oauth_token=test-tok-ok&oauth_verifier=test-verifier-123",
        headers: { "x-user-id": userId },
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/editor?doc=doc-77&zotero=connected");

      // Verify key is linked and saved in credentials repo
      const cred = await zoteroRepo.get(userId);
      expect(cred).not.toBeNull();
      expect(cred?.apiKey).toBe("NEW_LINKED_API_KEY_999");
      expect(cred?.zoteroUserId).toBe("887766");
    });
  });

  describe("POST /api/zotero/add-by-identifier", () => {
    it("requires authentication (returns 401)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/add-by-identifier",
        payload: { identifier: "10.1038/s41586-021-03392-y" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects empty identifier with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/add-by-identifier",
        headers: { "x-user-id": userId },
        payload: { identifier: "   " },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/Identifier required/i);
    });

    it("returns 409 if Zotero account is not linked when save=true", async () => {
      const sampleItem = {
        itemType: "journalArticle",
        title: "The changing landscape of atherosclerosis",
        DOI: "10.1038/s41586-021-03392-y",
      };

      // Mock translation-server response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [sampleItem],
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/add-by-identifier",
        headers: { "x-user-id": userId },
        payload: { identifier: "10.1038/s41586-021-03392-y" },
      });

      expect(res.statusCode).toBe(409);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("Zotero account not linked");
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe("The changing landscape of atherosclerosis");
    });

    it("resolves DOI via translation-server and saves into student's Zotero library via Web API", async () => {
      await zoteroRepo.save(userId, {
        apiKey: validApiKey,
        zoteroUserId,
        syncEnabled: true,
      });

      const sampleItem = {
        itemType: "journalArticle",
        title: "The changing landscape of atherosclerosis",
        creators: [{ creatorType: "author", firstName: "Peter", lastName: "Libby" }],
        date: "2021",
        DOI: "10.1038/s41586-021-03392-y",
        key: "OLD_KEY",
        version: 1,
      };

      // 1. Mock translation-server response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [sampleItem],
      });

      // 2. Mock Zotero Web API POST /users/:zoteroUserId/items response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          successful: {
            "0": {
              key: "ZOTERO_NEW_KEY_777",
              version: 10,
            },
          },
        }),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/add-by-identifier",
        headers: { "x-user-id": userId },
        payload: { identifier: "https://doi.org/10.1038/s41586-021-03392-y" },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.saved).toBe(true);
      expect(data.key).toBe("ZOTERO_NEW_KEY_777");
      expect(data.item.title).toBe("The changing landscape of atherosclerosis");

      // Verify translation-server was called with normalized identifier (not the full https://doi.org/ prefix)
      const [tsUrl, tsInit] = mockFetch.mock.calls[0];
      expect(tsUrl).toBe("http://translation-server:1969/search");
      expect(tsInit.body).toBe("10.1038/s41586-021-03392-y");

      // Verify Zotero Web API was called with user credentials
      const [zUrl, zInit] = mockFetch.mock.calls[1];
      expect(zUrl).toBe(`https://api.zotero.org/users/${zoteroUserId}/items`);
      expect(zInit.headers["Zotero-API-Key"]).toBe(validApiKey);
      expect(zInit.headers["Zotero-API-Version"]).toBe("3");
    });

    it("resolves Web URL through translation-server /web", async () => {
      await zoteroRepo.save(userId, {
        apiKey: validApiKey,
        zoteroUserId,
        syncEnabled: true,
      });

      const webUrl = "https://nature.com/articles/d41586-021-03392-y";
      const sampleItem = {
        itemType: "webpage",
        title: "News & Views on Atherosclerosis",
        url: webUrl,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [sampleItem],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          successful: { "0": { key: "WEB_SAVED_KEY_123" } },
        }),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/add-by-identifier",
        headers: { "x-user-id": userId },
        payload: { identifier: webUrl },
      });

      expect(res.statusCode).toBe(200);
      const [tsUrl] = mockFetch.mock.calls[0];
      expect(tsUrl).toBe("http://translation-server:1969/web");
    });

    it("supports save=false to return preview without saving to Zotero API", async () => {
      const sampleItem = {
        itemType: "book",
        title: "Clean Architecture",
        ISBN: "9780134494166",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [sampleItem],
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/add-by-identifier",
        headers: { "x-user-id": userId },
        payload: { identifier: "isbn:9780134494166", save: false },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.saved).toBe(false);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe("Clean Architecture");
      // Zotero save API should not be called
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("handles translation-server 404 cleanly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/add-by-identifier",
        headers: { "x-user-id": userId },
        payload: { identifier: "10.9999/invalid-doi" },
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error).toBe("Not found");
    });

    it("handles translation-server 300 multiple items error with 422", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 300,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/add-by-identifier",
        headers: { "x-user-id": userId },
        payload: { identifier: "https://wikipedia.org/wiki/List_of_articles" },
      });

      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.body).error).toMatch(/lists several items/i);
    });

    it("handles translation-server network failure with 502", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const res = await app.inject({
        method: "POST",
        url: "/api/zotero/add-by-identifier",
        headers: { "x-user-id": userId },
        payload: { identifier: "10.1038/test" },
      });

      expect(res.statusCode).toBe(502);
      expect(JSON.parse(res.body).error).toBe("translation-server unavailable");
    });
  });
});
