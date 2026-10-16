import { createHmac, timingSafeEqual } from "node:crypto";
import type { WopiTokenPayload } from "./types.js";

const DEFAULT_WOPI_SECRET = "citedocs-wopi-secret-key-default-for-dev-32b";
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

export class WopiTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WopiTokenError";
  }
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

function getWopiSecret(customSecret?: string): string {
  return customSecret || process.env.WOPI_SECRET || process.env.ENCRYPTION_KEY || DEFAULT_WOPI_SECRET;
}

export interface CreateWopiTokenOptions {
  fileId: string;
  userId: string;
  userName?: string;
  canWrite?: boolean;
  ttlMs?: number;
}

export interface CreateWopiTokenResult {
  token: string;
  ttl: number;
  expiresAt: number;
}

/**
 * Creates a signed, short-lived WOPI access token bound to a specific user and fileId.
 */
export function createWopiToken(
  options: CreateWopiTokenOptions,
  secretKey?: string,
): CreateWopiTokenResult {
  const secret = getWopiSecret(secretKey);
  const now = Date.now();
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const expiresAt = now + ttl;

  const payload: WopiTokenPayload = {
    fileId: options.fileId,
    userId: options.userId,
    userName: options.userName || options.userId,
    canWrite: options.canWrite ?? true,
    iat: now,
    exp: expiresAt,
  };

  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);

  const hmac = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const token = `${encodedPayload}.${hmac}`;

  return {
    token,
    ttl,
    expiresAt,
  };
}

/**
 * Verifies a WOPI access token. Throws WopiTokenError if invalid, tampered with, or expired.
 */
export function verifyWopiToken(token: string, secretKey?: string): WopiTokenPayload {
  if (!token || typeof token !== "string") {
    throw new WopiTokenError("Missing or invalid token");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new WopiTokenError("Malformed token structure");
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    throw new WopiTokenError("Empty token payload or signature");
  }

  const secret = getWopiSecret(secretKey);
  const expectedHmac = createHmac("sha256", secret).update(encodedPayload).digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedHmac);

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new WopiTokenError("Invalid token signature");
  }

  let payload: WopiTokenPayload;
  try {
    const jsonStr = base64UrlDecode(encodedPayload);
    payload = JSON.parse(jsonStr) as WopiTokenPayload;
  } catch {
    throw new WopiTokenError("Failed to parse token payload");
  }

  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    throw new WopiTokenError("Token has expired");
  }

  if (!payload.fileId || !payload.userId) {
    throw new WopiTokenError("Incomplete token payload: missing fileId or userId");
  }

  return payload;
}
