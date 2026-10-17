export const DEFAULT_STYLE_ID = "apa";
export const DEFAULT_STYLE_TITLE = "American Psychological Association 7th edition (APA 7th)";
export const DEFAULT_LOCALE = "tr-TR";
export const ZOTERO_STYLE_URL_PREFIX = "http://www.zotero.org/styles/";

/**
 * Pinned popular styles as required by ZC-03 / ZC-05:
 * APA 7, IEEE, Chicago (author-date & notes), MLA, Harvard (cite-them-right), Vancouver, TÜBİTAK.
 */
export const PINNED_STYLE_IDS = [
  "apa",
  "ieee",
  "chicago-author-date",
  "chicago-notes-bibliography",
  "modern-language-association",
  "harvard-cite-them-right",
  "vancouver",
  "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
] as const;

export interface PinnedStyleDefinition {
  id: string;
  title: string;
  shortTitle: string;
  citationFormat: "author-date" | "numeric" | "note";
}

export const PINNED_POPULAR_STYLES: PinnedStyleDefinition[] = [
  {
    id: "apa",
    title: "American Psychological Association 7th edition",
    shortTitle: "APA 7th",
    citationFormat: "author-date",
  },
  {
    id: "ieee",
    title: "IEEE",
    shortTitle: "IEEE",
    citationFormat: "numeric",
  },
  {
    id: "chicago-author-date",
    title: "Chicago Manual of Style 17th/18th edition (author-date)",
    shortTitle: "Chicago (Yazar-Tarih)",
    citationFormat: "author-date",
  },
  {
    id: "chicago-notes-bibliography",
    title: "Chicago Manual of Style 17th/18th edition (notes and bibliography)",
    shortTitle: "Chicago (Dipnotlar)",
    citationFormat: "note",
  },
  {
    id: "modern-language-association",
    title: "Modern Language Association 9th edition",
    shortTitle: "MLA 9th",
    citationFormat: "author-date",
  },
  {
    id: "harvard-cite-them-right",
    title: "Harvard (Cite Them Right 12th edition)",
    shortTitle: "Harvard",
    citationFormat: "author-date",
  },
  {
    id: "vancouver",
    title: "Vancouver",
    shortTitle: "Vancouver",
    citationFormat: "numeric",
  },
  {
    id: "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
    title: "TÜBİTAK (Türkiye Bilimsel ve Teknolojik Araştırma Kurumu) (Türkçe)",
    shortTitle: "TÜBİTAK",
    citationFormat: "numeric",
  },
];

export interface ZoteroPrefOptions {
  styleId: string;
  locale?: string;
  hasBibliography?: boolean;
  sessionId?: string;
  zoteroVersion?: string;
  fieldType?: "Field" | "Bookmark";
}

export interface ParsedZoteroPref {
  styleId: string;
  styleHref: string;
  locale: string;
  hasBibliography: boolean;
  bibliographyStyleHasBeenSet: boolean;
  sessionId: string | null;
  fieldType: string;
  rawXml: string;
}

export interface ZoteroPrefChunk {
  name: string;
  value: string;
}

function generateRandomHex(length = 16): string {
  const chars = "0123456789abcdef";
  let res = "";
  for (let i = 0; i < length; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

/**
 * Normalizes a style identifier to a clean style ID (e.g. "apa").
 */
export function normalizeStyleId(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/www\.zotero\.org\/styles\//, "")
    .replace(/\/$/, "");
}

/**
 * Builds the canonical Zotero Word preferences XML payload.
 * Format:
 * <data data-version="3" zotero-version="7.0.0">
 *   <session id="..."/>
 *   <style id="http://www.zotero.org/styles/apa" locale="tr-TR" hasBibliography="1" bibliographyStyleHasBeenSet="0"/>
 *   <prefs><pref name="fieldType" value="Field"/></prefs>
 * </data>
 */
export function buildZoteroPrefXml(options: ZoteroPrefOptions): string {
  const cleanId = normalizeStyleId(options.styleId);
  const styleHref = `${ZOTERO_STYLE_URL_PREFIX}${cleanId}`;
  const locale = options.locale || DEFAULT_LOCALE;
  const hasBib = options.hasBibliography !== false ? "1" : "0";
  const sessionId = options.sessionId || generateRandomHex(16);
  const zoteroVersion = options.zoteroVersion || "7.0.0";
  const fieldType = options.fieldType || "Field";

  return `<data data-version="3" zotero-version="${zoteroVersion}"><session id="${sessionId}"/><style id="${styleHref}" locale="${locale}" hasBibliography="${hasBib}" bibliographyStyleHasBeenSet="0"/><prefs><pref name="fieldType" value="${fieldType}"/></prefs></data>`;
}

/**
 * Parses Zotero preference XML string into structured metadata.
 */
export function parseZoteroPrefXml(xml: string): ParsedZoteroPref | null {
  if (!xml || typeof xml !== "string" || !xml.includes("<data")) {
    return null;
  }

  const styleMatch = xml.match(/<style\b([^>]*)\/?>/);
  if (!styleMatch) {
    return null;
  }

  const attrs = styleMatch[1];
  const idMatch = attrs.match(/\bid="([^"]+)"/);
  if (!idMatch) {
    return null;
  }

  const rawHref = idMatch[1];
  const styleId = normalizeStyleId(rawHref);

  const locMatch = attrs.match(/\blocale="([^"]+)"/);
  const locale = locMatch ? locMatch[1] : DEFAULT_LOCALE;

  const bibMatch = attrs.match(/\bhasBibliography="([^"]+)"/);
  const hasBibliography = bibMatch ? bibMatch[1] === "1" : true;

  const bibSetMatch = attrs.match(/\bbibliographyStyleHasBeenSet="([^"]+)"/);
  const bibliographyStyleHasBeenSet = bibSetMatch ? bibSetMatch[1] === "1" : false;

  const sessMatch = xml.match(/<session\b[^>]*\bid="([^"]+)"/);
  const sessionId = sessMatch ? sessMatch[1] : null;

  const fieldTypeMatch = xml.match(/<pref\b[^>]*\bname="fieldType"[^>]*\bvalue="([^"]+)"/);
  const fieldType = fieldTypeMatch ? fieldTypeMatch[1] : "Field";

  return {
    styleId,
    styleHref: rawHref,
    locale,
    hasBibliography,
    bibliographyStyleHasBeenSet,
    sessionId,
    fieldType,
    rawXml: xml,
  };
}

