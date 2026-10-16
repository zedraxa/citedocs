# @citedocs/docx-exporter

Microsoft Word (.docx) exporter and field scanner for **CiteDocs**, featuring native **Zotero** field code interoperability (`ADDIN ZOTERO_ITEM CSL_CITATION` and `ADDIN ZOTERO_BIBL CSL_BIBLIOGRAPHY`).

---

## 1. Overview

Scholarly collaboration requires seamless document exchange between web platforms and traditional word processors like Microsoft Word or LibreOffice. When researchers export documents from CiteDocs into `.docx`, `@citedocs/docx-exporter` serializes reference citations as genuine OpenXML WordprocessingML complex fields matching Zotero's desktop integration.

When colleagues open an exported document in Microsoft Word with the official Zotero extension installed:

- Citations are recognized as active reference fields.
- Clicking **Refresh** or **Add/Edit Citation** updates citations and bibliography without conversion artifacts.
- Embedded `itemData` allows documents to be shared portably even if recipients do not have the original Zotero database installed.

---

## 2. Word OpenXML Field Code Architecture

### 2.1 In-Text Citation Field (`ADDIN ZOTERO_ITEM`)

In WordprocessingML (`word/document.xml`), a Zotero citation is structured as a Word complex field (`fldChar` sequence):

```xml
<w:p>
  <w:r><w:t xml:space="preserve">As established in prior literature </w:t></w:r>
  <!-- 1. Field Begin -->
  <w:r>
    <w:fldChar w:fldCharType="begin"/>
  </w:r>
  <!-- 2. Instruction Text with CSL_CITATION Payload -->
  <w:r>
    <w:instrText xml:space="preserve"> ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"cit-1","citationItems":[{"id":"item-1","locator":"42","label":"page","suppress-author":false,"uris":["http://zotero.org/users/local/items/item-1"],"itemData":{"id":"item-1","type":"book","title":"The Structure of Scientific Revolutions","author":[{"family":"Kuhn","given":"Thomas S."}],"issued":{"date-parts":[[1962]]}}}],"properties":{"formattedCitation":"(Kuhn, 1962, p. 42)","plainCitation":"(Kuhn, 1962, p. 42)","dontUpdate":false,"noteIndex":0},"schema":"https://github.com/citation-style-language/schema/raw/master/csl-citation.json"} </w:instrText>
  </w:r>
  <!-- 3. Field Separator -->
  <w:r>
    <w:fldChar w:fldCharType="separate"/>
  </w:r>
  <!-- 4. Cached Visual Representation -->
  <w:r>
    <w:t xml:space="preserve">(Kuhn, 1962, p. 42)</w:t>
  </w:r>
  <!-- 5. Field End -->
  <w:r>
    <w:fldChar w:fldCharType="end"/>
  </w:r>
  <w:r><w:t xml:space="preserve">, paradigm shifts define scientific progress.</w:t></w:r>
</w:p>
```

#### JSON Payload Format (`CSL_CITATION`):

| Property                          | Type                        | Description                                                                        |
| :-------------------------------- | :-------------------------- | :--------------------------------------------------------------------------------- |
| `citationID`                      | `string`                    | Unique identifier for the citation cluster (e.g., `cit_alpha_1`).                  |
| `citationItems`                   | `Array<ZoteroCitationItem>` | Referenced bibliographic items with locators and embedded CSL-JSON.                |
| `citationItems[].id`              | `string \| number`          | Item identifier.                                                                   |
| `citationItems[].locator`         | `string?`                   | Page or section number (e.g., `"42"` or `"12-15"`).                                |
| `citationItems[].label`           | `string?`                   | Locator type: `"page"`, `"chapter"`, `"figure"`, `"section"`, etc.                 |
| `citationItems[].prefix`          | `string?`                   | Text preceding item (e.g., `"see also "`).                                         |
| `citationItems[].suffix`          | `string?`                   | Text following item (e.g., `" for details"`).                                      |
| `citationItems[].suppress-author` | `boolean?`                  | If `true`, suppresses author name for narrative citations (e.g. `"Smith (2020)"`). |
| `citationItems[].uris`            | `string[]?`                 | Zotero API URIs linking to user/group library records.                             |
| `citationItems[].itemData`        | `CSLItem?`                  | Complete CSL-JSON record (authors, title, year, venue, DOI, etc.).                 |
| `properties.formattedCitation`    | `string`                    | Formatted citation text string (e.g., `"(Doe, 2023, p. 42)"`).                     |
| `properties.plainCitation`        | `string`                    | Plain text equivalent.                                                             |
| `properties.dontUpdate`           | `boolean`                   | Flag indicating whether Zotero should automatically update this field.             |
| `properties.noteIndex`            | `number`                    | Note index for note-based styles (Chicago Notes, OSCOLA).                          |
| `schema`                          | `string`                    | CSL citation schema URL.                                                           |

