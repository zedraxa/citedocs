// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import {
  createNetworkError,
  createApiError,
  isNetworkError,
  authApi,
} from "../src/auth/api.js";
import { getLocalizedAuthError } from "../src/auth/i18n.js";
import { formatDocumentDate } from "../src/documents/i18n.js";
import { AuthProvider } from "../src/auth/AuthContext.js";
import { LoginPage } from "../src/auth/LoginPage.js";

describe("API Error Localization & Turkish Error Mapping (BUG-04, BUG-06, BUG-08)", () => {
  describe("Network Error Translation (BUG-08)", () => {
    it("identifies fetch network errors accurately", () => {
      expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
      expect(isNetworkError(new TypeError("fetch failed"))).toBe(true);
      expect(isNetworkError(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
      expect(isNetworkError(new Error("network request failed"))).toBe(true);
      expect(isNetworkError(new Error("ERR_NETWORK_CHANGED"))).toBe(true);
      expect(isNetworkError(new Error("Some business logic error"))).toBe(false);
    });

    it("creates user-friendly Turkish network error message", () => {
      const err = createNetworkError(new TypeError("Failed to fetch"));
      expect(err.message).toBe("Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.");
      expect((err as { code?: string }).code).toBe("NETWORK_ERROR");
    });
  });

  describe("Server Error Code to Turkish Mapping (BUG-04)", () => {
    it("maps 401 INVALID_CREDENTIALS to Turkish", () => {
      const err = createApiError(401, { error: "INVALID_CREDENTIALS", message: "Invalid email or password" });
      expect(err.message).toBe("Geçersiz e-posta veya şifre");
      expect((err as { statusCode?: number }).statusCode).toBe(401);
    });

    it("maps 401 invalid credentials message even without error code", () => {
      const err = createApiError(401, { message: "Invalid email or password" });
      expect(err.message).toBe("Geçersiz e-posta veya şifre");
    });

    it("maps 401 SESSION_EXPIRED or session timeout to Turkish", () => {
      const err = createApiError(401, { error: "SESSION_EXPIRED", message: "Session expired" });
      expect(err.message).toBe("Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.");
    });

    it("maps 429 rate limit errors to Turkish", () => {
      const err = createApiError(429, {
        statusCode: 429,
        error: "Too Many Requests",
        message: "Rate limit exceeded, retry in 1 minute",
      });
      expect(err.message).toBe("Çok fazla istek yapıldı. Lütfen biraz bekleyip tekrar deneyin.");
    });

    it("maps 409 EMAIL_EXISTS to Turkish", () => {
      const err = createApiError(409, { error: "EMAIL_EXISTS", message: "Email already exists" });
      expect(err.message).toBe("Bu e-posta adresi ile zaten bir hesap kayıtlı.");
    });

    it("maps 400 token expiration and invalid token to Turkish", () => {
      const expiredErr = createApiError(400, { error: "TOKEN_EXPIRED", message: "Token has expired" });
      expect(expiredErr.message).toBe("Bağlantı veya kodun süresi dolmuş. Lütfen yeni bir istek gönderin.");

      const invalidErr = createApiError(400, { error: "INVALID_TOKEN", message: "Invalid token" });
      expect(invalidErr.message).toBe("Geçersiz doğrulama veya sıfırlama kodu.");
    });

    it("maps 403 Forbidden / CSRF errors to Turkish", () => {
      const csrfErr = createApiError(403, { error: "Forbidden", message: "Invalid or missing CSRF token" });
      expect(csrfErr.message).toBe("Güvenlik doğrulaması başarısız oldu veya yetkiniz yok.");
    });

    it("maps 404 USER_NOT_FOUND to Turkish", () => {
      const notFoundErr = createApiError(404, { error: "USER_NOT_FOUND", message: "User not found" });
      expect(notFoundErr.message).toBe("Kullanıcı bulunamadı.");
    });

    it("maps server 500+ errors to Turkish", () => {
      const serverErr = createApiError(500, { message: "Internal server error" });
      expect(serverErr.message).toBe("Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.");
    });

    it("handles getLocalizedAuthError directly", () => {
      expect(getLocalizedAuthError("INVALID_CREDENTIALS")).toBe("Geçersiz e-posta veya şifre");
      expect(getLocalizedAuthError("429")).toBe("Çok fazla istek yapıldı. Lütfen biraz bekleyip tekrar deneyin.");
      expect(getLocalizedAuthError("NETWORK_ERROR")).toBe("Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.");
    });
  });

  describe("Document Modified Date/Time Formatting (BUG-06)", () => {
    it("formats ISO date string in Turkish down to hour and minute (tr-TR, Europe/Istanbul)", () => {
      // 07:19 UTC is 10:19 in Europe/Istanbul (+03:00)
      const formatted = formatDocumentDate("2026-10-17T07:19:00Z", "tr");
      expect(formatted).toContain("17 Eki");
      expect(formatted).toContain("10:19");
    });

    it("handles Date objects and invalid date strings gracefully", () => {
      const dateObj = new Date("2026-10-17T11:45:00Z");
      const formatted = formatDocumentDate(dateObj, "tr");
      expect(formatted).toContain("14:45");

      expect(formatDocumentDate("invalid-date-string", "tr")).toBe("invalid-date-string");
    });
  });

  describe("UI Error Banner Integration in LoginPage", () => {
    it("renders Turkish error banner when server returns INVALID_CREDENTIALS", async () => {
      vi.spyOn(authApi, "login").mockRejectedValue(
        createApiError(401, { error: "INVALID_CREDENTIALS", message: "Invalid email or password" })
      );

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
        fireEvent.change(emailInput, { target: { value: "test@example.com" } });
        fireEvent.change(passInput, { target: { value: "WrongPassword" } });
      });

      await act(async () => {
        fireEvent.submit(form);
      });

      const banner = container.querySelector("[data-testid='auth-error-banner']");
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toBe("Geçersiz e-posta veya şifre");
      // Zero English words like "Invalid" or "password"
      expect(banner?.textContent?.toLowerCase()).not.toContain("invalid");
      expect(banner?.textContent?.toLowerCase()).not.toContain("password");

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it("renders friendly Turkish error banner when network fails", async () => {
      vi.spyOn(authApi, "login").mockRejectedValue(
        createNetworkError(new TypeError("Failed to fetch"))
      );

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
        fireEvent.change(emailInput, { target: { value: "test@example.com" } });
        fireEvent.change(passInput, { target: { value: "AnyPassword123" } });
      });

      await act(async () => {
        fireEvent.submit(form);
      });

      const banner = container.querySelector("[data-testid='auth-error-banner']");
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toBe("Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.");
      expect(banner?.textContent?.toLowerCase()).not.toContain("failed to fetch");

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });
});
