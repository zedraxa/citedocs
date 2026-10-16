import { hashPassword, verifyPassword } from "./passwords.js";
import {
  generateSessionToken,
  generateVerificationToken,
  generatePasswordResetToken,
} from "./tokens.js";
import type { IAuthRepository } from "./repository.js";
import type { Mailer } from "./types.js";
import type {
  AuthUser,
  SessionRecord,
  SignupInput,
  LoginInput,
  UserRecord,
} from "./types.js";
import { OAuthService, type OAuthUserProfile } from "./oauth.js";

export class AuthError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "AUTH_ERROR") {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface AuthServiceOptions {
  authRepo: IAuthRepository;
  mailer: Mailer;
  oauthService?: OAuthService;
  clientBaseUrl?: string;
  sessionDurationDays?: number;
}

export class AuthService {
  public authRepo: IAuthRepository;
  public mailer: Mailer;
  public oauthService: OAuthService;
  public clientBaseUrl: string;
  public sessionDurationMs: number;

  constructor(options: AuthServiceOptions) {
    this.authRepo = options.authRepo;
    this.mailer = options.mailer;
    this.oauthService = options.oauthService || new OAuthService();
    this.clientBaseUrl =
      options.clientBaseUrl || process.env.CLIENT_URL || "http://localhost:5173";
    const days = options.sessionDurationDays ?? 30;
    this.sessionDurationMs = days * 24 * 60 * 60 * 1000;
  }

  private sanitizeUser(user: UserRecord): AuthUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private validateEmail(email: string): string {
    const trimmed = (email || "").trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new AuthError("Please provide a valid email address", 400, "INVALID_EMAIL");
    }
    return trimmed;
  }

  private validatePassword(password: string): void {
    if (!password || password.length < 8) {
      throw new AuthError(
        "Password must be at least 8 characters long",
        400,
        "WEAK_PASSWORD"
      );
    }
  }

  async signup(
    input: SignupInput,
    metadata?: { userAgent?: string | null; ipAddress?: string | null }
  ): Promise<{ user: AuthUser; session: SessionRecord; token: string }> {
    const email = this.validateEmail(input.email);
    this.validatePassword(input.password);

    const existing = await this.authRepo.findUserByEmail(email);
    if (existing) {
      throw new AuthError(
        "An account with this email already exists",
        409,
        "EMAIL_ALREADY_EXISTS"
      );
    }

    const hashedPassword = await hashPassword(input.password);
    const userRecord = await this.authRepo.createUser({
      email,
      passwordHash: hashedPassword,
      displayName: input.displayName?.trim() || email.split("@")[0],
      // Email verification is disabled: accounts are usable immediately after signup.
      emailVerified: true,
    });

    // Create session
    const sessionToken = generateSessionToken();
    const sessionExpiry = new Date(Date.now() + this.sessionDurationMs);
    const session = await this.authRepo.createSession({
      id: sessionToken,
      userId: userRecord.id,
      expiresAt: sessionExpiry,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
    });

    return {
      user: this.sanitizeUser(userRecord),
      session,
      token: sessionToken,
    };
  }

