# @citedocs/collabora-cite

High-performance citation insertion, bibliography generation, and Zotero field code synchronization engine for **Collabora Online (CODE)** embedded via WOPI iframe and PostMessage.

## Features

1. **CSL Processor (citeproc-js):** Bundles official CSL styles (`apa`, `chicago-author-date`, `ieee`) and locale (`en-US`) for 100% offline, zero-network bibliographic formatting.
2. **Native Zotero Field Codes:**
   - Word format: `ADDIN ZOTERO_ITEM CSL_CITATION {json}` and `ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY`
   - LibreOffice Writer format: `ZOTERO_ITEM CSL_CITATION {json} RND<suffix>` ReferenceMarks and `ZOTERO_BIBL` Bookmarks
   - Document Preferences: `ZOTERO_PREF {json} RND<suffix>`
   - Schema compliant with `https://github.com/citation-style-language/schema/raw/master/csl-citation.json`
3. **Round-Trip Document Field Parsing:** Scans existing document field strings or ReferenceMarks back into typed payloads with full embedded CSL metadata (`itemData`).
4. **Style Switching & Document Refresh:** Instant batch re-rendering of all document citations (e.g. APA author-date `(Libby, 2021)` $\to$ IEEE numeric `[1]`) and updated bibliography generation.
5. **Collabora Online PostMessage Bridge:** Generates standard `CallPythonScript` and `Send_UNO_Command` payloads to interact directly with the Collabora Online editor canvas.

## Usage Example

```typescript
import {
  createZoteroCitationPayload,
  createLibreOfficeCitationMarkName,
  refreshDocument,
  CollaboraBridge,
} from "@citedocs/collabora-cite";

// 1. Create citation payload
const payload = createZoteroCitationPayload({
  citationID: "cit-1",
  items: [
    {
      id: "101",
      itemData: {
        id: "101",
        type: "article-journal",
        title: "The changing landscape of atherosclerosis",
        author: [{ family: "Libby", given: "Peter" }],
        issued: { "date-parts": [[2021]] },
      },
    },
  ],
  formattedCitation: "(Libby, 2021)",
});

// 2. Insert into Collabora iframe via PostMessage
const bridge = new CollaboraBridge(iframe.contentWindow, "https://collabora.example.com");
bridge.insertCitation(payload, "(Libby, 2021)");

// 3. Switch style to IEEE
const refreshed = refreshDocument([fieldCode], { styleId: "ieee" });
console.log(refreshed.citations[0].plainText); // "[1]"
```
