import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookPlus,
  Loader2,
  Link2,
  CheckCircle2,
  X,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { getApiBaseUrl, getCsrfToken } from "../auth/api.js";
import { getDocumentLanguage } from "../documents/i18n.js";
import { openZoteroPanel } from "./zoteroPanel.js";
import { OdtNoticeBanner } from "./OdtNoticeBanner.js";
import { StylePicker, type StyleItem } from "./StylePicker.js";
import { applyStyleInOnlyoffice, syncZoteroPluginStorage } from "./editorStyleBridge.js";
import { DEFAULT_STYLE_ID, DEFAULT_LOCALE, normalizeStyleId } from "@citedocs/shared";
import { ImportReferences } from "../components/ImportReferences.js";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, cfg: Record<string, unknown>) => { destroyEditor?: () => void };
    };
  }
}

export interface OnlyofficeEditorPageProps {
  documentId: string;
  documentTitle: string;
  onBackToDocuments: () => void;
}

interface PluginCreds {
  linked: boolean;
  zoteroUserId?: string | null;
  apiKey?: string;
  oauthAvailable?: boolean;
}

export interface AddedCiteItem {
  key?: string;
  title: string;
  authors?: string;
  year?: string;
  doi?: string;
  itemType?: string;
}

const PENDING_ADD = "citedocs.pendingZoteroAdd";

/** localStorage keys used by the official ONLYOFFICE Zotero plugin (same origin as /oo). */

const ZK_USER = "zoteroUserId";
const ZK_KEY = "zoteroApiKey";

async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T }> {
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
  return { ok: res.ok, status: res.status, data };
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.DocsAPI) return resolve();
    if (typeof window !== "undefined" && (window as unknown as { happyDOM?: unknown }).happyDOM) {
      return resolve();
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("ONLYOFFICE yüklenemedi"));
    document.head.appendChild(s);
  });
}

function extractItemPreview(raw: Record<string, unknown> | undefined): {
  title: string;
  authors?: string;
  year?: string;
  doi?: string;
  itemType?: string;
} {
  if (!raw) return { title: "İsimsiz Kaynak" };
  const title = String(raw.title || "İsimsiz Kaynak");
  let authors: string | undefined;
  if (Array.isArray(raw.creators) && raw.creators.length > 0) {
    authors = (raw.creators as Array<{ firstName?: string; lastName?: string; name?: string }>)
      .map((c) => (c.name ? c.name : [c.firstName, c.lastName].filter(Boolean).join(" ")))
      .filter(Boolean)
      .join(", ");
  }
  let year: string | undefined;
  const rawDate = raw.date || raw.parsedDate;
  if (rawDate) {
    const m = String(rawDate).match(/\b(19\d\d|20\d\d)\b/);
    year = m ? m[0] : String(rawDate);
  }
  const doi = raw.DOI || raw.doi ? String(raw.DOI || raw.doi) : undefined;
  const itemType = raw.itemType ? String(raw.itemType) : undefined;
  return { title, authors, year, doi, itemType };
}

