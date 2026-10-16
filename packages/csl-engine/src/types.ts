import type { CSLItem, CitationCluster } from "@citedocs/shared";

export type OutputFormat = "html" | "text" | "rtf";

export interface CiteprocSys {
  retrieveItem(id: string | number): CSLItem | undefined;
  retrieveLocale(lang: string): string | Record<string, unknown> | undefined;
  variableWrapper?(params: unknown, prePunct: string, str: string, postPunct: string): string;
}

export interface BibliographyParams {
  bibstart: string;
  bibend: string;
  bibliography_errors: string[];
  entry_ids: string[][];
  maxoffset: number;
  entryspacing: number;
  linespacing: number;
  hangingindent: boolean;
  "second-field-align": boolean | string;
}

export interface BibliographyOutput {
  params: BibliographyParams;
  entries: string[];
  html: string;
  text?: string;
}

export interface CitationClusterUpdate {
  index: number;
  citationId: string;
  formattedText: string;
}

export interface StyleSwitchResult {
  clusterUpdates: CitationClusterUpdate[];
  bibliography: BibliographyOutput;
}

export type StyleLoader = (styleId: string) => Promise<string | undefined>;
export type LocaleLoader = (localeId: string) => Promise<string | undefined>;

export interface CSLEngineOptions {
  lang?: string;
  outputFormat?: OutputFormat;
  localeResolver?: (lang: string) => string | undefined;
  initialItems?: CSLItem[];
  clusters?: CitationCluster[];
}
