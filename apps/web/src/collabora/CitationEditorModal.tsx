import { useState, useMemo } from "react";
import {
  X,
  Trash2,
  Plus,
  BookMarked,
  Sparkles,
  Search,
  Check,
  ChevronDown,
} from "lucide-react";
import type { CSLItem } from "@citedocs/shared";
import {
  CollaboraCSLEngine,
  createZoteroCitationPayload,
  type ZoteroCitationPayload,
  type ZoteroCitationItem,
} from "@citedocs/collabora-cite";

export interface CitationEditorModalProps {
  isOpen: boolean;
  mode: "insert" | "edit";
  initialPayload?: ZoteroCitationPayload;
  markName?: string;
  currentStyleId: string;
  availableItems?: CSLItem[];
  onSave: (payload: ZoteroCitationPayload, formattedText: string, markName?: string) => void;
  onDelete?: (markName: string) => void;
  onClose: () => void;
}

interface EditableCitationItem {
  id: string;
  itemData?: CSLItem;
  locator?: string;
  label?: string;
  prefix?: string;
  suffix?: string;
  suppressAuthor?: boolean;
}

const LOCATOR_LABELS = [
  { value: "page", label: "Page (p.)" },
  { value: "chapter", label: "Chapter (ch.)" },
  { value: "section", label: "Section (sec.)" },
  { value: "figure", label: "Figure (fig.)" },
  { value: "paragraph", label: "Paragraph (para.)" },
  { value: "verse", label: "Verse (v.)" },
  { value: "column", label: "Column (col.)" },
  { value: "line", label: "Line (l.)" },
  { value: "note", label: "Note (n.)" },
  { value: "volume", label: "Volume (vol.)" },
];

