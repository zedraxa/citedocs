import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import JSZip from "jszip";
import {
  buildZoteroPrefXml,
  chunkZoteroPref,
  normalizeStyleId,
  DEFAULT_LOCALE,
  type ZoteroPrefChunk,
} from "@citedocs/shared";
import { StyleIndexService, type StyleItem } from "../styles/styleService.js";
import type { IDocumentRepository } from "../repositories/documentRepository.js";
import type { WopiStorage } from "../wopi/types.js";
import type { OnlyofficeSessionManager } from "../onlyoffice/session.js";
import { requireAuth } from "../auth/middleware.js";
import { OwnershipError } from "../repositories/errors.js";

export interface StyleRoutesOptions {
  documentRepo?: IDocumentRepository;
  wopiStorage?: WopiStorage;
  sessionManager?: OnlyofficeSessionManager;
  styleService?: StyleIndexService;
  fetchFn?: typeof fetch;
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Updates or creates docProps/custom.xml with chunked ZOTERO_PREF properties inside a DOCX binary.
 */
export async function updateDocxZoteroPreferences(
  buffer: Buffer,
  chunks: ZoteroPrefChunk[],
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  const customXmlFile = zip.file("docProps/custom.xml");
  let customXml = customXmlFile ? await customXmlFile.async("string") : "";

  // Prepare property XML strings for the chunks
  const propXmlList = chunks.map((c, i) => {
    return `  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="${c.name}">\n    <vt:lpwstr>${encodeXml(c.value)}</vt:lpwstr>\n  </property>`;
  });

  if (!customXml || !customXml.includes("<Properties")) {
    customXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">\n${propXmlList.join("\n")}\n</Properties>`;
  } else {
    // Remove any existing ZOTERO_PREF properties
    customXml = customXml.replace(
      /\s*<property\b[^>]*name="ZOTERO_PREF_\d+"[^>]*>[\s\S]*?<\/property>/g,
      "",
    );

    // Insert new properties before closing </Properties>
    customXml = customXml.replace(
      "</Properties>",
      `${propXmlList.join("\n")}\n</Properties>`,
    );
  }

  zip.file("docProps/custom.xml", customXml);

  // Ensure [Content_Types].xml includes custom-properties override
  const contentTypesFile = zip.file("[Content_Types].xml");
  if (contentTypesFile) {
    const contentTypesXml = await contentTypesFile.async("string");
    if (!contentTypesXml.includes("custom-properties")) {
      const updated = contentTypesXml.replace(
        "</Types>",
        '  <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>\n</Types>',
      );
      zip.file("[Content_Types].xml", updated);
    }
  }

  // Ensure _rels/.rels links custom.xml
  const relsFile = zip.file("_rels/.rels");
  if (relsFile) {
    const relsXml = await relsFile.async("string");
    if (!relsXml.includes("custom-properties")) {
      const updated = relsXml.replace(
        "</Relationships>",
        '  <Relationship Id="rIdCustomProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>\n</Relationships>',
      );
      zip.file("_rels/.rels", updated);
    }
  }

  const generated = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(generated);
}

export const createStyleRoutes = (
  options: StyleRoutesOptions = {},
): FastifyPluginAsync => {
  const service = options.styleService || new StyleIndexService({ fetchFn: options.fetchFn });
  const { documentRepo, wopiStorage, sessionManager } = options;

  return async (fastify) => {
    /**
     * GET /api/styles
     * Searchable list over the full Zotero style repository (~10.8k styles).
     * Debounced search (min 2 chars), results limited to ~50 so the tab never freezes.
     * Pinned popular styles returned at the top when q is empty or < 2 chars.
     */
    fastify.get<{
      Querystring: { q?: string; limit?: string };
    }>("/api/styles", async (request, reply) => {
      const query = request.query.q;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
      const styles = await service.searchStyles(query, isNaN(limit) ? 50 : limit);
      return reply.send({
        styles,
        total: styles.length,
        query: query || "",
      });
    });

    /**
     * GET /api/styles/:id
     * Gets a single style definition by style ID.
     */
    fastify.get<{
      Params: { id: string };
    }>("/api/styles/:id", async (request, reply) => {
      const id = normalizeStyleId(request.params.id);
      const style = await service.getStyleById(id);
      if (!style) {
        return reply.status(404).send({ error: "Style not found" });
      }
      return reply.send({ style });
    });

    /**
     * PUT /api/documents/:id/style
     * Updates the document's Zotero style preferences in Zotero-compatible format
     * (ZOTERO_PREF_1.. custom properties in docProps/custom.xml).
     * Synchronizes with any active ONLYOFFICE session to avoid version mismatch conflicts.
     */
    fastify.put<{
      Params: { id: string };
      Body: { styleId: string; locale?: string };
    }>("/api/documents/:id/style", { preHandler: requireAuth }, async (request, reply) => {
      const fileId = request.params.id;
      const userId = request.userId;
      const { styleId, locale = DEFAULT_LOCALE } = request.body || {};

      if (!styleId || typeof styleId !== "string") {
        return reply.status(400).send({ error: "styleId is required" });
      }

      if (!documentRepo || !wopiStorage) {
        return reply.status(500).send({ error: "Storage or repository not configured" });
      }

      try {
        const docWithRole = await documentRepo.getById(userId, fileId, request.user?.email);
        if (!docWithRole) {
          return reply.status(404).send({ error: "Document not found" });
        }

        if (docWithRole.userRole !== "owner" && docWithRole.userRole !== "editor") {
          return reply.status(403).send({ error: "Only owners and editors can modify citation style" });
        }

        const cleanStyleId = normalizeStyleId(styleId);

        // Build Zotero pref XML and chunk it
        const prefXml = buildZoteroPrefXml({
          styleId: cleanStyleId,
          locale,
          hasBibliography: true,
        });
        const chunks = chunkZoteroPref(prefXml, 250);

        // Read current document binary
        const file = await wopiStorage.getFile(fileId);
        const updatedBuffer = await updateDocxZoteroPreferences(file.buffer, chunks);

        // Save updated binary back to storage
        await wopiStorage.putFile(fileId, updatedBuffer);

        // Synchronize with active ONLYOFFICE session if one is currently open
        if (sessionManager) {
          const contentHash = crypto
            .createHash("sha256")
            .update(updatedBuffer)
            .digest("hex");
          const info = await wopiStorage.getFileInfo(fileId);
          sessionManager.recordSave(fileId, contentHash, updatedBuffer.length, info.version);
        }

        return reply.status(200).send({
          ok: true,
          styleId: cleanStyleId,
          locale,
          prefs: prefXml,
          chunks,
        });
      } catch (err: unknown) {
        if (err instanceof OwnershipError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    });
  };
};
