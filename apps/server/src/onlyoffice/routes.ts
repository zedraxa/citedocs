import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import type { WopiStorage } from "../wopi/types.js";
import { WopiFileNotFoundError } from "../wopi/storage/inMemoryStorage.js";
import type { IDocumentRepository } from "../repositories/documentRepository.js";
import { resolveExtension } from "../documents/templates.js";
import { OwnershipError, NotFoundError } from "../repositories/errors.js";
import { requireAuth } from "../auth/middleware.js";
import { assertUserQuota, StorageQuotaExceededError } from "../documents/quota.js";
import { signJwt, verifyJwt, signLink, verifyLink } from "./jwt.js";
import { OnlyofficeSessionManager } from "./session.js";

/** GUID of the official ONLYOFFICE Zotero plugin installed by our deployment. */
export const ZOTERO_PLUGIN_GUID = "asc.{BFC5D5C6-89DE-4168-9565-ABD8D1E48711}";

export interface OnlyofficeRoutesOptions {
  storage: WopiStorage;
  documentRepo: IDocumentRepository;
  sessionManager?: OnlyofficeSessionManager;
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
  const sessionManager = options.sessionManager || new OnlyofficeSessionManager();
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
        const key = sessionManager.getOrCreateSessionKey(fileId, meta.version, meta.size);
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
            lang: "tr",
            region: "tr-TR",
            callbackUrl: `${internalApi}/api/onlyoffice/callback/${encodeURIComponent(fileId)}?${callbackQuery}`,
            user: { id: userId, name: userName },
            customization: {
              forcesave: true,
              autosave: true,
              compactHeader: true,
              plugins: true,
              hideRightMenu: false,
              leftMenu: true,
              spellcheck: true,
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

    // Document Server -> storage: download the file (JWT from DS in Authorization or query token + our link signature).
    fastify.get<{ Params: { id: string }; Querystring: { s?: string; expires?: string; token?: string } }>(
      "/api/onlyoffice/files/:id",
      async (req, reply) => {
        const auth = (
          req.headers.authorization ||
          (req.query as { token?: string }).token ||
          ""
        ).replace(/^Bearer /i, "");
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
      const bodyData =
        req.body?.token !== undefined
          ? verifyJwt<Record<string, unknown>>(req.body.token)
          : null;
      const headerToken = (req.headers.authorization || "").replace(/^Bearer /i, "");
      const headerData = headerToken ? verifyJwt<Record<string, unknown>>(headerToken) : null;
      const rawData = bodyData || headerData;
      const data =
        rawData?.payload && typeof rawData.payload === "object"
          ? (rawData.payload as Record<string, unknown>)
          : rawData;
      if (!data || data.key !== key || ![1, 2, 3, 4, 6, 7].includes(data.status as number)) {
        return reply.status(401).send({ error: 1 });
      }

      // Handle Document Server save error notifications (status 3: saving error, status 7: forcesave error)
      if (data.status === 3 || data.status === 7) {
        req.log.warn(
          { fileId, status: data.status, key },
          "onlyoffice: document server reported save error (status 3/7)",
        );
        return reply.send({ error: 0 });
      }

      // Handle non-save status notifications
      if (data.status === 1) {
        req.log.info({ fileId, status: data.status }, "onlyoffice: document is being edited");
        return reply.send({ error: 0 });
      }
      if (data.status === 4) {
        req.log.info(
          { fileId, status: data.status },
          "onlyoffice: document closed with no changes",
        );
        sessionManager.closeSession(fileId);
        return reply.send({ error: 0 });
      }

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

        const contentHash = crypto.createHash("sha256").update(buf).digest("hex");

        // Deduplicate repeated status 6 (or status 2) saves with identical content
        if (data.status === 6 && sessionManager.isIdenticalContent(fileId, contentHash)) {
          req.log.info(
            { fileId, status: data.status, forcesavetype: data.forcesavetype },
            "onlyoffice: status 6 identical content deduplicated, skipping storage write",
          );
          return reply.send({ error: 0 });
        }

        if (data.status === 2 && sessionManager.isIdenticalContent(fileId, contentHash)) {
          req.log.info(
            { fileId, status: data.status },
            "onlyoffice: status 2 session closed (content already persisted via force-save)",
          );
          sessionManager.closeSession(fileId);
          return reply.send({ error: 0 });
        }

        // Quota accounting: must reflect replacement of the existing object, not addition.
        await assertUserQuota(documentRepo, doc.ownerUserId, buf.length, doc.fileSize || 0);

        const result = await storage.putFile(fileId, buf);
        await documentRepo.update(doc.ownerUserId, fileId, {
          fileSize: result.metadata.size,
          updatedAt: new Date(),
        });

        // Status 6 advances the version while preserving the live co-editing key.
        sessionManager.recordSave(
          fileId,
          contentHash,
          result.metadata.size,
          result.metadata.version,
          key,
        );

        if (data.status === 2) {
          sessionManager.closeSession(fileId);
        }

        req.log.info(
          { fileId, size: buf.length, status: data.status, forcesavetype: data.forcesavetype },
          "onlyoffice: saved",
        );
        return reply.send({ error: 0 });
      } catch (err) {
        if (err instanceof StorageQuotaExceededError) {
          req.log.warn({ fileId, err: err.message }, "onlyoffice: storage quota exceeded");
          return reply.send({ error: 1 });
        }
        // Do not log upstream URLs/tokens; DS retries saves when error is nonzero.
        req.log.error({ fileId, err }, "onlyoffice: save failed");
        return reply.send({ error: 1 });
      }
    });

