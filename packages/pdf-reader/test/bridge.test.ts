import { describe, it, expect, vi } from "vitest";
import {
  isPdfReaderMessage,
  postToPdfReader,
  buildPdfInitMessage,
  buildPdfSetAnnotationsMessage,
  buildPdfSaveAnnotationsMessage,
  buildPdfDeleteAnnotationsMessage,
  buildPdfCiteMessage,
} from "../src/bridge.js";
import type { ZoteroReaderAnnotation } from "../src/types.js";

describe("PDF Reader Bridge PostMessage Protocol", () => {
  it("validates legitimate PDF reader messages", () => {
    expect(isPdfReaderMessage({ type: "CITEDOCS_PDF_INIT", payload: {} })).toBe(true);
    expect(isPdfReaderMessage({ type: "CITEDOCS_PDF_READY" })).toBe(true);
    expect(isPdfReaderMessage({ type: "CITEDOCS_PDF_SAVE_ANNOTATIONS", payload: {} })).toBe(true);
    expect(isPdfReaderMessage({ type: "CITEDOCS_PDF_CITE", payload: {} })).toBe(true);

    expect(isPdfReaderMessage(null)).toBe(false);
    expect(isPdfReaderMessage(undefined)).toBe(false);
    expect(isPdfReaderMessage("string")).toBe(false);
    expect(isPdfReaderMessage({ type: "UNKNOWN_EVENT" })).toBe(false);
  });

  it("builds init message correctly", () => {
    const msg = buildPdfInitMessage({
      attachmentId: "att-123",
      pdfUrl: "/api/attachments/att-123/content",
      title: "Sample Paper.pdf",
      readOnly: false,
      authorName: "Researcher",
      annotations: [],
    });

    expect(msg.type).toBe("CITEDOCS_PDF_INIT");
    if (msg.type === "CITEDOCS_PDF_INIT") {
      expect(msg.payload.attachmentId).toBe("att-123");
      expect(msg.payload.pdfUrl).toBe("/api/attachments/att-123/content");
      expect(msg.payload.title).toBe("Sample Paper.pdf");
      expect(msg.payload.readOnly).toBe(false);
      expect(msg.payload.authorName).toBe("Researcher");
    }
  });

  it("builds cite message with page and locator correctly", () => {
    const annotation: ZoteroReaderAnnotation = {
      id: "ann-42",
      type: "highlight",
      color: "#ffd400",
      pageLabel: "42",
      sortIndex: "00041|000100|000000",
      position: { pageIndex: 41, rects: [[10, 100, 200, 120]] },
      text: "The universe is expanding at an accelerated rate.",
      comment: "Hubble & Riess",
    };

    const msg = buildPdfCiteMessage({
      attachmentId: "att-paper",
      annotation,
    });

    expect(msg.type).toBe("CITEDOCS_PDF_CITE");
    if (msg.type === "CITEDOCS_PDF_CITE") {
      expect(msg.payload.attachmentId).toBe("att-paper");
      expect(msg.payload.annotationId).toBe("ann-42");
      expect(msg.payload.text).toBe("The universe is expanding at an accelerated rate.");
      expect(msg.payload.page).toBe(42);
      expect(msg.payload.pageLabel).toBe("42");
      expect(msg.payload.locator).toBe("42");
    }
  });

  it("posts message to target window safely", () => {
    const postMessageMock = vi.fn();
    const fakeWindow = { postMessage: postMessageMock } as unknown as Window;

    const setMsg = buildPdfSetAnnotationsMessage([]);
    postToPdfReader(fakeWindow, setMsg, "http://localhost:5173");

    expect(postMessageMock).toHaveBeenCalledWith(setMsg, "http://localhost:5173");
  });

  it("builds save and delete annotation messages correctly", () => {
    const saveMsg = buildPdfSaveAnnotationsMessage("att-1", []);
    expect(saveMsg.type).toBe("CITEDOCS_PDF_SAVE_ANNOTATIONS");
    if (saveMsg.type === "CITEDOCS_PDF_SAVE_ANNOTATIONS") {
      expect(saveMsg.payload.attachmentId).toBe("att-1");
      expect(saveMsg.payload.annotations).toEqual([]);
    }

    const deleteMsg = buildPdfDeleteAnnotationsMessage("att-1", ["ann-1", "ann-2"]);
    expect(deleteMsg.type).toBe("CITEDOCS_PDF_DELETE_ANNOTATIONS");
    if (deleteMsg.type === "CITEDOCS_PDF_DELETE_ANNOTATIONS") {
      expect(deleteMsg.payload.attachmentId).toBe("att-1");
      expect(deleteMsg.payload.ids).toEqual(["ann-1", "ann-2"]);
    }
  });
});
