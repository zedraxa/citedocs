import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { TranslationClient } from "@citedocs/zotero-core";
import { healthRoutes } from "./routes/health.js";
import { cslRoutes } from "./routes/csl.js";
import { zoteroRoutes } from "./routes/zotero.js";
import { createCollabServer } from "./collab/server.js";
import { createItemRoutes, itemRoutes } from "./routes/items.js";
import { ItemRepository } from "./repositories/itemRepository.js";

import { zoteroWeblibRoutes } from "./zotero/routes.js";
import { ZoteroAccountService } from "./zotero/accountService.js";
import { ZoteroProxyService } from "./zotero/proxyService.js";
import { ZoteroOAuthService } from "./zotero/oauthService.js";
import { ZoteroCredentialRepository } from "./repositories/zoteroRepository.js";

import {
  AuthService,
  AuthRepository,
  InMemoryAuthRepository,
  createMailer,
  authRoutes,
  type IAuthRepository,
  type Mailer,
  type OAuthService,
} from "./auth/index.js";

export * from "./db/index.js";
export * from "./repositories/index.js";
export * from "./zotero/index.js";
export * from "./auth/index.js";
export { createItemRoutes, itemRoutes };

export interface BuildAppOptions {
  itemRepo?: ItemRepository;
  zoteroClient?: TranslationClient;
  zoteroCredentialRepo?: ZoteroCredentialRepository;
  zoteroAccountService?: ZoteroAccountService;
  zoteroProxyService?: ZoteroProxyService;
  zoteroOAuthService?: ZoteroOAuthService;
  authRepo?: IAuthRepository;
  authService?: AuthService;
  mailer?: Mailer;
  oauthService?: OAuthService;
  enableCsrf?: boolean;
  enableRateLimit?: boolean;
}

/** @deprecated use BuildAppOptions */
export type AppOptions = BuildAppOptions;

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(cookie);

  if (options.enableRateLimit !== false && process.env.NODE_ENV !== "test") {
    await fastify.register(rateLimit, {
      global: false,
    });
  } else if (options.enableRateLimit) {
    await fastify.register(rateLimit, {
      global: false,
    });
  }

  const itemRepo = options.itemRepo || new ItemRepository();
  const credentialRepo = options.zoteroCredentialRepo || new ZoteroCredentialRepository();

  const mailer = options.mailer || createMailer();
  const authRepo =
    options.authRepo ||
    (process.env.DATABASE_URL ? new AuthRepository() : new InMemoryAuthRepository());
  const authService =
    options.authService ||
    new AuthService({
      authRepo,
      mailer,
      oauthService: options.oauthService,
    });

  fastify.decorate("authService", authService);

  await fastify.register(authRoutes, {
    authService,
    enableCsrf: options.enableCsrf,
    enableRateLimit: options.enableRateLimit,
  });

  await fastify.register(healthRoutes);
  await fastify.register(cslRoutes);
  await fastify.register(zoteroRoutes, {
    client: options.zoteroClient,
    itemRepo,
  });
  await fastify.register(createItemRoutes(itemRepo));
  await fastify.register(zoteroWeblibRoutes, {
    accountService: options.zoteroAccountService,
    proxyService: options.zoteroProxyService,
    oauthService: options.zoteroOAuthService,
    credentialRepo,
  });

  return fastify;
}

async function start() {
  const app = await buildApp();
  const apiPort = parseInt(process.env.PORT || "3000", 10);
  const collabPort = parseInt(process.env.COLLAB_PORT || "1234", 10);

  // Start Hocuspocus Collab WebSocket server
  const collabServer = createCollabServer(collabPort);
  await collabServer.listen();
  app.log.info(`Hocuspocus Collaboration WebSocket Server listening on port ${collabPort}`);

  // Start Fastify REST API server
  await app.listen({ port: apiPort, host: "0.0.0.0" });
  app.log.info(`CiteDocs REST API Server listening on port ${apiPort}`);
}

if (process.env.NODE_ENV !== "test" && import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
