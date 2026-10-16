import type { ZoteroItem, CSLItem } from "@citedocs/shared";
import { zoteroItemToCSL } from "./csl-converter.js";

export type ExportFormat = "bibtex" | "ris" | "csljson" | "biblatex" | "rdf_zotero";

export interface TranslationServerOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface TranslationRequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface TranslateResult {
  items: ZoteroItem[];
  cslItems: CSLItem[];
  primaryItem?: ZoteroItem;
  primaryCsl?: CSLItem;
}

export class TranslationServerError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TranslationServerError";
    Object.setPrototypeOf(this, TranslationServerError.prototype);
  }
}

/**
 * Normalizes user-entered identifiers by trimming whitespace and removing
 * common URL/protocol prefixes (e.g. https://doi.org/ or doi:).
 */
export function normalizeIdentifier(id: string): string {
  const trimmed = id.trim();
  // Strip https://doi.org/ or http://dx.doi.org/ or doi: prefix if present
  const doiMatch = trimmed.match(
    /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)$/i,
  );
  if (doiMatch) {
    return doiMatch[1];
  }
  // Strip arxiv: prefix if present
  const arxivMatch = trimmed.match(/^arxiv:\s*(\S+)$/i);
  if (arxivMatch) {
    return arxivMatch[1];
  }
  // Strip pmid: prefix if present
  const pmidMatch = trimmed.match(/^pmid:\s*(\d+)$/i);
  if (pmidMatch) {
    return pmidMatch[1];
  }
  // Strip isbn: prefix if present
  const isbnMatch = trimmed.match(/^isbn:\s*([\d-]+)$/i);
  if (isbnMatch) {
    return isbnMatch[1];
  }
  return trimmed;
}

/**
 * Generates an 8-character uppercase alphanumeric Zotero key.
 */
