import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyJwt } from "../src/onlyoffice/jwt.js";
import { createOnlyofficeRoutes } from "../src/onlyoffice/routes.js";
import { InMemoryDocumentRepository } from "../src/repositories/inMemoryDocumentRepository.js";
import { InMemoryWopiStorage } from "../src/wopi/storage/inMemoryStorage.js";
import { verifyCsrfProtection } from "../src/auth/csrf.js";

const secret = "onlyoffice-unit-test-secret";
const csrfToken = "csrf-token-1234567890";

afterEach(() => vi.unstubAllEnvs());

describe("ONLYOFFICE ODT to DOCX conversion route", () => {
  let app: ReturnType<typeof Fastify>;
  let repo: InMemoryDocumentRepository;
  let storage: InMemoryWopiStorage;
  const fetchFn = vi.fn<typeof fetch>();

  beforeEach(async () => {
    vi.stubEnv("ONLYOFFICE_JWT_SECRET", secret);
    repo = new InMemoryDocumentRepository();
    storage = new InMemoryWopiStorage();

    // Create an ODT document
    await repo.create("student-1", {
      id: "doc-odt-1",
      title: "Tez_Taslagi.odt",
      mimeType: "application/vnd.oasis.opendocument.text",
    });
    await storage.createFile(
      "doc-odt-1",
      "Tez_Taslagi.odt",
      "student-1",
      Buffer.from("dummy-odt-bytes"),
      "application/vnd.oasis.opendocument.text",
    );

    // Create an ODT document without .odt in title
    await repo.create("student-1", {
      id: "doc-odt-2",
      title: "Arastirma Raporu",
      mimeType: "application/vnd.oasis.opendocument.text",
    });
    await storage.createFile(
      "doc-odt-2",
      "Arastirma Raporu.odt",
      "student-1",
      Buffer.from("dummy-odt-bytes-2"),
      "application/vnd.oasis.opendocument.text",
    );

    // Create a DOCX document
    await repo.create("student-1", {
      id: "doc-docx-1",
      title: "Existing.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await storage.createFile(
      "doc-docx-1",
      "Existing.docx",
      "student-1",
      Buffer.from("dummy-docx-bytes"),
    );

    fetchFn.mockReset();

    app = Fastify();
    await app.register(cookie);
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

  async function postConvert(docId: string, userId = "student-1") {
    return app.inject({
      method: "POST",
      url: `/api/documents/${docId}/convert-to-docx`,
      headers: {
        "x-user-id": userId,
        "x-csrf-token": csrfToken,
      },
      cookies: {
        citedocs_csrf: csrfToken,
      },
    });
  }

  it("converts an ODT document to DOCX via ONLYOFFICE ConvertService and saves it as a new document owned by user", async () => {
    const fakeDocxBuffer = Buffer.from("PK-fake-docx-binary-content");

    fetchFn.mockImplementation(async (input, init) => {
      const urlStr = String(input);
      if (urlStr.includes("ConvertService.ashx")) {
        const body = JSON.parse(String(init?.body));
        expect(body.outputtype).toBe("docx");
        expect(body.filetype).toBe("odt");
        expect(body.async).toBe(false);
        expect(body.url).toContain("/api/onlyoffice/files/doc-odt-1");
        expect(body.token).toBeDefined();

        // Verify that the JWT token is valid
        const decoded = verifyJwt(body.token, secret);
        expect(decoded).toMatchObject({
          outputtype: "docx",
          filetype: "odt",
        });

        // Verify that ONLYOFFICE can download the source file using the URL & token
        const fileReq = new URL(body.url);
        const fileRes = await app.inject({
          method: "GET",
          url: fileReq.pathname + fileReq.search,
        });
        expect(fileRes.statusCode).toBe(200);
        expect(fileRes.body).toBe("dummy-odt-bytes");

        return new Response(
          JSON.stringify({
            endConvert: true,
            fileType: "docx",
            fileUrl: "http://onlyoffice/cache/files/conv-789/output.docx",
            percent: 100,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (urlStr === "http://onlyoffice/cache/files/conv-789/output.docx") {
        return new Response(fakeDocxBuffer, {
          status: 200,
          headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        });
      }

      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });

    const res = await postConvert("doc-odt-1");

    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.document).toBeDefined();
    expect(data.document.id).not.toBe("doc-odt-1");
    expect(data.document.title).toBe("Tez_Taslagi.docx");
    expect(data.document.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(data.document.ownerUserId).toBe("student-1");
    expect(data.document.fileSize).toBe(fakeDocxBuffer.length);

    // Verify stored binary
    const stored = await storage.getFile(data.document.id);
    expect(stored.buffer).toEqual(fakeDocxBuffer);

    // Verify repository record
    const retrieved = await repo.getById("student-1", data.document.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe("Tez_Taslagi.docx");
  });

  it("converts an ODT document when title has no .odt extension and gives it a .docx extension", async () => {
    fetchFn.mockImplementation(async (input) => {
      const urlStr = String(input);
      if (urlStr.includes("ConvertService.ashx")) {
        return new Response(
          JSON.stringify({
            endConvert: true,
            fileType: "docx",
            fileUrl: "http://onlyoffice/cache/files/conv-abc/output.docx",
            percent: 100,
          }),
        );
      }
      if (urlStr === "http://onlyoffice/cache/files/conv-abc/output.docx") {
        return new Response(Buffer.from("docx-bytes"));
      }
      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });

    const res = await postConvert("doc-odt-2");

    expect(res.statusCode).toBe(201);
    expect(res.json().document.title).toBe("Arastirma Raporu.docx");
  });

  it("rejects non-ODT documents with 400 and clear Turkish message", async () => {
    const res = await postConvert("doc-docx-1");

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Yalnızca ODT formatındaki belgeler");
  });

  it("rejects non-existent document with 404 and Turkish message", async () => {
    const res = await postConvert("non-existent-id");

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Belge bulunamadı");
  });

  it("rejects unauthorized user with 403", async () => {
    const res = await postConvert("doc-odt-1", "other-student");

    expect(res.statusCode).toBe(403);
  });

  it("handles ONLYOFFICE conversion error code with 502 and Turkish message", async () => {
    fetchFn.mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: -3, // Conversion error
        }),
      );
    });

    const res = await postConvert("doc-odt-1");

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("Belge dönüştürülürken ONLYOFFICE hatası oluştu");
  });

  it("handles conversion service network failure with 502 and Turkish message", async () => {
    fetchFn.mockRejectedValue(new Error("Network connection refused"));

    const res = await postConvert("doc-odt-1");

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toContain("Dönüştürme servisine bağlanılamadı");
  });

  it("rejects untrusted download host from ConvertService with 502", async () => {
    fetchFn.mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          endConvert: true,
          fileType: "docx",
          fileUrl: "http://malicious-external-host.com/evil.docx",
        }),
      );
    });

    const res = await postConvert("doc-odt-1");

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toContain("Güvenlik kısıtlaması");
  });

  it("rejects conversion when user quota is exceeded with 413 and Turkish message", async () => {
    vi.spyOn(repo, "getStorageUsage").mockResolvedValue(5 * 1024 * 1024 * 1024);

    fetchFn.mockImplementation(async (input) => {
      const urlStr = String(input);
      if (urlStr.includes("ConvertService.ashx")) {
        return new Response(
          JSON.stringify({
            endConvert: true,
            fileType: "docx",
            fileUrl: "http://onlyoffice/cache/files/conv-quota/output.docx",
            percent: 100,
          }),
        );
      }
      if (urlStr === "http://onlyoffice/cache/files/conv-quota/output.docx") {
        return new Response(Buffer.from("new-docx-content"));
      }
      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });

    const res = await postConvert("doc-odt-1");
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toContain("Depolama alanınız yetersiz");
  });
});
