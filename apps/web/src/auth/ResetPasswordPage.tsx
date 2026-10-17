import { useState, useMemo, type FormEvent } from "react";
import { BookMarked, Lock, KeyRound, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { useAuth } from "./AuthContext.js";
import type { AuthViewMode } from "./types.js";

export interface ResetPasswordPageProps {
  initialToken?: string;
  onSuccess?: () => void;
  onSwitchMode?: (mode: AuthViewMode) => void;
  standalone?: boolean;
}

export function ResetPasswordPage({
  initialToken = "",
  onSuccess,
  onSwitchMode,
  standalone = false,
}: ResetPasswordPageProps) {
  const { resetPassword, t, error, clearError } = useAuth();

  const urlToken = useMemo(() => {
    if (initialToken) return initialToken;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("token") || "";
    }
    return "";
  }, [initialToken]);

  const [token, setToken] = useState(urlToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setLocalError(t("resetToken") + " zorunludur");
      return;
    }

    if (newPassword.length < 8) {
      setLocalError(t("passwordMin"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError(t("passwordMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(trimmedToken, newPassword);
      setSuccess(true);
      onSuccess?.();
    } catch (err: unknown) {
      setLocalError((err as Error).message || "Şifre sıfırlama başarısız oldu");
    } finally {
      setSubmitting(false);
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
            {t("resetPassword")}
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">{t("tagline")}</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div
              data-testid="reset-success-banner"
              className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl text-xs flex items-start gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-900 mb-1">
                  {t("resetPassword")}
                </p>
                <p className="text-green-700 leading-relaxed">
                  {t("successPasswordChanged")}
                </p>
              </div>
            </div>

            {onSwitchMode && (
              <button
                type="button"
                onClick={() => onSwitchMode("login")}
                data-testid="back-to-login-link"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                <span>{t("login")}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {activeError && (
              <div
                data-testid="auth-error-banner"
                className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
                <span>{activeError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="reset-token"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                {t("resetToken")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="reset-token"
                  data-testid="reset-token-input"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste reset token"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="reset-new-password"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                {t("newPassword")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="reset-new-password"
                  data-testid="reset-new-password-input"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("passwordPlaceholder")}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="reset-confirm-password"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                {t("confirmPassword")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="reset-confirm-password"
                  data-testid="reset-confirm-password-input"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("passwordPlaceholder")}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              data-testid="reset-submit-btn"
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-md disabled:opacity-60 cursor-pointer mt-2"
            >
              <span>{submitting ? t("submitting") : t("resetPassword")}</span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>

            {onSwitchMode && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => onSwitchMode("login")}
                  data-testid="back-to-login-link"
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer"
                >
                  {t("backToLogin")}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
