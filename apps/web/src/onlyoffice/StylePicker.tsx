import { useState, useEffect, useRef, useTransition } from "react";
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
  const [results, setResults] = useState<StyleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [activeStyleId, setActiveStyleId] = useState<string>(
    normalizeStyleId(currentStyleId || DEFAULT_STYLE_ID),
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
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
      setResults(
        PINNED_POPULAR_STYLES.map((p) => ({
          id: p.id,
          title: p.title,
          shortTitle: p.shortTitle,
          citationFormat: p.citationFormat,
          isPinned: true,
        })),
      );
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
          } else {
            setResults([]);
          }
          setLoading(false);
        });
      } catch {
        setResults([]);
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen]);

  // Find active style metadata
  const currentMetadata: StyleItem | undefined =
    results.find((s) => s.id === activeStyleId) ||
    PINNED_POPULAR_STYLES.find((p) => p.id === activeStyleId) || {
      id: activeStyleId,
      title: activeStyleId === "apa" ? "APA 7th edition" : activeStyleId.toUpperCase(),
      shortTitle: activeStyleId.toUpperCase(),
    };

  const handleSelectStyle = async (style: StyleItem) => {
    if (applying || disabled) return;
    setApplying(true);
    try {
      setActiveStyleId(style.id);
      if (onStyleSelected) {
        await onStyleSelected(style);
      }
      setIsOpen(false);
    } finally {
      setApplying(false);
    }
  };

  const isSearchActive = searchQuery.trim().length >= 2;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef} data-document-id={documentId}>
      {/* Top Bar Trigger Button */}
      <button
        type="button"
        disabled={disabled || applying}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        title="Belgenin atıf stilini seçin veya değiştirin (APA 7, IEEE, TÜBİTAK vb.)"
        data-testid="oo-style-picker-btn"
      >
        <BookMarked size={14} className="text-blue-600" />
        <span className="truncate max-w-[130px] font-semibold text-slate-800" data-testid="oo-style-current-label">
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
              >
                <X size={14} />
              </button>
            </div>

            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Stil ara (en az 2 karakter, örn: ieee, apa, tübitak)..."
                className="w-full rounded border border-slate-300 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="oo-style-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Style List */}
          <div className="overflow-y-auto p-1.5 space-y-1 flex-1 text-xs">
            {/* Section label */}
            <div className="px-2 py-1 text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>{isSearchActive ? "Arama Sonuçları (en fazla 50)" : "Sık Kullanılan Popüler Stiller"}</span>
              {loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
            </div>

            {results.length === 0 && !loading && (
              <div className="p-4 text-center text-slate-500 space-y-1">
                <p>Eşleşen atıf stili bulunamadı.</p>
                <p className="text-[11px] text-slate-400">
                  Lütfen farklı anahtar kelimeler deneyin (örn. APA, MLA, Chicago, IEEE, Harvard).
                </p>
              </div>
            )}

            {results.map((style) => {
              const isSelected = style.id === activeStyleId;
              const badge = formatBadgeText(style.citationFormat);

              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => handleSelectStyle(style)}
                  disabled={applying}
                  data-testid={`oo-style-item-${style.id}`}
                  className={`w-full flex items-start justify-between gap-2 rounded px-2.5 py-1.5 text-left transition ${
                    isSelected
                      ? "bg-blue-50 text-blue-900 font-medium"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{style.title}</span>
                      {style.isPinned && !isSearchActive && (
                        <span title="Popüler Stil" className="inline-flex shrink-0">
                          <Sparkles size={11} className="text-amber-500" />
                        </span>
                      )}
                    </div>
                    {style.shortTitle && style.shortTitle !== style.title && (
                      <p className="text-[11px] text-slate-400 truncate">{style.shortTitle}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    {badge && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {badge}
                      </span>
                    )}
                    {isSelected && <Check size={14} className="text-blue-600 font-bold" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer Notice */}
          <div className="p-2 border-t border-slate-100 bg-slate-50/50 rounded-b-lg text-[11px] text-slate-500 flex items-center justify-between">
            <span>Zotero deposundaki 10.800+ stili kapsar.</span>
            <span className="text-slate-400 font-mono">tr-TR</span>
          </div>
        </div>
      )}
    </div>
  );
}