export function CitationEditorModal({
  isOpen,
  mode,
  initialPayload,
  markName,
  currentStyleId,
  availableItems = [],
  onSave,
  onDelete,
  onClose,
}: CitationEditorModalProps) {
  // Initialize cluster items from initialPayload
  const [items, setItems] = useState<EditableCitationItem[]>(() => {
    if (initialPayload?.citationItems && initialPayload.citationItems.length > 0) {
      return initialPayload.citationItems.map((ci) => ({
        id: String(ci.id),
        itemData: ci.itemData as CSLItem | undefined,
        locator: ci.locator || "",
        label: ci.label || "page",
        prefix: ci.prefix || "",
        suffix: ci.suffix || "",
        suppressAuthor: Boolean(ci.suppressAuthor || ci["suppress-author"]),
      }));
    }
    if (availableItems.length > 0) {
      const first = availableItems[0];
      return [
        {
          id: String(first.id),
          itemData: first,
          locator: "",
          label: "page",
          prefix: "",
          suffix: "",
          suppressAuthor: false,
        },
      ];
    }
    return [];
  });

  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [showAddSource, setShowAddSource] = useState(false);
  const [addSourceSearch, setAddSourceSearch] = useState("");

  // Live preview using CollaboraCSLEngine
  const engine = useMemo(() => {
    const allKnownItems: CSLItem[] = [...availableItems];
    for (const it of items) {
      if (it.itemData && !allKnownItems.some((k) => String(k.id) === String(it.id))) {
        allKnownItems.push(it.itemData);
      }
    }
    return new CollaboraCSLEngine(currentStyleId, "en-US", allKnownItems);
  }, [currentStyleId, availableItems, items]);

  const livePreview = useMemo(() => {
    if (items.length === 0) return "";
    try {
      const adapted: ZoteroCitationItem[] = items.map((it) => ({
        id: it.id,
        itemData: it.itemData,
        locator: it.locator || undefined,
        label: it.label || undefined,
        prefix: it.prefix || undefined,
        suffix: it.suffix || undefined,
        suppressAuthor: it.suppressAuthor,
      }));
      const res = engine.formatCitation(adapted, {
        citationID: initialPayload?.citationID || "preview-cit",
      });
      return res.plainCitation || res.formattedCitation;
    } catch {
      // Fallback preview
      return items
        .map((it) => {
          const author = it.itemData?.author?.[0]?.family || "Author";
          const year = it.itemData?.issued?.["date-parts"]?.[0]?.[0] || "Year";
          const loc = it.locator ? `, p. ${it.locator}` : "";
          const pfx = it.prefix ? `${it.prefix} ` : "";
          const sfx = it.suffix ? `${it.suffix}` : "";
          return `${pfx}${author}, ${year}${loc}${sfx}`;
        })
        .join("; ");
    }
  }, [items, engine, initialPayload?.citationID]);

  if (!isOpen) return null;

  const currentItem = items[activeItemIndex] || items[0];

  const handleUpdateCurrentItem = (patch: Partial<EditableCitationItem>) => {
    setItems((prev) =>
      prev.map((it, idx) => (idx === activeItemIndex ? { ...it, ...patch } : it)),
    );
  };

  const handleRemoveItem = (indexToRemove: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    if (activeItemIndex >= indexToRemove && activeItemIndex > 0) {
      setActiveItemIndex((prev) => prev - 1);
    }
  };

  const handleAddItemToCluster = (newItem: CSLItem) => {
    if (items.some((it) => String(it.id) === String(newItem.id))) {
      return;
    }
    const added: EditableCitationItem = {
      id: String(newItem.id),
      itemData: newItem,
      locator: "",
      label: "page",
      prefix: "",
      suffix: "",
      suppressAuthor: false,
    };
    setItems((prev) => [...prev, added]);
    setActiveItemIndex(items.length);
    setShowAddSource(false);
    setAddSourceSearch("");
  };

  const handleSave = () => {
    if (items.length === 0) return;

    const citationItems: ZoteroCitationItem[] = items.map((it) => ({
      id: it.id,
      uris: [`http://zotero.org/users/local/items/${it.id}`],
      uri: [`http://zotero.org/users/local/items/${it.id}`],
      itemData: it.itemData,
      locator: it.locator ? it.locator.trim() : undefined,
      label: it.locator ? it.label || "page" : undefined,
      prefix: it.prefix ? it.prefix : undefined,
      suffix: it.suffix ? it.suffix : undefined,
      suppressAuthor: Boolean(it.suppressAuthor),
    }));

    const formattedCitation = livePreview || "(Citation)";

    const payload = createZoteroCitationPayload({
      citationID: initialPayload?.citationID,
      items: citationItems,
      formattedCitation,
    });

    onSave(payload, formattedCitation, markName);
    onClose();
  };

  const filteredAvailable = availableItems.filter((it) => {
    if (items.some((existing) => String(existing.id) === String(it.id))) return false;
    if (!addSourceSearch.trim()) return true;
    const q = addSourceSearch.toLowerCase();
    const title = it.title?.toLowerCase() || "";
    const author = it.author?.[0]?.family?.toLowerCase() || "";
    return title.includes(q) || author.includes(q);
  });

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      data-testid="citation-editor-modal"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <BookMarked className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                {mode === "edit" ? "Edit Citation" : "Insert Citation"}
              </h2>
              <p className="text-[11px] text-slate-400">
                CSL Format &bull; Style: <span className="font-semibold text-slate-600">{currentStyleId.toUpperCase()}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            data-testid="close-citation-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Live Preview Box */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl" data-testid="citation-live-preview">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3 text-blue-600" />
              In-Text Citation Preview
            </div>
            <div className="text-sm font-semibold text-slate-900 bg-white px-3 py-2 rounded-lg border border-blue-100 shadow-2xs font-serif">
              {livePreview || <span className="text-slate-400 italic">No sources selected</span>}
            </div>
          </div>

          {/* Cluster Items Tabs / Sources */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Cited Sources ({items.length})
              </label>
              <button
                type="button"
                onClick={() => setShowAddSource((prev) => !prev)}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                data-testid="add-source-to-citation-btn"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Source to Cluster
              </button>
            </div>

            {/* Source tabs */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {items.map((it, idx) => {
                const author = it.itemData?.author?.[0]?.family || "Source";
                const year = it.itemData?.issued?.["date-parts"]?.[0]?.[0] || "";
                const isSelected = idx === activeItemIndex;
                return (
                  <div
                    key={it.id}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-700 shadow-xs"
                        : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                    }`}
                    onClick={() => setActiveItemIndex(idx)}
                    data-testid={`citation-cluster-item-${idx}`}
                  >
                    <span>
                      {author} {year ? `(${year})` : ""}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveItem(idx);
                        }}
                        className={`p-0.5 rounded-full hover:bg-black/20 ${isSelected ? "text-white" : "text-slate-400"}`}
                        title="Remove from citation"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Source Dropdown Picker */}
            {showAddSource && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl mb-3 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={addSourceSearch}
                    onChange={(e) => setAddSourceSearch(e.target.value)}
                    placeholder="Search available library items..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:border-blue-500"
                    autoFocus
                  />
                </div>
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-100">
                  {filteredAvailable.length > 0 ? (
                    filteredAvailable.map((avail) => (
                      <button
                        key={avail.id}
                        type="button"
                        onClick={() => handleAddItemToCluster(avail)}
                        className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-blue-50 rounded-md transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span className="truncate font-medium text-slate-700">
                          {avail.author?.[0]?.family || "Unknown"} &ndash; {avail.title}
                        </span>
                        <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      </button>
                    ))
                  ) : (
                    <div className="text-[11px] text-slate-400 py-2 text-center">
                      No additional items found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Active Item Settings (Locators, Prefix, Suffix, Suppress Author) */}
          {currentItem && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
              <div className="text-xs font-semibold text-slate-800">
                {currentItem.itemData?.title || `Item ${currentItem.id}`}
              </div>

              {/* Locator Row: Type & Number */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Locator Type
                  </label>
                  <div className="relative">
                    <select
                      value={currentItem.label || "page"}
                      onChange={(e) => handleUpdateCurrentItem({ label: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 appearance-none focus:outline-hidden focus:border-blue-500 cursor-pointer"
                      data-testid="locator-type-select"
                    >
                      {LOCATOR_LABELS.map((loc) => (
                        <option key={loc.value} value={loc.value}>
                          {loc.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Locator Value (e.g. 525, 12-14)
                  </label>
                  <input
                    type="text"
                    value={currentItem.locator || ""}
                    onChange={(e) => handleUpdateCurrentItem({ locator: e.target.value })}
                    placeholder="e.g. 42 or 105-110"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:border-blue-500"
                    data-testid="locator-value-input"
                  />
                </div>
              </div>

              {/* Prefix & Suffix */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Prefix
                  </label>
                  <input
                    type="text"
                    value={currentItem.prefix || ""}
                    onChange={(e) => handleUpdateCurrentItem({ prefix: e.target.value })}
                    placeholder="e.g. see, cf."
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:border-blue-500"
                    data-testid="prefix-input"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Suffix
                  </label>
                  <input
                    type="text"
                    value={currentItem.suffix || ""}
                    onChange={(e) => handleUpdateCurrentItem({ suffix: e.target.value })}
                    placeholder="e.g. , for an overview"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:border-blue-500"
                    data-testid="suffix-input"
                  />
                </div>
              </div>

              {/* Suppress Author Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(currentItem.suppressAuthor)}
                    onChange={(e) => handleUpdateCurrentItem({ suppressAuthor: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500 cursor-pointer"
                    data-testid="suppress-author-checkbox"
                  />
                  <span>
                    <strong>Suppress Author</strong> &mdash; omit author name, show only year (e.g. &ldquo;(2021)&rdquo;)
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div>
            {mode === "edit" && markName && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(markName);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                data-testid="delete-citation-btn"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Citation</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={items.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="save-citation-modal-btn"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{mode === "edit" ? "Update Citation" : "Insert Citation"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
