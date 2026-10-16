import { X } from "lucide-react";
import { useAuth } from "./AuthContext.js";
import { LoginPage } from "./LoginPage.js";
import { SignupPage } from "./SignupPage.js";
import { ForgotPasswordPage } from "./ForgotPasswordPage.js";
import { ResetPasswordPage } from "./ResetPasswordPage.js";
import { VerifyEmailPage } from "./VerifyEmailPage.js";

export function AuthModal() {
  const { activeModal, closeModal, openModal, t } = useAuth();

  if (!activeModal) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="auth-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md my-8">
        {/* Close Button */}
        <button
          onClick={closeModal}
          data-testid="auth-modal-close-btn"
          className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
          title={t("close")}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal View Content */}
        {activeModal === "login" && (
          <LoginPage
            onSuccess={closeModal}
            onSwitchMode={openModal}
            standalone={false}
          />
        )}

        {activeModal === "signup" && (
          <SignupPage
            onSuccess={closeModal}
            onSwitchMode={openModal}
            standalone={false}
          />
        )}

        {activeModal === "forgot-password" && (
          <ForgotPasswordPage
            onSwitchMode={openModal}
            standalone={false}
          />
        )}

        {activeModal === "reset-password" && (
          <ResetPasswordPage
            onSuccess={closeModal}
            onSwitchMode={openModal}
            standalone={false}
          />
        )}

        {activeModal === "verify-email" && (
          <VerifyEmailPage
            onSuccess={closeModal}
            onSwitchMode={openModal}
            standalone={false}
          />
        )}
      </div>
    </div>
  );
}