---

### 2.2 Bibliography Field (`ADDIN ZOTERO_BIBL`)

A live Zotero bibliography in Word is enclosed within a complex field spanning one or more paragraphs:

```xml
<w:p>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_BIBL {"custom":[]} CSL_BIBLIOGRAPHY </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r>
  <w:r><w:t xml:space="preserve">Kuhn, T. S. (1962). The Structure of Scientific Revolutions. University of Chicago Press.</w:t></w:r>
</w:p>
<w:p>
  <w:r><w:t xml:space="preserve">Shannon, C. E. (1948). A Mathematical Theory of Communication. Bell System Technical Journal, 27, 379–423.</w:t></w:r>
  <w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p>
```

#### Bibliography Fallback Option:

When `bibliography.asField === false`, the exporter skips emitting the Word field codes and instead outputs clean, formatted paragraph blocks with hanging indents under the bibliography heading. This is ideal for finalized submissions requiring plain static text.

---

## 3. Installation & Workspace Setup

Within the CiteDocs monorepo:

```json
{
  "dependencies": {
    "@citedocs/docx-exporter": "workspace:*"
  }
}
```

External dependencies:

- `docx`: High-performance declarative OpenXML Word document generator.
- `jszip`: Fast archive decompression and XML manipulation.

---

## 4. API Reference

### 4.1 `exportDocumentToDocx(input: DocxExportInput): Promise<Buffer>`

Converts a simplified document model into a valid `.docx` binary buffer.

```typescript
import { exportDocumentToDocx } from "@citedocs/docx-exporter";

const docxBuffer = await exportDocumentToDocx({
  title: "My Research Paper",
  paragraphs: [
    {
      type: "heading",
      level: 1,
      children: ["1. Introduction"],
    },
    {
      children: [
        "Recent experiments in quantum computing (",
        {
          type: "citation",
          citationId: "cit-1",
          items: [
            {
              id: "item-101",
              locator: "42",
              label: "page",
              itemData: {
                id: "item-101",
                type: "article-journal",
                title: "Quantum Supremacy using a Programmable Superconducting Processor",
                author: [{ family: "Arute", given: "Frank" }],
                issued: { "date-parts": [[2019]] },
                "container-title": "Nature",
              },
            },
          ],
          formattedText: "(Arute et al., 2019, p. 42)",
        },
        ") demonstrated remarkable computational advantages.",
      ],
    },
  ],
  bibliography: {
    heading: "References",
    asField: true,
    entries: [
      "Arute, F., et al. (2019). Quantum Supremacy using a Programmable Superconducting Processor. <i>Nature</i>, 574, 505–510.",
    ],
  },
});

// Save or send buffer:
// fs.writeFileSync("paper.docx", docxBuffer);
```

### 4.2 `importDocxZoteroFields(buffer): Promise<ExtractedZoteroFieldsResult>`

Scans a `.docx` buffer, parses Word complex and simple fields across `word/document.xml`, `footnotes.xml`, and `endnotes.xml`, and returns extracted Zotero citation JSON payloads.

```typescript
import { importDocxZoteroFields } from "@citedocs/docx-exporter";

const result = await importDocxZoteroFields(docxBuffer);

console.log(`Found ${result.length} citations.`);
for (const citation of result) {
  console.log(`Citation ID: ${citation.citationID}`);
  console.log(`Formatted text: ${citation.properties.formattedCitation}`);
  for (const item of citation.citationItems) {
    console.log(`  Item ID: ${item.id}, Locator: ${item.locator}`);
  }
}

if (result.bibliography) {
  console.log("Bibliography field detected:", result.bibliography.formattedText);
}
```

The returned `ExtractedZoteroFieldsResult` provides a dual interface:

- **Array interface:** Directly iterable (`result[0]`, `result.length`, `for (const c of result)`).
- **Property interface:** `result.citations`, `result.fields`, `result.bibliography`.

---

## 5. Offline and Privacy Guarantees

- **Zero Network Calls:** `@citedocs/docx-exporter` is 100% self-contained. It never attempts to fetch metadata, styles, or telemetry from external APIs.
- **Client & Server Compatible:** Operates identically in Node.js Fastify environments and client-side browser/PWA runtimes.