  async login(
    input: LoginInput,
    metadata?: { userAgent?: string | null; ipAddress?: string | null }
  ): Promise<{ user: AuthUser; session: SessionRecord; token: string }> {
    const email = this.validateEmail(input.email);
    if (!input.password) {
      throw new AuthError("Password is required", 400, "MISSING_PASSWORD");
    }

    const userRecord = await this.authRepo.findUserByEmail(email);
    if (!userRecord || !userRecord.passwordHash) {
      // Generic error message to prevent user enumeration
      throw new AuthError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    const isValid = await verifyPassword(input.password, userRecord.passwordHash);
    if (!isValid) {
      throw new AuthError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // Create session
    const sessionToken = generateSessionToken();
    const sessionExpiry = new Date(Date.now() + this.sessionDurationMs);
    const session = await this.authRepo.createSession({
      id: sessionToken,
      userId: userRecord.id,
      expiresAt: sessionExpiry,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
    });

    return {
      user: this.sanitizeUser(userRecord),
      session,
      token: sessionToken,
    };
  }

  async verifyEmail(token: string): Promise<{ success: boolean; message: string; user: AuthUser }> {
    if (!token || typeof token !== "string") {
      throw new AuthError("Verification token is required", 400, "INVALID_TOKEN");
    }

    const tokenRecord = await this.authRepo.findVerificationToken(token.trim());
    if (!tokenRecord) {
      throw new AuthError("Invalid or expired verification token", 400, "TOKEN_EXPIRED");
    }

    if (tokenRecord.expiresAt < new Date()) {
      await this.authRepo.deleteVerificationToken(tokenRecord.token);
      throw new AuthError("Verification token has expired. Please request a new one.", 400, "TOKEN_EXPIRED");
    }

    const updatedUser = await this.authRepo.updateUser(tokenRecord.userId, {
      emailVerified: true,
    });

    if (!updatedUser) {
      throw new AuthError("User not found", 404, "USER_NOT_FOUND");
    }

    await this.authRepo.deleteVerificationToken(tokenRecord.token);

    return {
      success: true,
      message: "Email verified successfully",
      user: this.sanitizeUser(updatedUser),
    };
  }

  async resendVerification(userId: string): Promise<{ success: boolean; message: string }> {
    const user = await this.authRepo.findUserById(userId);
    if (!user) {
      throw new AuthError("User not found", 404, "USER_NOT_FOUND");
    }

    if (user.emailVerified) {
      return { success: true, message: "Email is already verified" };
    }

    const token = generateVerificationToken();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.authRepo.createVerificationToken({
      userId: user.id,
      token,
      expiresAt: expiry,
    });

    const verifyUrl = `${this.clientBaseUrl}/verify-email?token=${token}`;
    await this.mailer.sendVerificationEmail(user.email, token, verifyUrl);

    return { success: true, message: "Verification email resent" };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalized = (email || "").trim().toLowerCase();
    if (!normalized) {
      throw new AuthError("Email is required", 400, "INVALID_EMAIL");
    }

    const user = await this.authRepo.findUserByEmail(normalized);
    if (user) {
      const resetToken = generatePasswordResetToken();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await this.authRepo.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt: expiry,
      });

      const resetUrl = `${this.clientBaseUrl}/reset-password?token=${resetToken}`;
      await this.mailer.sendPasswordResetEmail(user.email, resetToken, resetUrl);
    }

    // Always return constant message to avoid email enumeration
    return {
      message: "If an account exists with that email, a password reset link has been sent.",
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!token || typeof token !== "string") {
      throw new AuthError("Reset token is required", 400, "INVALID_TOKEN");
    }
    this.validatePassword(newPassword);

    const tokenRecord = await this.authRepo.findPasswordResetToken(token.trim());
    if (!tokenRecord) {
      throw new AuthError("Invalid or expired password reset token", 400, "TOKEN_EXPIRED");
    }

    if (tokenRecord.expiresAt < new Date()) {
      await this.authRepo.deletePasswordResetToken(tokenRecord.token);
      throw new AuthError("Password reset token has expired", 400, "TOKEN_EXPIRED");
    }

    const hashedPassword = await hashPassword(newPassword);
    await this.authRepo.updateUser(tokenRecord.userId, {
      passwordHash: hashedPassword,
    });

    await this.authRepo.deletePasswordResetToken(tokenRecord.token);

    // Invalidate all active sessions for security
    await this.authRepo.deleteUserSessions(tokenRecord.userId);

    return {
      success: true,
      message: "Password has been successfully updated",
    };
  }

  async validateSession(
    sessionId: string
  ): Promise<{ user: AuthUser; session: SessionRecord } | null> {
    if (!sessionId || typeof sessionId !== "string") {
      return null;
    }

    const session = await this.authRepo.findSessionById(sessionId);
    if (!session) {
      return null;
    }

    if (session.expiresAt < new Date()) {
      await this.authRepo.deleteSession(session.id);
      return null;
    }

    const user = await this.authRepo.findUserById(session.userId);
    if (!user) {
      await this.authRepo.deleteSession(session.id);
      return null;
    }

    return {
      user: this.sanitizeUser(user),
      session,
    };
  }

  async logout(sessionId: string): Promise<void> {
    if (sessionId) {
      await this.authRepo.deleteSession(sessionId);
    }
  }

  async handleOAuthUser(
    profile: OAuthUserProfile,
    metadata?: { userAgent?: string | null; ipAddress?: string | null }
  ): Promise<{ user: AuthUser; session: SessionRecord; token: string }> {
    // 1. Check if OAuth account is already linked
    const existingOAuth = await this.authRepo.findOAuthAccount(
      profile.provider,
      profile.providerUserId
    );

    let userRecord: UserRecord | null = null;

    if (existingOAuth) {
      userRecord = await this.authRepo.findUserById(existingOAuth.userId);
    }

    // 2. If not linked, check if user with matching email exists
    if (!userRecord && profile.email) {
      userRecord = await this.authRepo.findUserByEmail(profile.email);
    }

    // 3. If user doesn't exist, create free student account
    if (!userRecord) {
      const email = profile.email || `${profile.provider}_${profile.providerUserId}@citedocs.local`;
      userRecord = await this.authRepo.createUser({
        email,
        displayName: profile.displayName || email.split("@")[0],
        avatarUrl: profile.avatarUrl || null,
        emailVerified: profile.emailVerified,
      });
    }

    // 4. Ensure OAuth account record is linked
    if (!existingOAuth) {
      await this.authRepo.createOAuthAccount({
        userId: userRecord.id,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email || null,
      });
    }

    // 5. Create new session
    const sessionToken = generateSessionToken();
    const sessionExpiry = new Date(Date.now() + this.sessionDurationMs);
    const session = await this.authRepo.createSession({
      id: sessionToken,
      userId: userRecord.id,
      expiresAt: sessionExpiry,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
    });

    return {
      user: this.sanitizeUser(userRecord),
      session,
      token: sessionToken,
    };
  }
}
