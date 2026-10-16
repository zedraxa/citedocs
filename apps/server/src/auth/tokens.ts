import crypto from "node:crypto";

/**
 * Generates a cryptographically secure random hex token.
 */
export function generateToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

export function generateSessionToken(): string {
  return generateToken(32); // 64 hex characters
}

export function generateVerificationToken(): string {
  return generateToken(32);
}

export function generatePasswordResetToken(): string {
  return generateToken(32);
}

export function generateCsrfToken(): string {
  return generateToken(24);
}
