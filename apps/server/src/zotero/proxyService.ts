import { ZoteroAccountService } from "./accountService.js";

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
}

export class ZoteroProxyService {
  private readonly accountService: ZoteroAccountService;
  private readonly fetchFn: typeof fetch;
  private readonly zoteroApiBaseUrl: string;
  private readonly translationServerUrl: string;

  constructor(options: ZoteroProxyOptions) {
    this.accountService = options.accountService;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.zoteroApiBaseUrl = (options.zoteroApiBaseUrl || "https://api.zotero.org").replace(/\/+$/, "");
    this.translationServerUrl = (
      options.translationServerUrl ||
      process.env.TRANSLATION_SERVER_URL ||
      "http://localhost:1969"
    ).replace(/\/+$/, "");
  }

  /**
   * Proxies an authenticated HTTP request from the web-library client to api.zotero.org.
   * Retrieves the user's encrypted API key, decrypts in-memory, injects headers,
   * and streams the upstream response back to the caller.
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

    // Build query string
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
    const cleanSubPath = subPath.replace(/^\/+/, "");
    const targetUrl = `${this.zoteroApiBaseUrl}/${cleanSubPath}${queryString ? `?${queryString}` : ""}`;

    const headers: Record<string, string> = {
      "Zotero-API-Version": "3",
      "Zotero-API-Key": creds.apiKey,
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
      let data: unknown;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
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
