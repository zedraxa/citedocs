import type { FastifyRequest, FastifyReply } from "fastify";
import { generateCsrfToken } from "./tokens.js";

export const CSRF_COOKIE_NAME = "citedocs_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

export interface CsrfOptions {
  enabled?: boolean;
  cookieSecure?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

/**
 * Ensures a CSRF token cookie is present on the client response.
 * If not already set, generates a new cryptographically secure token.
 */
export function ensureCsrfCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  options: CsrfOptions = {}
): string {
  const existingCookie = request.cookies[CSRF_COOKIE_NAME];
  if (existingCookie && typeof existingCookie === "string" && existingCookie.length >= 16) {
    return existingCookie;
  }

  const newToken = generateCsrfToken();
  const secure = options.cookieSecure ?? (process.env.NODE_ENV === "production");
  const sameSite = options.sameSite ?? "lax";

  reply.setCookie(CSRF_COOKIE_NAME, newToken, {
    path: "/",
    httpOnly: false, // Must be readable by client JS to send in X-CSRF-Token header
    secure,
    sameSite,
  });

  return newToken;
}

/**
 * Verifies that state-changing requests carry a valid X-CSRF-Token matching the CSRF cookie.
 */
export async function verifyCsrfProtection(
  request: FastifyRequest,
  reply: FastifyReply,
  options: CsrfOptions = {}
): Promise<void> {
  if (options.enabled === false) {
    return;
  }

  // Safe HTTP methods do not change state
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(request.method)) {
    return;
  }

  // Exclude OAuth callback redirects and webhooks
  const path = request.url.split("?")[0];
  if (
    path.startsWith("/api/auth/oauth/google/callback") ||
    path.startsWith("/api/auth/oauth/orcid/callback") ||
    path.startsWith("/wopi/") ||
    /^\/api\/onlyoffice\/callback\/[^/]+$/.test(path)
  ) {
    return;
  }

  const csrfCookie = request.cookies[CSRF_COOKIE_NAME];
  const csrfHeader = request.headers[CSRF_HEADER_NAME];

  if (
    !csrfCookie ||
    !csrfHeader ||
    typeof csrfHeader !== "string" ||
    csrfHeader.trim() !== csrfCookie.trim()
  ) {
    reply.status(403).send({
      error: "CSRFError",
      message: "Invalid or missing CSRF token. Please refresh or retry.",
    });
    return;
  }
}
