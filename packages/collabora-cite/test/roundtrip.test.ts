import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  createZoteroCitationPayload,
  createLibreOfficeCitationMarkName,
  createLibreOfficeBibliographyMarkName,
  createLibreOfficeDocumentPrefsMarkName,
  createWordCitationFieldCode,
  createWordBibliographyFieldCode,
  createWordDocumentPrefsFieldCode,
} from "../src/fields.js";
import { parseDocumentFields, parseFieldCode } from "../src/parser.js";
import {
  FIXTURE_ITEM_LIBBY,
  FIXTURE_ITEM_KAHNEMAN,
  FIXTURE_ZOTERO_CITATION_PAYLOAD_APA,
  FIXTURE_ZOTERO_CITATION_PAYLOAD_LOCATOR,
  FIXTURE_LIBREOFFICE_CITATION_RAW,
  FIXTURE_LIBREOFFICE_BIBLIOGRAPHY_RAW,
  FIXTURE_LIBREOFFICE_PREFS_RAW,
  FIXTURE_WORD_CITATION_RAW,
  FIXTURE_WORD_BIBLIOGRAPHY_RAW,
  FIXTURE_WORD_PREFS_RAW,
  FIXTURE_DOCUMENT_PREFS,
} from "./fixtures.js";

describe("Field Codes Round-Trip & Desktop Zotero Compatibility", () => {
  it("generates an OpenDocument (.odt) structure with Zotero ReferenceMarks and round-trips all fields", async () => {
    // 1. Construct citation payloads matching desktop Zotero
    const cit1Payload = createZoteroCitationPayload({
      citationID: "cit101",
      items: [
        {
          id: "101",
          itemData: FIXTURE_ITEM_LIBBY,
          locator: "525",
          label: "page",
          prefix: "see ",
          suffix: ", for overview",
        },
      ],
      formattedCitation: "(see Libby, 2021, p. 525, for overview)",
    });

    const cit2Payload = createZoteroCitationPayload({
      citationID: "cit102",
      items: [
        {
          id: "102",
          itemData: FIXTURE_ITEM_KAHNEMAN,
          suppressAuthor: true,
        },
      ],
      formattedCitation: "(2011)",
    });

    const markName1 = createLibreOfficeCitationMarkName(cit1Payload, "RND_ODT_1");
    const markName2 = createLibreOfficeCitationMarkName(cit2Payload, "RND_ODT_2");
    const biblMarkName = createLibreOfficeBibliographyMarkName(undefined, "RND_ODT_BIB");
    const prefMarkName = createLibreOfficeDocumentPrefsMarkName(FIXTURE_DOCUMENT_PREFS, "RND_ODT_PREF");

    // 2. Build a valid OpenDocument Text content.xml
    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body>
    <office:text>
      <text:p>Document configuration: <text:reference-mark text:name="${prefMarkName.replace(/"/g, "&quot;")}"/></text:p>
      <text:p>According to research <text:reference-mark-start text:name="${markName1.replace(/"/g, "&quot;")}"/>(see Libby, 2021, p. 525, for overview)<text:reference-mark-end text:name="${markName1.replace(/"/g, "&quot;")}"/> and behavioral economics <text:reference-mark-start text:name="${markName2.replace(/"/g, "&quot;")}"/>(2011)<text:reference-mark-end text:name="${markName2.replace(/"/g, "&quot;")}"/>.</text:p>
      <text:p>Bibliography:</text:p>
      <text:p><text:bookmark-start text:name="${biblMarkName.replace(/"/g, "&quot;")}"/>Libby, P. (2021). The changing landscape...<text:bookmark-end text:name="${biblMarkName.replace(/"/g, "&quot;")}"/></text:p>
    </office:text>
  </office:body>
</office:document-content>`;

    // 3. Package as .odt archive
    const zip = new JSZip();
    zip.file("mimetype", "application/vnd.oasis.opendocument.text");
    zip.file("content.xml", contentXml);

    const odtBuffer = await zip.generateAsync({ type: "nodebuffer" });
    expect(odtBuffer.length).toBeGreaterThan(0);

    // 4. Re-parse from .odt archive
    const unzipped = await JSZip.loadAsync(odtBuffer);
    const extractedXml = await unzipped.file("content.xml")!.async("string");

    // Extract reference marks and bookmarks from XML
    const markRegex = /text:(?:reference-mark-start|reference-mark|bookmark-start)\s+text:name="([^"]+)"/g;
    const extractedNames: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = markRegex.exec(extractedXml)) !== null) {
      extractedNames.push(match[1]);
    }

    expect(extractedNames).toHaveLength(4);

    // 5. Parse using collabora-cite parser
    const parsedFields = parseDocumentFields(extractedNames);

    // Assert Pref field
    const prefField = parsedFields.find((f) => f.type === "pref");
    expect(prefField).toBeDefined();
    expect(prefField?.format).toBe("libreoffice");
    expect(prefField?.prefs?.style).toBe("apa");
    expect(prefField?.prefs?.locale).toBe("en-US");

    // Assert Citations
    const citFields = parsedFields.filter((f) => f.type === "citation");
    expect(citFields).toHaveLength(2);

    expect(citFields[0].format).toBe("libreoffice");
    expect(citFields[0].citation?.citationID).toBe("cit101");
    expect(citFields[0].citation?.citationItems[0].id).toBe("101");
    expect(citFields[0].citation?.citationItems[0].locator).toBe("525");
    expect(citFields[0].citation?.citationItems[0].label).toBe("page");
    expect(citFields[0].citation?.citationItems[0].prefix).toBe("see ");
    expect(citFields[0].citation?.citationItems[0].suffix).toBe(", for overview");
    expect(citFields[0].citation?.citationItems[0].itemData).toEqual(FIXTURE_ITEM_LIBBY);

    expect(citFields[1].format).toBe("libreoffice");
    expect(citFields[1].citation?.citationID).toBe("cit102");
    expect(citFields[1].citation?.citationItems[0].id).toBe("102");
    expect(citFields[1].citation?.citationItems[0].suppressAuthor).toBe(true);

    // Assert Bibliography
    const bibField = parsedFields.find((f) => f.type === "bibliography");
    expect(bibField).toBeDefined();
    expect(bibField?.format).toBe("libreoffice");
    expect(bibField?.bibliography?.uncited).toEqual([]);
  });

  it("generates a Word (.docx) structure with ADDIN ZOTERO_ITEM fields and round-trips all fields", async () => {
    // 1. Construct Word instruction field codes
    const wordCit = createWordCitationFieldCode(FIXTURE_ZOTERO_CITATION_PAYLOAD_LOCATOR);
    const wordBib = createWordBibliographyFieldCode();
    const wordPref = createWordDocumentPrefsFieldCode(FIXTURE_DOCUMENT_PREFS);

    // 2. Build WordprocessingML document.xml
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> ${wordCit.replace(/"/g, "&quot;")} </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>(Libby, 2021, p. 525)</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
    </w:p>
    <w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> ${wordBib.replace(/"/g, "&quot;")} </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>Bibliography Text</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
    </w:p>
    <w:p>
      <w:r><w:instrText xml:space="preserve"> ${wordPref.replace(/"/g, "&quot;")} </w:instrText></w:r>
    </w:p>
  </w:body>
</w:document>`;

    const zip = new JSZip();
    zip.file("word/document.xml", docXml);
    const docxBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // 3. Re-parse from docx
    const unzipped = await JSZip.loadAsync(docxBuffer);
    const extractedXml = await unzipped.file("word/document.xml")!.async("string");

    const instrRegex = /<w:instrText[^>]*>\s*([\s\S]*?)\s*<\/w:instrText>/g;
    const instructions: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = instrRegex.exec(extractedXml)) !== null) {
      instructions.push(m[1].trim());
    }

    expect(instructions).toHaveLength(3);

    // 4. Parse using parser.ts
    const parsedWordFields = parseDocumentFields(instructions);

    expect(parsedWordFields[0].type).toBe("citation");
    expect(parsedWordFields[0].format).toBe("word");
    expect(parsedWordFields[0].citation?.citationID).toBe("locCit12");
    expect(parsedWordFields[0].citation?.citationItems[0].locator).toBe("525");
    expect(parsedWordFields[0].citation?.citationItems[0].label).toBe("page");

    expect(parsedWordFields[1].type).toBe("bibliography");
    expect(parsedWordFields[1].format).toBe("word");

    expect(parsedWordFields[2].type).toBe("pref");
    expect(parsedWordFields[2].format).toBe("word");
    expect(parsedWordFields[2].prefs?.style).toBe("apa");
  });

  it("matches real Zotero LibreOffice and Word captured fixtures identically", () => {
    // LibreOffice Citation
    const parsedLoCit = parseFieldCode(FIXTURE_LIBREOFFICE_CITATION_RAW);
    expect(parsedLoCit.type).toBe("citation");
    expect(parsedLoCit.format).toBe("libreoffice");
    expect(parsedLoCit.citation?.citationID).toBe(FIXTURE_ZOTERO_CITATION_PAYLOAD_APA.citationID);
    expect(parsedLoCit.citation?.properties.formattedCitation).toBe("(Libby, 2021)");

    // LibreOffice Bibliography
    const parsedLoBib = parseFieldCode(FIXTURE_LIBREOFFICE_BIBLIOGRAPHY_RAW);
    expect(parsedLoBib.type).toBe("bibliography");
    expect(parsedLoBib.format).toBe("libreoffice");

    // LibreOffice Prefs
    const parsedLoPref = parseFieldCode(FIXTURE_LIBREOFFICE_PREFS_RAW);
    expect(parsedLoPref.type).toBe("pref");
    expect(parsedLoPref.format).toBe("libreoffice");
    expect(parsedLoPref.prefs?.style).toBe("apa");

    // Word Citation
    const parsedWordCit = parseFieldCode(FIXTURE_WORD_CITATION_RAW);
    expect(parsedWordCit.type).toBe("citation");
    expect(parsedWordCit.format).toBe("word");
    expect(parsedWordCit.citation?.citationID).toBe(FIXTURE_ZOTERO_CITATION_PAYLOAD_APA.citationID);

    // Word Bibliography
    const parsedWordBib = parseFieldCode(FIXTURE_WORD_BIBLIOGRAPHY_RAW);
    expect(parsedWordBib.type).toBe("bibliography");
    expect(parsedWordBib.format).toBe("word");

    // Word Prefs
    const parsedWordPref = parseFieldCode(FIXTURE_WORD_PREFS_RAW);
    expect(parsedWordPref.type).toBe("pref");
    expect(parsedWordPref.format).toBe("word");
    expect(parsedWordPref.prefs?.style).toBe("apa");
  });
});
