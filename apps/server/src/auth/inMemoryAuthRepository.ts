import crypto from "node:crypto";
import type { IAuthRepository } from "./repository.js";
import type {
  UserRecord,
  SessionRecord,
  VerificationTokenRecord,
  PasswordResetTokenRecord,
  OAuthAccountRecord,
} from "./types.js";

export class InMemoryAuthRepository implements IAuthRepository {
  public users = new Map<string, UserRecord>();
  public sessions = new Map<string, SessionRecord>();
  public verificationTokens = new Map<string, VerificationTokenRecord>();
  public passwordResetTokens = new Map<string, PasswordResetTokenRecord>();
  public oauthAccounts = new Map<string, OAuthAccountRecord>();

  async createUser(data: {
    id?: string;
    email: string;
    passwordHash?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    emailVerified?: boolean;
  }): Promise<UserRecord> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const user: UserRecord = {
      id,
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash || null,
      displayName: data.displayName || null,
      avatarUrl: data.avatarUrl || null,
      emailVerified: data.emailVerified ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return { ...user };
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email === normalized) {
        return { ...user };
      }
    }
    return null;
  }

  async updateUser(
    id: string,
    data: Partial<{
      passwordHash: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      emailVerified: boolean;
    }>
  ): Promise<UserRecord | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updated: UserRecord = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return { ...updated };
  }

  async createSession(data: {
    id: string;
    userId: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: data.id,
      userId: data.userId,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      userAgent: data.userAgent || null,
      ipAddress: data.ipAddress || null,
    };
    this.sessions.set(session.id, session);
    return { ...session };
  }

  async findSessionById(id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    return session ? { ...session } : null;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    for (const [id, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(id);
      }
    }
  }

  async createVerificationToken(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord> {
    const record: VerificationTokenRecord = {
      id: crypto.randomUUID(),
      userId: data.userId,
      token: data.token,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.verificationTokens.set(data.token, record);
    return { ...record };
  }

  async findVerificationToken(token: string): Promise<VerificationTokenRecord | null> {
    const item = this.verificationTokens.get(token);
    return item ? { ...item } : null;
  }

  async deleteVerificationToken(token: string): Promise<void> {
    this.verificationTokens.delete(token);
  }

  async createPasswordResetToken(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenRecord> {
    const record: PasswordResetTokenRecord = {
      id: crypto.randomUUID(),
      userId: data.userId,
      token: data.token,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.passwordResetTokens.set(data.token, record);
    return { ...record };
  }

  async findPasswordResetToken(token: string): Promise<PasswordResetTokenRecord | null> {
    const item = this.passwordResetTokens.get(token);
    return item ? { ...item } : null;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    this.passwordResetTokens.delete(token);
  }

  async findOAuthAccount(provider: string, providerUserId: string): Promise<OAuthAccountRecord | null> {
    const key = `${provider}:${providerUserId}`;
    const account = this.oauthAccounts.get(key);
    return account ? { ...account } : null;
  }

  async createOAuthAccount(data: {
    userId: string;
    provider: string;
    providerUserId: string;
    email?: string | null;
  }): Promise<OAuthAccountRecord> {
    const record: OAuthAccountRecord = {
      id: crypto.randomUUID(),
      userId: data.userId,
      provider: data.provider,
      providerUserId: data.providerUserId,
      email: data.email || null,
      createdAt: new Date(),
    };
    const key = `${data.provider}:${data.providerUserId}`;
    this.oauthAccounts.set(key, record);
    return { ...record };
  }

  clear(): void {
    this.users.clear();
    this.sessions.clear();
    this.verificationTokens.clear();
    this.passwordResetTokens.clear();
    this.oauthAccounts.clear();
  }
}
