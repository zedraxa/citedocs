import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import JSZip from "jszip";
import { buildApp } from "../src/index.js";
import { InMemoryWopiStorage } from "../src/wopi/storage/inMemoryStorage.js";
import { InMemoryDocumentRepository } from "../src/repositories/inMemoryDocumentRepository.js";
import { InMemoryAuthRepository } from "../src/auth/inMemoryAuthRepository.js";
import { AuthService } from "../src/auth/authService.js";
import { ConsoleMailer } from "../src/auth/mailer.js";
import {
  MIME_DOCX,
  MIME_ODT,
  MIME_PDF,
} from "../src/documents/templates.js";

describe("Per-User Cloud Document Storage & Explicit Sharing (apps/server)", () => {
  let app: FastifyInstance;
  let documentRepo: InMemoryDocumentRepository;
  let wopiStorage: InMemoryWopiStorage;
  let authRepo: InMemoryAuthRepository;
  let authService: AuthService;

  const userAlice = {
    id: "user-alice-111",
    email: "alice@university.edu",
    displayName: "Alice Researcher",
  };

  const userBob = {
    id: "user-bob-222",
    email: "bob@university.edu",
    displayName: "Bob Collaborator",
  };

  const userEve = {
    id: "user-eve-333",
    email: "eve@external.edu",
    displayName: "Eve Stranger",
  };

  beforeEach(async () => {
    documentRepo = new InMemoryDocumentRepository();
    wopiStorage = new InMemoryWopiStorage();
    authRepo = new InMemoryAuthRepository();
    authService = new AuthService({
      authRepo,
      mailer: new ConsoleMailer(),
    });

    documentRepo.seedUser(userAlice);
    documentRepo.seedUser(userBob);
    documentRepo.seedUser(userEve);

    app = await buildApp({
      documentRepo,
      wopiStorage,
      authRepo,
      authService,
      secretKey: "test-document-secret-key-12345",
      serverUrl: "http://localhost:3000",
    });

    await app.ready();
  });

  describe("1. Document Creation (Blank .docx & .odt)", () => {
    it("creates a blank .docx document with standard OpenXML structure and stores it in S3/WOPI", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: {
          "x-user-id": userAlice.id,
        },
        payload: {
          title: "Quantum Gravity Manuscript",
          format: "docx",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.document).toBeDefined();
      expect(data.document.title).toBe("Quantum Gravity Manuscript");
      expect(data.document.ownerUserId).toBe(userAlice.id);
      expect(data.document.mimeType).toBe(MIME_DOCX);
      expect(data.document.fileSize).toBeGreaterThan(0);
      expect(data.document.s3ObjectKey).toContain(`users/${userAlice.id}/documents/`);

      // Verify stored file in wopiStorage is a valid zip archive with word/document.xml
      const file = await wopiStorage.getFile(data.document.id);
      expect(file.buffer.length).toBe(data.document.fileSize);
      const zip = await JSZip.loadAsync(file.buffer);
      expect(zip.file("[Content_Types].xml")).not.toBeNull();
      expect(zip.file("word/document.xml")).not.toBeNull();
    });

    it("creates a blank .odt document with OpenDocument structure", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: {
          "x-user-id": userAlice.id,
        },
        payload: {
          title: "Thesis Outline",
          format: "odt",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.document.title).toBe("Thesis Outline");
      expect(data.document.mimeType).toBe(MIME_ODT);

      // Verify stored file in wopiStorage is a valid ODT zip archive with content.xml
      const file = await wopiStorage.getFile(data.document.id);
      const zip = await JSZip.loadAsync(file.buffer);
      expect(zip.file("mimetype")).not.toBeNull();
      expect(zip.file("content.xml")).not.toBeNull();
    });

    it("rejects invalid format with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: {
          "x-user-id": userAlice.id,
        },
        payload: {
          title: "Bad Document",
          format: "pdf", // format must be docx or odt for blank document creation
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("requires authentication to create a document (401)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/documents",
        payload: {
          title: "Anonymous Document",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("2. Strict Per-User Isolation", () => {
    let aliceDocId: string;

    beforeEach(async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { "x-user-id": userAlice.id },
        payload: { title: "Alice Private Research" },
      });
      aliceDocId = JSON.parse(createRes.body).document.id;
    });

    it("User B cannot list User A's documents", async () => {
      // User B lists their documents
      const res = await app.inject({
        method: "GET",
        url: "/api/documents",
        headers: { "x-user-id": userBob.id },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.documents).toHaveLength(0);
      expect(data.documents.some((d: { id: string }) => d.id === aliceDocId)).toBe(false);
    });

    it("User B cannot view or read User A's document (returns 403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/documents/${aliceDocId}`,
        headers: { "x-user-id": userBob.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it("User B cannot rename User A's document (returns 403)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/documents/${aliceDocId}`,
        headers: { "x-user-id": userBob.id },
        payload: { title: "Hacked by Bob" },
      });

      expect(res.statusCode).toBe(403);
    });

    it("User B cannot delete User A's document (returns 403)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/documents/${aliceDocId}`,
        headers: { "x-user-id": userBob.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it("User B cannot download User A's document (returns 403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/documents/${aliceDocId}/download`,
        headers: { "x-user-id": userBob.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it("User B cannot obtain a Collabora session for User A's document (returns 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/documents/${aliceDocId}/collabora-session`,
        headers: { "x-user-id": userBob.id },
        payload: { action: "edit" },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for non-existent document ID", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/documents/doc-does-not-exist-999",
        headers: { "x-user-id": userAlice.id },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("3. Explicit Sharing Roles & WOPI Permission Mapping", () => {
    let aliceDocId: string;

    beforeEach(async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { "x-user-id": userAlice.id },
        payload: { title: "Collaborative Study on Astrophysics" },
      });
      aliceDocId = JSON.parse(createRes.body).document.id;
    });

    it("allows owner to share document with a user as viewer (read-only)", async () => {
      const shareRes = await app.inject({
        method: "POST",
        url: `/api/documents/${aliceDocId}/shares`,
        headers: { "x-user-id": userAlice.id },
        payload: {
          email: userBob.email,
          role: "viewer",
        },
      });

      expect(shareRes.statusCode).toBe(201);
      const shareData = JSON.parse(shareRes.body);
      expect(shareData.share.role).toBe("viewer");
      expect(shareData.share.email).toBe(userBob.email);

      // Bob now sees document in /api/documents/shared-with-me
      const bobSharedRes = await app.inject({
        method: "GET",
        url: "/api/documents/shared-with-me",
        headers: { "x-user-id": userBob.id },
      });
      expect(bobSharedRes.statusCode).toBe(200);
      const bobSharedList = JSON.parse(bobSharedRes.body).documents;
      expect(bobSharedList).toHaveLength(1);
      expect(bobSharedList[0].document.id).toBe(aliceDocId);
      expect(bobSharedList[0].shareRole).toBe("viewer");

      // Bob can read document details (role: viewer)
      const docRes = await app.inject({
        method: "GET",
        url: `/api/documents/${aliceDocId}`,
        headers: { "x-user-id": userBob.id },
      });
      expect(docRes.statusCode).toBe(200);
      expect(JSON.parse(docRes.body).role).toBe("viewer");

      // Bob can download the document
      const downloadRes = await app.inject({
        method: "GET",
        url: `/api/documents/${aliceDocId}/download`,
        headers: { "x-user-id": userBob.id },
      });
      expect(downloadRes.statusCode).toBe(200);
      expect(downloadRes.headers["content-type"]).toBe(MIME_DOCX);

      // Bob requests Collabora session: gets token with canWrite = false
      const sessionRes = await app.inject({
        method: "POST",
        url: `/api/documents/${aliceDocId}/collabora-session`,
        headers: { "x-user-id": userBob.id },
        payload: { action: "edit" }, // Even if Bob asks for edit, viewer role overrides to read-only!
      });
      expect(sessionRes.statusCode).toBe(200);
      const sessionData = JSON.parse(sessionRes.body);
      expect(sessionData.accessToken).toBeDefined();

      // CheckFileInfo returns UserCanWrite = false for viewer
      const checkRes = await app.inject({
        method: "GET",
        url: `/wopi/files/${aliceDocId}?access_token=${sessionData.accessToken}`,
      });
      expect(checkRes.statusCode).toBe(200);
      const checkInfo = JSON.parse(checkRes.body);
      expect(checkInfo.UserCanWrite).toBe(false);
      expect(checkInfo.UserId).toBe(userBob.id);
      expect(checkInfo.OwnerId).toBe(userAlice.id);

      // PutFile attempts by viewer are rejected with 403
      const putRes = await app.inject({
        method: "POST",
        url: `/wopi/files/${aliceDocId}/contents?access_token=${sessionData.accessToken}`,
        headers: {
          "content-type": "application/octet-stream",
        },
        payload: Buffer.from("Hacked content"),
      });
      expect(putRes.statusCode).toBe(403);

      // Bob cannot rename, delete, or manage shares
      const renameRes = await app.inject({
        method: "PATCH",
        url: `/api/documents/${aliceDocId}`,
        headers: { "x-user-id": userBob.id },
        payload: { title: "Renamed by viewer" },
      });
      expect(renameRes.statusCode).toBe(403);

      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/documents/${aliceDocId}`,
        headers: { "x-user-id": userBob.id },
      });
      expect(deleteRes.statusCode).toBe(403);
    });

    it("allows editor role to write back via WOPI PutFile", async () => {
      // Alice shares with Bob as editor
      await app.inject({
        method: "POST",
        url: `/api/documents/${aliceDocId}/shares`,
        headers: { "x-user-id": userAlice.id },
        payload: {
          email: userBob.email,
          role: "editor",
        },
      });

      // Bob gets session with canWrite = true
      const sessionRes = await app.inject({
        method: "POST",
        url: `/api/documents/${aliceDocId}/collabora-session`,
        headers: { "x-user-id": userBob.id },
        payload: { action: "edit" },
      });
      expect(sessionRes.statusCode).toBe(200);
      const sessionData = JSON.parse(sessionRes.body);

      // CheckFileInfo verifies UserCanWrite = true
      const checkRes = await app.inject({
        method: "GET",
        url: `/wopi/files/${aliceDocId}?access_token=${sessionData.accessToken}`,
      });
      expect(checkRes.statusCode).toBe(200);
      expect(JSON.parse(checkRes.body).UserCanWrite).toBe(true);

      // PutFile succeeds and updates document size in repository
      const newContent = Buffer.from("New academic paragraph edited by Bob");
      const putRes = await app.inject({
        method: "POST",
        url: `/wopi/files/${aliceDocId}/contents?access_token=${sessionData.accessToken}`,
        headers: {
          "content-type": "application/octet-stream",
        },
        payload: newContent,
      });
      expect(putRes.statusCode).toBe(200);

      const updatedDoc = await documentRepo.getById(userAlice.id, aliceDocId);
      expect(updatedDoc?.fileSize).toBe(newContent.length);
    });

    it("supports email invitations for users not yet registered", async () => {
      const inviteEmail = "future.student@mit.edu";

      // Alice shares with an unregistered email
      const shareRes = await app.inject({
        method: "POST",
        url: `/api/documents/${aliceDocId}/shares`,
        headers: { "x-user-id": userAlice.id },
        payload: {
          email: inviteEmail,
          role: "viewer",
        },
      });
      expect(shareRes.statusCode).toBe(201);

      // When that student registers or signs in with that email:
      const sharedList = await documentRepo.listSharedWith("new-mit-user", inviteEmail);
      expect(sharedList).toHaveLength(1);
      expect(sharedList[0].document.id).toBe(aliceDocId);
      expect(sharedList[0].shareRole).toBe("viewer");
    });

    it("allows owner to list and remove share grants", async () => {
      const shareRes = await app.inject({
        method: "POST",
        url: `/api/documents/${aliceDocId}/shares`,
        headers: { "x-user-id": userAlice.id },
        payload: { email: userBob.email, role: "viewer" },
      });
      const shareId = JSON.parse(shareRes.body).share.id;

      // Alice lists shares
      const listSharesRes = await app.inject({
        method: "GET",
        url: `/api/documents/${aliceDocId}/shares`,
        headers: { "x-user-id": userAlice.id },
      });
      expect(listSharesRes.statusCode).toBe(200);
      expect(JSON.parse(listSharesRes.body).shares).toHaveLength(1);

      // Alice unshares Bob
      const deleteShareRes = await app.inject({
        method: "DELETE",
        url: `/api/documents/${aliceDocId}/shares/${shareId}`,
        headers: { "x-user-id": userAlice.id },
      });
      expect(deleteShareRes.statusCode).toBe(200);

      // Bob immediately loses access
      const bobCheckRes = await app.inject({
        method: "GET",
        url: `/api/documents/${aliceDocId}`,
        headers: { "x-user-id": userBob.id },
      });
      expect(bobCheckRes.statusCode).toBe(403);
    });
  });

  describe("4. Storage Quota Accounting (5 GB Default)", () => {
    it("reports current user quota usage", async () => {
      // Create 2 documents for Alice
      await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { "x-user-id": userAlice.id },
        payload: { title: "Doc 1" },
      });
      await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { "x-user-id": userAlice.id },
        payload: { title: "Doc 2" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/documents/quota",
        headers: { "x-user-id": userAlice.id },
      });

      expect(res.statusCode).toBe(200);
      const quota = JSON.parse(res.body);
      expect(quota.total).toBe(5 * 1024 * 1024 * 1024); // 5 GB
      expect(quota.used).toBeGreaterThan(0);
      expect(quota.remaining).toBe(quota.total - quota.used);
    });

    it("rejects document upload or creation when quota would be exceeded", async () => {
      // Set quota limit to 500 bytes for test
      process.env.STORAGE_QUOTA_BYTES = "500";

      try {
        const res = await app.inject({
          method: "POST",
          url: "/api/documents",
          headers: { "x-user-id": userAlice.id },
          payload: { title: "Exceeding Doc" },
        });

        // Blank docx is ~1.5 KB, which exceeds 500 bytes
        expect(res.statusCode).toBe(413);
        const err = JSON.parse(res.body);
        expect(err.error).toBe("QuotaExceeded");
      } finally {
        delete process.env.STORAGE_QUOTA_BYTES;
      }
    });

    it("soft-deleted documents are deducted from storage quota", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { "x-user-id": userAlice.id },
        payload: { title: "Temporary Doc" },
      });
      const docId = JSON.parse(createRes.body).document.id;

      const usageBefore = await documentRepo.getStorageUsage(userAlice.id);
      expect(usageBefore).toBeGreaterThan(0);

      // Alice deletes the document
      await app.inject({
        method: "DELETE",
        url: `/api/documents/${docId}`,
        headers: { "x-user-id": userAlice.id },
      });

      const usageAfter = await documentRepo.getStorageUsage(userAlice.id);
      expect(usageAfter).toBe(0);
    });
  });

  describe("5. Upload Validation (.docx, .odt, .pdf)", () => {
    it("uploads a valid .docx file", async () => {
      const docxBuffer = Buffer.from("fake-docx-content-bytes");
      const res = await app.inject({
        method: "POST",
        url: "/api/documents/upload?filename=Chapter1.docx",
        headers: {
          "x-user-id": userAlice.id,
          "content-type": MIME_DOCX,
        },
        payload: docxBuffer,
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.document.title).toBe("Chapter1");
      expect(data.document.mimeType).toBe(MIME_DOCX);
      expect(data.document.fileSize).toBe(docxBuffer.length);
    });

    it("uploads a valid .pdf file", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 fake pdf payload");
      const res = await app.inject({
        method: "POST",
        url: "/api/documents/upload?filename=ResearchPaper.pdf",
        headers: {
          "x-user-id": userAlice.id,
          "content-type": MIME_PDF,
        },
        payload: pdfBuffer,
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.document.title).toBe("ResearchPaper");
      expect(data.document.mimeType).toBe(MIME_PDF);
    });

    it("rejects unsupported file extensions (e.g. .exe or .txt) with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/documents/upload?filename=malicious.exe",
        headers: {
          "x-user-id": userAlice.id,
          "content-type": "application/octet-stream",
        },
        payload: Buffer.from("MZ malicious exe"),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe("UnsupportedFileType");
    });

    it("rejects uploads exceeding maximum size with 413", async () => {
      process.env.MAX_UPLOAD_SIZE_BYTES = "1024"; // 1 KB max for test

      try {
        const largePayload = Buffer.alloc(2048, 1);
        const res = await app.inject({
          method: "POST",
          url: "/api/documents/upload?filename=HugeThesis.docx",
          headers: {
            "x-user-id": userAlice.id,
            "content-type": MIME_DOCX,
          },
          payload: largePayload,
        });

        expect(res.statusCode).toBe(413);
        expect(JSON.parse(res.body).error).toBe("FileTooLarge");
      } finally {
        delete process.env.MAX_UPLOAD_SIZE_BYTES;
      }
    });

    it("rejects empty uploads with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/documents/upload?filename=Empty.docx",
        headers: {
          "x-user-id": userAlice.id,
          "content-type": MIME_DOCX,
        },
        payload: Buffer.alloc(0),
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("6. Renaming and Soft Delete", () => {
    it("renames document when owner requests it", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { "x-user-id": userAlice.id },
        payload: { title: "Old Title" },
      });
      const docId = JSON.parse(createRes.body).document.id;

      const renameRes = await app.inject({
        method: "PATCH",
        url: `/api/documents/${docId}`,
        headers: { "x-user-id": userAlice.id },
        payload: { title: "New Academic Title" },
      });

      expect(renameRes.statusCode).toBe(200);
      expect(JSON.parse(renameRes.body).document.title).toBe("New Academic Title");
    });

    it("soft-deleted document is no longer listed or accessible", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { "x-user-id": userAlice.id },
        payload: { title: "To be deleted" },
      });
      const docId = JSON.parse(createRes.body).document.id;

      // Soft delete
      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/documents/${docId}`,
        headers: { "x-user-id": userAlice.id },
      });
      expect(delRes.statusCode).toBe(200);

      // GET by ID returns 404
      const getRes = await app.inject({
        method: "GET",
        url: `/api/documents/${docId}`,
        headers: { "x-user-id": userAlice.id },
      });
      expect(getRes.statusCode).toBe(404);

      // Does not appear in my documents list
      const listRes = await app.inject({
        method: "GET",
        url: "/api/documents",
        headers: { "x-user-id": userAlice.id },
      });
      const docs = JSON.parse(listRes.body).documents;
      expect(docs.some((d: { id: string }) => d.id === docId)).toBe(false);
    });
  });
});
