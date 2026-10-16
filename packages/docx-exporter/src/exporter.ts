import { Document, Paragraph, TextRun, HeadingLevel, Packer, type ParagraphChild } from "docx";
import type {
  DocxExportInput,
  DocxParagraphChild,
  DocxTextRun,
  DocxCitationRun,
  ZoteroCitationPayload,
} from "./types.js";
import {
  createZoteroCitationFieldRuns,
  createBibliographyBeginRuns,
  createBibliographyEndRuns,
} from "./fields.js";

/**
 * Parses simple inline HTML (e.g. <i>, <b>, <u>) from CSL output into styled TextRuns.
 */
export function htmlToTextRuns(html: string): TextRun[] {
  let clean = html.trim();
  clean = clean.replace(/^<div[^>]*>([\s\S]*?)<\/div>$/i, "$1").trim();
  clean = clean.replace(/^<p[^>]*>([\s\S]*?)<\/p>$/i, "$1").trim();

  const regex = /<(\/?)(i|em|b|strong|u|code|sub|sup)\b[^>]*>/gi;
  const runs: TextRun[] = [];
  let lastIndex = 0;
  const activeStyles = {
    italic: false,
    bold: false,
    underline: false,
    code: false,
    sub: false,
    sup: false,
  };

  const decodeEntities = (s: string) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#38;/g, "&")
      .replace(/&#34;/g, '"');

  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    if (match.index > lastIndex) {
      const rawText = clean.substring(lastIndex, match.index);
      const text = decodeEntities(rawText);
      if (text) {
        runs.push(
          new TextRun({
            text,
            italics: activeStyles.italic,
            bold: activeStyles.bold,
            underline: activeStyles.underline ? {} : undefined,
            subScript: activeStyles.sub,
            superScript: activeStyles.sup,
            font: activeStyles.code ? "Courier New" : undefined,
          }),
        );
      }
    }
    const isClosing = match[1] === "/";
    const tag = match[2].toLowerCase();
    if (tag === "i" || tag === "em") activeStyles.italic = !isClosing;
    else if (tag === "b" || tag === "strong") activeStyles.bold = !isClosing;
    else if (tag === "u") activeStyles.underline = !isClosing;
    else if (tag === "code") activeStyles.code = !isClosing;
    else if (tag === "sub") activeStyles.sub = !isClosing;
    else if (tag === "sup") activeStyles.sup = !isClosing;

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < clean.length) {
    const rawText = clean.substring(lastIndex);
    const text = decodeEntities(rawText);
    if (text) {
      runs.push(
        new TextRun({
          text,
          italics: activeStyles.italic,
          bold: activeStyles.bold,
          underline: activeStyles.underline ? {} : undefined,
          subScript: activeStyles.sub,
          superScript: activeStyles.sup,
          font: activeStyles.code ? "Courier New" : undefined,
        }),
      );
    }
  }

  return runs.length > 0 ? runs : [new TextRun(decodeEntities(clean))];
}

/**
 * Normalizes a citation run into a full Zotero CSL_CITATION payload.
 */
