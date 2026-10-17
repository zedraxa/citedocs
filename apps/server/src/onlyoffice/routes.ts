import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import type { WopiStorage } from "../wopi/types.js";
import { WopiFileNotFoundError } from "../wopi/storage/inMemoryStorage.js";
import type { IDocumentRepository } from "../repositories/documentRepository.js";
import { resolveExtension } from "../documents/templates.js";
import { OwnershipError, NotFoundError } from "../repositories/errors.js";
import { requireAuth } from "../auth/middleware.js";
import { signJwt, verifyJwt, signLink, verifyLink } from "./jwt.js";

/** GUID of the official ONLYOFFICE Zotero plugin installed by our deployment. */
export const ZOTERO_PLUGIN_GUID = "asc.{BFC5D5C6-89DE-4168-9565-ABD8D1E48711}";

export interface OnlyofficeRoutesOptions {
  storage: WopiStorage;
  documentRepo: IDocumentRepository;
  /** URL the Document Server uses to reach this API (inside the docker network). */
  internalApiUrl?: string;
  /** Internal URL of the Document Server (to download edited files). */
  documentServerInternalUrl?: string;
  /** Public path/URL of the Document Server, used by the browser. */
  documentServerPublicUrl?: string;
  /** Application origin when the Document Server is exposed at a relative path. */
  publicAppUrl?: string;
  fetchFn?: typeof fetch;
}

const EDIT_TYPES: Record<string, "word" | "cell" | "slide"> = {
  docx: "word",
  doc: "word",
  odt: "word",
  rtf: "word",
  txt: "word",
  xlsx: "cell",
  ods: "cell",
  csv: "cell",
  pptx: "slide",
  odp: "slide",
};

/** Unknown roles fail closed to view-only. */
export function permissionsForRole(role: string) {
  const edit = role === "owner" || role === "editor";
  return {
    mode: edit ? "edit" : "view",
    permissions: { edit, comment: edit, review: edit, download: true, print: true, copy: true },
  };
}

