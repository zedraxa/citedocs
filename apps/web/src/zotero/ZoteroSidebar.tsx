import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, X } from "lucide-react";
import type { ZoteroItemPayload, ZoteroAccountInfo, WebLibraryPostMessage } from "./types.js";
import { fetchZoteroAccount } from "./api.js";
import { ZoteroAccountModal } from "./ZoteroAccountModal.js";

export interface ZoteroSidebarProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onCiteItem: (item: ZoteroItemPayload) => void;
  onItemAdded?: (item: ZoteroItemPayload) => void;
  onOpenPdf?: (attachment: { id: string; title: string; downloadUrl: string; itemId?: string }) => void;
  iframeSrc?: string;
  width?: number | string;
}

export function ZoteroSidebar({
  userId,
  isOpen,
  onClose,
  onCiteItem,
  onItemAdded,
  onOpenPdf,
  iframeSrc = "/zotero-weblib/index.html",
  width = 460,
}: ZoteroSidebarProps) {

  const [account, setAccount] = useState<ZoteroAccountInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Load account status on mount and when userId changes
  const loadAccount = useCallback(async () => {
    if (!userId) return;
    const info = await fetchZoteroAccount(userId);
    setAccount(info);
  }, [userId]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  // Send config to iframe whenever account changes or iframe loads
  const syncIframeConfig = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      const message: WebLibraryPostMessage = {
        type: "CITEDOCS_SET_CONFIG",
        config: {
          userId,
          zoteroUserId: account?.zoteroUserId || null,
          linked: Boolean(account?.linked),
          proxyBaseUrl: "/api/zotero/proxy",
        },
      };
      iframeRef.current.contentWindow.postMessage(message, "*");
    }
  }, [userId, account]);

  // Listen for postMessage events from the embedded web-library iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "CITEDOCS_ZOTERO_CITE" && data.item) {
        const item = data.item as ZoteroItemPayload;
        onCiteItem(item);
        if (onItemAdded) {
          onItemAdded(item);
        }
      }

      if (data.type === "CITEDOCS_OPEN_PDF" && data.attachment && onOpenPdf) {
        onOpenPdf(data.attachment);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [onCiteItem, onItemAdded, onOpenPdf]);


  if (!isOpen) return null;

  return (
    <aside
      style={{ width }}
      className="bg-white border-l border-gray-300 flex flex-col h-full shadow-xl relative z-20 shrink-0 select-none animate-slide-in-right"
      data-testid="zotero-sidebar"
    >
      {/* Top Sidebar Header */}
      <div className="bg-[#f7f9fa] border-b border-gray-200 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#c92c2c] text-white rounded flex items-center justify-center font-black text-[11px] shadow-xs">
            Z
          </div>
          <span className="font-semibold text-xs text-gray-800 tracking-tight">
            Zotero Web Library
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Account linking status pill */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1 transition-colors cursor-pointer ${
              account?.linked
                ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
            }`}
            title="Manage linked Zotero account"
            data-testid="zotero-account-pill"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                account?.linked ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <span>{account?.linked ? "Zotero Linked" : "Link Zotero"}</span>
          </button>

          {/* Refresh iframe */}
          <button
            type="button"
            onClick={() => {
              loadAccount();
              setIframeKey((k) => k + 1);
            }}
            className="p-1 text-gray-500 hover:text-gray-800 rounded hover:bg-gray-200 transition-colors cursor-pointer"
            title="Refresh library"
            data-testid="refresh-weblib-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Close sidebar */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200 transition-colors cursor-pointer"
            title="Close sidebar"
            data-testid="close-zotero-sidebar-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Embedded Web Library Iframe */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-gray-100">
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={iframeSrc}
          title="Zotero Web Library"
          className="w-full h-full border-none"
          onLoad={syncIframeConfig}
          data-testid="zotero-weblib-iframe"
        />
      </div>

      {/* Account Settings Modal */}
      <ZoteroAccountModal
        userId={userId}
        account={account}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onAccountUpdated={(updated) => {
          setAccount(updated);
          syncIframeConfig();
        }}
      />
    </aside>
  );
}
