import crypto from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  signJwt,
  verifyJwt,
  signLink,
  verifyLink,
  getOnlyofficeSecret,
} from "../src/onlyoffice/jwt.js";
import {
  createOnlyofficeRoutes,
  permissionsForRole,
  ZOTERO_PLUGIN_GUID,
} from "../src/onlyoffice/routes.js";
import { InMemoryDocumentRepository } from "../src/repositories/inMemoryDocumentRepository.js";
import { InMemoryWopiStorage } from "../src/wopi/storage/inMemoryStorage.js";
import { verifyCsrfProtection } from "../src/auth/csrf.js";
import type { AuthService } from "../src/auth/authService.js";

const secret = "onlyoffice-unit-test-secret";
afterEach(() => vi.unstubAllEnvs());

describe("ONLYOFFICE JWT", () => {
  it("signs HS256 and rejects wrong keys, tampering and extra segments", () => {
    const token = signJwt({ key: "doc" }, secret);
    expect(verifyJwt(token, secret)).toEqual({ key: "doc" });
    for (const value of [undefined, "", `${token}.extra`, token.replace(/.$/, "!"), "a.b.c"]) {
      expect(verifyJwt(value, secret)).toBeNull();
    }
    expect(verifyJwt(token, "other")).toBeNull();
  });
  it.each([
    { exp: 0 },
    { exp: "9999999999" },
    { exp: Math.floor(Date.now() / 1000) },
    { nbf: Date.now() },
    null,
    [],
  ])("rejects invalid claims/payload %j", (payload) => {
    expect(verifyJwt(signJwt(payload as object, secret), secret)).toBeNull();
  });
  it("rejects a signed unsupported algorithm", () => {
    const parts = [
      Buffer.from('{"alg":"none"}').toString("base64url"),
      Buffer.from("{}").toString("base64url"),
    ].join(".");
    const token = `${parts}.${crypto.createHmac("sha256", secret).update(parts).digest("base64url")}`;
    expect(verifyJwt(token, secret)).toBeNull();
  });
  it("signs and verifies link parameters with constant-time HMAC", () => {
    const parts = ["doc-456", "user-789"];
    const sig = signLink(parts, secret);
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(10);

    expect(verifyLink(sig, parts, secret)).toBe(true);
    expect(verifyLink(sig, ["doc-456", "user-different"], secret)).toBe(false);
    expect(verifyLink("tampered-signature", parts, secret)).toBe(false);
    expect(verifyLink(undefined, parts, secret)).toBe(false);
  });
  it("resolves default secret in dev/test environment", () => {
    const s = getOnlyofficeSecret();
    expect(s).toBeTruthy();
  });
  it("requires a configured production secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ONLYOFFICE_JWT_SECRET", "");
    expect(() => signJwt({})).toThrow("ONLYOFFICE_JWT_SECRET");
  });
});

