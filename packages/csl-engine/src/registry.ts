import type { CitationStyleMeta } from "@citedocs/shared";
import { BUNDLED_STYLES_XML, APA_STYLE_XML } from "./assets/styles.js";
import { BUNDLED_LOCALES_XML, LOCALE_EN_US_XML } from "./assets/locales.js";
import { UnknownStyleError, UnknownLocaleError } from "./errors.js";
import type { StyleLoader, LocaleLoader } from "./types.js";

export const BUILTIN_STYLES: CitationStyleMeta[] = [
  {
    id: "apa",
    title: "American Psychological Association 7th edition",
    shortTitle: "APA 7th",
    citationFormat: "author-date",
    independent: true,
  },
  {
    id: "ieee",
    title: "IEEE",
    shortTitle: "IEEE",
    citationFormat: "numeric",
    independent: true,
  },
  {
    id: "chicago-author-date",
    title: "Chicago Manual of Style 17th edition (author-date)",
    shortTitle: "Chicago (Author-Date)",
    citationFormat: "author-date",
    independent: true,
  },
  {
    id: "chicago-fullnote-bibliography",
    title: "Chicago Manual of Style 17th edition (full note)",
    shortTitle: "Chicago (Notes)",
    citationFormat: "note",
    independent: true,
  },
  {
    id: "modern-language-association",
    title: "Modern Language Association 9th edition",
    shortTitle: "MLA 9th",
    citationFormat: "author-date",
    independent: true,
  },
  {
    id: "vancouver",
    title: "Vancouver",
    shortTitle: "Vancouver",
    citationFormat: "numeric",
    independent: true,
  },
  {
    id: "harvard-cite-them-right",
    title: "Harvard (Cite Them Right)",
    shortTitle: "Harvard",
    citationFormat: "author-date",
    independent: true,
  },
  {
    id: "nature",
    title: "Nature",
    shortTitle: "Nature",
    citationFormat: "numeric",
    independent: true,
  },
  {
    id: "science",
    title: "Science",
    shortTitle: "Science",
    citationFormat: "numeric",
    independent: true,
  },
  {
    id: "acm-sig-proceedings",
    title: "ACM SIG Proceedings",
    shortTitle: "ACM",
    citationFormat: "numeric",
    independent: true,
  },
];

export const MOCK_APA_CSL = APA_STYLE_XML;

export class StyleRegistry {
  private styles: Map<string, CitationStyleMeta> = new Map();
  private xmlCache: Map<string, string> = new Map();
  private loader?: StyleLoader;

  constructor() {
    for (const style of BUILTIN_STYLES) {
      this.styles.set(style.id, style);
    }
    for (const [id, xml] of Object.entries(BUNDLED_STYLES_XML)) {
      this.xmlCache.set(id, xml);
    }
  }

  public get(id: string): CitationStyleMeta | undefined {
    return this.styles.get(id);
  }

  public getXml(id: string): string | undefined {
    return this.xmlCache.get(id);
  }

  public has(id: string): boolean {
    return this.styles.has(id) || this.xmlCache.has(id);
  }

  public register(meta: CitationStyleMeta, xml?: string): void {
    this.styles.set(meta.id, meta);
    if (xml) {
      this.xmlCache.set(meta.id, xml);
    }
  }

  public registerXml(id: string, xml: string): void {
    this.xmlCache.set(id, xml);
  }

  public setLoader(loader: StyleLoader): void {
    this.loader = loader;
  }

  public async load(id: string): Promise<string> {
    const cached = this.xmlCache.get(id);
    if (cached) {
      return cached;
    }

    if (this.loader) {
      const loaded = await this.loader(id);
      if (loaded) {
        this.xmlCache.set(id, loaded);
        return loaded;
      }
    }

    throw new UnknownStyleError(id);
  }

  public async getOrLoadXml(id: string): Promise<string> {
    return this.load(id);
  }

  public search(query: string): CitationStyleMeta[] {
    const q = query.toLowerCase().trim();
    if (!q) return Array.from(this.styles.values());

    return Array.from(this.styles.values()).filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        (s.shortTitle && s.shortTitle.toLowerCase().includes(q)),
    );
  }

  public list(): CitationStyleMeta[] {
    return Array.from(this.styles.values());
  }
}

export class LocaleRegistry {
  private locales: Map<string, string> = new Map();
  private loader?: LocaleLoader;

  constructor() {
    for (const [lang, xml] of Object.entries(BUNDLED_LOCALES_XML)) {
      this.locales.set(lang, xml);
    }
  }

  public get(lang: string): string | undefined {
    const direct = this.locales.get(lang);
    if (direct) return direct;

    const normalized = lang.replace("_", "-");
    const normMatch = this.locales.get(normalized);
    if (normMatch) return normMatch;

    const base = normalized.split("-")[0];
    const baseMatch = this.locales.get(base);
    if (baseMatch) return baseMatch;

    // Fallback to en-US
    return this.locales.get("en-US") ?? LOCALE_EN_US_XML;
  }

  public has(lang: string): boolean {
    return this.locales.has(lang);
  }

  public register(lang: string, xml: string): void {
    this.locales.set(lang, xml);
  }

  public setLoader(loader: LocaleLoader): void {
    this.loader = loader;
  }

  public async load(lang: string): Promise<string> {
    const cached = this.get(lang);
    if (cached) return cached;

    if (this.loader) {
      const loaded = await this.loader(lang);
      if (loaded) {
        this.locales.set(lang, loaded);
        return loaded;
      }
    }

    const fallback = this.locales.get("en-US") ?? LOCALE_EN_US_XML;
    if (fallback) return fallback;

    throw new UnknownLocaleError(lang);
  }
}
