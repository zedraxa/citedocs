import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { CollaboraFrame } from "./CollaboraFrame.js";
import { sendActionSave, sendUnoCommand } from "./postMessage.js";
import { useAuth } from "../auth/AuthContext.js";
import {
  FileText,
  Save,
  ArrowLeft,
  CheckCircle2,
  BookMarked,
  BookOpen,
  Sparkles,
  X,
  ListPlus,
  Plus,
} from "lucide-react";
import { PdfReaderPanel, type PdfAttachment, type PdfCitationEvent } from "../pdf/index.js";
import { ZoteroSidebar } from "../zotero/index.js";
import type { ZoteroItemPayload } from "../zotero/types.js";
import { AddByIdentifier, type AddByIdentifierItem } from "../components/AddByIdentifier.js";
import {
  CollaboraBridge,
  CollaboraCSLEngine,
  createZoteroCitationPayload,
  createLibreOfficeCitationMarkName,
  createLibreOfficeBibliographyMarkName,
  generateRandomSuffix,
  type ZoteroCitationPayload,
  type ZoteroCitationItem,
} from "@citedocs/collabora-cite";
import type { CSLItem } from "@citedocs/shared";
import { StyleSelector } from "./StyleSelector.js";
import { CitationEditorModal } from "./CitationEditorModal.js";
import {
  DocumentCitationsDrawer,
  type DocumentCitationItem,
} from "./DocumentCitationsDrawer.js";

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

/**
 * Normalizes any Zotero, DOI, or attachment payload into a standard CSLItem.
 */
