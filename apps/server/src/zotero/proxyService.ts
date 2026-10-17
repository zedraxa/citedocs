import { ZoteroAccountService } from "./accountService.js";
import { ZoteroCache, type ZoteroCacheOptions } from "./cache.js";

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

export interface ZoteroProxyOptions {
  accountService: ZoteroAccountService;
  fetchFn?: typeof fetch;
  zoteroApiBaseUrl?: string;
  translationServerUrl?: string;
  cache?: ZoteroCache;
  cacheOptions?: ZoteroCacheOptions;
}

export class ZoteroProxyService {
  private readonly accountService: ZoteroAccountService;
  private readonly fetchFn: typeof fetch;
  private readonly zoteroApiBaseUrl: string;
  private readonly translationServerUrl: string;
  private readonly cache: ZoteroCache;

  constructor(options: ZoteroProxyOptions) {
    this.accountService = options.accountService;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.zoteroApiBaseUrl = (options.zoteroApiBaseUrl || "https://api.zotero.org").replace(/\/+$/, "");
    this.translationServerUrl = (
      options.translationServerUrl ||
      process.env.TRANSLATION_SERVER_URL ||
      "http://localhost:1969"
    ).replace(/\/+$/, "");
    this.cache = options.cache || new ZoteroCache(options.cacheOptions);
  }

  getCache(): ZoteroCache {
    return this.cache;
  }

  /**
   * Invalidates cached GET responses for a given library.
   * If userId is provided, invalidates only that user's cached queries for the library.
   */
  invalidateLibrary(userId: string | undefined, libraryId: string): number {
    return this.cache.invalidateLibrary(userId, libraryId);
  }

