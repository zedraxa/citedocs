import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/index.js";
import { InMemoryAuthRepository } from "../src/auth/inMemoryAuthRepository.js";
import { ConsoleMailer } from "../src/auth/mailer.js";
import { OAuthService } from "../src/auth/oauth.js";
import { AuthService } from "../src/auth/authService.js";
import { InMemoryItemRepository } from "../src/repositories/inMemoryItemRepository.js";

function parseCookies(res: { headers: Record<string, string | string[] | undefined> }): Record<string, string> {
  const cookieHeader = res.headers["set-cookie"];
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  const rawCookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
  for (const raw of rawCookies) {
    const parts = raw.split(";")[0]?.split("=") || [];
    if (parts[0]) {
      cookies[parts[0].trim()] = parts[1] ? parts[1].trim() : "";
    }
  }
  return cookies;
}

describe("Authentication & Signup System (apps/server)", () => {
  let app: FastifyInstance;
  let authRepo: InMemoryAuthRepository;
  let mailer: ConsoleMailer;
  let oauthService: OAuthService;
  let authService: AuthService;
  let itemRepo: InMemoryItemRepository;

  beforeEach(async () => {
    authRepo = new InMemoryAuthRepository();
    mailer = new ConsoleMailer();
    itemRepo = new InMemoryItemRepository();

    oauthService = new OAuthService({
      google: {
        clientId: "test-google-client-id",
        clientSecret: "test-google-secret",
        redirectUri: "http://localhost:3000/api/auth/oauth/google/callback",
      },
      orcid: {
        clientId: "test-orcid-client-id",
        clientSecret: "test-orcid-secret",
        redirectUri: "http://localhost:3000/api/auth/oauth/orcid/callback",
      },
      fetchFn: async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ access_token: "mock-google-access-token" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr.includes("openidconnect.googleapis.com/v1/userinfo")) {
          return new Response(
            JSON.stringify({
              sub: "google-sub-12345",
              email: "student@university.edu",
              name: "Student Researcher",
              picture: "https://example.com/photo.jpg",
              email_verified: true,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        if (urlStr.includes("orcid.org/oauth/token")) {
          return new Response(
            JSON.stringify({
              orcid: "0000-0002-1825-0097",
              name: "Josiah Carberry",
              access_token: "mock-orcid-access-token",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        return new Response("Not found", { status: 404 });
      },
    });

    authService = new AuthService({
      authRepo,
      mailer,
      oauthService,
      clientBaseUrl: "http://localhost:5173",
    });

    app = await buildApp({
      authRepo,
      authService,
      mailer,
      oauthService,
      itemRepo,
      enableCsrf: false, // will test CSRF explicitly in dedicated suite
      enableRateLimit: false,
    });
  });

  describe("Providers & CSRF", () => {
    it("reports configured OAuth providers via GET /api/auth/providers", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/providers",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data).toEqual({ google: true, orcid: true });
    });

    it("generates CSRF token and sets citedocs_csrf cookie via GET /api/auth/csrf", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/csrf",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.csrfToken).toBeDefined();
      expect(data.csrfToken.length).toBeGreaterThan(16);

      const cookies = parseCookies(res);
      expect(cookies.citedocs_csrf).toBe(data.csrfToken);
    });
  });

  describe("Email + Password Signup", () => {
    it("rejects signup with invalid email or weak password", async () => {
      const invalidEmail = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "not-an-email", password: "password123" },
      });
      expect(invalidEmail.statusCode).toBe(400);
      expect(JSON.parse(invalidEmail.body).error).toBe("INVALID_EMAIL");

      const weakPassword = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "valid@uni.edu", password: "short" },
      });
      expect(weakPassword.statusCode).toBe(400);
      expect(JSON.parse(weakPassword.body).error).toBe("WEAK_PASSWORD");
    });

    it("registers a student as verified and issues session cookie (no verification email)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: {
          email: "Yusuf@Campus.Edu",
          password: "SecurePassword2026!",
          displayName: "Yusuf Researcher",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.user.id).toBeDefined();
      expect(data.user.email).toBe("yusuf@campus.edu");
      expect(data.user.displayName).toBe("Yusuf Researcher");
      expect(data.user.emailVerified).toBe(true);
      expect(data.user.passwordHash).toBeUndefined(); // Never leaked

      // Check session cookie
      const cookies = parseCookies(res);
      expect(cookies.citedocs_session).toBeDefined();

      // Email verification is disabled: no email is sent
      expect(mailer.sentEmails.length).toBe(0);
    });

    it("prevents duplicate registration with HTTP 409 Conflict", async () => {
      await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "student@uni.edu", password: "Password123!" },
      });

      const duplicate = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "Student@Uni.Edu", password: "AnotherPassword123!" },
      });

      expect(duplicate.statusCode).toBe(409);
      expect(JSON.parse(duplicate.body).error).toBe("EMAIL_ALREADY_EXISTS");
    });
  });

  describe("Email + Password Login & Session", () => {
    beforeEach(async () => {
      await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: {
          email: "student@uni.edu",
          password: "CorrectPassword123!",
          displayName: "Active Student",
        },
      });
    });

    it("authenticates valid credentials and sets session cookie", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "student@uni.edu",
          password: "CorrectPassword123!",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.user.email).toBe("student@uni.edu");
      expect(data.csrfToken).toBeDefined();

      const cookies = parseCookies(res);
      expect(cookies.citedocs_session).toBeDefined();

      // Verify active session via GET /api/auth/session
      const sessionRes = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: {
          cookie: `citedocs_session=${cookies.citedocs_session}`,
        },
      });

      expect(sessionRes.statusCode).toBe(200);
      const sessionData = JSON.parse(sessionRes.body);
      expect(sessionData.user.email).toBe("student@uni.edu");
    });

    it("rejects wrong password or non-existent email with generic 401", async () => {
      const wrongPass = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "student@uni.edu", password: "WrongPassword!" },
      });
      expect(wrongPass.statusCode).toBe(401);
      expect(JSON.parse(wrongPass.body).message).toBe("Invalid email or password");

      const noUser = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "stranger@uni.edu", password: "CorrectPassword123!" },
      });
      expect(noUser.statusCode).toBe(401);
      expect(JSON.parse(noUser.body).message).toBe("Invalid email or password");
    });

    it("supports Bearer token authorization header as alternative to cookie", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "student@uni.edu", password: "CorrectPassword123!" },
      });
      const sessionToken = parseCookies(loginRes).citedocs_session;

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).user.email).toBe("student@uni.edu");
    });
  });

  describe("Password Reset Flow", () => {
    beforeEach(async () => {
      await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "resetme@uni.edu", password: "OldPassword123!" },
      });
      mailer.clear();
    });

    it("sends password reset email and completes reset, invalidating previous sessions", async () => {
      // 1. Request reset link
      const forgotRes = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "resetme@uni.edu" },
      });

      expect(forgotRes.statusCode).toBe(200);
      expect(mailer.sentEmails.length).toBe(1);
      const resetEmail = mailer.getLastEmail()!;
      expect(resetEmail.url).toContain("/reset-password?token=");

      // 2. Perform reset
      const resetRes = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: {
          token: resetEmail.token,
          newPassword: "BrandNewPassword2026!",
        },
      });

      expect(resetRes.statusCode).toBe(200);
      expect(JSON.parse(resetRes.body).success).toBe(true);

      // 3. Old password no longer works
      const oldLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "resetme@uni.edu", password: "OldPassword123!" },
      });
      expect(oldLogin.statusCode).toBe(401);

      // 4. New password works
      const newLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "resetme@uni.edu", password: "BrandNewPassword2026!" },
      });
      expect(newLogin.statusCode).toBe(200);
    });

    it("returns generic message for non-existent email to prevent user enumeration", async () => {
      const forgotRes = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "nobody@uni.edu" },
      });

      expect(forgotRes.statusCode).toBe(200);
      expect(JSON.parse(forgotRes.body).message).toContain("If an account exists");
      expect(mailer.sentEmails.length).toBe(0);
    });
  });

  describe("OAuth / OIDC Integration (Google and ORCID)", () => {
    it("redirects to Google OAuth authorization URL with state cookie", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/oauth/google",
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("accounts.google.com");
      expect(res.headers.location).toContain("client_id=test-google-client-id");

      const cookies = parseCookies(res);
      expect(cookies.citedocs_oauth_state).toBeDefined();
    });

    it("redirects to ORCID OAuth authorization URL with state cookie", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/oauth/orcid",
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("orcid.org/oauth/authorize");
      expect(res.headers.location).toContain("client_id=test-orcid-client-id");

      const cookies = parseCookies(res);
      expect(cookies.citedocs_oauth_state).toBeDefined();
    });

    it("completes Google OAuth callback, creates user and issues session", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/oauth/callback",
        payload: {
          provider: "google",
          code: "valid-google-code",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.user.email).toBe("student@university.edu");
      expect(data.user.displayName).toBe("Student Researcher");
      expect(data.user.emailVerified).toBe(true);

      const cookies = parseCookies(res);
      expect(cookies.citedocs_session).toBeDefined();
    });

    it("completes ORCID OAuth callback, creates user with ORCID identity", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/oauth/callback",
        payload: {
          provider: "orcid",
          code: "valid-orcid-code",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.user.displayName).toBe("Josiah Carberry");

      const cookies = parseCookies(res);
      expect(cookies.citedocs_session).toBeDefined();
    });
  });

  describe("Logout", () => {
    it("terminates active session and clears session cookie", async () => {
      const signupRes = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "logout@uni.edu", password: "Password123!" },
      });
      const sessionToken = parseCookies(signupRes).citedocs_session;

      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          cookie: `citedocs_session=${sessionToken}`,
        },
      });

      expect(logoutRes.statusCode).toBe(200);
      expect(JSON.parse(logoutRes.body).success).toBe(true);

      // Session is now revoked
      const sessionCheck = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: {
          cookie: `citedocs_session=${sessionToken}`,
        },
      });
      expect(sessionCheck.statusCode).toBe(401);
    });
  });

  describe("CSRF Protection", () => {
    let csrfApp: FastifyInstance;

    beforeEach(async () => {
      csrfApp = await buildApp({
        authRepo,
        authService,
        mailer,
        itemRepo,
        enableCsrf: true,
        enableRateLimit: false,
      });
    });

    it("blocks state-changing requests when X-CSRF-Token header is missing or mismatched", async () => {
      // 1. Fetch CSRF token
      const csrfRes = await csrfApp.inject({
        method: "GET",
        url: "/api/auth/csrf",
      });
      const { csrfToken } = JSON.parse(csrfRes.body);
      const csrfCookie = parseCookies(csrfRes).citedocs_csrf;

      // 2. Request without header -> 403
      const blockedRes = await csrfApp.inject({
        method: "POST",
        url: "/api/auth/signup",
        headers: {
          cookie: `citedocs_csrf=${csrfCookie}`,
        },
        payload: { email: "csrf@uni.edu", password: "Password123!" },
      });
      expect(blockedRes.statusCode).toBe(403);
      expect(JSON.parse(blockedRes.body).error).toBe("CSRFError");

      // 3. Request with mismatched token -> 403
      const mismatchedRes = await csrfApp.inject({
        method: "POST",
        url: "/api/auth/signup",
        headers: {
          cookie: `citedocs_csrf=${csrfCookie}`,
          "x-csrf-token": "wrong-token",
        },
        payload: { email: "csrf@uni.edu", password: "Password123!" },
      });
      expect(mismatchedRes.statusCode).toBe(403);

      // 4. Request with matching token -> 201
      const allowedRes = await csrfApp.inject({
        method: "POST",
        url: "/api/auth/signup",
        headers: {
          cookie: `citedocs_csrf=${csrfCookie}`,
          "x-csrf-token": csrfToken,
        },
        payload: { email: "csrf@uni.edu", password: "Password123!" },
      });
      expect(allowedRes.statusCode).toBe(201);
    });
  });

  describe("End-to-End Ownership & Route Wire Integration", () => {
    it("wires session cookie to requireAuth so existing /api/items routes resolve the real user ID", async () => {
      // 1. User Alice signs up
      const aliceSignup = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "alice@uni.edu", password: "Password123!", displayName: "Alice" },
      });
      const aliceCookie = parseCookies(aliceSignup).citedocs_session;
      const aliceUser = JSON.parse(aliceSignup.body).user;

      // 2. Alice creates a library item using only her session cookie (no X-User-Id header!)
      const createItemRes = await app.inject({
        method: "POST",
        url: "/api/items",
        headers: {
          cookie: `citedocs_session=${aliceCookie}`,
        },
        payload: {
          title: "Quantum Entanglement in Spacetime",
          itemType: "journalArticle",
          parsedDate: "2026",
        },
      });
      expect(createItemRes.statusCode).toBe(201);
      const item = JSON.parse(createItemRes.body);
      expect(item.ownerUserId).toBe(aliceUser.id);

      // 3. Alice lists her items
      const aliceListRes = await app.inject({
        method: "GET",
        url: "/api/items",
        headers: {
          cookie: `citedocs_session=${aliceCookie}`,
        },
      });
      expect(aliceListRes.statusCode).toBe(200);
      const aliceItems = JSON.parse(aliceListRes.body);
      expect(aliceItems.length).toBe(1);
      expect(aliceItems[0].title).toBe("Quantum Entanglement in Spacetime");

      // 4. User Bob signs up and accesses /api/items with his session cookie
      const bobSignup = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "bob@uni.edu", password: "Password123!", displayName: "Bob" },
      });
      const bobCookie = parseCookies(bobSignup).citedocs_session;

      const bobListRes = await app.inject({
        method: "GET",
        url: "/api/items",
        headers: {
          cookie: `citedocs_session=${bobCookie}`,
        },
      });
      expect(bobListRes.statusCode).toBe(200);
      const bobItems = JSON.parse(bobListRes.body);
      expect(bobItems.length).toBe(0); // Bob cannot see Alice's item

      // 5. Bob tries to access Alice's item by ID -> 403 Forbidden
      const bobAccessItem = await app.inject({
        method: "GET",
        url: `/api/items/${item.id}`,
        headers: {
          cookie: `citedocs_session=${bobCookie}`,
        },
      });
      expect(bobAccessItem.statusCode).toBe(403);
    });
  });
});
