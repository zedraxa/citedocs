import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { importDocxZoteroFields } from "../src/index.js";

describe("@citedocs/docx-exporter: Importer", () => {
  it("scans for Zotero ADDIN fields and extracts structured citation JSON", async () => {
    const zip = new JSZip();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Intro text </w:t></w:r>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"cit-test-1","citationItems":[{"id":"item-1","locator":"10","label":"page"}],"properties":{"formattedCitation":"(Smith, 2020, p. 10)"}} </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>(Smith, 2020, p. 10)</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
      <w:r><w:t> trailing text.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;
    zip.file("word/document.xml", xml);
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const result = await importDocxZoteroFields(buffer);

    expect(result.length).toBe(1);
    expect(result[0].citationID).toBe("cit-test-1");
    expect(result[0].citationItems[0].id).toBe("item-1");
    expect(result[0].citationItems[0].locator).toBe("10");
    expect(result[0].properties.formattedCitation).toBe("(Smith, 2020, p. 10)");

    // Dual interface check
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].citationID).toBe("cit-test-1");
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].fieldType).toBe("citation");
  });

  it("handles split w:instrText nodes across multiple runs", async () => {
    const zip = new JSZip();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_ITEM </w:instrText></w:r>
      <w:r><w:instrText xml:space="preserve">CSL_CITATION {"citationID":"cit-split","citationItems":[{"id":"split-1"}]}</w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>[1]</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
    </w:p>
  </w:body>
</w:document>`;
    zip.file("word/document.xml", xml);
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const result = await importDocxZoteroFields(buffer);

    expect(result.length).toBe(1);
    expect(result[0].citationID).toBe("cit-split");
    expect(result[0].citationItems[0].id).toBe("split-1");
  });

  it("extracts simple fields (<w:fldSimple>) correctly", async () => {
    const zip = new JSZip();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:fldSimple w:instr=" ADDIN ZOTERO_ITEM CSL_CITATION {&quot;citationID&quot;:&quot;simple-1&quot;,&quot;citationItems&quot;:[{&quot;id&quot;:&quot;s1&quot;}]} ">
        <w:r><w:t>(Simple, 2021)</w:t></w:r>
      </w:fldSimple>
    </w:p>
  </w:body>
</w:document>`;
    zip.file("word/document.xml", xml);
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const result = await importDocxZoteroFields(buffer);

    expect(result.length).toBe(1);
    expect(result[0].citationID).toBe("simple-1");
    expect(result[0].citationItems[0].id).toBe("s1");
    expect(result.fields[0].formattedText).toBe("(Simple, 2021)");
  });

  it("extracts Zotero bibliography field", async () => {
    const zip = new JSZip();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_BIBL {"custom":["opt"]} CSL_BIBLIOGRAPHY </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>Doe, J. (2023). Reference entry.</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
    </w:p>
  </w:body>
</w:document>`;
    zip.file("word/document.xml", xml);
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const result = await importDocxZoteroFields(buffer);

    expect(result.bibliography).toBeDefined();
    expect(result.bibliography!.fieldType).toBe("bibliography");
    expect(result.bibliography!.formattedText).toBe("Doe, J. (2023). Reference entry.");
    expect(result.bibliography!.bibliography).toEqual({ custom: ["opt"] });
  });

  it("returns empty result on docx with no Zotero fields", async () => {
    const zip = new JSZip();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Just plain text without citations.</w:t></w:r></w:p>
  </w:body>
</w:document>`;
    zip.file("word/document.xml", xml);
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const result = await importDocxZoteroFields(buffer);

    expect(result).toHaveLength(0);
    expect(result.citations).toHaveLength(0);
    expect(result.bibliography).toBeUndefined();
  });
});