function buildCitationPayload(
  citation: DocxCitationRun,
  fallbackIndex: number,
): { payload: ZoteroCitationPayload; formattedText: string } {
  if (citation.payload) {
    const formatted =
      citation.formattedText || citation.payload.properties?.formattedCitation || "(...)";
    return {
      payload: citation.payload,
      formattedText: formatted,
    };
  }

  const citationID =
    citation.citationId || `c_${fallbackIndex}_${Math.random().toString(36).substring(2, 9)}`;
  const formattedText = citation.formattedText || "(...)";

  const citationItems = (citation.items || []).map((item, idx) => {
    const id = item.id ?? `item_${idx + 1}`;
    const locator = item.locator;
    const label = item.label || (locator ? "page" : undefined);
    const suppressAuthor = item["suppress-author"] ?? item.suppressAuthor ?? false;

    return {
      id,
      ...(locator !== undefined ? { locator } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(item.prefix !== undefined ? { prefix: item.prefix } : {}),
      ...(item.suffix !== undefined ? { suffix: item.suffix } : {}),
      "suppress-author": suppressAuthor,
      uris:
        item.uris && item.uris.length > 0
          ? item.uris
          : [`http://zotero.org/users/local/items/${id}`],
      ...(item.itemData ? { itemData: item.itemData } : {}),
    };
  });

  const payload: ZoteroCitationPayload = {
    citationID,
    citationItems,
    properties: {
      formattedCitation: formattedText,
      plainCitation: formattedText,
      dontUpdate: false,
      noteIndex: citation.noteIndex ?? 0,
      ...(citation.properties || {}),
    },
    schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json",
  };

  return { payload, formattedText };
}

/**
 * Converts a paragraph child to DOCX ParagraphChild elements.
 */
function convertChildToRuns(
  child: DocxParagraphChild,
  citationCounter: { current: number },
): ParagraphChild[] {
  if (typeof child === "string") {
    return [new TextRun(child)];
  }

  if (child.type === "citation") {
    citationCounter.current += 1;
    const { payload, formattedText } = buildCitationPayload(child, citationCounter.current);
    return createZoteroCitationFieldRuns(payload, formattedText);
  }

  // Text run
  const textRun = child as DocxTextRun;
  return [
    new TextRun({
      text: textRun.text,
      bold: textRun.bold,
      italics: textRun.italic,
      underline: textRun.underline ? {} : undefined,
      strike: textRun.strike,
      font: textRun.code ? "Courier New" : undefined,
      color: textRun.color,
      subScript: textRun.subScript,
      superScript: textRun.superScript,
    }),
  ];
}

/**
 * Extracts distinct bibliography entries from input options.
 */
function extractBibliographyEntries(bib?: DocxExportInput["bibliography"]): string[] {
  if (!bib) return [];
  if (bib.entries && bib.entries.length > 0) {
    return bib.entries;
  }
  if (bib.html) {
    const entryMatches = [
      ...bib.html.matchAll(/<div[^>]*class=["'][^"']*csl-entry[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi),
    ];
    if (entryMatches.length > 0) {
      return entryMatches.map((m) => m[1].trim());
    }
    const pMatches = [...bib.html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
    if (pMatches.length > 0) {
      return pMatches.map((m) => m[1].trim());
    }
    return [bib.html.trim()];
  }
  if (bib.text) {
    const parts = bib.text.split(/\n\s*\n/);
    return parts.map((p) => p.trim()).filter((p) => p.length > 0);
  }
  return [];
}

/**
 * Exports a simplified document model with native Zotero citation & bibliography
 * field codes into a valid .docx Buffer.
 */
export async function exportDocumentToDocx(input: DocxExportInput): Promise<Buffer> {
  const docParagraphs: Paragraph[] = [];
  const citationCounter = { current: 0 };

  // Document Title
  if (input.title) {
    docParagraphs.push(
      new Paragraph({
        text: input.title,
        heading: HeadingLevel.TITLE,
      }),
    );
  }

  // Body Paragraphs
  for (const para of input.paragraphs || []) {
    const runs: ParagraphChild[] = [];
    for (const child of para.children || []) {
      runs.push(...convertChildToRuns(child, citationCounter));
    }

    let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
    if (para.type === "heading" || para.level) {
      const level = para.level || 1;
      switch (level) {
        case 1:
          heading = HeadingLevel.HEADING_1;
          break;
        case 2:
          heading = HeadingLevel.HEADING_2;
          break;
        case 3:
          heading = HeadingLevel.HEADING_3;
          break;
        case 4:
          heading = HeadingLevel.HEADING_4;
          break;
        case 5:
          heading = HeadingLevel.HEADING_5;
          break;
        case 6:
          heading = HeadingLevel.HEADING_6;
          break;
        default:
          heading = HeadingLevel.HEADING_1;
      }
    }

    docParagraphs.push(
      new Paragraph({
        children: runs,
        heading,
      }),
    );
  }

  // Bibliography
  if (input.bibliography) {
    const bib = input.bibliography;
    const entries = extractBibliographyEntries(bib);

    if (bib.heading) {
      docParagraphs.push(
        new Paragraph({
          text: bib.heading,
          heading: HeadingLevel.HEADING_1,
        }),
      );
    }

    const asField = bib.asField !== false;

    if (asField) {
      if (entries.length === 0) {
        docParagraphs.push(
          new Paragraph({
            children: [...createBibliographyBeginRuns(), ...createBibliographyEndRuns()],
          }),
        );
      } else if (entries.length === 1) {
        docParagraphs.push(
          new Paragraph({
            children: [
              ...createBibliographyBeginRuns(),
              ...htmlToTextRuns(entries[0]),
              ...createBibliographyEndRuns(),
            ],
          }),
        );
      } else {
        // First entry begins the field
        docParagraphs.push(
          new Paragraph({
            children: [...createBibliographyBeginRuns(), ...htmlToTextRuns(entries[0])],
          }),
        );
        // Middle entries
        for (let i = 1; i < entries.length - 1; i++) {
          docParagraphs.push(
            new Paragraph({
              children: htmlToTextRuns(entries[i]),
            }),
          );
        }
        // Last entry ends the field
        docParagraphs.push(
          new Paragraph({
            children: [
              ...htmlToTextRuns(entries[entries.length - 1]),
              ...createBibliographyEndRuns(),
            ],
          }),
        );
      }
    } else {
      // Fallback: standard formatted paragraphs without field code
      for (const entry of entries) {
        docParagraphs.push(
          new Paragraph({
            children: htmlToTextRuns(entry),
          }),
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        children: docParagraphs,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
