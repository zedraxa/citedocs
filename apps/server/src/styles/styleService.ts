import {
  PINNED_POPULAR_STYLES,
  PINNED_STYLE_IDS,
  normalizeStyleId,
} from "@citedocs/shared";

export interface StyleItem {
  id: string;
  title: string;
  shortTitle?: string;
  citationFormat?: "author-date" | "numeric" | "note";
  dependent?: boolean;
  isPinned?: boolean;
  href?: string;
}

export interface StyleIndexServiceOptions {
  fetchFn?: typeof fetch;
  ttlMs?: number;
  remoteUrl?: string;
}

const DEFAULT_REMOTE_URL = "https://www.zotero.org/styles-files/styles.json";
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Normalizes text for Turkish-friendly and case-insensitive search.
 * Maps Turkish diacritics (ı, ğ, ü, ş, ö, ç) to standard Latin equivalents.
 */
export function normalizeSearchText(text: string): string {
  if (!text) return "";
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .toLowerCase()
    .trim();
}

export class StyleIndexService {
  private cache: StyleItem[] | null = null;
  private lastFetched = 0;
  private fetchFn: typeof fetch;
  private ttlMs: number;
  private remoteUrl: string;
  private fetchPromise: Promise<StyleItem[]> | null = null;

  constructor(options: StyleIndexServiceOptions = {}) {
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this.remoteUrl = options.remoteUrl || DEFAULT_REMOTE_URL;
  }

  /**
   * Returns bundled fallback styles when offline.
   */
  public getBundledStyles(): StyleItem[] {
    return PINNED_POPULAR_STYLES.map((s) => ({
      id: s.id,
      title: s.title,
      shortTitle: s.shortTitle,
      citationFormat: s.citationFormat,
      dependent: false,
      isPinned: true,
      href: `https://www.zotero.org/styles/${s.id}`,
    }));
  }

  /**
   * Fetches or retrieves the full cached list of styles.
   */
  public async getAllStyles(): Promise<StyleItem[]> {
    const now = Date.now();
    if (this.cache && now - this.lastFetched < this.ttlMs) {
      return this.cache;
    }

    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.fetchRemoteStyles()
      .then((items) => {
        this.cache = items;
        this.lastFetched = Date.now();
        this.fetchPromise = null;
        return items;
      })
      .catch((_err) => {
        this.fetchPromise = null;
        if (this.cache && this.cache.length > 0) {
          return this.cache;
        }
        return this.getBundledStyles();
      });

    return this.fetchPromise;
  }

  private async fetchRemoteStyles(): Promise<StyleItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await this.fetchFn(this.remoteUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch styles: HTTP ${res.status}`);
      }

      const raw = (await res.json()) as Array<{
        name: string;
        title: string;
        titleShort?: string;
        categories?: { format?: string };
        dependent?: number | boolean;
        href?: string;
      }>;

      if (!Array.isArray(raw)) {
        throw new Error("Invalid styles.json payload");
      }

      const pinnedSet = new Set<string>(PINNED_STYLE_IDS);

      const items: StyleItem[] = raw.map((entry) => {
        const id = normalizeStyleId(entry.name);
        const format = entry.categories?.format as
          | "author-date"
          | "numeric"
          | "note"
          | undefined;

        return {
          id,
          title: entry.title,
          shortTitle: entry.titleShort,
          citationFormat: format,
          dependent: Boolean(entry.dependent),
          isPinned: pinnedSet.has(id),
          href: entry.href || `https://www.zotero.org/styles/${id}`,
        };
      });

      // Ensure all pinned popular styles exist in the list even if missing or named differently
      for (const pinned of PINNED_POPULAR_STYLES) {
        if (!items.some((i) => i.id === pinned.id)) {
          items.unshift({
            id: pinned.id,
            title: pinned.title,
            shortTitle: pinned.shortTitle,
            citationFormat: pinned.citationFormat,
            dependent: false,
            isPinned: true,
            href: `https://www.zotero.org/styles/${pinned.id}`,
          });
        }
      }

      return items;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Searches styles with debounced minimum length (2 chars).
   * Empty or < 2 characters returns the pinned popular styles list.
   * Results are limited to `limit` (default 50) to prevent DOM/tab freezing.
   */
  public async searchStyles(query?: string, limit = 50): Promise<StyleItem[]> {
    const rawQ = (query || "").trim();
    const normQ = normalizeSearchText(rawQ);

    const all = await this.getAllStyles();

    // When query is empty or less than 2 characters, return pinned popular styles
    if (normQ.length < 2) {
      const pinnedList = all.filter((s) => s.isPinned);
      // Sort pinned styles by the defined order in PINNED_STYLE_IDS
      const orderMap = new Map<string, number>(
        PINNED_STYLE_IDS.map((id, idx) => [id, idx]),
      );
      pinnedList.sort((a, b) => {
        const oA = orderMap.get(a.id) ?? 999;
        const oB = orderMap.get(b.id) ?? 999;
        return oA - oB;
      });
      return pinnedList;
    }

    // Rank matching styles
    const scored: Array<{ item: StyleItem; score: number }> = [];

    for (const item of all) {
      const normId = normalizeSearchText(item.id);
      const normTitle = normalizeSearchText(item.title);
      const normShort = item.shortTitle ? normalizeSearchText(item.shortTitle) : "";

      let score = 0;

      // Exact matches
      if (normId === normQ) {
        score += 100;
      } else if (normTitle === normQ || normShort === normQ) {
        score += 90;
      } else if (normId.startsWith(normQ)) {
        score += 70;
      } else if (normTitle.startsWith(normQ) || normShort.startsWith(normQ)) {
        score += 60;
      } else if (normId.includes(normQ)) {
        score += 40;
      } else if (normTitle.includes(normQ) || normShort.includes(normQ)) {
        score += 30;
      }

      if (score > 0) {
        // Bonus for popular pinned styles
        if (item.isPinned) {
          score += 25;
        }
        // Independent styles preferred over dependent styles
        if (!item.dependent) {
          score += 5;
        }
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, limit)).map((s) => s.item);
  }

  /**
   * Retrieves a single style by its ID.
   */
  public async getStyleById(id: string): Promise<StyleItem | null> {
    const cleanId = normalizeStyleId(id);
    const all = await this.getAllStyles();
    const found = all.find((s) => s.id === cleanId);
    if (found) return found;

    // Check bundled fallback
    const bundled = this.getBundledStyles().find((s) => s.id === cleanId);
    return bundled || null;
  }
}
