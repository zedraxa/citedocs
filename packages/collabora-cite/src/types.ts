import type { CSLItem } from "@citedocs/shared";

/**
 * Standard locator labels supported by CSL and Zotero Word/LibreOffice integrations.
 */
export type ZoteroLocatorLabel =
  | "page"
  | "chapter"
  | "figure"
  | "verse"
  | "line"
  | "paragraph"
  | "section"
  | "part"
  | "column"
  | "issue"
  | "volume"
  | (string & {});

/**
 * An individual reference item within a citation cluster.
 */
export interface ZoteroCitationItem {
  id: string | number;
  key?: string;
  uris?: string[];
  uri?: string[];
  itemData?: CSLItem | Record<string, unknown>;
  locator?: string;
  label?: ZoteroLocatorLabel;
  prefix?: string;
  suffix?: string;
  suppressAuthor?: boolean;
  "suppress-author"?: boolean | number;
  [key: string]: unknown;
}

/**
 * Citation properties stored in CSL_CITATION.
 */
export interface ZoteroCitationProperties {
  formattedCitation: string;
  plainCitation?: string;
  noteIndex?: number;
  dontUpdate?: boolean;
  [key: string]: unknown;
}

/**
 * Full CSL_CITATION JSON payload serialized into field codes:
 * ADDIN ZOTERO_ITEM CSL_CITATION <payload>
 * or LibreOffice ReferenceMark:
 * ZOTERO_ITEM CSL_CITATION <payload> RND...
 */
export interface ZoteroCitationPayload {
  citationID: string;
  citationItems: ZoteroCitationItem[];
  properties: ZoteroCitationProperties;
  schema?: string;
  [key: string]: unknown;
}

/**
 * Bibliography field custom payload:
 * ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY
 */
export interface ZoteroBibliographyPayload {
  uncited: (string | number)[];
  omitted: (string | number)[];
  custom: unknown[];
  [key: string]: unknown;
}

/**
 * Document preferences: ZOTERO_PREF
 */
export interface ZoteroDocumentPrefs {
  style: string | { style: string; locale?: string; hasBibliography?: number };
  locale?: string;
  hasBibliography?: number | boolean;
  prefCode?: string;
  [key: string]: unknown;
}

/**
 * Document field types detected in documents.
 */
export type DocumentFieldType = "citation" | "bibliography" | "pref" | "unknown";

/**
 * Target word processor / document format.
 */
export type DocumentFieldFormat = "word" | "libreoffice";

/**
 * Parsed field information extracted from a document.
 */
export interface ParsedDocumentField {
  type: DocumentFieldType;
  format: DocumentFieldFormat;
  rawCode: string;
  markName?: string;
  rndSuffix?: string;
  citation?: ZoteroCitationPayload;
  bibliography?: ZoteroBibliographyPayload;
  prefs?: ZoteroDocumentPrefs;
  formattedText?: string;
}

/**
 * Collabora Online CallPythonScript PostMessage payload.
 */
export interface CallPythonScriptMessage {
  MessageId: "CallPythonScript";
  SendTime?: number;
  ScriptFile: string;
  Function: string;
  Values: Record<string, { type: string; value: unknown }>;
}

/**
 * Collabora Online Send_UNO_Command PostMessage payload.
 */
export interface SendUnoCommandMessage {
  MessageId: "Send_UNO_Command";
  Values: {
    Command: string;
    Args?: Record<string, { type: string; value: unknown }>;
  };
}

export type CollaboraMessage = CallPythonScriptMessage | SendUnoCommandMessage;

/**
 * Refreshed citation cluster result.
 */
export interface RefreshedCitation {
  citationID: string;
  markName?: string;
  fieldCode: string;
  newPayload: ZoteroCitationPayload;
  formattedText: string;
  plainText: string;
}

/**
 * Refreshed bibliography result.
 */
export interface RefreshedBibliography {
  entries: string[];
  html: string;
  text: string;
  fieldCode: string;
  markName?: string;
}

/**
 * Outcome of a document style/citation refresh.
 */
export interface DocumentRefreshResult {
  styleId: string;
  locale: string;
  citations: RefreshedCitation[];
  bibliography?: RefreshedBibliography;
  postMessages: CollaboraMessage[];
}
