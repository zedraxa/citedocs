import type { CSLItem } from "@citedocs/shared";

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
}

export interface CitationClusterUpdate {
  index: number;
  citationId: string;
  formattedText: string;
}
