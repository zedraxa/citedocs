import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { exportDocumentToDocx } from "@citedocs/docx-exporter";
import type { WopiStorage } from "../wopi/types.js";
import { WopiFileNotFoundError } from "../wopi/storage/inMemoryStorage.js";
import type { IDocumentRepository } from "../repositories/documentRepository.js";
import { resolveExtension } from "../documents/templates.js";
import { OwnershipError, NotFoundError } from "../repositories/errors.js";
import { requireAuth } from "../auth/middleware.js";
import { signJwt, verifyJwt, signLink, verifyLink } from "./jwt.js";

/** GUID of the official ONLYOFFICE Zotero plugin (bundled in the default plugin list). */
export const ZOTERO_PLUGIN_GUID = "asc.{BFC5D5C6-89DE-4168-9565-ABD8D1E48711}";

export interface OnlyofficeRoutesOptions {
  storage: WopiStorage;
  documentRepo?: IDocumentRepository;
  /** URL the Document Server uses to reach this API (inside the docker network). */
  internalApiUrl?: string;
  /** Internal URL of the Document Server (to download edited files). */
  documentServerInternalUrl?: string;
  /** Public path/URL of the Document Server, used by the browser. */
  documentServerPublicUrl?: string;
  fetchFn?: typeof fetch;
}

const EDIT_TYPES: Record<string, "word" | "cell" | "slide"> = {
  docx: "word", doc: "word", odt: "word", rtf: "word", txt: "word",
  xlsx: "cell", ods: "cell", csv: "cell",
  pptx: "slide", odp: "slide",
};

