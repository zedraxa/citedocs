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
import {
  createWopiRoutes,
  InMemoryWopiStorage,
  S3WopiStorage,
  WopiLockManager,
  CollaboraDiscoveryService,
  type WopiStorage,
} from "./wopi/index.js";

import { zoteroWeblibRoutes } from "./zotero/routes.js";
import { ZoteroAccountService } from "./zotero/accountService.js";
import { ZoteroProxyService } from "./zotero/proxyService.js";
import { ZoteroCache, type ZoteroCacheOptions } from "./zotero/cache.js";
import { ZoteroOAuthService } from "./zotero/oauthService.js";

import { ZoteroImportService } from "./zotero/importService.js";
import { ZoteroCredentialRepository } from "./repositories/zoteroRepository.js";

import {
  createPdfRoutes,
  AttachmentRepository,
  AnnotationRepository,
  InMemoryAttachmentRepository,
  InMemoryAnnotationRepository,
  type AttachmentStorage,
  InMemoryAttachmentStorage,
  S3AttachmentStorage,
  type ZoteroAnnotationSyncService,
} from "./pdf/index.js";

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

import {
  DocumentRepository,
  InMemoryDocumentRepository,
  type IDocumentRepository,
} from "./repositories/index.js";
import { createDocumentRoutes } from "./documents/index.js";
import { createOnlyofficeRoutes, OnlyofficeSessionManager } from "./onlyoffice/index.js";
import { createStyleRoutes } from "./routes/styles.js";

export * from "./db/index.js";
export * from "./repositories/index.js";
export * from "./zotero/index.js";
export * from "./wopi/index.js";
export * from "./auth/index.js";
export * from "./pdf/index.js";
export * from "./documents/index.js";
export * from "./onlyoffice/index.js";
export * from "./routes/styles.js";
export * from "./styles/styleService.js";
export * from "./storage/s3Client.js";
export { createItemRoutes, itemRoutes };

export interface BuildAppOptions {
  itemRepo?: ItemRepository;
  documentRepo?: IDocumentRepository;
  zoteroClient?: TranslationClient;
  zoteroCredentialRepo?: ZoteroCredentialRepository;
  zoteroAccountService?: ZoteroAccountService;
  zoteroProxyService?: ZoteroProxyService;
  zoteroCache?: ZoteroCache;
  zoteroCacheOptions?: ZoteroCacheOptions;
  zoteroOAuthService?: ZoteroOAuthService;

  zoteroImportService?: ZoteroImportService;
  wopiStorage?: WopiStorage;

  lockManager?: WopiLockManager;
  discoveryService?: CollaboraDiscoveryService;
  attachmentRepo?: AttachmentRepository;
  annotationRepo?: AnnotationRepository;
  attachmentStorage?: AttachmentStorage;
  pdfSyncService?: ZoteroAnnotationSyncService;
  secretKey?: string;
  serverUrl?: string;
  authRepo?: IAuthRepository;
  authService?: AuthService;
  mailer?: Mailer;
  oauthService?: OAuthService;
  enableCsrf?: boolean;
  enableRateLimit?: boolean;
  onlyofficeFetchFn?: typeof fetch;
  onlyofficeSessionManager?: OnlyofficeSessionManager;
  zoteroFetchFn?: typeof fetch;
  styleFetchFn?: typeof fetch;
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
    importService: options.zoteroImportService,
    credentialRepo,
    fetchFn: options.zoteroFetchFn,
    cache: options.zoteroCache,
    cacheOptions: options.zoteroCacheOptions,
  });



  const documentRepo =
    options.documentRepo ||
    (process.env.DATABASE_URL ? new DocumentRepository() : new InMemoryDocumentRepository());

  const isS3Configured = Boolean(
    process.env.S3_ENDPOINT ||
    process.env.S3_BUCKET ||
    process.env.S3_DOCUMENTS_BUCKET ||
    process.env.S3_ATTACHMENTS_BUCKET
  );

  const wopiStorage =
    options.wopiStorage ||
    (process.env.NODE_ENV === "test" || !isS3Configured
      ? new InMemoryWopiStorage()
      : new S3WopiStorage());

  await fastify.register(
    createDocumentRoutes({
      documentRepo,
      wopiStorage,
    })
  );

  await fastify.register(
    createWopiRoutes({
      storage: wopiStorage,
      lockManager: options.lockManager,
      discoveryService: options.discoveryService,
      secretKey: options.secretKey,
      serverUrl: options.serverUrl || process.env.WOPI_SERVER_URL,
      documentRepo,
    }),
  );

  const sessionManager = options.onlyofficeSessionManager || new OnlyofficeSessionManager();

  await fastify.register(
    createOnlyofficeRoutes({
      storage: wopiStorage,
      documentRepo,
      sessionManager,
      fetchFn: options.onlyofficeFetchFn,
    }),
  );

  await fastify.register(
    createStyleRoutes({
      documentRepo,
      wopiStorage,
      sessionManager,
      fetchFn: options.styleFetchFn,
    }),
  );

  const attachmentRepo =
    options.attachmentRepo ||
    (process.env.NODE_ENV === "test"
      ? new InMemoryAttachmentRepository()
      : new AttachmentRepository());
  const annotationRepo =
    options.annotationRepo ||
    (process.env.NODE_ENV === "test"
      ? new InMemoryAnnotationRepository()
      : new AnnotationRepository());
  const attachmentStorage =
    options.attachmentStorage ||
    (process.env.NODE_ENV === "test" || !isS3Configured
      ? new InMemoryAttachmentStorage()
      : new S3AttachmentStorage());

  await fastify.register(
    createPdfRoutes({
      attachmentRepo,
      annotationRepo,
      storage: attachmentStorage,
      syncService: options.pdfSyncService,
      accountService: options.zoteroAccountService,
    }),
  );

  return fastify;
}

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      const { runMigrations } = await import("./db/migrate.js");
      await runMigrations();
    } catch (e) {
      console.warn("Database auto-migration warning:", e);
    }
  }

  // Ensure every S3/MinIO bucket the server uses exists on startup
  const isS3Configured = Boolean(
    process.env.S3_ENDPOINT ||
    process.env.S3_BUCKET ||
    process.env.S3_DOCUMENTS_BUCKET ||
    process.env.S3_ATTACHMENTS_BUCKET
  );
  if (isS3Configured) {
    try {
      const { ensureAllStorageBuckets } = await import("./storage/s3Client.js");
      await ensureAllStorageBuckets({
        logger: {
          info: (msg) => console.log(`[Storage Init] ${msg}`),
          warn: (msg, err) => console.warn(`[Storage Init Warning] ${msg}`, err ?? ""),
        },
      });
    } catch (e) {
      console.warn("Storage auto-bucket creation warning:", e);
    }
  }

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
