import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { ZoteroAccountService, ZoteroValidationError } from "./accountService.js";
import { ZoteroProxyService } from "./proxyService.js";
import { ZoteroOAuthService } from "./oauthService.js";
import { validateLinkApiKeyInput } from "./types.js";
import type { ZoteroCredentialRepository } from "../repositories/zoteroRepository.js";

export interface ZoteroWeblibPluginOptions {
  accountService?: ZoteroAccountService;
  proxyService?: ZoteroProxyService;
  oauthService?: ZoteroOAuthService;
  credentialRepo?: ZoteroCredentialRepository;
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

  // 6. Translation-Server Search Proxy: POST /api/zotero/translation/search
  // Directly contacts the translation-server microservice at port 1969
  fastify.post("/api/zotero/translation/search", async (request: FastifyRequest, reply: FastifyReply) => {
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
  });

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
