import type { FastifyPluginAsync } from "fastify";
import { StyleRegistry } from "@citedocs/csl-engine";

const registry = new StyleRegistry();

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
    const style = registry.get(request.params.id);
    if (!style) {
      return reply.status(404).send({ error: "Style not found" });
    }
    const xml = registry.getXml(request.params.id);
    return { ...style, xml };
  });
};
