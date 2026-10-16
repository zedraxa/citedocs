import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { WopiStorage } from "./types.js";
import { WopiLockManager } from "./lockManager.js";
import { createWopiToken, verifyWopiToken, WopiTokenError } from "./token.js";
import { CollaboraDiscoveryService } from "./discovery.js";
import { WopiFileNotFoundError } from "./storage/inMemoryStorage.js";
import { exportDocumentToDocx } from "@citedocs/docx-exporter";

import type { IDocumentRepository } from "../repositories/documentRepository.js";
import { resolveExtension } from "../documents/templates.js";
import { OwnershipError, NotFoundError } from "../repositories/errors.js";
import { requireAuth } from "../auth/middleware.js";

export interface WopiRoutesOptions {
  storage: WopiStorage;
  lockManager?: WopiLockManager;
  discoveryService?: CollaboraDiscoveryService;
  secretKey?: string;
  postMessageOrigin?: string;
  serverUrl?: string;
  documentRepo?: IDocumentRepository;
}

interface WopiQuery {
  access_token?: string;
}

interface WopiParams {
  id: string;
}

function getHeader(req: FastifyRequest, headerName: string): string | undefined {
  const value = req.headers[headerName.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export const createWopiRoutes = (options: WopiRoutesOptions): FastifyPluginAsync => {
  const { storage, documentRepo } = options;
  const lockManager = options.lockManager || new WopiLockManager();
  const discoveryService = options.discoveryService || new CollaboraDiscoveryService();
  const secretKey = options.secretKey;
  const postMessageOrigin = options.postMessageOrigin || process.env.COLLABORA_ORIGIN || "*";

  return async (fastify) => {
    // Register raw buffer parser for PutFile in this plugin scope
    fastify.addContentTypeParser(
      [
        "application/octet-stream",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "*/*",
      ],
      { parseAs: "buffer" },
      (_req, body, done) => {
        done(null, body);
      },
    );

    /**
     * Helper to authenticate access_token query param and verify fileId binding
     */
    const authenticateWopiToken = (
      req: FastifyRequest<{ Params: WopiParams; Querystring: WopiQuery }>,
      reply: FastifyReply,
    ) => {
      const tokenStr = req.query.access_token;
      if (!tokenStr) {
        reply.status(401).send({ error: "Missing access_token query parameter" });
        return null;
      }

      try {
        const payload = verifyWopiToken(tokenStr, secretKey);
        if (payload.fileId !== req.params.id) {
          reply.status(401).send({ error: "Token not authorized for this file" });
          return null;
        }
        return payload;
      } catch (err: unknown) {
        const msg = err instanceof WopiTokenError ? err.message : "Unauthorized";
        reply.status(401).send({ error: msg });
        return null;
      }
    };

    /**
     * GET /wopi/files/:id (CheckFileInfo)
     */
    fastify.get<{ Params: WopiParams; Querystring: WopiQuery }>(
      "/wopi/files/:id",
      async (req, reply) => {
        const tokenPayload = authenticateWopiToken(req, reply);
        if (!tokenPayload) return;

        try {
          const metadata = await storage.getFileInfo(req.params.id);

          let baseFileName = metadata.baseFileName;
          let ownerId = metadata.ownerId;

          if (documentRepo) {
            const rawDoc = await documentRepo.findRawById(req.params.id);
            if (rawDoc) {
              ownerId = rawDoc.ownerUserId;
              const ext = resolveExtension(rawDoc.mimeType);
              baseFileName = rawDoc.title.toLowerCase().endsWith(ext)
                ? rawDoc.title
                : `${rawDoc.title}${ext}`;
            }
          }

          return reply.status(200).send({
            BaseFileName: baseFileName,
            OwnerId: ownerId,
            Size: metadata.size,
            UserId: tokenPayload.userId,
            UserFriendlyName: tokenPayload.userName,
            UserCanWrite: tokenPayload.canWrite,
            Version: metadata.version,
            SupportsLocks: true,
            SupportsGetLock: true,
            SupportsExtendedLockLength: true,
            SupportsUpdate: true,
            PostMessageOrigin: postMessageOrigin,
            HideSaveOption: false,
            HideExportOption: false,
            EnableOwnerTermination: false,
            BreadcrumbBrandName: "CiteDocs",
            LastModifiedTime: metadata.updatedAt.toISOString(),
          });
        } catch (err: unknown) {
          if (err instanceof WopiFileNotFoundError) {
            return reply.status(404).send({ error: "File not found" });
          }
          throw err;
        }
      },
    );

    /**
     * GET /wopi/files/:id/contents (GetFile)
     */
    fastify.get<{ Params: WopiParams; Querystring: WopiQuery }>(
      "/wopi/files/:id/contents",
      async (req, reply) => {
        const tokenPayload = authenticateWopiToken(req, reply);
        if (!tokenPayload) return;

        try {
          const file = await storage.getFile(req.params.id);

          reply.header(
            "Content-Type",
            file.metadata.contentType || "application/octet-stream",
          );
          reply.header("X-WOPI-ItemVersion", file.metadata.version);
          return reply.status(200).send(file.buffer);
        } catch (err: unknown) {
          if (err instanceof WopiFileNotFoundError) {
            return reply.status(404).send({ error: "File not found" });
          }
          throw err;
        }
      },
    );

    /**
     * POST /wopi/files/:id/contents (PutFile)
     */
    fastify.post<{ Params: WopiParams; Querystring: WopiQuery }>(
      "/wopi/files/:id/contents",
      async (req, reply) => {
        const tokenPayload = authenticateWopiToken(req, reply);
        if (!tokenPayload) return;

        if (!tokenPayload.canWrite) {
          return reply.status(403).send({ error: "User does not have write permission" });
        }

        const lockHeader = getHeader(req, "x-wopi-lock");
        const currentLock = lockManager.getLock(req.params.id);

        if (currentLock !== null) {
          if (lockHeader !== currentLock) {
            reply.header("X-WOPI-Lock", currentLock);
            return reply.status(409).send({ error: "Lock mismatch" });
          }
        } else {
          // File has no active lock
          if (lockHeader) {
            // Client provided a lock but file is not locked
            reply.header("X-WOPI-Lock", "");
            return reply.status(409).send({ error: "File is not locked" });
          }
        }

        let contentBuffer: Buffer;
        if (Buffer.isBuffer(req.body)) {
          contentBuffer = req.body;
        } else if (typeof req.body === "string") {
          contentBuffer = Buffer.from(req.body);
        } else if (req.body) {
          contentBuffer = Buffer.from(JSON.stringify(req.body));
        } else {
          contentBuffer = Buffer.alloc(0);
        }

        const result = await storage.putFile(req.params.id, contentBuffer);

        if (documentRepo) {
          try {
            await documentRepo.update(
              tokenPayload.userId,
              req.params.id,
              {
                fileSize: result.metadata.size,
                updatedAt: new Date(),
              }
            );
          } catch {
            // Document might not exist in documentRepo or update ignored
          }
        }

        reply.header("X-WOPI-ItemVersion", result.metadata.version);
        return reply.status(200).send({
          version: result.metadata.version,
          size: result.metadata.size,
        });
      },
    );

    /**
     * POST /wopi/files/:id (Lock operations: LOCK, UNLOCK, REFRESH_LOCK, GET_LOCK)
     */
    fastify.post<{ Params: WopiParams; Querystring: WopiQuery }>(
      "/wopi/files/:id",
      async (req, reply) => {
        const tokenPayload = authenticateWopiToken(req, reply);
        if (!tokenPayload) return;

        const override = (getHeader(req, "x-wopi-override") || "").toUpperCase();
        const lock = getHeader(req, "x-wopi-lock") || "";
        const oldLock = getHeader(req, "x-wopi-oldlock");

        let currentVersion = "v1";
        try {
          const meta = await storage.getFileInfo(req.params.id);
          currentVersion = meta.version;
        } catch {
          // If file not found in storage, return 404
          return reply.status(404).send({ error: "File not found" });
        }

        switch (override) {
          case "LOCK": {
            if (!lock) {
              return reply.status(400).send({ error: "Missing X-WOPI-Lock header" });
            }

            if (oldLock !== undefined) {
              const res = lockManager.relock(req.params.id, oldLock, lock);
              if (res.success) {
                reply.header("X-WOPI-ItemVersion", currentVersion);
                return reply.status(200).send();
              }
              reply.header("X-WOPI-Lock", res.currentLock);
              return reply.status(409).send({ error: "Lock conflict" });
            }

            const res = lockManager.setLock(req.params.id, lock);
            if (res.success) {
              reply.header("X-WOPI-ItemVersion", currentVersion);
              return reply.status(200).send();
            }
            reply.header("X-WOPI-Lock", res.currentLock);
            return reply.status(409).send({ error: "Lock conflict" });
          }

          case "UNLOCK": {
            if (!lock) {
              return reply.status(400).send({ error: "Missing X-WOPI-Lock header" });
            }

            const res = lockManager.unlock(req.params.id, lock);
            if (res.success) {
              reply.header("X-WOPI-ItemVersion", currentVersion);
              return reply.status(200).send();
            }
            reply.header("X-WOPI-Lock", res.currentLock);
            return reply.status(409).send({ error: "Lock conflict" });
          }

          case "REFRESH_LOCK": {
            if (!lock) {
              return reply.status(400).send({ error: "Missing X-WOPI-Lock header" });
            }

            const res = lockManager.refreshLock(req.params.id, lock);
            if (res.success) {
              reply.header("X-WOPI-ItemVersion", currentVersion);
              return reply.status(200).send();
            }
            reply.header("X-WOPI-Lock", res.currentLock);
            return reply.status(409).send({ error: "Lock conflict" });
          }

          case "GET_LOCK": {
            const active = lockManager.getLock(req.params.id) ?? "";
            reply.header("X-WOPI-Lock", active);
            return reply.status(200).send();
          }

          default:
            return reply.status(501).send({ error: `Unsupported X-WOPI-Override: ${override}` });
        }
      },
    );

    /**
     * Endpoint to issue a token + Collabora editor URL for a file
     * GET/POST /api/documents/:id/collabora-session
     */
    const handleCollaboraSession = async (
      req: FastifyRequest<{
        Params: WopiParams;
        Querystring: { userId?: string; userName?: string; action?: string; ext?: string };
        Body?: { userId?: string; userName?: string; action?: string; ext?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const fileId = req.params.id;
      const query = req.query || {};
      const body = (req.body as Record<string, string>) || {};

      let userId = req.userId;
      let userName = req.user?.displayName || req.user?.email;
      const userEmail = req.user?.email;

      if (!userId) {
        userId = getHeader(req, "x-user-id") || body.userId || query.userId || "anonymous-user";
      }
      if (!userName) {
        userName = body.userName || query.userName || userId;
      }
      const action = body.action || query.action || "edit";
      let ext = body.ext || query.ext || "docx";

      let canWrite = action !== "view";

      if (documentRepo) {
        try {
          const rawDoc = await documentRepo.findRawById(fileId);
          if (rawDoc) {
            if (rawDoc.deletedAt) {
              return reply.status(404).send({ error: "Document not found" });
            }
            const docWithRole = await documentRepo.getById(userId, fileId, userEmail);
            if (!docWithRole) {
              return reply.status(404).send({ error: "Document not found" });
            }

            if (docWithRole.userRole === "viewer") {
              canWrite = false;
            } else {
              canWrite = action !== "view";
            }

            if (docWithRole.mimeType) {
              const resolvedExt = resolveExtension(docWithRole.mimeType);
              if (resolvedExt) {
                ext = resolvedExt.replace(/^\./, "");
              }
            }
          }
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

      // Ensure file exists in storage; if not, create an empty document placeholder
      try {
        await storage.getFileInfo(fileId);
      } catch (err: unknown) {
        if (err instanceof WopiFileNotFoundError && storage.createFile) {
          let initialBuffer = Buffer.alloc(0);
          if (ext === "docx") {
            try {
              initialBuffer = Buffer.from(
                await exportDocumentToDocx({
                  title: fileId,
                  paragraphs: [
                    {
                      children: [
                        {
                          type: "text",
                          text: "Welcome to CiteDocs. Start writing your academic document...",
                        },
                      ],
                    },
                  ],
                }),
              );
            } catch {
              initialBuffer = Buffer.alloc(0);
            }
          }
          await storage.createFile(fileId, `${fileId}.${ext}`, userId, initialBuffer);
        }
      }

      // Create signed short-lived token
      const tokenResult = createWopiToken(
        {
          fileId,
          userId,
          userName,
          canWrite,
        },
        secretKey,
      );

      // Determine server base URL
      const host = req.headers.host || "localhost:3000";
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const baseServerUrl = options.serverUrl || `${protocol}://${host}`;
      const wopiSrc = `${baseServerUrl}/wopi/files/${fileId}`;

      const actionUrl = await discoveryService.getEditorUrl({
        wopiSrc,
        ext,
        action,
      });

      return reply.status(200).send({
        actionUrl,
        wopiSrc,
        accessToken: tokenResult.token,
        accessTokenTtl: tokenResult.expiresAt,
        collaboraUrl: process.env.COLLABORA_PUBLIC_URL || process.env.COLLABORA_URL || "http://localhost:9980",
      });
    };

    fastify.get<{
      Params: WopiParams;
      Querystring: { userId?: string; userName?: string; action?: string; ext?: string };
    }>("/api/documents/:id/collabora-session", { preHandler: requireAuth }, handleCollaboraSession);

    fastify.post<{
      Params: WopiParams;
      Querystring: { userId?: string; userName?: string; action?: string; ext?: string };
      Body?: { userId?: string; userName?: string; action?: string; ext?: string };
    }>("/api/documents/:id/collabora-session", { preHandler: requireAuth }, handleCollaboraSession);
  };
};
