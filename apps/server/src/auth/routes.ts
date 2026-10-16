import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { AuthService, AuthError } from "./authService.js";
import { ensureCsrfCookie, verifyCsrfProtection } from "./csrf.js";
import { generateToken } from "./tokens.js";

export const SESSION_COOKIE_NAME = "citedocs_session";
export const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthRoutesOptions {
  authService: AuthService;
  enableCsrf?: boolean;
  enableRateLimit?: boolean;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  fastify,
  options
) => {
  const { authService } = options;
  const isProd = process.env.NODE_ENV === "production";

  const rateLimitConfig =
    options.enableRateLimit ?? (process.env.NODE_ENV !== "test")
      ? { max: 20, timeWindow: "1 minute" }
      : false;

  const setSessionCookie = (reply: FastifyReply, token: string, expiresAt: Date) => {
    reply.setCookie(SESSION_COOKIE_NAME, token, {
      path: "/",
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      expires: expiresAt,
    });
  };

  const clearSessionCookie = (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
    });
  };

  // CSRF validation on state-changing routes when enabled
  if (options.enableCsrf) {
    fastify.addHook("preHandler", async (request, reply) => {
      await verifyCsrfProtection(request, reply, { enabled: options.enableCsrf });
    });
  }

  // 1. GET /api/auth/providers - Returns enabled OAuth providers
  fastify.get("/api/auth/providers", async () => {
    return authService.oauthService.getProviders();
  });

  // 2. GET /api/auth/csrf - Generates or returns CSRF token
  fastify.get("/api/auth/csrf", async (request, reply) => {
    const csrfToken = ensureCsrfCookie(request, reply);
    return { csrfToken };
  });

  // 3. GET /api/auth/session - Returns active session and current user
  fastify.get("/api/auth/session", async (request, reply) => {
    const cookieToken = request.cookies[SESSION_COOKIE_NAME];
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : undefined;

    const token = cookieToken || bearerToken;
    if (!token) {
      reply.status(401).send({ error: "Unauthorized", message: "No active session" });
      return;
    }

    const sessionData = await authService.validateSession(token);
    if (!sessionData) {
      clearSessionCookie(reply);
      reply.status(401).send({ error: "Unauthorized", message: "Session invalid or expired" });
      return;
    }

    const csrfToken = ensureCsrfCookie(request, reply);
    return {
      user: sessionData.user,
      csrfToken,
    };
  });

  // 4. POST /api/auth/signup - Email/password signup
  fastify.post(
    "/api/auth/signup",
    rateLimitConfig ? { config: { rateLimit: rateLimitConfig } } : {},
    async (request: FastifyRequest<{ Body: { email?: string; password?: string; displayName?: string } }>, reply) => {
      try {
        const { email = "", password = "", displayName } = request.body || {};
        const metadata = {
          userAgent: request.headers["user-agent"] || null,
          ipAddress: request.ip || null,
        };

        const result = await authService.signup({ email, password, displayName }, metadata);
        setSessionCookie(reply, result.token, result.session.expiresAt);
        const csrfToken = ensureCsrfCookie(request, reply);

        reply.status(201).send({
          user: result.user,
          csrfToken,
        });
      } catch (err: unknown) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({ error: err.code, message: err.message });
          return;
        }
        throw err;
      }
    }
  );

  // 5. POST /api/auth/login - Email/password login
  fastify.post(
    "/api/auth/login",
    rateLimitConfig ? { config: { rateLimit: rateLimitConfig } } : {},
    async (request: FastifyRequest<{ Body: { email?: string; password?: string } }>, reply) => {
      try {
        const { email = "", password = "" } = request.body || {};
        const metadata = {
          userAgent: request.headers["user-agent"] || null,
          ipAddress: request.ip || null,
        };

        const result = await authService.login({ email, password }, metadata);
        setSessionCookie(reply, result.token, result.session.expiresAt);
        const csrfToken = ensureCsrfCookie(request, reply);

        return {
          user: result.user,
          csrfToken,
        };
      } catch (err: unknown) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({ error: err.code, message: err.message });
          return;
        }
        throw err;
      }
    }
  );

  // 6. POST /api/auth/logout - Terminate session
  fastify.post("/api/auth/logout", async (request, reply) => {
    const cookieToken = request.cookies[SESSION_COOKIE_NAME];
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : undefined;

    const token = cookieToken || bearerToken;
    if (token) {
      await authService.logout(token);
    }

    clearSessionCookie(reply);
    return { success: true };
  });

  // 7. POST /api/auth/verify-email - Verify email address
  fastify.post(
    "/api/auth/verify-email",
    async (
      request: FastifyRequest<{
        Body?: { token?: string };
        Querystring?: { token?: string };
      }>,
      reply
    ) => {
      try {
        const token = request.body?.token || request.query?.token || "";
        const result = await authService.verifyEmail(token);
        return result;
      } catch (err: unknown) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({ error: err.code, message: err.message });
          return;
        }
        throw err;
      }
    }
  );

  // 8. POST /api/auth/resend-verification - Resend verification email
  fastify.post(
    "/api/auth/resend-verification",
    async (
      request: FastifyRequest<{ Body?: { email?: string } }>,
      reply
    ) => {
      try {
        const cookieToken = request.cookies[SESSION_COOKIE_NAME];
        let userId: string | undefined;

        if (cookieToken) {
          const session = await authService.validateSession(cookieToken);
          if (session) {
            userId = session.user.id;
          }
        }

        if (!userId && request.body?.email) {
          const user = await authService.authRepo.findUserByEmail(request.body.email);
          if (user) {
            userId = user.id;
          }
        }

        if (!userId) {
          reply.status(401).send({ error: "Unauthorized", message: "User not found or unauthenticated" });
          return;
        }

        const result = await authService.resendVerification(userId);
        return result;
      } catch (err: unknown) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({ error: err.code, message: err.message });
          return;
        }
        throw err;
      }
    }
  );

  // 9. POST /api/auth/forgot-password - Request password reset link
  fastify.post(
    "/api/auth/forgot-password",
    rateLimitConfig ? { config: { rateLimit: rateLimitConfig } } : {},
    async (request: FastifyRequest<{ Body?: { email?: string } }>, reply) => {
      try {
        const email = request.body?.email || "";
        const result = await authService.forgotPassword(email);
        return result;
      } catch (err: unknown) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({ error: err.code, message: err.message });
          return;
        }
        throw err;
      }
    }
  );

  // 10. POST /api/auth/reset-password - Complete password reset
  fastify.post(
    "/api/auth/reset-password",
    rateLimitConfig ? { config: { rateLimit: rateLimitConfig } } : {},
    async (request: FastifyRequest<{ Body?: { token?: string; newPassword?: string } }>, reply) => {
      try {
        const { token = "", newPassword = "" } = request.body || {};
        const result = await authService.resetPassword(token, newPassword);
        return result;
      } catch (err: unknown) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({ error: err.code, message: err.message });
          return;
        }
        throw err;
      }
    }
  );

  // 11. OAuth Initiation: Google
  fastify.get("/api/auth/oauth/google", async (request, reply) => {
    if (!authService.oauthService.isGoogleEnabled()) {
      reply.status(404).send({ error: "NotFound", message: "Google OAuth is not configured" });
      return;
    }

    const state = generateToken(16);
    reply.setCookie("citedocs_oauth_state", state, {
      path: "/",
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    });

    const fallbackRedirect = `${request.protocol}://${request.hostname}/api/auth/oauth/google/callback`;
    const authUrl = authService.oauthService.getGoogleAuthUrl(state, fallbackRedirect);
    reply.redirect(authUrl);
  });

  // 12. OAuth Callback: Google
  fastify.get(
    "/api/auth/oauth/google/callback",
    async (
      request: FastifyRequest<{
        Querystring: { code?: string; state?: string; error?: string };
      }>,
      reply
    ) => {
      try {
        const { code, error } = request.query;
        if (error || !code) {
          reply.redirect(`${authService.clientBaseUrl}/login?error=oauth_failed`);
          return;
        }

        const fallbackRedirect = `${request.protocol}://${request.hostname}/api/auth/oauth/google/callback`;
        const profile = await authService.oauthService.handleGoogleCallback(code, fallbackRedirect);
        const metadata = {
          userAgent: request.headers["user-agent"] || null,
          ipAddress: request.ip || null,
        };

        const result = await authService.handleOAuthUser(profile, metadata);
        setSessionCookie(reply, result.token, result.session.expiresAt);
        ensureCsrfCookie(request, reply);

        reply.redirect(`${authService.clientBaseUrl}/?auth=success`);
      } catch {
        reply.redirect(`${authService.clientBaseUrl}/login?error=oauth_error`);
      }
    }
  );

  // 13. OAuth Initiation: ORCID
  fastify.get("/api/auth/oauth/orcid", async (request, reply) => {
    if (!authService.oauthService.isOrcidEnabled()) {
      reply.status(404).send({ error: "NotFound", message: "ORCID OAuth is not configured" });
      return;
    }

    const state = generateToken(16);
    reply.setCookie("citedocs_oauth_state", state, {
      path: "/",
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 600,
    });

    const fallbackRedirect = `${request.protocol}://${request.hostname}/api/auth/oauth/orcid/callback`;
    const authUrl = authService.oauthService.getOrcidAuthUrl(state, fallbackRedirect);
    reply.redirect(authUrl);
  });

  // 14. OAuth Callback: ORCID
  fastify.get(
    "/api/auth/oauth/orcid/callback",
    async (
      request: FastifyRequest<{
        Querystring: { code?: string; state?: string; error?: string };
      }>,
      reply
    ) => {
      try {
        const { code, error } = request.query;
        if (error || !code) {
          reply.redirect(`${authService.clientBaseUrl}/login?error=oauth_failed`);
          return;
        }

        const fallbackRedirect = `${request.protocol}://${request.hostname}/api/auth/oauth/orcid/callback`;
        const profile = await authService.oauthService.handleOrcidCallback(code, fallbackRedirect);
        const metadata = {
          userAgent: request.headers["user-agent"] || null,
          ipAddress: request.ip || null,
        };

        const result = await authService.handleOAuthUser(profile, metadata);
        setSessionCookie(reply, result.token, result.session.expiresAt);
        ensureCsrfCookie(request, reply);

        reply.redirect(`${authService.clientBaseUrl}/?auth=success`);
      } catch {
        reply.redirect(`${authService.clientBaseUrl}/login?error=oauth_error`);
      }
    }
  );

  // 15. POST /api/auth/oauth/callback - Direct API callback for SPA testing/mocking
  fastify.post(
    "/api/auth/oauth/callback",
    async (
      request: FastifyRequest<{
        Body: { provider?: "google" | "orcid"; code?: string };
      }>,
      reply
    ) => {
      try {
        const { provider, code } = request.body || {};
        if (!provider || !code) {
          reply.status(400).send({ error: "BadRequest", message: "Provider and code are required" });
          return;
        }

        let profile;
        if (provider === "google") {
          profile = await authService.oauthService.handleGoogleCallback(code);
        } else if (provider === "orcid") {
          profile = await authService.oauthService.handleOrcidCallback(code);
        } else {
          reply.status(400).send({ error: "BadRequest", message: "Unsupported provider" });
          return;
        }

        const metadata = {
          userAgent: request.headers["user-agent"] || null,
          ipAddress: request.ip || null,
        };
        const result = await authService.handleOAuthUser(profile, metadata);
        setSessionCookie(reply, result.token, result.session.expiresAt);
        const csrfToken = ensureCsrfCookie(request, reply);

        return {
          user: result.user,
          csrfToken,
        };
      } catch (err: unknown) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({ error: err.code, message: err.message });
          return;
        }
        reply.status(400).send({ error: "OAuthError", message: (err as Error).message });
      }
    }
  );
};
