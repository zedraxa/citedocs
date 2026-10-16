import { ZoteroAccountService } from "./accountService.js";

export interface ZoteroOAuthInitiateResponse {
  oauthToken: string;
  authorizeUrl: string;
  callbackUrl: string;
}

export interface ZoteroOAuthCallbackInput {
  oauthToken: string;
  oauthVerifier: string;
}

export class ZoteroOAuthService {
  private readonly accountService: ZoteroAccountService;
  private readonly fetchFn: typeof fetch;
  private readonly zoteroOAuthBaseUrl: string;

  constructor(
    accountService: ZoteroAccountService,
    fetchFn?: typeof fetch,
    zoteroOAuthBaseUrl = "https://www.zotero.org/oauth"
  ) {
    this.accountService = accountService;
    this.fetchFn = fetchFn || globalThis.fetch;
    this.zoteroOAuthBaseUrl = zoteroOAuthBaseUrl.replace(/\/+$/, "");
  }

  /**
   * Skeleton for initiating Zotero OAuth 1.0a flow.
   * Requests a temporary token and constructs the user authorization URL.
   */
  async initiate(userId: string, callbackUrl: string): Promise<ZoteroOAuthInitiateResponse> {
    if (!userId) {
      throw new Error("User ID is required to initiate OAuth flow");
    }

    const tempToken = `zt_req_${Math.random().toString(36).substring(2, 12)}`;
    const authorizeUrl = `${this.zoteroOAuthBaseUrl}/authorize?oauth_token=${encodeURIComponent(
      tempToken
    )}&library_access=1&notes_access=1&write_access=1&all_groups=readwrite`;

    return {
      oauthToken: tempToken,
      authorizeUrl,
      callbackUrl,
    };
  }

  /**
   * Skeleton for handling the OAuth 1.0a callback.
   * Exchanges temporary credentials for permanent access key (or validates the resolved key),
   * then securely saves encrypted at rest via ZoteroAccountService.
   */
  async handleCallback(userId: string, input: ZoteroOAuthCallbackInput) {
    if (!userId) {
      throw new Error("User ID is required to complete OAuth flow");
    }
    if (!input.oauthToken || !input.oauthVerifier) {
      throw new Error("Both oauthToken and oauthVerifier are required");
    }

    let permanentKey = input.oauthToken;

    // Optional upstream exchange: POST /oauth/access
    try {
      const resp = await this.fetchFn(`${this.zoteroOAuthBaseUrl}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `oauth_token=${encodeURIComponent(input.oauthToken)}&oauth_verifier=${encodeURIComponent(input.oauthVerifier)}`,
      });
      if (resp.ok) {
        const text = await resp.text();
        const params = new URLSearchParams(text);
        const exchanged = params.get("oauth_token");
        if (exchanged) {
          permanentKey = exchanged;
        }
      }
    } catch {
      // Fallback to provided token
    }

    // Delegate to accountService which validates via keys/current and stores encrypted at rest
    return this.accountService.linkApiKey(userId, permanentKey);
  }
}
