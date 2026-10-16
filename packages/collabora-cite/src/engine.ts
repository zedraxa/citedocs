import CSL from "citeproc";
import type { CSLItem } from "@citedocs/shared";
import { BUNDLED_STYLES } from "./assets/styles.js";
import { BUNDLED_LOCALES } from "./assets/locales.js";
import type { ZoteroCitationItem, ZoteroCitationPayload } from "./types.js";

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#38;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&#60;/g, "<")
    .replace(/&lt;/g, "<")
    .replace(/&#62;/g, ">")
    .replace(/&gt;/g, ">")
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export interface BibliographyResult {
  entries: string[];
  html: string;
  text: string;
}

export interface StyleOption {
  id: string;
  name: string;
  shortTitle?: string;
  category: "author-date" | "numeric" | "note";
  description: string;
}

export const POPULAR_STYLES: StyleOption[] = [
  {
    id: "apa",
    name: "APA 7th Edition",
    shortTitle: "APA 7th",
    category: "author-date",
    description: "American Psychological Association 7th edition (Author, Year)",
  },
  {
    id: "chicago-author-date",
    name: "Chicago Manual of Style 17th (Author-Date)",
    shortTitle: "Chicago",
    category: "author-date",
    description: "Chicago author-date referencing format",
  },
  {
    id: "ieee",
    name: "IEEE",
    shortTitle: "IEEE",
    category: "numeric",
    description: "Institute of Electrical and Electronics Engineers [1]",
  },
  {
    id: "vancouver",
    name: "Vancouver",
    shortTitle: "Vancouver",
    category: "numeric",
    description: "Biomedical & health sciences numbered citations",
  },
  {
    id: "harvard-cite-them-right",
    name: "Harvard (Cite Them Right)",
    shortTitle: "Harvard",
    category: "author-date",
    description: "Harvard author-date referencing style",
  },
  {
    id: "modern-language-association",
    name: "MLA 9th Edition",
    shortTitle: "MLA 9th",
    category: "author-date",
    description: "Modern Language Association 9th edition (Author Page)",
  },
];

let activeItemMap: Map<string, CSLItem> | null = null;

const sharedSys = {
  retrieveItem: (id: string | number) => {
    const key = String(id).trim();
    if (activeItemMap) {
      const item = activeItemMap.get(key);
      if (item) return item;
    }
    // Fallback placeholder item to prevent citeproc-js parser crash on missing items
    return {
      id: key,
      type: "article-journal",
      title: `[Unknown: ${key}]`,
    };
  },
  retrieveLocale: (reqLang: string) => {
    return BUNDLED_LOCALES[reqLang] || BUNDLED_LOCALES["en-US"] || "";
  },
};

const globalEnginePool = new Map<string, InstanceType<typeof CSL.Engine>>();

function getPooledEngine(styleXml: string, lang: string): InstanceType<typeof CSL.Engine> {
  const key = `${styleXml}:::${lang}`;
  let engine = globalEnginePool.get(key);
  if (!engine) {
    engine = new CSL.Engine(sharedSys, styleXml, lang);
    engine.setOutputFormat("html");
    globalEnginePool.set(key, engine);
  }
  return engine;
}

export class CollaboraCSLEngine {
  private static customStyles: Map<string, string> = new Map();

  public static registerStyle(id: string, xml: string): void {
    CollaboraCSLEngine.customStyles.set(id.toLowerCase(), xml);
    CollaboraCSLEngine.customStyles.set(id, xml);
  }

  public registerStyle(id: string, xml: string): void {
    CollaboraCSLEngine.registerStyle(id, xml);
  }

  private itemMap: Map<string, CSLItem> = new Map();
  private styleXml: string;
  private lang: string;
  private activeStyleId: string;
  private engine!: InstanceType<typeof CSL.Engine>;

  constructor(
    styleIdOrXml = "apa",
    lang = "en-US",
    initialItems: CSLItem[] = [],
  ) {
    this.activeStyleId = styleIdOrXml;
    this.styleXml = this.resolveStyleXml(styleIdOrXml);
    this.lang = lang;

    for (const item of initialItems) {
      this.itemMap.set(String(item.id), item);
    }

    this.initEngine();
  }

  public getActiveStyleId(): string {
    return this.activeStyleId;
  }

  private resolveStyleXml(styleIdOrXml: string): string {
    if (styleIdOrXml.includes("<style") || styleIdOrXml.trimStart().startsWith("<")) {
      return styleIdOrXml;
    }
    const custom =
      CollaboraCSLEngine.customStyles.get(styleIdOrXml.toLowerCase()) ||
      CollaboraCSLEngine.customStyles.get(styleIdOrXml);
    if (custom) {
      return custom;
    }
    const found = BUNDLED_STYLES[styleIdOrXml.toLowerCase()] || BUNDLED_STYLES[styleIdOrXml];
    if (found) {
      return found;
    }
    // Default fallback to APA 7th if unknown style ID passed
    return BUNDLED_STYLES["apa"];
  }

  private initEngine(): void {
    this.engine = getPooledEngine(this.styleXml, this.lang);
    if (this.itemMap.size > 0) {
      activeItemMap = this.itemMap;
      this.engine.updateItems(Array.from(this.itemMap.keys()));
    }
  }

  public getStyleXml(): string {
    return this.styleXml;
  }

  public getLang(): string {
    return this.lang;
  }

  public updateItems(items: CSLItem[]): void {
    for (const item of items) {
      this.itemMap.set(String(item.id), item);
    }
    activeItemMap = this.itemMap;
    this.engine.updateItems(Array.from(this.itemMap.keys()));
  }

  public addItem(item: CSLItem): void {
    this.updateItems([item]);
  }

  public getItem(id: string | number): CSLItem | undefined {
    return this.itemMap.get(String(id));
  }

  public getItems(): CSLItem[] {
    return Array.from(this.itemMap.values());
  }

  private adaptCitationItems(items: ZoteroCitationItem[]): unknown[] {
    return items.map((item) => ({
      id: String(item.id),
      locator: item.locator,
      label: item.label,
      prefix: item.prefix,
      suffix: item.suffix,
      "suppress-author": item.suppressAuthor || item["suppress-author"] ? 1 : 0,
    }));
  }

  /**
   * Format a single citation on demand.
   * Returns { formattedCitation: string, plainCitation: string }.
   */
  public formatCitation(
    items: ZoteroCitationItem[],
    options?: {
      citationID?: string;
      noteIndex?: number;
    },
  ): { formattedCitation: string; plainCitation: string } {
    // Register items with embedded itemData if present
    for (const item of items) {
      if (item.itemData && typeof item.itemData === "object") {
        this.addItem({
          ...item.itemData,
          id: String(item.id),
        } as CSLItem);
      }
    }

    const cluster = {
      citationID: options?.citationID ?? "cit-temp",
      citationItems: this.adaptCitationItems(items),
      properties: {
        noteIndex: options?.noteIndex ?? 0,
      },
    };

    activeItemMap = this.itemMap;
    const formattedHtml = this.engine.previewCitationCluster(cluster, [], [], "html");
    const plainText = decodeHtmlEntities(this.engine.previewCitationCluster(cluster, [], [], "text")).trim();

    return {
      formattedCitation: formattedHtml,
      plainCitation: plainText,
    };
  }

  /**
   * Rebuilds processor state for a sequence of citations in document order.
   * Returns updated formattedCitation & plainCitation for each citation.
   */
  public processCitationClusters(
    clusters: ZoteroCitationPayload[],
  ): { citationID: string; formattedCitation: string; plainCitation: string }[] {
    // Register any embedded items
    for (const cluster of clusters) {
      for (const item of cluster.citationItems) {
        if (item.itemData && typeof item.itemData === "object") {
          this.addItem({
            ...item.itemData,
            id: String(item.id),
          } as CSLItem);
        }
      }
    }

    const adaptedClusters = clusters.map((c) => ({
      citationID: c.citationID,
      citationItems: this.adaptCitationItems(c.citationItems),
      properties: {
        noteIndex: c.properties.noteIndex ?? 0,
      },
    }));

    activeItemMap = this.itemMap;
    const resultHtml = this.engine.rebuildProcessorState(adaptedClusters, "html");
    const resultText = this.engine.rebuildProcessorState(adaptedClusters, "text");

    const textMap = new Map<string, string>();
    if (Array.isArray(resultText)) {
      for (const entry of resultText) {
        const [cid, _note, txt] = entry;
        textMap.set(cid, decodeHtmlEntities(txt).trim());
      }
    }

    if (Array.isArray(resultHtml)) {
      return resultHtml.map(([citationId, _note, formattedText]) => ({
        citationID: citationId,
        formattedCitation: formattedText,
        plainCitation: textMap.get(citationId) || stripHtml(formattedText),
      }));
    }

    // Fallback: format each individually
    return clusters.map((c) => {
      const res = this.formatCitation(c.citationItems, {
        citationID: c.citationID,
        noteIndex: c.properties.noteIndex,
      });
      return {
        citationID: c.citationID,
        formattedCitation: res.formattedCitation,
        plainCitation: res.plainCitation,
      };
    });
  }

  /**
   * Generate bibliography entries, HTML container, and plain text.
   */
  public makeBibliography(): BibliographyResult {
    activeItemMap = this.itemMap;
    const bibResult = this.engine.makeBibliography();

    if (!bibResult || !Array.isArray(bibResult) || bibResult.length < 2) {
      return {
        entries: [],
        html: "",
        text: "",
      };
    }

    const [rawParams, rawEntries] = bibResult;
    const bibstart = rawParams.bibstart || '<div class="csl-bib-body">\n';
    const bibend = rawParams.bibend || "</div>";

    const entries = rawEntries.map((e) => stripHtml(e));
    const html = bibstart + rawEntries.join("") + bibend;
    const text = entries.join("\n");

    return {
      entries,
      html,
      text,
    };
  }

  /**
   * Switch the active CSL style and optional locale.
   */
  public switchStyle(newStyleIdOrXml: string, newLang?: string): void {
    this.activeStyleId = newStyleIdOrXml;
    this.styleXml = this.resolveStyleXml(newStyleIdOrXml);
    if (newLang) {
      this.lang = newLang;
    }
    this.initEngine();
  }
}
