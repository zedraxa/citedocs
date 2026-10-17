import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import type { FastifyInstance } from "fastify";
import JSZip from "jszip";
import { buildApp } from "../src/index.js";
import { InMemoryWopiStorage } from "../src/wopi/storage/inMemoryStorage.js";
import { InMemoryDocumentRepository } from "../src/repositories/inMemoryDocumentRepository.js";
import { InMemoryAuthRepository } from "../src/auth/inMemoryAuthRepository.js";
import { AuthService } from "../src/auth/authService.js";
import { ConsoleMailer } from "../src/auth/mailer.js";
import { extractZoteroState } from "../src/documents/zoteroFields.js";
import { signJwt } from "../src/onlyoffice/jwt.js";
import {
  createZoteroWordDocxBuffer,
  createZoteroLibreOfficeOdtBuffer as _createZoteroLibreOfficeOdtBuffer,
} from "./fixtures/zoteroWordDocx.js";

const TEST_SECRET = "test-onlyoffice-jwt-secret-xyz";

describe("Zotero Compatibility & Round-Trip Verification (apps/server)", () => {
  let app: FastifyInstance;
  let documentRepo: InMemoryDocumentRepository;
  let wopiStorage: InMemoryWopiStorage;
  let authRepo: InMemoryAuthRepository;
  let authService: AuthService;

  const testUser = {
    id: "user-zotero-student-01",
    email: "student@universite.edu.tr",
    displayName: "Zotero Araştırmacı Öğrenci",
  };

  let mockFetch: Mock;

  beforeEach(async () => {
    vi.stubEnv("ONLYOFFICE_JWT_SECRET", TEST_SECRET);
    vi.stubEnv("PUBLIC_URL", "http://localhost:5173");

    documentRepo = new InMemoryDocumentRepository();
    wopiStorage = new InMemoryWopiStorage();
    authRepo = new InMemoryAuthRepository();
    authService = new AuthService({
      authRepo,
      mailer: new ConsoleMailer(),
    });

    documentRepo.seedUser(testUser);
    mockFetch = vi.fn();

    app = await buildApp({
      documentRepo,
      wopiStorage,
      authRepo,
      authService,
      secretKey: "test-secret-key-citedocs-server-12345",
      serverUrl: "http://localhost:3000",
      onlyofficeFetchFn: mockFetch,
    });

    await app.ready();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("1. Fixture & State Extraction Verification (extractZoteroState)", () => {
    it("extracts Word Zotero complex field codes (citations, bibliography, style prefs) from DOCX", async () => {
      const buffer = await createZoteroWordDocxBuffer({
        citationId: "cit-test-extraction-1",
        itemId: "item-extraction-101",
        authorFamily: "Öztürk",
        authorGiven: "Mehmet",
        year: 2024,
        title: "Derin Öğrenme ile Doğal Dil İşleme",
        formattedCitation: "(Öztürk, 2024)",
        styleId: "ieee",
      });

      const state = await extractZoteroState(buffer);

      // Verify citations
      expect(state.citations).toHaveLength(1);
      const cit = state.citations[0];
      expect(cit.code).toContain("ADDIN ZOTERO_ITEM CSL_CITATION");
      expect(cit.result).toBe("(Öztürk, 2024)");

      const payload = cit.payload as {
        citationID?: string;
        citationItems?: Array<{ id?: string; itemData?: { title?: string } }>;
      };
      expect(payload).toBeDefined();
      expect(payload.citationID).toBe("cit-test-extraction-1");
      expect(payload.citationItems).toHaveLength(1);
      expect(payload.citationItems[0].id).toBe("item-extraction-101");
      expect(payload.citationItems[0].itemData.title).toBe("Derin Öğrenme ile Doğal Dil İşleme");

      // Verify bibliography
      expect(state.bibliography).toBeDefined();
      expect(state.bibliography?.code).toContain("ADDIN ZOTERO_BIBL");
      expect(state.bibliography?.result).toContain("Öztürk, M. (2024)");

      // Verify custom docProps style
      expect(state.prefs).toBeDefined();
      expect(state.prefs).toContain("https://www.zotero.org/styles/ieee");
      expect(state.style).toBe("ieee");
    });

    it.todo(
      "ZC-02: extractZoteroState does not inspect content.xml for LibreOffice Zotero reference marks in ODT files",
    );
  });

  describe("2. Document Upload & Download Storage Round-Trip", () => {
    it("uploads a DOCX with Zotero Word field codes and preserves exact binary integrity upon download", async () => {
      const fixtureBuffer = await createZoteroWordDocxBuffer({
        citationId: "cit-upload-test-1",
        authorFamily: "Demir",
        year: 2023,
      });

      // 1. Upload via multipart POST /api/documents/upload
      const boundary = "----WebKitFormBoundary" + crypto.randomBytes(16).toString("hex");
      const filename = "Tez_Taslak_Word_Zotero.docx";

      const header = Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const multipartBody = Buffer.concat([header, fixtureBuffer, footer]);

      const uploadRes = await app.inject({
        method: "POST",
        url: "/api/documents/upload",
        headers: {
          "x-user-id": testUser.id,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: multipartBody,
      });

      expect(uploadRes.statusCode).toBe(201);
      const uploadJson = JSON.parse(uploadRes.body);
      const docId = uploadJson.document.id;
      expect(docId).toBeDefined();
      expect(uploadJson.document.title).toBe("Tez_Taslak_Word_Zotero");
      expect(uploadJson.document.fileSize).toBe(fixtureBuffer.length);

      // 2. Query GET /api/documents/:id/citations
      const citationsRes = await app.inject({
        method: "GET",
        url: `/api/documents/${docId}/citations`,
        headers: {
          "x-user-id": testUser.id,
        },
      });

      expect(citationsRes.statusCode).toBe(200);
      const citJson = JSON.parse(citationsRes.body);
      expect(citJson.citations).toHaveLength(1);
      expect(citJson.citations[0].payload.citationID).toBe("cit-upload-test-1");
      expect(citJson.bibliography).toBeDefined();

      // 3. Download via GET /api/documents/:id/download
      const downloadRes = await app.inject({
        method: "GET",
        url: `/api/documents/${docId}/download`,
        headers: {
          "x-user-id": testUser.id,
        },
      });

      expect(downloadRes.statusCode).toBe(200);
      expect(downloadRes.headers["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(downloadRes.rawPayload.length).toBe(fixtureBuffer.length);

      // Verify downloaded binary has intact Zotero fields
      const downloadedState = await extractZoteroState(downloadRes.rawPayload);
      expect(downloadedState.citations).toHaveLength(1);
      expect(downloadedState.citations[0].payload.citationID).toBe("cit-upload-test-1");
      expect(downloadedState.bibliography).toBeDefined();
    });
  });

  describe("3. ONLYOFFICE Integration Routes & Callback Save Round-Trip", () => {
    it("preserves Zotero field codes when Document Server performs status 6 and status 2 saves", async () => {
      // 1. Seed initial document with Zotero field codes
      const initialBuffer = await createZoteroWordDocxBuffer({
        citationId: "cit-oo-roundtrip-1",
        authorFamily: "Celik",
        year: 2024,
      });

      const docRecord = await documentRepo.create(testUser.id, {
        title: "Biyoenformatik Makale",
        fileSize: initialBuffer.length,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      await wopiStorage.putFile(docRecord.id, initialBuffer);

      // 2. Fetch ONLYOFFICE config
      const configRes = await app.inject({
        method: "GET",
        url: `/api/documents/${docRecord.id}/onlyoffice-config`,
        headers: {
          "x-user-id": testUser.id,
        },
      });

      expect(configRes.statusCode).toBe(200);
      const configJson = JSON.parse(configRes.body);
      const ooConfig = configJson.config;
      expect(ooConfig.document.key).toBeDefined();
      expect(ooConfig.editorConfig.callbackUrl).toBeDefined();

      // 3. Document Server downloads file from /api/onlyoffice/files/:id
      const downloadUrl = new URL(ooConfig.document.url);
      const dsToken = signJwt({ payload: {} }, TEST_SECRET);

      const dsFileRes = await app.inject({
        method: "GET",
        url: downloadUrl.pathname + downloadUrl.search,
        headers: {
          authorization: `Bearer ${dsToken}`,
        },
      });

      expect(dsFileRes.statusCode).toBe(200);
      expect(dsFileRes.rawPayload.length).toBe(initialBuffer.length);

      // 4. Document Server performs edits and sends callback (status: 6 force-save)
      // Simulate edited buffer: same document with added text and preserved Zotero fields
      const zip = await JSZip.loadAsync(initialBuffer);
      let docXml = (await zip.file("word/document.xml")?.async("string"))!;
      docXml = docXml.replace(
        "</w:body>",
        '<w:p><w:r><w:t xml:space="preserve">ONLYOFFICE Tarafindan Eklenen Canli Metin</w:t></w:r></w:p></w:body>',
      );
      zip.file("word/document.xml", docXml);
      const editedBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

      // Mock mockFetch to return editedBuffer for Document Server callback
      const callbackUrl = new URL(ooConfig.editorConfig.callbackUrl);
      const callbackKey = ooConfig.document.key;
      const dsDownloadUrl = "http://onlyoffice/cache/edited-doc.docx";

      mockFetch.mockImplementation(async (url: string) => {
        if (url === dsDownloadUrl) {
          return new Response(editedBuffer, {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const callbackPayload = {
        key: callbackKey,
        status: 6, // forcesave
        url: dsDownloadUrl,
      };
      const callbackToken = signJwt(callbackPayload, TEST_SECRET);

      const callbackRes = await app.inject({
        method: "POST",
        url: callbackUrl.pathname + callbackUrl.search,
        headers: {
          authorization: `Bearer ${callbackToken}`,
        },
        payload: { token: callbackToken },
      });

      expect(callbackRes.statusCode).toBe(200);
      expect(JSON.parse(callbackRes.body)).toEqual({ error: 0 });

      // 5. Verify updated storage and citations
      const updatedMeta = await documentRepo.findRawById(docRecord.id);
      expect(updatedMeta?.fileSize).toBe(editedBuffer.length);

      const savedFile = await wopiStorage.getFile(docRecord.id);
      const savedDocXml = await (await JSZip.loadAsync(savedFile.buffer))
        .file("word/document.xml")
        ?.async("string");

      expect(savedDocXml).toContain("ONLYOFFICE Tarafindan Eklenen Canli Metin");
      expect(savedDocXml).toContain("ADDIN ZOTERO_ITEM CSL_CITATION");
      expect(savedDocXml).toContain("cit-oo-roundtrip-1");
      expect(savedDocXml).toContain("ADDIN ZOTERO_BIBL");

      // 6. Test status 2 (session closed)
      const callbackClosePayload = {
        key: callbackKey,
        status: 2, // saved & closed
        url: dsDownloadUrl,
      };
      const callbackCloseToken = signJwt(callbackClosePayload, TEST_SECRET);

      const closeRes = await app.inject({
        method: "POST",
        url: callbackUrl.pathname + callbackUrl.search,
        headers: {
          authorization: `Bearer ${callbackCloseToken}`,
        },
        payload: { token: callbackCloseToken },
      });

      expect(closeRes.statusCode).toBe(200);
      expect(JSON.parse(closeRes.body)).toEqual({ error: 0 });
    });
  });

  describe("4. Format Limitations & Known Issues (Todos for Confirmed Bugs)", () => {
    it.todo(
      "ZC-01: ONLYOFFICE Document Server strips LibreOffice Zotero reference marks from ODT files during round-trip",
    );

    it.todo(
      "ZC-03: ONLYOFFICE Zotero plugin style picker is locked behind login screen until user enters Zotero API key",
    );

    it.todo(
      "ZC-04: Newly created blank DOCX documents lack docProps/custom.xml ZOTERO_PREF properties",
    );

    it.todo(
      "ZC-05: Style picker searchable dropdown renders 10,865 DOM elements without virtualization, causing client jank",
    );
  });
});
