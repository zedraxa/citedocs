import type { ZoteroItem } from "@citedocs/shared";
import { normalizeZoteroItem } from "./translation-client.js";
import {
  type LibraryTarget,
  formatLibraryTarget,
  type KeyPermissions,
  type ZoteroDeletedResponse,
  type ZoteroWriteResponse,
  type ZoteroApiResponse,
  type GetItemsOptions,
} from "./types.js";
import {
  ZoteroApiError,
  ZoteroVersionConflictError,
  ZoteroRateLimitError,
} from "./errors.js";

export interface ZoteroClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  maxRetries?: number;
  defaultTimeoutMs?: number;
}

/**
 * Generates a random 32-character hexadecimal string for Zotero-Write-Token.
 */
export function generateWriteToken(): string {
  const hexChars = "0123456789abcdef";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
  }
  return token;
}

/**
 * Parses standard RFC 5988 Link headers into a dictionary of rel -> URL.
 */
export function parseLinkHeader(header: string | null): Record<string, string> {
  const links: Record<string, string> = {};
  if (!header) return links;

  const parts = header.split(",");
  for (const part of parts) {
    const section = part.split(";");
    if (section.length !== 2) continue;
    const url = section[0].replace(/<|>/g, "").trim();
    const nameMatch = section[1].match(/rel="?([^"]+)"?/);
    if (nameMatch && nameMatch[1]) {
      links[nameMatch[1].trim()] = url;
    }
  }
  return links;
}

/**
 * Fully typed client for the official Zotero Web API v3.
 * Supports per-user API keys, user and group libraries, batching (max 50),
 * pagination, rate limiting (Backoff and Retry-After), and strict error redaction.
 */
