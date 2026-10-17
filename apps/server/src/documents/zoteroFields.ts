import JSZip from "jszip";

export interface ExtractedZoteroState {
  citations: Array<{ code: string; payload: unknown; result: string }>;
  bibliography: { code: string; result: string } | null;
  prefs: string | null;
  style: string | null;
}

export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

export function extractJsonBraceBalanced(str: string): string | null {
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

function extractAttribute(attrStr: string, attrName: string): string | null {
  const re = new RegExp(`(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
  const m = re.exec(attrStr);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : m[2];
}

function extractOdfText(xmlSnippet: string): string {
  const withSpaces = xmlSnippet
    .replace(/<text:s\b[^>]*\btext:c="(\d+)"[^>]*\/?>/g, (_, c) => " ".repeat(Number(c)))
    .replace(/<text:s\b[^>]*\/?>/g, " ")
    .replace(/<text:tab\b[^>]*\/?>/g, "\t")
    .replace(/<text:line-break\b[^>]*\/?>/g, "\n");
  const stripped = withSpaces.replace(/<[^>]+>/g, "");
  return decodeXml(stripped);
}

/** Walks w:fldChar begin/separate/end in document order and returns complex fields (code + result). */
export function extractComplexFields(documentXml: string): Array<{ code: string; result: string }> {
  const out: Array<{ code: string; result: string }> = [];
  const re = /<w:fldChar\b[^>]*w:fldCharType="(begin|separate|end)"[^>]*\/?>|<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:t\b[^>]*\/>/g;
  const stack: Array<{ code: string; result: string; phase: "code" | "result" }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(documentXml))) {
    const top = stack[stack.length - 1];
    if (m[1] === "begin") stack.push({ code: "", result: "", phase: "code" });
    else if (m[1] === "separate") { if (top) top.phase = "result"; }
    else if (m[1] === "end") { const f = stack.pop(); if (f) out.push({ code: f.code.trim(), result: f.result }); }
    else if (m[2] !== undefined) { if (top && top.phase === "code") top.code += decodeXml(m[2]); }
    else if (m[3] !== undefined) { if (top && top.phase === "result") top.result += decodeXml(m[3]); }
  }
  return out;
}

/** Walks LibreOffice ODF reference marks (range and point marks) in document order. */
export function extractOdtReferenceMarks(contentXml: string): Array<{ code: string; result: string }> {
  const out: Array<{ code: string; result: string }> = [];
  const re = /<text:reference-mark-(start|end)\b([^>]*?)(?:\/>|>(?:<\/text:reference-mark-\1>)?)|<text:reference-mark\b([^>]*?)(?:\/>|>(?:<\/text:reference-mark>)?)/g;
  const openMarks = new Map<string, number[]>();

  let m: RegExpExecArray | null;
  while ((m = re.exec(contentXml))) {
    if (m[1] === "start") {
      const rawName = extractAttribute(m[2], "text:name") ?? extractAttribute(m[2], "name");
      if (!rawName) continue;
      const name = decodeXml(rawName).trim();
      const list = openMarks.get(name) ?? [];
      list.push(re.lastIndex);
      openMarks.set(name, list);
    } else if (m[1] === "end") {
      const rawName = extractAttribute(m[2], "text:name") ?? extractAttribute(m[2], "name");
      if (!rawName) continue;
      const name = decodeXml(rawName).trim();
      const list = openMarks.get(name);
      if (list && list.length > 0) {
        const startIndex = list.pop()!;
        if (list.length === 0) openMarks.delete(name);
        const innerXml = contentXml.slice(startIndex, m.index);
        out.push({ code: name, result: extractOdfText(innerXml) });
      }
    } else {
      // Point mark: <text:reference-mark .../>
      const rawName = extractAttribute(m[3], "text:name") ?? extractAttribute(m[3], "name");
      if (!rawName) continue;
      const name = decodeXml(rawName).trim();
      out.push({ code: name, result: "" });
    }
  }

  // Any unclosed start marks (defensive fallback for malformed documents)
  for (const [name] of openMarks) {
    out.push({ code: name, result: "" });
  }

  return out;
}

async function extractDocxZoteroState(zip: JSZip): Promise<ExtractedZoteroState> {
  const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const fields = extractComplexFields(docXml);
  const citations = fields
    .filter((f) => /^ADDIN ZOTERO_ITEM CSL_CITATION/.test(f.code))
    .map((f) => {
      let payload: unknown = null;
      const jsonStr = extractJsonBraceBalanced(f.code);
      if (jsonStr) {
        try {
          payload = JSON.parse(jsonStr);
        } catch {
          /* keep null */
        }
      }
      return { code: f.code, payload, result: f.result };
    });
  const bib = fields.find((f) => /^ADDIN ZOTERO_BIBL/.test(f.code)) ?? null;
  const customXml = (await zip.file("docProps/custom.xml")?.async("string")) ?? "";
  const parts: Array<[number, string]> = [];
  const pre = /<property\b[^>]*name="ZOTERO_PREF_(\d+)"[^>]*>\s*<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pre.exec(customXml))) parts.push([Number(pm[1]), decodeXml(pm[2])]);
  parts.sort((a, b) => a[0] - b[0]);
  const prefs = parts.length ? parts.map((p) => p[1]).join("") : null;
  const sm = prefs?.match(/<style\b[^>]*\bid="([^"]+)"/);
  const style = sm ? sm[1].replace(/^https?:\/\/www\.zotero\.org\/styles\//, "") : null;
  return { citations, bibliography: bib, prefs, style };
}

async function extractOdtZoteroState(zip: JSZip): Promise<ExtractedZoteroState> {
  const contentXml = (await zip.file("content.xml")?.async("string")) ?? "";
  const fields = extractOdtReferenceMarks(contentXml);

  const citations = fields
    .filter((f) => /(?:^|\b)(?:ADDIN\s+)?ZOTERO_ITEM\s+CSL_CITATION\b/.test(f.code))
    .map((f) => {
      let payload: unknown = null;
      const jsonStr = extractJsonBraceBalanced(f.code);
      if (jsonStr) {
        try {
          payload = JSON.parse(jsonStr);
        } catch {
          /* keep null */
        }
      }
      return { code: f.code, payload, result: f.result };
    });

  const bib = fields.find((f) => /(?:^|\b)(?:ADDIN\s+)?ZOTERO_BIBL\b/.test(f.code)) ?? null;

  // Extract document preferences:
  // 1. Check meta.xml for ODF user-defined meta (ZOTERO_PREF_1.. or ZOTERO_PREF)
  const metaXml = (await zip.file("meta.xml")?.async("string")) ?? "";
  const parts: Array<[number, string]> = [];
  const pre = /<(?:meta:)?user-defined\b[^>]*(?:meta:)?name="ZOTERO_PREF_(\d+)"[^>]*>([\s\S]*?)<\/(?:meta:)?user-defined>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pre.exec(metaXml))) {
    parts.push([Number(pm[1]), decodeXml(pm[2])]);
  }
  parts.sort((a, b) => a[0] - b[0]);
  let prefs = parts.length ? parts.map((p) => p[1]).join("") : null;

  if (!prefs) {
    const singleMatch = /<(?:meta:)?user-defined\b[^>]*(?:meta:)?name="ZOTERO_PREF"[^>]*>([\s\S]*?)<\/(?:meta:)?user-defined>/.exec(metaXml);
    if (singleMatch) {
      prefs = decodeXml(singleMatch[1]);
    }
  }

  // 2. Check content.xml for user-defined meta if not found in meta.xml
  if (!prefs) {
    const contentUserMeta = /<(?:meta:)?user-defined\b[^>]*(?:meta:)?name="ZOTERO_PREF(?:_(\d+))?"[^>]*>([\s\S]*?)<\/(?:meta:)?user-defined>/g;
    const cParts: Array<[number, string]> = [];
    let cm: RegExpExecArray | null;
    while ((cm = contentUserMeta.exec(contentXml))) {
      cParts.push([Number(cm[1] || 1), decodeXml(cm[2])]);
    }
    if (cParts.length) {
      cParts.sort((a, b) => a[0] - b[0]);
      prefs = cParts.map((p) => p[1]).join("");
    }
  }

  // 3. Check for ZOTERO_PREF reference mark if still not found
  if (!prefs) {
    const prefField = fields.find((f) => /(?:^|\b)(?:ADDIN\s+)?ZOTERO_PREF\b/.test(f.code));
    if (prefField) {
      const jsonStr = extractJsonBraceBalanced(prefField.code);
      if (jsonStr) {
        prefs = jsonStr;
      } else {
        prefs = prefField.code
          .replace(/^(?:ADDIN\s+)?ZOTERO_PREF\s*/, "")
          .replace(/\s*RND[a-zA-Z0-9_-]+$/, "")
          .trim();
      }
    }
  }

  let style: string | null = null;
  if (prefs) {
    const sm = prefs.match(/<style\b[^>]*\bid="([^"]+)"/);
    if (sm) {
      style = sm[1].replace(/^https?:\/\/www\.zotero\.org\/styles\//, "");
    } else {
      const jsonMatch = prefs.match(/"style"\s*:\s*"([^"]+)"/);
      if (jsonMatch) {
        style = jsonMatch[1].replace(/^https?:\/\/www\.zotero\.org\/styles\//, "");
      }
    }
  }

  return { citations, bibliography: bib, prefs, style };
}

export async function extractZoteroState(buffer: Buffer): Promise<ExtractedZoteroState> {
  const zip = await JSZip.loadAsync(buffer);
  if (zip.file("word/document.xml")) {
    return extractDocxZoteroState(zip);
  }
  if (zip.file("content.xml")) {
    return extractOdtZoteroState(zip);
  }
  return { citations: [], bibliography: null, prefs: null, style: null };
}
