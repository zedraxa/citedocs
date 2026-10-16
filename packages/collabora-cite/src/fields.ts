import type {
  ZoteroCitationPayload,
  ZoteroCitationItem,
  ZoteroBibliographyPayload,
  ZoteroDocumentPrefs,
} from "./types.js";
import { stripHtml } from "./engine.js";

export const CSL_CITATION_SCHEMA =
  "https://github.com/citation-style-language/schema/raw/master/csl-citation.json";

/**
 * Generate a random alphanumeric string for LibreOffice ReferenceMark suffixes.
 * Zotero LibreOffice integration appends ` RND<string>` so that every ReferenceMark has a unique name.
 */
export function generateRandomSuffix(length = 10): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a random 8-character citation ID for Zotero citation clusters.
 */
export function generateCitationId(length = 8): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Normalizes citation items to guarantee standard Zotero properties (id, uris, uri, itemData).
 */
export function normalizeCitationItems(items: ZoteroCitationItem[]): ZoteroCitationItem[] {
  return items.map((item) => {
    const stringId = String(item.id);
    const uris = item.uris && item.uris.length > 0
      ? item.uris
      : item.uri && item.uri.length > 0
      ? item.uri
      : [`http://zotero.org/users/local/items/${stringId}`];

    const normalized: ZoteroCitationItem = {
      ...item,
      id: item.id,
      uris,
      uri: uris,
    };

    if (item.locator !== undefined) normalized.locator = String(item.locator);
    if (item.label !== undefined) normalized.label = item.label;
    if (item.prefix !== undefined) normalized.prefix = item.prefix;
    if (item.suffix !== undefined) normalized.suffix = item.suffix;
    if (item.suppressAuthor !== undefined) {
      normalized.suppressAuthor = Boolean(item.suppressAuthor);
      normalized["suppress-author"] = item.suppressAuthor ? 1 : 0;
    } else if (item["suppress-author"] !== undefined) {
      normalized["suppress-author"] = item["suppress-author"] ? 1 : 0;
      normalized.suppressAuthor = Boolean(item["suppress-author"]);
    }

    return normalized;
  });
}

/**
 * Constructs a full Zotero CSL_CITATION payload compliant with schema:
 * https://github.com/citation-style-language/schema/raw/master/csl-citation.json
 */
export function createZoteroCitationPayload(params: {
  citationID?: string;
  items: ZoteroCitationItem[];
  formattedCitation: string;
  plainCitation?: string;
  noteIndex?: number;
  dontUpdate?: boolean;
}): ZoteroCitationPayload {
  const citationID = params.citationID || generateCitationId();
  const plainCitation = params.plainCitation ?? stripHtml(params.formattedCitation);

  return {
    citationID,
    citationItems: normalizeCitationItems(params.items),
    properties: {
      formattedCitation: params.formattedCitation,
      plainCitation,
      noteIndex: params.noteIndex ?? 0,
      dontUpdate: Boolean(params.dontUpdate),
    },
    schema: CSL_CITATION_SCHEMA,
  };
}

/**
 * Constructs the standard bibliography payload:
 * {"uncited":[],"omitted":[],"custom":[]}
 */
export function createZoteroBibliographyPayload(
  payload?: Partial<ZoteroBibliographyPayload>,
): ZoteroBibliographyPayload {
  return {
    uncited: payload?.uncited ?? [],
    omitted: payload?.omitted ?? [],
    custom: payload?.custom ?? [],
    ...payload,
  };
}

/**
 * Builds the Word instruction string for a citation:
 * `ADDIN ZOTERO_ITEM CSL_CITATION {json}`
 */
export function createWordCitationFieldCode(payload: ZoteroCitationPayload): string {
  return `ADDIN ZOTERO_ITEM CSL_CITATION ${JSON.stringify(payload)}`;
}

/**
 * Builds the Word instruction string for a bibliography:
 * `ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY`
 */
export function createWordBibliographyFieldCode(
  payload?: Partial<ZoteroBibliographyPayload>,
): string {
  const biblPayload = createZoteroBibliographyPayload(payload);
  return `ADDIN ZOTERO_BIBL ${JSON.stringify(biblPayload)} CSL_BIBLIOGRAPHY`;
}

/**
 * Builds the Word instruction or document pref string:
 * `ZOTERO_PREF {json}`
 */
export function createWordDocumentPrefsFieldCode(prefs: ZoteroDocumentPrefs): string {
  return `ZOTERO_PREF ${JSON.stringify(prefs)}`;
}

/**
 * Builds the LibreOffice Writer ReferenceMark name for a citation:
 * `ZOTERO_ITEM CSL_CITATION {json} RND...`
 */
export function createLibreOfficeCitationMarkName(
  payload: ZoteroCitationPayload,
  rndSuffix?: string,
): string {
  const suffix = rndSuffix || generateRandomSuffix();
  return `ZOTERO_ITEM CSL_CITATION ${JSON.stringify(payload)} RND${suffix}`;
}

/**
 * Builds the LibreOffice Writer ReferenceMark or Bookmark name for a bibliography:
 * `ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY RND...`
 */
export function createLibreOfficeBibliographyMarkName(
  payload?: Partial<ZoteroBibliographyPayload>,
  rndSuffix?: string,
): string {
  const biblPayload = createZoteroBibliographyPayload(payload);
  const suffix = rndSuffix || generateRandomSuffix();
  return `ZOTERO_BIBL ${JSON.stringify(biblPayload)} CSL_BIBLIOGRAPHY RND${suffix}`;
}

/**
 * Builds the LibreOffice Writer ReferenceMark name for document preferences:
 * `ZOTERO_PREF {json} RND...`
 */
export function createLibreOfficeDocumentPrefsMarkName(
  prefs: ZoteroDocumentPrefs,
  rndSuffix?: string,
): string {
  const suffix = rndSuffix || generateRandomSuffix();
  return `ZOTERO_PREF ${JSON.stringify(prefs)} RND${suffix}`;
}