export const createOnlyofficeRoutes = (options: OnlyofficeRoutesOptions): FastifyPluginAsync => {
  const { storage, documentRepo } = options;
  const internalApi = (options.internalApiUrl || process.env.ONLYOFFICE_STORAGE_URL || "http://server:3000").replace(/\/$/, "");
  const dsInternal = (options.documentServerInternalUrl || process.env.ONLYOFFICE_INTERNAL_URL || "http://onlyoffice").replace(/\/$/, "");
  const dsPublic = (options.documentServerPublicUrl || process.env.ONLYOFFICE_PUBLIC_URL || "/oo").replace(/\/$/, "");
  const fetchFn = options.fetchFn || globalThis.fetch;

  return async (fastify) => {
    fastify.get<{ Params: { id: string } }>(
      "/api/documents/:id/onlyoffice-config",
      { preHandler: requireAuth },
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const fileId = req.params.id;
        const userId = req.userId;
        const userName = req.user?.displayName || req.user?.email || "CiteDocs user";
        let title = "Document";
        let ext = "docx";
        let role = "owner";

        if (documentRepo) {
          try {
            const raw = await documentRepo.findRawById(fileId);
            if (!raw || raw.deletedAt) return reply.status(404).send({ error: "Document not found" });
            const doc = await documentRepo.getById(userId, fileId, req.user?.email);
            if (!doc) return reply.status(404).send({ error: "Document not found" });
            role = doc.userRole;
            title = doc.title;
            if (doc.mimeType) ext = resolveExtension(doc.mimeType).replace(/^\./, "") || "docx";
          } catch (err) {
            if (err instanceof OwnershipError) return reply.status(403).send({ error: err.message });
            if (err instanceof NotFoundError) return reply.status(404).send({ error: err.message });
            throw err;
          }
        }

        let meta;
        try {
          meta = await storage.getFileInfo(fileId);
        } catch (err) {
          if (!(err instanceof WopiFileNotFoundError) || !storage.createFile) throw err;
          let buf = Buffer.alloc(0);
          if (ext === "docx") {
            buf = Buffer.from(await exportDocumentToDocx({ title, paragraphs: [{ children: [{ type: "text", text: "" }] }] }));
          }
          meta = await storage.createFile(fileId, `${fileId}.${ext}`, userId, buf);
        }

        const canEdit = role === "owner" || role === "editor";
        const canComment = canEdit || role === "commenter";
        const key = crypto.createHash("sha256").update(`${fileId}:${meta.version}:${meta.size}`).digest("hex").slice(0, 40);
        const fileTitle = title.toLowerCase().endsWith(`.${ext}`) ? title : `${title}.${ext}`;
        const fileSig = signLink([fileId]);
        const cbSig = signLink([fileId, userId]);

        const config: Record<string, unknown> = {
          document: {
            fileType: ext,
            key,
            title: fileTitle,
            url: `${internalApi}/api/onlyoffice/files/${encodeURIComponent(fileId)}?s=${fileSig}`,
            permissions: {
              edit: canEdit,
              comment: canComment,
              review: canEdit,
              download: true,
              print: true,
              copy: true,
            },
          },
          documentType: EDIT_TYPES[ext] || "word",
          editorConfig: {
            mode: canEdit || canComment ? "edit" : "view",
            lang: (req.headers["accept-language"] || "tr").toString().slice(0, 2) === "en" ? "en" : "tr",
            callbackUrl: `${internalApi}/api/onlyoffice/callback/${encodeURIComponent(fileId)}?u=${encodeURIComponent(userId)}&s=${cbSig}`,
            user: { id: userId, name: userName },
            customization: {
              forcesave: true,
              autosave: true,
              compactHeader: true,
              plugins: true,
              hideRightMenu: false,
              goback: { url: "/documents", text: "Belgelerim", blank: false },
            },
            plugins: { autostart: [ZOTERO_PLUGIN_GUID] },
          },
        };
        const token = signJwt({ ...config, exp: Math.floor(Date.now() / 1000) + 12 * 3600 });
        reply.header("Cache-Control", "no-store");
        return reply.send({ documentServerUrl: dsPublic, role, config: { ...config, token } });
      },
    );

    // Document Server -> storage: download the file (JWT from DS in Authorization + our link signature).
    fastify.get<{ Params: { id: string }; Querystring: { s?: string } }>(
      "/api/onlyoffice/files/:id",
      async (req, reply) => {
        const auth = (req.headers.authorization || "").replace(/^Bearer /, "");
        if (!verifyLink(req.query.s, [req.params.id]) || !verifyJwt(auth)) {
          return reply.status(401).send({ error: "unauthorized" });
        }
        try {
          const { buffer } = await storage.getFile(req.params.id);
          reply.header("Content-Type", "application/octet-stream");
          return reply.send(buffer);
        } catch (err) {
          if (err instanceof WopiFileNotFoundError) return reply.status(404).send({ error: "not found" });
          throw err;
        }
      },
    );

    // Document Server -> callback: save edited file into S3/minio storage.
    fastify.post<{ Params: { id: string }; Querystring: { s?: string; u?: string }; Body: { token?: string } }>(
      "/api/onlyoffice/callback/:id",
      async (req, reply) => {
        const fileId = req.params.id;
        const opener = req.query.u || "";
        if (!verifyLink(req.query.s, [fileId, opener])) return reply.status(401).send({ error: 1 });
        const bodyToken = req.body?.token;
        const headerToken = (req.headers.authorization || "").replace(/^Bearer /, "");
        const data =
          verifyJwt<Record<string, unknown>>(bodyToken) ||
          (verifyJwt<{ payload?: Record<string, unknown> }>(headerToken)?.payload ?? null);
        if (!data) return reply.status(401).send({ error: 1 });

        const status = Number(data.status);
        if ((status === 2 || status === 6) && typeof data.url === "string") {
          const url = data.url.replace(/^https?:\/\/[^/]+\/oo(?=\/)/, dsInternal);
          const res = await fetchFn(url);
          if (!res.ok) {
            req.log.error({ status: res.status }, "onlyoffice: failed to download edited file");
            return reply.send({ error: 1 });
          }
          const buf = Buffer.from(await res.arrayBuffer());
          const result = await storage.putFile(fileId, buf);
          if (documentRepo) {
            const editors = Array.isArray(data.users) ? (data.users as string[]) : [];
            const owner = (await documentRepo.findRawById(fileId).catch(() => null))?.ownerUserId;
            for (const uid of [...editors, opener, ...(owner ? [owner] : [])]) {
              try {
                await documentRepo.update(uid, fileId, { fileSize: result.metadata.size, updatedAt: new Date() });
                break;
              } catch {
                // try the next editor (viewers cannot update)
              }
            }
          }
          req.log.info({ fileId, size: buf.length, status }, "onlyoffice: saved");
        }
        return reply.send({ error: 0 });
      },
    );
  };
};
