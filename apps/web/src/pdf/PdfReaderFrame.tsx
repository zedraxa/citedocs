import { useEffect, useRef, useState, useCallback } from "react";
import type { PdfReaderFrameProps, PdfCitationEvent } from "./types.js";
import {
  isPdfReaderMessage,
  postToPdfReader,
  buildPdfInitMessage,
  type ZoteroReaderAnnotation,
} from "@citedocs/pdf-reader";

export function PdfReaderFrame({
  userId,
  attachmentId,
  pdfUrl,
  title,
  initialAnnotations = [],
  readOnly = false,
  onAnnotationsChange,
  onCite,
  className = "w-full h-full border-none",
}: PdfReaderFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [annotations, setAnnotations] = useState<ZoteroReaderAnnotation[]>(initialAnnotations);
  const [isReady, setIsReady] = useState(false);

  // Fetch server annotations on mount or when attachmentId changes
  useEffect(() => {
    let cancelled = false;
    async function fetchAnnotations() {
      if (!attachmentId || !userId) return;
      try {
        const resp = await fetch(`/api/attachments/${attachmentId}/annotations`, {
          headers: { "x-user-id": userId },
        });
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          if (Array.isArray(data.annotations)) {
            setAnnotations(data.annotations);
            if (onAnnotationsChange) onAnnotationsChange(data.annotations);
          }
        }
      } catch {
        // Fallback to initial annotations if network or offline
      }
    }

    fetchAnnotations();
    return () => {
      cancelled = true;
    };
  }, [attachmentId, userId, onAnnotationsChange]);

  // Sends the init configuration to the reader iframe
  const sendInitToIframe = useCallback(() => {
    if (!iframeRef.current) return;
    const initMsg = buildPdfInitMessage({
      attachmentId,
      pdfUrl,
      title,
      readOnly,
      annotations,
    });
    postToPdfReader(iframeRef.current, initMsg);
  }, [attachmentId, pdfUrl, title, readOnly, annotations]);

  // Listen to postMessages from the reader iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!isPdfReaderMessage(data)) return;

      switch (data.type) {
        case "CITEDOCS_PDF_READY":
          setIsReady(true);
          sendInitToIframe();
          break;

        case "CITEDOCS_PDF_SAVE_ANNOTATIONS":
          if (data.payload?.annotations) {
            const updated = data.payload.annotations;
            setAnnotations((prev) => {
              const map = new Map(prev.map((a) => [a.id, a]));
              for (const a of updated) map.set(a.id, a);
              const next = Array.from(map.values());
              if (onAnnotationsChange) onAnnotationsChange(next);
              return next;
            });

            // Persist to CiteDocs backend
            if (userId && attachmentId) {
              try {
                await fetch(`/api/attachments/${attachmentId}/annotations`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userId,
                  },
                  body: JSON.stringify({ annotations: updated }),
                });
              } catch {
                // Offline fallback
              }
            }
          }
          break;

        case "CITEDOCS_PDF_DELETE_ANNOTATIONS":
          if (data.payload?.ids) {
            const deleteIds = data.payload.ids;
            setAnnotations((prev) => {
              const next = prev.filter((a) => !deleteIds.includes(a.id));
              if (onAnnotationsChange) onAnnotationsChange(next);
              return next;
            });

            if (userId && attachmentId) {
              try {
                await fetch(`/api/attachments/${attachmentId}/annotations/delete`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userId,
                  },
                  body: JSON.stringify({ ids: deleteIds }),
                });
              } catch {
                // Offline fallback
              }
            }
          }
          break;

        case "CITEDOCS_PDF_CITE":
          if (data.payload && onCite) {
            onCite(data.payload as PdfCitationEvent);
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [userId, attachmentId, sendInitToIframe, onAnnotationsChange, onCite]);

  return (
    <iframe
      ref={iframeRef}
      src="/zotero-pdf-reader/index.html"
      title={`Zotero PDF Reader - ${title}`}
      className={className}
      onLoad={() => {
        if (!isReady) {
          sendInitToIframe();
        }
      }}
      data-testid="zotero-pdf-reader-iframe"
    />
  );
}
