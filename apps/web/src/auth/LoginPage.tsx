import { useState, type FormEvent } from "react";
import { BookMarked, Mail, Lock, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "./AuthContext.js";
import { OAuthButtons } from "./OAuthButtons.js";
import type { AuthUser, AuthViewMode } from "./types.js";

export interface LoginPageProps {
  onSuccess?: (user: AuthUser) => void;
  onSwitchMode?: (mode: AuthViewMode) => void;
  standalone?: boolean;
}

export function LoginPage({
  onSuccess,
  onSwitchMode,
  standalone = false,
}: LoginPageProps) {
  const { login, t, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!email.trim() || !password) {
      setLocalError(t("requiredFields" as unknown as "invalidEmail") || "Please fill all fields");
      return;
    }

    setSubmitting(true);
    try {
      const user = await login({ email: email.trim(), password });
      onSuccess?.(user);
    } catch (err: unknown) {
      setLocalError((err as Error).message || "Login failed");
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
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-md mb-3">
            <BookMarked className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {t("login")}
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">{t("tagline")}</p>
        </div>

        {/* Free Plan / Student Guarantee Badge */}
        <div className="mb-5 bg-blue-50/70 border border-blue-200/60 rounded-xl p-3 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed font-medium">
            {t("freeGuarantee")}
          </p>
        </div>

        {/* Error Alert */}
        {activeError && (
          <div
            data-testid="auth-error-banner"
            className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
            <span>{activeError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              {t("email")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="login-email"
                data-testid="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-gray-700"
              >
                {t("password")}
              </label>
              {onSwitchMode && (
                <button
                  type="button"
                  onClick={() => onSwitchMode("forgot-password")}
                  data-testid="forgot-password-link"
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  {t("forgotPassword")}
                </button>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password"
                data-testid="login-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            data-testid="login-submit-btn"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-md disabled:opacity-60 cursor-pointer"
          >
            <span>{submitting ? t("submitting") : t("login")}</span>
            {!submitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        {/* OAuth Buttons (Google / ORCID) */}
        <OAuthButtons />

        {/* Footer switch to Signup */}
        {onSwitchMode && (
          <div className="mt-6 text-center text-xs text-gray-600">
            <span>{t("dontHaveAccount")} </span>
            <button
              type="button"
              onClick={() => onSwitchMode("signup")}
              data-testid="switch-to-signup-link"
              className="font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
            >
              {t("signup")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
