import { useState } from "react";
import { ShieldCheck, Key, AlertCircle, CheckCircle2, X, Link2 } from "lucide-react";
import type { ZoteroAccountInfo } from "./types.js";
import { unlinkZoteroAccount } from "./api.js";

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
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUnlink = async () => {
    if (!confirm("Zotero hesabınızın bağlantısını kesmek istediğinizden emin misiniz?")) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const ok = await unlinkZoteroAccount(userId);
    setLoading(false);

    if (ok) {
      setSuccessMsg("Zotero hesabının bağlantısı kesildi.");
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
      setErrorMsg("Zotero hesabının bağlantısı kesilemedi.");
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
            <h3 className="font-semibold text-sm">Zotero Hesap Bağlantısı</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-full cursor-pointer text-base leading-none"
            title="Kapat"
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
                  <span>Hesap Zotero.org'a Bağlandı</span>
                </div>
                <div className="text-gray-600 space-y-1 mt-1 text-[11px]">
                  <div>
                    <span className="font-medium text-gray-700">Zotero Kullanıcı ID:</span>{" "}
                    <span className="font-mono">{account.zoteroUserId || "—"}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">API Anahtarı:</span>{" "}
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">
                      {account.maskedKey || "••••••••"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900 flex items-start gap-2 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Anahtarınız sunucuda AES-256-GCM ile şifrelenerek saklanır. Asla tam haliyle tarayıcıya iletilmez.
                </span>
              </div>

              <button
                type="button"
                onClick={handleUnlink}
                disabled={loading}
                className="w-full mt-2 py-2 px-3 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                data-testid="btn-disconnect-zotero"
              >
                {loading ? "Bağlantı Kesiliyor..." : "Hesap Bağlantısını Kes"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <p className="text-gray-600 leading-relaxed">
                Kişisel kitaplıklarınıza ve koleksiyonlarınıza göz atmak ve belgelerinize kaynak eklemek için <strong>zotero.org</strong> hesabınızı bağlayın.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900 flex items-start gap-2 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Zotero bağlantısı güvenli OAuth protokolüyle gerçekleştirilir. Parolanız veya özel bilgileriniz CiteDocs sunucularında asla depolanmaz.
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const back = window.location.pathname + window.location.search;
                  window.location.href = `/api/zotero/oauth/start?returnTo=${encodeURIComponent(back)}`;
                }}
                className="w-full py-2 bg-[#c92c2c] hover:bg-[#b02424] text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer mt-1"
                data-testid="btn-connect-zotero-oauth"
              >
                <Link2 className="w-4 h-4" />
                <span>Zotero ile Bağlan</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
