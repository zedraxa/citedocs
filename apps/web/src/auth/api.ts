import type { AuthUser, AuthProviders } from "./types.js";

let inMemoryCsrfToken: string | null = null;

export function getCsrfToken(): string | null {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(^|;\s*)citedocs_csrf=([^;]+)/);
    if (match && match[2]) {
      inMemoryCsrfToken = decodeURIComponent(match[2]);
      return inMemoryCsrfToken;
    }
  }
  return null;
}

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export function getApiBaseUrl(): string {
  if (
    typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL
  ) {
    return (import.meta as unknown as { env: { VITE_API_URL: string } }).env.VITE_API_URL;
  }
  return "http://localhost:3000";
}

import { getLocalizedAuthError } from "./i18n.js";

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof TypeError) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("aborterror") ||
    msg.includes("err_")
  );
}

export function createNetworkError(originalError?: unknown): Error {
  const err = new Error("Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.");
  (err as unknown as { statusCode: number; code: string; originalError?: unknown }).statusCode = 0;
  (err as unknown as { statusCode: number; code: string; originalError?: unknown }).code = "NETWORK_ERROR";
  (err as unknown as { statusCode: number; code: string; originalError?: unknown }).originalError = originalError;
  return err;
}

export function createApiError(
  status: number,
  data: Record<string, unknown> | null,
  fallbackMessage?: string
): Error {
  const rawMsg = (data?.message as string) || (data?.error as string) || fallbackMessage;
  const code = (data?.error as string) || (data?.code as string) || String(status);
  const localizedMsg = getLocalizedAuthError(code || status, rawMsg);
  const error = new Error(localizedMsg);
  (error as unknown as { statusCode: number; code?: string; data?: unknown }).statusCode = status;
  (error as unknown as { statusCode: number; code?: string; data?: unknown }).code = code;
  (error as unknown as { statusCode: number; code?: string; data?: unknown }).data = data;
  return error;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  // Include CSRF token on state-changing requests
  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers.set("x-csrf-token", csrf);
    }
    if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
      headers.set("Content-Type", "application/json");
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: "include", // Sends session & CSRF cookies
    });
  } catch (netErr: unknown) {
    if (isNetworkError(netErr)) {
      throw createNetworkError(netErr);
    }
    throw netErr;
  }

  const contentType = res.headers.get("content-type") || "";
  let data: Record<string, unknown> | null = null;
  if (contentType.includes("application/json")) {
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }

  // Update CSRF token if returned in response payload
  if (data && typeof data.csrfToken === "string") {
    setCsrfToken(data.csrfToken);
  }

  if (!res.ok) {
    throw createApiError(res.status, data);
  }

  return (data as T) ?? ({} as T);
}

export const authApi = {
  async getProviders(): Promise<AuthProviders> {
    try {
      return await request<AuthProviders>("/api/auth/providers");
    } catch {
      return { google: false, orcid: false };
    }
  },

  async fetchCsrf(): Promise<string> {
    const data = await request<{ csrfToken: string }>("/api/auth/csrf");
    if (data.csrfToken) {
      setCsrfToken(data.csrfToken);
    }
    return data.csrfToken;
  },

  async getSession(): Promise<{ user: AuthUser; csrfToken: string }> {
    return request<{ user: AuthUser; csrfToken: string }>("/api/auth/session");
  },

  async signup(payload: { email: string; password: string; displayName?: string }): Promise<{ user: AuthUser; csrfToken: string }> {
    return request<{ user: AuthUser; csrfToken: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async login(payload: { email: string; password: string }): Promise<{ user: AuthUser; csrfToken: string }> {
    return request<{ user: AuthUser; csrfToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async logout(): Promise<{ success: boolean }> {
    return request<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
    });
  },

  async verifyEmail(token: string): Promise<{ success: boolean; message: string; user?: AuthUser }> {
    return request<{ success: boolean; message: string; user?: AuthUser }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  async resendVerification(email?: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    return request<{ message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    });
  },

  async oauthCallback(provider: "google" | "orcid", code: string): Promise<{ user: AuthUser; csrfToken: string }> {
    return request<{ user: AuthUser; csrfToken: string }>("/api/auth/oauth/callback", {
      method: "POST",
      body: JSON.stringify({ provider, code }),
    });
  },
};
