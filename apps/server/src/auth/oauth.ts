export interface OAuthUserProfile {
  provider: "google" | "orcid";
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface GoogleOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface OrcidOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  sandbox?: boolean;
}

export interface OAuthServiceOptions {
  google?: GoogleOAuthConfig;
  orcid?: OrcidOAuthConfig;
  fetchFn?: typeof fetch;
}

export class OAuthService {
  private googleConfig: GoogleOAuthConfig;
  private orcidConfig: OrcidOAuthConfig;
  private fetchFn: typeof fetch;

  constructor(options: OAuthServiceOptions = {}) {
    this.googleConfig = options.google || {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
    };

    this.orcidConfig = options.orcid || {
      clientId: process.env.ORCID_CLIENT_ID,
      clientSecret: process.env.ORCID_CLIENT_SECRET,
      redirectUri: process.env.ORCID_REDIRECT_URI,
      sandbox: process.env.ORCID_SANDBOX === "true",
    };

    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  isGoogleEnabled(): boolean {
    return Boolean(this.googleConfig.clientId && this.googleConfig.clientSecret);
  }

  isOrcidEnabled(): boolean {
    return Boolean(this.orcidConfig.clientId && this.orcidConfig.clientSecret);
  }

  getProviders() {
    return {
      google: this.isGoogleEnabled(),
      orcid: this.isOrcidEnabled(),
    };
  }

  getGoogleAuthUrl(state: string, fallbackRedirectUri?: string): string {
    if (!this.isGoogleEnabled()) {
      throw new Error("Google OAuth is not configured");
    }
    const redirectUri = this.googleConfig.redirectUri || fallbackRedirectUri;
    if (!redirectUri) {
      throw new Error("Missing Google redirect URI");
    }

    const params = new URLSearchParams({
      client_id: this.googleConfig.clientId!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "select_account",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  getOrcidAuthUrl(state: string, fallbackRedirectUri?: string): string {
    if (!this.isOrcidEnabled()) {
      throw new Error("ORCID OAuth is not configured");
    }
    const redirectUri = this.orcidConfig.redirectUri || fallbackRedirectUri;
    if (!redirectUri) {
      throw new Error("Missing ORCID redirect URI");
    }

    const baseUrl = this.orcidConfig.sandbox
      ? "https://sandbox.orcid.org/oauth/authorize"
      : "https://orcid.org/oauth/authorize";

    const params = new URLSearchParams({
      client_id: this.orcidConfig.clientId!,
      response_type: "code",
      scope: "/authenticate",
      redirect_uri: redirectUri,
      state,
    });

    return `${baseUrl}?${params.toString()}`;
  }

  async handleGoogleCallback(code: string, fallbackRedirectUri?: string): Promise<OAuthUserProfile> {
    if (!this.isGoogleEnabled()) {
      throw new Error("Google OAuth is not configured");
    }

    const redirectUri = this.googleConfig.redirectUri || fallbackRedirectUri;
    const tokenRes = await this.fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.googleConfig.clientId!,
        client_secret: this.googleConfig.clientSecret!,
        redirect_uri: redirectUri || "",
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google token exchange failed: ${tokenRes.status} ${errText}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; id_token?: string };

    const userInfoRes = await this.fetchFn("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      throw new Error("Failed to fetch Google user info");
    }

    const info = (await userInfoRes.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    return {
      provider: "google",
      providerUserId: info.sub,
      email: info.email || null,
      displayName: info.name || null,
      avatarUrl: info.picture || null,
      emailVerified: Boolean(info.email_verified),
    };
  }

  async handleOrcidCallback(code: string, fallbackRedirectUri?: string): Promise<OAuthUserProfile> {
    if (!this.isOrcidEnabled()) {
      throw new Error("ORCID OAuth is not configured");
    }

    const redirectUri = this.orcidConfig.redirectUri || fallbackRedirectUri;
    const tokenUrl = this.orcidConfig.sandbox
      ? "https://sandbox.orcid.org/oauth/token"
      : "https://orcid.org/oauth/token";

    const tokenRes = await this.fetchFn(tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.orcidConfig.clientId!,
        client_secret: this.orcidConfig.clientSecret!,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri || "",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`ORCID token exchange failed: ${tokenRes.status} ${errText}`);
    }

    const data = (await tokenRes.json()) as {
      orcid: string;
      name?: string;
      access_token: string;
    };

    return {
      provider: "orcid",
      providerUserId: data.orcid,
      email: null, // ORCID scope /authenticate provides persistent iD and name
      displayName: data.name || `ORCID Researcher (${data.orcid})`,
      avatarUrl: null,
      emailVerified: true, // ORCID requires verified research identity
    };
  }
}