  private async executeUpstream(
    cleanSubPath: string,
    method: string,
    queryParams: Record<string, string | string[] | undefined>,
    body: unknown,
    incomingHeaders: Record<string, string | undefined>,
    apiKey: string
  ): Promise<ProxyResponse> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const item of value) searchParams.append(key, item);
        } else {
          searchParams.set(key, value);
        }
      }
    }
    const queryString = searchParams.toString();
    const targetUrl = `${this.zoteroApiBaseUrl}/${cleanSubPath}${queryString ? `?${queryString}` : ""}`;

    const headers: Record<string, string> = {
      "Zotero-API-Version": "3",
      "Zotero-API-Key": apiKey,
      Accept: incomingHeaders.accept || "application/json",
    };

    if (incomingHeaders["if-modified-since-version"]) {
      headers["If-Modified-Since-Version"] = incomingHeaders["if-modified-since-version"];
    }
    if (incomingHeaders["if-unmodified-since-version"]) {
      headers["If-Unmodified-Since-Version"] = incomingHeaders["if-unmodified-since-version"];
    }

    const init: RequestInit = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      headers["Content-Type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    try {
      const response = await this.fetchFn(targetUrl, init);

      const outHeaders: Record<string, string> = {
        "content-type": response.headers.get("content-type") || "application/json",
      };

      const forwardHeaderNames = [
        "last-modified-version",
        "total-results",
        "link",
        "backoff",
        "retry-after",
        "zotero-api-version",
      ];

      for (const name of forwardHeaderNames) {
        const val = response.headers.get(name);
        if (val) outHeaders[name] = val;
      }

      const contentType = response.headers.get("content-type") || "";
      let data: unknown = null;
      if (response.status !== 304 && response.status !== 204) {
        if (contentType.includes("application/json")) {
          if (typeof response.json === "function") {
            data = await response.json().catch(() => null);
          } else if (typeof response.text === "function") {
            const text = await response.text();
            data = text ? JSON.parse(text) : null;
          }
        } else if (typeof response.text === "function") {
          data = await response.text();
        } else if (typeof response.json === "function") {
          data = await response.json().catch(() => null);
        }
      }


      return {
        status: response.status,
        headers: outHeaders,
        data,
      };
    } catch (err: unknown) {
      return {
        status: 502,
        headers: { "content-type": "application/json" },
        data: {
          error: "Failed to connect to upstream zotero.org API",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private checkAndRecordBackoff(
    userId: string,
    libraryId: string,
    headers: Record<string, string>
  ): void {
    const backoffVal = headers["backoff"] || headers["retry-after"];
    if (backoffVal) {
      const sec = parseInt(backoffVal, 10);
      if (Number.isFinite(sec) && sec > 0) {
        this.cache.setBackoff(userId, libraryId, sec);
      }
    }
  }

  /**
   * Proxies an authenticated HTTP request from the web-library client to api.zotero.org.
   * Retrieves the user's encrypted API key, decrypts in-memory, injects headers,
   * caches successful GET reads per-user/library, respects 304 revalidation and Backoff,
   * and invalidates library cache after writes.
   */
  async proxyToZotero(
    userId: string,
    subPath: string,
    method = "GET",
    queryParams: Record<string, string | string[] | undefined> = {},
    body?: unknown,
    incomingHeaders: Record<string, string | undefined> = {}
  ): Promise<ProxyResponse> {
    if (!userId) {
      return {
        status: 401,
        headers: { "content-type": "application/json" },
        data: { error: "Unauthorized: Missing user authentication" },
      };
    }

    const creds = await this.accountService.getInternalDecryptedKey(userId);
    if (!creds || !creds.apiKey) {
      return {
        status: 403,
        headers: { "content-type": "application/json" },
        data: {
          error: "Zotero account not linked",
          message: "Please link your zotero.org account in CiteDocs settings before accessing the web library.",
        },
      };
    }

    const cleanSubPath = subPath.replace(/^\/+/, "");
    const libraryId = ZoteroCache.extractLibraryId(cleanSubPath);
    const upperMethod = (method || "GET").toUpperCase();
    const isGet = upperMethod === "GET";

    // 1. Write operations (POST, PUT, PATCH, DELETE)
    // Writes are never cached. On completion, the library's cache is invalidated so changes show up immediately.
    if (!isGet) {
      const response = await this.executeUpstream(
        cleanSubPath,
        upperMethod,
        queryParams,
        body,
        incomingHeaders,
        creds.apiKey
      );
      this.cache.invalidateLibrary(userId, libraryId);
      this.checkAndRecordBackoff(userId, libraryId, response.headers);
      return response;
    }

    // 2. GET Request handling: check upstream Backoff first
    const backoffRemaining = this.cache.getBackoffRemaining(userId, libraryId);
    const cacheKey = ZoteroCache.buildKey(userId, libraryId, cleanSubPath, queryParams);
    const cached = this.cache.get(cacheKey);

    if (backoffRemaining > 0) {
      // If we have a fresh cached entry, serve it to avoid touching upstream during backoff
      if (cached && !cached.isStale) {
        return {
          status: 200,
          headers: {
            ...cached.entry.headers,
            "x-cache": "HIT",
            backoff: String(backoffRemaining),
            "retry-after": String(backoffRemaining),
          },
          data: cached.entry.data,
        };
      }

      // No fresh cache: block request to protect upstream Zotero API and honor Backoff
      return {
        status: 429,
        headers: {
          "content-type": "application/json",
          backoff: String(backoffRemaining),
          "retry-after": String(backoffRemaining),
        },
        data: {
          error: "Zotero API backoff active",
          message: `Upstream Zotero requested backoff. Please retry after ${backoffRemaining} seconds.`,
          retryAfter: backoffRemaining,
        },
      };
    }

    const clientIfModifiedSince = incomingHeaders["if-modified-since-version"];

    // 3. Cache HIT (Fresh)
    if (cached && !cached.isStale) {
      const cachedVersion = cached.entry.lastModifiedVersion;

      // If client sent If-Modified-Since-Version and cached data is at or below that version, return 304!
      if (
        clientIfModifiedSince !== undefined &&
        cachedVersion !== undefined &&
        Number(clientIfModifiedSince) >= Number(cachedVersion)
      ) {
        return {
          status: 304,
          headers: {
            ...cached.entry.headers,
            "last-modified-version": cachedVersion,
            "x-cache": "HIT",
          },
          data: null,
        };
      }

      return {
        status: 200,
        headers: {
          ...cached.entry.headers,
          "x-cache": "HIT",
        },
        data: cached.entry.data,
      };
    }

    // 4. Cache MISS or STALE: fetch from upstream
    const upstreamHeaders = { ...incomingHeaders };
    // If cached entry is stale, pass If-Modified-Since-Version for upstream 304 revalidation
    if (
      cached &&
      cached.isStale &&
      cached.entry.lastModifiedVersion &&
      !upstreamHeaders["if-modified-since-version"]
    ) {
      upstreamHeaders["if-modified-since-version"] = cached.entry.lastModifiedVersion;
    }

    const response = await this.executeUpstream(
      cleanSubPath,
      upperMethod,
      queryParams,
      body,
      upstreamHeaders,
      creds.apiKey
    );

    this.checkAndRecordBackoff(userId, libraryId, response.headers);

    // 5. Upstream returned 304 Not Modified: revalidate stale cache entry
    if (response.status === 304 && cached) {
      const newVersion = response.headers["last-modified-version"] || cached.entry.lastModifiedVersion;
      this.cache.touch(cacheKey, newVersion);

      if (
        clientIfModifiedSince !== undefined &&
        newVersion !== undefined &&
        Number(clientIfModifiedSince) >= Number(newVersion)
      ) {
        return {
          status: 304,
          headers: {
            ...cached.entry.headers,
            ...response.headers,
            "last-modified-version": newVersion,
            "x-cache": "REVALIDATED",
          },
          data: null,
        };
      }

      const outHeaders: Record<string, string> = {
        ...cached.entry.headers,
        ...response.headers,
        "x-cache": "REVALIDATED",
      };
      if (newVersion) {
        outHeaders["last-modified-version"] = newVersion;
      }

      return {
        status: 200,
        headers: outHeaders,
        data: cached.entry.data,
      };
    }


    // 6. Upstream returned 200 OK: Cache the successful response
    if (response.status === 200) {
      this.cache.set({
        key: cacheKey,
        userId,
        libraryId,
        subPath: cleanSubPath,
        status: 200,
        headers: response.headers,
        data: response.data,
        lastModifiedVersion: response.headers["last-modified-version"],
      });

      return {
        ...response,
        headers: {
          ...response.headers,
          "x-cache": "MISS",
        },
      };
    }

    // 7. Errors or auth failures (>= 400) are NEVER cached
    return response;
  }

  /**
   * Proxies a search request to the Zotero translation-server microservice (POST /search).
   * Takes an identifier (e.g. DOI, ISBN, PMID, arXiv, URL) and returns translated Zotero items.
   */
  async searchTranslationServer(identifier: string): Promise<{ status: number; data: unknown }> {
    const trimmed = (identifier || "").trim();
    if (!trimmed) {
      return {
        status: 400,
        data: { error: "Identifier cannot be empty" },
      };
    }

    const targetUrl = `${this.translationServerUrl}/search`;

    try {
      const response = await this.fetchFn(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Accept: "application/json",
        },
        body: trimmed,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return {
          status: response.status >= 500 ? 502 : response.status,
          data: {
            error: "Translation server failed to resolve identifier",
            details: text,
            upstreamStatus: response.status,
          },
        };
      }

      const items = await response.json();
      return {
        status: 200,
        data: items,
      };
    } catch (err: unknown) {
      return {
        status: 502,
        data: {
          error: "Cannot connect to translation-server microservice at port 1969",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
