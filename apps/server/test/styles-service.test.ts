import { describe, it, expect, vi, beforeEach } from "vitest";
import { StyleIndexService } from "../src/styles/styleService.js";

const MOCK_REMOTE_STYLES = [
  {
    name: "apa",
    title: "APA Style 7th edition",
    titleShort: "Publication Manual of the American Psychological Association",
    categories: { format: "author-date" },
    dependent: 0,
    href: "https://www.zotero.org/styles/apa",
  },
  {
    name: "ieee",
    title: "IEEE Reference Guide version 11.29.2023",
    titleShort: "Institute of Electrical and Electronics Engineers",
    categories: { format: "numeric" },
    dependent: 0,
    href: "https://www.zotero.org/styles/ieee",
  },
  {
    name: "chicago-author-date",
    title: "Chicago Manual of Style 18th edition (author-date)",
    categories: { format: "author-date" },
    dependent: 0,
    href: "https://www.zotero.org/styles/chicago-author-date",
  },
  {
    name: "chicago-notes-bibliography",
    title: "Chicago Manual of Style 17th edition (notes and bibliography)",
    categories: { format: "note" },
    dependent: 0,
    href: "https://www.zotero.org/styles/chicago-notes-bibliography",
  },
  {
    name: "modern-language-association",
    title: "MLA Handbook 9th edition (in-text citations)",
    titleShort: "Modern Language Association",
    categories: { format: "author-date" },
    dependent: 0,
    href: "https://www.zotero.org/styles/modern-language-association",
  },
  {
    name: "harvard-cite-them-right",
    title: "Cite Them Right 12th edition (author-date/Harvard)",
    categories: { format: "author-date" },
    dependent: 0,
    href: "https://www.zotero.org/styles/harvard-cite-them-right",
  },
  {
    name: "vancouver",
    title: "Vancouver",
    categories: { format: "numeric" },
    dependent: 0,
    href: "https://www.zotero.org/styles/vancouver",
  },
  {
    name: "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
    title: "TÜBİTAK (Türkiye Bilimsel ve Teknolojik Araştırma Kurumu) (Türkçe)",
    titleShort: "TÜBİTAK (TUBITAK)",
    categories: { format: "numeric" },
    dependent: 0,
    href: "https://www.zotero.org/styles/turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
  },
  {
    name: "nature",
    title: "Nature",
    categories: { format: "numeric" },
    dependent: 0,
    href: "https://www.zotero.org/styles/nature",
  },
];

describe("StyleIndexService", () => {
  let mockFetch: typeof fetch;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MOCK_REMOTE_STYLES,
    } as Response);
  });

  it("returns pinned popular styles when query is empty or less than 2 characters", async () => {
    const service = new StyleIndexService({ fetchFn: mockFetch });
    const resultsEmpty = await service.searchStyles("");
    expect(resultsEmpty.length).toBeGreaterThanOrEqual(8);
    expect(resultsEmpty[0].id).toBe("apa");
    expect(resultsEmpty.some((s) => s.id === "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu")).toBe(true);

    const resultsShort = await service.searchStyles("a");
    expect(resultsShort.length).toBeGreaterThanOrEqual(8);
    expect(resultsShort[0].id).toBe("apa");
  });

  it("fetches and caches remote styles list from zotero.org with TTL", async () => {
    const service = new StyleIndexService({ fetchFn: mockFetch, ttlMs: 60_000 });
    await service.searchStyles("apa");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call should use cache
    await service.searchStyles("ieee");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to bundled styles if remote fetch fails (offline resilience)", async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error("Network offline"));
    const service = new StyleIndexService({ fetchFn: failingFetch });

    const results = await service.searchStyles("");
    expect(results.length).toBeGreaterThanOrEqual(8);
    expect(results.some((s) => s.id === "apa")).toBe(true);
    expect(results.some((s) => s.id === "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu")).toBe(true);
  });

  it("searches with Turkish character normalization (e.g. tubitak matches TÜBİTAK)", async () => {
    const service = new StyleIndexService({ fetchFn: mockFetch });
    const results = await service.searchStyles("tubitak");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("turkiye-bilimsel-ve-teknolojik-arastirma-kurumu");
    expect(results[0].title).toContain("TÜBİTAK");
  });

  it("limits results to ~50 so UI never freezes with 10k items", async () => {
    // Generate 100 dummy styles matching "test"
    const manyStyles = Array.from({ length: 150 }, (_, i) => ({
      name: `test-style-${i}`,
      title: `Test Academic Journal Style ${i}`,
      categories: { format: "numeric" },
      dependent: 0,
    }));

    const mockFetchMany = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => manyStyles,
    } as Response);

    const service = new StyleIndexService({ fetchFn: mockFetchMany });
    const results = await service.searchStyles("test");
    expect(results.length).toBeLessThanOrEqual(50);
  });

  it("ranks exact matches and pinned styles ahead of partial matches", async () => {
    const service = new StyleIndexService({ fetchFn: mockFetch });
    const results = await service.searchStyles("ieee");
    expect(results[0].id).toBe("ieee");
  });

  it("retrieves a single style by id", async () => {
    const service = new StyleIndexService({ fetchFn: mockFetch });
    const style = await service.getStyleById("apa");
    expect(style).not.toBeNull();
    expect(style?.id).toBe("apa");
    expect(style?.title).toContain("APA");
  });
});
