import { type FastifyRequest, type FastifyReply } from "fastify";
import type { AuthService } from "./authService.js";
import type { AuthUser, SessionRecord } from "./types.js";
import { SESSION_COOKIE_NAME } from "./routes.js";

declare module "fastify" {
  interface FastifyInstance {
    authService?: AuthService;
  }
  interface FastifyRequest {
    userId: string;
    user?: AuthUser;
    session?: SessionRecord;
    authService?: AuthService;
  }
}

/**
 * Authentication middleware for CiteDocs.
 *
 * Resolves user identity from:
 * 1. Secure HTTP-only session cookie (`citedocs_session`)
 * 2. `Authorization: Bearer <session-token>` header
 * 3. Test-only `X-User-Id` header (never accepted outside NODE_ENV=test)
 *
 * Injects `request.userId`, `request.user`, and `request.session`.
 * Rejects unauthenticated requests with HTTP 401 Unauthorized.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authService: AuthService | undefined =
    request.authService || request.server.authService;

  // 1. Try resolving real session from cookie or Authorization header
  const cookieToken = request.cookies ? request.cookies[SESSION_COOKIE_NAME] : undefined;
  const authHeader = request.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : undefined;

  const sessionToken = cookieToken || bearerToken;

  if (sessionToken && authService) {
    const sessionData = await authService.validateSession(sessionToken);
    if (sessionData) {
      request.userId = sessionData.user.id;
      request.user = sessionData.user;
      request.session = sessionData.session;
      return;
    }
  }

  // 2. Fallback to X-User-Id header (preserves backward compatibility with existing tests)
  const userIdHeader = request.headers["x-user-id"];
  if (process.env.NODE_ENV === "test" && userIdHeader && typeof userIdHeader === "string" && userIdHeader.trim() !== "") {
    request.userId = userIdHeader.trim();
    return;
  }

  // 3. Unauthenticated: send 401 (or redirect if browser navigation to oauth/start)
  if (request.url.startsWith("/api/zotero/oauth/start")) {
    const q = (request.query || {}) as { returnTo?: string };
    const returnTo = q.returnTo && q.returnTo.startsWith("/") && !q.returnTo.startsWith("//") ? q.returnTo : "/documents";
    const accept = request.headers.accept || "";
    if (accept.includes("text/html") || (q.returnTo && !accept.includes("application/json"))) {
      return reply.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }

  reply.status(401).send({
    error: "Unauthorized",
    message: "Missing or invalid session",
  });
}
