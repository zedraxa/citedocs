import { useState, useCallback } from "react";
import { X, Maximize2, Minimize2, Quote, Download } from "lucide-react";
import type { PdfReaderPanelProps, PdfCitationEvent, PdfReaderViewMode } from "./types.js";
import { PDF_I18N } from "./i18n.js";
import { PdfReaderFrame } from "./PdfReaderFrame.js";
import { postToCollabora, sendUnoCommand } from "../collabora/postMessage.js";
import { buildInsertCitationMessage } from "@citedocs/collabora-cite";

export function PdfReaderPanel({
  userId,
  attachment,
  isOpen,
  onClose,
  onCiteAnnotation,
  collaboraIframeRef,
  initialViewMode = "panel",
  lang = "tr",
}: PdfReaderPanelProps) {
  const [viewMode, setViewMode] = useState<PdfReaderViewMode>(initialViewMode);
  const [currentLang, setCurrentLang] = useState<"en" | "tr">(lang);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const t = PDF_I18N[currentLang];

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Citation handler: bridges annotation citation directly to Collabora Online
  const handleCite = useCallback(
    (event: PdfCitationEvent) => {
      // 1. Direct UNO text insertion to Collabora Online frame
      if (collaboraIframeRef?.current) {
        const quoteText = event.text ? `"${event.text}" ` : "";
        const locatorText = event.locator ? `(p. ${event.locator})` : "";
        const formattedCitation = `${quoteText}${locatorText}`;

        // Send UNO command to insert quote text
        sendUnoCommand(collaboraIframeRef.current, ".uno:InsertText", {
          Text: { type: "string", value: formattedCitation },
        });

        // Also dispatch standard Collabora citation macro message
        const citationPayload = {
          citationID: `cit-${event.annotationId}`,
          citationItems: [
            {
              id: event.attachmentId,
              locator: event.locator,
              label: "page",
            },
          ],
          properties: {
            formattedCitation,
          },
        };

        const macroMessage = buildInsertCitationMessage(
          citationPayload,
          formattedCitation,
        );
        postToCollabora(collaboraIframeRef.current, macroMessage);
      }

      showToast(t.citedSuccessfully);

      if (onCiteAnnotation) {
        onCiteAnnotation(event);
      }
    },
    [collaboraIframeRef, onCiteAnnotation, showToast, t.citedSuccessfully],
  );

  if (!isOpen || !attachment) return null;

  const isFullscreen = viewMode === "fullscreen";

  return (
    <div
      className={`bg-white border-l border-gray-300 flex flex-col shadow-2xl z-30 transition-all duration-200 select-none ${
        isFullscreen
          ? "fixed inset-0 w-screen h-screen z-50"
          : "relative w-full md:w-[600px] lg:w-[680px] xl:w-[760px] h-full shrink-0"
      }`}
      data-testid="pdf-reader-panel"
    >
      {/* Top Header Bar */}
      <div className="bg-[#2a2d30] text-white px-3 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 bg-[#c92c2c] text-white rounded flex items-center justify-center font-black text-[11px] shrink-0">
            Z
          </div>
          <span className="font-semibold text-xs text-gray-200 shrink-0">
            {t.readerTitle}
          </span>
          <span className="text-gray-400 text-xs truncate max-w-[180px] md:max-w-[280px]" title={attachment.title}>
            — {attachment.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Download button */}
          <a
            href={attachment.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={attachment.title}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors cursor-pointer"
            title={t.downloadPdf}
            data-testid="download-pdf-btn"
          >
            <Download className="w-3.5 h-3.5" />
          </a>

          {/* Language toggle */}
          <button
            type="button"
            onClick={() => setCurrentLang((l) => (l === "en" ? "tr" : "en"))}
            className="text-[11px] font-bold px-1.5 py-0.5 text-gray-300 hover:text-white rounded hover:bg-gray-700 transition-colors cursor-pointer"
            title="Switch Language / Dili Değiştir"
            data-testid="toggle-reader-lang-btn"
          >
            {currentLang.toUpperCase()}
          </button>

          {/* Toggle Fullscreen / Split Panel */}
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === "panel" ? "fullscreen" : "panel"))}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors cursor-pointer"
            title={isFullscreen ? t.splitView : t.fullscreen}
            data-testid="toggle-fullscreen-btn"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close Reader */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-rose-400 rounded hover:bg-gray-700 transition-colors cursor-pointer"
            title={t.close}
            data-testid="close-pdf-reader-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className="bg-emerald-600 text-white text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-md animate-fade-in"
          data-testid="pdf-reader-toast"
        >
          <Quote className="w-3 h-3 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Reader Iframe */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-gray-800">
        <PdfReaderFrame
          userId={userId}
          attachmentId={attachment.id}
          pdfUrl={attachment.downloadUrl}
          title={attachment.title}
          onCite={handleCite}
        />
      </div>
    </div>
  );
}