export function generateZoteroKey(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let key = "";
  for (let i = 0; i < 8; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * Ensures returned items from external translators conform to the full ZoteroItem shape.
 */
export function normalizeZoteroItem(raw: Partial<ZoteroItem>): ZoteroItem {
  return {
    key: raw.key && raw.key.trim().length > 0 ? raw.key : generateZoteroKey(),
    version: typeof raw.version === "number" ? raw.version : 0,
    itemType: raw.itemType || "journalArticle",
    title: raw.title || "",
    creators: Array.isArray(raw.creators) ? raw.creators : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    collections: Array.isArray(raw.collections) ? raw.collections : [],
    abstractNote: raw.abstractNote,
    publicationTitle: raw.publicationTitle,
    volume: raw.volume,
    issue: raw.issue,
    pages: raw.pages,
    date: raw.date,
    series: raw.series,
    seriesTitle: raw.seriesTitle,
    seriesText: raw.seriesText,
    journalAbbreviation: raw.journalAbbreviation,
    DOI: raw.DOI,
    ISBN: raw.ISBN,
    ISSN: raw.ISSN,
    url: raw.url,
    accessDate: raw.accessDate,
    archive: raw.archive,
    archiveLocation: raw.archiveLocation,
    libraryCatalog: raw.libraryCatalog,
    callNumber: raw.callNumber,
    rights: raw.rights,
    extra: raw.extra,
    relations: raw.relations,
    dateAdded: raw.dateAdded,
    dateModified: raw.dateModified,
  };
}

export class TranslationClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly defaultTimeoutMs: number;

  constructor(options: TranslationServerOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://localhost:1969").replace(/\/+$/, "");
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.defaultTimeoutMs = options.timeoutMs ?? 15000;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async executeFetch(
    url: string,
    init: RequestInit,
    timeoutMs?: number,
  ): Promise<Response> {
    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (effectiveTimeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    }

    try {
      const response = await this.fetchFn(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new TranslationServerError(
          `Translation server request timed out after ${effectiveTimeout}ms: ${init.method || "GET"} ${url}`,
          408,
          undefined,
          err,
        );
      }
      throw new TranslationServerError(
        `Failed to communicate with translation server at ${url}: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        undefined,
        err,
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private async parseItemsResponse(response: Response, endpoint: string): Promise<ZoteroItem[]> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new TranslationServerError(
        `Translation server ${endpoint} failed with status ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
        response.status,
        errorText,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err: unknown) {
      throw new TranslationServerError(
        `Translation server ${endpoint} returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        response.status,
        undefined,
        err,
      );
    }

    if (!Array.isArray(data)) {
      if (data && typeof data === "object") {
        return [normalizeZoteroItem(data as Partial<ZoteroItem>)];
      }
      return [];
    }

    return (data as Partial<ZoteroItem>[]).map(normalizeZoteroItem);
  }

  /**
   * Resolves an academic identifier (DOI, ISBN, PMID, arXiv ID) into an array of normalized ZoteroItems.
   */
  async searchByIdentifier(
    identifier: string,
    options?: TranslationRequestOptions,
  ): Promise<ZoteroItem[]> {
    const cleanId = normalizeIdentifier(identifier);
    if (!cleanId) {
      throw new Error("Identifier cannot be empty");
    }

    const response = await this.executeFetch(
      `${this.baseUrl}/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...options?.headers,
        },
        body: cleanId,
      },
      options?.timeoutMs,
    );

    return await this.parseItemsResponse(response, "/search");
  }

  /**
   * Scrapes metadata from a webpage URL using Zotero web translators.
   */
  async translateWeb(
    url: string,
    options?: TranslationRequestOptions,
  ): Promise<ZoteroItem[]> {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      throw new Error("URL cannot be empty");
    }

    const response = await this.executeFetch(
      `${this.baseUrl}/web`,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...options?.headers,
        },
        body: cleanUrl,
      },
      options?.timeoutMs,
    );

    return await this.parseItemsResponse(response, "/web");
  }

  /**
   * Imports raw bibliographic text (BibTeX, RIS, CSL-JSON) into normalized ZoteroItems.
   */
  async importRaw(
    rawData: string,
    contentType = "text/plain",
    options?: TranslationRequestOptions,
  ): Promise<ZoteroItem[]> {
    if (!rawData || !rawData.trim()) {
      throw new Error("Import payload cannot be empty");
    }

    const response = await this.executeFetch(
      `${this.baseUrl}/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          ...options?.headers,
        },
        body: rawData,
      },
      options?.timeoutMs,
    );

    return await this.parseItemsResponse(response, "/import");
  }

  /**
   * Exports an array of ZoteroItems into serialized formats (BibTeX, RIS, CSL-JSON).
   */
  async exportItems(
    items: ZoteroItem[],
    format: ExportFormat = "bibtex",
    options?: TranslationRequestOptions,
  ): Promise<string> {
    const response = await this.executeFetch(
      `${this.baseUrl}/export?format=${encodeURIComponent(format)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
        body: JSON.stringify(items),
      },
      options?.timeoutMs,
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new TranslationServerError(
        `Translation server /export failed with status ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
        response.status,
        errorText,
      );
    }

    return await response.text();
  }

  /**
   * Resolves an academic identifier and transforms results into both Zotero and CSL shapes.
   */
  async translateAndConvert(
    identifier: string,
    options?: TranslationRequestOptions,
  ): Promise<TranslateResult> {
    const items = await this.searchByIdentifier(identifier, options);
    const cslItems = items.map(zoteroItemToCSL);

    return {
      items,
      cslItems,
      primaryItem: items[0],
      primaryCsl: cslItems[0],
    };
  }

  /**
   * Checks if the translation-server instance is reachable.
   */
  async isAlive(options?: TranslationRequestOptions): Promise<boolean> {
    try {
      const response = await this.executeFetch(
        `${this.baseUrl}/`,
        {
          method: "GET",
          headers: options?.headers,
        },
        options?.timeoutMs ?? 3000,
      );
      return response.status < 500;
    } catch {
      return false;
    }
  }
}
