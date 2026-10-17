import {
  X,
  BookMarked,
  RefreshCw,
  Edit2,
  Trash2,
  ListPlus,
  Sparkles,
} from "lucide-react";
import type { ZoteroCitationPayload } from "@citedocs/collabora-cite";
import type { CSLItem } from "@citedocs/shared";

export interface DocumentCitationItem {
  markName: string;
  payload: ZoteroCitationPayload;
  formattedText: string;
}

export interface DocumentCitationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  citations: DocumentCitationItem[];
  activeStyleId: string;
  hasBibliography?: boolean;
  bibliographyEntries?: string[];
  onEditCitation: (citation: DocumentCitationItem) => void;
  onDeleteCitation: (markName: string) => void;
  onInsertBibliography: () => void;
  onRefreshAll: () => void;
}

export function DocumentCitationsDrawer({
  isOpen,
  onClose,
  citations,
  activeStyleId,
  hasBibliography = false,
  bibliographyEntries = [],
  onEditCitation,
  onDeleteCitation,
  onInsertBibliography,
  onRefreshAll,
}: DocumentCitationsDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-slate-200 z-40 flex flex-col animate-in slide-in-from-right duration-200"
      data-testid="document-citations-drawer"
    >
      {/* Header */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <BookMarked className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-slate-800">Atıflar ve Kaynakça</h2>
              <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                {citations.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Stil: <span className="font-semibold text-slate-600 uppercase">{activeStyleId}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          data-testid="close-citations-drawer-btn"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Toolbar */}
      <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onInsertBibliography}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
          title="Collabora editöründe imlecin bulunduğu yere kaynakça ekleyin veya güncelleyin"
          data-testid="insert-bibliography-btn"
        >
          <ListPlus className="w-3.5 h-3.5" />
          <span>{hasBibliography ? "Kaynakçayı Güncelle" : "Kaynakça Ekle"}</span>
        </button>

        <button
          type="button"
          onClick={onRefreshAll}
          className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
          title="Tüm atıfları aktif stille yeniden biçimlendirin ve yenileyin"
          data-testid="refresh-citations-btn"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content Area: Citations List & Bibliography Preview */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Citations List Section */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Belge Atıfları ({citations.length})
            </span>
          </div>

          {citations.length === 0 ? (
            <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <Sparkles className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">Belgede henüz atıf bulunmuyor</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Zotero Kütüphanesinden, DOI ile ekleme alanından veya PDF Okuyucudan atıf ekleyin.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {citations.map((c, idx) => {
                const itemsCount = c.payload.citationItems.length;
                const firstItem = c.payload.citationItems[0];
                const itemData = firstItem?.itemData as CSLItem | undefined;
                const author = itemData?.author?.[0]?.family || "Author";
                const title = itemData?.title || `Item ${firstItem?.id}`;
                const year = itemData?.issued?.["date-parts"]?.[0]?.[0];

                return (
                  <div
                    key={c.markName || c.payload.citationID || idx}
                    className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-blue-300 transition-all group"
                    data-testid={`document-citation-card-${idx}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500 font-mono text-[10px] font-semibold">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-bold text-blue-900 font-serif">
                          {c.formattedText || c.payload.properties.formattedCitation}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onEditCitation(c)}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                          title="Atıf öğelerini, konumları, ön ek/son eki düzenleyin"
                          data-testid={`edit-citation-btn-${idx}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCitation(c.markName)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="Bu atfı sil"
                          data-testid={`delete-citation-btn-${idx}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 text-xs text-slate-700 truncate" title={title}>
                      <span className="font-semibold">{author}</span>
                      {year ? ` (${year})` : ""} &ndash; {title}
                    </div>

                    {/* Metadata tags: cluster count, locators, prefix */}
                    <div className="flex flex-wrap items-center gap-1 mt-2 text-[10px]">
                      {itemsCount > 1 && (
                        <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded-md font-medium border border-blue-200/60">
                          {itemsCount} kaynak
                        </span>
                      )}
                      {firstItem?.locator && (
                        <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-md">
                          {firstItem.label || "s."} {firstItem.locator}
                        </span>
                      )}
                      {firstItem?.prefix && (
                        <span className="px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded-md italic">
                          &ldquo;{firstItem.prefix}&rdquo;
                        </span>
                      )}
                      {(firstItem?.suppressAuthor || firstItem?.["suppress-author"]) && (
                        <span className="px-1.5 py-0.2 bg-amber-50 text-amber-700 rounded-md border border-amber-200/60">
                          Yazar gizlendi
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bibliography Preview Section */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Kaynakça Maddeleri ({bibliographyEntries.length})
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                hasBibliography
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {hasBibliography ? "Belgeye Eklendi" : "Henüz Eklenmedi"}
            </span>
          </div>

          {bibliographyEntries.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
              Otomatik kaynakça oluşturmak için atıf ekleyin.
            </div>
          ) : (
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2.5 max-h-56 overflow-y-auto">
              {bibliographyEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className="text-[11px] text-slate-700 leading-relaxed border-b border-slate-200/60 pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-semibold text-slate-400 mr-1.5">[{idx + 1}]</span>
                  <span>{entry}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
