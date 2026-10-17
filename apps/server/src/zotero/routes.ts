import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { ZoteroAccountService, ZoteroValidationError } from "./accountService.js";
import { ZoteroProxyService } from "./proxyService.js";
import { ZoteroOAuthService } from "./oauthService.js";
import {
  ZoteroImportService,
  type ImportReferencesInput,
  ImportValidationError,
  ImportPayloadTooLargeError,
  ImportZoteroUnlinkedError,
  ImportSaveError,
  ImportTranslationError,
} from "./importService.js";
import { validateLinkApiKeyInput } from "./types.js";
import { ZoteroCredentialRepository } from "../repositories/zoteroRepository.js";
import { zoteroOAuthConfigured, startZoteroOAuth, finishZoteroOAuth, getPendingOAuth } from "./oauth1.js";
import { normalizeIdentifier } from "@citedocs/zotero-core";

import { ZoteroCache, type ZoteroCacheOptions } from "./cache.js";

export interface ZoteroWeblibPluginOptions {
  accountService?: ZoteroAccountService;
  proxyService?: ZoteroProxyService;
  oauthService?: ZoteroOAuthService;
  importService?: ZoteroImportService;
  credentialRepo?: ZoteroCredentialRepository;
  fetchFn?: typeof fetch;
  cache?: ZoteroCache;
  cacheOptions?: ZoteroCacheOptions;
}



