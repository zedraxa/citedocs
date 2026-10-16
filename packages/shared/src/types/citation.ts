export type CitationLocatorType =
  "page" | "chapter" | "figure" | "verse" | "line" | "paragraph" | "section" | "part";

export interface CitationItem {
  id: string;
  locator?: string;
  label?: CitationLocatorType;
  prefix?: string;
  suffix?: string;
  suppressAuthor?: boolean;
}

export interface CitationCluster {
  citationId: string;
  citationItems: CitationItem[];
  properties: {
    noteIndex: number;
    formattedCitation?: string;
    dontUpdate?: boolean;
  };
}

export interface CSLName {
  family?: string;
  given?: string;
  literal?: string;
  droppingParticle?: string;
  nonDroppingParticle?: string;
  suffix?: string;
}

export interface CSLDate {
  "date-parts"?: (number | string)[][];
  season?: number | string;
  circa?: boolean | number | string;
  literal?: string;
  raw?: string;
}

export interface CSLItem {
  id: string | number;
  type: string;
  title?: string;
  author?: CSLName[];
  editor?: CSLName[];
  translator?: CSLName[];
  issued?: CSLDate;
  "container-title"?: string;
  "collection-title"?: string;
  volume?: string | number;
  issue?: string | number;
  page?: string;
  publisher?: string;
  "publisher-place"?: string;
  DOI?: string;
  ISBN?: string;
  ISSN?: string;
  URL?: string;
  abstract?: string;
  note?: string;
  [key: string]: unknown;
}

export type CitationFormat = "author-date" | "numeric" | "note" | "label";

export interface CitationStyleMeta {
  id: string;
  title: string;
  shortTitle?: string;
  citationFormat: CitationFormat;
  independent: boolean;
  parentStyle?: string;
  updated?: string;
}
