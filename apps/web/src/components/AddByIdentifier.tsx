import { useState, useId } from "react";
import { Sparkles, Loader2, AlertCircle, Check, BookMarked } from "lucide-react";
import { isNetworkError } from "../auth/api.js";

export interface AddByIdentifierItem {
  id: string;
  title: string;
  authors: string;
  year: string;
  doi?: string;
  itemType?: string;
  publicationTitle?: string;
  url?: string;
  /** Structured CSL names (family/given) mapped from Zotero creators or CSL authors. */
  cslAuthors?: Array<{ family?: string; given?: string; literal?: string }>;
}

export interface AddByIdentifierProps {
  apiUrl?: string;
  userId?: string;
  onItemAdded?: (item: AddByIdentifierItem, rawData: unknown) => void;
  onCiteItem?: (item: AddByIdentifierItem) => void;
  onClose?: () => void;
  className?: string;
}

export function resolveApiUrl(customUrl?: string): string {
  if (customUrl) return customUrl.replace(/\/$/, "");
  const envUrl =
    typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
  return (envUrl || "http://localhost:3001").replace(/\/$/, "");
}

export function resolveUserId(customUserId?: string): string {
  if (customUserId && customUserId !== "Yusuf Kavak") return customUserId;
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("user") || params.get("userId");
    if (fromUrl) return fromUrl;
  }
  return customUserId || "demo-user";
}

interface RawCreator {
  firstName?: string;
  lastName?: string;
  name?: string;
  creatorType?: string;
}

interface RawCslAuthor {
  literal?: string;
  given?: string;
  family?: string;
}

