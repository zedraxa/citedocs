import JSZip from "jszip";
import { exportDocumentToDocx } from "@citedocs/docx-exporter";
import type { DocxExportInput } from "@citedocs/docx-exporter";

export interface ZoteroFixtureOptions {
  citationId?: string;
  itemId?: string;
  authorFamily?: string;
  authorGiven?: string;
  year?: number;
  title?: string;
  formattedCitation?: string;
  styleId?: string | null;
  rndSuffix?: string;
}

/**
 * Builds a genuine Microsoft Word (.docx) file containing Zotero Word plugin field codes:
 * - ADDIN ZOTERO_ITEM CSL_CITATION complex field in word/document.xml
 * - ADDIN ZOTERO_BIBL CSL_BIBLIOGRAPHY complex field in word/document.xml
 * - ZOTERO_PREF_1 custom property in docProps/custom.xml
 */
export async function createZoteroWordDocxBuffer(
  options: ZoteroFixtureOptions = {},
): Promise<Buffer> {
  const citationId = options.citationId || "cit-sample-word-1";
  const itemId = options.itemId || "item-sample-1";
  const authorFamily = options.authorFamily || "Yilmaz";
  const authorGiven = options.authorGiven || "Ahmet";
  const year = options.year || 2024;
  const title = options.title || "Yapay Zeka ve Akademik Yazim";
  const formattedCitation = options.formattedCitation || `(${authorFamily}, ${year})`;
  const styleId = options.styleId || "apa";

  const exportInput: DocxExportInput = {
    title: "Akademik Arastirma Raporu",
    paragraphs: [
      {
        children: [
          "Bu arastirma kapsaminda yapilan incelemeler ",
          {
            type: "citation",
            citationId,
            items: [
              {
                id: itemId,
                locator: "42-45",
                label: "page",
                uris: [`http://zotero.org/users/local/items/${itemId}`],
                itemData: {
                  id: itemId,
                  type: "article-journal",
                  title,
                  author: [{ family: authorFamily, given: authorGiven }],
                  issued: { "date-parts": [[year]] },
                  "container-title": "Turk Bilgisayar ve Matematik Egitimi Dergisi",
                  volume: 15,
                  issue: 2,
                  page: "40-55",
                },
              },
            ],
            formattedText: formattedCitation,
          },
          " dogrultusunda gerceklestirilmistir.",
        ],
      },
    ],
    bibliography: {
      heading: "Kaynakca",
      asField: true,
      entries: [
        `${authorFamily}, ${authorGiven[0]}. (${year}). ${title}. <i>Turk Bilgisayar ve Matematik Egitimi Dergisi</i>, 15(2), 40–55.`,
      ],
    },
  };

  const rawDocx = await exportDocumentToDocx(exportInput);

  // Add docProps/custom.xml with ZOTERO_PREF_1
  const zip = await JSZip.loadAsync(rawDocx);

  const zoteroPrefXml = `<data data-version="3"><style id="https://www.zotero.org/styles/${styleId}" hasBibliography="1"/><prefs/></data>`;
  const encodedPref = zoteroPrefXml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  const customXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="ZOTERO_PREF_1">
    <vt:lpwstr>${encodedPref}</vt:lpwstr>
  </property>
</Properties>`;

  zip.file("docProps/custom.xml", customXml);

  // Update [Content_Types].xml to include custom-properties
  const contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");
  if (contentTypesXml && !contentTypesXml.includes("custom-properties")) {
    const updatedContentTypes = contentTypesXml.replace(
      "</Types>",
      '  <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>\n</Types>',
    );
    zip.file("[Content_Types].xml", updatedContentTypes);
  }

  // Update _rels/.rels to link custom.xml
  const relsXml = await zip.file("_rels/.rels")?.async("string");
  if (relsXml && !relsXml.includes("custom-properties")) {
    const updatedRels = relsXml.replace(
      "</Relationships>",
      '  <Relationship Id="rIdCustomProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>\n</Relationships>',
    );
    zip.file("_rels/.rels", updatedRels);
  }

  const generated = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(generated);
}

/**
 * Builds a genuine LibreOffice / OpenDocument Text (.odt) file containing Zotero LibreOffice plugin reference marks:
 * - text:reference-mark-start / text:reference-mark-end in content.xml
 */
export async function createZoteroLibreOfficeOdtBuffer(
  options: ZoteroFixtureOptions = {},
): Promise<Buffer> {
  const citationId = options.citationId || "cit-odt-libreoffice-1";
  const itemId = options.itemId || "item-odt-1";
  const authorFamily = options.authorFamily || "Demir";
  const authorGiven = options.authorGiven || "Fatma";
  const year = options.year || 2023;
  const title = options.title || "LibreOffice ve ODF Standartlari";
  const formattedCitation = options.formattedCitation || `(${authorFamily}, ${year})`;

  const citPayload = JSON.stringify({
    citationID: citationId,
    citationItems: [
      {
        id: itemId,
        locator: "12-14",
        label: "page",
        uris: [`http://zotero.org/users/local/items/${itemId}`],
        itemData: {
          id: itemId,
          type: "book",
          title,
          author: [{ family: authorFamily, given: authorGiven }],
          issued: { "date-parts": [[year]] },
          publisher: "Akademik Yayinlar",
        },
      },
    ],
    properties: {
      formattedCitation,
      plainCitation: formattedCitation,
      dontUpdate: false,
      noteIndex: 0,
    },
    schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json",
  });

  const rnd = options.rndSuffix ? ` RND${options.rndSuffix}` : "";
  const citRefName = `ZOTERO_ITEM CSL_CITATION ${citPayload}${rnd}`.replace(/"/g, "&quot;");
  const bibRefName = `ZOTERO_BIBL {"custom":[]} CSL_BIBLIOGRAPHY${rnd}`.replace(/"/g, "&quot;");

  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });

  const manifestEntries = [
    '  <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>',
    '  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
  ];

  const styleId = options.styleId !== undefined ? options.styleId : "apa";
  if (styleId) {
    const zoteroPrefXml = `<data data-version="3"><style id="https://www.zotero.org/styles/${styleId}" hasBibliography="1"/><prefs/></data>`;
    const encodedPref = zoteroPrefXml
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    zip.file(
      "meta.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  office:version="1.3">
  <office:meta>
    <meta:user-defined meta:name="ZOTERO_PREF_1">${encodedPref}</meta:user-defined>
  </office:meta>
</office:document-meta>`,
    );

    manifestEntries.push('  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>');
  }

  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
${manifestEntries.join("\n")}
</manifest:manifest>`,
  );

  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.3">
  <office:body>
    <office:text>
      <text:p>Bu metin LibreOffice Zotero eklentisiyle olusturulmustur: <text:reference-mark-start text:name="${citRefName}"/>${formattedCitation}<text:reference-mark-end text:name="${citRefName}"/> ve devam ediyor.</text:p>
      <text:h text:outline-level="1">Kaynakca</text:h>
      <text:p><text:reference-mark-start text:name="${bibRefName}"/>${authorFamily}, ${authorGiven[0]}. (${year}). ${title}. Akademik Yayinlar.<text:reference-mark-end text:name="${bibRefName}"/></text:p>
    </office:text>
  </office:body>
</office:document-content>`,
  );

  const generated = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(generated);
}
