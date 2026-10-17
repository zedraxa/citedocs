import { useState } from "react";
import { X, Edit2 } from "lucide-react";
import type { DocumentItem } from "./types.js";
import { docTranslations, type DocumentLanguage } from "./i18n.js";

interface RenameDialogProps {
  document: DocumentItem;
  isOpen: boolean;
  onClose: () => void;
  onRename: (newTitle: string) => Promise<void>;
  lang?: DocumentLanguage;
}

export function RenameDialog({
  document,
  isOpen,
  onClose,
  onRename,
  lang = "tr",
}: RenameDialogProps) {
  const t = docTranslations[lang] || docTranslations.en;
  const [title, setTitle] = useState(document.title);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await onRename(title.trim());
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Belge yeniden adlandırılamadı");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      data-testid="rename-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm">{t.renameTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
            data-testid="rename-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-lg border border-rose-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {t.renameTitle}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.newTitlePlaceholder}
              required
              autoFocus
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              data-testid="rename-input"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium cursor-pointer"
              data-testid="rename-cancel-btn"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || title.trim() === document.title}
              className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 shadow-xs cursor-pointer"
              data-testid="rename-submit-btn"
            >
              {loading ? t.uploading : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
