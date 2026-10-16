import { useState, useEffect, useMemo, type FormEvent } from "react";
import { BookMarked, KeyRound, CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import { useAuth } from "./AuthContext.js";
import type { AuthViewMode } from "./types.js";

export interface VerifyEmailPageProps {
  initialToken?: string;
  onSuccess?: () => void;
  onSwitchMode?: (mode: AuthViewMode) => void;
  standalone?: boolean;
}

export function VerifyEmailPage({
  initialToken = "",
  onSuccess,
  onSwitchMode,
  standalone = false,
}: VerifyEmailPageProps) {
  const { verifyEmail, resendVerification, user, t, error, clearError } = useAuth();

  const urlToken = useMemo(() => {
    if (initialToken) return initialToken;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("token") || "";
    }
    return "";
  }, [initialToken]);

  const [token, setToken] = useState(urlToken);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  // Auto-verify if token is present in URL
  useEffect(() => {
    if (urlToken && !success && !submitting) {
      handleVerify(urlToken);
    }
  }, [urlToken]);

  const handleVerify = async (verifyTokenStr: string) => {
    const trimmed = verifyTokenStr.trim();
    if (!trimmed) {
      setLocalError(t("verificationToken") + " is required");
      return;
    }

    setSubmitting(true);
    clearError();
    setLocalError(null);
    setResendStatus(null);

    try {
      await verifyEmail(trimmed);
      setSuccess(true);
      onSuccess?.();
    } catch (err: unknown) {
      setLocalError((err as Error).message || "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await handleVerify(token);
  };

  const handleResend = async () => {
    setResending(true);
    setResendStatus(null);
    setLocalError(null);
    try {
      await resendVerification();
      setResendStatus(t("resendSuccess"));
    } catch (err: unknown) {
      setLocalError((err as Error).message || "Resending failed");
    } finally {
      setResending(false);
    }
  };

  const activeError = localError || error;

  return (
    <div
      className={`w-full max-w-md mx-auto ${
        standalone ? "min-h-[80vh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8" : ""
      }`}
    >
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-md mb-3">
            <BookMarked className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {t("verifyEmail")}
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">{t("tagline")}</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div
              data-testid="verify-success-banner"
              className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl text-xs flex items-start gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-900 mb-1">
                  {t("verifiedBadge")}
                </p>
                <p className="text-green-700 leading-relaxed">
                  {t("successEmailVerified")}
                </p>
              </div>
            </div>

            {onSwitchMode && (
              <button
                type="button"
                onClick={() => onSwitchMode("login")}
                data-testid="continue-to-app-btn"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                <span>{user ? "Continue to CiteDocs" : t("login")}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {activeError && (
              <div
                data-testid="auth-error-banner"
                className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
                <span>{activeError}</span>
              </div>
            )}

            {resendStatus && (
              <div
                data-testid="resend-success-banner"
                className="bg-green-50 border border-green-200 text-green-800 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-600" />
                <span>{resendStatus}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="verify-token"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                {t("verificationToken")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="verify-token"
                  data-testid="verify-token-input"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste verification token"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              data-testid="verify-submit-btn"
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-md disabled:opacity-60 cursor-pointer"
            >
              <span>{submitting ? t("submitting") : t("verifyEmail")}</span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>

            {/* Resend button */}
            <div className="pt-2 border-t border-gray-100 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                data-testid="resend-verification-btn"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
                <span>{resending ? t("submitting") : t("resendVerification")}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