describe("ONLYOFFICE routes", () => {
  let app: ReturnType<typeof Fastify>;
  let repo: InMemoryDocumentRepository;
  let storage: InMemoryWopiStorage;
  const fetchFn = vi.fn<typeof fetch>();
  beforeEach(async () => {
    vi.stubEnv("ONLYOFFICE_JWT_SECRET", secret);
    repo = new InMemoryDocumentRepository();
    storage = new InMemoryWopiStorage();
    await repo.create("owner", {
      id: "doc",
      title: "Paper",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await storage.createFile("doc", "Paper.docx", "owner", Buffer.from("original"));
    await repo.share("owner", "doc", "editor", "editor");
    await repo.share("owner", "doc", "viewer", "viewer");
    await repo.share("owner", "doc", "invited@example.org", "editor");
    fetchFn.mockReset().mockImplementation(async () => new Response("edited"));
    app = Fastify();
    await app.register(cookie);
    app.decorate("authService", {
      validateSession: async (token: string) =>
        token === "session"
          ? {
              user: {
                id: "invited",
                email: "invited@example.org",
                displayName: "Session Researcher",
              },
              session: {},
            }
          : null,
    } as unknown as AuthService);
    app.addHook("preHandler", (req, reply) => verifyCsrfProtection(req, reply, { enabled: true }));
    await app.register(
      createOnlyofficeRoutes({
        storage,
        documentRepo: repo,
        fetchFn,
        documentServerInternalUrl: "http://onlyoffice",
        publicAppUrl: "https://docs.example.org",
      }),
    );
  });
  afterEach(async () => {
    await app.close();
  });
  async function config(user = "owner") {
    const res = await app.inject({
      url: "/api/documents/doc/onlyoffice-config",
      headers: { "x-user-id": user },
    });
    expect(res.statusCode).toBe(200);
    return res.json().config;
  }
  async function callback(data: Record<string, unknown>, user = "owner", header = false) {
    const cfg = await config(user);
    const url = new URL(cfg.editorConfig.callbackUrl);
    const payload = { key: cfg.document.key, ...data };
    return app.inject({
      method: "POST",
      url: url.pathname + url.search,
      headers: header ? { authorization: `Bearer ${signJwt({ payload })}` } : {},
      payload: header ? { ...payload, url: "http://evil/unsigned" } : { token: signJwt(payload) },
    });
  }
  it.each(["owner", "editor", "viewer"])("maps %s permissions and signs config", async (role) => {
    const cfg = await config(role);
    const edit = role !== "viewer";
    expect(cfg.document.permissions.edit).toBe(edit);
    expect(cfg.document.permissions.comment).toBe(edit);
    expect(cfg.editorConfig.mode).toBe(edit ? "edit" : "view");
    const { token, ...unsigned } = cfg;
    expect(verifyJwt(token)).toMatchObject(unsigned);
    expect(cfg.editorConfig.plugins.autostart).toEqual([ZOTERO_PLUGIN_GUID]);
    expect(cfg.editorConfig.plugins.pluginsData).toEqual([
      "https://docs.example.org/oo/sdkjs-plugins/zotero/config.json",
    ]);
    expect(cfg.editorConfig.lang).toBe("tr");
    expect(cfg.editorConfig.region).toBe("tr-TR");
    expect(cfg.editorConfig.customization.spellcheck).toBe(true);
    expect(permissionsForRole("unknown").permissions.edit).toBe(false);
  });
  it("always defaults ONLYOFFICE editorConfig to Turkish (lang tr, region tr-TR, spellcheck true) regardless of Accept-Language", async () => {
    const res = await app.inject({
      url: "/api/documents/doc/onlyoffice-config",
      headers: { "x-user-id": "owner", "accept-language": "en-US,en;q=0.9" },
    });
    expect(res.statusCode).toBe(200);
    const cfg = res.json().config;
    expect(cfg.editorConfig.lang).toBe("tr");
    expect(cfg.editorConfig.region).toBe("tr-TR");
    expect(cfg.editorConfig.customization.spellcheck).toBe(true);
  });
  it("uses session identity and email shares, never an impersonating header in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await app.inject({
      url: "/api/documents/doc/onlyoffice-config",
      headers: { authorization: "Bearer session", "x-user-id": "owner" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.editorConfig.user).toEqual({
      id: "invited",
      name: "Session Researcher",
    });
    expect(res.json().role).toBe("editor");
    expect(
      (
        await app.inject({
          url: "/api/documents/doc/onlyoffice-config",
          headers: { "x-user-id": "owner" },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("denies strangers, missing documents and missing binaries", async () => {
    expect(
      (
        await app.inject({
          url: "/api/documents/doc/onlyoffice-config",
          headers: { "x-user-id": "stranger" },
        })
      ).statusCode,
    ).toBe(403);
    await repo.create("owner", { id: "missing", title: "Missing" });
    for (const id of ["missing", "absent"]) {
      expect(
        (
          await app.inject({
            url: `/api/documents/${id}/onlyoffice-config`,
            headers: { "x-user-id": "owner" },
          })
        ).statusCode,
      ).toBe(404);
    }
  });
  it.each([2, 6])("saves status %s without browser CSRF and updates metadata", async (status) => {
    const res = await callback(
      { status, url: "http://onlyoffice/cache/edited.docx" },
      "editor",
      status === 6,
    );
    expect(res.json()).toEqual({ error: 0 });
    expect((await storage.getFile("doc")).buffer.toString()).toBe("edited");
    expect((await repo.findRawById("doc"))?.fileSize).toBe(6);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://onlyoffice/cache/edited.docx",
      expect.objectContaining({ redirect: "error" }),
    );
  });
  it.each([1, 3, 4, 7])("acknowledges non-save status %s without writes", async (status) => {
    expect((await callback({ status })).json()).toEqual({ error: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("rejects invalid JWTs, unsigned callbacks and wrong document keys", async () => {
    const cfg = await config();
    const url = new URL(cfg.editorConfig.callbackUrl);
    for (const payload of [
      { status: 2 },
      { token: "bad" },
      { token: signJwt({ status: 2, key: "other", url: "http://onlyoffice/file" }) },
    ]) {
      expect(
        (await app.inject({ method: "POST", url: url.pathname + url.search, payload })).statusCode,
      ).toBe(401);
    }
    url.searchParams.set("u", "viewer");
    expect(
      (await app.inject({ method: "POST", url: url.pathname + url.search, payload: {} }))
        .statusCode,
    ).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("denies viewer saves and revoked shares", async () => {
    expect(
      (await callback({ status: 2, url: "http://onlyoffice/file" }, "viewer")).statusCode,
    ).toBe(403);
    const cfg = await config("editor");
    await repo.unshare("owner", "doc", "editor");
    const url = new URL(cfg.editorConfig.callbackUrl);
    const res = await app.inject({
      method: "POST",
      url: url.pathname + url.search,
      payload: {
        token: signJwt({ status: 2, key: cfg.document.key, url: "http://onlyoffice/file" }),
      },
    });
    expect(res.json().error).toBe(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    "http://evil/file",
    "file:///etc/passwd",
    "http://user:pass@onlyoffice/file",
  ])("rejects missing/untrusted download URL %s", async (url) => {
    expect((await callback({ status: 2, url })).json()).toEqual({ error: 1 });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("maps only the configured public proxy to the internal Document Server", async () => {
    expect(
      (
        await callback({ status: 2, url: "https://docs.example.org/oo/cache/file?token=test" })
      ).json(),
    ).toEqual({ error: 0 });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://onlyoffice/cache/file?token=test",
      expect.anything(),
    );
  });
  it("reports fetch and storage failures as callback errors", async () => {
    fetchFn.mockRejectedValueOnce(new Error("network"));
    expect((await callback({ status: 2, url: "http://onlyoffice/file" })).json()).toEqual({
      error: 1,
    });
    fetchFn.mockResolvedValueOnce(new Response("failed", { status: 500 }));
    expect((await callback({ status: 2, url: "http://onlyoffice/file" })).json()).toEqual({
      error: 1,
    });
    vi.spyOn(storage, "putFile").mockRejectedValueOnce(new Error("S3 unavailable"));
    expect((await callback({ status: 6, url: "http://onlyoffice/file" })).json()).toEqual({
      error: 1,
    });
    expect((await storage.getFile("doc")).buffer.toString()).toBe("original");
  });
  it("requires signed, unexpired links and a DS JWT to download", async () => {
    const cfg = await config();
    const url = new URL(cfg.document.url);
    expect((await app.inject({ url: url.pathname + url.search })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: url.pathname + url.search,
          headers: { authorization: `Bearer ${signJwt({ payload: {} })}` },
        })
      ).body,
    ).toBe("original");
    url.searchParams.set("expires", "1");
    url.searchParams.set("s", signLink(["file", "doc", "1"]));
    expect(
      (
        await app.inject({
          url: url.pathname + url.search,
          headers: { authorization: `Bearer ${signJwt({})}` },
        })
      ).statusCode,
    ).toBe(401);
  });
});
