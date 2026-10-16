import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { cslRoutes } from "./routes/csl.js";
import { zoteroRoutes } from "./routes/zotero.js";
import { createCollabServer } from "./collab/server.js";

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(healthRoutes);
  await fastify.register(cslRoutes);
  await fastify.register(zoteroRoutes);

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
