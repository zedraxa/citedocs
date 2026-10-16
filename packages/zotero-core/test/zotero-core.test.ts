import { describe, it, expect, vi } from "vitest";
import {
  zoteroItemToCSL,
  parseDateToCSL,
  TranslationClient,
  ZoteroSyncEngine,
} from "../src/index.js";
import type { ZoteroItem } from "@citedocs/shared";

describe("@citedocs/zotero-core", () => {
  const sampleZoteroItem: ZoteroItem = {
    key: "ZOT12345",
    version: 4,
    itemType: "journalArticle",
    title: "Deep Reinforcement Learning in Scientific Workflows",
    creators: [
      {
        creatorType: "author",
        firstName: "Yusuf",
        lastName: "Kavak",
      },
      {
        creatorType: "author",
        firstName: "Alan",
        lastName: "Turing",
      },
    ],
    publicationTitle: "Journal of Artificial Intelligence Research",
    volume: "75",
    issue: "3",
    pages: "100-125",
    date: "2024-03-15",
    DOI: "10.1613/jair.1.12345",
    tags: [{ tag: "ai" }],
    collections: ["C1"],
  };

  it("converts ZoteroItem into standard CSLItem", () => {
    const csl = zoteroItemToCSL(sampleZoteroItem);

    expect(csl.id).toBe("ZOT12345");
    expect(csl.type).toBe("article-journal");
    expect(csl.title).toBe("Deep Reinforcement Learning in Scientific Workflows");
    expect(csl.author).toHaveLength(2);
    expect(csl.author?.[0].family).toBe("Kavak");
    expect(csl.author?.[1].given).toBe("Alan");
    expect(csl["container-title"]).toBe("Journal of Artificial Intelligence Research");
    expect(csl.volume).toBe("75");
    expect(csl.page).toBe("100-125");
    expect(csl.DOI).toBe("10.1613/jair.1.12345");
  });

  it("correctly parses diverse date formats into CSL dates", () => {
    const d1 = parseDateToCSL("2024-03-15");
    expect(d1["date-parts"]).toEqual([[2024, 3, 15]]);

    const d2 = parseDateToCSL("1999");
    expect(d2["date-parts"]).toEqual([[1999]]);

    const d3 = parseDateToCSL("circa 1850");
    expect(d3["date-parts"]).toEqual([[1850]]);
  });

  it("formats translation client search requests properly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [sampleZoteroItem],
    });

    const client = new TranslationClient({
      baseUrl: "http://localhost:1969",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const results = await client.searchByIdentifier("10.1613/jair.1.12345");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:1969/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "10.1613/jair.1.12345" }),
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("ZOT12345");
  });

  it("handles sync headers and version tracking in ZoteroSyncEngine", () => {
    const engine = new ZoteroSyncEngine(
      {
        userId: "123456",
        apiKey: "secretKey",
      },
      10,
    );

    const readHeaders = engine.getHeaders(false);
    expect(readHeaders["Zotero-API-Version"]).toBe("3");
    expect(readHeaders["Zotero-API-Key"]).toBe("secretKey");
    expect(readHeaders["If-Modified-Since-Version"]).toBe("10");

    const writeHeaders = engine.getHeaders(true);
    expect(writeHeaders["If-Unmodified-Since-Version"]).toBe("10");

    engine.updateLocalVersion(15);
    expect(engine.getVersion()).toBe(15);
  });

  it("detects sync concurrency conflicts", () => {
    const engine = new ZoteroSyncEngine({ userId: "123", apiKey: "key" }, 5);
    const local = { ...sampleZoteroItem, version: 5 };
    const remote = { ...sampleZoteroItem, version: 6 };

    expect(engine.evaluateConflict(local, remote)).toBe(true);
    expect(engine.evaluateConflict(local, { ...remote, version: 5 })).toBe(false);
  });
});
