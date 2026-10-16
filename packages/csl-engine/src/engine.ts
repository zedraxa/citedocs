import CSL from "citeproc";
import type { CSLItem, CitationCluster } from "@citedocs/shared";
import type {
  CiteprocSys,
  BibliographyOutput,
  CitationClusterUpdate,
  OutputFormat,
  StyleSwitchResult,
  CSLEngineOptions,
  BibliographyParams,
} from "./types.js";
import { LocaleRegistry, StyleRegistry } from "./registry.js";
import { UnknownStyleError } from "./errors.js";

function decodeHtmlEntities(str: string): string {
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

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export class CSLEngine {
  private itemMap: Map<string, CSLItem> = new Map();
  private citationRegistry: Map<string, CitationCluster> = new Map();
  private clusterOrder: string[] = [];
  private styleXml: string;
  private lang: string;
  private outputFormat: OutputFormat;
  private sys: CiteprocSys;
  private engine!: ReturnType<typeof this.createEngine>;
  private enginePool: Map<string, ReturnType<typeof this.createEngine>> = new Map();
  private localeRegistry: LocaleRegistry;

  constructor(
    styleXmlOrId: string,
    lang = "en-US",
    initialItems: CSLItem[] = [],
    options?: CSLEngineOptions,
  ) {
    if (styleXmlOrId.includes("<style") || styleXmlOrId.trimStart().startsWith("<")) {
      this.styleXml = styleXmlOrId;
    } else {
      const foundXml = new StyleRegistry().getXml(styleXmlOrId);
      if (!foundXml) {
        throw new UnknownStyleError(styleXmlOrId);
      }
      this.styleXml = foundXml;
    }

    this.lang = options?.lang ?? lang;
    this.outputFormat = options?.outputFormat ?? "html";
    this.localeRegistry = new LocaleRegistry();

    const allItems = [...initialItems, ...(options?.initialItems ?? [])];
    for (const item of allItems) {
      this.itemMap.set(String(item.id), item);
    }

    this.sys = {
      retrieveItem: (id: string | number) => {
        const key = String(id).trim();
        const item = this.itemMap.get(key);
        if (item) return item;
        // Safe fallback placeholder item to prevent citeproc-js parser crash on missing items
        return {
          id: key,
          type: "article-journal",
          title: `[Unknown: ${key}]`,
        };
      },
      retrieveLocale: (reqLang: string) => {
        if (options?.localeResolver) {
          const resolved = options.localeResolver(reqLang);
          if (resolved) return resolved;
        }
        return this.localeRegistry.get(reqLang);
      },
    };

    this.initEngine();

    if (options?.clusters) {
      for (const cluster of options.clusters) {
        this.registerCluster(cluster);
      }
    }
  }

  private createEngine(styleXml: string, lang: string, format: OutputFormat): InstanceType<typeof CSL.Engine> {
    const instance = new CSL.Engine(this.sys, styleXml, lang);
    instance.setOutputFormat(format);
    return instance;
  }

  private getOrCreateEngine(styleXml: string, lang: string, format: OutputFormat): InstanceType<typeof CSL.Engine> {
    const key = `${styleXml}:::${lang}:::${format}`;
    let pooled = this.enginePool.get(key);
    if (!pooled) {
      pooled = this.createEngine(styleXml, lang, format);
      this.enginePool.set(key, pooled);
    }
    return pooled;
  }

  private initEngine(): void {
    this.engine = this.getOrCreateEngine(this.styleXml, this.lang, this.outputFormat);
    if (this.itemMap.size > 0 && this.clusterOrder.length === 0) {
      this.engine.updateItems(Array.from(this.itemMap.keys()));
    }
  }

  private adaptCluster(cluster: CitationCluster): unknown {
    return {
      citationID: cluster.citationId,
      citationItems: cluster.citationItems.map((item) => ({
        id: String(item.id),
        locator: item.locator,
        label: item.label,
        prefix: item.prefix,
        suffix: item.suffix,
        "suppress-author": item.suppressAuthor ? 1 : 0,
        suppressAuthor: item.suppressAuthor ? 1 : 0,
      })),
      properties: {
        noteIndex: cluster.properties?.noteIndex ?? 0,
      },
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

  public getOutputFormat(): OutputFormat {
    return this.outputFormat;
  }

  public setOutputFormat(format: OutputFormat): void {
    this.outputFormat = format;
    this.engine = this.getOrCreateEngine(this.styleXml, this.lang, format);
  }

  public updateItems(items: CSLItem[]): void {
    for (const item of items) {
      this.itemMap.set(String(item.id), item);
    }
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

  public registerCluster(cluster: CitationCluster): void {
    this.citationRegistry.set(cluster.citationId, cluster);
    if (!this.clusterOrder.includes(cluster.citationId)) {
      this.clusterOrder.push(cluster.citationId);
    }
  }

  public getCluster(citationId: string): CitationCluster | undefined {
    return this.citationRegistry.get(citationId);
  }

  public getClusters(): CitationCluster[] {
    return this.clusterOrder
      .map((id) => this.citationRegistry.get(id))
      .filter((c): c is CitationCluster => Boolean(c));
  }

  public setClusterOrder(citationIds: string[]): void {
    this.clusterOrder = [...citationIds];
  }

  /**
   * Preview/format a single citation cluster on demand.
   * Defaults to clean text mode with unescaped entities for easy display.
   */
  public formatCitation(cluster: CitationCluster, format: OutputFormat = "text"): string {
    const adapted = this.adaptCluster(cluster);
    const result = this.engine.previewCitationCluster(adapted, [], [], format);
    return format === "text" ? decodeHtmlEntities(result) : result;
  }

  /**
   * Process a citation cluster in document context, maintaining citationsPre/citationsPost.
   * Returns updates for all clusters affected by this insertion/edit.
   */
  public processCitationCluster(
    cluster: CitationCluster,
    citationsPre?: [string, number][],
    citationsPost?: [string, number][],
  ): CitationClusterUpdate[] {
    this.registerCluster(cluster);

    const clusterIndex = this.clusterOrder.indexOf(cluster.citationId);

    const pre: [string, number][] =
      citationsPre ??
      this.clusterOrder.slice(0, clusterIndex).map((id) => {
        const c = this.citationRegistry.get(id);
        return [id, c?.properties?.noteIndex ?? 0];
      });

    const post: [string, number][] =
      citationsPost ??
      this.clusterOrder.slice(clusterIndex + 1).map((id) => {
        const c = this.citationRegistry.get(id);
        return [id, c?.properties?.noteIndex ?? 0];
      });

    const adapted = this.adaptCluster(cluster);
    const result = this.engine.processCitationCluster(adapted, pre, post);

    if (result && Array.isArray(result[1])) {
      return result[1].map(([index, formattedText, citationId]: [number, string, string]) => ({
        index,
        citationId,
        formattedText,
      }));
    }

    return [
      {
        index: pre.length,
        citationId: cluster.citationId,
        formattedText: this.formatCitation(cluster, this.outputFormat),
      },
    ];
  }

  /**
   * Generates the bibliography in both HTML and plain text formats.
   */
  public makeBibliography(format?: OutputFormat): BibliographyOutput {
    const bibResult = this.engine.makeBibliography();

    if (!bibResult || !Array.isArray(bibResult) || bibResult.length < 2) {
      const emptyParams: BibliographyParams = {
        bibstart: '<div class="csl-bib-body">',
        bibend: "</div>",
        bibliography_errors: [],
        entry_ids: [],
        maxoffset: 0,
        entryspacing: 1,
        linespacing: 1,
        hangingindent: false,
        "second-field-align": false,
      };
      return {
        params: emptyParams,
        entries: [],
        html: "",
        text: "",
      };
    }

    const [rawParams, rawEntries] = bibResult;

    const params: BibliographyParams = {
      bibstart: rawParams.bibstart || '<div class="csl-bib-body">\n',
      bibend: rawParams.bibend || "</div>",
      bibliography_errors: rawParams.bibliography_errors || [],
      entry_ids: rawParams.entry_ids || [],
      maxoffset: rawParams.maxoffset ?? 0,
      entryspacing: rawParams.entryspacing ?? 1,
      linespacing: rawParams.linespacing ?? 1,
      hangingindent: Boolean(rawParams.hangingindent),
      "second-field-align": rawParams["second-field-align"] ?? false,
    };

    const requestedFormat = format ?? this.outputFormat;
    let entries = rawEntries;
    let html = "";
    let text = "";

    if (requestedFormat === "text") {
      entries = rawEntries.map((e) => decodeHtmlEntities(e).trim());
      text = entries.join("\n");
      html = params.bibstart + rawEntries.join("") + params.bibend;
    } else {
      html = params.bibstart + rawEntries.join("") + params.bibend;
      text = rawEntries.map((e) => stripHtml(e)).join("\n");
    }

    return {
      params,
      entries,
      html,
      text,
    };
  }

  /**
   * Switch the active CSL style (and optional locale), re-rendering all clusters in document order
   * and regenerating the bibliography.
   */
  public switchStyle(newStyleXmlOrId: string, newLang?: string): StyleSwitchResult {
    if (newStyleXmlOrId.includes("<style") || newStyleXmlOrId.trimStart().startsWith("<")) {
      this.styleXml = newStyleXmlOrId;
    } else {
      const foundXml = new StyleRegistry().getXml(newStyleXmlOrId);
      if (!foundXml) {
        throw new UnknownStyleError(newStyleXmlOrId);
      }
      this.styleXml = foundXml;
    }

    if (newLang) {
      this.lang = newLang;
    }

    this.engine = this.getOrCreateEngine(this.styleXml, this.lang, this.outputFormat);

    let clusterUpdates: CitationClusterUpdate[] = [];

    if (this.clusterOrder.length > 0) {
      const adaptedClusters = this.clusterOrder
        .map((id) => this.citationRegistry.get(id))
        .filter((c): c is CitationCluster => Boolean(c))
        .map((c) => this.adaptCluster(c));

      const rebuildResult = this.engine.rebuildProcessorState(adaptedClusters, this.outputFormat);
      if (Array.isArray(rebuildResult)) {
        clusterUpdates = rebuildResult.map(([citationId, _note, formattedText], index) => ({
          index,
          citationId,
          formattedText,
        }));
      }
    } else if (this.itemMap.size > 0) {
      this.engine.updateItems(Array.from(this.itemMap.keys()));
    }

    const bibliography = this.makeBibliography();

    return {
      clusterUpdates,
      bibliography,
    };
  }

  /**
   * Switch the active CSL style by ID, fetching XML from registry (supports async lazy-loading).
   */
  public async switchStyleById(
    styleId: string,
    lang?: string,
    registry?: StyleRegistry,
  ): Promise<StyleSwitchResult> {
    const reg = registry ?? new StyleRegistry();
    const xml = await reg.load(styleId);
    return this.switchStyle(xml, lang);
  }
}
