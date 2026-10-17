import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link2,
  X,
  FileCode,
  Eye,
} from "lucide-react";
import {
  importZoteroReferences,
  type ItemPreviewData,
  type FailedItemData,
} from "../zotero/api.js";
import { getApiBaseUrl } from "../auth/api.js";

export const PENDING_IMPORT_KEY = "citedocs.pendingZoteroImport";
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export interface ImportReferencesProps {
  documentId?: string;
  linked?: boolean;
  apiUrl?: string;
  userId?: string;
  onConnectZotero?: (pendingData?: {
    documentId?: string;
    items?: Record<string, unknown>[];
    filename?: string;
  }) => void;
  onItemsImported?: (items: ItemPreviewData[], rawData?: unknown) => void;
  onItemPreview?: (items: ItemPreviewData[]) => void;
  className?: string;
}

export function ImportReferences({
  documentId,
  linked = false,
  apiUrl,
  userId,
  onConnectZotero,
  onItemsImported,
  onItemPreview,
  className = "",
}: ImportReferencesProps) {
  const [activeTab, setActiveTab] = useState<"file" | "text">("file");
  const [pastedText, setPastedText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [format, setFormat] = useState<string>("auto");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [previewItems, setPreviewItems] = useState<ItemPreviewData[]>([]);
  const [rawItems, setRawItems] = useState<Record<string, unknown>[]>([]);
  const [failedItems, setFailedItems] = useState<FailedItemData[]>([]);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [isUnlinkedError, setIsUnlinkedError] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resume pending import after OAuth if saved in sessionStorage
  const resumePendingImport = useCallback(
    async (itemsToSave: Record<string, unknown>[]) => {
      setLoading(true);
      setError(null);
      setNotice(null);

      const res = await importZoteroReferences(
        { items: itemsToSave, save: true },
        apiUrl,
        userId,
      );

      setLoading(false);

      if (res.ok && res.data.saved) {
        setSavedCount(res.data.savedCount);
        setFailedItems(res.data.failedItems || []);
        setNotice(res.data.message);
        setIsUnlinkedError(false);
        if (onItemsImported && res.data.savedItems) {
          onItemsImported(res.data.savedItems, res.data);
        }
      } else {
        setError(res.data.message || res.data.error || "Kaynaklar Zotero kütüphanesine aktarılamadı.");
      }
    },
    [apiUrl, userId, onItemsImported],
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_IMPORT_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (documentId && pending.documentId && pending.documentId !== documentId) return;

      if (Array.isArray(pending.items) && pending.items.length > 0) {
        setRawItems(pending.items);
        if (linked) {
          sessionStorage.removeItem(PENDING_IMPORT_KEY);
          void resumePendingImport(pending.items);
        } else {
          setIsUnlinkedError(true);
        }
      }
    } catch {
      // Storage blocked or invalid JSON
    }
  }, [documentId, linked, resumePendingImport]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setNotice(null);
    setSavedCount(null);
    setFailedItems([]);
    setPreviewItems([]);
    setRawItems([]);
    setIsUnlinkedError(false);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setError(`Dosya boyutu 2 MB sınırını aşıyor (${sizeMB} MB). Lütfen daha küçük bir dosya seçin.`);
      setSelectedFile(null);
      setFileContent("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || "");
      setFileContent(text);
    };
    reader.onerror = () => {
      setError("Dosya okunamadı. Lütfen tekrar deneyin.");
      setSelectedFile(null);
      setFileContent("");
    };
    reader.readAsText(file);
  };

  const executeImport = async (saveMode: boolean) => {
    const content = activeTab === "file" ? fileContent : pastedText.trim();
    const filename = activeTab === "file" ? selectedFile?.name : undefined;

    if (!content && rawItems.length === 0) {
      setError(
        activeTab === "file"
          ? "Lütfen önce içe aktarılacak bir kaynak dosyası seçin."
          : "Lütfen içe aktarılacak BibTeX, RIS veya CSL-JSON metnini yapıştırın.",
      );
      return;
    }

    // Client-side byte size check
    if (content && new Blob([content]).size > MAX_FILE_SIZE_BYTES) {
      setError("İçerik boyutu 2 MB sınırını aşıyor. Lütfen daha küçük bir dosya veya metin kullanın.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    setIsUnlinkedError(false);
    setSavedCount(null);
    setFailedItems([]);

    const payload =
      rawItems.length > 0 && !content
        ? { items: rawItems, save: saveMode }
        : {
            data: content,
            filename,
            format: format === "auto" ? undefined : format,
            save: saveMode,
          };

    const res = await importZoteroReferences(payload, apiUrl, userId);
    setLoading(false);

    if (res.status === 409) {
      // Unlinked student
      setIsUnlinkedError(true);
      if (res.data.items) {
        setPreviewItems(res.data.items);
        if (onItemPreview) onItemPreview(res.data.items);
      }
      if (res.data.rawItems) {
        setRawItems(res.data.rawItems);
      }
      return;
    }

    if (!res.ok) {
      setError(res.data.message || res.data.error || "İçe aktarma sırasında bir hata oluştu.");
      return;
    }

    // Preview mode
    if (!saveMode || !res.data.saved) {
      if (res.data.items) {
        setPreviewItems(res.data.items);
        if (onItemPreview) onItemPreview(res.data.items);
      }
      if (res.data.rawItems) {
        setRawItems(res.data.rawItems);
      }
      setNotice(res.data.message || `${res.data.total} kaynak bulundu.`);
      return;
    }

    // Successfully saved
    setSavedCount(res.data.savedCount);
    setFailedItems(res.data.failedItems || []);
    setNotice(res.data.message);
    if (res.data.savedItems && onItemsImported) {
      onItemsImported(res.data.savedItems, res.data);
    }
  };

  const handleConnect = () => {
    const pendingData = {
      documentId,
      items: rawItems,
      filename: selectedFile?.name,
    };

    try {
      sessionStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(pendingData));
    } catch {
      // Storage blocked
    }

    if (onConnectZotero) {
      onConnectZotero(pendingData);
      return;
    }

    const back =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/documents";
    const apiBase = apiUrl || getApiBaseUrl();
    window.location.href = `${apiBase}/api/zotero/oauth/start?returnTo=${encodeURIComponent(back)}`;
  };

  const handleClear = () => {
    setSelectedFile(null);
    setFileContent("");
    setPastedText("");
    setError(null);
    setNotice(null);
    setPreviewItems([]);
    setRawItems([]);
    setFailedItems([]);
    setSavedCount(null);
    setIsUnlinkedError(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    try {
      sessionStorage.removeItem(PENDING_IMPORT_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm space-y-3 ${className}`}
      data-testid="import-references-panel"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
          <FileCode size={15} className="text-blue-600" />
          <span>Dosya veya Metinden Kaynak İçe Aktar</span>
        </label>
        <span className="text-[10px] text-slate-400">Maks. 2 MB / 500 Kaynak</span>
      </div>

      {/* Tabs: File Upload vs Paste Text */}
      <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("file")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1 transition ${
            activeTab === "file" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
          }`}
          data-testid="import-tab-file"
        >
          <Upload size={13} />
          <span>Dosya Yükle</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("text")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1 transition ${
            activeTab === "text" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
          }`}
          data-testid="import-tab-text"
        >
          <FileText size={13} />
          <span>Metin Yapıştır</span>
        </button>
      </div>

      {/* Format Selector */}
      <div className="flex items-center justify-between text-xs text-slate-600">
        <label htmlFor="import-format-select" className="text-[11px] font-medium text-slate-500">
          Biçim:
        </label>
        <select
          id="import-format-select"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 focus:border-blue-500 focus:outline-none"
          data-testid="import-format-select"
        >
          <option value="auto">Otomatik Algıla</option>
          <option value="bibtex">BibTeX (.bib)</option>
          <option value="ris">RIS (.ris)</option>
          <option value="csljson">CSL-JSON (.json)</option>
          <option value="endnote-xml">EndNote XML (.xml)</option>
          <option value="rdf">Zotero RDF (.rdf)</option>
        </select>
      </div>

      {/* File Upload Mode */}
      {activeTab === "file" && (
        <div className="space-y-2">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer transition"
            data-testid="import-dropzone"
          >
            <Upload size={22} className="text-slate-400 mb-1" />
            <p className="text-xs font-medium text-slate-700">
              {selectedFile ? selectedFile.name : "Bir dosya seçin veya buraya sürükleyin"}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                : ".bib, .ris, .json, .xml veya .rdf"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bib,.ris,.json,.csljson,.xml,.rdf,text/plain"
              onChange={handleFileChange}
              className="hidden"
              data-testid="import-file-input"
            />
          </div>
        </div>
      )}

      {/* Paste Text Mode */}
      {activeTab === "text" && (
        <div className="space-y-1">
          <textarea
            value={pastedText}
            onChange={(e) => {
              setPastedText(e.target.value);
              setError(null);
            }}
            placeholder="BibTeX (@article{...}), RIS (TY  - ...) veya CSL-JSON içeriğini buraya yapıştırın..."
            rows={4}
            className="w-full rounded border border-slate-300 p-2 text-xs font-mono text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="import-text-input"
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={loading || (activeTab === "file" ? !selectedFile : !pastedText.trim())}
          onClick={() => executeImport(false)}
          className="flex-1 flex items-center justify-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
          data-testid="import-preview-btn"
        >
          <Eye size={13} />
          <span>Önizle</span>
        </button>

        <button
          type="button"
          disabled={loading || (activeTab === "file" ? !selectedFile : !pastedText.trim())}
          onClick={() => executeImport(true)}
          className="flex-1 flex items-center justify-center gap-1 rounded bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-sm cursor-pointer"
          data-testid="import-submit-btn"
        >
          {loading ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Aktarılıyor…</span>
            </>
          ) : (
            <>
              <Sparkles size={13} />
              <span>Kütüphaneme Aktar</span>
            </>
          )}
        </button>

        {(selectedFile || pastedText.trim() || previewItems.length > 0) && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Temizle"
            data-testid="import-clear-btn"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Loading state indicator */}
      {loading && (
        <div
          data-testid="import-loading"
          className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700 animate-pulse"
        >
          <Loader2 size={15} className="animate-spin text-blue-600" />
          <span>Kaynaklar çeviri sunucusunda çözümleniyor ve kütüphanenize aktarılıyor…</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          data-testid="import-error"
          className="flex items-start gap-1.5 rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-700"
        >
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Notice message */}
      {notice && !error && !isUnlinkedError && savedCount === null && (
        <div
          data-testid="import-notice"
          className="flex items-start gap-1.5 rounded-md bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700"
        >
          <Sparkles size={15} className="text-blue-500 mt-0.5 shrink-0" />
          <span className="leading-snug">{notice}</span>
        </div>
      )}

      {/* Unlinked user notice with direct Connect button */}
      {isUnlinkedError && (
        <div
          data-testid="import-unlinked-notice"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2"
        >
          <div className="flex items-center gap-1.5 font-semibold text-amber-900">
            <Link2 size={15} className="text-amber-700" />
            <span>Zotero Hesabı Bağlı Değil</span>
          </div>
          <p className="text-amber-800 leading-relaxed">
            Kaynaklar başarıyla çözümlendi ({previewItems.length || rawItems.length} kaynak bulundu).
            Kütüphanenize kaydetmek için Zotero hesabınızı bağlayın; bağlantıdan sonra içe aktarma otomatik
            olarak tamamlanacaktır.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            className="w-full flex items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition"
            data-testid="import-connect-btn"
          >
            <Link2 size={14} />
            <span>Zotero'yu bağla</span>
          </button>
        </div>
      )}

      {/* Success notice */}
      {savedCount !== null && savedCount > 0 && (
        <div
          data-testid="import-success-notice"
          className="flex items-start gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800"
        >
          <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">{savedCount} kaynak Zotero kütüphanenize başarıyla eklendi.</p>
            <p className="text-[11px] text-emerald-700">
              💡 ONLYOFFICE Zotero eklentisinden kaynakları aratarak belgenize doğrudan atıf ekleyebilirsiniz.
            </p>
          </div>
        </div>
      )}

      {/* Partial failed items list */}
      {failedItems.length > 0 && (
        <div
          data-testid="import-failed-notice"
          className="rounded-md border border-amber-300 bg-amber-50/70 p-2.5 text-xs text-amber-900 space-y-1"
        >
          <p className="font-semibold flex items-center gap-1 text-amber-800">
            <AlertCircle size={13} className="text-amber-600" />
            <span>{failedItems.length} kaynak eklenemedi:</span>
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
            {failedItems.map((item, idx) => (
              <li key={idx} data-testid="import-failed-item">
                <span className="font-medium">{item.title}:</span> {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview Summary and Items List */}
      {previewItems.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-slate-100" data-testid="import-preview-section">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span data-testid="import-summary">{previewItems.length} kaynak bulundu</span>
            <span className="text-[10px] text-slate-400">Önizleme</span>
          </div>

          <div
            className="max-h-48 overflow-y-auto space-y-1.5 pr-1"
            data-testid="import-preview-list"
          >
            {previewItems.map((item, idx) => (
              <div
                key={idx}
                className="rounded border border-slate-200 bg-slate-50/50 p-2 text-xs shadow-2xs hover:border-slate-300 transition"
              >
                <p className="font-medium text-slate-800 line-clamp-2 leading-snug">
                  {item.title}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                  {item.authors && <span className="truncate max-w-[200px]">{item.authors}</span>}
                  {item.year && <span className="rounded bg-slate-200/60 px-1 py-0.2">{item.year}</span>}
                  {item.doi && <span className="text-blue-600">DOI: {item.doi}</span>}
                </div>
              </div>
            ))}
          </div>

          {!savedCount && (
            <button
              type="button"
              disabled={loading}
              onClick={() => executeImport(true)}
              className="w-full flex items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition"
              data-testid="import-save-preview-btn"
            >
              <Sparkles size={14} />
              <span>Bulunan Kaynakları Kütüphaneme Aktar</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
