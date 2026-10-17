export interface ZoteroCacheEntry {
  key: string;
  userId: string;
  libraryId: string;
  subPath: string;
  status: number;
  headers: Record<string, string>;
  data: unknown;
  lastModifiedVersion?: string;
  cachedAt: number;
  expiresAt: number;
}

export interface ZoteroCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
}

/**
 * Bounded in-memory LRU cache with TTL for upstream Zotero Web API GET responses.
 *
 * Requirements & Guarantees:
 * - Scoped per user and library to guarantee student data isolation.
 * - Respects Zotero versioning semantics (Last-Modified-Version / If-Modified-Since-Version).
 * - Honors upstream Backoff and Retry-After constraints.
 * - Evicts oldest entries when capacity is reached (bounded LRU via Map iteration order).
 * - Never caches errors or auth failures (HTTP status >= 400).
 * - Never stores or logs OAuth tokens or API keys.
 */
export class ZoteroCache {
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private readonly entries = new Map<string, ZoteroCacheEntry>();
  // Maps "userId::libraryId" -> Set of cache keys, and "all::libraryId" -> Set of cache keys
  private readonly libraryIndex = new Map<string, Set<string>>();
  // Maps "userId" -> Set of cache keys
  private readonly userIndex = new Map<string, Set<string>>();
  // Backoff timestamps: key -> unix epoch ms until which backoff is active
  private readonly backoffUntil = new Map<string, number>();

  constructor(options: ZoteroCacheOptions = {}) {
    const envMax = parseInt(process.env.ZOTERO_CACHE_MAX_ENTRIES || "", 10);
    this.maxEntries =
      options.maxEntries !== undefined && options.maxEntries > 0
        ? options.maxEntries
        : Number.isFinite(envMax) && envMax > 0
          ? envMax
          : 1000;

    const envTtlMs = parseInt(process.env.ZOTERO_CACHE_TTL_MS || "", 10);
    const envTtlSec = parseInt(process.env.ZOTERO_CACHE_TTL_SECONDS || "", 10);
    this.defaultTtlMs =
      options.ttlMs !== undefined && options.ttlMs > 0
        ? options.ttlMs
        : Number.isFinite(envTtlMs) && envTtlMs > 0
          ? envTtlMs
          : Number.isFinite(envTtlSec) && envTtlSec > 0
            ? envTtlSec * 1000
            : 60_000;
  }

  /**
   * Extracts a library identifier from a Zotero sub-path.
   * e.g., "users/12345/items" -> "users:12345", "groups/999/items" -> "groups:999".
   */
  static extractLibraryId(subPath: string): string {
    const clean = (subPath || "").replace(/^\/+/, "");
    const match = clean.match(/^(users|groups)\/([^/]+)/i);
    if (match) {
      return `${match[1].toLowerCase()}:${match[2]}`;
    }
    return "general";
  }

  /**
   * Builds an isolated, deterministic cache key.
   * Scoped strictly by userId to guarantee that students never share cache entries.
   */
  static buildKey(
    userId: string,
    libraryId: string,
    subPath: string,
    queryParams: Record<string, string | string[] | undefined> = {}
  ): string {
    const cleanSubPath = (subPath || "").replace(/^\/+/, "").replace(/\/+$/, "");
    const searchParams = new URLSearchParams();
    const sortedKeys = Object.keys(queryParams).sort();
    for (const key of sortedKeys) {
      const val = queryParams[key];
      if (val !== undefined) {
        if (Array.isArray(val)) {
          const sortedVals = [...val].sort();
          for (const item of sortedVals) {
            searchParams.append(key, item);
          }
        } else {
          searchParams.set(key, val);
        }
      }
    }
    const queryStr = searchParams.toString();
    return `${userId}::${libraryId}::${cleanSubPath}${queryStr ? `?${queryStr}` : ""}`;
  }

  /**
   * Retrieves an entry from cache.
   * Promotes the entry to most-recently-used (MRU).
   * Returns `{ entry, isStale }` so caller can use stale entries for 304 conditional revalidation.
   */
  get(key: string): { entry: ZoteroCacheEntry; isStale: boolean } | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    // Promote to MRU in Map
    this.entries.delete(key);
    this.entries.set(key, entry);