export function extractItemDetails(data: unknown): AddByIdentifierItem {
  const root = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const item = (root.item || (Array.isArray(root.items) ? root.items[0] : null) || root) as Record<
    string,
    unknown
  >;
  const csl = (root.csl ||
    (Array.isArray(root.cslItems) ? root.cslItems[0] : null) ||
    {}) as Record<string, unknown>;

  const id = String(
    item.id ||
      item.zoteroKey ||
      item.key ||
      `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  );
  const title = String(item.title || csl.title || "Adsız");

  // Extract authors from Zotero creators or CSL author
  let authors = "";
  if (Array.isArray(item.creators) && item.creators.length > 0) {
    authors = (item.creators as RawCreator[])
      .map((c) => {
        if (c.name) return c.name;
        if (c.firstName && c.lastName) return `${c.firstName} ${c.lastName}`;
        if (c.lastName) return c.lastName;
        return "";
      })
      .filter(Boolean)
      .join(", ");
  } else if (Array.isArray(csl.author) && csl.author.length > 0) {
    authors = (csl.author as RawCslAuthor[])
      .map((a) => {
        if (a.literal) return a.literal;
        if (a.given && a.family) return `${a.given} ${a.family}`;
        if (a.family) return a.family;
        return "";
      })
      .filter(Boolean)
      .join(", ");
  }
  let cslAuthors: Array<{ family?: string; given?: string; literal?: string }> | undefined;
  if (Array.isArray(item.creators) && item.creators.length > 0) {
    cslAuthors = (item.creators as RawCreator[])
      .filter((c) => !(c as { creatorType?: string }).creatorType || (c as { creatorType?: string }).creatorType === "author")
      .map((c) =>
        c.lastName ? { family: c.lastName, given: c.firstName || "" } : { literal: c.name || "" },
      )
      .filter((a) => a.family || a.literal);
  } else if (Array.isArray(csl.author) && csl.author.length > 0) {
    cslAuthors = (csl.author as RawCslAuthor[]).map((a) =>
      a.family ? { family: a.family, given: a.given || "" } : { literal: a.literal || "" },
    );
  }
  if (!authors) {
    authors = typeof item.authors === "string" ? item.authors : "Unknown Authors";
  }

  // Extract publication year
  let year = "";
  const issued = csl.issued as { "date-parts"?: Array<Array<number | string>> } | undefined;
  const cslYear = issued?.["date-parts"]?.[0]?.[0];
  const rawDate = item.parsedDate || item.date || cslYear;
  if (rawDate) {
    const match = String(rawDate).match(/\b(19\d\d|20\d\d)\b/);
    year = match ? match[0] : String(rawDate);
  }
  if (!year) {
    year = "n.d.";
  }

  // Extract DOI, publication, type, URL
  const doi = (item.doi || item.DOI || csl.DOI || undefined) as string | undefined;
  const publicationTitle = (item.publicationTitle || csl["container-title"] || undefined) as
    string | undefined;
  const itemType = (item.itemType || csl.type || "journalArticle") as string | undefined;
  const url = (item.url || csl.URL || undefined) as string | undefined;

  return {
    id,
    title,
    authors,
    year,
    doi,
    itemType,
    publicationTitle,
    url,
    cslAuthors,
  };
}

export function AddByIdentifier({
  apiUrl,
  userId,
  onItemAdded,
  onCiteItem,
  className = "",
}: AddByIdentifierProps) {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddByIdentifierItem | null>(null);

  const inputId = useId();

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const form =
      (e?.currentTarget as HTMLFormElement | undefined) ||
      (e?.target as HTMLFormElement | undefined);
    const formInput = form?.querySelector?.("input") as HTMLInputElement | null;
    const rawVal = identifier || formInput?.value || "";
    const trimmed = rawVal.trim();
    if (!trimmed) {
      // Empty submit does not fire a request
      return;
    }

    setIdentifier(trimmed);
    setLoading(true);
    setError(null);
    setResult(null);

    const targetApiUrl = resolveApiUrl(apiUrl);
    const targetUserId = resolveUserId(userId);

    try {
      const res = await fetch(`${targetApiUrl}/api/items/from-identifier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": targetUserId,
        },
        body: JSON.stringify({ identifier: trimmed }),
      });

      if (!res.ok) {
        let errorMessage = `Sunucu hatası (${res.status})`;
        try {
          const errorJson = (await res.json()) as Record<string, unknown>;
          if (res.status === 502) {
            errorMessage = errorJson.message
              ? `translation-server hatası (502): ${String(errorJson.message)}`
              : "translation-server hatası (502): Kaynak servisine ulaşılamadı";
          } else if (errorJson.message || errorJson.error) {
            errorMessage = String(errorJson.message || errorJson.error);
          }
        } catch {
          if (res.status === 502) {
            errorMessage = "translation-server hatası (502): Kaynak servisine ulaşılamadı";
          } else {
            errorMessage = `Sunucu hatası (${res.status}): ${res.statusText || "İstek başarısız oldu"}`;
          }
        }
        setError(errorMessage);
        setLoading(false);
        return;
      }

      const data = (await res.json()) as Record<string, unknown>;
      const parsedItem = extractItemDetails(data);
      setResult(parsedItem);
      setLoading(false);

      if (onItemAdded) {
        onItemAdded(parsedItem, data);
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        setError("Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`CiteDocs API bağlantı hatası: ${msg}`);
      }
      setLoading(false);
    }
  };

  return (
    <div className={`p-4 flex flex-col space-y-4 ${className}`} data-testid="add-by-identifier">
      <div>
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-gray-700 uppercase tracking-wide"
        >
          Tanımlayıcı ile Kaynak Ekle
        </label>
        <p className="text-xs text-gray-500 mt-0.5">
          Kişisel kitaplığınıza aktarmak ve saklamak için bir DOI, ISBN, PMID, arXiv ID veya bağlantı yapıştırın.
        </p>
      </div>

      <form onSubmit={handleSubmit} data-testid="identifier-form" className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              id={inputId}
              type="text"
              autoFocus
              disabled={loading}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Örn: 10.1038/s41586-021-03392-y veya 978-0-12-345678-9"
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50 font-mono text-gray-800 placeholder:font-sans placeholder:text-gray-400"
              data-testid="identifier-input"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !identifier.trim()}
            data-testid="identifier-submit"
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white px-3.5 py-2 rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>İçe aktarılıyor...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>İçe Aktar</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Loading state indicator */}
      {loading && (
        <div
          data-testid="identifier-loading"
          className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-md text-blue-700 text-xs animate-pulse"
        >
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span>Tanımlayıcı çeviri sunucusu üzerinden çözümleniyor...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          data-testid="identifier-error"
          role="alert"
          className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs"
        >
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-900">Kaynak içe aktarılamadı</p>
            <p className="mt-0.5 text-red-700 break-words">{error}</p>
          </div>
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div
          data-testid="identifier-result"
          className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3.5 shadow-sm text-left flex flex-col space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3 text-emerald-700" /> Kişisel Kitaplığa Kaydedildi
            </span>
            {result.doi && (
              <span
                data-testid="result-doi"
                className="text-[11px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 truncate max-w-[200px]"
                title={result.doi}
              >
                DOI: {result.doi}
              </span>
            )}
          </div>

          <div>
            <h4 data-testid="result-title" className="text-sm font-bold text-gray-900 leading-snug">
              {result.title}
            </h4>
            <p data-testid="result-authors" className="text-xs font-medium text-gray-700 mt-1">
              {result.authors}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span
              data-testid="result-year"
              className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-medium text-gray-800"
            >
              {result.year}
            </span>
            {result.publicationTitle && (
              <span className="italic text-gray-600 truncate max-w-[220px]">
                {result.publicationTitle}
              </span>
            )}
          </div>

          <div className="pt-2 border-t border-emerald-200/70 flex items-center justify-between">
            {onCiteItem && (
              <button
                type="button"
                data-testid="btn-cite-result"
                onClick={() => onCiteItem(result)}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-sm transition-colors cursor-pointer"
              >
                <BookMarked className="w-3.5 h-3.5" />
                <span>Belgeye Atıf Yap</span>
              </button>
            )}
            <button
              type="button"
              data-testid="btn-add-another"
              onClick={() => {
                setIdentifier("");
                setResult(null);
                setError(null);
              }}
              className="text-xs text-emerald-800 hover:text-emerald-950 font-medium underline cursor-pointer ml-auto"
            >
              Başka tanımlayıcı ekle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
