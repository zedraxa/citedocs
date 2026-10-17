import {
  useState,
  useEffect,
  useRef,
  useTransition,
  useMemo,
  useCallback,
} from "react";
import {
  BookMarked,
  Check,
  ChevronDown,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  PINNED_POPULAR_STYLES,
  DEFAULT_STYLE_ID,
  normalizeStyleId,
} from "@citedocs/shared";
import { getApiBaseUrl, getCsrfToken } from "../auth/api.js";

export interface StyleItem {
  id: string;
  title: string;
  shortTitle?: string;
  citationFormat?: "author-date" | "numeric" | "note";
  dependent?: boolean;
  isPinned?: boolean;
}

export interface StylePickerProps {
  documentId: string;
  currentStyleId?: string | null;
  onStyleSelected?: (style: StyleItem) => Promise<void> | void;
  disabled?: boolean;
}

export const STYLE_PICKER_ITEM_HEIGHT = 46;
export const STYLE_PICKER_VIEWPORT_HEIGHT = 280;
export const STYLE_PICKER_OVERSCAN = 3;

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; data: T }> {
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  if (init.method && init.method !== "GET") {
    const csrf = getCsrfToken();
    if (csrf) headers.set("x-csrf-token", csrf);
    if (init.body) headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, data };
}

function formatBadgeText(fmt?: string): string | null {
  if (fmt === "author-date") return "Yazar-Tarih";
  if (fmt === "numeric") return "Numaralı";
  if (fmt === "note") return "Dipnot";
  return null;
}

