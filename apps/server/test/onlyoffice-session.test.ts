import { describe, expect, it } from "vitest";
import { OnlyofficeSessionManager } from "../src/onlyoffice/session.js";

describe("OnlyofficeSessionManager", () => {
  it("maintains the same key during an active session and generates a new key after closing", () => {
    const manager = new OnlyofficeSessionManager();
    const key1 = manager.getOrCreateSessionKey("doc-1", "v1", 100);
    expect(key1).toBeTruthy();

    // Subsequent calls while active return the exact same key
    const key2 = manager.getOrCreateSessionKey("doc-1", "v2", 150);
    expect(key2).toBe(key1);

    // Closing the session (status 2 / 4) clears active key
    manager.closeSession("doc-1");

    // Next session starts with a different key
    const key3 = manager.getOrCreateSessionKey("doc-1", "v2", 150);
    expect(key3).toBeTruthy();
    expect(key3).not.toBe(key1);
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
