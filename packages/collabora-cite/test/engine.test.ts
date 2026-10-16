import { describe, it, expect } from "vitest";
import { CollaboraCSLEngine } from "../src/engine.js";
import { FIXTURE_ITEM_LIBBY, FIXTURE_ITEM_KAHNEMAN } from "./fixtures.js";

describe("CSL Engine (engine.ts)", () => {
  it("formats APA 7th in-text citation correctly", () => {
    const engine = new CollaboraCSLEngine("apa", "en-US", [FIXTURE_ITEM_LIBBY]);
    const res = engine.formatCitation([
      {
        id: "101",
        itemData: FIXTURE_ITEM_LIBBY,
      },
    ]);

    expect(res.plainCitation).toBe("(Libby, 2021)");
  });

  it("formats citation with locator (page number)", () => {
    const engine = new CollaboraCSLEngine("apa", "en-US", [FIXTURE_ITEM_LIBBY]);
    const res = engine.formatCitation([
      {
        id: "101",
        locator: "525",
        label: "page",
        itemData: FIXTURE_ITEM_LIBBY,
      },
    ]);

    expect(res.plainCitation).toBe("(Libby, 2021, p. 525)");
  });

  it("formats multi-item citation cluster", () => {
    const engine = new CollaboraCSLEngine("apa", "en-US", [
      FIXTURE_ITEM_LIBBY,
      FIXTURE_ITEM_KAHNEMAN,
    ]);
    const res = engine.formatCitation([
      { id: "102", itemData: FIXTURE_ITEM_KAHNEMAN },
      { id: "101", itemData: FIXTURE_ITEM_LIBBY },
    ]);

    expect(res.plainCitation).toBe("(Kahneman, 2011; Libby, 2021)");
  });

  it("formats citation in Chicago author-date style", () => {
    const engine = new CollaboraCSLEngine("chicago-author-date", "en-US", [FIXTURE_ITEM_LIBBY]);
    const res = engine.formatCitation([
      {
        id: "101",
        itemData: FIXTURE_ITEM_LIBBY,
      },
    ]);

    expect(res.plainCitation).toBe("(Libby 2021)");
  });

  it("formats citation in IEEE style (numeric bracket)", () => {
    const engine = new CollaboraCSLEngine("ieee", "en-US", [FIXTURE_ITEM_LIBBY]);
    const res = engine.formatCitation([
      {
        id: "101",
        itemData: FIXTURE_ITEM_LIBBY,
      },
    ]);

    expect(res.plainCitation).toBe("[1]");
  });

  it("generates full bibliography entries in APA and IEEE", () => {
    const engine = new CollaboraCSLEngine("apa", "en-US", [FIXTURE_ITEM_LIBBY]);
    engine.formatCitation([{ id: "101", itemData: FIXTURE_ITEM_LIBBY }]);

    const bibApa = engine.makeBibliography();
    expect(bibApa.entries.length).toBeGreaterThan(0);
    expect(bibApa.entries[0]).toContain("Libby, P. (2021). The changing landscape of atherosclerosis");

    engine.switchStyle("ieee");
    engine.formatCitation([{ id: "101", itemData: FIXTURE_ITEM_LIBBY }]);
    const bibIeee = engine.makeBibliography();
    expect(bibIeee.entries[0]).toContain("[1]");
    expect(bibIeee.entries[0]).toContain("P. Libby");
  });

  it("handles missing item without crashing via fallback placeholder", () => {
    const engine = new CollaboraCSLEngine("apa", "en-US");
    const res = engine.formatCitation([{ id: "non-existent-999" }]);

    expect(res.plainCitation).toBeDefined();
    expect(res.plainCitation).toContain("Unknown");
  });
});
