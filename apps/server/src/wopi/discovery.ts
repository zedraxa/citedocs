interface CacheEntry {
  actions: Map<string, string>; // key: `${ext}:${name}` -> urlsrc
  expiresAt: number;
}

export interface CollaboraDiscoveryOptions {
  collaboraUrl?: string;
  publicCollaboraUrl?: string;
  discoveryUrl?: string;
  actionUrlOverride?: string;
  cacheTtlMs?: number;
  fetchFn?: typeof fetch;
}

const DEFAULT_COLLABORA_URL = "http://localhost:9980";
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class CollaboraDiscoveryService {
  private collaboraUrl: string;
  private publicCollaboraUrl?: string;
  private actionUrlOverride?: string;
  private cacheTtlMs: number;
  private cache: CacheEntry | null = null;
  private fetchFn: typeof fetch;

  constructor(options: CollaboraDiscoveryOptions = {}) {
    this.collaboraUrl = options.collaboraUrl || process.env.COLLABORA_URL || DEFAULT_COLLABORA_URL;
    this.publicCollaboraUrl =
      options.publicCollaboraUrl || process.env.COLLABORA_PUBLIC_URL || (options.collaboraUrl ? undefined : process.env.COLLABORA_URL);
    this.actionUrlOverride = options.actionUrlOverride || process.env.COLLABORA_ACTION_URL_OVERRIDE;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Parses discovery XML text and extracts all <action> elements into a key-value map.
   * Key format: `${ext.toLowerCase()}:${name.toLowerCase()}` -> urlsrc
   */
  parseDiscoveryXml(xmlText: string): Map<string, string> {
    const actionMap = new Map<string, string>();
    const actionRegex = /<action\s+([^>]+?)\/?>/gi;

    let match: RegExpExecArray | null;
    while ((match = actionRegex.exec(xmlText)) !== null) {
      const attrsStr = match[1];
      if (!attrsStr) continue;

      const nameMatch = /name=["']([^"']+)["']/i.exec(attrsStr);
      const extMatch = /ext=["']([^"']+)["']/i.exec(attrsStr);
      const urlsrcMatch = /urlsrc=["']([^"']+)["']/i.exec(attrsStr);

      if (nameMatch && extMatch && urlsrcMatch) {
        const name = nameMatch[1]!.toLowerCase();
        const ext = extMatch[1]!.toLowerCase();
        const urlsrc = urlsrcMatch[1]!;
        actionMap.set(`${ext}:${name}`, urlsrc);
      }
    }

    return actionMap;
  }

  /**
   * Retrieves discovered actions from Collabora /hosting/discovery with caching and offline fallback.
   */
  async getActions(): Promise<Map<string, string>> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.actions;
    }

    const discoveryEndpoint = `${this.collaboraUrl.replace(/\/+$/, "")}/hosting/discovery`;
    try {
      const response = await this.fetchFn(discoveryEndpoint, {
        headers: { Accept: "text/xml, application/xml" },
      });

      if (response.ok) {
        const xml = await response.text();
        const actions = this.parseDiscoveryXml(xml);
        this.cache = {
          actions,
          expiresAt: Date.now() + this.cacheTtlMs,
        };
        return actions;
      }
    } catch {
      // In offline environments or tests where Collabora isn't running, gracefully fallback
    }

    // Default fallback actions
    const fallbackActions = new Map<string, string>();
    const publicOrigin = (this.publicCollaboraUrl || this.collaboraUrl).replace(/\/+$/, "");
    const defaultUrlSrc = `${publicOrigin}/browser/dist/cool.html?`;
    for (const ext of ["docx", "doc", "odt", "xlsx", "pptx", "txt"]) {
      fallbackActions.set(`${ext}:edit`, defaultUrlSrc);
      fallbackActions.set(`${ext}:view`, defaultUrlSrc);
    }

    this.cache = {
      actions: fallbackActions,
      expiresAt: Date.now() + 60 * 1000, // Short cache for fallback
    };
    return fallbackActions;
  }

  /**
   * Returns the Collabora action URL for a document, incorporating WOPISrc.
   */
  async getEditorUrl(params: {
    wopiSrc: string;
    ext?: string;
    action?: string;
  }): Promise<string> {
    const ext = (params.ext || "docx").toLowerCase();
    const action = (params.action || "edit").toLowerCase();

    let baseUrlSrc = this.actionUrlOverride;
    if (!baseUrlSrc) {
      const actions = await this.getActions();
      const rawUrl =
        actions.get(`${ext}:${action}`) ||
        actions.get(`${ext}:edit`) ||
        actions.get(`${ext}:view`) ||
        `${this.collaboraUrl.replace(/\/+$/, "")}/browser/dist/cool.html?`;

      if (this.publicCollaboraUrl) {
        try {
          const publicUrlObj = new URL(this.publicCollaboraUrl);
          const parsedBase = new URL(rawUrl);
          parsedBase.protocol = publicUrlObj.protocol;
          parsedBase.hostname = publicUrlObj.hostname;
          parsedBase.port = publicUrlObj.port;
          baseUrlSrc = parsedBase.toString();
        } catch {
          baseUrlSrc = rawUrl.replace(this.collaboraUrl, this.publicCollaboraUrl);
        }
      } else {
        baseUrlSrc = rawUrl;
      }
    }

    // Ensure baseUrlSrc has appropriate query separator
    const separator = baseUrlSrc.includes("?") ? (baseUrlSrc.endsWith("?") || baseUrlSrc.endsWith("&") ? "" : "&") : "?";
    return `${baseUrlSrc}${separator}WOPISrc=${encodeURIComponent(params.wopiSrc)}`;
  }

  clearCache(): void {
    this.cache = null;
  }
}
