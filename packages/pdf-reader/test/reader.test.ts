import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatQuoteForDocument, loadPdf, type PdfDocumentHandle } from "../src/index.js";

const fixture = readFileSync(new URL("./fixtures/tiny.pdf", import.meta.url));
let doc: PdfDocumentHandle;
beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network is forbidden");
    }),
  );
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      constructor() {
        throw new Error("Network is forbidden");
      }
    },
  );
  doc = await loadPdf(fixture);
});
afterEach(async () => {
  await doc?.destroy();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("offline PDF reader", () => {
  it("loads typed arrays without detaching input and reads text", async () => {
    expect(doc.pageCount).toBe(1);
    expect(await doc.getPageText(1)).toContain("CiteDocs offline PDF fixture.");
    expect(fixture.byteLength).toBeGreaterThan(0);
  });
  it("also loads ArrayBuffer input", async () => {
    const bytes = new Uint8Array(fixture).buffer;
    const other = await loadPdf(bytes);
    try {
      expect(other.pageCount).toBe(1);
      expect(bytes.byteLength).toBeGreaterThan(0);
    } finally {
      await other.destroy();
    }
  });
  it("round-trips highlights and produces a page citation", async () => {
    const annotation = await doc.createHighlight({
      page: 1,
      color: "#ffff00",
      textOffsets: { start: 0, end: 8 },
    });
    expect(doc.listAnnotations()).toEqual([annotation]);
    const quote = await doc.extractQuote(annotation);
    expect(quote).toEqual({ text: "CiteDocs", page: 1, locator: "1" });
    expect(formatQuoteForDocument(quote)).toEqual({
      type: "blockquote",
      text: "CiteDocs",
      citation: { page: 1, label: "page" },
    });
  });
  it("selects rectangle text once even with overlapping rectangles", async () => {
    const rect = { x: 70, y: 719, width: 300, height: 15 };
    const annotation = await doc.createHighlight({ page: 1, color: "pink", rects: [rect, rect] });
    expect((await doc.extractQuote(annotation)).text).toBe("CiteDocs offline PDF fixture.");
  });
  it("permits area annotations with no text", async () => {
    const annotation = await doc.createHighlight({
      page: 1,
      color: "blue",
      rects: [{ x: 0, y: 0, width: 10, height: 10 }],
    });
    expect((await doc.extractQuote(annotation)).text).toBe("");
  });
  it("isolates stored annotations from caller mutation", async () => {
    const input = { page: 1, color: "green", textOffsets: { start: 0, end: 8 } };
    const annotation = await doc.createHighlight(input);
    input.textOffsets.end = 1;
    annotation.color = "red";
    const listed = doc.listAnnotations();
    expect(listed[0].color).toBe("green");
    listed[0].color = "purple";
    expect(doc.listAnnotations()[0].color).toBe("green");
    await expect(doc.extractQuote(annotation)).rejects.toThrow("modified");
  });
  it.each([0, 2, 1.5, NaN])("rejects invalid page %s", async (page) => {
    await expect(doc.getPageText(page)).rejects.toThrow("page");
  });
  it.each([
    { start: -1, end: 8 },
    { start: 8, end: 8 },
    { start: 0, end: 1000 },
    { start: 0.5, end: 8 },
  ])("rejects invalid offsets %j", async (textOffsets) => {
    await expect(doc.createHighlight({ page: 1, color: "yellow", textOffsets })).rejects.toThrow(
      "offsets",
    );
    expect(doc.listAnnotations()).toEqual([]);
  });
  it("rejects empty colors and rectangles", async () => {
    await expect(doc.createHighlight({ page: 1, color: "", rects: [] })).rejects.toThrow("color");
    await expect(doc.createHighlight({ page: 1, color: "blue", rects: [] })).rejects.toThrow(
      "rectangles",
    );
    await expect(
      doc.createHighlight({
        page: 1,
        color: "blue",
        rects: [{ x: NaN, y: 0, width: 1, height: 1 }],
      }),
    ).rejects.toThrow("rectangles");
  });
  it("rejects annotations belonging to another document", async () => {
    const other = await loadPdf(fixture);
    try {
      const input = { page: 1, color: "blue", textOffsets: { start: 0, end: 8 } };
      await doc.createHighlight(input);
      await expect(doc.extractQuote(await other.createHighlight(input))).rejects.toThrow("Unknown");
    } finally {
      await other.destroy();
    }
  });
  it("rejects invalid PDF bytes", async () => {
    await expect(loadPdf(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
  it("destroys idempotently and rejects subsequent reads", async () => {
    await doc.destroy();
    await doc.destroy();
    await expect(doc.getPageText(1)).rejects.toThrow("destroyed");
    expect(() => doc.listAnnotations()).toThrow("destroyed");
  });
});
