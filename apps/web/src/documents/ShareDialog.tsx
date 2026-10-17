import { useState, useEffect } from "react";
import { X, UserPlus, Trash2, Shield, Eye, Edit3, AlertCircle } from "lucide-react";
import type { ShareItem, ShareRole, DocumentItem } from "./types.js";
import { listShares, shareDocument, unshareDocument } from "./api.js";
import { docTranslations, type DocumentLanguage } from "./i18n.js";

interface ShareDialogProps {
  document: DocumentItem;
  isOpen: boolean;
  onClose: () => void;
  lang?: DocumentLanguage;
}

export function ShareDialog({
  document,
  isOpen,
  onClose,
  lang = "tr",
}: ShareDialogProps) {
  const t = docTranslations[lang] || docTranslations.en;
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLoading(true);
    listShares(document.id)
      .then((data) => {
        setShares(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Erişim listesi yüklenemedi");
        setLoading(false);
      });
  }, [isOpen, document.id]);

  if (!isOpen) return null;

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setLoading(true);
    setError(null);
    try {
      const res = await shareDocument(document.id, email.trim(), role);
      setShares((prev) => {
        const filtered = prev.filter(
          (s) =>
            s.id !== res.share.id &&
            s.email?.toLowerCase() !== res.share.email?.toLowerCase()
        );
        return [res.share, ...filtered];
      });
      setEmail("");
    } catch (err: unknown) {
      setError((err as Error).message || "Belge paylaşılamadı");
    } finally {
      setLoading(false);
    }
  };

  const handleUnshare = async (shareId: string) => {
    try {
      await unshareDocument(document.id, shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err: unknown) {
      setError((err as Error).message || "Erişim kaldırılamadı");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      data-testid="share-dialog"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">{t.shareDialogTitle}</h3>
              <p className="text-xs text-slate-400 truncate max-w-xs">{document.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 cursor-pointer"
            data-testid="share-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs bg-rose-50 text-rose-700 rounded-lg border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Share input form */}
          <form onSubmit={handleShare} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="email"
                placeholder={t.shareEmailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                data-testid="share-email-input"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ShareRole)}
                className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                data-testid="share-role-select"
              >
                <option value="viewer">{t.roleViewer}</option>
                <option value="editor">{t.roleEditor}</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
              data-testid="share-submit-btn"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{loading ? t.uploading : t.shareAction}</span>
            </button>
          </form>

          {/* Existing shares list */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t.sharesList}
            </h4>

            {shares.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                {t.noSharesYet}
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 divide-y divide-slate-100">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between py-2 text-xs text-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{share.email}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 ${
                          share.role === "editor"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {share.role === "editor" ? (
                          <Edit3 className="w-2.5 h-2.5" />
                        ) : (
                          <Eye className="w-2.5 h-2.5" />
                        )}
                        <span>{share.role === "editor" ? t.roleEditor : t.roleViewer}</span>
                      </span>
                    </div>

                    <button
                      onClick={() => handleUnshare(share.id)}
                      title={t.unshare}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                      data-testid={`unshare-btn-${share.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg font-medium transition-colors"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
