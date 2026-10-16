import { useState, useEffect, useRef } from "react";
import { CollaboraFrame } from "./CollaboraFrame.js";
import { sendActionSave, sendUnoCommand } from "./postMessage.js";
import {
  FileText,
  Save,
  ArrowLeft,
  CheckCircle2,
  BookMarked,
  BookOpen,
  Sparkles,
  X,
} from "lucide-react";
import { PdfReaderPanel, type PdfAttachment } from "../pdf/index.js";
import { ZoteroSidebar } from "../zotero/index.js";
import type { ZoteroItemPayload } from "../zotero/types.js";
import { AddByIdentifier, type AddByIdentifierItem } from "../components/AddByIdentifier.js";
import {
  CollaboraBridge,
  type ZoteroCitationPayload,
} from "@citedocs/collabora-cite";

export interface CollaboraEditorPageProps {
  documentId?: string;
  documentTitle?: string;
  onBackToTipTap?: () => void;
  initialAttachment?: PdfAttachment | null;
  onBackToDocuments?: () => void;
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
  initialAttachment,
  onBackToDocuments,
}: CollaboraEditorPageProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentLoaded, setDocumentLoaded] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showPdfReader, setShowPdfReader] = useState(false);
  const [pdfAttachment] = useState<PdfAttachment | null>(
    initialAttachment || {
      id: "demo-pdf",
      title: "QuantumGravityReview.pdf",
      contentType: "application/pdf",
      downloadUrl: "/api/attachments/demo-pdf/content",
    },
  );
  const [showZoteroSidebar, setShowZoteroSidebar] = useState(true);
  const [showAddIdentifier, setShowAddIdentifier] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);



  const apiBaseUrl =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL) ||
    "http://localhost:3000";

  const currentUserId =
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("userId")
      : null) || "00000000-0000-0000-0000-000000000001";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const fetchSession = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/documents/${documentId}/collabora-session`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": currentUserId,
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

  const handleCiteItem = (item: ZoteroItemPayload | AddByIdentifierItem) => {
    let author = "Unknown";
    if (item.authors) {
      author = item.authors.split(",")[0]?.trim() || item.authors;
    }

    let year = "2026";
    if (item.year) {
      const match = String(item.year).match(/\d{4}/);
      if (match) year = match[0];
    }

    const title = item.title || "Untitled";
    const formattedCitation = `(${author}, ${year})`;
    const citationId = `cit-${Date.now()}`;
    const itemId = String(item.id || `item-${Date.now()}`);
    const doi = item.doi;
    const publicationTitle = item.publicationTitle;

    const citationPayload: ZoteroCitationPayload = {
      citationID: citationId,
      properties: {
        formattedCitation,
        plainText: formattedCitation,
        dontUpdate: false,
      },
      citationItems: [
        {
          id: itemId,
          uris: [`http://zotero.org/users/local/items/${itemId}`],
          itemData: {
            id: itemId,
            type: item.itemType || "article-journal",
            title,
            author: [{ family: author, given: "" }],
            issued: { "date-parts": [[parseInt(year, 10) || 2026]] },
            DOI: doi,
            publicationTitle,
          },
        },
      ],
      schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json",
    };

    if (frameRef.current?.contentWindow) {
      const bridge = new CollaboraBridge(frameRef.current.contentWindow, session?.collaboraUrl || "*");
      bridge.insertCitation(citationPayload, formattedCitation);

      // Also send UNO insert text command so text is immediately visual at the cursor
      sendUnoCommand(frameRef.current, ".uno:InsertText", {
        Text: { type: "string", value: ` ${formattedCitation} ` },
      });

      // Update bibliography with formatted entry
      const biblText = `${author} (${year}). ${title}.`;
      bridge.insertBibliography(biblText);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 overflow-hidden" data-testid="collabora-editor-page">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 shadow-xs z-10">
        <div className="flex items-center gap-3">
          {onBackToDocuments ? (
            <button
              onClick={onBackToDocuments}
              title="Back to Documents"
              data-testid="collabora-back-to-docs-btn"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Documents</span>
            </button>
          ) : onBackToTipTap ? (
            <button
              onClick={onBackToTipTap}
              title="Back to legacy editor"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : null}

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
          {/* Add by Identifier Button */}
          <button
            onClick={() => setShowAddIdentifier(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors cursor-pointer"
            title="Add citation by DOI, ISBN, PMID or arXiv"
            data-testid="collabora-add-identifier-btn"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Add by DOI</span>
          </button>

          {/* Toggle Zotero Library Sidebar */}
          <button
            onClick={() => setShowZoteroSidebar((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border ${
              showZoteroSidebar
                ? "bg-slate-200 text-slate-800 border-slate-300"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
            title="Toggle Zotero Web Library sidebar"
            data-testid="collabora-zotero-toggle-btn"
          >
            <BookMarked className="w-3.5 h-3.5 text-red-600" />
            <span>Zotero Library</span>
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={() => setShowPdfReader(!showPdfReader)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border ${
              showPdfReader
                ? "bg-red-50 text-red-700 border-red-300 hover:bg-red-100"
                : "text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200"
            }`}
            data-testid="toggle-pdf-reader-btn"
            title="Open Zotero PDF Reader in split panel"
          >
            <BookOpen className="w-4 h-4 text-red-600" />
            <span>PDF Reader</span>
          </button>

          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer ml-1"
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

      {/* Editor Body + Zotero Sidebar Split */}
      <div className="flex-1 w-full flex relative bg-slate-200 overflow-hidden">
        <main className="flex-1 h-full relative">
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
              iframeRef={frameRef}
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

        {showPdfReader && (
          <PdfReaderPanel
            userId="yusuf-kavak"
            attachment={pdfAttachment}
            isOpen={showPdfReader}
            onClose={() => setShowPdfReader(false)}
            collaboraIframeRef={frameRef}
          />
        )}

        {/* Zotero Web Library Sidebar */}
        {showZoteroSidebar && (
          <ZoteroSidebar
            userId={currentUserId}
            isOpen={showZoteroSidebar}
            onClose={() => setShowZoteroSidebar(false)}
            onCiteItem={handleCiteItem}
          />
        )}
      </div>

      {/* Add by Identifier Modal */}
      {showAddIdentifier && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 relative">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-semibold text-slate-800 text-sm">Add Item by Identifier (DOI, ISBN, PMID, arXiv)</span>
              <button
                onClick={() => setShowAddIdentifier(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <AddByIdentifier
                userId={currentUserId}
                apiUrl={apiBaseUrl}
                onCiteItem={(item) => {
                  handleCiteItem(item);
                  setShowAddIdentifier(false);
                }}
                onClose={() => setShowAddIdentifier(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>

  );
}