    const now = Date.now();
    const isStale = now >= entry.expiresAt;
    return { entry, isStale };
  }

  /**
   * Stores a successful GET response in cache.
   * Evicts least-recently-used entry if maxEntries capacity is reached.
   * Never stores responses with HTTP status >= 400.
   */
  set(input: {
    key: string;
    userId: string;
    libraryId: string;
    subPath: string;
    status: number;
    headers: Record<string, string>;
    data: unknown;
    lastModifiedVersion?: string;
    ttlMs?: number;
  }): void {
    if (input.status >= 400) {
      return;
    }

    const now = Date.now();
    const ttl = input.ttlMs !== undefined ? input.ttlMs : this.defaultTtlMs;

    const entry: ZoteroCacheEntry = {

      key: input.key,
      userId: input.userId,
      libraryId: input.libraryId,
      subPath: input.subPath,
      status: input.status,
      headers: { ...input.headers },
      data: input.data,
      lastModifiedVersion: input.lastModifiedVersion,
      cachedAt: now,
      expiresAt: now + ttl,
    };

    if (this.entries.has(input.key)) {
      this.delete(input.key);
    } else if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) {
        this.delete(oldestKey);
      }
    }

    this.entries.set(input.key, entry);
    this.addToIndex(`${entry.userId}::${entry.libraryId}`, entry.key);
    this.addToIndex(`all::${entry.libraryId}`, entry.key);
    this.addToUserIndex(entry.userId, entry.key);
  }

  /**
   * Refreshes the TTL of an existing entry after upstream returns 304 Not Modified.
   * Optionally updates the Last-Modified-Version header and field.
   */
  touch(key: string, lastModifiedVersion?: string, ttlMs?: number): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    const now = Date.now();
    const ttl = ttlMs !== undefined && ttlMs > 0 ? ttlMs : this.defaultTtlMs;
    entry.expiresAt = now + ttl;

    if (lastModifiedVersion) {
      entry.lastModifiedVersion = lastModifiedVersion;
      entry.headers["last-modified-version"] = lastModifiedVersion;
    }

    // Promote to MRU
    this.entries.delete(key);
    this.entries.set(key, entry);
    return true;
  }

  /**
   * Deletes a specific entry by key.
   */
  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    this.entries.delete(key);
    this.removeFromIndex(`${entry.userId}::${entry.libraryId}`, key);
    this.removeFromIndex(`all::${entry.libraryId}`, key);
    this.removeFromUserIndex(entry.userId, key);
    return true;
  }

  /**
   * Invalidates all cached queries for a given library.
   * If userId is provided, invalidates for that specific user's view of the library.
   * If userId is omitted, invalidates for all users (e.g. for group libraries).
   */
  invalidateLibrary(userId: string | undefined, libraryId: string): number {
    const indexKey = userId ? `${userId}::${libraryId}` : `all::${libraryId}`;
    const keys = this.libraryIndex.get(indexKey);
    if (!keys || keys.size === 0) return 0;

    const keysToDelete = Array.from(keys);
    let count = 0;
    for (const key of keysToDelete) {
      if (this.delete(key)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Invalidates all cached entries for a given student (e.g. on account unlinking or logout).
   */
  invalidateUser(userId: string): number {
    const keys = this.userIndex.get(userId);
    if (!keys || keys.size === 0) return 0;

    const keysToDelete = Array.from(keys);
    let count = 0;
    for (const key of keysToDelete) {
      if (this.delete(key)) {
        count++;
      }
    }
    this.userIndex.delete(userId);
    return count;
  }

  /**
   * Clears all entries, indexes, and backoff states.
   */
  clear(): void {
    this.entries.clear();
    this.libraryIndex.clear();
    this.userIndex.clear();
    this.backoffUntil.clear();
  }

  /**
   * Current number of cached entries.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Maximum capacity of the LRU cache.
   */
  get capacity(): number {
    return this.maxEntries;
  }

  /**
   * Configured default TTL in milliseconds.
   */
  get ttlMs(): number {
    return this.defaultTtlMs;
  }

  /**
   * Records a Backoff / Retry-After window (in seconds) for a user and library.
   */
  setBackoff(userId: string, libraryId: string, seconds: number): void {
    if (seconds <= 0) return;
    const expiresAt = Date.now() + seconds * 1000;
    this.backoffUntil.set(`${userId}::${libraryId}`, expiresAt);
    this.backoffUntil.set(`user::${userId}`, expiresAt);
  }

  /**
   * Checks if backoff is currently active.
   * Returns remaining seconds (> 0) or 0 if inactive.
   */
  getBackoffRemaining(userId: string, libraryId: string): number {
    const now = Date.now();
    const libExpiry = this.backoffUntil.get(`${userId}::${libraryId}`) || 0;
    const userExpiry = this.backoffUntil.get(`user::${userId}`) || 0;
    const maxExpiry = Math.max(libExpiry, userExpiry);
    if (maxExpiry > now) {
      return Math.ceil((maxExpiry - now) / 1000);
    }
    return 0;
  }

  private addToIndex(indexKey: string, cacheKey: string): void {
    let set = this.libraryIndex.get(indexKey);
    if (!set) {
      set = new Set();
      this.libraryIndex.set(indexKey, set);
    }
    set.add(cacheKey);
  }

  private removeFromIndex(indexKey: string, cacheKey: string): void {
    const set = this.libraryIndex.get(indexKey);
    if (set) {
      set.delete(cacheKey);
      if (set.size === 0) {
        this.libraryIndex.delete(indexKey);
      }
    }
  }

  private addToUserIndex(userId: string, cacheKey: string): void {
    let set = this.userIndex.get(userId);
    if (!set) {
      set = new Set();
      this.userIndex.set(userId, set);
    }
    set.add(cacheKey);
  }

  private removeFromUserIndex(userId: string, cacheKey: string): void {
    const set = this.userIndex.get(userId);
    if (set) {
      set.delete(cacheKey);
      if (set.size === 0) {
        this.userIndex.delete(userId);
      }
    }
  }
}
