import { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import { ItemRepository } from "../repositories/itemRepository.js";
import { requireAuth } from "../middleware/auth.js";
import { OwnershipError, NotFoundError } from "../repositories/errors.js";

export interface ItemRoutesOptions {
  repository?: ItemRepository;
}

export function createItemRoutes(customRepo?: ItemRepository): FastifyPluginAsync {
  return async function itemRoutes(fastify: FastifyInstance): Promise<void> {
    const repo = customRepo || new ItemRepository();

    // All /api/items routes require authenticated user ID
    fastify.addHook("preHandler", requireAuth);

    // GET /api/items - list items owned by current user
    fastify.get<{
      Querystring: {
        itemType?: string;
        q?: string;
      };
    }>("/api/items", async (request) => {
      const { itemType, q } = request.query;
      const items = await repo.list(request.userId, {
        itemType,
        search: q,
      });
      return items;
    });

    // POST /api/items - create a new item for current user
    fastify.post<{
      Body: {
        title?: string;
        itemType?: string;
        publicationTitle?: string;
        parsedDate?: string;
        doi?: string;
        url?: string;
        abstractNote?: string;
        metadata?: Record<string, unknown>;
        zoteroKey?: string;
      };
    }>("/api/items", async (request, reply) => {
      const body = request.body || {};
      const item = await repo.create(request.userId, {
        title: body.title || "Untitled",
        itemType: body.itemType || "journalArticle",
        publicationTitle: body.publicationTitle || null,
        parsedDate: body.parsedDate || null,
        doi: body.doi || null,
        url: body.url || null,
        abstractNote: body.abstractNote || null,
        metadata: body.metadata || {},
        zoteroKey: body.zoteroKey || null,
        version: 0,
      });

      reply.status(201);
      return item;
    });

    // GET /api/items/:id - retrieve item by ID (with ownership check)
    fastify.get<{
      Params: { id: string };
    }>("/api/items/:id", async (request, reply) => {
      try {
        const item = await repo.getById(request.userId, request.params.id);
        if (!item) {
          reply.status(404).send({ error: "Not Found", message: "Library item not found" });
          return;
        }
        return item;
      } catch (err) {
        if (err instanceof OwnershipError) {
          reply.status(403).send({ error: "Forbidden", message: err.message });
          return;
        }
        throw err;
      }
    });

    // PUT /api/items/:id - update item (with ownership check)
    fastify.put<{
      Params: { id: string };
      Body: {
        title?: string;
        itemType?: string;
        publicationTitle?: string;
        parsedDate?: string;
        doi?: string;
        url?: string;
        abstractNote?: string;
        metadata?: Record<string, unknown>;
      };
    }>("/api/items/:id", async (request, reply) => {
      try {
        const updated = await repo.update(request.userId, request.params.id, request.body || {});
        return updated;
      } catch (err) {
        if (err instanceof NotFoundError) {
          reply.status(404).send({ error: "Not Found", message: err.message });
          return;
        }
        if (err instanceof OwnershipError) {
          reply.status(403).send({ error: "Forbidden", message: err.message });
          return;
        }
        throw err;
      }
    });

    // DELETE /api/items/:id - delete item (with ownership check)
    fastify.delete<{
      Params: { id: string };
    }>("/api/items/:id", async (request, reply) => {
      try {
        const deleted = await repo.delete(request.userId, request.params.id);
        return { success: deleted };
      } catch (err) {
        if (err instanceof NotFoundError) {
          reply.status(404).send({ error: "Not Found", message: err.message });
          return;
        }
        if (err instanceof OwnershipError) {
          reply.status(403).send({ error: "Forbidden", message: err.message });
          return;
        }
        throw err;
      }
    });
  };
}

export const itemRoutes = createItemRoutes();