export function OnlyofficeEditorPage({
  documentId,
  documentTitle,
  onBackToDocuments,
}: OnlyofficeEditorPageProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lang = getDocumentLanguage();
  const zoteroLabel = lang === "tr" ? "Zotero panelini aç" : "Open Zotero panel";
  const [documentReady, setDocumentReady] = useState(false);
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<PluginCreds | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [panelIdentifier, setPanelIdentifier] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<AddedCiteItem[]>([]);
  const [lastAdded, setLastAdded] = useState<AddedCiteItem | null>(null);
  const [currentStyle, setCurrentStyle] = useState<string>(DEFAULT_STYLE_ID);

  // Fetch current document style from Zotero preferences
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ style?: string | null; prefs?: { locale?: string } | null }>(
          `/api/documents/${encodeURIComponent(documentId)}/citations`,
        );
        if (!cancelled && res.ok && res.data) {
          const resolvedStyle = normalizeStyleId(res.data.style || DEFAULT_STYLE_ID);
          const resolvedLocale = res.data.prefs?.locale || DEFAULT_LOCALE;
          setCurrentStyle(resolvedStyle);
          syncZoteroPluginStorage(resolvedStyle, resolvedLocale);
        } else if (!cancelled) {
          syncZoteroPluginStorage(DEFAULT_STYLE_ID, DEFAULT_LOCALE);
        }
      } catch {
        /* fallback to default apa */
        if (!cancelled) {
          syncZoteroPluginStorage(DEFAULT_STYLE_ID, DEFAULT_LOCALE);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const handleStyleChange = useCallback(
    async (style: StyleItem) => {
      try {
        const targetStyleId = normalizeStyleId(style.id);

        // 1. In-editor ONLYOFFICE bridge (custom properties, plugin storage, plugin refresh)
        applyStyleInOnlyoffice(
          editorContainerRef.current,
          editorRef.current,
          targetStyleId,
          DEFAULT_LOCALE,
        );

        // 2. Server-side update for docProps/custom.xml
        const r = await api<{ ok?: boolean; error?: string }>(
          `/api/documents/${encodeURIComponent(documentId)}/style`,
          {
            method: "PUT",
            body: JSON.stringify({ styleId: targetStyleId, locale: DEFAULT_LOCALE }),
          },
        );

        if (r.ok) {
          setCurrentStyle(targetStyleId);
          setNotice({
            ok: true,
            text: `Atıf stili güncellendi: “${style.title}”.`,
          });
        } else {
          setNotice({
            ok: false,
            text: `Atıf stili sunucuda güncellenemedi: ${r.data.error || "Bilinmeyen hata"}.`,
          });
        }
      } catch {
        setNotice({
          ok: false,
          text: "Atıf stili güncellenirken bir hata oluştu.",
        });
      }
    },
    [documentId],
  );

  const syncPluginCredentials = useCallback(async () => {
    const r = await api<PluginCreds>("/api/zotero/plugin-credentials").catch(() => ({
      ok: false,
      status: 0,
      data: { linked: false } as PluginCreds,
    }));
    if (r.status === 401) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        const back = window.location.pathname + window.location.search;
        window.location.href = `/login?returnTo=${encodeURIComponent(back)}`;
      }
      return { linked: false };
    }
    const c = r.ok ? r.data : { linked: false };
    try {
      if (c.linked && c.apiKey && c.zoteroUserId) {
        localStorage.setItem(ZK_USER, String(c.zoteroUserId));
        localStorage.setItem(ZK_KEY, c.apiKey);
      } else {
        localStorage.removeItem(ZK_USER);
        localStorage.removeItem(ZK_KEY);
      }
      // Ensure plugin storage defaults (APA 7, tr-TR or active document style) are in place before editor starts
      syncZoteroPluginStorage(currentStyle || DEFAULT_STYLE_ID, DEFAULT_LOCALE);
    } catch {
      /* storage blocked */
    }
    setCreds({ linked: c.linked, zoteroUserId: c.zoteroUserId, oauthAvailable: c.oauthAvailable });
    return c;
  }, [currentStyle]);

  // Check URL query parameters for OAuth returns (e.g. ?zotero=connected / denied / error / not_configured or zotero_error)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const zoteroStatus = params.get("zotero");
    const zoteroError = params.get("zotero_error");

    if (zoteroError) {
      setNotice({
        ok: false,
        text: decodeURIComponent(zoteroError),
      });
      if (zoteroStatus === "connected") {
        void syncPluginCredentials();
      }
    } else if (zoteroStatus === "connected") {
      setNotice({
        ok: true,
        text: "Zotero hesabı başarıyla bağlandı! Artık kütüphanene kaynak ekleyebilir ve ONLYOFFICE eklentisiyle atıf yapabilirsin.",
      });
      void syncPluginCredentials();
    } else if (zoteroStatus === "denied") {
      setNotice({
        ok: false,
        text: "Zotero bağlantı isteği iptal edildi veya izin verilmedi.",
      });
    } else if (zoteroStatus === "not_configured") {
      setNotice({
        ok: false,
        text: "Zotero OAuth bağlantısı sunucuda yapılandırılmamış. Lütfen daha sonra tekrar deneyin.",
      });
    } else if (zoteroStatus === "error") {
      setNotice({
        ok: false,
        text: "Zotero bağlantısı kurulamadı. Lütfen tekrar deneyin.",
      });
    }

    if (zoteroStatus || zoteroError) {
      params.delete("zotero");
      params.delete("zotero_error");
      const rest = params.toString();
      const newUrl = `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, [syncPluginCredentials]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setDocumentReady(false);
      setError(null);
      try {
        await syncPluginCredentials();
        const r = await api<{
          documentServerUrl: string;
          config: Record<string, unknown>;
          error?: string;
        }>(`/api/documents/${encodeURIComponent(documentId)}/onlyoffice-config`);
        if (!r.ok) throw new Error(r.data.error || `HTTP ${r.status}`);
        await loadScript(`${r.data.documentServerUrl}/web-apps/apps/api/documents/api.js`);
        if (cancelled || !window.DocsAPI) return;
        editorRef.current?.destroyEditor?.();
        editorRef.current = new window.DocsAPI.DocEditor("oo-editor", {
          ...r.data.config,
          width: "100%",
          height: "100%",
          type: "desktop",
          events: {
            onAppReady: () => {
              setStatus("ready");
              (window as unknown as { __ooReady?: boolean }).__ooReady = true;
            },
            onDocumentReady: () => {
              if (!cancelled) {
                setDocumentReady(true);
                try {
                  applyStyleInOnlyoffice(
                    editorContainerRef.current,
                    editorRef.current,
                    currentStyle || DEFAULT_STYLE_ID,
                    DEFAULT_LOCALE,
                  );
                } catch {
                  /* ignore */
                }
              }
            },
            onError: (e: { data?: { errorDescription?: string } }) => {
              setDocumentReady(false);
              setStatus("error");
              setError(e?.data?.errorDescription || "Editör hatası");
            },
          },
        });
      } catch (e: unknown) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      editorRef.current?.destroyEditor?.();
      editorRef.current = null;
    };
  }, [documentId, syncPluginCredentials]);

  useEffect(() => {
    document.title = `${documentTitle} – CiteDocs`;
  }, [documentTitle]);

  const connectZotero = (pendingIdentifier = identifier) => {
    // Only treat OAuth as unavailable when creds is loaded AND oauthAvailable === false explicitly
    if (creds !== null && creds.oauthAvailable === false) {
      setNotice({
        ok: false,
        text: "Zotero OAuth bağlantısı yapılandırılmamış. Lütfen sistem yöneticisiyle iletişime geçin.",
      });
      return;
    }
    try {
      sessionStorage.setItem(
        PENDING_ADD,
        JSON.stringify({ documentId, identifier: pendingIdentifier }),
      );
    } catch {
      setNotice({
        ok: false,
        text: "Tanımlayıcı saklanamadı. Lütfen tarayıcınızda oturum depolamasına izin verip tekrar deneyin.",
      });
      return;
    }
    const back = window.location.pathname + window.location.search;
    window.location.href = `${getApiBaseUrl()}/api/zotero/oauth/start?returnTo=${encodeURIComponent(back)}`;
  };

  const performAdd = useCallback(
    async (rawIdentifier: string): Promise<boolean> => {
      const id = rawIdentifier.trim();
      if (!id) return false;
      if (!creds?.linked) {
        setNotice({
          ok: false,
          text: "Kaynağı kütüphanene eklemek için Zotero’yu bağla düğmesini kullan.",
        });
        setIsPanelOpen(true);
        return false;
      }
      setAdding(true);
      setNotice(null);
      try {
        const r = await api<{
          saved?: boolean;
          item?: Record<string, unknown>;
          key?: string;
          error?: string;
        }>("/api/zotero/add-by-identifier", {
          method: "POST",
          body: JSON.stringify({ identifier: id }),
        });
        if (r.ok && r.data.saved) {
          const preview = extractItemPreview(r.data.item);
          const added: AddedCiteItem = { ...preview, key: r.data.key };
          setLastAdded(added);
          setRecentItems((prev) => [added, ...prev.filter((p) => p.key !== added.key)]);
          setNotice({
            ok: true,
            text: `Zotero kütüphanene eklendi: “${preview.title}”. ONLYOFFICE Zotero panelinde aratıp atıf ekleyebilirsin.`,
          });
          return true;
        } else {
          setNotice({
            ok: false,
            text: "Kaynak eklenemedi. Tanımlayıcıyı ve Zotero bağlantınızı kontrol edip tekrar deneyin.",
          });
          return false;
        }
      } catch {
        setNotice({
          ok: false,
          text: "Kaynak eklenemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.",
        });
        return false;
      } finally {
        setAdding(false);
      }
    },
    [creds?.linked],
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_ADD);
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (pending.documentId !== documentId || typeof pending.identifier !== "string") return;
      setIdentifier(pending.identifier);
      if (!creds?.linked) return;
      // Consume before the request: rerenders/StrictMode and failures must never retry it.
      sessionStorage.removeItem(PENDING_ADD);
      void performAdd(pending.identifier).then((ok) => {
        if (ok) setIdentifier("");
      });
    } catch {
      // Unavailable storage or malformed data must not prevent opening the editor.
    }
  }, [documentId, creds?.linked, performAdd]);

  const addByIdentifier = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await performAdd(identifier);
    if (ok) setIdentifier("");
  };

  const addFromPanel = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await performAdd(panelIdentifier);
    if (ok) setPanelIdentifier("");
  };

  return (
    <div className="flex h-screen w-full flex-col bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-sm">
        <button
          type="button"
          onClick={onBackToDocuments}
          className="flex items-center gap-1 rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
          data-testid="oo-back"
        >
          <ArrowLeft size={16} /> Belgelerim
        </button>
        <span className="truncate font-medium text-slate-800" title={documentTitle}>
          {documentTitle}
        </span>

        {/* 1-click Zotero header button */}
        <button
          type="button"
          disabled={!documentReady || status === "error"}
          title={zoteroLabel}
          aria-label={zoteroLabel}
          data-testid="oo-zotero-open"
          className="flex items-center gap-1.5 rounded bg-red-700 px-4 py-1.5 font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          onClick={() => {
            if (openZoteroPanel(editorContainerRef.current, editorRef.current)) {
              setNotice(null);
            } else {
              setNotice({
                ok: false,
                text:
                  lang === "tr"
                    ? "Zotero paneli açılamadı. Editörün Eklentiler sekmesinden Zotero’yu açmayı deneyin."
                    : "Could not open Zotero. Try opening Zotero from the editor’s Plugins tab.",
              });
            }
          }}
        >
          <BookOpen size={16} /> Zotero
        </button>

        {/* Quick cite panel toggle */}
        <button
          type="button"
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className={`flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition ${
            isPanelOpen
              ? "border-blue-600 bg-blue-50 text-blue-700"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
          data-testid="oo-panel-toggle"
          title="Atıf & Kaynak Ekleme Panelini Aç/Kapat"
        >
          <BookPlus size={14} className={isPanelOpen ? "text-blue-600" : "text-slate-500"} />
          <span>Kaynak Paneli</span>
        </button>

        {/* CiteDocs citation style picker */}
        <StylePicker
          documentId={documentId}
          currentStyleId={currentStyle}
          onStyleSelected={handleStyleChange}
          disabled={status === "error"}
        />

        {/* Header identifier and Zotero connection form */}
        <form
          onSubmit={addByIdentifier}
          className="ml-auto flex items-center gap-1"
          data-testid="oo-add-form"
        >
          <BookPlus size={16} className="text-slate-500" />
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="DOI, ISBN, PMID veya URL ile ekle"
            className="w-72 rounded border border-slate-300 px-2 py-1 text-sm"
            data-testid="oo-add-input"
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
            data-testid="oo-add-submit"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : "Ekle"}
          </button>
          {creds?.linked ? (
            <span
              className="flex items-center gap-1 text-emerald-700"
              data-testid="oo-zotero-linked"
              title={creds.zoteroUserId ? `Zotero ID: ${creds.zoteroUserId}` : "Zotero bağlı"}
            >
              <CheckCircle2 size={16} /> Zotero bağlı
            </span>
          ) : (
            <button
              type="button"
              onClick={() => connectZotero()}
              className="flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50"
              data-testid="oo-zotero-connect"
            >
              <Link2 size={14} /> Zotero'yu bağla
            </button>
          )}
          {creds && !creds.linked && (
            <span className="text-xs text-slate-600">
              Kaynak eklemek için Zotero hesabını bağla; tanımlayıcın korunur.
            </span>
          )}
        </form>
      </header>

      {notice && (
        <div
          className={`flex items-center justify-between px-3 py-1.5 text-sm ${
            notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}
          data-testid="oo-notice"
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-2 text-slate-500 hover:text-slate-800"
            aria-label="Kapat"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 px-3 py-1 text-sm text-red-700" data-testid="oo-error">
          {error}
        </div>
      )}

      <OdtNoticeBanner documentId={documentId} documentTitle={documentTitle} />

      <div className="relative flex flex-1 overflow-hidden">
        {/* Editor canvas */}
        <div ref={editorContainerRef} className="relative flex-1 h-full">
          {status === "loading" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-slate-500">
              <Loader2 className="mr-2 animate-spin" /> Editör yükleniyor…
            </div>
          )}
          <div id="oo-editor" className="h-full w-full" />
        </div>

        {/* Dedicated citation / add-by-identifier side panel */}
        {isPanelOpen && (
          <aside
            data-testid="oo-cite-panel"
            className="flex h-full w-80 md:w-96 flex-col border-l border-slate-200 bg-slate-50 shadow-xl z-20"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <BookPlus size={18} className="text-blue-600" />
                <h3 className="font-semibold text-slate-800 text-sm">Kaynak & Atıf Paneli</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                data-testid="oo-panel-close"
                title="Paneli kapat"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Zotero connection status card */}
              {!creds?.linked ? (
                <div
                  className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
                  data-testid="oo-panel-unlinked-card"
                >
                  <p className="font-semibold mb-1 flex items-center gap-1">
                    <Link2 size={14} /> Zotero Hesabı Bağlı Değil
                  </p>
                  <p className="text-amber-800 mb-3 leading-relaxed">
                    Kaynakların kütüphanene eklenmesi ve ONLYOFFICE Zotero eklentisinde belgene atıf
                    yapabilmen için Zotero hesabını bağlamalısın.
                  </p>
                  <button
                    type="button"
                    onClick={() => connectZotero(panelIdentifier || identifier)}
                    className="w-full flex items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 shadow-sm"
                    data-testid="oo-panel-connect"
                  >
                    <Link2 size={14} /> Zotero ile Bağlan (Otomatik OAuth)
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-900 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Zotero kütüphanesine doğrudan bağlanıldı</span>
                  </div>
                </div>
              )}

              {/* Add form */}
              <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm space-y-3">
                <label className="block text-xs font-medium text-slate-700">
                  Tanımlayıcı ile Kaynak Ekle:
                </label>
                <form onSubmit={addFromPanel} className="space-y-2">
                  <input
                    value={panelIdentifier}
                    onChange={(e) => setPanelIdentifier(e.target.value)}
                    placeholder="DOI, ISBN, PMID veya URL yapıştırın"
                    className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    data-testid="oo-panel-input"
                  />
                  <button
                    type="submit"
                    disabled={adding || !panelIdentifier.trim()}
                    className="w-full flex items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition"
                    data-testid="oo-panel-submit"
                  >
                    {adding ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Ekleniyor…
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Kütüphaneme Ekle
                      </>
                    )}
                  </button>
                </form>

                {/* Format examples */}
                <div className="text-[11px] text-slate-500 space-y-1 pt-1 border-t border-slate-100">
                  <p className="font-medium text-slate-600">Desteklenen Formatlar:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                    <li>
                      <span className="font-mono text-slate-700">DOI:</span>{" "}
                      10.1038/s41586-021-03392-y
                    </li>
                    <li>
                      <span className="font-mono text-slate-700">PMID:</span> 33692543
                    </li>
                    <li>
                      <span className="font-mono text-slate-700">ISBN:</span> 9780134685991
                    </li>
                    <li>
                      <span className="font-mono text-slate-700">URL:</span> https://nature.com/...
                    </li>
                  </ul>
                </div>
              </div>

              {/* File or pasted text reference import */}
              <ImportReferences
                documentId={documentId}
                linked={creds?.linked}
                apiUrl={getApiBaseUrl()}
                onConnectZotero={() => connectZotero(panelIdentifier || identifier)}
                onItemsImported={(items) => {
                  if (items.length > 0) {
                    const first = items[0];
                    const added: AddedCiteItem = {
                      title: first.title,
                      authors: first.authors,
                      year: first.year,
                      doi: first.doi,
                      itemType: first.itemType,
                      key: first.key,
                    };
                    setLastAdded(added);
                    setRecentItems((prev) => [
                      ...items.map((i) => ({
                        title: i.title,
                        authors: i.authors,
                        year: i.year,
                        doi: i.doi,
                        itemType: i.itemType,
                        key: i.key,
                      })),
                      ...prev.filter((p) => !items.some((it) => it.key && it.key === p.key)),
                    ]);
                    setNotice({
                      ok: true,
                      text: `${items.length} kaynak Zotero kütüphanene eklendi. ONLYOFFICE Zotero panelinde aratıp atıf ekleyebilirsin.`,
                    });
                  }
                }}
              />

              {/* Last added item card */}
              {lastAdded && (
                <div
                  className="rounded-lg border border-emerald-300 bg-emerald-50/50 p-3 shadow-sm text-xs space-y-1.5"
                  data-testid="oo-last-added-card"
                >
                  <div className="flex items-center gap-1 text-emerald-800 font-semibold">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Zotero Kütüphanene Kaydedildi</span>
                  </div>
                  <p className="font-medium text-slate-900 leading-snug">{lastAdded.title}</p>
                  {lastAdded.authors && <p className="text-slate-600">{lastAdded.authors}</p>}
                  <div className="flex flex-wrap gap-1 text-[11px] text-slate-500 pt-1">
                    {lastAdded.year && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{lastAdded.year}</span>
                    )}
                    {lastAdded.doi && (
                      <span className="rounded bg-blue-50 text-blue-700 px-1.5 py-0.5">
                        DOI: {lastAdded.doi}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-emerald-700 pt-1 border-t border-emerald-100">
                    💡 ONLYOFFICE Zotero eklentisini açıp aratarak doğrudan metnine ekleyebilirsin.
                  </p>
                </div>
              )}

              {/* Session recent items list */}
              {recentItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <BookOpen size={13} /> Bu Oturumda Eklenen Kaynaklar ({recentItems.length})
                  </h4>
                  <div className="space-y-1.5">
                    {recentItems.map((item, idx) => (
                      <div
                        key={item.key || idx}
                        className="rounded border border-slate-200 bg-white p-2 text-xs shadow-2xs hover:border-slate-300 transition"
                      >
                        <p className="font-medium text-slate-800 line-clamp-2 leading-snug">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {item.authors || "Bilinmeyen yazar"} {item.year ? `(${item.year})` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
