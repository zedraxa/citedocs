import crypto from "node:crypto";

export interface OnlyofficeSession {
  key: string;
  version: string;
  sessionSeq: number;
  lastSavedHash?: string;
  lastSavedSize?: number;
  startedAt: number;
  lastActiveAt: number;
}

/** Max time an inactive session stays pinned before being recycled (24 hours). */
const SESSION_TTL_MS = 24 * 3600 * 1000;

/**
 * Manages active ONLYOFFICE editing session keys and deduplication state.
 *
 * Requirements:
 * - Live editing session key MUST remain stable across status 6 (force-save) saves
 *   so active editors and joining collaborators do not receive "document changed" errors.
 * - When a session is closed (status 2 or status 4), the active session is cleared
 *   so the next session receives a new, unique document key.
 * - Records SHA-256 content hashes to deduplicate repeated status 6 force-saves with identical content.
 */
export class OnlyofficeSessionManager {
  private sessions = new Map<string, OnlyofficeSession>();
  private documentSequences = new Map<string, number>();

  /**
   * Returns the active session key, or generates a new session key for the document.
   * If a session is already active, returns the existing key to keep the live session intact.
   */
  getOrCreateSessionKey(fileId: string, currentStorageVersion: string, currentStorageSize: number): string {
    const existing = this.sessions.get(fileId);
    const now = Date.now();

    if (existing && now - existing.lastActiveAt < SESSION_TTL_MS) {
      existing.lastActiveAt = now;
      return existing.key;
    }

    const nextSeq = (this.documentSequences.get(fileId) || 0) + 1;
    this.documentSequences.set(fileId, nextSeq);

    const key = crypto
      .createHash("sha256")
      .update(`${fileId}:${currentStorageVersion}:${currentStorageSize}:seq_${nextSeq}`)
      .digest("hex")
      .slice(0, 40);

    this.sessions.set(fileId, {
      key,
      version: currentStorageVersion,
      sessionSeq: nextSeq,
      startedAt: now,
      lastActiveAt: now,
    });

    return key;
  }

  /**
   * Returns the current active session for fileId, if any.
   */
  getActiveSession(fileId: string): OnlyofficeSession | undefined {
    return this.sessions.get(fileId);
  }

  /**
   * Checks if the content hash matches the last saved content for this session.
   */
  isIdenticalContent(fileId: string, contentHash: string): boolean {
    const session = this.sessions.get(fileId);
    return Boolean(session?.lastSavedHash && session.lastSavedHash === contentHash);
  }

  /**
   * Records a save event (status 2 or 6) with content hash, size and version.
   */
  recordSave(fileId: string, contentHash: string, size: number, newVersion: string, key?: string): void {
    let session = this.sessions.get(fileId);
    const now = Date.now();
    if (!session) {
      session = {
        key: key || `saved_${fileId}_${now}`,
        version: newVersion,
        sessionSeq: this.documentSequences.get(fileId) || 1,
        startedAt: now,
        lastActiveAt: now,
      };
      this.sessions.set(fileId, session);
    }
    session.lastSavedHash = contentHash;
    session.lastSavedSize = size;
    session.version = newVersion;
    session.lastActiveAt = now;
  }

  /**
   * Closes the active session (called on status 2 or status 4).
   * After closing, the next getOrCreateSessionKey call is guaranteed to produce a new key.
   */
  closeSession(fileId: string): void {
    this.sessions.delete(fileId);
  }

  /**
   * Resets all session and sequence state (for tests).
   */
  clear(): void {
    this.sessions.clear();
    this.documentSequences.clear();
  }
}
