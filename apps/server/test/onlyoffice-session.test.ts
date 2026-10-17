import { describe, expect, it } from "vitest";
import { OnlyofficeSessionManager } from "../src/onlyoffice/session.js";

describe("OnlyofficeSessionManager", () => {
  it("keeps key stable during an editing session for the same storage version", () => {
    const manager = new OnlyofficeSessionManager();
    const key1 = manager.getOrCreateSessionKey("doc-1", "v1", 100);
    expect(key1).toBeTruthy();

    // Subsequent calls during the same session with identical storage version return the same key
    const key2 = manager.getOrCreateSessionKey("doc-1", "v1", 100);
    expect(key2).toBe(key1);
  });

  it("shares the session key among concurrent editors for the same document", () => {
    const manager = new OnlyofficeSessionManager();
    // User A joins the session
    const keyUserA = manager.getOrCreateSessionKey("doc-1", "v1", 100);
    expect(keyUserA).toBeTruthy();

    // User B joins concurrently
    const keyUserB = manager.getOrCreateSessionKey("doc-1", "v1", 100);
    expect(keyUserB).toBe(keyUserA);
  });

  it("preserves the session key and advances version, hash and size on force-save", () => {
    const manager = new OnlyofficeSessionManager();
    const key1 = manager.getOrCreateSessionKey("doc-1", "v1", 100);
    expect(key1).toBeTruthy();

    // Save callback updates file to version v2, size 200
    const newKey = manager.recordSave("doc-1", "hash-new-content", 200, "v2", key1);
    expect(newKey).toBeTruthy();
    expect(newKey).toBe(key1);
    expect(manager.getActiveSession("doc-1")?.key).toBe(newKey);
    expect(manager.getActiveSession("doc-1")?.version).toBe("v2");
    expect(manager.getActiveSession("doc-1")?.lastSavedHash).toBe("hash-new-content");
    expect(manager.getActiveSession("doc-1")?.lastSavedSize).toBe(200);
    expect(manager.getOrCreateSessionKey("doc-1", "v2", 200)).toBe(key1);
  });

  it("reopen after save gets the new key", () => {
    const manager = new OnlyofficeSessionManager();
    const key1 = manager.getOrCreateSessionKey("doc-1", "v1", 100);

    // Force-save keeps the session open; status 2 then closes it.
    const savedKey = manager.recordSave("doc-1", "hash-saved", 250, "v2", key1);
    expect(savedKey).toBe(key1);
    manager.closeSession("doc-1");

    // Reopening the document with updated storage metadata (v2, 250) returns the new key
    const reopenedKey = manager.getOrCreateSessionKey("doc-1", "v2", 250);
    expect(reopenedKey).not.toBe(savedKey);
    expect(reopenedKey).not.toBe(key1);
  });

  it("preserves the callback key when force-save arrives without an in-memory session", () => {
    const manager = new OnlyofficeSessionManager();
    expect(manager.recordSave("doc-1", "hash", 200, "v2", "active-ds-key")).toBe("active-ds-key");
    expect(manager.getOrCreateSessionKey("doc-1", "v2", 200)).toBe("active-ds-key");
    manager.closeSession("doc-1");
    expect(manager.getOrCreateSessionKey("doc-1", "v2", 200)).not.toBe("active-ds-key");
  });

  it("generates a new key if storage version changed externally", () => {
    const manager = new OnlyofficeSessionManager();
    const key1 = manager.getOrCreateSessionKey("doc-1", "v1", 100);

    // Storage version updated externally to v2 without recordSave
    const key2 = manager.getOrCreateSessionKey("doc-1", "v2", 150);
    expect(key2).toBeTruthy();
    expect(key2).not.toBe(key1);
  });

  it("clears active session on closeSession (status 2 / 4) and generates a fresh key next open", () => {
    const manager = new OnlyofficeSessionManager();
    const key1 = manager.getOrCreateSessionKey("doc-1", "v1", 100);

    manager.closeSession("doc-1");
    expect(manager.getActiveSession("doc-1")).toBeUndefined();

    const key2 = manager.getOrCreateSessionKey("doc-1", "v1", 100);
    expect(key2).toBeTruthy();
    expect(key2).not.toBe(key1);
  });

  it("tracks content hashes and accurately detects identical content for deduplication", () => {
    const manager = new OnlyofficeSessionManager();
    manager.getOrCreateSessionKey("doc-1", "v1", 100);

    expect(manager.isIdenticalContent("doc-1", "hash-aaa")).toBe(false);

    manager.recordSave("doc-1", "hash-aaa", 120, "v2");
    expect(manager.isIdenticalContent("doc-1", "hash-aaa")).toBe(true);
    expect(manager.isIdenticalContent("doc-1", "hash-bbb")).toBe(false);

    manager.recordSave("doc-1", "hash-bbb", 130, "v3");
    expect(manager.isIdenticalContent("doc-1", "hash-aaa")).toBe(false);
    expect(manager.isIdenticalContent("doc-1", "hash-bbb")).toBe(true);
  });

  it("isolates sessions across different document IDs", () => {
    const manager = new OnlyofficeSessionManager();
    const keyDoc1 = manager.getOrCreateSessionKey("doc-1", "v1", 100);
    const keyDoc2 = manager.getOrCreateSessionKey("doc-2", "v1", 100);

    expect(keyDoc1).not.toBe(keyDoc2);

    manager.closeSession("doc-1");
    // doc-2 remains active
    expect(manager.getOrCreateSessionKey("doc-2", "v1", 100)).toBe(keyDoc2);
  });
});
