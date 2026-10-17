import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/index.js";
import { InMemoryDocumentRepository } from "../src/repositories/inMemoryDocumentRepository.js";
import { InMemoryWopiStorage } from "../src/wopi/storage/inMemoryStorage.js";
import { createZoteroWordDocxBuffer } from "./fixtures/zoteroWordDocx.js";
import JSZip from "jszip";

describe("Style Routes (GET /api/styles & PUT /api/documents/:id/style)", () => {
  let docRepo: InMemoryDocumentRepository;
  let storage: InMemoryWopiStorage;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const userId = "qa-student-style-1";

  beforeEach(async () => {
    docRepo = new InMemoryDocumentRepository();
    storage = new InMemoryWopiStorage();
    app = await buildApp({
      documentRepo: docRepo,
      wopiStorage: storage,
      enableRateLimit: false,
      enableCsrf: false,
    });
  });

  describe("GET /api/styles", () => {
    it("returns pinned popular styles when query is empty", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/styles",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(Array.isArray(data.styles)).toBe(true);
      expect(data.styles.length).toBeGreaterThanOrEqual(8);
      expect(data.styles[0].id).toBe("apa");
      expect(
        data.styles.some(
          (s: { id: string }) => s.id === "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
        ),
      ).toBe(true);
    });

    it("searches styles by query with limit ~50", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/styles?q=ieee",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.styles.length).toBeGreaterThanOrEqual(1);
      expect(data.styles[0].id).toBe("ieee");
    });

    it("searches with Turkish normalization (e.g. tubitak -> TÜBİTAK)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/styles?q=tubitak",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.styles.length).toBeGreaterThanOrEqual(1);
      expect(data.styles[0].id).toBe("turkiye-bilimsel-ve-teknolojik-arastirma-kurumu");
    });

    it("gets a specific style by id via GET /api/styles/:id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/styles/apa",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.style.id).toBe("apa");
      expect(data.style.title).toContain("APA");
    });
  });

  describe("PUT /api/documents/:id/style", () => {
    it("updates document ZOTERO_PREF_1.. custom properties in docProps/custom.xml", async () => {
      const docxBuf = await createZoteroWordDocxBuffer({ styleId: "apa" });
      const fileId = "doc-style-update-1";

      await storage.createFile(fileId, "Tez.docx", userId, docxBuf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await docRepo.create(userId, {
        id: fileId,
        title: "Tez",
        s3ObjectKey: `users/${userId}/documents/${fileId}.docx`,
        fileSize: docxBuf.length,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      // Update style to IEEE
      const updateRes = await app.inject({
        method: "PUT",
        url: `/api/documents/${fileId}/style`,
        headers: { "x-user-id": userId },
        payload: {
          styleId: "ieee",
          locale: "tr-TR",
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const updateData = updateRes.json();
      expect(updateData.ok).toBe(true);
      expect(updateData.styleId).toBe("ieee");
      expect(updateData.locale).toBe("tr-TR");

      // Verify the saved DOCX binary in storage contains the new ZOTERO_PREF
      const updatedFile = await storage.getFile(fileId);
      const zip = await JSZip.loadAsync(updatedFile.buffer);
      const customXml = await zip.file("docProps/custom.xml")?.async("string");
      expect(customXml).toContain("ZOTERO_PREF_1");
      expect(customXml).toContain("ieee");

      // Verify citations endpoint returns the updated style
      const citRes = await app.inject({
        method: "GET",
        url: `/api/documents/${fileId}/citations`,
        headers: { "x-user-id": userId },
      });
      expect(citRes.statusCode).toBe(200);
      expect(citRes.json().style).toBe("ieee");
    });

    it("requires authentication and edit permissions", async () => {
      const docxBuf = await createZoteroWordDocxBuffer({ styleId: "apa" });
      const fileId = "doc-style-auth-1";

      await storage.createFile(fileId, "Tez.docx", userId, docxBuf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await docRepo.create(userId, {
        id: fileId,
        title: "Tez",
        s3ObjectKey: `users/${userId}/documents/${fileId}.docx`,
        fileSize: docxBuf.length,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      // 401 if unauthenticated
      const unauthRes = await app.inject({
        method: "PUT",
        url: `/api/documents/${fileId}/style`,
        payload: { styleId: "ieee" },
      });
      expect(unauthRes.statusCode).toBe(401);

      // 403 if unauthorized user
      const forbiddenRes = await app.inject({
        method: "PUT",
        url: `/api/documents/${fileId}/style`,
        headers: { "x-user-id": "other-attacker-user" },
        payload: { styleId: "ieee" },
      });
      expect(forbiddenRes.statusCode).toBe(403);
    });
  });
});
