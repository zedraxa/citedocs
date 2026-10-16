import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { users } from "../db/schema.js";

/**
 * Sessions table for authenticated users.
 * Supports session revocation, multi-device tracking, and secure cookie matching.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

/**
 * Verification tokens for confirming user email addresses.
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("verification_tokens_user_id_idx").on(table.userId),
    uniqueIndex("verification_tokens_token_idx").on(table.token),
  ]
);

/**
 * Password reset tokens for secure password recovery.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("password_reset_tokens_user_id_idx").on(table.userId),
    uniqueIndex("password_reset_tokens_token_idx").on(table.token),
  ]
);

/**
 * OAuth accounts linked to user identities (Google, ORCID, etc.).
 */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("oauth_accounts_user_id_idx").on(table.userId),
    uniqueIndex("oauth_accounts_provider_uid_idx").on(table.provider, table.providerUserId),
  ]
);

export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

export type VerificationToken = InferSelectModel<typeof verificationTokens>;
export type NewVerificationToken = InferInsertModel<typeof verificationTokens>;

export type PasswordResetToken = InferSelectModel<typeof passwordResetTokens>;
export type NewPasswordResetToken = InferInsertModel<typeof passwordResetTokens>;

export type OAuthAccount = InferSelectModel<typeof oauthAccounts>;
export type NewOAuthAccount = InferInsertModel<typeof oauthAccounts>;
