import type { CitationNodeAttributes, BibliographyNodeAttributes } from "./schema.js";
import type { SwitchStyleOptions } from "./csl.js";
import type { BibliographyStorage } from "./extensions/bibliography.js";

declare module "@tiptap/core" {
  interface Storage {
    bibliography?: BibliographyStorage;
  }

  interface Commands<ReturnType> {
    undoRedo: {
      undo: () => ReturnType;
      redo: () => ReturnType;
    };
    bold: {
      setBold: () => ReturnType;
      toggleBold: () => ReturnType;
      unsetBold: () => ReturnType;
    };
    italic: {
      setItalic: () => ReturnType;
      toggleItalic: () => ReturnType;
      unsetItalic: () => ReturnType;
    };
    underline: {
      setUnderline: () => ReturnType;
      toggleUnderline: () => ReturnType;
      unsetUnderline: () => ReturnType;
    };
    strike: {
      setStrike: () => ReturnType;
      toggleStrike: () => ReturnType;
      unsetStrike: () => ReturnType;
    };
    paragraph: {
      setParagraph: () => ReturnType;
    };
    heading: {
      setHeading: (attributes: { level: 1 | 2 | 3 | 4 | 5 | 6 }) => ReturnType;
      toggleHeading: (attributes: { level: 1 | 2 | 3 | 4 | 5 | 6 }) => ReturnType;
    };
    blockquote: {
      setBlockquote: () => ReturnType;
      toggleBlockquote: () => ReturnType;
      unsetBlockquote: () => ReturnType;
    };
    codeBlock: {
      setCodeBlock: (attributes?: { language: string }) => ReturnType;
      toggleCodeBlock: (attributes?: { language: string }) => ReturnType;
    };
    bulletList: {
      toggleBulletList: () => ReturnType;
    };
    orderedList: {
      toggleOrderedList: () => ReturnType;
    };
    textAlign: {
      setTextAlign: (alignment: string) => ReturnType;
      unsetTextAlign: () => ReturnType;
      toggleTextAlign: (alignment: string) => ReturnType;
    };
    citation: {
      setCitation: (attributes: CitationNodeAttributes) => ReturnType;
      insertCitation: (attributes: CitationNodeAttributes) => ReturnType;
    };
    bibliography: {
      setBibliography: (attributes?: Partial<BibliographyNodeAttributes>) => ReturnType;
      insertBibliography: (attributes?: Partial<BibliographyNodeAttributes>) => ReturnType;
      updateBibliography: (attributes?: Partial<BibliographyNodeAttributes>) => ReturnType;
      switchStyle: (styleId: string, options?: SwitchStyleOptions) => ReturnType;
    };
  }
}

export {};
