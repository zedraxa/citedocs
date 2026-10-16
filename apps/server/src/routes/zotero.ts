import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { IdentifierLookupSchema } from "@citedocs/shared";
import type { ZoteroItem, CSLItem } from "@citedocs/shared";
import {
  TranslationClient,
  TranslationServerError,
  zoteroItemToCSL,
} from "@citedocs/zotero-core";

export interface StoredItemRecord {
  id: string;
  userId: string | null;
  item: ZoteroItem;
  csl: CSLItem;
  createdAt: string;
}

/**
 * In-memory item store for cd-m2-identifier branch.
 * Full relational persistence with Postgres/Drizzle is maintained on branch cd-m2-drizzle.
 */
export const memoryItemStore = new Map<string, StoredItemRecord>();

export function clearItemStore(): void {
  memoryItemStore.clear();
}

export interface ZoteroRouteOptions {
  client?: TranslationClient;
}

export const zoteroRoutes: FastifyPluginAsync<ZoteroRouteOptions> = async (
  fastify,
  options,
) => {
  const translationClient =
    options.client ||
    new TranslationClient({
      baseUrl: process.env.TRANSLATION_SERVER_URL || "http://localhost:1969",
    });

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
    const rawUserId = request.headers["x-user-id"];
    const userId =
      typeof rawUserId === "string" && rawUserId.trim().length > 0
        ? rawUserId.trim()
        : null;

    try {
      // Fetch and normalize items via hardened TranslationClient
      const items = await translationClient.searchByIdentifier(rawId);
      const cslItems = items.map(zoteroItemToCSL);

      // In-memory persistence stub respecting per-user data isolation
      const now = new Date().toISOString();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const csl = cslItems[i];
        memoryItemStore.set(item.key, {
          id: item.key,
          userId,
          item,
          csl,
          createdAt: now,
        });
      }

      return reply.status(200).send({
        success: true,
        userId,
        items,
        cslItems,
        item: items[0] || null,
        csl: cslItems[0] || null,
        persisted: true,
        persistenceMode: "in-memory",
        todo: "TODO(persist): Full relational persistence with Postgres/Drizzle is developed on branch cd-m2-drizzle; this branch provides an in-memory session store.",
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

  // Allow inspecting/listing stored items for the current user
  fastify.get("/api/items", async (request, reply) => {
    const rawUserId = request.headers["x-user-id"];
    const userId =
      typeof rawUserId === "string" && rawUserId.trim().length > 0
        ? rawUserId.trim()
        : null;

    const allRecords = Array.from(memoryItemStore.values());
    const filtered = userId
      ? allRecords.filter((rec) => rec.userId === userId || rec.userId === null)
      : allRecords;

    return reply.status(200).send({
      total: filtered.length,
      userId,
      items: filtered,
    });
  });
};
