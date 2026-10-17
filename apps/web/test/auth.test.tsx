// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import {
  AuthProvider,
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
  UserMenu,
  ProtectedRoute,
  authApi,
} from "../src/auth/index.js";

describe("Web Authentication & Signup System (@citedocs/web)", () => {
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.restoreAllMocks();
  });

  describe("LoginPage", () => {
    it("renders email and password inputs, submit button, and free student badge", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(LoginPage, { standalone: true })
          )
        );
      });

      expect(container.querySelector("[data-testid='login-email-input']")).not.toBeNull();
      expect(container.querySelector("[data-testid='login-password-input']")).not.toBeNull();
      expect(container.querySelector("[data-testid='login-submit-btn']")).not.toBeNull();
      expect(container.textContent).toContain("%100 ücretsiz");

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it("hides OAuth buttons when providers are disabled, and shows them when enabled", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            {
              autoFetch: false,
              initialProviders: { google: true, orcid: false },
            },
            createElement(LoginPage, { standalone: true })
          )
        );
      });

      // Google button should be present
      expect(container.querySelector("[data-testid='oauth-google-btn']")).not.toBeNull();
      // ORCID button should be absent because orcid is false
      expect(container.querySelector("[data-testid='oauth-orcid-btn']")).toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it("submits email and password, calling authApi.login", async () => {
      const loginSpy = vi.spyOn(authApi, "login").mockResolvedValue({
        user: {
          id: "u-123",
          email: "student@uni.edu",
          displayName: "Alice",
          avatarUrl: null,
          emailVerified: true,
        },
        csrfToken: "token-abc",
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(LoginPage, { standalone: true })
          )
        );
      });

      const emailInput = container.querySelector("[data-testid='login-email-input']") as HTMLInputElement;
      const passInput = container.querySelector("[data-testid='login-password-input']") as HTMLInputElement;
      const form = container.querySelector("form")!;

      await act(async () => {
        fireEvent.change(emailInput, { target: { value: "student@uni.edu" } });
        fireEvent.change(passInput, { target: { value: "SecurePass123!" } });
      });

      await act(async () => {
        fireEvent.submit(form);
      });

      expect(loginSpy).toHaveBeenCalledWith({
        email: "student@uni.edu",
        password: "SecurePass123!",
      });

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe("SignupPage", () => {
    it("validates password length and password matching before submitting", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(SignupPage, { standalone: true })
          )
        );
      });

      const emailInput = container.querySelector("[data-testid='signup-email-input']") as HTMLInputElement;
      const passInput = container.querySelector("[data-testid='signup-password-input']") as HTMLInputElement;
      const confirmInput = container.querySelector("[data-testid='signup-confirm-password-input']") as HTMLInputElement;
      const form = container.querySelector("form")!;

      // 1. Weak password < 8 chars
      await act(async () => {
        fireEvent.change(emailInput, { target: { value: "bob@uni.edu" } });
        fireEvent.change(passInput, { target: { value: "short" } });
        fireEvent.change(confirmInput, { target: { value: "short" } });
      });

      await act(async () => {
        fireEvent.submit(form);
      });

      expect(container.querySelector("[data-testid='auth-error-banner']")?.textContent).toContain("en az 8 karakter");

      // 2. Mismatched passwords
      await act(async () => {
        fireEvent.change(passInput, { target: { value: "Password123!" } });
        fireEvent.change(confirmInput, { target: { value: "Different123!" } });
      });

      await act(async () => {
        fireEvent.submit(form);
      });

      expect(container.querySelector("[data-testid='auth-error-banner']")?.textContent).toContain("eşleşmiyor");

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe("ForgotPasswordPage & ResetPasswordPage", () => {
    it("submits forgot password request and displays confirmation banner", async () => {
      vi.spyOn(authApi, "forgotPassword").mockResolvedValue({
        message: "If an account exists with that email, a password reset link has been sent.",
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(ForgotPasswordPage, { standalone: true })
          )
        );
      });

      const emailInput = container.querySelector("[data-testid='forgot-email-input']") as HTMLInputElement;
      const form = container.querySelector("form")!;

      await act(async () => {
        fireEvent.change(emailInput, { target: { value: "forgot@uni.edu" } });
      });

      await act(async () => {
        fireEvent.submit(form);
      });

      expect(container.querySelector("[data-testid='forgot-success-banner']")).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it("resets password with token and displays success state", async () => {
      const resetSpy = vi.spyOn(authApi, "resetPassword").mockResolvedValue({
        success: true,
        message: "Password updated successfully",
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(ResetPasswordPage, { initialToken: "valid-token-123", standalone: true })
          )
        );
      });

      const tokenInput = container.querySelector("[data-testid='reset-token-input']") as HTMLInputElement;
      expect(tokenInput.value).toBe("valid-token-123");

      const newPassInput = container.querySelector("[data-testid='reset-new-password-input']") as HTMLInputElement;
      const confirmInput = container.querySelector("[data-testid='reset-confirm-password-input']") as HTMLInputElement;
      const form = container.querySelector("form")!;

      await act(async () => {
        fireEvent.change(newPassInput, { target: { value: "NewStrongPassword2026!" } });
        fireEvent.change(confirmInput, { target: { value: "NewStrongPassword2026!" } });
      });

      await act(async () => {
        fireEvent.submit(form);
      });

      expect(resetSpy).toHaveBeenCalledWith("valid-token-123", "NewStrongPassword2026!");
      expect(container.querySelector("[data-testid='reset-success-banner']")).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe("VerifyEmailPage", () => {
    it("submits verification token and displays verified banner", async () => {
      const verifySpy = vi.spyOn(authApi, "verifyEmail").mockResolvedValue({
        success: true,
        message: "Email verified",
        user: {
          id: "u-123",
          email: "student@uni.edu",
          displayName: "Alice",
          avatarUrl: null,
          emailVerified: true,
        },
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(VerifyEmailPage, { standalone: true })
          )
        );
      });

      const tokenInput = container.querySelector("[data-testid='verify-token-input']") as HTMLInputElement;
      const form = container.querySelector("form")!;

      await act(async () => {
        fireEvent.change(tokenInput, { target: { value: "tok-verify-999" } });
      });

      await act(async () => {
        fireEvent.submit(form);
      });

      expect(verifySpy).toHaveBeenCalledWith("tok-verify-999");
      expect(container.querySelector("[data-testid='verify-success-banner']")).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe("UserMenu & Language Localization", () => {
    it("renders login/signup buttons when unauthenticated and switches language between TR and EN", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { initialUser: null, initialLang: "en", autoFetch: false },
            createElement(UserMenu, null)
          )
        );
      });

      // In English
      expect(container.querySelector("[data-testid='header-login-btn']")?.textContent).toContain("Log In");
      expect(container.querySelector("[data-testid='header-signup-btn']")?.textContent).toContain("Sign Up");

      // Switch language to Turkish
      const langToggle = container.querySelector("[data-testid='lang-toggle-btn']") as HTMLButtonElement;
      await act(async () => {
        fireEvent.click(langToggle);
      });

      // In Turkish
      expect(container.querySelector("[data-testid='header-login-btn']")?.textContent).toContain("Giriş Yap");
      expect(container.querySelector("[data-testid='header-signup-btn']")?.textContent).toContain("Kayıt Ol");

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it("renders user avatar and dropdown with logout button when authenticated", async () => {
      const mockUser = {
        id: "student-1",
        email: "yusuf@campus.edu",
        displayName: "Yusuf Kavak",
        avatarUrl: null,
        emailVerified: true,
      };

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { initialUser: mockUser, initialLang: "en", autoFetch: false },
            createElement(UserMenu, null)
          )
        );
      });

      const menuBtn = container.querySelector("[data-testid='user-menu-btn']") as HTMLButtonElement;
      expect(menuBtn).not.toBeNull();
      expect(menuBtn.textContent).toContain("YK"); // Initials of Yusuf Kavak

      // Open dropdown
      await act(async () => {
        fireEvent.click(menuBtn);
      });

      const panel = container.querySelector("[data-testid='user-dropdown-panel']");
      expect(panel).not.toBeNull();
      expect(panel?.textContent).toContain("Yusuf Kavak");
      expect(panel?.textContent).toContain("yusuf@campus.edu");
      expect(panel?.querySelector("[data-testid='user-logout-btn']")).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe("ProtectedRoute", () => {
    it("renders child content when user is authenticated", async () => {
      const mockUser = {
        id: "student-1",
        email: "student@campus.edu",
        displayName: "Student",
        avatarUrl: null,
        emailVerified: true,
      };

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { initialUser: mockUser, autoFetch: false },
            createElement(
              ProtectedRoute,
              null,
              createElement("div", { "data-testid": "protected-doc" }, "Secret Document Content")
            )
          )
        );
      });

      expect(container.querySelector("[data-testid='protected-doc']")).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });
});