function toCSLItem(
  item:
    | ZoteroItemPayload
    | AddByIdentifierItem
    | {
        id: string;
        title: string;
        authors?: string;
        year?: string;
        doi?: string;
        itemType?: string;
        publicationTitle?: string;
      },
): CSLItem {
  let authorsList: Array<{ family: string; given?: string }> = [];
  if (item.authors) {
    const parts = item.authors.split(/;|\sand\s/);
    authorsList = parts.map((part) => {
      const trimmed = part.trim();
      if (trimmed.includes(",")) {
        const [fam, giv] = trimmed.split(",");
        return { family: fam.trim(), given: giv?.trim() || "" };
      }
      const words = trimmed.split(/\s+/);
      if (words.length > 1) {
        return { family: words[words.length - 1], given: words.slice(0, -1).join(" ") };
      }
      return { family: trimmed };
    });
  } else {
    authorsList = [{ family: "Unknown" }];
  }

  let yearNum = 2026;
  if (item.year) {
    const match = String(item.year).match(/\d{4}/);
    if (match) yearNum = parseInt(match[0], 10);
  }

  return {
    id: String(item.id),
    type: item.itemType || "article-journal",
    title: item.title || "Untitled",
    author: authorsList,
    issued: { "date-parts": [[yearNum]] },
    DOI: item.doi,
    "container-title": item.publicationTitle,
  };
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

  // PDF Reader panel state
  const [showPdfReader, setShowPdfReader] = useState(false);
  const [pdfAttachment] = useState<PdfAttachment | null>(
    initialAttachment || {
      id: "demo-pdf",
      title: "QuantumGravityReview.pdf",
      contentType: "application/pdf",
      downloadUrl: "/api/attachments/demo-pdf/content",
    },
  );

  // Sidebar & modal toggles
  const [showZoteroSidebar, setShowZoteroSidebar] = useState(true);
  const [showAddIdentifier, setShowAddIdentifier] = useState(false);
  const [isCitationDrawerOpen, setIsCitationDrawerOpen] = useState(false);
  const [isCitationModalOpen, setIsCitationModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"insert" | "edit">("insert");
  const [editingCitation, setEditingCitation] = useState<DocumentCitationItem | null>(null);

  // Citation & CSL Engine state
  const [activeStyleId, setActiveStyleId] = useState("apa");
  const [documentCitations, setDocumentCitations] = useState<DocumentCitationItem[]>([]);
  const [hasBibliography, setHasBibliography] = useState(false);
  const [bibliographyEntries, setBibliographyEntries] = useState<string[]>([]);
  const [bibliographyMarkName, setBibliographyMarkName] = useState<string | null>(null);

  // Item catalog: maps item ID -> CSLItem
  const knownItemsRef = useRef<Map<string, CSLItem>>(new Map());

  // Citeproc engine instance
  const cslEngineRef = useRef<CollaboraCSLEngine>(new CollaboraCSLEngine("apa", "en-US"));

  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const apiBaseUrl =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL) ||
    "http://localhost:3000";

  const { user: authUser } = useAuth();
  const currentUserId = authUser?.id || "00000000-0000-0000-0000-000000000001";
  const currentUserName = authUser?.displayName || authUser?.email || "Anonymous";

  // Bridge factory
  const getBridge = useCallback(() => {
    if (frameRef.current?.contentWindow) {
      return new CollaboraBridge(frameRef.current.contentWindow, session?.collaboraUrl || "*");
    }
    return null;
  }, [session?.collaboraUrl]);

  // Fetch or fallback session
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
            userName: currentUserName,
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
  }, [documentId, apiBaseUrl, currentUserId, currentUserName]);

  const handleSave = () => {
    sendActionSave(frameRef.current);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  /**
   * Auto-refreshes bibliography when citations are inserted, edited, or deleted.
   */
  const updateBibliographySync = useCallback(
    (currentCits: DocumentCitationItem[], hasBib: boolean, bibMark: string | null) => {
      if (currentCits.length === 0) {
        setBibliographyEntries([]);
        return;
      }
      try {
        const bib = cslEngineRef.current.makeBibliography();
        setBibliographyEntries(bib.entries);

        if (hasBib && bibMark) {
          const bridge = getBridge();
          bridge?.updateBibliography(bibMark, bib.text);
        }
      } catch {
        // Citeproc bibliography generation error handled gracefully
      }
    },
    [getBridge],
  );

  /**
   * Core citation insertion handler using CollaboraCSLEngine + CollaboraBridge + Zotero format.
   */
  const handleCiteItem = useCallback(
    (
      rawItem:
        | ZoteroItemPayload
        | AddByIdentifierItem
        | {
            id: string;
            title: string;
            authors?: string;
            year?: string;
            doi?: string;
            itemType?: string;
            publicationTitle?: string;
          },
      options?: {
        locator?: string;
        label?: string;
        prefix?: string;
        suffix?: string;
        suppressAuthor?: boolean;
      },
    ) => {
      const csl = toCSLItem(rawItem);
      knownItemsRef.current.set(String(csl.id), csl);
      cslEngineRef.current.addItem(csl);

      const citationID = `cit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const citationItem: ZoteroCitationItem = {
        id: String(csl.id),
        uris: [`http://zotero.org/users/local/items/${csl.id}`],
        uri: [`http://zotero.org/users/local/items/${csl.id}`],
        itemData: csl,
        locator: options?.locator,
        label: options?.locator ? options?.label || "page" : undefined,
        prefix: options?.prefix,
        suffix: options?.suffix,
        suppressAuthor: Boolean(options?.suppressAuthor),
      };

      // Format in-text citation via Citeproc Engine
      const res = cslEngineRef.current.formatCitation([citationItem], { citationID });
      const formattedText = res.plainCitation || res.formattedCitation;

      // Construct official Zotero CSL_CITATION payload
      const payload = createZoteroCitationPayload({
        citationID,
        items: [citationItem],
        formattedCitation: formattedText,
        plainCitation: res.plainCitation,
      });

      const rndSuffix = generateRandomSuffix();
      const markName = createLibreOfficeCitationMarkName(payload, rndSuffix);

      // Post to Collabora via Bridge (Python UNO ReferenceMark macro)
      const bridge = getBridge();
      if (bridge) {
        bridge.insertCitation(payload, formattedText, rndSuffix);
      }

      // Visual immediate text insertion at cursor via UNO command
      if (frameRef.current) {
        sendUnoCommand(frameRef.current, ".uno:InsertText", {
          Text: { type: "string", value: ` ${formattedText} ` },
        });
      }

      const newCit: DocumentCitationItem = {
        markName,
        payload,
        formattedText,
      };

      setDocumentCitations((prev) => {
        const next = [...prev, newCit];
        updateBibliographySync(next, hasBibliography, bibliographyMarkName);
        return next;
      });
    },
    [getBridge, hasBibliography, bibliographyMarkName, updateBibliographySync],
  );

  /**
   * Handles citation from PDF reader annotations ("Cite this").
   */
  const handleCitePdfAnnotation = useCallback(
    (event: PdfCitationEvent) => {
      const itemId = event.attachmentId || "pdf-attachment";
      const pdfItem = {
        id: itemId,
        title: pdfAttachment?.title || "PDF Document",
        authors: "Author",
        year: "2026",
      };

      handleCiteItem(pdfItem, {
        locator: event.locator,
        label: "page",
        prefix: event.text ? `"${event.text}" ` : undefined,
      });
    },
    [pdfAttachment?.title, handleCiteItem],
  );

  /**
   * Save handler from CitationEditorModal (supports insert and edit modes).
   */
  const handleSaveFromModal = useCallback(
    (payload: ZoteroCitationPayload, formattedText: string, markName?: string) => {
      const bridge = getBridge();

      if (modalMode === "edit" && markName) {
        // Update existing citation
        if (bridge) {
          bridge.updateCitation(markName, payload, formattedText);
        }

        setDocumentCitations((prev) => {
          const next = prev.map((c) =>
            c.markName === markName ? { ...c, payload, formattedText } : c,
          );
          updateBibliographySync(next, hasBibliography, bibliographyMarkName);
          return next;
        });
      } else {
        // Insert new citation cluster
        const rndSuffix = generateRandomSuffix();
        const newMarkName = createLibreOfficeCitationMarkName(payload, rndSuffix);

        if (bridge) {
          bridge.insertCitation(payload, formattedText, rndSuffix);
        }

        if (frameRef.current) {
          sendUnoCommand(frameRef.current, ".uno:InsertText", {
            Text: { type: "string", value: ` ${formattedText} ` },
          });
        }

        const newCit: DocumentCitationItem = {
          markName: newMarkName,
          payload,
          formattedText,
        };

        setDocumentCitations((prev) => {
          const next = [...prev, newCit];
          updateBibliographySync(next, hasBibliography, bibliographyMarkName);
          return next;
        });
      }
    },
    [modalMode, getBridge, hasBibliography, bibliographyMarkName, updateBibliographySync],
  );

  /**
   * Delete citation handler: removes reference mark in Collabora and refreshes citations.
   */
  const handleDeleteCitation = useCallback(
    (markName: string) => {
      const bridge = getBridge();
      if (bridge) {
        bridge.removeCitation(markName);
      }

      setDocumentCitations((prev) => {
        const next = prev.filter((c) => c.markName !== markName);

        // Rebuild processor state for remaining citations (handles IEEE renumbering, ibid, etc.)
        if (next.length > 0) {
          try {
            const clusters = next.map((c) => c.payload);
            const refreshed = cslEngineRef.current.processCitationClusters(clusters);
            for (let i = 0; i < next.length; i++) {
              const res = refreshed[i];
              if (res && res.formattedCitation) {
                next[i].formattedText = res.plainCitation || res.formattedCitation;
                next[i].payload.properties.formattedCitation = next[i].formattedText;
                bridge?.updateCitation(next[i].markName, next[i].payload, next[i].formattedText);
              }
            }
          } catch {
            // graceful fallback
          }
        }

        updateBibliographySync(next, hasBibliography, bibliographyMarkName);
        return [...next];
      });
    },
    [getBridge, hasBibliography, bibliographyMarkName, updateBibliographySync],
  );

  /**
   * Citation style change handler: updates document prefs, re-formats all citations and bibliography.
   */
  const handleStyleChange = useCallback(
    async (newStyleId: string, styleXml?: string) => {
      if (styleXml) {
        cslEngineRef.current.registerStyle(newStyleId, styleXml);
      }
      cslEngineRef.current.switchStyle(newStyleId);
      setActiveStyleId(newStyleId);

      const bridge = getBridge();
      if (bridge) {
        bridge.setDocumentPrefs({
          style: newStyleId,
          locale: "en-US",
          hasBibliography: hasBibliography ? 1 : 0,
        });
      }

      // Re-format all citations in document order
      setDocumentCitations((prev) => {
        if (prev.length === 0) {
          updateBibliographySync([], hasBibliography, bibliographyMarkName);
          return prev;
        }

        try {
          const clusters = prev.map((c) => c.payload);
          const results = cslEngineRef.current.processCitationClusters(clusters);

          const updated = prev.map((c, idx) => {
            const res = results[idx];
            const newText = res?.plainCitation || res?.formattedCitation || c.formattedText;
            const updatedPayload: ZoteroCitationPayload = {
              ...c.payload,
              properties: {
                ...c.payload.properties,
                formattedCitation: newText,
                plainCitation: res?.plainCitation || newText,
              },
            };

            bridge?.updateCitation(c.markName, updatedPayload, newText);

            return {
              ...c,
              payload: updatedPayload,
              formattedText: newText,
            };
          });

          updateBibliographySync(updated, hasBibliography, bibliographyMarkName);
          return updated;
        } catch {
          return prev;
        }
      });
    },
    [getBridge, hasBibliography, bibliographyMarkName, updateBibliographySync],
  );

  /**
   * Insert or update bibliography at cursor.
   */
  const handleInsertBibliography = useCallback(() => {
    try {
      const bib = cslEngineRef.current.makeBibliography();
      setBibliographyEntries(bib.entries);

      const bridge = getBridge();
      let markName = bibliographyMarkName;

      if (!markName) {
        const rndSuffix = generateRandomSuffix();
        markName = createLibreOfficeBibliographyMarkName(undefined, rndSuffix);
        setBibliographyMarkName(markName);
        setHasBibliography(true);

        if (bridge) {
          bridge.insertBibliography(bib.text);
        }

        // Place bibliography heading and entries visually in editor at cursor
        if (frameRef.current) {
          sendUnoCommand(frameRef.current, ".uno:InsertText", {
            Text: {
              type: "string",
              value: `\n\nReferences\n${bib.text}\n`,
            },
          });
        }
      } else {
        if (bridge) {
          bridge.updateBibliography(markName, bib.text);
        }
      }
    } catch {
      // Graceful error handling
    }
  }, [getBridge, bibliographyMarkName]);

  const handleOpenInsertModal = () => {
    setModalMode("insert");
    setEditingCitation(null);
    setIsCitationModalOpen(true);
  };

  const handleOpenEditModal = (cit: DocumentCitationItem) => {
    setModalMode("edit");
    setEditingCitation(cit);
    setIsCitationModalOpen(true);
  };

  const availableItemsList = useMemo(() => {
    return Array.from(knownItemsRef.current.values());
  }, [documentCitations]);

  return (
    <div
      className="flex flex-col h-screen w-screen bg-slate-100 overflow-hidden"
      data-testid="collabora-editor-page"
    >
      {/* Top Header Toolbar */}
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

        {/* Toolbar Center & Right Actions */}
        <div className="flex items-center gap-2">
          {/* CSL Citation Style Selector */}
          <StyleSelector
            currentStyleId={activeStyleId}
            onStyleChange={handleStyleChange}
            apiUrl={apiBaseUrl}
          />

          {/* Insert Citation Cluster Button */}
          <button
            type="button"
            onClick={handleOpenInsertModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors cursor-pointer shadow-2xs"
            title="Insert citation cluster at cursor"
            data-testid="collabora-insert-citation-btn"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Insert Citation</span>
          </button>

          {/* Add by Identifier Button */}
          <button
            onClick={() => setShowAddIdentifier(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer shadow-2xs"
            title="Add citation by DOI, ISBN, PMID or arXiv"
            data-testid="collabora-add-identifier-btn"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Add by DOI</span>
          </button>

          {/* Document Citations & Bibliography Drawer Button */}
          <button
            type="button"
            onClick={() => setIsCitationDrawerOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border shadow-2xs ${
              isCitationDrawerOpen
                ? "bg-slate-200 text-slate-800 border-slate-300"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title="View, edit, or remove document citations & bibliography"
            data-testid="collabora-citations-drawer-btn"
          >
            <ListPlus className="w-3.5 h-3.5 text-blue-600" />
            <span>Citations</span>
            <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
              {documentCitations.length}
            </span>
          </button>

          {/* Toggle Zotero Library Sidebar */}
          <button
            onClick={() => setShowZoteroSidebar((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border shadow-2xs ${
              showZoteroSidebar
                ? "bg-slate-200 text-slate-800 border-slate-300"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title="Toggle Zotero Web Library sidebar"
            data-testid="collabora-zotero-toggle-btn"
          >
            <BookMarked className="w-3.5 h-3.5 text-red-600" />
            <span>Zotero Library</span>
          </button>

          {/* Toggle PDF Reader */}
          <button
            type="button"
            onClick={() => setShowPdfReader(!showPdfReader)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border shadow-2xs ${
              showPdfReader
                ? "bg-red-50 text-red-700 border-red-300 hover:bg-red-100"
                : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50"
            }`}
            data-testid="toggle-pdf-reader-btn"
            title="Open Zotero PDF Reader in split panel"
          >
            <BookOpen className="w-3.5 h-3.5 text-red-600" />
            <span>PDF Reader</span>
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer ml-1 border border-slate-200"
            data-testid="collabora-save-btn"
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

      {/* Editor Body + Panels */}
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

        {/* Split PDF Reader Panel */}
        {showPdfReader && (
          <PdfReaderPanel
            userId="yusuf-kavak"
            attachment={pdfAttachment}
            isOpen={showPdfReader}
            onClose={() => setShowPdfReader(false)}
            collaboraIframeRef={frameRef}
            onCiteAnnotation={handleCitePdfAnnotation}
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

        {/* Document Citations & Bibliography Drawer */}
        <DocumentCitationsDrawer
          isOpen={isCitationDrawerOpen}
          onClose={() => setIsCitationDrawerOpen(false)}
          citations={documentCitations}
          activeStyleId={activeStyleId}
          hasBibliography={hasBibliography}
          bibliographyEntries={bibliographyEntries}
          onEditCitation={handleOpenEditModal}
          onDeleteCitation={handleDeleteCitation}
          onInsertBibliography={handleInsertBibliography}
          onRefreshAll={() => handleStyleChange(activeStyleId)}
        />
      </div>

      {/* Add by Identifier Modal */}
      {showAddIdentifier && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 relative">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-semibold text-slate-800 text-sm">
                Add Item by Identifier (DOI, ISBN, PMID, arXiv)
              </span>
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

      {/* Citation Editor & Inserter Modal */}
      {isCitationModalOpen && (
        <CitationEditorModal
          isOpen={isCitationModalOpen}
          mode={modalMode}
          initialPayload={editingCitation?.payload}
          markName={editingCitation?.markName}
          currentStyleId={activeStyleId}
          availableItems={availableItemsList}
          onSave={handleSaveFromModal}
          onDelete={handleDeleteCitation}
          onClose={() => setIsCitationModalOpen(false)}
        />
      )}
    </div>
  );
}