export function StylePicker({
  documentId,
  currentStyleId,
  onStyleSelected,
  disabled = false,
}: StylePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<StyleItem[]>(() =>
    PINNED_POPULAR_STYLES.map((p) => ({
      id: p.id,
      title: p.title,
      shortTitle: p.shortTitle,
      citationFormat: p.citationFormat,
      isPinned: true,
    })),
  );
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [activeStyleId, setActiveStyleId] = useState<string>(
    normalizeStyleId(currentStyleId || DEFAULT_STYLE_ID),
  );
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [scrollTop, setScrollTop] = useState(0);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  // Sync internal active style with prop if it changes
  useEffect(() => {
    if (currentStyleId) {
      setActiveStyleId(normalizeStyleId(currentStyleId));
    }
  }, [currentStyleId]);

  // Click outside listener to close dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  // Scroll target item into visible viewport during keyboard navigation
  const scrollItemIntoView = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const viewport = container.clientHeight || STYLE_PICKER_VIEWPORT_HEIGHT;
    const itemTop = index * STYLE_PICKER_ITEM_HEIGHT;
    const itemBottom = itemTop + STYLE_PICKER_ITEM_HEIGHT;

    if (itemTop < container.scrollTop) {
      container.scrollTop = itemTop;
      setScrollTop(itemTop);
    } else if (itemBottom > container.scrollTop + viewport) {
      const targetScrollTop = itemBottom - viewport;
      container.scrollTop = targetScrollTop;
      setScrollTop(targetScrollTop);
    }
  }, []);

  const handleToggleDropdown = () => {
    if (disabled || applying) return;
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      const activeIdx = PINNED_POPULAR_STYLES.findIndex(
        (p) => normalizeStyleId(p.id) === activeStyleId,
      );
      setHighlightedIndex(activeIdx >= 0 ? activeIdx : 0);
    }
  };

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setScrollTop(0);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  // Search effect with debounce (250ms)
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      // Default to pinned popular styles
      setLoading(false);
      const pinnedList: StyleItem[] = PINNED_POPULAR_STYLES.map((p) => ({
        id: p.id,
        title: p.title,
        shortTitle: p.shortTitle,
        citationFormat: p.citationFormat,
        isPinned: true,
      }));
      setResults(pinnedList);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ styles?: StyleItem[] }>(
          `/api/styles?q=${encodeURIComponent(trimmed)}&limit=50`,
        );
        startTransition(() => {
          if (res.ok && Array.isArray(res.data.styles)) {
            setResults(res.data.styles);
            setHighlightedIndex(res.data.styles.length > 0 ? 0 : -1);
          } else {
            setResults([]);
            setHighlightedIndex(-1);
          }
          setScrollTop(0);
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
          }
          setLoading(false);
        });
      } catch {
        setResults([]);
        setHighlightedIndex(-1);
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, activeStyleId]);

  // Find active style metadata
  const currentMetadata: StyleItem | undefined =
    results.find((s) => normalizeStyleId(s.id) === activeStyleId) ||
    PINNED_POPULAR_STYLES.find((p) => normalizeStyleId(p.id) === activeStyleId) || {
      id: activeStyleId,
      title: activeStyleId === "apa" ? "APA 7th edition" : activeStyleId.toUpperCase(),
      shortTitle: activeStyleId.toUpperCase(),
    };

  const handleSelectStyle = async (style: StyleItem) => {
    if (applying || disabled) return;
    setApplying(true);
    try {
      setActiveStyleId(normalizeStyleId(style.id));
      if (onStyleSelected) {
        await onStyleSelected(style);
      }
      setIsOpen(false);
      triggerBtnRef.current?.focus();
    } finally {
      setApplying(false);
    }
  };

  const isSearchActive = searchQuery.trim().length >= 2;

  // Keyboard navigation handler (combobox pattern)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      triggerBtnRef.current?.focus();
      return;
    }

    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedIndex((prev) => {
        const next = prev < results.length - 1 ? prev + 1 : prev;
        scrollItemIntoView(next);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        scrollItemIntoView(next);
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const targetIndex =
        highlightedIndex >= 0 && highlightedIndex < results.length
          ? highlightedIndex
          : 0;
      if (results[targetIndex]) {
        void handleSelectStyle(results[targetIndex]);
      }
    }
  };

  // Virtualization slice computation
  const viewportHeight =
    scrollContainerRef.current?.clientHeight || STYLE_PICKER_VIEWPORT_HEIGHT;
  const totalCount = results.length;
  const totalHeight = totalCount * STYLE_PICKER_ITEM_HEIGHT;

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / STYLE_PICKER_ITEM_HEIGHT) - STYLE_PICKER_OVERSCAN,
  );
  const endIndex = Math.min(
    totalCount - 1,
    Math.floor((scrollTop + viewportHeight) / STYLE_PICKER_ITEM_HEIGHT) +
      STYLE_PICKER_OVERSCAN,
  );

  const visibleItems = useMemo(() => {
    if (totalCount === 0) return [];
    const slice: Array<{ item: StyleItem; index: number; top: number }> = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const item = results[i];
      if (item) {
        slice.push({
          item,
          index: i,
          top: i * STYLE_PICKER_ITEM_HEIGHT,
        });
      }
    }
    return slice;
  }, [results, startIndex, endIndex, totalCount]);

  const highlightedItem =
    highlightedIndex >= 0 && results[highlightedIndex]
      ? results[highlightedIndex]
      : undefined;

  return (
    <div
      className="relative inline-block text-left"
      ref={dropdownRef}
      data-document-id={documentId}
    >
      {/* Top Bar Trigger Button */}
      <button
        ref={triggerBtnRef}
        type="button"
        disabled={disabled || applying}
        onClick={handleToggleDropdown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        title="Belgenin atıf stilini seçin veya değiştirin (APA 7, IEEE, TÜBİTAK vb.)"
        data-testid="oo-style-picker-btn"
      >
        <BookMarked size={14} className="text-blue-600" />
        <span
          className="truncate max-w-[130px] font-semibold text-slate-800"
          data-testid="oo-style-current-label"
        >
          {currentMetadata.shortTitle || currentMetadata.title}
        </span>
        {applying ? (
          <Loader2 size={12} className="animate-spin text-slate-400" />
        ) : (
          <ChevronDown size={13} className="text-slate-400" />
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="absolute left-0 mt-1.5 w-80 md:w-96 rounded-lg border border-slate-200 bg-white shadow-xl z-50 flex flex-col max-h-[460px] animate-in fade-in zoom-in-95 duration-100"
          data-testid="oo-style-picker-dropdown"
          onKeyDown={handleKeyDown}
        >
          {/* Header & Search Input */}
          <div className="p-2.5 border-b border-slate-100 space-y-2 bg-slate-50/70 rounded-t-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <BookMarked size={14} className="text-blue-600" /> Atıf Stili Seçici
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                aria-label="Kapat"
                data-testid="oo-style-picker-close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="relative flex items-center">
              <Search
                size={14}
                className="absolute left-2.5 text-slate-400 pointer-events-none"
              />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                role="combobox"
                aria-expanded={isOpen}
                aria-controls="oo-style-listbox"
                aria-activedescendant={
                  highlightedItem ? `oo-style-item-${highlightedItem.id}` : undefined
                }
                placeholder="Stil ara (en az 2 karakter, örn: ieee, apa, tübitak)..."
                className="w-full rounded border border-slate-300 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="oo-style-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600"
                  aria-label="Aramayı temizle"
                  data-testid="oo-style-search-clear"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Section label */}
          <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-medium text-slate-500 flex items-center justify-between bg-slate-50/50 shrink-0">
            <span>
              {isSearchActive
                ? "Arama Sonuçları (en fazla 50)"
                : "Sık Kullanılan Popüler Stiller"}
            </span>
            {loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
          </div>

          {/* Virtualized Style List Container */}
          <div
            ref={scrollContainerRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            tabIndex={-1}
            role="listbox"
            id="oo-style-listbox"
            aria-label="Atıf stilleri listesi"
            className="overflow-y-auto px-1.5 py-1 flex-1 text-xs focus:outline-none"
            style={{
              height: `${STYLE_PICKER_VIEWPORT_HEIGHT}px`,
              maxHeight: `${STYLE_PICKER_VIEWPORT_HEIGHT}px`,
            }}
            data-testid="oo-style-list-container"
          >
            {results.length === 0 && !loading && (
              <div className="p-4 text-center text-slate-500 space-y-1">
                <p>Eşleşen atıf stili bulunamadı.</p>
                <p className="text-[11px] text-slate-400">
                  Lütfen farklı anahtar kelimeler deneyin (örn. APA, MLA, Chicago, IEEE, Harvard).
                </p>
              </div>
            )}

            {results.length > 0 && (
              <div
                style={{
                  height: `${totalHeight}px`,
                  position: "relative",
                  width: "100%",
                }}
                data-testid="oo-style-virtual-spacer"
              >
                {visibleItems.map(({ item, index, top }) => {
                  const isSelected = normalizeStyleId(item.id) === activeStyleId;
                  const isHighlighted = index === highlightedIndex;
                  const badge = formatBadgeText(item.citationFormat);

                  return (
                    <button
                      key={item.id}
                      id={`oo-style-item-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => void handleSelectStyle(item)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      disabled={applying}
                      data-testid={`oo-style-item-${item.id}`}
                      style={{
                        position: "absolute",
                        top: `${top}px`,
                        left: 0,
                        right: 0,
                        height: `${STYLE_PICKER_ITEM_HEIGHT - 4}px`,
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded px-2.5 text-left transition ${
                        isHighlighted
                          ? "ring-1 ring-blue-400 bg-blue-50/80"
                          : isSelected
                            ? "bg-blue-50 text-blue-900 font-medium"
                            : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{item.title}</span>
                          {item.isPinned && !isSearchActive && (
                            <span title="Popüler Stil" className="inline-flex shrink-0">
                              <Sparkles size={11} className="text-amber-500" />
                            </span>
                          )}
                        </div>
                        {item.shortTitle && item.shortTitle !== item.title && (
                          <p className="text-[11px] text-slate-400 truncate">
                            {item.shortTitle}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        {badge && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {badge}
                          </span>
                        )}
                        {isSelected && (
                          <Check size={14} className="text-blue-600 font-bold" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Notice */}
          <div className="p-2 border-t border-slate-100 bg-slate-50/50 rounded-b-lg text-[11px] text-slate-500 flex items-center justify-between shrink-0">
            <span>Zotero deposundaki 10.800+ stili kapsar.</span>
            <span className="text-slate-400 font-mono">tr-TR</span>
          </div>
        </div>
      )}
    </div>
  );
}

