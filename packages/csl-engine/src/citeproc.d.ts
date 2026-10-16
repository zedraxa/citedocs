declare module "citeproc" {
  export interface CiteprocBibliographyParams {
    bibstart: string;
    bibend: string;
    bibliography_errors: string[];
    entry_ids: string[][];
    maxoffset: number;
    entryspacing: number;
    linespacing: number;
    hangingindent: boolean;
    "second-field-align": boolean | string;
    done?: boolean;
    [key: string]: unknown;
  }

  export type CiteprocBibliographyResult = [CiteprocBibliographyParams, string[]] | false;

  export interface CiteprocEngine {
    opt: {
      mode: string;
      [key: string]: unknown;
    };
    updateItems(itemIds: (string | number)[]): void;
    updateUncitedItems(itemIds?: (string | number)[]): void;
    setOutputFormat(format: "html" | "text" | "rtf" | string): void;
    processCitationCluster(
      citationCluster: unknown,
      citationsPre: [string, number][],
      citationsPost: [string, number][],
      flags?: number,
    ): [{ bibchange: boolean; citation_errors: string[] }, [number, string, string][]];
    previewCitationCluster(
      citationCluster: unknown,
      citationsPre: [string, number][],
      citationsPost: [string, number][],
      format?: string,
    ): string;
    makeBibliography(sectionFilter?: unknown): CiteprocBibliographyResult;
    rebuildProcessorState(
      citations: unknown[],
      mode?: string,
      uncitedItemIDs?: unknown,
    ): [string, number, string][];
    [key: string]: unknown;
  }

  export interface CiteprocStatic {
    Engine: new (
      sys: unknown,
      style: string | object,
      lang?: string,
      forceLang?: unknown,
    ) => CiteprocEngine;
    parseXml: (xml: string) => object;
    setupXml: (xml: string | object) => unknown;
    [key: string]: unknown;
  }

  const CSL: CiteprocStatic;
  export default CSL;
}
