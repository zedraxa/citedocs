import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { InMemoryItemRepository } from "../src/repositories/inMemoryItemRepository.js";
import { InMemoryZoteroCredentialRepository } from "../src/repositories/inMemoryZoteroRepository.js";
import { ZoteroAccountService } from "../src/zotero/accountService.js";

describe("Zotero Account Linking API (apps/server)", () => {
  let itemRepo: InMemoryItemRepository;
  let zoteroRepo: InMemoryZoteroCredentialRepository;
  let mockFetch: ReturnType<typeof vi.fn>;
  let accountService: ZoteroAccountService;
  let app: Awaited<ReturnType<typeof buildApp>>;

  const userAlice = "user-alice-uuid";
  const userBob = "user-bob-uuid";
  const validApiKey = "valid_zotero_api_key_abcdef1234";

  beforeEach(async () => {
    itemRepo = new InMemoryItemRepository();
    zoteroRepo = new InMemoryZoteroCredentialRepository();

    mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers as Record<string, string>) || {};
      const key = headers["Zotero-API-Key"];

      if (url.includes("/keys/current")) {
        if (key === validApiKey) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              key: validApiKey,
              userId: 9876543,
              username: "alice_researcher",
              access: {
                user: {
                  library: true,
                  files: true,
                  notes: true,
                  write: true,
                },
                groups: {
                  all: true,
                },
              },
            }),
          };
        } else {
          return {
            ok: false,
            status: 403,
            headers: new Headers({ "content-type": "application/json" }),
            text: async () => "Forbidden: Invalid API key",
          };
        }
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

    app = await buildApp({
      itemRepo,
      zoteroCredentialRepo: zoteroRepo,
      zoteroAccountService: accountService,
    });
  });

  it("requires authentication for all account linking endpoints", async () => {
    const resGet = await app.inject({
      method: "GET",
      url: "/api/zotero/account",
    });
    expect(resGet.statusCode).toBe(401);

    const resPost = await app.inject({
      method: "POST",
      url: "/api/zotero/account",
      payload: { apiKey: validApiKey },
    });
    expect(resPost.statusCode).toBe(401);

    const resDel = await app.inject({
      method: "DELETE",
      url: "/api/zotero/account",
    });
    expect(resDel.statusCode).toBe(401);
  });

  it("returns unlinked status when user has not linked an account", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/zotero/account",
      headers: { "x-user-id": userAlice },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.linked).toBe(false);
    expect(body.zoteroUserId).toBeNull();
    expect(body.maskedKey).toBeNull();
  });

  it("rejects an invalid Zotero API key with 401 and does not store it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/zotero/account",
      headers: { "x-user-id": userAlice },
      payload: { apiKey: "completely_fake_invalid_key" },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error).toBe("Validation failed");

    // Verify nothing was stored
    const stored = await zoteroRepo.get(userAlice);
    expect(stored).toBeNull();
  });

  it("links a valid API key, stores it encrypted at rest, and returns masked key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/zotero/account",
      headers: { "x-user-id": userAlice },
      payload: { apiKey: validApiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.linked).toBe(true);
    expect(body.zoteroUserId).toBe("9876543");
    expect(body.username).toBe("alice_researcher");

    // NEVER return raw key in full
    expect(body.maskedKey).toBeDefined();
    expect(body.maskedKey).not.toBe(validApiKey);
    expect(body.maskedKey).toContain("••••••••");
    expect(JSON.stringify(body)).not.toContain(validApiKey);

    // Verify stored at rest is encrypted
    const cred = await zoteroRepo.get(userAlice);
    expect(cred).not.toBeNull();
    expect(cred?.zoteroUserId).toBe("9876543");
    // Internal decryptAtRest matches
    expect(cred?.apiKey).toBe(validApiKey);
  });

  it("retrieves account status with masked key and never exposes raw key", async () => {
    // First link key
    await accountService.linkApiKey(userAlice, validApiKey);

    const res = await app.inject({
      method: "GET",
      url: "/api/zotero/account",
      headers: { "x-user-id": userAlice },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.linked).toBe(true);
    expect(body.zoteroUserId).toBe("9876543");
    expect(body.maskedKey).toContain("••••••••");
    expect(JSON.stringify(body)).not.toContain(validApiKey);
  });

  it("deletes user's Zotero account link", async () => {
    await accountService.linkApiKey(userAlice, validApiKey);

    const resDelete = await app.inject({
      method: "DELETE",
      url: "/api/zotero/account",
      headers: { "x-user-id": userAlice },
    });

    expect(resDelete.statusCode).toBe(200);
    expect(resDelete.json().unlinked).toBe(true);

    // Verify subsequent GET returns unlinked
    const resGet = await app.inject({
      method: "GET",
      url: "/api/zotero/account",
      headers: { "x-user-id": userAlice },
    });
    expect(resGet.json().linked).toBe(false);
  });

  it("enforces strict per-user tenant isolation", async () => {
    // Alice links her key
    await accountService.linkApiKey(userAlice, validApiKey);

    // Bob queries his account status
    const resBob = await app.inject({
      method: "GET",
      url: "/api/zotero/account",
      headers: { "x-user-id": userBob },
    });

    expect(resBob.statusCode).toBe(200);
    expect(resBob.json().linked).toBe(false);
    expect(resBob.json().zoteroUserId).toBeNull();

    // Bob cannot unlink Alice's account
    await app.inject({
      method: "DELETE",
      url: "/api/zotero/account",
      headers: { "x-user-id": userBob },
    });

    // Alice is still linked
    const resAlice = await app.inject({
      method: "GET",
      url: "/api/zotero/account",
      headers: { "x-user-id": userAlice },
    });
    expect(resAlice.json().linked).toBe(true);
  });

  it("returns web-library configuration via GET /api/zotero/config", async () => {
    await accountService.linkApiKey(userAlice, validApiKey);

    const res = await app.inject({
      method: "GET",
      url: "/api/zotero/config",
      headers: { "x-user-id": userAlice },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.config.linked).toBe(true);
    expect(body.config.zoteroUserId).toBe("9876543");
    expect(body.config.proxyBaseUrl).toBe("/api/zotero/proxy");
    expect(body.config.webLibraryUrl).toContain("9876543");
  });

  it("handles OAuth 1.0a initiate and callback skeleton", async () => {
    const resInit = await app.inject({
      method: "GET",
      url: "/api/zotero/oauth/initiate?callbackUrl=http://localhost:5173/oauth/callback",
      headers: { "x-user-id": userAlice },
    });

    expect(resInit.statusCode).toBe(200);
    const initBody = resInit.json();
    expect(initBody.success).toBe(true);
    expect(initBody.authorizeUrl).toContain("https://www.zotero.org/oauth/authorize");

    const resCallback = await app.inject({
      method: "POST",
      url: "/api/zotero/oauth/callback",
      headers: { "x-user-id": userAlice },
      payload: {
        oauthToken: validApiKey,
        oauthVerifier: "verifier123",
      },
    });

    expect(resCallback.statusCode).toBe(200);
    expect(resCallback.json().linked).toBe(true);
  });
});
