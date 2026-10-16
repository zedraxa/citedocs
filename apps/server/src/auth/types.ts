export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRecord extends AuthUser {
  passwordHash: string | null;
}

export interface SessionRecord {
  id: string; // Session token or hash
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface VerificationTokenRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface OAuthAccountRecord {
  id: string;
  userId: string;
  provider: "google" | "orcid" | string;
  providerUserId: string;
  email: string | null;
  createdAt: Date;
}

export interface AuthProvidersConfig {
  google: boolean;
  orcid: boolean;
}

export interface SignupInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface VerifyEmailInput {
  token: string;
}

export interface Mailer {
  sendVerificationEmail(to: string, token: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, token: string, resetUrl: string): Promise<void>;
}
