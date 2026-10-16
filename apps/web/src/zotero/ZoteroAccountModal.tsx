import { useState } from "react";
import { ShieldCheck, Key, AlertCircle, CheckCircle2, Loader2, X, ExternalLink } from "lucide-react";
import type { ZoteroAccountInfo } from "./types.js";
import { linkZoteroApiKey, unlinkZoteroAccount } from "./api.js";

export interface ZoteroAccountModalProps {
  userId: string;
  account: ZoteroAccountInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onAccountUpdated: (updated: ZoteroAccountInfo) => void;
}

export function ZoteroAccountModal({
  userId,
  account,
  isOpen,
  onClose,
  onAccountUpdated,
}: ZoteroAccountModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const result = await linkZoteroApiKey(userId, apiKeyInput.trim());
    setLoading(false);

    if (result.success && result.data) {
      setApiKeyInput("");
      setSuccessMsg("Zotero account successfully linked & validated!");
      onAccountUpdated(result.data);
    } else {
      setErrorMsg(result.error || "Failed to link Zotero account");
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Are you sure you want to disconnect your Zotero account?")) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const ok = await unlinkZoteroAccount(userId);
    setLoading(false);

    if (ok) {
      setSuccessMsg("Zotero account disconnected.");
      onAccountUpdated({
        linked: false,
        userId,
        zoteroUserId: null,
        username: null,
        maskedKey: null,
        syncEnabled: false,
        lastSyncedAt: null,
        lastSyncVersion: 0,
      });
    } else {
      setErrorMsg("Failed to disconnect Zotero account.");
    }
  };

  const isLinked = account?.linked;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
      data-testid="zotero-account-modal-backdrop"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200 overflow-hidden flex flex-col"
        data-testid="zotero-account-modal"
      >
        {/* Header */}
        <div className="bg-[#c92c2c] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            <h3 className="font-semibold text-sm">Zotero Account Linking</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-full cursor-pointer text-base leading-none"
            title="Close"
            data-testid="close-account-modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 text-xs">
          {errorMsg && (
            <div
              className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-start gap-2"
              data-testid="account-modal-error"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg flex items-start gap-2"
              data-testid="account-modal-success"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {isLinked ? (
            <div className="flex flex-col gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Account Connected to Zotero.org</span>
                </div>
                <div className="text-gray-600 space-y-1 mt-1 text-[11px]">
                  <div>
                    <span className="font-medium text-gray-700">Zotero User ID:</span>{" "}
                    <span className="font-mono">{account.zoteroUserId || "—"}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">API Key:</span>{" "}
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">
                      {account.maskedKey || "••••••••"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900 flex items-start gap-2 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Your key is stored encrypted at rest with server AES-256-GCM. It is never returned in full to the browser.
                </span>
              </div>

              <button
                type="button"
                onClick={handleUnlink}
                disabled={loading}
                className="w-full mt-2 py-2 px-3 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                data-testid="btn-disconnect-zotero"
              >
                {loading ? "Disconnecting..." : "Disconnect Account"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleLink} className="flex flex-col gap-3.5">
              <p className="text-gray-600 leading-relaxed">
                Connect your <strong>zotero.org</strong> account to browse your personal libraries, collections, and insert references into your documents.
              </p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="apiKey" className="font-semibold text-gray-700">
                  Zotero API Key
                </label>
                <input
                  id="apiKey"
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Paste your zotero.org API key..."
                  className="p-2 border border-gray-300 rounded-lg focus:border-red-600 focus:outline-none font-mono text-xs"
                  data-testid="input-zotero-api-key"
                  disabled={loading}
                  required
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <a
                  href="https://www.zotero.org/settings/keys/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>Create an API key on zotero.org</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-600 text-[11px] flex items-start gap-1.5">
                <ShieldCheck className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <span>Encrypted at rest using AES-256-GCM. Never shared with third parties or exposed to the browser.</span>
              </div>

              <button
                type="submit"
                disabled={loading || !apiKeyInput.trim()}
                className="w-full py-2 bg-[#c92c2c] hover:bg-[#b02424] text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm cursor-pointer mt-1"
                data-testid="btn-save-zotero-key"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validating with zotero.org...</span>
                  </>
                ) : (
                  <span>Validate &amp; Connect</span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
