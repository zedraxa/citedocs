import JSZip from "jszip";

export const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MIME_ODT = "application/vnd.oasis.opendocument.text";
export const MIME_PDF = "application/pdf";

export const SUPPORTED_EXTENSIONS = [".docx", ".odt", ".pdf"] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export const MIME_BY_EXT: Record<string, string> = {
  ".docx": MIME_DOCX,
  ".odt": MIME_ODT,
  ".pdf": MIME_PDF,
};

export const EXT_BY_MIME: Record<string, string> = {
  [MIME_DOCX]: ".docx",
  [MIME_ODT]: ".odt",
  [MIME_PDF]: ".pdf",
  "application/x-pdf": ".pdf",
};

export const DEFAULT_ZOTERO_PREF_XML =
  '<data data-version="3" zotero-version="7.0">' +
  '<style id="http://www.zotero.org/styles/apa" locale="tr-TR" hasBibliography="0" bibliographyStyleHasBeenSet="0"/>' +
  '<prefs><pref name="fieldType" value="Field"/></prefs>' +
  '</data>';

export function buildZoteroCustomPropsXml(prefXml: string = DEFAULT_ZOTERO_PREF_XML): string {
  const CHUNK_SIZE = 255;
  const properties: string[] = [];
  const count = Math.max(1, Math.ceil(prefXml.length / CHUNK_SIZE));
  for (let i = 0; i < count; i++) {
    const chunk = prefXml.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const encoded = chunk
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
    properties.push(
      `  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="ZOTERO_PREF_${i + 1}">\n    <vt:lpwstr>${encoded}</vt:lpwstr>\n  </property>`
    );
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">\n${properties.join("\n")}\n</Properties>`;
}

/**
 * Creates a minimal valid blank Microsoft Word (.docx) document.
 */
export async function createBlankDocxBuffer(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>
</Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>
</Relationships>`
  );

  zip.file("docProps/custom.xml", buildZoteroCustomPropsXml());

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:rPr>
          <w:lang w:val="tr-TR" w:eastAsia="tr-TR" w:bidi="tr-TR"/>
        </w:rPr>
      </w:pPr>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`
  );

  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:lang w:val="tr-TR" w:eastAsia="tr-TR" w:bidi="tr-TR"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr/></w:pPrDefault>
  </w:docDefaults>
</w:styles>`
  );

  zip.file(
    "word/settings.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:themeFontLang w:val="tr-TR" w:eastAsia="tr-TR" w:bidi="tr-TR"/>
</w:settings>`
  );

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`
  );

  const arrayBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(arrayBuffer);
}

/**
 * Creates a minimal valid blank LibreOffice / OpenDocument Text (.odt) document.
 */
export async function createBlankOdtBuffer(): Promise<Buffer> {
  const zip = new JSZip();

  // The mimetype file must be the first file and uncompressed (STORE)
  zip.file("mimetype", MIME_ODT, { compression: "STORE" });

  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${MIME_ODT}"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`
  );

  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.3">
  <office:body>
    <office:text>
      <text:p/>
    </office:text>
  </office:body>
</office:document-content>`
  );

  const arrayBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(arrayBuffer);
}

/**
 * Resolves MIME type from filename or format.
 */
export function resolveMimeType(filenameOrFormat: string): string {
  const lower = filenameOrFormat.toLowerCase().trim();
  if (lower === "docx" || lower.endsWith(".docx")) return MIME_DOCX;
  if (lower === "odt" || lower.endsWith(".odt")) return MIME_ODT;
  if (lower === "pdf" || lower.endsWith(".pdf")) return MIME_PDF;
  return MIME_BY_EXT[lower] || "application/octet-stream";
}

/**
 * Resolves standard file extension (.docx, .odt, .pdf) from MIME type or format.
 */
export function resolveExtension(mimeOrFormat: string): string {
  const lower = mimeOrFormat.toLowerCase().trim();
  if (lower === "docx" || lower === MIME_DOCX) return ".docx";
  if (lower === "odt" || lower === MIME_ODT) return ".odt";
  if (lower === "pdf" || lower === MIME_PDF || lower === "application/x-pdf") return ".pdf";
  return EXT_BY_MIME[lower] || ".docx";
}
