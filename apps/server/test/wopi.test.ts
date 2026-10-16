import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import { InMemoryWopiStorage } from "../src/wopi/storage/inMemoryStorage.js";
import { WopiLockManager } from "../src/wopi/lockManager.js";
import { createWopiToken } from "../src/wopi/token.js";
import { CollaboraDiscoveryService } from "../src/wopi/discovery.js";

describe("WOPI Host Endpoints", () => {
  let app: FastifyInstance;
  let storage: InMemoryWopiStorage;
  let lockManager: WopiLockManager;
  let discoveryService: CollaboraDiscoveryService;
  const secretKey = "test-wopi-secret-key-1234567890";
  const fileId = "doc-test-123";
  const initialContent = Buffer.from("Hello CiteDocs Collabora WOPI World");

  beforeEach(async () => {
    storage = new InMemoryWopiStorage();
    lockManager = new WopiLockManager();
    discoveryService = new CollaboraDiscoveryService({
      actionUrlOverride: "http://localhost:9980/browser/dist/cool.html?",
    });

    await storage.createFile(fileId, "test-doc.docx", "user-student-1", initialContent);

    app = await buildApp({
      wopiStorage: storage,
      lockManager,
      discoveryService,
      secretKey,
      serverUrl: "http://localhost:3000",
    });
    await app.ready();
  });

  describe("Authentication & Token Validation", () => {
    it("rejects requests missing access_token with 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/wopi/files/${fileId}`,
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body)).toEqual({ error: "Missing access_token query parameter" });
    });

    it("rejects requests with invalid / tampered token with 401", async () => {
      const { token } = createWopiToken({ fileId, userId: "user-1" }, secretKey);
      const tamperedToken = `${token}tampered`;

      const res = await app.inject({
        method: "GET",
        url: `/wopi/files/${fileId}?access_token=${tamperedToken}`,
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toMatch(/Invalid token signature|signature/i);
    });

    it("rejects token issued for a different fileId with 401", async () => {
      const { token } = createWopiToken({ fileId: "doc-another-999", userId: "user-1" }, secretKey);

      const res = await app.inject({
        method: "GET",
        url: `/wopi/files/${fileId}?access_token=${token}`,
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body)).toEqual({ error: "Token not authorized for this file" });
    });

    it("rejects expired token with 401", async () => {
      const { token } = createWopiToken(
        { fileId, userId: "user-1", ttlMs: -1000 }, // Expired 1 second ago
        secretKey,
      );

      const res = await app.inject({
        method: "GET",
        url: `/wopi/files/${fileId}?access_token=${token}`,
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toMatch(/expired/i);
    });
  });

  describe("GET /wopi/files/:id (CheckFileInfo)", () => {
    it("returns 200 with full WOPI CheckFileInfo properties", async () => {
      const { token } = createWopiToken(
        { fileId, userId: "student-42", userName: "Yusuf Kavak", canWrite: true },
        secretKey,
      );

      const res = await app.inject({
        method: "GET",
        url: `/wopi/files/${fileId}?access_token=${token}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.BaseFileName).toBe("test-doc.docx");
      expect(body.OwnerId).toBe("user-student-1");
      expect(body.Size).toBe(initialContent.length);
      expect(body.UserId).toBe("student-42");
      expect(body.UserFriendlyName).toBe("Yusuf Kavak");
      expect(body.UserCanWrite).toBe(true);
      expect(body.SupportsLocks).toBe(true);
      expect(body.SupportsGetLock).toBe(true);
      expect(body.SupportsExtendedLockLength).toBe(true);
      expect(body.SupportsUpdate).toBe(true);
      expect(body.BreadcrumbBrandName).toBe("CiteDocs");
      expect(typeof body.Version).toBe("string");
      expect(body.LastModifiedTime).toBeDefined();
    });

    it("reflects UserCanWrite: false when token has canWrite = false", async () => {
      const { token } = createWopiToken(
        { fileId, userId: "reviewer-1", canWrite: false },
        secretKey,
      );

      const res = await app.inject({
        method: "GET",
        url: `/wopi/files/${fileId}?access_token=${token}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.UserCanWrite).toBe(false);
    });

    it("returns 404 when file does not exist", async () => {
      const nonExistentId = "doc-not-found";
      const { token } = createWopiToken({ fileId: nonExistentId, userId: "user-1" }, secretKey);

      const res = await app.inject({
        method: "GET",
        url: `/wopi/files/${nonExistentId}?access_token=${token}`,
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: "File not found" });
    });
  });

  describe("GET /wopi/files/:id/contents (GetFile)", () => {
    it("returns 200 with raw file buffer and headers", async () => {
      const { token } = createWopiToken({ fileId, userId: "user-1" }, secretKey);

      const res = await app.inject({
        method: "GET",
        url: `/wopi/files/${fileId}/contents?access_token=${token}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/");
      expect(res.headers["x-wopi-itemversion"]).toBeDefined();
      expect(res.rawPayload.equals(initialContent)).toBe(true);
    });

    it("returns 404 for non-existent file", async () => {
      const nonExistentId = "doc-nonexistent-99";
      const { token } = createWopiToken({ fileId: nonExistentId, userId: "user-1" }, secretKey);

      const res = await app.inject({
        method: "GET",
        url: `/wopi/files/${nonExistentId}/contents?access_token=${token}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /wopi/files/:id (Lock Operations)", () => {
    let token: string;

    beforeEach(() => {
      const t = createWopiToken({ fileId, userId: "user-editor" }, secretKey);
      token = t.token;
    });

    describe("LOCK operation", () => {
      it("locks an unlocked file and returns 200 with X-WOPI-ItemVersion", async () => {
        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "LOCK",
            "X-WOPI-Lock": "lock-token-123",
          },
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["x-wopi-itemversion"]).toBeDefined();
        expect(lockManager.getLock(fileId)).toBe("lock-token-123");
      });

      it("refreshes existing lock if same lock token is provided", async () => {
        lockManager.setLock(fileId, "lock-token-123");

        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "LOCK",
            "X-WOPI-Lock": "lock-token-123",
          },
        });

        expect(res.statusCode).toBe(200);
        expect(lockManager.getLock(fileId)).toBe("lock-token-123");
      });

      it("returns 409 Conflict with X-WOPI-Lock on lock mismatch", async () => {
        lockManager.setLock(fileId, "original-lock-holder");

        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "LOCK",
            "X-WOPI-Lock": "conflicting-new-lock",
          },
        });

        expect(res.statusCode).toBe(409);
        expect(res.headers["x-wopi-lock"]).toBe("original-lock-holder");
        expect(lockManager.getLock(fileId)).toBe("original-lock-holder");
      });

      it("relocks when X-WOPI-OldLock matches current lock", async () => {
        lockManager.setLock(fileId, "old-lock-1");

        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "LOCK",
            "X-WOPI-OldLock": "old-lock-1",
            "X-WOPI-Lock": "new-lock-2",
          },
        });

        expect(res.statusCode).toBe(200);
        expect(lockManager.getLock(fileId)).toBe("new-lock-2");
      });

      it("returns 409 when X-WOPI-OldLock does not match current lock", async () => {
        lockManager.setLock(fileId, "actual-lock");

        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "LOCK",
            "X-WOPI-OldLock": "wrong-old-lock",
            "X-WOPI-Lock": "new-lock-2",
          },
        });

        expect(res.statusCode).toBe(409);
        expect(res.headers["x-wopi-lock"]).toBe("actual-lock");
      });

      it("returns 400 when X-WOPI-Lock header is missing", async () => {
        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "LOCK",
          },
        });

        expect(res.statusCode).toBe(400);
      });
    });

    describe("UNLOCK operation", () => {
      it("unlocks a locked file when lock matches", async () => {
        lockManager.setLock(fileId, "my-lock-id");

        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "UNLOCK",
            "X-WOPI-Lock": "my-lock-id",
          },
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["x-wopi-itemversion"]).toBeDefined();
        expect(lockManager.getLock(fileId)).toBeNull();
      });

      it("returns 409 Conflict with X-WOPI-Lock on unlock mismatch", async () => {
        lockManager.setLock(fileId, "existing-lock");

        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "UNLOCK",
            "X-WOPI-Lock": "wrong-lock",
          },
        });

        expect(res.statusCode).toBe(409);
        expect(res.headers["x-wopi-lock"]).toBe("existing-lock");
        expect(lockManager.getLock(fileId)).toBe("existing-lock");
      });

      it("returns 409 Conflict with empty X-WOPI-Lock when unlocking an unlocked file", async () => {
        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "UNLOCK",
            "X-WOPI-Lock": "any-lock",
          },
        });

        expect(res.statusCode).toBe(409);
        expect(res.headers["x-wopi-lock"]).toBe("");
      });
    });

    describe("REFRESH_LOCK operation", () => {
      it("refreshes existing lock when matching", async () => {
        lockManager.setLock(fileId, "active-lock");

        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "REFRESH_LOCK",
            "X-WOPI-Lock": "active-lock",
          },
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["x-wopi-itemversion"]).toBeDefined();
        expect(lockManager.getLock(fileId)).toBe("active-lock");
      });

      it("returns 409 Conflict when refresh lock mismatches", async () => {
        lockManager.setLock(fileId, "active-lock");

        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "REFRESH_LOCK",
            "X-WOPI-Lock": "mismatched-lock",
          },
        });

        expect(res.statusCode).toBe(409);
        expect(res.headers["x-wopi-lock"]).toBe("active-lock");
      });
    });

    describe("GET_LOCK operation", () => {
      it("returns 200 with X-WOPI-Lock containing current lock", async () => {
        lockManager.setLock(fileId, "current-active-lock");

        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "GET_LOCK",
          },
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["x-wopi-lock"]).toBe("current-active-lock");
      });

      it("returns 200 with empty X-WOPI-Lock when file is unlocked", async () => {
        const res = await app.inject({
          method: "POST",
          url: `/wopi/files/${fileId}?access_token=${token}`,
          headers: {
            "X-WOPI-Override": "GET_LOCK",
          },
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["x-wopi-lock"]).toBe("");
      });
    });

    it("returns 501 Not Implemented for unknown X-WOPI-Override", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/wopi/files/${fileId}?access_token=${token}`,
        headers: {
          "X-WOPI-Override": "UNKNOWN_OP",
        },
      });

      expect(res.statusCode).toBe(501);
    });
  });

  describe("POST /wopi/files/:id/contents (PutFile)", () => {
    let token: string;
    const newContent = Buffer.from("Updated Document Content by Collabora Online");

    beforeEach(() => {
      const t = createWopiToken({ fileId, userId: "editor-user", canWrite: true }, secretKey);
      token = t.token;
    });

    it("successfully saves file when lock matches and returns X-WOPI-ItemVersion", async () => {
      lockManager.setLock(fileId, "valid-lock-token");

      const res = await app.inject({
        method: "POST",
        url: `/wopi/files/${fileId}/contents?access_token=${token}`,
        headers: {
          "X-WOPI-Lock": "valid-lock-token",
          "Content-Type": "application/octet-stream",
        },
        payload: newContent,
      });

      expect(res.statusCode).toBe(200);
      const newVersion = res.headers["x-wopi-itemversion"];
      expect(newVersion).toBeDefined();

      const body = JSON.parse(res.body);
      expect(body.version).toBe(newVersion);
      expect(body.size).toBe(newContent.length);

      // Verify file was actually updated in storage
      const stored = await storage.getFile(fileId);
      expect(stored.buffer.equals(newContent)).toBe(true);
      expect(stored.metadata.size).toBe(newContent.length);
      expect(stored.metadata.version).toBe(newVersion);
    });

    it("rejects PutFile with 409 Conflict and X-WOPI-Lock when lock mismatches", async () => {
      lockManager.setLock(fileId, "lock-held-by-collabora");

      const res = await app.inject({
        method: "POST",
        url: `/wopi/files/${fileId}/contents?access_token=${token}`,
        headers: {
          "X-WOPI-Lock": "wrong-lock-submitted",
          "Content-Type": "application/octet-stream",
        },
        payload: newContent,
      });

      expect(res.statusCode).toBe(409);
      expect(res.headers["x-wopi-lock"]).toBe("lock-held-by-collabora");

      // Verify content was NOT updated
      const stored = await storage.getFile(fileId);
      expect(stored.buffer.equals(initialContent)).toBe(true);
    });

    it("rejects PutFile with 409 and empty X-WOPI-Lock when file is unlocked but client sent a lock header", async () => {
      // File has no lock in lockManager
      const res = await app.inject({
        method: "POST",
        url: `/wopi/files/${fileId}/contents?access_token=${token}`,
        headers: {
          "X-WOPI-Lock": "unexpected-lock",
          "Content-Type": "application/octet-stream",
        },
        payload: newContent,
      });

      expect(res.statusCode).toBe(409);
      expect(res.headers["x-wopi-lock"]).toBe("");
    });

    it("accepts PutFile on unlocked file when no lock header is sent", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/wopi/files/${fileId}/contents?access_token=${token}`,
        headers: {
          "Content-Type": "application/octet-stream",
        },
        payload: newContent,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["x-wopi-itemversion"]).toBeDefined();
    });

    it("rejects PutFile with 403 when token has canWrite = false", async () => {
      const readOnlyToken = createWopiToken(
        { fileId, userId: "viewer", canWrite: false },
        secretKey,
      ).token;

      const res = await app.inject({
        method: "POST",
        url: `/wopi/files/${fileId}/contents?access_token=${readOnlyToken}`,
        headers: {
          "Content-Type": "application/octet-stream",
        },
        payload: newContent,
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("Collabora Session Issuance (/api/documents/:id/collabora-session)", () => {
    it("issues a signed access token and Collabora editor URL with WOPISrc", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/documents/${fileId}/collabora-session`,
        headers: {
          "X-User-Id": "student-kavak",
        },
        payload: {
          userName: "Yusuf Kavak",
          action: "edit",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      expect(data.actionUrl).toBeDefined();
      expect(data.actionUrl).toContain("WOPISrc=");
      expect(data.actionUrl).toContain(encodeURIComponent(`http://localhost:3000/wopi/files/${fileId}`));
      expect(data.wopiSrc).toBe(`http://localhost:3000/wopi/files/${fileId}`);
      expect(data.accessToken).toBeDefined();
      expect(typeof data.accessTokenTtl).toBe("number");
      expect(data.accessTokenTtl).toBeGreaterThan(Date.now());

      // Verify the generated token works on CheckFileInfo
      const checkRes = await app.inject({
        method: "GET",
        url: `/wopi/files/${fileId}?access_token=${data.accessToken}`,
      });
      expect(checkRes.statusCode).toBe(200);
      const checkData = JSON.parse(checkRes.body);
      expect(checkData.UserId).toBe("student-kavak");
      expect(checkData.UserFriendlyName).toBe("Yusuf Kavak");
      expect(checkData.UserCanWrite).toBe(true);
    });

    it("creates file entry if document does not exist yet", async () => {
      const brandNewDocId = "doc-brand-new-999";
      const res = await app.inject({
        method: "POST",
        url: `/api/documents/${brandNewDocId}/collabora-session`,
        payload: {
          userId: "new-user",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.accessToken).toBeDefined();

      const meta = await storage.getFileInfo(brandNewDocId);
      expect(meta.id).toBe(brandNewDocId);
    });
  });

  describe("Lock Expiration & Manager", () => {
    it("expires locks after ttlMs passes", () => {
      const shortTtlMs = 50; // 50ms for test
      const manager = new WopiLockManager(shortTtlMs);

      manager.setLock("file-x", "temp-lock");
      expect(manager.getLock("file-x")).toBe("temp-lock");

      // Wait or advance time
      const realNow = Date.now;
      try {
        Date.now = () => realNow() + 100; // Fast forward 100ms
        expect(manager.getLock("file-x")).toBeNull();

        // New lock can now be acquired without conflict
        const res = manager.setLock("file-x", "new-lock");
        expect(res.success).toBe(true);
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe("Collabora Discovery Service XML Parsing", () => {
    it("parses discovery XML into action URL mappings", () => {
      const sampleXml = `
        <wopi-discovery>
          <net-zone name="external-http">
            <app name="Word">
              <action name="edit" ext="docx" urlsrc="http://collabora:9980/browser/abc/cool.html?"/>
              <action name="view" ext="docx" urlsrc="http://collabora:9980/browser/abc/cool.html?"/>
            </app>
            <app name="Calc">
              <action name="edit" ext="xlsx" urlsrc="http://collabora:9980/browser/abc/calc.html?"/>
            </app>
          </net-zone>
        </wopi-discovery>
      `;

      const service = new CollaboraDiscoveryService();
      const actions = service.parseDiscoveryXml(sampleXml);

      expect(actions.get("docx:edit")).toBe("http://collabora:9980/browser/abc/cool.html?");
      expect(actions.get("docx:view")).toBe("http://collabora:9980/browser/abc/cool.html?");
      expect(actions.get("xlsx:edit")).toBe("http://collabora:9980/browser/abc/calc.html?");
    });
  });
});
