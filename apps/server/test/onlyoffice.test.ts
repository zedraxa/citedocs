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

  it("configures editorConfig.customization with autosave: true and forcesave: true", async () => {
    const cfg = await config();
    expect(cfg.editorConfig.customization.autosave).toBe(true);
    expect(cfg.editorConfig.customization.forcesave).toBe(true);
  });

  it("keeps key stable during editing session, shares key among concurrent editors, changes key after save callback updates file, and reopens with new key", async () => {
    // 1. Initial session opening generates session key K1
    const cfg1 = await config("owner");
    const key1 = cfg1.document.key;
    expect(key1).toBeTruthy();

    // 2. Concurrent editor joins before save -> MUST receive same key1 (co-editing)
    const cfgConcurrent = await config("editor");
    expect(cfgConcurrent.document.key).toBe(key1);

    // 3. Status 6 (force-save while editing) occurs and updates the stored file
    fetchFn.mockResolvedValueOnce(new Response("force-saved content"));
    const saveRes = await callback(
      { status: 6, url: "http://onlyoffice/cache/doc.docx" },
      "owner",
    );
    expect(saveRes.json()).toEqual({ error: 0 });
    expect((await storage.getFile("doc")).buffer.toString()).toBe("force-saved content");

    // 4. Reopen after save callback -> MUST receive the new key K2 (!== K1)
    const cfgReopened = await config("owner");
    const key2 = cfgReopened.document.key;
    expect(key2).toBeTruthy();
    expect(key2).not.toBe(key1);

    // 5. Concurrent editors opening after save share the new key K2
    const cfgEditorAfterSave = await config("editor");
    expect(cfgEditorAfterSave.document.key).toBe(key2);

    // 6. Session ends with status 2 (ready for saving / session closed)
    fetchFn.mockResolvedValueOnce(new Response("final content"));
    const closeRes = await callback(
      { status: 2, url: "http://onlyoffice/cache/doc.docx" },
      "owner",
    );
    expect(closeRes.json()).toEqual({ error: 0 });

    // 7. Subsequent session opening starts a new session -> MUST receive key3 (!== key2, !== key1)
    const cfg3 = await config("owner");
    const key3 = cfg3.document.key;
    expect(key3).toBeTruthy();
    expect(key3).not.toBe(key2);
    expect(key3).not.toBe(key1);
  });

  it("deduplicates repeated status 6 saves with identical content without creating duplicate versions", async () => {
    const putFileSpy = vi.spyOn(storage, "putFile");

    // First status 6 save with new content
    fetchFn.mockResolvedValueOnce(new Response("snapshot-alpha"));
    const res1 = await callback(
      { status: 6, url: "http://onlyoffice/cache/snapshot.docx", forcesavetype: 2 },
      "owner",
    );
    expect(res1.json()).toEqual({ error: 0 });
    expect(putFileSpy).toHaveBeenCalledTimes(1);
    const version1 = (await storage.getFileInfo("doc")).version;

    putFileSpy.mockClear();

    // Repeated status 6 save with identical content (e.g. periodic autoAssembly with no edits)
    fetchFn.mockResolvedValueOnce(new Response("snapshot-alpha"));
    const res2 = await callback(
      { status: 6, url: "http://onlyoffice/cache/snapshot.docx", forcesavetype: 2 },
      "owner",
    );
    expect(res2.json()).toEqual({ error: 0 });
    // Storage putFile was not called again; version was not incremented
    expect(putFileSpy).not.toHaveBeenCalled();
    const version2 = (await storage.getFileInfo("doc")).version;
    expect(version2).toBe(version1);

    // Third status 6 save with modified content -> MUST write to storage
    fetchFn.mockResolvedValueOnce(new Response("snapshot-beta"));
    const res3 = await callback(
      { status: 6, url: "http://onlyoffice/cache/snapshot.docx", forcesavetype: 2 },
      "owner",
    );
    expect(res3.json()).toEqual({ error: 0 });
    expect(putFileSpy).toHaveBeenCalledTimes(1);
    const version3 = (await storage.getFileInfo("doc")).version;
    expect(version3).not.toBe(version1);
  });

  it("accounts for storage quota by replacement and rejects saves exceeding user quota", async () => {
    // Stub user quota to 1000 bytes
    vi.stubEnv("STORAGE_QUOTA_BYTES", "1000");

    // Existing doc size is 600 bytes
    const initialBuf = Buffer.alloc(600, "a");
    await storage.putFile("doc", initialBuf);
    await repo.update("owner", "doc", { fileSize: 600 });
    expect(await repo.getStorageUsage("owner")).toBe(600);

    // A save with 700 bytes should SUCCEED because replacement (1000 - 600 + 600 = 1000 >= 700) is used.
    // If it was additive (double counted: 600 + 700 = 1300 > 1000), it would fail.
    const incomingBuf = Buffer.alloc(700, "b");
    fetchFn.mockResolvedValueOnce(new Response(incomingBuf));
    const resSuccess = await callback(
      { status: 6, url: "http://onlyoffice/cache/doc.docx" },
      "owner",
    );
    expect(resSuccess.json()).toEqual({ error: 0 });
    expect(await repo.getStorageUsage("owner")).toBe(700);

    // A save with 1200 bytes exceeds total quota of 1000 bytes -> MUST be rejected with error 1
    const oversizedBuf = Buffer.alloc(1200, "c");
    fetchFn.mockResolvedValueOnce(new Response(oversizedBuf));
    const resFail = await callback(
      { status: 6, url: "http://onlyoffice/cache/doc.docx" },
      "owner",
    );
    expect(resFail.json()).toEqual({ error: 1 });
    // Storage content should remain the 700-byte version
    expect((await storage.getFile("doc")).buffer.length).toBe(700);
  });

  it("closes session on status 4 (no changes) allowing next session to receive a new key", async () => {
    const cfg1 = await config("owner");
    const key1 = cfg1.document.key;

    // Status 4: closed without changes
    const res4 = await callback({ status: 4 }, "owner");
    expect(res4.json()).toEqual({ error: 0 });
    expect(fetchFn).not.toHaveBeenCalled();

    // Next session receives a new key
    const cfg2 = await config("owner");
    expect(cfg2.document.key).not.toBe(key1);
  });
});

