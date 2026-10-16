import type { LockResult } from "./types.js";

interface ActiveLock {
  lock: string;
  expiresAt: number;
}

export const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class WopiLockManager {
  private locks = new Map<string, ActiveLock>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = DEFAULT_LOCK_TTL_MS) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Retrieves the current active lock ID for a file, or null if unlocked or expired.
   */
  getLock(fileId: string): string | null {
    const entry = this.locks.get(fileId);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.locks.delete(fileId);
      return null;
    }
    return entry.lock;
  }

  /**
   * Locks the file with the given lock ID.
   * If unlocked or same lock, lock is granted/refreshed for ttlMs (default 30 min).
   * If locked with a different lock ID, returns conflict.
   */
  setLock(fileId: string, lock: string, ttlMs = this.defaultTtlMs): LockResult {
    const current = this.getLock(fileId);
    if (current === null || current === lock) {
      this.locks.set(fileId, {
        lock,
        expiresAt: Date.now() + ttlMs,
      });
      return { success: true, currentLock: lock };
    }
    return { success: false, currentLock: current };
  }

  /**
   * Relocks the file: changes the lock from oldLock to newLock if oldLock matches.
   */
  relock(fileId: string, oldLock: string, newLock: string, ttlMs = this.defaultTtlMs): LockResult {
    const current = this.getLock(fileId);
    if (current === oldLock) {
      this.locks.set(fileId, {
        lock: newLock,
        expiresAt: Date.now() + ttlMs,
      });
      return { success: true, currentLock: newLock };
    }
    return { success: false, currentLock: current ?? "" };
  }

  /**
   * Refreshes the expiry time of an existing lock.
   */
  refreshLock(fileId: string, lock: string, ttlMs = this.defaultTtlMs): LockResult {
    const current = this.getLock(fileId);
    if (current === lock) {
      this.locks.set(fileId, {
        lock,
        expiresAt: Date.now() + ttlMs,
      });
      return { success: true, currentLock: lock };
    }
    return { success: false, currentLock: current ?? "" };
  }

  /**
   * Releases an existing lock if the lock ID matches.
   */
  unlock(fileId: string, lock: string): LockResult {
    const current = this.getLock(fileId);
    if (current === null) {
      // Per WOPI spec: unlocking an unlocked file returns 409 with empty lock
      return { success: false, currentLock: "" };
    }
    if (current === lock) {
      this.locks.delete(fileId);
      return { success: true, currentLock: "" };
    }
    return { success: false, currentLock: current };
  }

  /**
   * Clears all locks (useful for test resets).
   */
  clear(): void {
    this.locks.clear();
  }
}
