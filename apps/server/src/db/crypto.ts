import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const DEFAULT_FALLBACK_DEV_KEY = "citedocs-dev-encryption-key-for-local-testing-only-32b";

/**
 * Derives a 32-byte key from the provided secret or environment variable.
 */
function getDerivedKey(customKey?: string): Buffer {
  const secret = customKey || process.env.ENCRYPTION_KEY || DEFAULT_FALLBACK_DEV_KEY;
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext string at rest using AES-256-GCM.
 * Output format: `ivHex:authTagHex:ciphertextHex`
 */
export function encryptAtRest(plaintext: string, secretKey?: string): string {
  if (!plaintext) {
    return "";
  }
  const key = getDerivedKey(secretKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Expects format: `ivHex:authTagHex:ciphertextHex`
 */
export function decryptAtRest(encryptedPayload: string, secretKey?: string): string {
  if (!encryptedPayload) {
    return "";
  }
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format: expected iv:tag:ciphertext");
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const key = getDerivedKey(secretKey);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
