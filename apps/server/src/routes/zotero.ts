import type { FastifyPluginAsync } from "fastify";
import { IdentifierLookupSchema } from "@citedocs/shared";
import { TranslationClient } from "@citedocs/zotero-core";

const translationClient = new TranslationClient({
  baseUrl: process.env.TRANSLATION_SERVER_URL || "http://localhost:1969",
});

export const zoteroRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: { identifier: string; type?: string };
  }>("/api/zotero/search", async (request, reply) => {
    const parseResult = IdentifierLookupSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parseResult.error.format(),
      });
    }

    try {
      const items = await translationClient.searchByIdentifier(parseResult.data.identifier);
      return { items };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({
        error: "Failed to resolve identifier via translation server",
        message: errorMessage,
      });
    }
  });
};
