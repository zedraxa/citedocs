import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { InMemoryItemRepository } from "../src/repositories/inMemoryItemRepository.js";
import { InMemoryZoteroCredentialRepository } from "../src/repositories/inMemoryZoteroRepository.js";
import { ZoteroAccountService } from "../src/zotero/accountService.js";
import { ZoteroProxyService } from "../src/zotero/proxyService.js";

describe("Zotero Web API Proxy and Translation Server Proxy (apps/server)", () => {
  let itemRepo: InMemoryItemRepository;
  let zoteroRepo: InMemoryZoteroCredentialRepository;
  let mockFetch: ReturnType<typeof vi.fn>;
  let accountService: ZoteroAccountService;
  let proxyService: ZoteroProxyService;
  let app: Awaited<ReturnType<typeof buildApp>>;

  const userAlice = "user-alice-uuid";
  const userUnlinked = "user-unlinked-uuid";
  const validApiKey = "valid_zotero_api_key_alice123456";

  beforeEach(async () => {
    itemRepo = new InMemoryItemRepository();
    zoteroRepo = new InMemoryZoteroCredentialRepository();

    mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      // 1. Zotero API key validation
      if (url.includes("/keys/current")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            key: validApiKey,
            userId: 112233,
            username: "alice",
            access: { user: { library: true } },
          }),
        };
      }

      // 2. Upstream Zotero Web API mock (e.g. users/112233/items)
      if (url.includes("api.zotero.org")) {
        const headers = (init?.headers as Record<string, string>) || {};
        if (headers["Zotero-API-Key"] !== validApiKey) {
          return {
            ok: false,
            status: 403,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ error: "Forbidden: invalid key" }),
          };
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({
            "content-type": "application/json",
            "last-modified-version": "42",
            "total-results": "1",
            link: '<https://api.zotero.org/users/112233/items?page=2>; rel="next"',
          }),
          json: async () => [
            {
              key: "ITEM1234",
              version: 42,
              data: {
                itemType: "journalArticle",
                title: "Quantum Holography & Black Holes",
                creators: [{ firstName: "Stephen", lastName: "Hawking" }],
                date: "1975",
              },
            },
          ],
        };
      }

      // 3. Translation server mock (port 1969 /search)
      if (url.includes(":1969/search") || url.includes("/search")) {
        const body = init?.body as string;
        if (body.includes("fail-doi")) {
          return {
            ok: false,
            status: 404,
            headers: new Headers({ "content-type": "text/plain" }),
            text: async () => "Identifier not found in translation catalogs",
          };
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => [
            {
              itemType: "journalArticle",
              title: "The Changing Landscape of Atherosclerosis",
              creators: [
                { creatorType: "author", firstName: "Peter", lastName: "Libby" },
              ],
              date: "2021",
              DOI: "10.1038/s41586-021-03392-y",
              publicationTitle: "Nature",
            },
          ],
        };
      }

      return {
        ok: false,
        status: 404,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "Not found",
      };
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

    // Link user Alice
    await accountService.linkApiKey(userAlice, validApiKey);
  });

  it("blocks proxy requests if user has not linked their Zotero account", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/zotero/proxy/users/999/items",
      headers: { "x-user-id": userUnlinked },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe("Zotero account not linked");
  });

  it("proxies request to zotero.org, injecting decrypted key and returning headers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/zotero/proxy/users/112233/items?limit=25",
      headers: {
        "x-user-id": userAlice,
        "if-modified-since-version": "10",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["last-modified-version"]).toBe("42");
    expect(res.headers["total-results"]).toBe("1");
    expect(res.headers["link"]).toContain("rel=\"next\"");

    const items = res.json();
    expect(Array.isArray(items)).toBe(true);
    expect(items[0].key).toBe("ITEM1234");
    expect(items[0].data.title).toBe("Quantum Holography & Black Holes");

    // Ensure mockFetch was called with Zotero-API-Key: validApiKey
    const callArgs = mockFetch.mock.calls.find((c) =>
      typeof c[0] === "string" && c[0].includes("/users/112233/items")
    );
    expect(callArgs).toBeDefined();
    expect(callArgs[1].headers["Zotero-API-Key"]).toBe(validApiKey);
    expect(callArgs[1].headers["Zotero-API-Version"]).toBe("3");
    expect(callArgs[1].headers["If-Modified-Since-Version"]).toBe("10");
  });

  it("proxies search to translation-server (POST /api/zotero/translation/search)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/zotero/translation/search",
      headers: { "x-user-id": userAlice },
      payload: { identifier: "10.1038/s41586-021-03392-y" },
    });

    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(Array.isArray(items)).toBe(true);
    expect(items[0].title).toBe("The Changing Landscape of Atherosclerosis");
    expect(items[0].DOI).toBe("10.1038/s41586-021-03392-y");

    // Ensure translation-server endpoint was invoked with text/plain body
    const translationCall = mockFetch.mock.calls.find((c) =>
      typeof c[0] === "string" && c[0].includes(":1969/search")
    );
    expect(translationCall).toBeDefined();
    expect(translationCall[1].headers["Content-Type"]).toBe("text/plain");
    expect(translationCall[1].body).toBe("10.1038/s41586-021-03392-y");
  });

  it("handles translation server lookup failure gracefully", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/zotero/translation/search",
      headers: { "x-user-id": userAlice },
      payload: { identifier: "fail-doi-999" },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toContain("Translation server failed to resolve identifier");
  });

  it("supports POST /search alias for translation-server lookup", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/search",
      headers: { "x-user-id": userAlice },
      payload: { identifier: "10.1038/s41586-021-03392-y" },
    });

    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(Array.isArray(items)).toBe(true);
    expect(items[0].title).toBe("The Changing Landscape of Atherosclerosis");
  });

  it("rejects empty identifier search with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/zotero/translation/search",
      headers: { "x-user-id": userAlice },
      payload: { identifier: "   " },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid input");
  });
});