    // Student -> convert ODT document to DOCX copy via ONLYOFFICE ConvertService
    fastify.post<{ Params: { id: string } }>(
      "/api/documents/:id/convert-to-docx",
      { preHandler: requireAuth },
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const fileId = req.params.id;
        const userId = req.userId;
        const userEmail = req.user?.email;

        // 1. Verify existence and user access
        let doc;
        try {
          doc = await documentRepo.getById(userId, fileId, userEmail);
          if (!doc) {
            return reply.status(404).send({ error: "Belge bulunamadı" });
          }
        } catch (err) {
          if (err instanceof OwnershipError) {
            return reply.status(403).send({ error: err.message });
          }
          if (err instanceof NotFoundError) {
            return reply.status(404).send({ error: "Belge bulunamadı" });
          }
          throw err;
        }

        // 2. Only allow converting ODT files
        const isOdt =
          doc.mimeType?.includes("opendocument") ||
          doc.title.toLowerCase().endsWith(".odt");
        if (!isOdt) {
          return reply.status(400).send({
            error: "Yalnızca ODT formatındaki belgeler DOCX kopyasına dönüştürülebilir",
          });
        }

        // 3. Ensure source file exists in storage
        try {
          await storage.getFileInfo(fileId);
        } catch (err) {
          if (err instanceof WopiFileNotFoundError) {
            return reply.status(404).send({ error: "Belge bulunamadı" });
          }
          throw err;
        }

        // 4. Create signed link and token for ONLYOFFICE ConvertService to download the source file
        const expires = String(Math.floor(Date.now() / 1000) + 3600);
        const fileSig = signLink(["file", fileId, expires]);
        const downloadToken = signJwt({
          fileId,
          exp: Math.floor(Date.now() / 1000) + 3600,
        });
        const fileUrl = `${internalApi}/api/onlyoffice/files/${encodeURIComponent(fileId)}?s=${fileSig}&expires=${expires}&token=${downloadToken}`;

        // 5. Send conversion request to ONLYOFFICE ConvertService
        const conversionKey = crypto.randomUUID();
        const sourceTitle = doc.title.toLowerCase().endsWith(".odt")
          ? doc.title
          : `${doc.title}.odt`;

        const conversionPayload = {
          async: false,
          filetype: "odt",
          key: conversionKey,
          outputtype: "docx",
          title: sourceTitle,
          url: fileUrl,
        };
        const token = signJwt({
          ...conversionPayload,
          payload: conversionPayload,
          exp: Math.floor(Date.now() / 1000) + 3600,
        });

        const convertUrl = `${dsInternal}/ConvertService.ashx`;
        let convertRes: Response;
        try {
          convertRes = await fetchFn(convertUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              ...conversionPayload,
              token,
            }),
            signal: AbortSignal.timeout(60_000),
          });
        } catch (err) {
          req.log.error({ fileId, err }, "onlyoffice: conversion network request failed");
          return reply.status(502).send({
            error: "Dönüştürme servisine bağlanılamadı. Lütfen tekrar deneyin.",
          });
        }

        if (!convertRes.ok) {
          req.log.error(
            { fileId, status: convertRes.status },
            "onlyoffice: conversion service returned HTTP error",
          );
          return reply.status(502).send({
            error: "Dönüştürme servisi hata yanıtı döndürdü",
          });
        }

        let convertData: { endConvert?: boolean; fileUrl?: string; error?: number };
        try {
          convertData = (await convertRes.json()) as {
            endConvert?: boolean;
            fileUrl?: string;
            error?: number;
          };
        } catch (err) {
          req.log.error({ fileId, err }, "onlyoffice: failed to parse conversion response");
          return reply.status(502).send({
            error: "Dönüştürme servisinin yanıtı ayrıştırılamadı",
          });
        }

        if (convertData.error !== undefined && convertData.error !== 0) {
          req.log.error(
            { fileId, errorCode: convertData.error },
            "onlyoffice: conversion service returned error code",
          );
          return reply.status(502).send({
            error: "Belge dönüştürülürken ONLYOFFICE hatası oluştu",
          });
        }

        if (!convertData.fileUrl || typeof convertData.fileUrl !== "string") {
          req.log.error({ fileId, convertData }, "onlyoffice: missing fileUrl in conversion result");
          return reply.status(502).send({
            error: "Dönüştürülen belge adresi alınamadı",
          });
        }

        // 6. Download the converted DOCX from Document Server
        let downloadUrl = new URL(convertData.fileUrl);
        const internal = new URL(dsInternal);
        if (downloadUrl.username || downloadUrl.password) {
          return reply.status(502).send({ error: "Geçersiz dönüştürme indirme adresi" });
        }
        const publicPath = publicServer.pathname.replace(/\/$/, "");
        if (
          downloadUrl.origin === publicServer.origin &&
          downloadUrl.pathname.startsWith(`${publicPath}/`)
        ) {
          downloadUrl = new URL(
            `${downloadUrl.pathname.slice(publicPath.length)}${downloadUrl.search}`,
            internal,
          );
        }
        if (downloadUrl.origin !== internal.origin || downloadUrl.username || downloadUrl.password) {
          req.log.error({ origin: downloadUrl.origin }, "onlyoffice: untrusted download host");
          return reply.status(502).send({
            error: "Güvenlik kısıtlaması nedeniyle dönüştürülen dosya indirilemedi",
          });
        }

        let downloadRes: Response;
        try {
          downloadRes = await fetchFn(downloadUrl.href, {
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
          });
        } catch (err) {
          req.log.error({ fileId, err }, "onlyoffice: failed to download converted file");
          return reply.status(502).send({
            error: "Dönüştürülen belge indirilemedi",
          });
        }

        if (!downloadRes.ok) {
          return reply.status(502).send({
            error: "Dönüştürülen belge dosyası sunucudan alınamadı",
          });
        }

        const docxBuf = Buffer.from(await downloadRes.arrayBuffer());
        if (!docxBuf.length) {
          return reply.status(502).send({
            error: "Dönüştürülen dosya içeriği boş",
          });
        }

        // 7. Check user quota for new document
        try {
          await assertUserQuota(documentRepo, userId, docxBuf.length);
        } catch (err: unknown) {
          if (err instanceof StorageQuotaExceededError) {
            return reply.status(413).send({
              error: "Depolama alanınız yetersiz, kopya oluşturulamadı",
              used: err.used,
              quota: err.quota,
            });
          }
          throw err;
        }

        // 8. Store the new DOCX document
        const newDocId = crypto.randomUUID();
        const baseTitle = doc.title.replace(/\.odt$/i, "");
        const newTitle = `${baseTitle}.docx`;
        const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const s3Key = `users/${userId}/documents/${newDocId}.docx`;

        if (storage.createFile) {
          await storage.createFile(newDocId, newTitle, userId, docxBuf, docxMime);
        } else {
          await storage.putFile(newDocId, docxBuf);
        }

        const newDoc = await documentRepo.create(userId, {
          id: newDocId,
          title: newTitle,
          s3ObjectKey: s3Key,
          fileSize: docxBuf.length,
          mimeType: docxMime,
        });

        return reply.status(201).send({ document: newDoc });
      },
    );
  };
};
