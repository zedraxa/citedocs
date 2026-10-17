import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { StyleRegistry } from "@citedocs/csl-engine";

const registry = new StyleRegistry();
// Bundled assets change only with a new build. Cache only known IDs, never user input.
const assets = new Map(
  registry.list().map((style) => {
    const xml = registry.getXml(style.id) || "";
    const body = JSON.stringify({ ...style, xml });
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    const xmlEtag = `"${createHash("sha256").update(xml).digest("hex")}"`;
    return [style.id, { body, xml, etag, xmlEtag }];
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
    Querystring: { format?: string };
  }>("/api/csl/styles/:id", async (request, reply) => {
    const rawId = request.params.id;
    const isCslExt = rawId.endsWith(".csl") || rawId.endsWith(".xml");
    const styleId = rawId.replace(/\.(csl|xml)$/, "");
    const asset = assets.get(styleId);
    if (!asset) {
      return reply.status(404).send({ error: "Style not found" });
    }

    const accept = request.headers["accept"] || "";
    const wantsXml =
      isCslExt ||
      request.query.format === "xml" ||
      request.query.format === "csl" ||
      accept.includes("application/vnd.citationstyles.style+xml") ||
      accept.includes("application/xml") ||
      accept.includes("text/xml");

    if (wantsXml) {
      if (!asset.xml) {
        return reply.status(404).send({ error: "Style XML not available" });
      }
      reply.header("ETag", asset.xmlEtag);
      reply.header("Cache-Control", "public, no-cache");
      const condition = request.headers["if-none-match"];
      if (
        condition?.split(",").some((tag) => {
          const value = tag.trim().replace(/^W\//, "");
          return value === "*" || value === asset.xmlEtag;
        })
      ) {
        return reply.status(304).send();
      }
      return reply
        .type("application/vnd.citationstyles.style+xml; charset=utf-8")
        .send(asset.xml);
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
