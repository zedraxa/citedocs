// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { PdfReaderFrame } from "../src/pdf/PdfReaderFrame.js";
import { PdfReaderPanel } from "../src/pdf/PdfReaderPanel.js";
import { PDF_I18N } from "../src/pdf/i18n.js";
import type { PdfAttachment } from "../src/pdf/types.js";
import type { ZoteroReaderAnnotation } from "@citedocs/pdf-reader";

afterEach(cleanup);

describe("Web PDF Reader Integration", () => {
  const dummyAttachment: PdfAttachment = {
    id: "att-einstein1935",
    title: "Einstein1935.pdf",
    contentType: "application/pdf",
    downloadUrl: "/api/attachments/att-einstein1935/content",
    itemId: "item-einstein",
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ annotations: [], count: 0 }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("PdfReaderFrame Component", () => {
    it("renders iframe targeting /zotero-pdf-reader/index.html", () => {
      render(
        <PdfReaderFrame
          userId="user-test"
          attachmentId={dummyAttachment.id}
          pdfUrl={dummyAttachment.downloadUrl}
          title={dummyAttachment.title}
        />,
      );

      const iframe = screen.getByTestId("zotero-pdf-reader-iframe") as HTMLIFrameElement;
      expect(iframe).toBeDefined();
      expect(iframe.src).toContain("/zotero-pdf-reader/index.html");
      expect(iframe.title).toContain("Einstein1935.pdf");
    });

    it("sends CITEDOCS_PDF_INIT message on iframe load or CITEDOCS_PDF_READY", () => {
      const { container } = render(
        <PdfReaderFrame
          userId="user-test"
          attachmentId={dummyAttachment.id}
          pdfUrl={dummyAttachment.downloadUrl}
          title={dummyAttachment.title}
        />,
      );

      const iframe = container.querySelector("iframe") as HTMLIFrameElement;
      const postMessageSpy = vi.fn();
      Object.defineProperty(iframe, "contentWindow", {
        value: { postMessage: postMessageSpy },
        writable: true,
      });

      // Simulate iframe triggering CITEDOCS_PDF_READY
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { type: "CITEDOCS_PDF_READY" },
          }),
        );
      });

      expect(postMessageSpy).toHaveBeenCalled();
      const lastCall = postMessageSpy.mock.calls[postMessageSpy.mock.calls.length - 1];
      expect(lastCall[0]).toMatchObject({
        type: "CITEDOCS_PDF_INIT",
        payload: {
          attachmentId: "att-einstein1935",
          title: "Einstein1935.pdf",
        },
      });
    });

    it("handles CITEDOCS_PDF_SAVE_ANNOTATIONS and triggers callback", () => {
      const onAnnotationsChange = vi.fn();
      render(
        <PdfReaderFrame
          userId="user-test"
          attachmentId={dummyAttachment.id}
          pdfUrl={dummyAttachment.downloadUrl}
          title={dummyAttachment.title}
          onAnnotationsChange={onAnnotationsChange}
        />,
      );

      const sampleAnnotation: ZoteroReaderAnnotation = {
        id: "ANN_TEST_1",
        type: "highlight",
        color: "#ffd400",
        pageLabel: "1",
        sortIndex: "00000|000100|000000",
        position: { pageIndex: 0, rects: [[10, 10, 100, 20]] },
        text: "Quantum mechanics test quote",
      };

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "CITEDOCS_PDF_SAVE_ANNOTATIONS",
              payload: {
                attachmentId: dummyAttachment.id,
                annotations: [sampleAnnotation],
              },
            },
          }),
        );
      });

      expect(onAnnotationsChange).toHaveBeenCalledWith([sampleAnnotation]);
    });

    it("handles CITEDOCS_PDF_CITE and invokes onCite", () => {
      const onCite = vi.fn();
      render(
        <PdfReaderFrame
          userId="user-test"
          attachmentId={dummyAttachment.id}
          pdfUrl={dummyAttachment.downloadUrl}
          title={dummyAttachment.title}
          onCite={onCite}
        />,
      );

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "CITEDOCS_PDF_CITE",
              payload: {
                attachmentId: dummyAttachment.id,
                annotationId: "ANN_TEST_1",
                text: "Quoted passage",
                page: 7,
                pageLabel: "7",
                locator: "7",
              },
            },
          }),
        );
      });

      expect(onCite).toHaveBeenCalledTimes(1);
      expect(onCite).toHaveBeenCalledWith({
        attachmentId: dummyAttachment.id,
        annotationId: "ANN_TEST_1",
        text: "Quoted passage",
        page: 7,
        pageLabel: "7",
        locator: "7",
      });
    });
  });

  describe("PdfReaderPanel Component", () => {
    it("renders panel with attachment title, Zotero badge, and action controls", () => {
      render(
        <PdfReaderPanel
          userId="user-test"
          attachment={dummyAttachment}
          isOpen={true}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByTestId("pdf-reader-panel")).toBeDefined();
      expect(screen.getByText("Zotero PDF Reader")).toBeDefined();
      expect(screen.getByText("— Einstein1935.pdf")).toBeDefined();
      expect(screen.getByTestId("close-pdf-reader-btn")).toBeDefined();
      expect(screen.getByTestId("toggle-fullscreen-btn")).toBeDefined();
      expect(screen.getByTestId("toggle-reader-lang-btn")).toBeDefined();
    });

    it("toggles between split panel and fullscreen view modes", () => {
      render(
        <PdfReaderPanel
          userId="user-test"
          attachment={dummyAttachment}
          isOpen={true}
          onClose={vi.fn()}
        />,
      );

      const panel = screen.getByTestId("pdf-reader-panel");
      const toggleBtn = screen.getByTestId("toggle-fullscreen-btn");

      // Initially in panel mode
      expect(panel.className).toContain("md:w-[600px]");

      // Click to toggle fullscreen
      fireEvent.click(toggleBtn);
      expect(panel.className).toContain("fixed inset-0 w-screen h-screen");

      // Click to return to panel
      fireEvent.click(toggleBtn);
      expect(panel.className).toContain("md:w-[600px]");
    });

    it("supports Turkish and English language switching", () => {
      render(
        <PdfReaderPanel
          userId="user-test"
          attachment={dummyAttachment}
          isOpen={true}
          onClose={vi.fn()}
          lang="en"
        />,
      );

      expect(screen.getByText("Zotero PDF Reader")).toBeDefined();
      const langBtn = screen.getByTestId("toggle-reader-lang-btn");
      expect(langBtn.textContent).toBe("EN");

      // Switch to Turkish
      fireEvent.click(langBtn);
      expect(screen.getByText("Zotero PDF Okuyucu")).toBeDefined();
      expect(langBtn.textContent).toBe("TR");
    });

    it("bridges citation directly to Collabora Online iframe when cite is triggered", () => {
      const mockPostMessage = vi.fn();
      const mockCollaboraIframe = {
        contentWindow: { postMessage: mockPostMessage },
      } as unknown as HTMLIFrameElement;
      const collaboraRef = { current: mockCollaboraIframe };

      const onCiteAnnotation = vi.fn();

      render(
        <PdfReaderPanel
          userId="user-test"
          attachment={dummyAttachment}
          isOpen={true}
          onClose={vi.fn()}
          collaboraIframeRef={collaboraRef}
          onCiteAnnotation={onCiteAnnotation}
        />,
      );

      // Trigger citation via postMessage event
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "CITEDOCS_PDF_CITE",
              payload: {
                attachmentId: dummyAttachment.id,
                annotationId: "ANN_CIT_1",
                text: "Energy equals mass times speed of light squared",
                page: 12,
                pageLabel: "12",
                locator: "12",
              },
            },
          }),
        );
      });

      expect(onCiteAnnotation).toHaveBeenCalledTimes(1);

      // Verify that postToCollabora sent UNO command or macro payload
      expect(mockPostMessage).toHaveBeenCalled();
      const calls = mockPostMessage.mock.calls;
      const sentStrings = calls.map((c) => (typeof c[0] === "string" ? JSON.parse(c[0]) : c[0]));

      const unoInsert = sentStrings.find(
        (m: { MessageId?: string }) => m.MessageId === "Send_UNO_Command",
      );
      expect(unoInsert).toBeDefined();

      // Check toast notification
      expect(screen.getByTestId("pdf-reader-toast")).toBeDefined();
    });
  });

  describe("Localization Dictionaries", () => {
    it("contains complete and matching keys for English and Turkish", () => {
      const enKeys = Object.keys(PDF_I18N.en).sort();
      const trKeys = Object.keys(PDF_I18N.tr).sort();
      expect(enKeys).toEqual(trKeys);
      expect(PDF_I18N.tr.citeThis).toBe("Belgeye Alıntıla");
      expect(PDF_I18N.en.citeThis).toBe("Cite this");
    });
  });
});