export const createOnlyofficeRoutes = (options: OnlyofficeRoutesOptions): FastifyPluginAsync => {
  const { storage, documentRepo } = options;
  const internalApi = (
    options.internalApiUrl ||
    process.env.ONLYOFFICE_STORAGE_URL ||
    "http://server:3000"
  ).replace(/\/$/, "");
  const dsInternal = (
    options.documentServerInternalUrl ||
    process.env.ONLYOFFICE_INTERNAL_URL ||
    "http://onlyoffice"
  ).replace(/\/$/, "");
  const dsPublic = (
    options.documentServerPublicUrl ||
    process.env.ONLYOFFICE_PUBLIC_URL ||
    "/oo"
  ).replace(/\/$/, "");
  const publicServer = new URL(
    dsPublic,
    options.publicAppUrl || process.env.PUBLIC_URL || "http://localhost:5173",
  );
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

        {
          try {
            const raw = await documentRepo.findRawById(fileId);
            if (!raw || raw.deletedAt)
              return reply.status(404).send({ error: "Document not found" });
            const doc = await documentRepo.getById(userId, fileId, req.user?.email);
            if (!doc) return reply.status(404).send({ error: "Document not found" });
            role = doc.userRole;
            title = doc.title;
            if (doc.mimeType) ext = resolveExtension(doc.mimeType).replace(/^\./, "") || "docx";
          } catch (err) {
            if (err instanceof OwnershipError)
              return reply.status(403).send({ error: err.message });
            if (err instanceof NotFoundError) return reply.status(404).send({ error: err.message });
            throw err;
          }
        }

        // Missing binaries must not silently become empty documents.
        let meta;
        try {
          meta = await storage.getFileInfo(fileId);
        } catch (err) {
          if (err instanceof WopiFileNotFoundError)
            return reply.status(404).send({ error: "Document file not found" });
          throw err;
        }

        const { permissions, mode } = permissionsForRole(role);
        const key = crypto
          .createHash("sha256")
          .update(`${fileId}:${meta.version}:${meta.size}`)
          .digest("hex")
          .slice(0, 40);
        const fileTitle = title.toLowerCase().endsWith(`.${ext}`) ? title : `${title}.${ext}`;
        const expires = String(Math.floor(Date.now() / 1000) + 12 * 3600);
        const fileSig = signLink(["file", fileId, expires]);
        const email = req.user?.email || "";
        const cbSig = signLink(["callback", fileId, userId, email, key]);
        const callbackQuery = new URLSearchParams({ u: userId, e: email, k: key, s: cbSig });

        const config: Record<string, unknown> = {
          document: {
            fileType: ext,
            key,
            title: fileTitle,
            url: `${internalApi}/api/onlyoffice/files/${encodeURIComponent(fileId)}?s=${fileSig}&expires=${expires}`,
            permissions,
          },
          documentType: EDIT_TYPES[ext] || "word",
          editorConfig: {
            mode,
            lang:
              (req.headers["accept-language"] || "tr").toString().slice(0, 2) === "en"
                ? "en"
                : "tr",
            callbackUrl: `${internalApi}/api/onlyoffice/callback/${encodeURIComponent(fileId)}?${callbackQuery}`,
            user: { id: userId, name: userName },
            customization: {
              forcesave: false,
              autosave: true,
              compactHeader: true,
              plugins: true,
              hideRightMenu: false,
              leftMenu: true,
              goback: { url: "/documents", text: "Belgelerim", blank: false },
            },
            // The deployment installs this pinned plugin locally; its inside mode opens the left panel.
            plugins: {
              autostart: [ZOTERO_PLUGIN_GUID],
              pluginsData: [
                `${publicServer.href.replace(/\/$/, "")}/sdkjs-plugins/zotero/config.json`,
              ],
            },
          },
        };
        const token = signJwt({ ...config, exp: Math.floor(Date.now() / 1000) + 12 * 3600 });
        reply.header("Cache-Control", "no-store");
        return reply.send({ documentServerUrl: dsPublic, role, config: { ...config, token } });
      },
    );

    // Document Server -> storage: download the file (JWT from DS in Authorization + our link signature).
    fastify.get<{ Params: { id: string }; Querystring: { s?: string; expires?: string } }>(
      "/api/onlyoffice/files/:id",
      async (req, reply) => {
        const auth = (req.headers.authorization || "").replace(/^Bearer /, "");
        if (
          !req.query.expires ||
          !/^\d+$/.test(req.query.expires) ||
          Number(req.query.expires) <= Date.now() / 1000 ||
          !verifyLink(req.query.s, ["file", req.params.id, req.query.expires]) ||
          !verifyJwt(auth)
        ) {
          return reply.status(401).send({ error: "unauthorized" });
        }
        try {
          const { buffer } = await storage.getFile(req.params.id);
          reply.header("Content-Type", "application/octet-stream");
          return reply.send(buffer);
        } catch (err) {
          if (err instanceof WopiFileNotFoundError)
            return reply.status(404).send({ error: "not found" });
          throw err;
        }
      },
    );

    // Document Server -> callback: save edited file into S3/minio storage.
    fastify.post<{
      Params: { id: string };
      Querystring: { s?: string; u?: string; e?: string; k?: string };
      Body: { token?: string };
    }>("/api/onlyoffice/callback/:id", async (req, reply) => {
      const fileId = req.params.id;
      const { u: opener = "", e: email = "", k: key = "", s: signature } = req.query;
      if (!key || !verifyLink(signature, ["callback", fileId, opener, email, key])) {
        return reply.status(401).send({ error: 1 });
      }
      const headerToken = (req.headers.authorization || "").replace(/^Bearer /i, "");
      const data =
        req.body?.token !== undefined
          ? verifyJwt<Record<string, unknown>>(req.body.token)
          : verifyJwt<{ payload?: Record<string, unknown> }>(headerToken)?.payload;
      if (!data || data.key !== key || ![1, 2, 3, 4, 6, 7].includes(data.status as number)) {
        return reply.status(401).send({ error: 1 });
      }
      if (data.status !== 2 && data.status !== 6) return reply.send({ error: 0 });

      try {
        const doc = await documentRepo.getById(opener, fileId, email);
        if (!doc || !permissionsForRole(doc.userRole).permissions.edit) {
          return reply.status(403).send({ error: 1 });
        }
        if (typeof data.url !== "string") return reply.send({ error: 1 });
        let download = new URL(data.url);
        const internal = new URL(dsInternal);
        if (download.username || download.password) return reply.send({ error: 1 });
        const publicPath = publicServer.pathname.replace(/\/$/, "");
        if (
          download.origin === publicServer.origin &&
          download.pathname.startsWith(`${publicPath}/`)
        ) {
          download = new URL(
            `${download.pathname.slice(publicPath.length)}${download.search}`,
            internal,
          );
        }
        // Only fetch this Document Server; never follow redirects to another host.
        if (download.origin !== internal.origin || download.username || download.password) {
          return reply.send({ error: 1 });
        }
        const res = await fetchFn(download.href, {
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return reply.send({ error: 1 });
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return reply.send({ error: 1 });
        const result = await storage.putFile(fileId, buf);
        await documentRepo.update(doc.ownerUserId, fileId, {
          fileSize: result.metadata.size,
          updatedAt: new Date(),
        });
        req.log.info({ fileId, size: buf.length, status: data.status }, "onlyoffice: saved");
        return reply.send({ error: 0 });
      } catch {
        // Do not log upstream URLs/tokens; DS retries saves when error is nonzero.
        req.log.error({ fileId }, "onlyoffice: save failed");
        return reply.send({ error: 1 });
      }
    });
  };
};
