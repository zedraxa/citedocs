import { extractZoteroState } from "./zoteroFields.js";
import type { FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";
import { requireAuth } from "../auth/middleware.js";
import type { IDocumentRepository } from "../repositories/documentRepository.js";
import type { WopiStorage } from "../wopi/types.js";
import {
  createBlankDocxBuffer,
  createBlankOdtBuffer,
  resolveMimeType,
  resolveExtension,
  SUPPORTED_EXTENSIONS,
} from "./templates.js";
import {
  assertUserQuota,
  getQuotaInfo,
  getMaxUploadSizeBytes,
  StorageQuotaExceededError,
} from "./quota.js";
import { NotFoundError, OwnershipError } from "../repositories/errors.js";
import type { ShareRole } from "./types.js";

export interface DocumentRoutesOptions {
  documentRepo: IDocumentRepository;
  wopiStorage: WopiStorage;
  maxUploadSizeBytes?: number;
}

interface DocumentParams {
  id: string;
}

interface ShareParams {
  id: string;
  shareId: string;
}

export const createDocumentRoutes = (
  options: DocumentRoutesOptions
): FastifyPluginAsync => {
  const { documentRepo, wopiStorage } = options;
  const maxUploadSizeBytes = options.maxUploadSizeBytes || getMaxUploadSizeBytes();

  return async (fastify) => {
    // Register multipart parser within this plugin scope with generous size limit
    await fastify.register(multipart, {
      limits: {
        fileSize: maxUploadSizeBytes,
      },
    });

    // Also support raw octet-stream / binary upload
    fastify.addContentTypeParser(
      [
        "application/octet-stream",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.oasis.opendocument.text",
        "application/pdf",
        "application/x-pdf",
      ],
      { parseAs: "buffer", bodyLimit: maxUploadSizeBytes + 1024 * 1024 },
      (_req, body, done) => {
        done(null, body);
      }
    );

    // Apply requireAuth to all document routes in this plugin
    fastify.addHook("preHandler", requireAuth);

    /**
     * GET /api/documents
     * Lists documents owned by the user, with optional search and sorting.
     */
    fastify.get<{
      Querystring: {
        search?: string;
        sortBy?: "updatedAt" | "createdAt" | "title" | "size";
        sortOrder?: "asc" | "desc";
        tab?: "my" | "shared";
      };
    }>("/api/documents", async (req, reply) => {
      const userId = req.userId;
      const userEmail = req.user?.email;
      const { search, sortBy, sortOrder, tab } = req.query;

      if (tab === "shared") {
        const shared = await documentRepo.listSharedWith(userId, userEmail, {
          search,
          sortBy,
          sortOrder,
        });
        return reply.status(200).send({
          documents: shared,
          tab: "shared",
        });
      }

      const [owned, quota] = await Promise.all([
        documentRepo.listOwned(userId, { search, sortBy, sortOrder }),
        getQuotaInfo(documentRepo, userId),
      ]);

      return reply.status(200).send({
        documents: owned,
        quota,
        tab: "my",
      });
    });

    /**
     * GET /api/documents/shared-with-me
     * Lists documents explicitly shared with the current user.
     */
    fastify.get<{
      Querystring: {
        search?: string;
        sortBy?: "updatedAt" | "createdAt" | "title" | "size";
        sortOrder?: "asc" | "desc";
      };
    }>("/api/documents/shared-with-me", async (req, reply) => {
      const userId = req.userId;
      const userEmail = req.user?.email;
      const { search, sortBy, sortOrder } = req.query;

      const shared = await documentRepo.listSharedWith(userId, userEmail, {
        search,
        sortBy,
        sortOrder,
      });

      return reply.status(200).send({
        documents: shared,
      });
    });

    /**
     * GET /api/documents/quota
     * Returns current user's storage usage and quota.
     */
    fastify.get("/api/documents/quota", async (req, reply) => {
      const quota = await getQuotaInfo(documentRepo, req.userId);
      return reply.status(200).send(quota);
    });

    /**
     * POST /api/documents
     * Creates a new blank document (.docx or .odt).
     */
    fastify.post<{
      Body: {
        title?: string;
        format?: "docx" | "odt";
      };
    }>("/api/documents", async (req, reply) => {
      const userId = req.userId;
      const { title, format = "docx" } = req.body || {};

      if (format !== "docx" && format !== "odt") {
        return reply.status(400).send({
          error: "InvalidFormat",
          message: "Format must be either 'docx' or 'odt'",
        });
      }

      const ext = format === "odt" ? ".odt" : ".docx";
      const mime = resolveMimeType(ext);

      // Generate initial blank template buffer
      const buffer =
        format === "odt"
          ? await createBlankOdtBuffer()
          : await createBlankDocxBuffer();

      // Check quota
      try {
        await assertUserQuota(documentRepo, userId, buffer.length);
      } catch (err: unknown) {
        if (err instanceof StorageQuotaExceededError) {
          return reply.status(413).send({
            error: "QuotaExceeded",
            message: err.message,
            used: err.used,
            quota: err.quota,
          });
        }
        throw err;
      }

      const fileId = crypto.randomUUID(); // documents.id is a Postgres uuid column
      const docTitle = title?.trim() || (format === "odt" ? "Adsız Belge.odt" : "Adsız Belge");
      const baseFileName = docTitle.toLowerCase().endsWith(ext) ? docTitle : `${docTitle}${ext}`;
      const s3Key = `users/${userId}/documents/${fileId}${ext}`;

      // Persist binary to WOPI storage
      if (wopiStorage.createFile) {
        await wopiStorage.createFile(fileId, baseFileName, userId, buffer, mime);
      } else {
        await wopiStorage.putFile(fileId, buffer);
      }

      // Persist document metadata to database
      const doc = await documentRepo.create(userId, {
        id: fileId,
        title: docTitle,
        s3ObjectKey: s3Key,
        fileSize: buffer.length,
        mimeType: mime,
      });

      return reply.status(201).send({
        document: doc,
      });
    });

    /**
     * POST /api/documents/upload
     * Uploads a document file (.docx, .odt, .pdf).
     */
    fastify.post<{
      Querystring: {
        title?: string;
        filename?: string;
      };
    }>("/api/documents/upload", async (req, reply) => {
      const userId = req.userId;
      let buffer: Buffer | null = null;
      let filename = req.query.filename || req.query.title || "Uploaded Document.docx";
      let mimetype = "";

      if (req.isMultipart()) {
        const filePart = await req.file();
        if (!filePart) {
          return reply.status(400).send({
            error: "NoFileUploaded",
            message: "Multipart file was not provided",
          });
        }
        filename = filePart.filename || filename;
        mimetype = filePart.mimetype || "";
        buffer = await filePart.toBuffer();
      } else if (Buffer.isBuffer(req.body)) {
        buffer = req.body;
        mimetype = req.headers["content-type"] || "";
      }

      if (!buffer || buffer.length === 0) {
        return reply.status(400).send({
          error: "EmptyFile",
          message: "Uploaded file is empty or missing",
        });
      }

      // Validate size limit
      const effectiveMaxUpload = options.maxUploadSizeBytes ?? getMaxUploadSizeBytes();
      if (buffer.length > effectiveMaxUpload) {
        return reply.status(413).send({
          error: "FileTooLarge",
          message: `File size (${buffer.length} bytes) exceeds limit of ${effectiveMaxUpload} bytes`,
        });
      }

      // Validate file extension and MIME type
      const lowerName = filename.toLowerCase();
      const hasValidExt = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      const resolvedMime = resolveMimeType(lowerName) || mimetype;

      if (!hasValidExt && resolvedMime === "application/octet-stream") {
        return reply.status(400).send({
          error: "UnsupportedFileType",
          message: "Only .docx, .odt, and .pdf documents can be uploaded.",
        });
      }

      const finalMime = hasValidExt ? resolveMimeType(lowerName) : resolvedMime;
      const ext = resolveExtension(finalMime);

      // Check quota
      try {
        await assertUserQuota(documentRepo, userId, buffer.length);
      } catch (err: unknown) {
        if (err instanceof StorageQuotaExceededError) {
          return reply.status(413).send({
            error: "QuotaExceeded",
            message: err.message,
            used: err.used,
            quota: err.quota,
          });
        }
        throw err;
      }

      const fileId = crypto.randomUUID(); // documents.id is a Postgres uuid column
      const s3Key = `users/${userId}/documents/${fileId}${ext}`;
      const docTitle = filename.replace(/\.(docx|odt|pdf)$/i, "");

      // Persist binary to WOPI storage
      if (wopiStorage.createFile) {
        await wopiStorage.createFile(fileId, filename, userId, buffer, finalMime);
      } else {
        await wopiStorage.putFile(fileId, buffer);
      }

      // Persist document record
      const doc = await documentRepo.create(userId, {
        id: fileId,
        title: docTitle,
        s3ObjectKey: s3Key,
        fileSize: buffer.length,
        mimeType: finalMime,
      });

      return reply.status(201).send({
        document: doc,
      });
    });

    /**
     * GET /api/documents/:id
     * Gets document metadata and caller's access role.
     */
    fastify.get<{ Params: DocumentParams }>("/api/documents/:id", async (req, reply) => {
      const userId = req.userId;
      const userEmail = req.user?.email;
      const documentId = req.params.id;

      try {
        const docWithRole = await documentRepo.getById(userId, documentId, userEmail);
        if (!docWithRole) {
          return reply.status(404).send({ error: "Document not found" });
        }
        return reply.status(200).send({
          document: docWithRole,
          role: docWithRole.userRole,
        });
      } catch (err: unknown) {
        if (err instanceof OwnershipError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    });

    /**
     * PATCH /api/documents/:id
     * Renames a document. Viewers cannot rename (403).
     */
    fastify.patch<{
      Params: DocumentParams;
      Body: { title: string };
    }>("/api/documents/:id", async (req, reply) => {
      const userId = req.userId;
      const userEmail = req.user?.email;
      const documentId = req.params.id;
      const { title } = req.body || {};

      if (!title || typeof title !== "string" || title.trim() === "") {
        return reply.status(400).send({ error: "Title is required" });
      }

      try {
        const updated = await documentRepo.update(
          userId,
          documentId,
          { title: title.trim() },
          userEmail
        );
        return reply.status(200).send({ document: updated });
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: err.message });
        }
        if (err instanceof OwnershipError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    });

    /**
     * DELETE /api/documents/:id
     * Soft-deletes a document. Only the owner can delete.
     */
    fastify.delete<{ Params: DocumentParams }>("/api/documents/:id", async (req, reply) => {
      const userId = req.userId;
      const documentId = req.params.id;

      try {
        const success = await documentRepo.delete(userId, documentId);
        if (!success) {
          return reply.status(404).send({ error: "Document not found" });
        }
        return reply.status(200).send({ success: true });
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: err.message });
        }
        if (err instanceof OwnershipError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    });

    /**
     * GET /api/documents/:id/download
     * Downloads document binary payload.
     */
    fastify.get<{ Params: DocumentParams }>(
      "/api/documents/:id/download",
      async (req, reply) => {
        const userId = req.userId;
        const userEmail = req.user?.email;
        const documentId = req.params.id;

        try {
          const docWithRole = await documentRepo.getById(userId, documentId, userEmail);
          if (!docWithRole) {
            return reply.status(404).send({ error: "Document not found" });
          }

          const file = await wopiStorage.getFile(documentId);
          const ext = resolveExtension(docWithRole.mimeType);
          const cleanTitle = docWithRole.title.toLowerCase().endsWith(ext)
            ? docWithRole.title
            : `${docWithRole.title}${ext}`;

          reply.header("Content-Type", docWithRole.mimeType);
          reply.header(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(cleanTitle)}"`
          );
          reply.header("Content-Length", file.buffer.length);
          return reply.status(200).send(file.buffer);
        } catch (err: unknown) {
          if (err instanceof OwnershipError) {
            return reply.status(403).send({ error: err.message });
          }
          if (err instanceof NotFoundError) {
            return reply.status(404).send({ error: err.message });
          }
          throw err;
        }
      }
    );

    /**
     * GET /api/documents/:id/citations
     * Reads Zotero citation fields (ADDIN ZOTERO_ITEM / ZOTERO_BIBL) and ZOTERO_PREF document
     * properties straight out of the saved .docx, so the editor can restore citation state on reload.
     */
    fastify.get<{ Params: DocumentParams }>(
      "/api/documents/:id/citations",
      async (req, reply) => {
        const docWithRole = await documentRepo.getById(req.userId, req.params.id, req.user?.email);
        if (!docWithRole) return reply.status(404).send({ error: "Document not found" });
        try {
          const file = await wopiStorage.getFile(req.params.id);
          return reply.status(200).send(await extractZoteroState(file.buffer));
        } catch {
          return reply.status(200).send({ citations: [], bibliography: null, prefs: null, style: null });
        }
      }
    );

    /**
     * POST /api/documents/:id/shares
     * Shares a document by email. Only the owner can share.
     */
    fastify.post<{
      Params: DocumentParams;
      Body: {
        email: string;
        role?: ShareRole;
      };
    }>("/api/documents/:id/shares", async (req, reply) => {
      const userId = req.userId;
      const documentId = req.params.id;
      const { email, role = "viewer" } = req.body || {};

      if (!email || typeof email !== "string" || !email.includes("@")) {
        return reply.status(400).send({
          error: "InvalidEmail",
          message: "A valid email address is required to share",
        });
      }

      if (role !== "viewer" && role !== "editor") {
        return reply.status(400).send({
          error: "InvalidRole",
          message: "Role must be 'viewer' or 'editor'",
        });
      }

      try {
        const share = await documentRepo.share(
          userId,
          documentId,
          email.toLowerCase().trim(),
          role,
          userId
        );
        return reply.status(201).send({ share });
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: err.message });
        }
        if (err instanceof OwnershipError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    });

    /**
     * GET /api/documents/:id/shares
     * Lists shares for a document. Only the owner can view shares.
     */
    fastify.get<{ Params: DocumentParams }>(
      "/api/documents/:id/shares",
      async (req, reply) => {
        const userId = req.userId;
        const userEmail = req.user?.email;
        const documentId = req.params.id;

        try {
          const docWithRole = await documentRepo.getById(userId, documentId, userEmail);
          if (!docWithRole) {
            return reply.status(404).send({ error: "Document not found" });
          }

          if (docWithRole.userRole !== "owner") {
            return reply.status(403).send({
              error: "Forbidden",
              message: "Only the document owner can view sharing settings",
            });
          }

          const shares = await documentRepo.listShares(userId, documentId, userEmail);
          return reply.status(200).send({ shares });
        } catch (err: unknown) {
          if (err instanceof OwnershipError) {
            return reply.status(403).send({ error: err.message });
          }
          if (err instanceof NotFoundError) {
            return reply.status(404).send({ error: err.message });
          }
          throw err;
        }
      }
    );

    /**
     * DELETE /api/documents/:id/shares/:shareId
     * Removes an email or user share from a document. Only owner can unshare.
     */
    fastify.delete<{ Params: ShareParams }>(
      "/api/documents/:id/shares/:shareId",
      async (req, reply) => {
        const userId = req.userId;
        const { id: documentId, shareId } = req.params;

        try {
          const success = await documentRepo.unshare(userId, documentId, shareId);
          if (!success) {
            return reply.status(404).send({ error: "Share grant not found" });
          }
          return reply.status(200).send({ success: true });
        } catch (err: unknown) {
          if (err instanceof NotFoundError) {
            return reply.status(404).send({ error: err.message });
          }
          if (err instanceof OwnershipError) {
            return reply.status(403).send({ error: err.message });
          }
          throw err;
        }
      }
    );
  };
};
