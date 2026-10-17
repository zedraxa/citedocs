import { useState, useEffect, useRef } from "react";
import {
  FileText,
  Plus,
  Upload,
  Search,
  Share2,
  Trash2,
  Download,
  Edit2,
  ExternalLink,
  Users,
  HardDrive,
  FileCode,
  File,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import type { DocumentItem, SharedDocumentItem, StorageQuotaInfo } from "./types.js";
import {
  fetchMyDocuments,
  fetchSharedDocuments,
  createBlankDocument,
  uploadDocument,
  renameDocument,
  deleteDocument,
  downloadDocument,
} from "./api.js";
import {
  docTranslations,
  getDocumentLanguage,
  formatBytes,
  formatDocumentDate,
  type DocumentLanguage,
} from "./i18n.js";
import { ShareDialog } from "./ShareDialog.js";
import { RenameDialog } from "./RenameDialog.js";
import { UserMenu } from "../auth/UserMenu.js";
import { useOptionalAuth } from "../auth/AuthContext.js";
import { OdtNoticeBanner } from "../onlyoffice/OdtNoticeBanner.js";

interface DocumentsPageProps {
  onOpenDocument?: (doc: DocumentItem) => void;
  onNavigateToEditor?: () => void;
}

export function DocumentsPage({
  onOpenDocument,
  onNavigateToEditor,
}: DocumentsPageProps) {
  const auth = useOptionalAuth();
  const [fallbackLang] = useState<DocumentLanguage>(getDocumentLanguage);
  const lang: DocumentLanguage = (auth?.lang as DocumentLanguage) || fallbackLang || "tr";
  const t = docTranslations[lang] || docTranslations.tr;

  const [activeTab, setActiveTab] = useState<"my" | "shared">("my");
  const [myDocs, setMyDocs] = useState<DocumentItem[]>([]);
  const [sharedDocs, setSharedDocs] = useState<SharedDocumentItem[]>([]);
  const [quota, setQuota] = useState<StorageQuotaInfo>({
    used: 0,
    total: 5 * 1024 * 1024 * 1024,
    percentage: 0,
    remaining: 5 * 1024 * 1024 * 1024,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);

  // Modals state
  const [sharingDoc, setSharingDoc] = useState<DocumentItem | null>(null);
  const [renamingDoc, setRenamingDoc] = useState<DocumentItem | null>(null);
  const [uploadedOdtDoc, setUploadedOdtDoc] = useState<DocumentItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "my") {
        const res = await fetchMyDocuments(searchQuery);
        setMyDocs(res.documents || []);
        if (res.quota) setQuota(res.quota);
      } else {
        const res = await fetchSharedDocuments(searchQuery);
        setSharedDocs(res.documents || []);
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Belgeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, searchQuery]);

  const handleCreateBlank = async (format: "docx" | "odt") => {
    setNewDropdownOpen(false);
    setError(null);
    try {
      const res = await createBlankDocument(undefined, format);
      setMyDocs((prev) => [res.document, ...prev]);
      setQuota((prev) => ({
        ...prev,
        used: prev.used + res.document.fileSize,
        percentage: Math.min(100, Math.round(((prev.used + res.document.fileSize) / prev.total) * 10000) / 100),
      }));
      // Automatically open in the configured editor
      handleOpen(res.document);
    } catch (err: unknown) {
      setError((err as Error).message || "Belge oluşturulamadı");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const res = await uploadDocument(file);
      setMyDocs((prev) => [res.document, ...prev]);
      setQuota((prev) => ({
        ...prev,
        used: prev.used + res.document.fileSize,
        percentage: Math.min(100, Math.round(((prev.used + res.document.fileSize) / prev.total) * 10000) / 100),
      }));
      const isOdt =
        file.name.toLowerCase().endsWith(".odt") ||
        res.document.mimeType.includes("opendocument");
      if (isOdt) {
        setUploadedOdtDoc(res.document);
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Belge yüklenemedi");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm(t.confirmDelete)) return;
    try {
      await deleteDocument(docId);
      const deletedDoc = myDocs.find((d) => d.id === docId);
      setMyDocs((prev) => prev.filter((d) => d.id !== docId));
      if (deletedDoc) {
        setQuota((prev) => ({
          ...prev,
          used: Math.max(0, prev.used - deletedDoc.fileSize),
          percentage: Math.max(
            0,
            Math.min(100, Math.round(((prev.used - deletedDoc.fileSize) / prev.total) * 10000) / 100)
          ),
        }));
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Belge silinemedi");
    }
  };

  const handleRename = async (newTitle: string) => {
    if (!renamingDoc) return;
    const res = await renameDocument(renamingDoc.id, newTitle);
    setMyDocs((prev) =>
      prev.map((d) => (d.id === renamingDoc.id ? res.document : d))
    );
    setRenamingDoc(null);
  };

  const handleDownload = async (doc: DocumentItem) => {
    try {
      const ext = doc.mimeType.includes("opendocument")
        ? ".odt"
        : doc.mimeType.includes("pdf")
          ? ".pdf"
          : ".docx";
      const filename = doc.title.toLowerCase().endsWith(ext) ? doc.title : `${doc.title}${ext}`;
      await downloadDocument(doc.id, filename);
    } catch (err: unknown) {
      setError((err as Error).message || "Belge indirilemedi");
    }
  };

  const handleOpen = (doc: DocumentItem) => {
    if (onOpenDocument) {
      onOpenDocument(doc);
    } else if (typeof window !== "undefined") {
      window.location.href = `/editor?doc=${encodeURIComponent(doc.id)}&title=${encodeURIComponent(doc.title)}`;
    }
  };

  const getDocIcon = (mimeType: string) => {
    if (mimeType.includes("opendocument")) {
      return (
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs">
          <FileCode className="w-5 h-5" />
        </div>
      );
    }
    if (mimeType.includes("pdf")) {
      return (
        <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 shadow-xs">
          <File className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
        <FileText className="w-5 h-5" />
      </div>
    );
  };

  return (
    <div
      className="min-h-screen bg-[#f8f9fa] flex flex-col text-slate-800"
      data-testid="documents-page"
    >
      {/* 1. TOP NAVBAR */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => {
              if (onNavigateToEditor) onNavigateToEditor();
              else if (typeof window !== "undefined") window.location.href = "/documents";
            }}
            title={t.backToEditor}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            data-testid="back-to-editor-btn"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t.backToEditor}</span>
          </button>

          <div className="h-5 w-px bg-slate-200" />

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm tracking-tight">
                  CiteDocs
                </span>
                <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                  {t.cloud}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                {t.editorTagline}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* User Profile / Menu */}
          <UserMenu />
        </div>
      </header>

      {/* 2. MAIN CONTAINER */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Error Notification */}
        {error && (
          <div className="flex items-center gap-2 p-3.5 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-700 font-bold ml-2"
            >
              &times;
            </button>
          </div>
        )}

        {/* Storage Quota Card */}
        <section
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          data-testid="storage-quota-indicator"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800 text-sm">{t.storageQuota}</h3>
                <span className="text-[11px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  {t.storageFreeNotice}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.storageUsed
                  .replace("{used}", formatBytes(quota.used))
                  .replace("{total}", formatBytes(quota.total))
                  .replace("{percent}", String(quota.percentage))}
              </p>
            </div>
          </div>

          <div className="w-full sm:w-64 space-y-1">
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(1, Math.min(100, quota.percentage))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>0 GB</span>
              <span>5 GB</span>
            </div>
          </div>
        </section>

        {/* 3. CONTROLS BAR: Tabs, Search, Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex bg-slate-200 p-1 rounded-xl gap-1 shrink-0 self-start">
            <button
              onClick={() => setActiveTab("my")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "my"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              data-testid="tab-my-documents"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t.myDocuments}</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full font-normal">
                {myDocs.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("shared")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "shared"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              data-testid="tab-shared-documents"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{t.sharedWithMe}</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full font-normal">
                {sharedDocs.length}
              </span>
            </button>
          </div>

          {/* Search + Action Buttons */}
          <div className="flex items-center gap-2.5 flex-1 sm:justify-end">
            {/* Search Input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                data-testid="doc-search-input"
              />
            </div>

            {/* Hidden File Input for Upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".docx,.odt,.pdf"
              className="hidden"
              data-testid="file-upload-input"
            />

            {/* Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 transition-colors shadow-2xs shrink-0 cursor-pointer"
              title={t.uploadDocument}
              data-testid="upload-doc-btn"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.uploadDocument}</span>
            </button>

            {/* New Document Button & Dropdown */}
            <div className="relative">
              <button
                onClick={() => setNewDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition-colors shadow-xs shrink-0 cursor-pointer"
                data-testid="new-doc-dropdown-btn"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.newDocument}</span>
              </button>

              {newDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100"
                  data-testid="new-dropdown-menu"
                >
                  <button
                    onClick={() => handleCreateBlank("docx")}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    data-testid="create-docx-btn"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>{t.blankDocx}</span>
                  </button>
                  <button
                    onClick={() => handleCreateBlank("odt")}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    data-testid="create-odt-btn"
                  >
                    <FileCode className="w-4 h-4 text-emerald-600" />
                    <span>{t.blankOdt}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ODT Notice Banner on Upload */}
        {uploadedOdtDoc && (
          <OdtNoticeBanner
            className="rounded-xl border border-amber-200"
            documentId={uploadedOdtDoc.id}
            documentTitle={uploadedOdtDoc.title}
            mimeType={uploadedOdtDoc.mimeType}
            onConverted={(newDoc) => {
              setMyDocs((prev) => [newDoc, ...prev]);
              setUploadedOdtDoc(null);
              handleOpen(newDoc);
            }}
            onClose={() => setUploadedOdtDoc(null)}
          />
        )}

        {/* 4. DOCUMENTS GRID / LIST */}
        <section data-testid="documents-grid-section">
          {loading && (
            <div className="py-16 text-center text-xs text-slate-400">
              {t.loadingDocuments}
            </div>
          )}

          {!loading && activeTab === "my" && myDocs.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-700">{t.emptyStateMy}</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">{t.dropFilesHere}</p>
            </div>
          )}

          {!loading && activeTab === "shared" && sharedDocs.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-700">{t.emptyStateShared}</h3>
            </div>
          )}

          {/* Cards Grid */}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeTab === "my"
                ? myDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between group"
                      data-testid={`document-card-${doc.id}`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          {getDocIcon(doc.mimeType)}
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setSharingDoc(doc)}
                              title={t.share}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              data-testid={`share-doc-${doc.id}`}
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setRenamingDoc(doc)}
                              title={t.rename}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              data-testid={`rename-doc-${doc.id}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownload(doc)}
                              title={t.download}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              data-testid={`download-doc-${doc.id}`}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(doc.id)}
                              title={t.delete}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              data-testid={`delete-doc-${doc.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <h4
                            onClick={() => handleOpen(doc)}
                            className="font-semibold text-slate-800 text-sm truncate hover:text-blue-600 cursor-pointer transition-colors"
                            title={doc.title}
                            data-testid={`doc-title-${doc.id}`}
                          >
                            {doc.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                            <span>{formatBytes(doc.fileSize)}</span>
                            <span>&bull;</span>
                            <span>
                              {formatDocumentDate(doc.updatedAt, lang)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 mt-3 flex items-center justify-between">
                        <span className="text-[10px] font-medium text-slate-400">
                          {doc.mimeType.includes("opendocument")
                            ? t.docTypeOdt
                            : doc.mimeType.includes("pdf")
                              ? t.docTypePdf
                              : t.docTypeDocx}
                        </span>

                        <button
                          onClick={() => handleOpen(doc)}
                          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                          data-testid={`open-doc-${doc.id}`}
                        >
                          <span>{t.open}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                : sharedDocs.map((item) => (
                    <div
                      key={item.document.id}
                      className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between group"
                      data-testid={`shared-card-${item.document.id}`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          {getDocIcon(item.document.mimeType)}
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                item.shareRole === "editor"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}
                            >
                              {item.shareRole === "editor" ? t.roleEditor : t.roleViewer}
                            </span>
                            <button
                              onClick={() => handleDownload(item.document)}
                              title={t.download}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <h4
                            onClick={() => handleOpen(item.document)}
                            className="font-semibold text-slate-800 text-sm truncate hover:text-blue-600 cursor-pointer transition-colors"
                            title={item.document.title}
                          >
                            {item.document.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                            <span>{formatBytes(item.document.fileSize)}</span>
                            {item.sharedBy && (
                              <>
                                <span>&bull;</span>
                                <span>
                                  {t.sharedBy} {item.sharedBy.displayName || item.sharedBy.email}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 mt-3 flex items-center justify-end">
                        <button
                          onClick={() => handleOpen(item.document)}
                          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                        >
                          <span>{t.open}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
            </div>
          )}
        </section>
      </main>

      {/* Share Dialog */}
      {sharingDoc && (
        <ShareDialog
          document={sharingDoc}
          isOpen={!!sharingDoc}
          onClose={() => setSharingDoc(null)}
          lang={lang}
        />
      )}

      {/* Rename Dialog */}
      {renamingDoc && (
        <RenameDialog
          document={renamingDoc}
          isOpen={!!renamingDoc}
          onClose={() => setRenamingDoc(null)}
          onRename={handleRename}
          lang={lang}
        />
      )}
    </div>
  );
}
