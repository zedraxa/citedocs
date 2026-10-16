import JSZip from "jszip";

export interface ExtractedZoteroState {
  citations: Array<{ code: string; payload: unknown; result: string }>;
  bibliography: { code: string; result: string } | null;
  prefs: string | null;
  style: string | null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
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

export async function extractZoteroState(buffer: Buffer): Promise<ExtractedZoteroState> {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const fields = extractComplexFields(docXml);
  const citations = fields
    .filter((f) => /^ADDIN ZOTERO_ITEM CSL_CITATION/.test(f.code))
    .map((f) => {
      const json = f.code.replace(/^ADDIN ZOTERO_ITEM CSL_CITATION\s*/, "");
      let payload: unknown = null;
      try { payload = JSON.parse(json); } catch { /* keep null */ }
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
