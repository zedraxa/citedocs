import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api.js";

/** PDF user-space coordinates (bottom-left origin, before viewport rotation/zoom). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** UTF-16 offsets into getPageText(), start inclusive and end exclusive. */
export interface TextOffsets {
  start: number;
  end: number;
}
export type HighlightInput = { page: number; color: string } & (
  { textOffsets: TextOffsets; rects?: never } | { rects: Rect[]; textOffsets?: never }
);
export type HighlightAnnotation = HighlightInput & { id: string; type: "highlight" };
export interface Quote {
  text: string;
  page: number;
  locator: string;
}
export interface DocumentQuote {
  type: "blockquote";
  text: string;
  citation: { page: number; label: "page" };
}
export interface PdfDocumentHandle {
  readonly pageCount: number;
  getPageText(pageNumber: number): Promise<string>;
  createHighlight(input: HighlightInput): Promise<HighlightAnnotation>;
  listAnnotations(): HighlightAnnotation[];
  extractQuote(annotation: HighlightAnnotation): Promise<Quote>;
  destroy(): Promise<void>;
}

/** Browser consumers must supply a same-version, locally bundled PDF.js worker URL. */
export function configurePdfWorker(workerSrc: string): void {
  GlobalWorkerOptions.workerSrc = workerSrc;
}

export function formatQuoteForDocument(quote: Quote): DocumentQuote {
  return { type: "blockquote", text: quote.text, citation: { page: quote.page, label: "page" } };
}

function itemRect(item: TextItem): Rect {
  const [a, b, c, d, x, y] = item.transform as number[];
  const length = Math.hypot(a, b) || 1;
  const verticalLength = Math.hypot(c, d) || 1;
  const dx = (a / length) * item.width;
  const dy = (b / length) * item.width;
  const hx = (c / verticalLength) * item.height;
  const hy = (d / verticalLength) * item.height;
  const xs = [x, x + dx, x + hx, x + dx + hx];
  const ys = [y, y + dy, y + hy, y + dy + hy];
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Loads a private copy, so PDF.js cannot detach the caller's buffer. */
export async function loadPdf(data: ArrayBuffer | Uint8Array): Promise<PdfDocumentHandle> {
  const task = getDocument({
    data: new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data)),
    useSystemFonts: true,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await task.promise.catch(async (error: unknown) => {
    await task.destroy();
    throw error;
  });
  let destroyed = false;
  const documentId = globalThis.crypto.randomUUID();
  let nextId = 1;
  const annotations = new Map<string, { annotation: HighlightAnnotation; text: string }>();
  const pages = new Map<number, Promise<{ text: string; items: TextItem[] }>>();
  function assertActive() {
    if (destroyed) throw new Error("PDF document has been destroyed");
  }
  function pageContent(page: number) {
    assertActive();
    if (!Number.isInteger(page) || page < 1 || page > pdf.numPages)
      throw new RangeError("Invalid PDF page number");
    let content = pages.get(page);
    if (!content) {
      content = pdf.getPage(page).then(async (p) => {
        const result = await p.getTextContent();
        const items = result.items.filter((item): item is TextItem => "str" in item);
        return { text: items.map((item) => item.str + (item.hasEOL ? "\n" : "")).join(""), items };
      });
      pages.set(page, content);
    }
    return content;
  }
  return {
    pageCount: pdf.numPages,
    async getPageText(page) {
      return (await pageContent(page)).text;
    },
    async createHighlight(input) {
      assertActive();
      const selection = structuredClone(input);
      if (typeof selection.color !== "string" || !selection.color.trim())
        throw new TypeError("Highlight color is required");
      if ((selection.rects === undefined) === (selection.textOffsets === undefined))
        throw new TypeError("Provide exactly one of rects or textOffsets");
      const content = await pageContent(selection.page);
      assertActive();
      let text: string;
      if (selection.textOffsets) {
        const { start, end } = selection.textOffsets;
        if (
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          start < 0 ||
          end <= start ||
          end > content.text.length
        )
          throw new RangeError("Invalid text offsets");
        text = content.text.slice(start, end);
      } else {
        const rects = selection.rects!;
        if (
          !rects.length ||
          rects.some(
            (r) =>
              ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
              r.width <= 0 ||
              r.height <= 0,
          )
        )
          throw new RangeError("Invalid highlight rectangles");
        text = content.items
          .filter((item) => rects.some((rect) => intersects(rect, itemRect(item))))
          .map((item) => item.str + (item.hasEOL ? "\n" : ""))
          .join("")
          .trim();
      }
      const annotation: HighlightAnnotation = {
        ...selection,
        id: `${documentId}-${nextId++}`,
        type: "highlight",
      };
      annotations.set(annotation.id, { annotation, text });
      return structuredClone(annotation);
    },
    listAnnotations() {
      assertActive();
      return [...annotations.values()].map(({ annotation }) => structuredClone(annotation));
    },
    async extractQuote(annotation) {
      assertActive();
      const stored = annotations.get(annotation.id);
      if (!stored || JSON.stringify(stored.annotation) !== JSON.stringify(annotation))
        throw new Error("Unknown or modified annotation");
      return {
        text: stored.text,
        page: stored.annotation.page,
        locator: String(stored.annotation.page),
      };
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      pages.clear();
      annotations.clear();
      await task.destroy();
    },
  };
}

export * from "./types.js";
export * from "./mapping.js";
export * from "./bridge.js";

