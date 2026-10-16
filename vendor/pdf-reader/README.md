# Zotero PDF Reader (`zotero/reader` / `zotero/pdf-reader`) Integration in CiteDocs

> **Upstream Repository:** [https://github.com/zotero/reader](https://github.com/zotero/reader) (formerly `zotero/pdf-reader`)  
> **License:** GNU Affero General Public License v3.0 (AGPL-3.0)  
> **Target Delivery Path:** `apps/web/public/zotero-pdf-reader/`  
> **Host Component:** `<PdfReaderFrame />` & `<PdfReaderPanel />` (`apps/web/src/pdf/`)

---

## 1. Architectural Strategy & Rationale

In accordance with CiteDocs Core Principle (ADR-001): **Do not reimplement Zotero or a word processor.**

The official `zotero/reader` is Zotero's flagship multi-format reader and annotator (supporting PDF, EPUB, and snapshot HTML documents):
- Built on a customized, high-performance fork of Mozilla `pdf.js`.
- Provides full support for highlight, underline, page-anchored note, and rectangular image area annotations.
- Full color palette support (yellow `#ffd400`, red `#ff6666`, green `#5fb236`, blue `#2ea8e5`, purple `#a28ae5`).
- Strictly aligns with Zotero Web API v3 annotation schema (`annotationType`, `annotationText`, `annotationComment`, `annotationColor`, `annotationPosition`, `annotationSortIndex`).

### Why Iframe & Served Bundle Embedding?

1. **Clean AGPL-3.0 Architectural Boundary:**  
   Embedding the reader inside an `<iframe>` ensures clear modular separation between the reader engine and CiteDocs application shell.
2. **CSS and PDF.js DOM Isolation:**  
   PDF.js creates complex text layers, canvas viewports, and custom styling that must not leak into or conflict with CiteDocs or Collabora Online styling.
3. **No Multi-Megabyte Binaries in Git:**  
   Vendoring is reproducible via `tools/scripts/fetch-pdf-reader.sh` and backed by a lightweight offline placeholder during development and CI.

---

## 2. Vendoring & Build Pipeline

To build or refresh the official bundle from upstream:

```bash
# Run vendoring script from repository root
./tools/scripts/fetch-pdf-reader.sh
```

### Steps Performed by Script:
1. Clones `https://github.com/zotero/reader.git` recursively (`--recursive` to pull `pdfjs` and `epubjs` submodules).
2. Installs upstream dependencies using legacy OpenSSL provider: `NODE_OPTIONS=--openssl-legacy-provider npm install`.
3. Builds the web bundle via `npm run build:web` or `webpack --config-name web`.
4. Copies compiled HTML (`reader.html`, `index.html`), JS, CSS, and worker assets to `apps/web/public/zotero-pdf-reader/`.

---

## 3. Communication Protocol (`postMessage`)

The CiteDocs document editor shell and the embedded Zotero PDF reader communicate over standard HTML5 `postMessage`:

### 3.1 CiteDocs Parent to Iframe: Initialization & Updates
```typescript
iframe.contentWindow.postMessage({
  type: "CITEDOCS_PDF_INIT",
  payload: {
    attachmentId: "uuid-123",
    pdfUrl: "/api/attachments/uuid-123/content",
    title: "Einstein1935.pdf",
    readOnly: false,
    authorName: "Researcher",
    annotations: [ ... ]
  }
}, "*");
```

### 3.2 Iframe to CiteDocs Parent: Saving Annotations
When a user highlights, creates, or edits an annotation:
```typescript
window.parent.postMessage({
  type: "CITEDOCS_PDF_SAVE_ANNOTATIONS",
  payload: {
    attachmentId: "uuid-123",
    annotations: [
      {
        id: "ABCD1234",
        type: "highlight",
        color: "#ffd400",
        pageLabel: "2",
        sortIndex: "00001|000120|000045",
        position: { pageIndex: 1, rects: [[45, 120, 280, 138]], rotation: 0 },
        text: "Spooky action at a distance",
        comment: "Foundational quote on EPR paradox"
      }
    ]
  }
}, "*");
```

### 3.3 Iframe / UI to CiteDocs Parent: "Cite this"
When a student clicks "Cite this" / "Alıntı Ekle" on any annotation:
```typescript
window.parent.postMessage({
  type: "CITEDOCS_PDF_CITE",
  payload: {
    attachmentId: "uuid-123",
    annotationId: "ABCD1234",
    text: "Spooky action at a distance",
    page: 2,
    pageLabel: "2",
    locator: "2"
  }
}, "*");
```
CiteDocs intercepts this message and passes it to `@citedocs/collabora-cite` to insert a formatted citation with page locator directly into the active Collabora document!

---

## 4. Offline Development & Fallback Loading Path

For offline environments, test runs, and developers without internet access during builds, CiteDocs provides a faithful UI host in:
`apps/web/public/zotero-pdf-reader/index.html`

The host:
- Loads the upstream `reader.js` when available.
- When running offline or without an upstream build, renders the document using PDF.js and implements the authentic `window.createReader` JS API:
  - Supports highlights, underlines, notes, and rectangular image annotations.
  - Features color picker (yellow, red, green, blue, purple).
  - Features Turkish and English UI strings.
  - Implements the exact same `CITEDOCS_PDF_*` postMessage contract.
