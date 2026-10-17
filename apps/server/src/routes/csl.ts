import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { StyleRegistry } from "@citedocs/csl-engine";

const registry = new StyleRegistry();
// Bundled assets change only with a new build. Cache only known IDs, never user input.
const assets = new Map(
  registry.list().map((style) => {
    const body = JSON.stringify({ ...style, xml: registry.getXml(style.id) });
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    return [style.id, { body, etag }];
  }),
);

export const cslRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { q?: string };
  }>("/api/csl/styles", async (request) => {
    const query = request.query.q;
    if (query) {
      return registry.search(query);
    }
    return registry.list();
  });

  fastify.get<{
    Params: { id: string };
  }>("/api/csl/styles/:id", async (request, reply) => {
    const asset = assets.get(request.params.id);
    if (!asset) {
      return reply.status(404).send({ error: "Style not found" });
    }
    reply.header("ETag", asset.etag);
    reply.header("Cache-Control", "public, no-cache");
    const condition = request.headers["if-none-match"];
    if (
      condition?.split(",").some((tag) => {
        const value = tag.trim().replace(/^W\//, "");
        return value === "*" || value === asset.etag;
      })
    ) {
      return reply.status(304).send();
    }
    return reply.type("application/json; charset=utf-8").send(asset.body);
  });
};
