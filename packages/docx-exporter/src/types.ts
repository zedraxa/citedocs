import type { CSLItem } from "@citedocs/shared";

/**
 * Standard locator labels supported by CSL and Zotero Word plugins.
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
  itemData?: CSLItem | Record<string, unknown>;
  uris?: string[];
  locator?: string;
  label?: ZoteroLocatorLabel;
  prefix?: string;
  suffix?: string;
  suppressAuthor?: boolean;
  "suppress-author"?: boolean;
  [key: string]: unknown;
}

/**
 * Full CSL_CITATION JSON payload serialized into Word field instructions:
 * ADDIN ZOTERO_ITEM CSL_CITATION <payload>
 */
export interface ZoteroCitationPayload {
  citationID: string;
  citationItems: ZoteroCitationItem[];
  properties: {
    formattedCitation: string;
    plainCitation?: string;
    dontUpdate?: boolean;
    noteIndex?: number;
    [key: string]: unknown;
  };
  schema?: string;
  [key: string]: unknown;
}

/**
 * Inline text styling options for rich text runs.
 */
export interface DocxTextRun {
  type?: "text";
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
  highlight?: string;
  subScript?: boolean;
  superScript?: boolean;
}

/**
 * Inline citation cluster node within a paragraph.
 */
export interface DocxCitationRun {
  type: "citation";
  citationId?: string;
  payload?: ZoteroCitationPayload;
  items?: ZoteroCitationItem[];
  formattedText?: string;
  noteIndex?: number;
  properties?: Partial<ZoteroCitationPayload["properties"]>;
}

export type DocxParagraphChild = DocxTextRun | DocxCitationRun | string;

export interface DocxParagraph {
  type?: "paragraph" | "heading";
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  children: DocxParagraphChild[];
}

export interface DocxBibliography {
  entries?: string[];
  html?: string;
  text?: string;
  heading?: string;
  asField?: boolean;
}

export interface DocxExportInput {
  title?: string;
  paragraphs: DocxParagraph[];
  bibliography?: DocxBibliography;
  cslStyleId?: string;
}

export interface ExtractedZoteroField {
  fieldType: "citation" | "bibliography" | "unknown";
  rawInstruction: string;
  citation?: ZoteroCitationPayload;
  bibliography?: Record<string, unknown>;
  formattedText?: string;
}

export interface ExtractedZoteroFieldsResult extends Array<ZoteroCitationPayload> {
  citations: ZoteroCitationPayload[];
  fields: ExtractedZoteroField[];
  bibliography?: ExtractedZoteroField;
}