export const zoteroWeblibRoutes: FastifyPluginAsync<ZoteroWeblibPluginOptions> = async (
  fastify,
  options
) => {
  const accountService =
    options.accountService ||
    new ZoteroAccountService({
      credentialRepo: options.credentialRepo,
    });

  const proxyService =
    options.proxyService ||
    new ZoteroProxyService({
      accountService,
      fetchFn: options.fetchFn,
      cache: options.cache,
      cacheOptions: options.cacheOptions,
    });


  const oauthService =
    options.oauthService ||
    new ZoteroOAuthService(accountService);

  // Authentication hook for all account, config, and proxy endpoints
  fastify.addHook("preHandler", requireAuth);

  // 1. GET /api/zotero/account - Get current linking status and masked key
  fastify.get("/api/zotero/account", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await accountService.getStatus(request.userId);
      return reply.status(200).send({
        success: true,
        ...status,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // 2. POST /api/zotero/account - Link API key, validate against zotero.org, save encrypted at rest
  fastify.post("/api/zotero/account", async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = validateLinkApiKeyInput(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid input",
        message: parseResult.error,
      });
    }

    try {
      const status = await accountService.linkApiKey(request.userId, parseResult.data.apiKey);
      return reply.status(200).send({
        success: true,
        ...status,
      });
    } catch (err: unknown) {
      if (err instanceof ZoteroValidationError) {
        return reply.status(err.statusCode).send({
          error: "Validation failed",
          message: err.message,
        });
      }
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // 3. DELETE /api/zotero/account - Unlink account and wipe credentials
  fastify.delete("/api/zotero/account", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const unlinked = await accountService.unlink(request.userId);
      proxyService.getCache().invalidateUser(request.userId);
      return reply.status(200).send({
        success: true,
        unlinked,
      });
    } catch (err: unknown) {

      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // 4. GET /api/zotero/config - Config endpoint for the web-library client
  fastify.get("/api/zotero/config", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await accountService.getConfig(request.userId);
      return reply.status(200).send({
        success: true,
        config,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // 5. OAuth 1.0a Skeletons
  fastify.get("/api/zotero/oauth/initiate", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string> | undefined;
    const callbackUrl = query?.callbackUrl || "http://localhost:5173/zotero/callback";

    try {
      const res = await oauthService.initiate(request.userId, callbackUrl);
      return reply.status(200).send({
        success: true,
        ...res,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  fastify.post("/api/zotero/oauth/callback", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { oauthToken?: string; oauthVerifier?: string };
    if (!body.oauthToken || !body.oauthVerifier) {
      return reply.status(400).send({
        error: "Missing parameters",
        message: "oauthToken and oauthVerifier are required",
      });
    }

    try {
      const status = await oauthService.handleCallback(request.userId, {
        oauthToken: body.oauthToken,
        oauthVerifier: body.oauthVerifier,
      });
      return reply.status(200).send({
        success: true,
        ...status,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  // Plugin credentials: lets the editor page pre-configure the ONLYOFFICE Zotero plugin
  // (localStorage zoteroUserId/zoteroApiKey) so students never paste a key.
  const fetchFn = options.fetchFn || globalThis.fetch;
  const credRepo =
    options.credentialRepo ||
    (accountService as unknown as { credentialRepo?: ZoteroCredentialRepository }).credentialRepo ||
    new ZoteroCredentialRepository();

  const importService =
    options.importService ||
    new ZoteroImportService({
      credentialRepo: credRepo,
      fetchFn,
      translationServerUrl: process.env.TRANSLATION_SERVER_URL,
    });


  fastify.get("/api/zotero/plugin-credentials", async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "no-store, private");
    const cred = await credRepo.get(request.userId).catch(() => null);
    if (!cred?.apiKey) return reply.send({ linked: false, oauthAvailable: zoteroOAuthConfigured() });
    let zoteroUserId = cred.zoteroUserId;
    if (!zoteroUserId) {
      const r = await fetchFn(`https://api.zotero.org/keys/${encodeURIComponent(cred.apiKey)}`).catch(() => null);
      if (r?.ok) {
        const keyData = (await r.json().catch(() => ({}))) as { userID?: number };
        if (keyData.userID) {
          zoteroUserId = String(keyData.userID);
          await credRepo.save(request.userId, { apiKey: cred.apiKey, zoteroUserId }).catch(() => null);
        }
      }
    }
    return reply.send({ linked: true, zoteroUserId, apiKey: cred.apiKey, oauthAvailable: zoteroOAuthConfigured() });
  });

  // Real OAuth 1.0a "Connect Zotero" (needs ZOTERO_OAUTH_CLIENT_KEY/SECRET from zotero.org/oauth/apps).
  fastify.get("/api/zotero/oauth/start", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = (request.query || {}) as { returnTo?: string };
    const returnTo = q.returnTo && q.returnTo.startsWith("/") && !q.returnTo.startsWith("//") ? q.returnTo : "/documents";
    const sep = returnTo.includes("?") ? "&" : "?";
    const accept = request.headers.accept || "";
    const isBrowser = accept.includes("text/html") || Boolean(q.returnTo && !accept.includes("application/json"));

    if (!zoteroOAuthConfigured()) {
      if (isBrowser) {
        const errorText = encodeURIComponent("Zotero OAuth bağlantısı sunucuda yapılandırılmamış.");
        return reply.redirect(`${returnTo}${sep}zotero=not_configured&zotero_error=${errorText}`);
      }
      return reply.status(501).send({ error: "Zotero OAuth is not configured" });
    }

    const host = request.headers["x-forwarded-host"] || request.headers.host;
    const proto = request.headers["x-forwarded-proto"] || "https";
    const base = process.env.PUBLIC_URL || `${proto}://${host}`;
    try {
      const url = await startZoteroOAuth(request.userId, `${base}/api/zotero/oauth/return`, returnTo, fetchFn);
      return reply.redirect(url);
    } catch (err: unknown) {
      if (isBrowser) {
        const errorText = encodeURIComponent("Zotero sunucusu ile bağlantı kurulamadı. Lütfen tekrar deneyin.");
        return reply.redirect(`${returnTo}${sep}zotero=error&zotero_error=${errorText}`);
      }
      return reply.status(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get("/api/zotero/oauth/return", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = (request.query || {}) as { oauth_token?: string; oauth_verifier?: string };
    const pendingReturn = q.oauth_token ? getPendingOAuth(q.oauth_token)?.returnTo : undefined;
    const fallback = pendingReturn || "/documents";
    const fallbackSep = fallback.includes("?") ? "&" : "?";

    if (!q.oauth_token || !q.oauth_verifier) {
      return reply.redirect(`${fallback}${fallbackSep}zotero=denied`);
    }

    try {
      const r = await finishZoteroOAuth(request.userId, q.oauth_token, q.oauth_verifier, fetchFn);
      await accountService.linkApiKey(request.userId, r.apiKey);
      const sep = r.returnTo.includes("?") ? "&" : "?";
      return reply.redirect(`${r.returnTo}${sep}zotero=connected`);
    } catch (err: unknown) {
      request.log.warn({ err }, "zotero oauth failed");
      return reply.redirect(`${fallback}${fallbackSep}zotero=error`);
    }
  });

  // Add by DOI/ISBN/PMID/arXiv/URL: resolve via translation-server, then save into the
  // user's Zotero library (web API) so it shows up in the ONLYOFFICE Zotero plugin search.
  fastify.post("/api/zotero/add-by-identifier", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { identifier?: string; save?: boolean };
    const rawId = String(body.identifier || "").trim();
    if (!rawId || rawId.length > 2000) return reply.status(400).send({ error: "Identifier required" });

    const isHttpUrl = /^https?:\/\//i.test(rawId);
    const isDoiUrl = isHttpUrl && /(?:dx\.)?doi\.org\//i.test(rawId);
    const isUrl = isHttpUrl && !isDoiUrl;
    const identifier = isUrl ? rawId : normalizeIdentifier(rawId);

    const tsUrl = (process.env.TRANSLATION_SERVER_URL || "http://translation-server:1969").replace(/\/$/, "");
    let items: Record<string, unknown>[] = [];
    try {
      const r = await fetchFn(`${tsUrl}/${isUrl ? "web" : "search"}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", Accept: "application/json" },
        body: identifier,
      });
      if (r.status === 300) return reply.status(422).send({ error: "URL lists several items; open a single item page" });
      if (!r.ok) return reply.status(404).send({ error: "Not found", upstreamStatus: r.status });
      const data = await r.json();
      items = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
    } catch {
      return reply.status(502).send({ error: "translation-server unavailable" });
    }

    items = items.filter((i) => i && typeof i === "object" && i.itemType && i.itemType !== "attachment" && i.itemType !== "note");
    if (!items.length) return reply.status(404).send({ error: "Nothing found" });

    const clean = items.slice(0, 1).map((i) => {
      const { key, version, attachments, notes, seeAlso, id, ...rest } = i as Record<string, unknown>;
      void key; void version; void attachments; void notes; void seeAlso; void id;
      return rest;
    });

    if (body.save === false) return reply.send({ items: clean, saved: false });

    const cred = await credRepo.get(request.userId).catch(() => null);
    if (!cred?.apiKey) return reply.status(409).send({ error: "Zotero account not linked", items: clean });

    let zuid = cred.zoteroUserId;
    if (!zuid) {
      const k = await fetchFn(`https://api.zotero.org/keys/${encodeURIComponent(cred.apiKey)}`).catch(() => null);
      if (k?.ok) {
        const keyData = (await k.json().catch(() => ({}))) as { userID?: number };
        if (keyData.userID) {
          zuid = String(keyData.userID);
          await credRepo.save(request.userId, { apiKey: cred.apiKey, zoteroUserId: zuid }).catch(() => null);
        }
      }
    }
    if (!zuid) return reply.status(400).send({ error: "Could not resolve Zotero user ID" });

    const z = await fetchFn(`https://api.zotero.org/users/${zuid}/items`, {
      method: "POST",
      headers: { "Zotero-API-Key": cred.apiKey, "Zotero-API-Version": "3", "Content-Type": "application/json" },
      body: JSON.stringify(clean),
    });
    const zr = (await z.json().catch(() => ({}))) as { successful?: Record<string, { key: string }>; failed?: unknown };
    const saved = zr.successful && Object.values(zr.successful)[0];
    if (!z.ok || !saved) return reply.status(502).send({ error: "Zotero save failed", status: z.status, failed: zr.failed });
    proxyService.invalidateLibrary(request.userId, `users:${zuid}`);
    return reply.send({ saved: true, key: saved.key, item: clean[0] });
  });

  // Import references from file, pasted text, or pre-parsed items (BibTeX, RIS, CSL-JSON, EndNote XML, Zotero RDF)
  fastify.post(
    "/api/zotero/import",
    { bodyLimit: 5 * 1024 * 1024 },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body || {}) as ImportReferencesInput;

    try {
      const result = await importService.importReferences(request.userId, body);
      const cred = await credRepo.get(request.userId).catch(() => null);
      if (cred?.zoteroUserId) {
        proxyService.invalidateLibrary(request.userId, `users:${cred.zoteroUserId}`);
      }
      return reply.status(200).send(result);

    } catch (err: unknown) {
      if (err instanceof ImportValidationError) {
        return reply.status(err.statusCode).send({
          error: "Validation failed",
          message: err.message,
        });
      }
      if (err instanceof ImportPayloadTooLargeError) {
        return reply.status(413).send({
          error: "Payload Too Large",
          message: err.message,
        });
      }
      if (err instanceof ImportZoteroUnlinkedError) {
        return reply.status(409).send({
          error: err.error,
          message: err.message,
          total: err.total,
          items: err.items,
          rawItems: err.rawItems,
        });
      }
      if (err instanceof ImportSaveError) {
        return reply.status(err.statusCode).send({
          error: err.error,
          message: err.message,
          failedItems: err.failedItems,
        });
      }
      if (err instanceof ImportTranslationError) {
        return reply.status(err.statusCode).send({
          error: "Translation failed",
          message: err.message,
        });
      }

      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        error: "Internal Server Error",
        message: msg,
      });
    }
  });


  // 6. Translation-Server Search Proxy: POST /api/zotero/translation/search and POST /search
  // Directly contacts the translation-server microservice at port 1969
  const handleTranslationSearch = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | string | undefined;
    let identifier = "";

    if (typeof body === "string") {
      identifier = body;
    } else if (body && typeof body === "object") {
      const candidate = (body as Record<string, unknown>).identifier || (body as Record<string, unknown>).query;
      if (typeof candidate === "string") {
        identifier = candidate;
      }
    }

    if (!identifier.trim()) {
      return reply.status(400).send({
        error: "Invalid input",
        message: "Identifier query cannot be empty",
      });
    }

    const result = await proxyService.searchTranslationServer(identifier);
    return reply.status(result.status).send(result.data);
  };

  fastify.post("/api/zotero/translation/search", handleTranslationSearch);
  fastify.post("/search", handleTranslationSearch);

  // 7. Proxy Endpoint: ALL /api/zotero/proxy/* - Proxies to api.zotero.org using stored decrypted key
  fastify.all("/api/zotero/proxy/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const subPath = (request.params as { "*": string })["*"] || "";
    const method = request.method;
    const query = request.query as Record<string, string | string[] | undefined>;
    const body = request.body;

    const proxyResult = await proxyService.proxyToZotero(
      request.userId,
      subPath,
      method,
      query,
      body,
      request.headers as Record<string, string | undefined>
    );

    for (const [headerName, headerVal] of Object.entries(proxyResult.headers)) {
      reply.header(headerName, headerVal);
    }

    return reply.status(proxyResult.status).send(proxyResult.data);
  });
};
