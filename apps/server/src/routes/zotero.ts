import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { IdentifierLookupSchema } from "@citedocs/shared";
import {
  TranslationClient,
  TranslationServerError,
  zoteroItemToCSL,
} from "@citedocs/zotero-core";
import { requireAuth } from "../middleware/auth.js";
import { ItemRepository } from "../repositories/itemRepository.js";

export interface ZoteroRouteOptions {
  client?: TranslationClient;
  itemRepo?: ItemRepository;
}

export const zoteroRoutes: FastifyPluginAsync<ZoteroRouteOptions> = async (
  fastify,
  options,
) => {
  // All Zotero translation and resolution endpoints require authentication
  fastify.addHook("preHandler", requireAuth);

  const translationClient =
    options.client ||
    new TranslationClient({
      baseUrl: process.env.TRANSLATION_SERVER_URL || "http://localhost:1969",
    });

  const itemRepo = options.itemRepo || new ItemRepository();

  const handleTranslate = async (request: FastifyRequest, reply: FastifyReply) => {
    const bodyObj =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};

    const rawInput = bodyObj.identifier ?? bodyObj.query;
    const identifier = typeof rawInput === "string" ? rawInput.trim() : "";

    if (!identifier) {
      return reply.status(400).send({
        error: "Invalid input",
        message: "Identifier cannot be empty",
      });
    }

    const parseResult = IdentifierLookupSchema.safeParse({
      identifier,
      type: bodyObj.type ?? "auto",
    });

    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid input",
        message: "Invalid or missing identifier",
        details: parseResult.error.format(),
      });
    }

    const rawId = parseResult.data.identifier;
    const userId = request.userId;

    try {
      // Fetch and normalize items via hardened TranslationClient
      const items = await translationClient.searchByIdentifier(rawId);
      const cslItems = items.map(zoteroItemToCSL);

      // Persist items through ItemRepository strictly owned by the requesting student
      const storedItems = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const csl = cslItems[i];

        const stored = await itemRepo.create(userId, {
          title: item.title || "Adsız",
          itemType: item.itemType || "journalArticle",
          publicationTitle: item.publicationTitle || null,
          parsedDate: item.date || null,
          doi: item.DOI || null,
          url: item.url || null,
          abstractNote: item.abstractNote || null,
          zoteroKey: item.key || null,
          version: item.version ?? 0,
          metadata: {
            ...item,
            creators: item.creators || [],
            tags: item.tags || [],
            containerTitle: item.publicationTitle || null,
            csl,
          },
        });

        storedItems.push({
          ...stored,
          DOI: stored.doi || item.DOI,
          date: stored.parsedDate || item.date,
          creators: item.creators || [],
          tags: item.tags || [],
          publicationTitle: stored.publicationTitle || item.publicationTitle,
        });
      }

      return reply.status(200).send({
        success: true,
        userId,
        items: storedItems,
        cslItems,
        item: storedItems[0] || null,
        csl: cslItems[0] || null,
        persisted: true,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const statusCode =
        err instanceof TranslationServerError && err.statusCode
          ? err.statusCode
          : 502;

      return reply.status(statusCode >= 500 ? 502 : statusCode).send({
        error: "Failed to resolve identifier via translation server",
        message: errorMessage,
        upstreamStatus:
          err instanceof TranslationServerError ? err.statusCode : undefined,
      });
    }
  };

  // Register main endpoint requested in M2 Part B
  fastify.post("/api/zotero/translate", handleTranslate);

  // Register REST alias for add-by-identifier
  fastify.post("/api/items/from-identifier", handleTranslate);

  // Preserve backwards compatibility with M0 scaffolded endpoint
  fastify.post("/api/zotero/search", handleTranslate);
};
