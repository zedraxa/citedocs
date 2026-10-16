import type { ZoteroItem } from "@citedocs/shared";

export interface TranslationServerOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class TranslationClient {
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(options: TranslationServerOptions = {}) {
    this.baseUrl = options.baseUrl || "http://localhost:1969";
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Resolves an academic identifier (DOI, ISBN, PMID, arXiv ID) into a ZoteroItem.
   */
  async searchByIdentifier(identifier: string): Promise<ZoteroItem[]> {
    const cleanId = identifier.trim();
    const response = await this.fetchFn(`${this.baseUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: cleanId }),
    });

    if (!response.ok) {
      throw new Error(
        `Translation server search failed with status ${response.status}: ${response.statusText}`,
      );
    }

    return (await response.json()) as ZoteroItem[];
  }

  /**
   * Scrapes metadata from a webpage URL using Zotero web translators.
   */
  async translateWeb(url: string): Promise<ZoteroItem[]> {
    const response = await this.fetchFn(`${this.baseUrl}/web`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: url.trim(),
    });

    if (!response.ok) {
      throw new Error(
        `Translation server web translation failed with status ${response.status}: ${response.statusText}`,
      );
    }

    return (await response.json()) as ZoteroItem[];
  }

  /**
   * Imports raw bibliographic text (BibTeX, RIS, CSL-JSON) into normalized ZoteroItems.
   */
  async importRaw(rawData: string, contentType = "text/plain"): Promise<ZoteroItem[]> {
    const response = await this.fetchFn(`${this.baseUrl}/import`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
      },
      body: rawData,
    });

    if (!response.ok) {
      throw new Error(
        `Translation server import failed with status ${response.status}: ${response.statusText}`,
      );
    }

    return (await response.json()) as ZoteroItem[];
  }

  /**
   * Exports an array of ZoteroItems into serialized formats (BibTeX, RIS, CSL-JSON).
   */
  async exportItems(
    items: ZoteroItem[],
    format: "bibtex" | "ris" | "csljson" | "biblatex" = "bibtex",
  ): Promise<string> {
    const response = await this.fetchFn(`${this.baseUrl}/export?format=${format}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(items),
    });

    if (!response.ok) {
      throw new Error(
        `Translation server export failed with status ${response.status}: ${response.statusText}`,
      );
    }

    return await response.text();
  }
}
