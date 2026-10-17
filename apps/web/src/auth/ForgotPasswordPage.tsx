import { useState, type FormEvent } from "react";
import { BookMarked, Mail, AlertCircle, CheckCircle2, ArrowLeft, Send } from "lucide-react";
import { useAuth } from "./AuthContext.js";
import type { AuthViewMode } from "./types.js";

export interface ForgotPasswordPageProps {
  onSwitchMode?: (mode: AuthViewMode) => void;
  standalone?: boolean;
}

export function ForgotPasswordPage({
  onSwitchMode,
  standalone = false,
}: ForgotPasswordPageProps) {
  const { forgotPassword, t, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);
    setSentMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError(t("invalidEmail"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await forgotPassword(trimmedEmail);
      setSentMessage(res.message || t("successResetSent"));
    } catch (err: unknown) {
      setLocalError((err as Error).message || "İstek başarısız oldu");
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
            {t("forgotPassword")}
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">{t("tagline")}</p>
        </div>

        {sentMessage ? (
          <div className="space-y-4">
            <div
              data-testid="forgot-success-banner"
              className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl text-xs flex items-start gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-900 mb-1">
                  {t("successResetSent")}
                </p>
                <p className="text-green-700 leading-relaxed">{sentMessage}</p>
              </div>
            </div>

            {onSwitchMode && (
              <button
                type="button"
                onClick={() => onSwitchMode("login")}
                data-testid="back-to-login-link"
                className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t("backToLogin")}</span>
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

            <div>
              <label
                htmlFor="forgot-email"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                {t("email")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="forgot-email"
                  data-testid="forgot-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              data-testid="forgot-submit-btn"
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-md disabled:opacity-60 cursor-pointer"
            >
              <span>{submitting ? t("submitting") : t("sendResetLink")}</span>
              {!submitting && <Send className="w-4 h-4" />}
            </button>

            {onSwitchMode && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => onSwitchMode("login")}
                  data-testid="back-to-login-link"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t("backToLogin")}</span>
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
