import { describe, it, expect } from "vitest";
import { encryptAtRest, decryptAtRest } from "../src/db/crypto.js";

describe("crypto: encryptAtRest and decryptAtRest", () => {
  it("encrypts and decrypts credentials accurately", () => {
    const secret = "zotero_secret_api_key_123456789";
    const encrypted = encryptAtRest(secret);

    expect(encrypted).not.toBe(secret);
    expect(encrypted).toContain(":");

    const decrypted = decryptAtRest(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("produces different ciphertexts for the same plaintext due to random IV", () => {
    const secret = "my_api_key";
    const enc1 = encryptAtRest(secret);
    const enc2 = encryptAtRest(secret);

    expect(enc1).not.toBe(enc2);
    expect(decryptAtRest(enc1)).toBe(secret);
    expect(decryptAtRest(enc2)).toBe(secret);
  });

  it("works with custom encryption key", () => {
    const customKey = "custom-secure-key-32-characters-!";
    const plaintext = "confidential-user-token";

    const encrypted = encryptAtRest(plaintext, customKey);
    const decrypted = decryptAtRest(encrypted, customKey);

    expect(decrypted).toBe(plaintext);

    // Decrypting with wrong key fails
    expect(() => decryptAtRest(encrypted, "wrong-key")).toThrow();
  });

  it("throws on tampered ciphertext or auth tag", () => {
    const encrypted = encryptAtRest("sensitive-token");
    const [iv, tag, cipher] = encrypted.split(":");

    // Corrupt ciphertext
    const corruptedCipher = cipher.slice(0, -2) + (cipher.endsWith("0") ? "1" : "0");
    const tamperedPayload = `${iv}:${tag}:${corruptedCipher}`;

    expect(() => decryptAtRest(tamperedPayload)).toThrow();
  });

  it("throws on invalid payload format", () => {
    expect(() => decryptAtRest("invalid-unformatted-string")).toThrow(
      /Invalid encrypted payload format/
    );
  });

  it("returns empty string when given empty string", () => {
    expect(encryptAtRest("")).toBe("");
    expect(decryptAtRest("")).toBe("");
  });
});
