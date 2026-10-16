import JSZip from "jszip";
import type {
  ExtractedZoteroField,
  ExtractedZoteroFieldsResult,
  ZoteroCitationPayload,
} from "./types.js";

/**
 * Decodes standard XML entities and numeric character references.
 */
function unescapeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#38;/g, "&")
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

interface InternalField {
  instruction: string;
  formattedText: string;
  state: "instruction" | "result";
}

/**
 * Parses XML text and extracts all Word field instructions and cached visual texts.
 */
function parseFieldsFromXml(xml: string): Array<{
  instruction: string;
  formattedText: string;
}> {
  const fields: Array<{ instruction: string; formattedText: string }> = [];

  // Match simple fields first: <w:fldSimple ... w:instr="..." ...> ... </w:fldSimple>
  const simpleFieldRegex = /<(?:\w+:)?fldSimple\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?fldSimple>/gi;
  let sMatch: RegExpExecArray | null;
  while ((sMatch = simpleFieldRegex.exec(xml)) !== null) {
    const attrs = sMatch[1];
    const body = sMatch[2];
    const instrMatch = attrs.match(/(?:w:)?instr=["']([^"']*)["']/i);
    if (instrMatch) {
      const instruction = unescapeXml(instrMatch[1]).trim();
      // Extract any <w:t> content within the simple field
      const tMatches = [...body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi)];
      const formattedText = tMatches
        .map((m) => unescapeXml(m[1]))
        .join("")
        .trim();
      fields.push({ instruction, formattedText });
    }
  }

  // Next, parse complex fields via token stream
  const tokenRegex =
    /<(?:\w+:)?fldChar\b([^>]*)\/?>|<(?:\w+:)?fldChar\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?fldChar>|<(?:\w+:)?instrText\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?instrText>|<(?:\w+:)?t\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?t>/gi;

  const stack: InternalField[] = [];
  let token: RegExpExecArray | null;

  while ((token = tokenRegex.exec(xml)) !== null) {
    const rawTag = token[0];

    if (/fldChar/i.test(rawTag)) {
      const charTypeMatch = rawTag.match(/(?:w:)?fldCharType=["']([^"']+)["']/i);
      const charType = charTypeMatch ? charTypeMatch[1].toLowerCase() : "";

      if (charType === "begin") {
        stack.push({
          instruction: "",
          formattedText: "",
          state: "instruction",
        });
      } else if (charType === "separate") {
        if (stack.length > 0) {
          stack[stack.length - 1].state = "result";
        }
      } else if (charType === "end") {
        const completed = stack.pop();
        if (completed) {
          fields.push({
            instruction: completed.instruction.trim(),
            formattedText: completed.formattedText.trim(),
          });
        }
      }
    } else if (/instrText/i.test(rawTag)) {
      if (stack.length > 0 && stack[stack.length - 1].state === "instruction") {
        // Token capture group 5 contains the element text content
        const content = token[5] || "";
        stack[stack.length - 1].instruction += unescapeXml(content);
      }
    } else if (/<(?:\w+:)?t\b/i.test(rawTag)) {
      if (stack.length > 0 && stack[stack.length - 1].state === "result") {
        // Token capture group 7 contains the text content
        const content = token[7] || "";
        stack[stack.length - 1].formattedText += unescapeXml(content);
      }
    }
  }

  return fields;
}

/**
 * Scans a .docx archive for Zotero ADDIN fields (CSL_CITATION and ZOTERO_BIBL)
 * and returns parsed citation JSON payloads.
 *
 * Fully offline, never performs network calls.
 */
export async function importDocxZoteroFields(
  buffer: Buffer | Uint8Array | ArrayBuffer,
): Promise<ExtractedZoteroFieldsResult> {
  const zip = await JSZip.loadAsync(buffer);
  const citations: ZoteroCitationPayload[] = [];
  const fields: ExtractedZoteroField[] = [];
  let bibliographyField: ExtractedZoteroField | undefined;

  // Identify all XML files that could contain fields
  const xmlFilePaths: string[] = [];
  zip.forEach((relativePath) => {
    if (/^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/i.test(relativePath)) {
      xmlFilePaths.push(relativePath);
    }
  });

  // Ensure document.xml is processed first
  xmlFilePaths.sort((a, b) => {
    if (a === "word/document.xml") return -1;
    if (b === "word/document.xml") return 1;
    return a.localeCompare(b);
  });

  for (const path of xmlFilePaths) {
    const file = zip.file(path);
    if (!file) continue;

    const xml = await file.async("text");
    const extractedFields = parseFieldsFromXml(xml);

    for (const f of extractedFields) {
      const rawInstr = f.instruction;

      // Check Zotero Citation: ADDIN ZOTERO_ITEM CSL_CITATION <payload>
      const citMatch = rawInstr.match(/ADDIN\s+ZOTERO_ITEM\s+CSL_CITATION\s+([\s\S]+)/);
      if (citMatch) {
        const jsonStr = citMatch[1].trim();
        try {
          const payload = JSON.parse(jsonStr) as ZoteroCitationPayload;
          // Ensure properties has formattedCitation fallback if missing
          if (!payload.properties) {
            payload.properties = { formattedCitation: f.formattedText || "" };
          } else if (!payload.properties.formattedCitation && f.formattedText) {
            payload.properties.formattedCitation = f.formattedText;
          }

          citations.push(payload);
          fields.push({
            fieldType: "citation",
            rawInstruction: rawInstr,
            citation: payload,
            formattedText: f.formattedText,
          });
          continue;
        } catch {
          // If JSON parse fails, register as unknown field
          fields.push({
            fieldType: "unknown",
            rawInstruction: rawInstr,
            formattedText: f.formattedText,
          });
          continue;
        }
      }

      // Check Zotero Bibliography: ADDIN ZOTERO_BIBL <payload> CSL_BIBLIOGRAPHY
      const bibMatch = rawInstr.match(
        /ADDIN\s+ZOTERO_BIBL(?:\s+([\s\S]+?))?(?:\s+CSL_BIBLIOGRAPHY)?$/,
      );
      if (bibMatch && rawInstr.includes("ZOTERO_BIBL")) {
        let bibJson: Record<string, unknown> | undefined;
        if (bibMatch[1]) {
          try {
            bibJson = JSON.parse(bibMatch[1].trim());
          } catch {
            // Optional custom payload
          }
        }
        const bField: ExtractedZoteroField = {
          fieldType: "bibliography",
          rawInstruction: rawInstr,
          bibliography: bibJson,
          formattedText: f.formattedText,
        };
        fields.push(bField);
        if (!bibliographyField) {
          bibliographyField = bField;
        }
        continue;
      }

      // Non-Zotero field
      if (rawInstr.length > 0) {
        fields.push({
          fieldType: "unknown",
          rawInstruction: rawInstr,
          formattedText: f.formattedText,
        });
      }
    }
  }

  // Create dual-interface result: iterable array of citations + object properties
  const result = Object.assign([...citations], {
    citations,
    fields,
    bibliography: bibliographyField,
  }) as ExtractedZoteroFieldsResult;

  return result;
}