export class ZoteroWebApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly defaultTimeoutMs: number;

  constructor(options: ZoteroClientOptions) {
    if (!options.apiKey || typeof options.apiKey !== "string") {
      throw new Error("Zotero API key must be a non-empty string");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://api.zotero.org").replace(/\/+$/, "");
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.sleepFn = options.sleepFn || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 3;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15000;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async sleep(ms: number): Promise<void> {
    await this.sleepFn(ms);
  }

  /**
   * Helper to build default headers with Zotero-API-Version: 3 and per-user Zotero-API-Key.
   */
  public buildHeaders(extra: Record<string, string | undefined> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      "Zotero-API-Version": "3",
      "Zotero-API-Key": this.apiKey,
      Accept: "application/json",
    };

    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) {
        headers[k] = v;
      }
    }

    return headers;
  }

  /**
   * Executes a fetch request with timeout, Backoff and Retry-After handling, and error redaction.
   */
  private async executeRequest(
    url: string,
    init: RequestInit,
    timeoutMs?: number,
  ): Promise<Response> {
    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      if (effectiveTimeout > 0) {
        timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
      }

      try {
        const response = await this.fetchFn(url, {
          ...init,
          signal: controller.signal,
        });

        // 1. Check for standard Zotero Backoff header on ANY response
        const backoffHeader = response.headers.get("Backoff");
        if (backoffHeader) {
          const backoffSec = parseInt(backoffHeader, 10);
          if (!isNaN(backoffSec) && backoffSec > 0) {
            await this.sleep(backoffSec * 1000);
          }
        }

        // 2. Check for 429 Too Many Requests or 503 Service Unavailable
        if (response.status === 429 || response.status === 503) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
          const waitSec =
            retryAfterSec && !isNaN(retryAfterSec)
              ? retryAfterSec
              : Math.min(60, Math.pow(2, attempt));

          if (attempt <= this.maxRetries) {
            await this.sleep(waitSec * 1000);
            continue;
          }

          const errorBody = await response.text().catch(() => "");
          throw new ZoteroRateLimitError(
            `Zotero API rate limit reached (HTTP ${response.status}) at ${url}`,
            {
              statusCode: response.status,
              responseBody: errorBody,
              apiKey: this.apiKey,
              retryAfterSeconds: waitSec,
            },
          );
        }

        // 3. Check for 412 Precondition Failed (optimistic concurrency version conflict)
        if (response.status === 412) {
          const errorBody = await response.text().catch(() => "");
          throw new ZoteroVersionConflictError(
            `Zotero version conflict: Precondition Failed (HTTP 412) at ${url}`,
            {
              responseBody: errorBody,
              apiKey: this.apiKey,
            },
          );
        }

        return response;
      } catch (err: unknown) {
        if (err instanceof ZoteroApiError) {
          throw err;
        }

        if (err instanceof Error && err.name === "AbortError") {
          throw new ZoteroApiError(
            `Zotero request timed out after ${effectiveTimeout}ms: ${init.method || "GET"} ${url}`,
            {
              statusCode: 408,
              apiKey: this.apiKey,
              cause: err,
            },
          );
        }

        throw new ZoteroApiError(
          `Failed to connect to Zotero API: ${err instanceof Error ? err.message : String(err)}`,
          {
            apiKey: this.apiKey,
            cause: err,
          },
        );
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    throw new ZoteroRateLimitError(`Exceeded maximum retries (${this.maxRetries}) for ${url}`, {
      apiKey: this.apiKey,
    });
  }

  private extractApiResponse<T>(response: Response, data: T): ZoteroApiResponse<T> {
    const lastModifiedHeader = response.headers.get("Last-Modified-Version");
    const totalResultsHeader = response.headers.get("Total-Results");
    const linkHeader = response.headers.get("Link");
    const backoffHeader = response.headers.get("Backoff");
    const retryAfterHeader = response.headers.get("Retry-After");

    return {
      data,
      status: response.status,
      lastModifiedVersion: lastModifiedHeader ? parseInt(lastModifiedHeader, 10) : undefined,
      totalResults: totalResultsHeader ? parseInt(totalResultsHeader, 10) : undefined,
      links: parseLinkHeader(linkHeader),
      backoffSeconds: backoffHeader ? parseInt(backoffHeader, 10) : undefined,
      retryAfterSeconds: retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined,
    };
  }

  /**
   * Validates the active API key and returns key metadata and permissions.
   * Redacts the raw key in the returned object to ensure keys are never exposed.
   */
  async getCurrentKey(): Promise<KeyPermissions> {
    const url = `${this.baseUrl}/keys/current`;
    const response = await this.executeRequest(url, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new ZoteroApiError(`Failed to fetch current key permissions: HTTP ${response.status}`, {
        statusCode: response.status,
        responseBody: errorBody,
        apiKey: this.apiKey,
      });
    }

    const json = (await response.json()) as KeyPermissions;
    return {
      ...json,
      key: "[REDACTED]",
    };
  }

  /**
   * Normalizes an item returned by Zotero (which may be wrapped in a `{ data: ... }` object).
   */
  private normalizeRawItem(item: unknown): ZoteroItem {
    if (item && typeof item === "object") {
      const candidate = item as Record<string, unknown>;
      if (candidate.data && typeof candidate.data === "object") {
        return normalizeZoteroItem(candidate.data as Partial<ZoteroItem>);
      }
      return normalizeZoteroItem(candidate as Partial<ZoteroItem>);
    }
    return normalizeZoteroItem({});
  }

  /**
   * Fetches a single page of items for a user or group library.
   */
  async getItems(
    target: LibraryTarget,
    options: GetItemsOptions = {},
  ): Promise<ZoteroApiResponse<ZoteroItem[]>> {
    const path = formatLibraryTarget(target);
    const searchParams = new URLSearchParams();

    searchParams.set("format", "json");
    if (options.since !== undefined) {
      searchParams.set("since", String(options.since));
    }
    if (options.limit !== undefined) {
      searchParams.set("limit", String(options.limit));
    }
    if (options.start !== undefined) {
      searchParams.set("start", String(options.start));
    }
    if (options.itemKeys && options.itemKeys.length > 0) {
      searchParams.set("itemKey", options.itemKeys.join(","));
    }
    if (options.sort) {
      searchParams.set("sort", options.sort);
    }
    if (options.direction) {
      searchParams.set("direction", options.direction);
    }

    const url = `${this.baseUrl}/${path}/items?${searchParams.toString()}`;
    const extraHeaders: Record<string, string | undefined> = {};
    if (options.since !== undefined && options.since > 0) {
      extraHeaders["If-Modified-Since-Version"] = String(options.since);
    }

    const response = await this.executeRequest(url, {
      method: "GET",
      headers: this.buildHeaders(extraHeaders),
    });

    if (response.status === 304) {
      return this.extractApiResponse(response, []);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new ZoteroApiError(`Failed to fetch items from ${path}: HTTP ${response.status}`, {
        statusCode: response.status,
        responseBody: errorBody,
        apiKey: this.apiKey,
      });
    }

    const rawArray = (await response.json()) as unknown[];
    const items = Array.isArray(rawArray) ? rawArray.map((r) => this.normalizeRawItem(r)) : [];

    return this.extractApiResponse(response, items);
  }

  /**
   * Fetches ALL items across all paginated pages (>100 items).
   * Follows RFC 5988 Link headers (rel="next") or increments start offset.
   */
  async getAllItems(
    target: LibraryTarget,
    options: { since?: number; limit?: number } = {},
  ): Promise<{ items: ZoteroItem[]; lastModifiedVersion: number; totalResults: number }> {
    let limit = options.limit ?? 100;
    let start = 0;
    const allItems: ZoteroItem[] = [];
    let lastModifiedVersion = 0;
    let totalResults = 0;

    while (true) {
      const page = await this.getItems(target, {
        since: options.since,
        limit,
        start,
      });

      if (page.status === 304) {
        return {
          items: [],
          lastModifiedVersion: page.lastModifiedVersion ?? options.since ?? 0,
          totalResults: 0,
        };
      }

      allItems.push(...page.data);
      if (page.lastModifiedVersion) {
        lastModifiedVersion = Math.max(lastModifiedVersion, page.lastModifiedVersion);
      }
      if (page.totalResults !== undefined) {
        totalResults = page.totalResults;
      }

      // Check termination conditions
      if (page.data.length === 0) {
        break;
      }
      if (totalResults > 0 && allItems.length >= totalResults) {
        break;
      }

      if (page.links?.next) {
        try {
          const nextUrl = new URL(page.links.next);
          const nextStart = nextUrl.searchParams.get("start");
          const nextLimit = nextUrl.searchParams.get("limit");
          if (nextStart !== null) {
            start = parseInt(nextStart, 10);
          } else {
            start += limit;
          }
          if (nextLimit !== null) {
            limit = parseInt(nextLimit, 10);
          }
        } catch {
          start += limit;
        }
      } else if (totalResults > 0 && allItems.length < totalResults) {
        start += limit;
      } else {
        break;
      }
    }

    return {
      items: allItems,
      lastModifiedVersion,
      totalResults: totalResults || allItems.length,
    };
  }

  /**
   * Fetches lightweight item versions mapping { [itemKey]: version } since a given version.
   * Returns empty object on 304 Not Modified.
   */
  async getItemVersions(
    target: LibraryTarget,
    options: { since?: number } = {},
  ): Promise<ZoteroApiResponse<Record<string, number>>> {
    const path = formatLibraryTarget(target);
    const searchParams = new URLSearchParams();
    searchParams.set("format", "versions");
    if (options.since !== undefined) {
      searchParams.set("since", String(options.since));
    }

    const url = `${this.baseUrl}/${path}/items?${searchParams.toString()}`;
    const extraHeaders: Record<string, string | undefined> = {};
    if (options.since !== undefined && options.since > 0) {
      extraHeaders["If-Modified-Since-Version"] = String(options.since);
    }

    const response = await this.executeRequest(url, {
      method: "GET",
      headers: this.buildHeaders(extraHeaders),
    });

    if (response.status === 304) {
      return this.extractApiResponse(response, {});
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new ZoteroApiError(`Failed to fetch item versions from ${path}: HTTP ${response.status}`, {
        statusCode: response.status,
        responseBody: errorBody,
        apiKey: this.apiKey,
      });
    }

    const versions = (await response.json()) as Record<string, number>;
    return this.extractApiResponse(response, versions);
  }

  /**
   * Fetches items by keys, automatically chunked into batches of at most 50 keys.
   */
  async getItemsByKeys(target: LibraryTarget, keys: string[]): Promise<ZoteroItem[]> {
    if (keys.length === 0) return [];
    const results: ZoteroItem[] = [];
    const batchSize = 50;

    for (let i = 0; i < keys.length; i += batchSize) {
      const chunk = keys.slice(i, i + batchSize);
      const res = await this.getItems(target, {
        itemKeys: chunk,
        limit: chunk.length,
      });
      results.push(...res.data);
    }

    return results;
  }

  /**
   * Fetches deleted object keys since a given version.
   */
  async getDeleted(
    target: LibraryTarget,
    since: number,
  ): Promise<ZoteroApiResponse<ZoteroDeletedResponse>> {
    const path = formatLibraryTarget(target);
    const url = `${this.baseUrl}/${path}/deleted?since=${since}`;

    const response = await this.executeRequest(url, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (response.status === 304) {
      return this.extractApiResponse(response, { items: [], collections: [], searches: [], tags: [] });
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new ZoteroApiError(`Failed to fetch deleted items from ${path}: HTTP ${response.status}`, {
        statusCode: response.status,
        responseBody: errorBody,
        apiKey: this.apiKey,
      });
    }

    const deleted = (await response.json()) as ZoteroDeletedResponse;
    return this.extractApiResponse(response, {
      items: deleted.items || [],
      collections: deleted.collections || [],
      searches: deleted.searches || [],
      tags: deleted.tags || [],
    });
  }

  /**
   * Creates or updates items in batches of at most 50 items.
   * Automatically passes Zotero-Write-Token and If-Unmodified-Since-Version.
   * Throws ZoteroVersionConflictError on 412 Precondition Failed.
   */
  async createOrUpdateItems(
    target: LibraryTarget,
    items: Partial<ZoteroItem>[],
    options?: { ifUnmodifiedSinceVersion?: number; writeToken?: string },
  ): Promise<ZoteroWriteResponse> {
    if (items.length === 0) {
      return {
        success: {},
        unchanged: {},
        failed: {},
        lastModifiedVersion: options?.ifUnmodifiedSinceVersion,
      };
    }

    const path = formatLibraryTarget(target);
    const url = `${this.baseUrl}/${path}/items`;
    const batchSize = 50;

    const aggregate: ZoteroWriteResponse = {
      success: {},
      unchanged: {},
      failed: {},
      lastModifiedVersion: options?.ifUnmodifiedSinceVersion,
    };

    let currentVersion = options?.ifUnmodifiedSinceVersion;

    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      const writeToken = options?.writeToken || generateWriteToken();

      const extraHeaders: Record<string, string | undefined> = {
        "Content-Type": "application/json",
        "Zotero-Write-Token": writeToken,
      };
      if (currentVersion !== undefined && currentVersion > 0) {
        extraHeaders["If-Unmodified-Since-Version"] = String(currentVersion);
      }

      const response = await this.executeRequest(url, {
        method: "POST",
        headers: this.buildHeaders(extraHeaders),
        body: JSON.stringify(chunk),
      });

      if (!response.ok && response.status !== 204) {
        const errorBody = await response.text().catch(() => "");
        throw new ZoteroApiError(`Failed to write items to ${path}: HTTP ${response.status}`, {
          statusCode: response.status,
          responseBody: errorBody,
          apiKey: this.apiKey,
        });
      }

      const lastModifiedHeader = response.headers.get("Last-Modified-Version");
      if (lastModifiedHeader) {
        const parsedVersion = parseInt(lastModifiedHeader, 10);
        if (!isNaN(parsedVersion)) {
          currentVersion = parsedVersion;
          aggregate.lastModifiedVersion = parsedVersion;
        }
      }

      let json: Partial<ZoteroWriteResponse> = {};
      if (response.status !== 204) {
        try {
          json = (await response.json()) as Partial<ZoteroWriteResponse>;
        } catch {
          json = {};
        }
      }

      if (json.success) Object.assign(aggregate.success, json.success);
      if (json.unchanged) Object.assign(aggregate.unchanged, json.unchanged);
      if (json.failed) Object.assign(aggregate.failed, json.failed);
    }

    return aggregate;
  }

  /**
   * Deletes items in batches of at most 50 keys via DELETE /items?itemKey=KEY1,KEY2...
   * Throws ZoteroVersionConflictError on 412 Precondition Failed.
   */
  async deleteItems(
    target: LibraryTarget,
    itemKeys: string[],
    options?: { ifUnmodifiedSinceVersion?: number; writeToken?: string },
  ): Promise<{ deletedKeys: string[]; lastModifiedVersion?: number }> {
    if (itemKeys.length === 0) {
      return { deletedKeys: [], lastModifiedVersion: options?.ifUnmodifiedSinceVersion };
    }

    const path = formatLibraryTarget(target);
    const batchSize = 50;
    let currentVersion = options?.ifUnmodifiedSinceVersion;
    const deletedKeys: string[] = [];

    for (let i = 0; i < itemKeys.length; i += batchSize) {
      const chunk = itemKeys.slice(i, i + batchSize);
      const writeToken = options?.writeToken || generateWriteToken();
      const url = `${this.baseUrl}/${path}/items?itemKey=${chunk.join(",")}`;

      const extraHeaders: Record<string, string | undefined> = {
        "Zotero-Write-Token": writeToken,
      };
      if (currentVersion !== undefined && currentVersion > 0) {
        extraHeaders["If-Unmodified-Since-Version"] = String(currentVersion);
      }

      const response = await this.executeRequest(url, {
        method: "DELETE",
        headers: this.buildHeaders(extraHeaders),
      });

      if (!response.ok && response.status !== 204) {
        const errorBody = await response.text().catch(() => "");
        throw new ZoteroApiError(`Failed to delete items from ${path}: HTTP ${response.status}`, {
          statusCode: response.status,
          responseBody: errorBody,
          apiKey: this.apiKey,
        });
      }

      const lastModifiedHeader = response.headers.get("Last-Modified-Version");
      if (lastModifiedHeader) {
        const parsedVersion = parseInt(lastModifiedHeader, 10);
        if (!isNaN(parsedVersion)) {
          currentVersion = parsedVersion;
        }
      }

      deletedKeys.push(...chunk);
    }

    return {
      deletedKeys,
      lastModifiedVersion: currentVersion,
    };
  }
}
