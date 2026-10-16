import { eq, and } from "drizzle-orm";
import { getDb, type CitedocsDb } from "../db/client.js";
import { users } from "../db/schema.js";
import {
  sessions,
  verificationTokens,
  passwordResetTokens,
  oauthAccounts,
} from "./schema.js";
import type {
  UserRecord,
  SessionRecord,
  VerificationTokenRecord,
  PasswordResetTokenRecord,
  OAuthAccountRecord,
} from "./types.js";

export interface IAuthRepository {
  createUser(data: {
    id?: string;
    email: string;
    passwordHash?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    emailVerified?: boolean;
  }): Promise<UserRecord>;

  findUserById(id: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  updateUser(
    id: string,
    data: Partial<{
      passwordHash: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      emailVerified: boolean;
    }>
  ): Promise<UserRecord | null>;

  createSession(data: {
    id: string;
    userId: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<SessionRecord>;

  findSessionById(id: string): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  createVerificationToken(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord>;

  findVerificationToken(token: string): Promise<VerificationTokenRecord | null>;
  deleteVerificationToken(token: string): Promise<void>;

  createPasswordResetToken(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenRecord>;

  findPasswordResetToken(token: string): Promise<PasswordResetTokenRecord | null>;
  deletePasswordResetToken(token: string): Promise<void>;

  findOAuthAccount(provider: string, providerUserId: string): Promise<OAuthAccountRecord | null>;
  createOAuthAccount(data: {
    userId: string;
    provider: string;
    providerUserId: string;
    email?: string | null;
  }): Promise<OAuthAccountRecord>;
}

export class AuthRepository implements IAuthRepository {
  private db: CitedocsDb;

  constructor(dbInstance?: CitedocsDb) {
    this.db = dbInstance || getDb();
  }

  async createUser(data: {
    id?: string;
    email: string;
    passwordHash?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    emailVerified?: boolean;
  }): Promise<UserRecord> {
    const [created] = await this.db
      .insert(users)
      .values({
        id: data.id,
        email: data.email.toLowerCase().trim(),
        passwordHash: data.passwordHash || null,
        displayName: data.displayName || null,
        avatarUrl: data.avatarUrl || null,
        emailVerified: data.emailVerified ?? false,
      })
      .returning();

    return created as UserRecord;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return (user as UserRecord) || null;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()));
    return (user as UserRecord) || null;
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
    const [updated] = await this.db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return (updated as UserRecord) || null;
  }

  async createSession(data: {
    id: string;
    userId: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<SessionRecord> {
    const [created] = await this.db
      .insert(sessions)
      .values({
        id: data.id,
        userId: data.userId,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent || null,
        ipAddress: data.ipAddress || null,
      })
      .returning();

    return created as SessionRecord;
  }

  async findSessionById(id: string): Promise<SessionRecord | null> {
    const [session] = await this.db.select().from(sessions).where(eq(sessions.id, id));
    return (session as SessionRecord) || null;
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async createVerificationToken(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord> {
    const [created] = await this.db
      .insert(verificationTokens)
      .values({
        userId: data.userId,
        token: data.token,
        expiresAt: data.expiresAt,
      })
      .returning();

    return created as VerificationTokenRecord;
  }

  async findVerificationToken(token: string): Promise<VerificationTokenRecord | null> {
    const [item] = await this.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.token, token));
    return (item as VerificationTokenRecord) || null;
  }

  async deleteVerificationToken(token: string): Promise<void> {
    await this.db.delete(verificationTokens).where(eq(verificationTokens.token, token));
  }

  async createPasswordResetToken(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenRecord> {
    const [created] = await this.db
      .insert(passwordResetTokens)
      .values({
        userId: data.userId,
        token: data.token,
        expiresAt: data.expiresAt,
      })
      .returning();

    return created as PasswordResetTokenRecord;
  }

  async findPasswordResetToken(token: string): Promise<PasswordResetTokenRecord | null> {
    const [item] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return (item as PasswordResetTokenRecord) || null;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await this.db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  }

  async findOAuthAccount(provider: string, providerUserId: string): Promise<OAuthAccountRecord | null> {
    const [item] = await this.db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerUserId, providerUserId)
        )
      );
    return (item as OAuthAccountRecord) || null;
  }

  async createOAuthAccount(data: {
    userId: string;
    provider: string;
    providerUserId: string;
    email?: string | null;
  }): Promise<OAuthAccountRecord> {
    const [created] = await this.db
      .insert(oauthAccounts)
      .values({
        userId: data.userId,
        provider: data.provider,
        providerUserId: data.providerUserId,
        email: data.email || null,
      })
      .returning();

    return created as OAuthAccountRecord;
  }
}
