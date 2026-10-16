# @citedocs/pdf-reader

Headless PDF.js loading, text highlights and quote-to-document data for M5 Part A.
No React or TipTap dependency. Requires Node >=22.13 for Node execution (PDF.js
5.7.284); modern browsers use the legacy PDF.js build for compatibility.

```ts
import { loadPdf, formatQuoteForDocument } from "@citedocs/pdf-reader";

const document = await loadPdf(new Uint8Array(pdfBytes));
try {
  console.log(document.pageCount, await document.getPageText(1));
  const highlight = await document.createHighlight({
    page: 1,
    textOffsets: { start: 0, end: 8 },
    color: "#ffff00",
  });
  const quote = await document.extractQuote(highlight);
  // { text: '...', page: 1, locator: '1' }
  const block = formatQuoteForDocument(quote);
  // { type: 'blockquote', text: '...', citation: { page: 1, label: 'page' } }
  console.log(block, document.listAnnotations());
} finally {
  await document.destroy();
}
```

## API

- `loadPdf(data: ArrayBuffer | Uint8Array): Promise<PdfDocumentHandle>` loads
  supplied bytes, copying them before PDF.js takes ownership. No URL input.
  Invalid or password-protected documents reject; password prompting is not implemented.
- `pageCount: number` is the physical page count. All page numbers are **1-based**;
  locators refer to physical pages, not printed page labels.
- `getPageText(page): Promise<string>` returns PDF.js text items in extraction
  order, concatenated with a newline after items marked `hasEOL`. No OCR.
- `createHighlight({ page, color, textOffsets | rects }): Promise<HighlightAnnotation>`
  accepts exactly one selection form. Color is any nonempty string (e.g. yellow,
  green, blue, pink, purple or CSS hex); consumers should validate CSS at rendering.
  The returned annotation has a unique `id` and `type: 'highlight'`.
- `textOffsets: { start, end }` are UTF-16 offsets into the exact `getPageText`
  result, start inclusive, end exclusive. Empty/out-of-range selections reject.
- `rects: Array<{ x, y, width, height }>` uses unscaled, unrotated **PDF user space**
  with bottom-left origin. Convert viewport coordinates before calling. Rectangles
  must have finite coordinates and positive sizes. Text extraction selects whole
  text items whose approximate axis-aligned bounds intersect any rectangle, once
  each in extraction order. It is not character-accurate for partial items,
  rotated/skewed text, or complex layouts; use text offsets for exact quotes.
  Rectangles over images/blank areas are valid and yield empty text.
- `listAnnotations(): HighlightAnnotation[]` returns independent snapshots of
  this handle's newly created annotations. Embedded PDF annotations are not imported.
- `extractQuote(annotation): Promise<{ text, page, locator }>` extracts the stored
  selection. Unknown, foreign or modified annotation snapshots reject.
- `formatQuoteForDocument(quote): DocumentQuote` returns plain blockquote data
  with `{ page, label: 'page' }`. The consuming editor must attach the bibliographic
  item ID and adapt this structure to its schema; this is not a linked CSL citation yet.
- `destroy(): Promise<void>` releases PDF.js resources and clears caches and
  annotations. Idempotent; subsequent operations reject/throw.

Annotations are in-memory only and do not modify PDF bytes. This package does not
implement storage, canvas rendering, a text-selection UI, sticky notes or editor integration.

## Browser worker integration

Before loading a PDF in a browser, configure a locally bundled worker matching
this package's exact PDF.js version. For example, a Vite consumer with access to
this dependency can use:

```ts
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { configurePdfWorker } from "@citedocs/pdf-reader";
configurePdfWorker(workerUrl);
```

No CDN is configured. Node automatically uses PDF.js's local fake worker. Font
faces and worker resource fetching are disabled; system fonts are used. PDFs that
need external CMaps or other unbundled resources may need future resource options.
See the upstream [PDF.js API](https://mozilla.github.io/pdf.js/api/index.html).

## Offline tests

`pnpm --filter @citedocs/pdf-reader test` parses the committed tiny, two-line PDF
using real PDF.js. Tests block fetch and XMLHttpRequest and need no network.
`pnpm --filter @citedocs/pdf-reader fixture` regenerates the fixture deterministically
with Node only; the generator writes a valid xref table and byte offsets.
