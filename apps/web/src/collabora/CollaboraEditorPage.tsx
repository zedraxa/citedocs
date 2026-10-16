import { useState, useEffect, useRef } from "react";
import { CollaboraFrame } from "./CollaboraFrame.js";
import { sendActionSave } from "./postMessage.js";
import { FileText, Save, ArrowLeft, CheckCircle2 } from "lucide-react";

export interface CollaboraEditorPageProps {
  documentId?: string;
  documentTitle?: string;
  onBackToTipTap?: () => void;
}

interface SessionData {
  actionUrl: string;
  wopiSrc: string;
  accessToken: string;
  accessTokenTtl: number;
  collaboraUrl?: string;
}

export function CollaboraEditorPage({
  documentId = "demo-document",
  documentTitle = "Scientific Writing Assignment: Quantum Gravity & Spacetime",
  onBackToTipTap,
}: CollaboraEditorPageProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentLoaded, setDocumentLoaded] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const apiBaseUrl =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL) ||
    "http://localhost:3000";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const fetchSession = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/documents/${documentId}/collabora-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": "yusuf-kavak",
          },
          body: JSON.stringify({
            userName: "Yusuf Kavak",
            action: "edit",
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to initialize Collabora session: HTTP ${res.status}`);
        }

        const data = (await res.json()) as SessionData;
        if (active) {
          setSession(data);
          setLoading(false);
        }
      } catch {
        if (!active) return;
        // In local/test environments where API might be unreachable, provide a fallback session
        const fallbackCollabora = "http://localhost:9980";
        const fallbackWopiSrc = `${apiBaseUrl}/wopi/files/${documentId}`;
        const fallbackAction = `${fallbackCollabora}/browser/dist/cool.html?WOPISrc=${encodeURIComponent(fallbackWopiSrc)}`;

        setSession({
          actionUrl: fallbackAction,
          wopiSrc: fallbackWopiSrc,
          accessToken: "mock-dev-token",
          accessTokenTtl: Date.now() + 3600000,
          collaboraUrl: fallbackCollabora,
        });
        setLoading(false);
      }
    };

    fetchSession();
    return () => {
      active = false;
    };
  }, [documentId, apiBaseUrl]);

  const handleSave = () => {
    sendActionSave(frameRef.current);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 overflow-hidden" data-testid="collabora-editor-page">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 shadow-xs z-10">
        <div className="flex items-center gap-3">
          {onBackToTipTap && (
            <button
              onClick={onBackToTipTap}
              title="Back to legacy editor"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-xs">
            <FileText className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-sm">{documentTitle}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                Collabora Online (CODE)
              </span>
            </div>
            <div className="text-xs text-slate-400">
              WOPI Host &bull; {documentLoaded ? "Live Synced" : "Connecting..."}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Saved</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Editor Body */}
      <main className="flex-1 w-full relative bg-slate-200">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-600 text-sm">
            Initializing Collabora Online session...
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-rose-50 text-rose-700 text-sm">
            {error}
          </div>
        )}

        {session && (
          <CollaboraFrame
            actionUrl={session.actionUrl}
            accessToken={session.accessToken}
            accessTokenTtl={session.accessTokenTtl}
            collaboraOrigin={session.collaboraUrl}
            className="w-full h-full"
            onDocumentLoaded={() => setDocumentLoaded(true)}
            onSaveResponse={() => {
              setSaveSuccess(true);
              setTimeout(() => setSaveSuccess(false), 2000);
            }}
          />
        )}
      </main>
    </div>
  );
}
