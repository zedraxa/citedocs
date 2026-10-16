import { describe, it, expect } from "vitest";
import {
  CreateDocumentSchema,
  InsertCitationSchema,
  IdentifierLookupSchema,
  type ZoteroItem,
  type CitationCluster,
} from "../src/index.js";

describe("@citedocs/shared", () => {
  it("validates CreateDocumentSchema with default values", () => {
    const input = { title: "Scientific Writing Assignment 1" };
    const parsed = CreateDocumentSchema.parse(input);

    expect(parsed.title).toBe("Scientific Writing Assignment 1");
    expect(parsed.cslStyleId).toBe("apa");
    expect(parsed.cslLocale).toBe("en-US");
    expect(parsed.preferences.pageSize).toBe("letter");
    expect(parsed.preferences.margins.top).toBe(25.4);
  });

  it("rejects invalid document creation with empty title", () => {
    expect(() => CreateDocumentSchema.parse({ title: "" })).toThrow();
  });

  it("validates valid CitationCluster schema", () => {
    const cluster: CitationCluster = {
      citationId: "cit-101",
      citationItems: [
        {
          id: "item-42",
          locator: "15-20",
          label: "page",
          prefix: "see ",
        },
      ],
      properties: {
        noteIndex: 0,
      },
    };

    const parsed = InsertCitationSchema.parse(cluster);
    expect(parsed.citationId).toBe("cit-101");
    expect(parsed.citationItems[0].locator).toBe("15-20");
  });

  it("validates identifier lookups", () => {
    const doiLookup = IdentifierLookupSchema.parse({
      identifier: "10.1038/s41586-021-03392-y",
      type: "doi",
    });
    expect(doiLookup.identifier).toBe("10.1038/s41586-021-03392-y");
    expect(doiLookup.type).toBe("doi");
  });

  it("allows correct typing for ZoteroItem", () => {
    const item: ZoteroItem = {
      key: "ITEM1234",
      version: 1,
      itemType: "journalArticle",
      title: "Antigravity Research in Modern Physics",
      creators: [
        {
          creatorType: "author",
          firstName: "Yusuf",
          lastName: "Kavak",
        },
      ],
      tags: [{ tag: "physics" }, { tag: "scientific-writing" }],
      collections: ["COLL001"],
    };

    expect(item.key).toBe("ITEM1234");
    expect(item.creators[0].lastName).toBe("Kavak");
    expect(item.tags).toHaveLength(2);
  });
});
