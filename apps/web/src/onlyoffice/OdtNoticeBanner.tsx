import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, X, FileCheck } from "lucide-react";
import { convertOdtToDocx, fetchDocument } from "../documents/api.js";
import type { DocumentItem } from "../documents/types.js";

export interface OdtNoticeBannerProps {
  documentId: string;
  documentTitle?: string;
  mimeType?: string;
  onConverted?: (newDoc: DocumentItem) => void;
  onClose?: () => void;
  className?: string;
}

export function OdtNoticeBanner({
  documentId,
  documentTitle,
  mimeType,
  onConverted,
  onClose,
  className = "",
}: OdtNoticeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine if file is ODT
  const [isOdt, setIsOdt] = useState<boolean | null>(() => {
    if (mimeType) {
      return mimeType.includes("opendocument");
    }
    if (documentTitle) {
      const lower = documentTitle.toLowerCase();
      if (lower.endsWith(".odt")) return true;
      if (lower.endsWith(".docx") || lower.endsWith(".pdf")) return false;
    }
    return null;
  });

  useEffect(() => {
    if (isOdt !== null) return;
    let active = true;
    fetchDocument(documentId)
      .then((res) => {
        if (!active) return;
        const mime = res.document?.mimeType || "";
        const title = res.document?.title || "";
        setIsOdt(mime.includes("opendocument") || title.toLowerCase().endsWith(".odt"));
      })
      .catch(() => {
        if (active) setIsOdt(false);
      });

    return () => {
      active = false;
    };
  }, [documentId, isOdt]);

  if (dismissed || isOdt !== true) {
    return null;
  }

  const handleConvert = async () => {
    setConverting(true);
    setError(null);
    try {
      const res = await convertOdtToDocx(documentId);
      if (onConverted) {
        onConverted(res.document);
      } else if (typeof window !== "undefined") {
        window.location.href = `/editor?doc=${encodeURIComponent(res.document.id)}&title=${encodeURIComponent(res.document.title)}`;
      }
    } catch (err: unknown) {
      const msg =
        (err as Error)?.message ||
        "Belge DOCX formatına dönüştürülemedi. Lütfen tekrar deneyin.";
      setError(msg);
    } finally {
      setConverting(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (onClose) {
      onClose();
    }
  };

  return (
    <div
      data-testid="odt-notice-banner"
      role="region"
      aria-label="ODT biçimi uyarısı"
      className={`border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 transition shadow-xs ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
            aria-hidden="true"
          />
          <div className="space-y-0.5">
            <p className="font-semibold text-amber-950">
              LibreOffice / ODT Biçimi Uyarısı
            </p>
            <p className="text-amber-800 leading-relaxed">
              Zotero masaüstü eklentileriyle (Word ve LibreOffice) tam iki yönlü uyumluluk için{" "}
              <strong className="font-semibold text-amber-950">.docx</strong> formatını kullanmanız önerilir.{" "}
              ONLYOFFICE, ODT dosyaları kaydedildiğinde Zotero atıflarını düz metne dönüştürmektedir.
            </p>
            {error && (
              <p
                data-testid="odt-convert-error"
                className="mt-1 font-medium text-red-600"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            data-testid="convert-to-docx-btn"
            onClick={handleConvert}
            disabled={converting}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition"
          >
            {converting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Dönüştürülüyor…</span>
              </>
            ) : (
              <>
                <FileCheck className="h-3.5 w-3.5" />
                <span>DOCX olarak kopya oluştur</span>
              </>
            )}
          </button>
          <button
            type="button"
            data-testid="odt-notice-dismiss"
            onClick={handleDismiss}
            title="Uyarıyı kapat"
            aria-label="Kapat"
            className="rounded p-1 text-amber-600 hover:bg-amber-100 hover:text-amber-900 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
