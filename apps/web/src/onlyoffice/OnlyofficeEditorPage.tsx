import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookPlus, Loader2, Link2, CheckCircle2, BookOpen } from "lucide-react";
import { getApiBaseUrl, getCsrfToken } from "../auth/api.js";

import { getDocumentLanguage } from "../documents/i18n.js";
import { openZoteroPanel } from "./zoteroPanel.js";

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
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("ONLYOFFICE yüklenemedi"));
    document.head.appendChild(s);
  });
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
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const syncPluginCredentials = useCallback(async () => {
    const r = await api<PluginCreds>("/api/zotero/plugin-credentials").catch(() => ({
      ok: false,
      data: { linked: false } as PluginCreds,
    }));
    const c = r.ok ? r.data : { linked: false };
    try {
      if (c.linked && c.apiKey && c.zoteroUserId) {
        localStorage.setItem(ZK_USER, String(c.zoteroUserId));
        localStorage.setItem(ZK_KEY, c.apiKey);
      } else {
        localStorage.removeItem(ZK_USER);
        localStorage.removeItem(ZK_KEY);
      }
    } catch {
      /* storage blocked */
    }
    setCreds({ linked: c.linked, zoteroUserId: c.zoteroUserId, oauthAvailable: c.oauthAvailable });
    return c;
  }, []);

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
              if (!cancelled) setDocumentReady(true);
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
  }, [documentId, reloadKey, syncPluginCredentials]);

  useEffect(() => {
    document.title = `${documentTitle} – CiteDocs`;
  }, [documentTitle]);

  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyError(null);
    const r = await api<{ message?: string; error?: string }>("/api/zotero/account", {
      method: "POST",
      body: JSON.stringify({ apiKey: keyInput.trim() }),
    });
    if (!r.ok) return setKeyError(r.data.message || r.data.error || "Anahtar doğrulanamadı");
    setKeyInput("");
    setShowKeyModal(false);
    setReloadKey((k) => k + 1);
  };

  const connectZotero = () => {
    if (creds?.oauthAvailable) {
      const back = window.location.pathname + window.location.search;
      window.location.href = `${getApiBaseUrl()}/api/zotero/oauth/start?returnTo=${encodeURIComponent(back)}`;
    } else {
      setShowKeyModal(true);
    }
  };

  const addByIdentifier = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = identifier.trim();
    if (!id) return;
    if (!creds?.linked) {
      setNotice({ ok: false, text: "Önce Zotero hesabını bağla." });
      return;
    }
    setAdding(true);
    setNotice(null);
    const r = await api<{ saved?: boolean; item?: { title?: string }; error?: string }>(
      "/api/zotero/add-by-identifier",
      {
        method: "POST",
        body: JSON.stringify({ identifier: id }),
      },
    );
    setAdding(false);
    if (r.ok && r.data.saved) {
      setIdentifier("");
      setNotice({
        ok: true,
        text: `Zotero kütüphanene eklendi: “${r.data.item?.title || id}”. Zotero panelinde aratıp atıf ekleyebilirsin.`,
      });
    } else {
      setNotice({ ok: false, text: r.data.error || "Kaynak bulunamadı" });
    }
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
        <button
          type="button"
          disabled={!documentReady || status === "error"}
          title={zoteroLabel}
          aria-label={zoteroLabel}
          data-testid="oo-zotero-open"
          className="flex items-center gap-1.5 rounded bg-red-700 px-4 py-1.5 font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          onClick={() => {
            if (openZoteroPanel(editorContainerRef.current)) {
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
        </form>
        {creds?.linked ? (
          <span className="flex items-center gap-1 text-emerald-700" data-testid="oo-zotero-linked">
            <CheckCircle2 size={16} /> Zotero bağlı
          </span>
        ) : (
          <button
            type="button"
            onClick={connectZotero}
            className="flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50"
            data-testid="oo-zotero-connect"
          >
            <Link2 size={14} /> Zotero’yu bağla
          </button>
        )}
      </header>
      {notice && (
        <div
          className={`px-3 py-1 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
          data-testid="oo-notice"
        >
          {notice.text}
        </div>
      )}
      {error && (
        <div className="bg-red-50 px-3 py-1 text-sm text-red-700" data-testid="oo-error">
          {error}
        </div>
      )}
      <div ref={editorContainerRef} className="relative flex-1">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <Loader2 className="mr-2 animate-spin" /> Editör yükleniyor…
          </div>
        )}
        <div id="oo-editor" className="h-full w-full" />
      </div>
      {showKeyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          data-testid="oo-key-modal"
        >
          <form onSubmit={saveKey} className="w-[420px] rounded-lg bg-white p-5 text-sm shadow-xl">
            <h2 className="mb-2 text-base font-semibold">Zotero hesabını bağla</h2>
            <p className="mb-3 text-slate-600">
              Bir kez yapman yeterli.{" "}
              <a
                className="text-blue-600 underline"
                href="https://www.zotero.org/settings/keys/new"
                target="_blank"
                rel="noreferrer"
              >
                zotero.org’da yeni anahtar oluştur
              </a>{" "}
              (kütüphane okuma + yazma izni), buraya yapıştır. Anahtar CiteDocs hesabına şifreli
              kaydedilir; Zotero masaüstü gerekmez.
            </p>
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Zotero API anahtarı"
              className="mb-2 w-full rounded border px-2 py-1"
              data-testid="oo-key-input"
            />
            {keyError && <p className="mb-2 text-red-600">{keyError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="rounded px-3 py-1 hover:bg-slate-100"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="rounded bg-blue-600 px-3 py-1 text-white"
                data-testid="oo-key-save"
              >
                Bağla
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
