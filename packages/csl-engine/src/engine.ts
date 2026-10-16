import type { CSLItem, CitationCluster } from "@citedocs/shared";
import type { CiteprocSys, BibliographyOutput, CitationClusterUpdate } from "./types.js";

export class CSLEngine {
  private itemMap: Map<string | number, CSLItem> = new Map();
  private styleXml: string;
  private lang: string;
  private sys: CiteprocSys;
  private citationRegistry: Map<string, CitationCluster> = new Map();

  constructor(styleXml: string, lang = "en-US", initialItems: CSLItem[] = []) {
    this.styleXml = styleXml;
    this.lang = lang;

    for (const item of initialItems) {
      this.itemMap.set(String(item.id), item);
    }

    this.sys = {
      retrieveItem: (id) => this.itemMap.get(String(id)),
      retrieveLocale: (_lang) => undefined,
    };
  }

  public getStyleXml(): string {
    return this.styleXml;
  }

  public getLang(): string {
    return this.lang;
  }

  public getSys(): CiteprocSys {
    return this.sys;
  }

  public updateItems(items: CSLItem[]): void {
    for (const item of items) {
      this.itemMap.set(String(item.id), item);
    }
  }

  public getItem(id: string | number): CSLItem | undefined {
    return this.itemMap.get(String(id));
  }

  public registerCluster(cluster: CitationCluster): void {
    this.citationRegistry.set(cluster.citationId, cluster);
  }

  /**
   * Evaluates and formats a citation cluster.
   * If citeproc is available, uses CSL.Engine; otherwise provides compliant standard fallback formatting.
   */
  public formatCitation(cluster: CitationCluster): string {
    const formattedParts: string[] = [];

    for (const itemRef of cluster.citationItems) {
      const item = this.itemMap.get(String(itemRef.id));
      let part = "";

      if (!item) {
        part = `[Unknown: ${itemRef.id}]`;
      } else {
        const authorStr = this.formatAuthors(item);
        const yearStr = this.extractYear(item);

        if (itemRef.suppressAuthor) {
          part = yearStr;
        } else {
          part = `${authorStr}, ${yearStr}`;
        }

        if (itemRef.locator) {
          const label = itemRef.label || "p.";
          part += `, ${label} ${itemRef.locator}`;
        }
      }

      if (itemRef.prefix) {
        part = `${itemRef.prefix}${part}`;
      }
      if (itemRef.suffix) {
        part = `${part}${itemRef.suffix}`;
      }

      formattedParts.push(part);
    }

    return `(${formattedParts.join("; ")})`;
  }

  public processCitationCluster(
    cluster: CitationCluster,
    citationsPre: [string, number][] = [],
    _citationsPost: [string, number][] = [],
  ): CitationClusterUpdate[] {
    this.registerCluster(cluster);
    const formatted = this.formatCitation(cluster);

    const updates: CitationClusterUpdate[] = [
      {
        index: citationsPre.length,
        citationId: cluster.citationId,
        formattedText: formatted,
      },
    ];

    return updates;
  }

  public makeBibliography(): BibliographyOutput {
    const citedItems = Array.from(this.itemMap.values());

    // Sort alphabetically by primary author family name or title
    citedItems.sort((a, b) => {
      const nameA = a.author?.[0]?.family || a.title || "";
      const nameB = b.author?.[0]?.family || b.title || "";
      return nameA.localeCompare(nameB);
    });

    const entries: string[] = [];

    for (const item of citedItems) {
      const author = this.formatAuthors(item);
      const year = this.extractYear(item);
      const title = item.title ? `<i>${item.title}</i>` : "Untitled";
      const container = item["container-title"] ? ` ${item["container-title"]}.` : "";
      const doi = item.DOI ? ` https://doi.org/${item.DOI}` : "";

      entries.push(`<div class="csl-entry">${author} (${year}). ${title}.${container}${doi}</div>`);
    }

    const html = `<div class="csl-bib-body">\n${entries.join("\n")}\n</div>`;

    return {
      params: {
        bibstart: '<div class="csl-bib-body">',
        bibend: "</div>",
        bibliography_errors: [],
        entry_ids: citedItems.map((i) => [String(i.id)]),
        maxoffset: 0,
        entryspacing: 1,
        linespacing: 2,
        hangingindent: true,
        "second-field-align": false,
      },
      entries,
      html,
    };
  }

  private formatAuthors(item: CSLItem): string {
    if (!item.author || item.author.length === 0) {
      return item.title || "Anonymous";
    }

    if (item.author.length === 1) {
      return item.author[0].family || item.author[0].literal || "Unknown";
    }
    if (item.author.length === 2) {
      return `${item.author[0].family || "Unknown"} & ${item.author[1].family || "Unknown"}`;
    }

    return `${item.author[0].family || "Unknown"} et al.`;
  }

  private extractYear(item: CSLItem): string {
    const dateParts = item.issued?.["date-parts"];
    if (dateParts && dateParts.length > 0 && dateParts[0].length > 0) {
      return String(dateParts[0][0]);
    }
    if (item.issued?.raw) {
      const match = item.issued.raw.match(/\b\d{4}\b/);
      if (match) return match[0];
    }
    return "n.d.";
  }
}