/**
 * Splits Zotero preference XML into chunks of at most chunkSize (default 250 characters),
 * suitable for Word's 255-character custom property limit (ZOTERO_PREF_1, ZOTERO_PREF_2...).
 */
export function chunkZoteroPref(xml: string, chunkSize = 250): ZoteroPrefChunk[] {
  const chunks: ZoteroPrefChunk[] = [];
  const safeSize = Math.max(10, Math.min(chunkSize, 250));
  let idx = 1;

  for (let i = 0; i < xml.length; i += safeSize) {
    chunks.push({
      name: `ZOTERO_PREF_${idx}`,
      value: xml.slice(i, i + safeSize),
    });
    idx++;
  }

  return chunks;
}

/**
 * Reassembles chunked ZOTERO_PREF_* properties into a single XML string.
 */
export function reassembleZoteroPref(
  props: Record<string, string> | ZoteroPrefChunk[],
): string {
  const list: Array<{ idx: number; val: string }> = [];

  if (Array.isArray(props)) {
    for (const item of props) {
      const m = item.name.match(/^ZOTERO_PREF_(\d+)$/);
      if (m) {
        list.push({ idx: Number(m[1]), val: item.value });
      }
    }
  } else if (props && typeof props === "object") {
    for (const [k, v] of Object.entries(props)) {
      const m = k.match(/^ZOTERO_PREF_(\d+)$/);
      if (m && typeof v === "string") {
        list.push({ idx: Number(m[1]), val: v });
      }
    }
  }

  list.sort((a, b) => a.idx - b.idx);
  return list.map((item) => item.val).join("");
}

/**
 * Real storage keys read and written by the official ONLYOFFICE Zotero plugin
 * (CslStylesManager, LocalesManager, CslStylesStorage).
 */
export const ZOTERO_PLUGIN_STORAGE_KEYS = {
  STYLE_ID: "zoteroStyleId",
  LANG: "zoteroLang",
  FORMAT_ID: "zoteroFormatId",
  CONTAIN_BIBLIOGRAPHY: "zoteroContainBibliography",
  NOTES_STYLE_ID: "zoteroNotesStyleId",
  INCLUDE_URL: "zoteroIncludeUrlForPaperArticles",
  ABBREVIATE_JOURNAL: "zoteroAbbreviateJournalTitles",
  // Legacy / alias keys
  STYLE: "zoteroStyle",
  LOCALE: "zoteroLocale",
  STYLE_UNDERSCORE: "zotero_style",
  LOCALE_UNDERSCORE: "zotero_locale",
} as const;

/**
 * Determines citation format (author-date, numeric, note) for a style ID.
 */
export function getStyleCitationFormat(
  styleId: string,
): "author-date" | "numeric" | "note" {
  const clean = normalizeStyleId(styleId).toLowerCase();
  const pinned = PINNED_POPULAR_STYLES.find((p) => p.id === clean);
  if (pinned) return pinned.citationFormat;
  if (
    clean.includes("note") ||
    clean.includes("chicago-notes") ||
    clean.includes("fullnote")
  ) {
    return "note";
  }
  if (
    clean.includes("numeric") ||
    clean.includes("ieee") ||
    clean.includes("vancouver") ||
    clean.includes("tubitak") ||
    clean.includes("turkiye-bilimsel") ||
    clean.includes("acm") ||
    clean.includes("nature")
  ) {
    return "numeric";
  }
  return "author-date";
}
