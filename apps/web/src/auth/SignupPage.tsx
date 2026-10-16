import { useState, type FormEvent } from "react";
import { BookMarked, Mail, Lock, User as UserIcon, AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "./AuthContext.js";
import { OAuthButtons } from "./OAuthButtons.js";
import type { AuthUser, AuthViewMode } from "./types.js";

export interface SignupPageProps {
  onSuccess?: (user: AuthUser) => void;
  onSwitchMode?: (mode: AuthViewMode) => void;
  standalone?: boolean;
}

export function SignupPage({
  onSuccess,
  onSwitchMode,
  standalone = false,
}: SignupPageProps) {
  const { signup, t, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError(t("invalidEmail"));
      return;
    }

    if (password.length < 8) {
      setLocalError(t("passwordMin"));
      return;
    }

    if (password !== confirmPassword) {
      setLocalError(t("passwordMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      const user = await signup({
        email: trimmedEmail,
        password,
        displayName: displayName.trim() || undefined,
      });
      onSuccess?.(user);
    } catch (err: unknown) {
      setLocalError((err as Error).message || "Signup failed");
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
            {t("signup")}
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">{t("tagline")}</p>
        </div>

        {/* Free Plan / Student Guarantee Badge */}
        <div className="mb-5 bg-emerald-50/80 border border-emerald-200/70 rounded-xl p-3 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
              {t("freeBadge")}
            </span>
            <p className="text-xs text-emerald-900 leading-relaxed font-medium mt-0.5">
              {t("freeGuarantee")}
            </p>
          </div>
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
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="signup-email"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              {t("email")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="signup-email"
                data-testid="signup-email-input"
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
            <label
              htmlFor="signup-name"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              {t("displayName")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <UserIcon className="w-4 h-4" />
              </div>
              <input
                id="signup-name"
                data-testid="signup-name-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("displayNamePlaceholder")}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="signup-password"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              {t("password")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="signup-password"
                data-testid="signup-password-input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="signup-confirm-password"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              {t("confirmPassword")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="signup-confirm-password"
                data-testid="signup-confirm-password-input"
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
            data-testid="signup-submit-btn"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-md disabled:opacity-60 cursor-pointer mt-2"
          >
            <span>{submitting ? t("submitting") : t("signup")}</span>
            {!submitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        {/* OAuth Buttons (Google / ORCID) */}
        <OAuthButtons />

        {/* Footer switch to Login */}
        {onSwitchMode && (
          <div className="mt-6 text-center text-xs text-gray-600">
            <span>{t("alreadyHaveAccount")} </span>
            <button
              type="button"
              onClick={() => onSwitchMode("login")}
              data-testid="switch-to-login-link"
              className="font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
            >
              {t("login")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
