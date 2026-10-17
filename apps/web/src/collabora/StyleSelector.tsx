import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, Search, Sparkles, Loader2, BookOpen } from "lucide-react";
import { POPULAR_STYLES, CollaboraCSLEngine } from "@citedocs/collabora-cite";

export interface StyleSelectorProps {
  currentStyleId: string;
  onStyleChange: (styleId: string, styleXml?: string) => Promise<void> | void;
  apiUrl?: string;
  disabled?: boolean;
}

interface CslStyleSearchResult {
  id: string;
  title: string;
  shortTitle?: string;
  citationFormat?: string;
}

export function StyleSelector({
  currentStyleId,
  onStyleChange,
  apiUrl = "http://localhost:3000",
  disabled = false,
}: StyleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CslStyleSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [changingStyle, setChangingStyle] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Find active style metadata
  const currentMeta =
    POPULAR_STYLES.find(
      (s) => s.id.toLowerCase() === currentStyleId.toLowerCase() || s.name.toLowerCase() === currentStyleId.toLowerCase(),
    ) || {
      id: currentStyleId,
      name: currentStyleId.toUpperCase(),
      shortTitle: currentStyleId,
      category: "author-date",
      description: "Custom Citation Style",
    };

  // Search CSL repository via API
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/csl/styles?q=${encodeURIComponent(searchQuery.trim())}`);
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as CslStyleSearchResult[];
        if (active) {
          setSearchResults(Array.isArray(data) ? data : []);
          setSearching(false);
        }
      } catch {
        if (active) {
          // Fallback filter over popular styles
          const q = searchQuery.toLowerCase();
          const fallback = POPULAR_STYLES.filter(
            (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
          ).map((s) => ({
            id: s.id,
            title: s.name,
            shortTitle: s.shortTitle,
            citationFormat: s.category,
          }));
          setSearchResults(fallback);
          setSearching(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, apiUrl]);

  const handleSelectStyle = async (styleId: string) => {
    setChangingStyle(true);
    try {
      let xml: string | undefined;
      // If not among bundled popular styles, fetch the full CSL XML from the API
      const isBundled = POPULAR_STYLES.some((s) => s.id === styleId);
      if (!isBundled) {
        try {
          const res = await fetch(`${apiUrl}/api/csl/styles/${encodeURIComponent(styleId)}`);
          if (res.ok) {
            const data = (await res.json()) as { xml?: string };
            if (data?.xml) {
              xml = data.xml;
              CollaboraCSLEngine.registerStyle(styleId, xml);
            }
          }
        } catch {
          // ignore error and proceed
        }
      }

      await onStyleChange(styleId, xml);
      setIsOpen(false);
      setSearchQuery("");
    } finally {
      setChangingStyle(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef} data-testid="csl-style-selector">
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled || changingStyle}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-all cursor-pointer shadow-2xs ${
          isOpen
            ? "bg-blue-50 text-blue-800 border-blue-300 ring-2 ring-blue-100"
            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        title={`Mevcut Atıf Stili: ${currentMeta.name}`}
        data-testid="csl-style-selector-btn"
      >
        {changingStyle ? (
          <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
        ) : (
          <BookOpen className="w-3.5 h-3.5 text-blue-600" />
        )}
        <span className="font-semibold text-slate-800">{currentMeta.shortTitle || currentMeta.name}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Popover / Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-1.5 w-80 rounded-xl bg-white shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          data-testid="csl-style-dropdown"
        >
          {/* Header & Search */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Atıf Stili
              </span>
              <span className="text-[10px] text-slate-400">CSL Uyumlu</span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Stil ara (örn. Nature, ACM, Oxford)..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg placeholder-slate-400 text-slate-800 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                autoFocus
                data-testid="csl-style-search-input"
              />
              {searching && (
                <Loader2 className="w-3.5 h-3.5 text-blue-600 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin" />
              )}
            </div>
          </div>

          {/* List of Styles */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 p-1">
            {searchQuery.trim().length > 0 ? (
              // Search Results
              searchResults.length > 0 ? (
                <div>
                  <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Arama Sonuçları ({searchResults.length})
                  </div>
                  {searchResults.map((style) => {
                    const isSelected =
                      style.id.toLowerCase() === currentStyleId.toLowerCase();
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => handleSelectStyle(style.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start justify-between gap-2 hover:bg-blue-50/80 transition-colors cursor-pointer ${
                          isSelected ? "bg-blue-50 text-blue-900" : "text-slate-800"
                        }`}
                        data-testid={`csl-style-option-${style.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-800 truncate">
                            {style.title}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-slate-500">{style.id}</span>
                            {style.citationFormat && (
                              <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[9px]">
                                {style.citationFormat}
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
              ) : !searching ? (
                <div className="px-3 py-6 text-center text-xs text-slate-400">
                  &ldquo;{searchQuery}&rdquo; için stil bulunamadı.
                </div>
              ) : null
            ) : (
              // Popular Styles
              <div>
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Popüler Stiller
                </div>
                {POPULAR_STYLES.map((style) => {
                  const isSelected =
                    style.id.toLowerCase() === currentStyleId.toLowerCase() ||
                    style.name.toLowerCase() === currentStyleId.toLowerCase();
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => handleSelectStyle(style.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start justify-between gap-2 hover:bg-blue-50/80 transition-colors cursor-pointer ${
                        isSelected ? "bg-blue-50 text-blue-900" : "text-slate-800"
                      }`}
                      data-testid={`csl-style-option-${style.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {style.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500 text-[9px] uppercase tracking-wider font-semibold">
                            {style.category}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {style.description}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
            <span>Resmi CSL Stil Deposu</span>
            <span>citeproc-js</span>
          </div>
        </div>
      )}
    </div>
  );
}
