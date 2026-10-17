import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  zoteroOAuthConfigured,
  authHeader,
  startZoteroOAuth,
  finishZoteroOAuth,
  getPendingOAuth,
  _clearPendingOAuthState,
} from "../src/zotero/oauth1.js";

describe("Zotero OAuth 1.0a Client (apps/server/src/zotero/oauth1.ts)", () => {
  const originalEnv = { ...process.env };
  const mockClientKey = "mock-zotero-client-key-123";
  const mockClientSecret = "mock-zotero-client-secret-456";

  beforeEach(() => {
    _clearPendingOAuthState();
    process.env.ZOTERO_OAUTH_CLIENT_KEY = mockClientKey;
    process.env.ZOTERO_OAUTH_CLIENT_SECRET = mockClientSecret;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _clearPendingOAuthState();
  });

  describe("zoteroOAuthConfigured()", () => {
    it("returns true when both key and secret are present", () => {
      expect(zoteroOAuthConfigured()).toBe(true);
    });

    it("returns false when either key or secret is missing", () => {
      delete process.env.ZOTERO_OAUTH_CLIENT_KEY;
      expect(zoteroOAuthConfigured()).toBe(false);

      process.env.ZOTERO_OAUTH_CLIENT_KEY = mockClientKey;
      delete process.env.ZOTERO_OAUTH_CLIENT_SECRET;
      expect(zoteroOAuthConfigured()).toBe(false);
    });
  });

  describe("authHeader()", () => {
    it("builds a valid RFC 5849 OAuth 1.0a Authorization header", () => {
      const url = "https://www.zotero.org/oauth/request";
      const header = authHeader(url, { oauth_callback: "https://docs.test/api/zotero/oauth/return" });

      expect(header.startsWith("OAuth ")).toBe(true);
      expect(header).toContain(`oauth_consumer_key="${mockClientKey}"`);
      expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
      expect(header).toContain('oauth_version="1.0"');
      expect(header).toContain("oauth_timestamp=");
      expect(header).toContain("oauth_nonce=");
      expect(header).toContain("oauth_signature=");
      expect(header).toContain('oauth_callback="https%3A%2F%2Fdocs.test%2Fapi%2Fzotero%2Foauth%2Freturn"');
    });

    it("produces deterministic signatures with fixed timestamp and nonce", () => {
      const url = "https://www.zotero.org/oauth/access";
      const header1 = authHeader(url, { oauth_token: "tok1", oauth_verifier: "ver1" }, "tokenSecret1");
      expect(header1).toContain('oauth_token="tok1"');
      expect(header1).toContain('oauth_verifier="ver1"');
    });
  });

  describe("startZoteroOAuth()", () => {
    it("throws when userId is empty", async () => {
      await expect(startZoteroOAuth("", "https://docs.test/callback", "/editor")).rejects.toThrow(
        /userId is required/i,
      );
    });

    it("contacts Zotero /request and returns formatted authorize URL", async () => {
      const userId = "student-alice-42";
      const callbackUrl = "https://docs.test/api/zotero/oauth/return";
      const returnTo = "/editor?doc=sample-doc-1";

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "oauth_token=req-token-xyz&oauth_token_secret=req-secret-abc&oauth_callback_confirmed=true",
      });

      const authorizeUrl = await startZoteroOAuth(userId, callbackUrl, returnTo, mockFetch as unknown as typeof fetch);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("https://www.zotero.org/oauth/request");
      expect(calledInit.method).toBe("POST");
      expect(calledInit.headers.Authorization).toContain("OAuth ");

      // Verify pending state was registered
      const pending = getPendingOAuth("req-token-xyz");
      expect(pending).toBeDefined();
      expect(pending?.userId).toBe(userId);
      expect(pending?.secret).toBe("req-secret-abc");
      expect(pending?.returnTo).toBe(returnTo);

      // Verify authorize URL contents
      expect(authorizeUrl.startsWith("https://www.zotero.org/oauth/authorize?")).toBe(true);
      const parsedUrl = new URL(authorizeUrl);
      expect(parsedUrl.searchParams.get("oauth_token")).toBe("req-token-xyz");
      expect(parsedUrl.searchParams.get("library_access")).toBe("1");
      expect(parsedUrl.searchParams.get("write_access")).toBe("1");
      expect(parsedUrl.searchParams.get("name")).toBe("CiteDocs");
    });

    it("throws error when Zotero /request fails", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      });

      await expect(
        startZoteroOAuth("u-1", "https://docs.test/cb", "/docs", mockFetch as unknown as typeof fetch),
      ).rejects.toThrow(/Zotero request token failed \(503\)/);
    });

    it("throws error when response is missing token or secret", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "unexpected_payload=true",
      });

      await expect(
        startZoteroOAuth("u-1", "https://docs.test/cb", "/docs", mockFetch as unknown as typeof fetch),
      ).rejects.toThrow(/response incomplete/i);
    });
  });

  describe("finishZoteroOAuth()", () => {
    it("throws error if request token is unknown or expired", async () => {
      await expect(
        finishZoteroOAuth("user-1", "non-existent-token", "verifier-1"),
      ).rejects.toThrow(/Unknown or expired OAuth request/);
    });

    it("throws error if user attempting finish is not the user who started the request", async () => {
      // Set up pending state for student Alice
      const mockStartFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "oauth_token=alice-tok&oauth_token_secret=alice-sec&oauth_callback_confirmed=true",
      });

      await startZoteroOAuth("alice-id", "https://docs.test/cb", "/editor", mockStartFetch as unknown as typeof fetch);

      // Attempt finish by Bob
      await expect(
        finishZoteroOAuth("bob-id", "alice-tok", "verifier-123"),
      ).rejects.toThrow(/Unknown or expired OAuth request/);
    });

    it("exchanges token and verifier for permanent API key and userID at /access", async () => {
      const userId = "alice-user-id";
      const returnTo = "/editor?doc=thesis-1";

      // Register pending token
      const mockStartFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "oauth_token=valid-tok&oauth_token_secret=req-sec&oauth_callback_confirmed=true",
      });
      await startZoteroOAuth(userId, "https://docs.test/cb", returnTo, mockStartFetch as unknown as typeof fetch);

      // Mock access token response: oauth_token_secret is the permanent Zotero API key!
      const mockAccessFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          "oauth_token=access-tok-123&oauth_token_secret=PERMANENT_ZOTERO_API_KEY_789&userID=1234567&username=alice_prof",
      });

      const result = await finishZoteroOAuth(
        userId,
        "valid-tok",
        "verifier-999",
        mockAccessFetch as unknown as typeof fetch,
      );

      expect(result.apiKey).toBe("PERMANENT_ZOTERO_API_KEY_789");
      expect(result.zoteroUserId).toBe("1234567");
      expect(result.username).toBe("alice_prof");
      expect(result.returnTo).toBe(returnTo);

      // Token should now be removed from pending state to prevent replay
      expect(getPendingOAuth("valid-tok")).toBeUndefined();
    });

    it("throws error when Zotero /access fails", async () => {
      const userId = "alice-user-id";
      const mockStartFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "oauth_token=tok-fail&oauth_token_secret=sec-fail",
      });
      await startZoteroOAuth(userId, "https://docs.test/cb", "/docs", mockStartFetch as unknown as typeof fetch);

      const mockAccessFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Invalid verifier",
      });

      await expect(
        finishZoteroOAuth(userId, "tok-fail", "bad-verifier", mockAccessFetch as unknown as typeof fetch),
      ).rejects.toThrow(/Zotero access token failed \(401\)/);
    });
  });
});
