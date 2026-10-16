import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { AttachmentRepository } from "./attachmentRepository.js";
import { AnnotationRepository } from "./annotationRepository.js";
import { type AttachmentStorage, InMemoryAttachmentStorage } from "./attachmentStorage.js";
import { ZoteroAnnotationSyncService } from "./syncService.js";
import { requireAuth } from "../middleware/auth.js";
import { OwnershipError } from "../repositories/errors.js";
import {
  toZoteroAnnotationItem,
  type ZoteroReaderAnnotation,
  type ZoteroAnnotationItem,
} from "@citedocs/pdf-reader";
import type { ZoteroAccountService } from "../zotero/accountService.js";

export interface PdfRoutesOptions {
  attachmentRepo?: AttachmentRepository;
  annotationRepo?: AnnotationRepository;
  storage?: AttachmentStorage;
  syncService?: ZoteroAnnotationSyncService;
  accountService?: ZoteroAccountService;
}

export function createPdfRoutes(options: PdfRoutesOptions = {}): FastifyPluginAsync {
  return async function pdfRoutes(fastify: FastifyInstance): Promise<void> {
    const attachmentRepo = options.attachmentRepo || new AttachmentRepository();
    const annotationRepo = options.annotationRepo || new AnnotationRepository();
    const storage = options.storage || new InMemoryAttachmentStorage();
    const syncService =
      options.syncService ||
      new ZoteroAnnotationSyncService({
        annotationRepo,
        attachmentRepo,
        accountService: options.accountService,
      });

    // Enforce authentication on all PDF routes
    fastify.addHook("preHandler", requireAuth);

    // ==========================================
    // Attachment Endpoints
    // ==========================================

    // GET /api/attachments - List student's attachments
    fastify.get<{
      Querystring: { itemId?: string };
    }>("/api/attachments", async (request) => {
      const items = await attachmentRepo.list(request.userId, request.query.itemId);
      return items.map((att) => ({
        ...att,
        downloadUrl: `/api/attachments/${att.id}/content`,
      }));
    });

    // POST /api/attachments - Create attachment metadata and optional file
    fastify.post<{
      Body: {
        itemId?: string | null;
        title: string;
        contentType?: string;
        filePath?: string;
        fileSize?: number;
        md5Hash?: string | null;
        base64Content?: string;
      };
    }>("/api/attachments", async (request, reply) => {
      const body = request.body || {};
      const filePath = body.filePath || `users/${request.userId}/attachments/${Date.now()}.pdf`;

      const attachment = await attachmentRepo.create(request.userId, {
        itemId: body.itemId ?? null,
        title: body.title || "Untitled.pdf",
        contentType: body.contentType || "application/pdf",
        filePath,
        fileSize: body.fileSize ?? 0,
        md5Hash: body.md5Hash ?? null,
      });

      if (body.base64Content) {
        const buffer = Buffer.from(body.base64Content, "base64");
        await storage.put(attachment.id, buffer, attachment.contentType);
      }

      reply.status(201);
      return {
        ...attachment,
        downloadUrl: `/api/attachments/${attachment.id}/content`,
      };
    });

    // GET /api/attachments/:id - Get attachment info
    fastify.get<{
      Params: { id: string };
    }>("/api/attachments/:id", async (request, reply) => {
      try {
        const attachment = await attachmentRepo.getById(request.userId, request.params.id);
        if (!attachment) {
          reply.status(404);
          return { error: "Not Found", message: "Attachment not found" };
        }
        return {
          ...attachment,
          downloadUrl: `/api/attachments/${attachment.id}/content`,
        };
      } catch (err) {
        if (err instanceof OwnershipError) {
          reply.status(403);
          return { error: "Forbidden", message: err.message };
        }
        throw err;
      }
    });

    // GET /api/attachments/:id/content - Stream PDF binary content
    fastify.get<{
      Params: { id: string };
    }>("/api/attachments/:id/content", async (request, reply) => {
      try {
        const attachment = await attachmentRepo.getById(request.userId, request.params.id);
        if (!attachment) {
          reply.status(404);
          return { error: "Not Found", message: "Attachment not found" };
        }

        const file = await storage.get(attachment.id);
        if (!file) {
          reply.status(404);
          return { error: "Not Found", message: "Attachment file content not found in storage" };
        }

        reply
          .header("Content-Type", file.contentType || "application/pdf")
          .header("Content-Disposition", `inline; filename="${attachment.title}"`)
          .send(file.data);
      } catch (err) {
        if (err instanceof OwnershipError) {
          reply.status(403);
          return { error: "Forbidden", message: err.message };
        }
        throw err;
      }
    });

    // DELETE /api/attachments/:id - Delete attachment
    fastify.delete<{
      Params: { id: string };
    }>("/api/attachments/:id", async (request, reply) => {
      try {
        const attachment = await attachmentRepo.getById(request.userId, request.params.id);
        if (!attachment) {
          reply.status(404);
          return { error: "Not Found", message: "Attachment not found" };
        }

        await attachmentRepo.delete(request.userId, attachment.id);
        await storage.delete(attachment.id);
        return { success: true };
      } catch (err) {
        if (err instanceof OwnershipError) {
          reply.status(403);
          return { error: "Forbidden", message: err.message };
        }
        throw err;
      }
    });

    // ==========================================
    // Annotation Endpoints
    // ==========================================

    // GET /api/attachments/:id/annotations - List annotations mapped to Zotero formats
    fastify.get<{
      Params: { id: string };
    }>("/api/attachments/:id/annotations", async (request, reply) => {
      try {
        const attachment = await attachmentRepo.getById(request.userId, request.params.id);
        if (!attachment) {
          reply.status(404);
          return { error: "Not Found", message: "Attachment not found" };
        }

        const rows = await annotationRepo.listByAttachment(request.userId, attachment.id);
        const parentKey = attachment.md5Hash || attachment.id;

        const annotations: ZoteroReaderAnnotation[] = rows.map((row) => ({
          id: row.zoteroKey,
          type: row.annotationType as ZoteroReaderAnnotation["type"],
          color: row.annotationColor,
          pageLabel: row.annotationPageLabel,
          sortIndex: row.annotationSortIndex,
          position: (row.annotationPosition as unknown as ZoteroReaderAnnotation["position"]) || {
            pageIndex: 0,
            rects: [],
          },
          text: row.annotationText,
          comment: row.annotationComment,
          image: row.imagePath ?? undefined,
          dateCreated: row.createdAt.toISOString(),
          dateModified: row.updatedAt.toISOString(),
        }));

        const zoteroItems: ZoteroAnnotationItem[] = annotations.map((ann, idx) =>
          toZoteroAnnotationItem(ann, parentKey, rows[idx]?.version ?? 0),
        );

        return {
          attachmentId: attachment.id,
          count: annotations.length,
          annotations,
          zoteroItems,
        };
      } catch (err) {
        if (err instanceof OwnershipError) {
          reply.status(403);
          return { error: "Forbidden", message: err.message };
        }
        throw err;
      }
    });

    // POST /api/attachments/:id/annotations - Batch save/upsert annotations (onSaveAnnotations contract)
    fastify.post<{
      Params: { id: string };
      Body: {
        annotations: ZoteroReaderAnnotation[];
      };
    }>("/api/attachments/:id/annotations", async (request, reply) => {
      try {
        const attachment = await attachmentRepo.getById(request.userId, request.params.id);
        if (!attachment) {
          reply.status(404);
          return { error: "Not Found", message: "Attachment not found" };
        }

        const inputList = request.body?.annotations || [];
        const existingList = await annotationRepo.listByAttachment(request.userId, attachment.id);
        const savedAnnotations: ZoteroReaderAnnotation[] = [];

        for (const input of inputList) {
          const existing = existingList.find((a) => a.zoteroKey === input.id);
          if (existing) {
            const updated = await annotationRepo.update(request.userId, existing.id, {
              annotationType: input.type,
              annotationText: input.text ?? "",
              annotationComment: input.comment ?? "",
              annotationColor: input.color,
              annotationPageLabel: input.pageLabel ?? "1",
              annotationSortIndex: input.sortIndex,
              annotationPosition: input.position as unknown as Record<string, unknown>,
              imagePath: input.image ?? null,
            });
            savedAnnotations.push({
              ...input,
              id: updated.zoteroKey,
              dateModified: updated.updatedAt.toISOString(),
            });
          } else {
            const created = await annotationRepo.create(request.userId, {
              attachmentId: attachment.id,
              zoteroKey: input.id,
              parentItemKey: attachment.md5Hash || attachment.id,
              annotationType: input.type || "highlight",
              annotationText: input.text ?? "",
              annotationComment: input.comment ?? "",
              annotationColor: input.color || "#ffd400",
              annotationPageLabel: input.pageLabel ?? "1",
              annotationSortIndex: input.sortIndex,
              annotationPosition: input.position as unknown as Record<string, unknown>,
              imagePath: input.image ?? null,
            });
            savedAnnotations.push({
              ...input,
              id: created.zoteroKey,
              dateCreated: created.createdAt.toISOString(),
              dateModified: created.updatedAt.toISOString(),
            });
          }
        }

        reply.status(200);
        return {
          attachmentId: attachment.id,
          savedCount: savedAnnotations.length,
          annotations: savedAnnotations,
        };
      } catch (err) {
        if (err instanceof OwnershipError) {
          reply.status(403);
          return { error: "Forbidden", message: err.message };
        }
        throw err;
      }
    });

    // POST /api/attachments/:id/annotations/delete - Batch delete annotations (onDeleteAnnotations contract)
    fastify.post<{
      Params: { id: string };
      Body: {
        ids: string[];
      };
    }>("/api/attachments/:id/annotations/delete", async (request, reply) => {
      try {
        const attachment = await attachmentRepo.getById(request.userId, request.params.id);
        if (!attachment) {
          reply.status(404);
          return { error: "Not Found", message: "Attachment not found" };
        }

        const ids = request.body?.ids || [];
        const deletedCount = await annotationRepo.deleteMany(request.userId, attachment.id, ids);
        return { success: true, deletedCount };
      } catch (err) {
        if (err instanceof OwnershipError) {
          reply.status(403);
          return { error: "Forbidden", message: err.message };
        }
        throw err;
      }
    });

    // DELETE /api/attachments/:id/annotations/:annotationId - Single annotation deletion
    fastify.delete<{
      Params: { id: string; annotationId: string };
    }>("/api/attachments/:id/annotations/:annotationId", async (request, reply) => {
      try {
        const attachment = await attachmentRepo.getById(request.userId, request.params.id);
        if (!attachment) {
          reply.status(404);
          return { error: "Not Found", message: "Attachment not found" };
        }

        const ann = await annotationRepo.getById(request.userId, request.params.annotationId);
        if (!ann) {
          // Also try finding by zoteroKey
          const list = await annotationRepo.listByAttachment(request.userId, attachment.id);
          const foundByKey = list.find((a) => a.zoteroKey === request.params.annotationId);
          if (!foundByKey) {
            reply.status(404);
            return { error: "Not Found", message: "Annotation not found" };
          }
          await annotationRepo.delete(request.userId, foundByKey.id);
          return { success: true };
        }

        await annotationRepo.delete(request.userId, ann.id);
        return { success: true };
      } catch (err) {
        if (err instanceof OwnershipError) {
          reply.status(403);
          return { error: "Forbidden", message: err.message };
        }
        throw err;
      }
    });

    // POST /api/attachments/:id/sync - Bi-directional sync with zotero.org
    fastify.post<{
      Params: { id: string };
    }>("/api/attachments/:id/sync", async (request, reply) => {
      try {
        const attachment = await attachmentRepo.getById(request.userId, request.params.id);
        if (!attachment) {
          reply.status(404);
          return { error: "Not Found", message: "Attachment not found" };
        }

        const result = await syncService.syncAttachmentAnnotations(request.userId, attachment.id);
        return result;
      } catch (err) {
        if (err instanceof OwnershipError) {
          reply.status(403);
          return { error: "Forbidden", message: err.message };
        }
        throw err;
      }
    });
  };
}
