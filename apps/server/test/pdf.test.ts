import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import {
  InMemoryAttachmentRepository,
  InMemoryAnnotationRepository,
  InMemoryAttachmentStorage,
} from "../src/pdf/index.js";
import type { ZoteroReaderAnnotation } from "@citedocs/pdf-reader";

describe("PDF Attachments & Annotations API (Server)", () => {
  let app: FastifyInstance;
  let attachmentRepo: InMemoryAttachmentRepository;
  let annotationRepo: InMemoryAnnotationRepository;
  let storage: InMemoryAttachmentStorage;

  const userA = "user-alice-111";
  const userB = "user-bob-222";

  beforeEach(async () => {
    attachmentRepo = new InMemoryAttachmentRepository();
    annotationRepo = new InMemoryAnnotationRepository();
    storage = new InMemoryAttachmentStorage();

    app = await buildApp({
      attachmentRepo,
      annotationRepo,
      attachmentStorage: storage,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("Authentication & User Isolation", () => {
    it("rejects unauthenticated requests without X-User-Id header", async () => {
      const resp = await app.inject({
        method: "GET",
        url: "/api/attachments",
      });
      expect(resp.statusCode).toBe(401);
      expect(resp.json()).toMatchObject({ error: "Unauthorized" });
    });

    it("enforces strict ownership isolation between users", async () => {
      // Alice creates an attachment
      const createResp = await app.inject({
        method: "POST",
        url: "/api/attachments",
        headers: { "x-user-id": userA },
        payload: {
          title: "AlicePrivatePaper.pdf",
          base64Content: Buffer.from("%PDF-1.4 Alice secret").toString("base64"),
        },
      });
      expect(createResp.statusCode).toBe(201);
      const attachment = createResp.json();

      // Bob tries to view Alice's attachment metadata
      const bobViewResp = await app.inject({
        method: "GET",
        url: `/api/attachments/${attachment.id}`,
        headers: { "x-user-id": userB },
      });
      expect(bobViewResp.statusCode).toBe(403);
      expect(bobViewResp.json().message).toContain("belongs to another user");

      // Bob tries to download Alice's PDF content
      const bobDownloadResp = await app.inject({
        method: "GET",
        url: `/api/attachments/${attachment.id}/content`,
        headers: { "x-user-id": userB },
      });
      expect(bobDownloadResp.statusCode).toBe(403);

      // Bob tries to access Alice's annotations
      const bobAnnResp = await app.inject({
        method: "GET",
        url: `/api/attachments/${attachment.id}/annotations`,
        headers: { "x-user-id": userB },
      });
      expect(bobAnnResp.statusCode).toBe(403);

      // Bob tries to delete Alice's attachment
      const bobDeleteResp = await app.inject({
        method: "DELETE",
        url: `/api/attachments/${attachment.id}`,
        headers: { "x-user-id": userB },
      });
      expect(bobDeleteResp.statusCode).toBe(403);

      // Bob's attachment list does NOT include Alice's attachment
      const bobListResp = await app.inject({
        method: "GET",
        url: "/api/attachments",
        headers: { "x-user-id": userB },
      });
      expect(bobListResp.statusCode).toBe(200);
      expect(bobListResp.json()).toHaveLength(0);
    });
  });

  describe("Attachment Content & Storage", () => {
    it("creates, streams, and deletes PDF attachments", async () => {
      const pdfBytes = Buffer.from("%PDF-1.4 test document stream");

      // Upload attachment
      const createResp = await app.inject({
        method: "POST",
        url: "/api/attachments",
        headers: { "x-user-id": userA },
        payload: {
          title: "Einstein1935.pdf",
          contentType: "application/pdf",
          fileSize: pdfBytes.length,
          base64Content: pdfBytes.toString("base64"),
        },
      });
      expect(createResp.statusCode).toBe(201);
      const attachment = createResp.json();
      expect(attachment.title).toBe("Einstein1935.pdf");
      expect(attachment.downloadUrl).toBe(`/api/attachments/${attachment.id}/content`);

      // Stream binary content
      const streamResp = await app.inject({
        method: "GET",
        url: `/api/attachments/${attachment.id}/content`,
        headers: { "x-user-id": userA },
      });
      expect(streamResp.statusCode).toBe(200);
      expect(streamResp.headers["content-type"]).toBe("application/pdf");
      expect(streamResp.rawPayload.equals(pdfBytes)).toBe(true);

      // Delete attachment
      const delResp = await app.inject({
        method: "DELETE",
        url: `/api/attachments/${attachment.id}`,
        headers: { "x-user-id": userA },
      });
      expect(delResp.statusCode).toBe(200);
      expect(delResp.json()).toEqual({ success: true });

      // Verifying subsequent get returns 404
      const getResp = await app.inject({
        method: "GET",
        url: `/api/attachments/${attachment.id}`,
        headers: { "x-user-id": userA },
      });
      expect(getResp.statusCode).toBe(404);
    });
  });

  describe("Annotations CRUD & Zotero Schema Mapping", () => {
    let attachmentId: string;

    beforeEach(async () => {
      const resp = await app.inject({
        method: "POST",
        url: "/api/attachments",
        headers: { "x-user-id": userA },
        payload: {
          title: "PaperWithAnnotations.pdf",
          base64Content: Buffer.from("%PDF-1.4 content").toString("base64"),
        },
      });
      attachmentId = resp.json().id;
    });

    it("saves and retrieves annotations conforming to Zotero Web API v3 schema", async () => {
      const newAnnotations: ZoteroReaderAnnotation[] = [
        {
          id: "ANN_HIGH_01",
          type: "highlight",
          color: "#ffd400",
          pageLabel: "3",
          sortIndex: "00002|000100|000050",
          position: {
            pageIndex: 2,
            rects: [[50, 100, 300, 120]],
            rotation: 0,
          },
          text: "Can Quantum-Mechanical Description be Complete?",
          comment: "EPR Paradox key phrase",
        },
        {
          id: "ANN_NOTE_02",
          type: "note",
          color: "#ff6666",
          pageLabel: "3",
          sortIndex: "00002|000150|000000",
          position: {
            pageIndex: 2,
            rects: [[0, 150, 100, 200]],
            rotation: 0,
          },
          text: "",
          comment: "Check follow-up papers by Bell (1964)",
        },
        {
          id: "ANN_IMG_03",
          type: "image",
          color: "#5fb236",
          pageLabel: "4",
          sortIndex: "00003|000000|000000",
          position: {
            pageIndex: 3,
            rects: [[50, 50, 400, 300]],
            rotation: 0,
          },
          image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          comment: "Experimental apparatus schematic",
        },
      ];

      // Save annotations (batch onSaveAnnotations)
      const saveResp = await app.inject({
        method: "POST",
        url: `/api/attachments/${attachmentId}/annotations`,
        headers: { "x-user-id": userA },
        payload: {
          annotations: newAnnotations,
        },
      });
      expect(saveResp.statusCode).toBe(200);
      expect(saveResp.json().savedCount).toBe(3);

      // Fetch annotations
      const listResp = await app.inject({
        method: "GET",
        url: `/api/attachments/${attachmentId}/annotations`,
        headers: { "x-user-id": userA },
      });
      expect(listResp.statusCode).toBe(200);
      const data = listResp.json();

      expect(data.count).toBe(3);
      expect(data.annotations).toHaveLength(3);
      expect(data.zoteroItems).toHaveLength(3);

      // Verify mapping to Zotero API item structure
      const highlightZoteroItem = data.zoteroItems.find(
        (item: { key: string }) => item.key === "ANN_HIGH_01",
      );
      expect(highlightZoteroItem).toBeDefined();
      expect(highlightZoteroItem.data.itemType).toBe("annotation");
      expect(highlightZoteroItem.data.annotationType).toBe("highlight");
      expect(highlightZoteroItem.data.annotationText).toBe(
        "Can Quantum-Mechanical Description be Complete?",
      );
      expect(highlightZoteroItem.data.annotationComment).toBe("EPR Paradox key phrase");
      expect(highlightZoteroItem.data.annotationColor).toBe("#ffd400");
      expect(highlightZoteroItem.data.annotationPageLabel).toBe("3");
      expect(highlightZoteroItem.data.annotationSortIndex).toBe("00002|000100|000050");

      // Verify image annotation mapping
      const imageZoteroItem = data.zoteroItems.find(
        (item: { key: string }) => item.key === "ANN_IMG_03",
      );
      expect(imageZoteroItem.data.annotationType).toBe("image");
      expect(imageZoteroItem.data.annotationComment).toBe(
        "Experimental apparatus schematic",
      );
    });

    it("deletes annotations individually and in batches", async () => {
      // First create two annotations
      await app.inject({
        method: "POST",
        url: `/api/attachments/${attachmentId}/annotations`,
        headers: { "x-user-id": userA },
        payload: {
          annotations: [
            {
              id: "TO_DELETE_1",
              type: "highlight",
              color: "#ffd400",
              sortIndex: "00001|000000|000000",
              position: { pageIndex: 0, rects: [] },
              text: "Delete me 1",
            },
            {
              id: "TO_DELETE_2",
              type: "underline",
              color: "#2ea8e5",
              sortIndex: "00001|000100|000000",
              position: { pageIndex: 0, rects: [] },
              text: "Delete me 2",
            },
          ],
        },
      });

      // Batch delete TO_DELETE_1
      const batchDelResp = await app.inject({
        method: "POST",
        url: `/api/attachments/${attachmentId}/annotations/delete`,
        headers: { "x-user-id": userA },
        payload: { ids: ["TO_DELETE_1"] },
      });
      expect(batchDelResp.statusCode).toBe(200);
      expect(batchDelResp.json().deletedCount).toBe(1);

      // Single delete TO_DELETE_2
      const singleDelResp = await app.inject({
        method: "DELETE",
        url: `/api/attachments/${attachmentId}/annotations/TO_DELETE_2`,
        headers: { "x-user-id": userA },
      });
      expect(singleDelResp.statusCode).toBe(200);

      // Verify all deleted
      const listResp = await app.inject({
        method: "GET",
        url: `/api/attachments/${attachmentId}/annotations`,
        headers: { "x-user-id": userA },
      });
      expect(listResp.json().count).toBe(0);
    });
  });

  describe("Zotero Account Sync Endpoint", () => {
    it("gracefully returns skipped status when user account is not linked", async () => {
      const resp = await app.inject({
        method: "POST",
        url: "/api/attachments",
        headers: { "x-user-id": userA },
        payload: { title: "UnlinkedSync.pdf" },
      });
      const attachmentId = resp.json().id;

      const syncResp = await app.inject({
        method: "POST",
        url: `/api/attachments/${attachmentId}/sync`,
        headers: { "x-user-id": userA },
      });

      expect(syncResp.statusCode).toBe(200);
      expect(syncResp.json().status).toBe("skipped");
    });
  });
});
