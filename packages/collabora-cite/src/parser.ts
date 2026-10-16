import type {
  ParsedDocumentField,
  DocumentFieldFormat,
  ZoteroCitationPayload,
  ZoteroBibliographyPayload,
  ZoteroDocumentPrefs,
} from "./types.js";

function decodeEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractJsonBraceBalanced(str: string): string | null {
  const start = str.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < str.length; i++) {
    const ch = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return str.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Parses an individual raw field code string or LibreOffice ReferenceMark/Bookmark name.
 */
export function parseFieldCode(rawInput: string, formattedText?: string): ParsedDocumentField {
  const raw = rawInput.trim();
  const format: DocumentFieldFormat = raw.includes("ADDIN ") ? "word" : "libreoffice";

  // Check for RND suffix (common in LibreOffice ReferenceMarks)
  let rndSuffix: string | undefined;
  const rndMatch = raw.match(/\s+RND([a-zA-Z0-9_-]+)$/);
  if (rndMatch) {
    rndSuffix = rndMatch[1];
  }

  // 1. Zotero Citation Field
  if (raw.includes("ZOTERO_ITEM") || raw.includes("CSL_CITATION")) {
    const decoded = decodeEntities(raw);
    const jsonStr = extractJsonBraceBalanced(decoded);

    if (jsonStr) {
      try {
        const payload = JSON.parse(jsonStr) as ZoteroCitationPayload;
        return {
          type: "citation",
          format,
          rawCode: raw,
          markName: format === "libreoffice" ? raw : undefined,
          rndSuffix,
          citation: payload,
          formattedText: formattedText || payload.properties?.formattedCitation,
        };
      } catch {
        // Fallback to unknown if JSON parsing fails
      }
    }

    return {
      type: "citation",
      format,
      rawCode: raw,
      markName: format === "libreoffice" ? raw : undefined,
      rndSuffix,
    };
  }

  // 2. Zotero Bibliography Field
  if (raw.includes("ZOTERO_BIBL")) {
    const decoded = decodeEntities(raw);
    const jsonStr = extractJsonBraceBalanced(decoded);
    let biblPayload: ZoteroBibliographyPayload = { uncited: [], omitted: [], custom: [] };

    if (jsonStr) {
      try {
        biblPayload = JSON.parse(jsonStr) as ZoteroBibliographyPayload;
      } catch {
        // Use default
      }
    }

    return {
      type: "bibliography",
      format,
      rawCode: raw,
      markName: format === "libreoffice" ? raw : undefined,
      rndSuffix,
      bibliography: biblPayload,
      formattedText,
    };
  }

  // 3. Document Preferences (ZOTERO_PREF)
  if (raw.includes("ZOTERO_PREF")) {
    const decoded = decodeEntities(raw);
    const jsonStr = extractJsonBraceBalanced(decoded);
    let prefs: ZoteroDocumentPrefs = { style: "apa", locale: "en-US" };

    if (jsonStr) {
      try {
        prefs = JSON.parse(jsonStr) as ZoteroDocumentPrefs;
      } catch {
        // Use default
      }
    }

    return {
      type: "pref",
      format,
      rawCode: raw,
      markName: format === "libreoffice" ? raw : undefined,
      rndSuffix,
      prefs,
    };
  }

  return {
    type: "unknown",
    format,
    rawCode: raw,
    markName: format === "libreoffice" ? raw : undefined,
  };
}

/**
 * Parses an array of document field strings or objects.
 */
export function parseDocumentFields(
  fields: (string | { name: string; text?: string })[],
): ParsedDocumentField[] {
  return fields.map((f) => {
    if (typeof f === "string") {
      return parseFieldCode(f);
    }
    return parseFieldCode(f.name, f.text);
  });
}
