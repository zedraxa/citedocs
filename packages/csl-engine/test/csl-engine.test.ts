import { describe, it, expect } from "vitest";
import { CSLEngine, StyleRegistry, MOCK_APA_CSL } from "../src/index.js";
import type { CSLItem, CitationCluster } from "@citedocs/shared";

describe("@citedocs/csl-engine", () => {
  const item1: CSLItem = {
    id: "item-1",
    type: "article-journal",
    title: "Quantum Gravity and Spacetime Curvature",
    author: [
      { family: "Einstein", given: "Albert" },
      { family: "Rosen", given: "Nathan" },
    ],
    issued: { "date-parts": [[1935]] },
    "container-title": "Physical Review",
    volume: "47",
    DOI: "10.1103/PhysRev.47.777",
  };

  const item2: CSLItem = {
    id: "item-2",
    type: "book",
    title: "The Structure of Scientific Revolutions",
    author: [{ family: "Kuhn", given: "Thomas S." }],
    issued: { "date-parts": [[1962]] },
    publisher: "University of Chicago Press",
  };

  it("registers and searches built-in styles", () => {
    const registry = new StyleRegistry();
    const allStyles = registry.list();
    expect(allStyles.length).toBeGreaterThanOrEqual(10);

    const apa = registry.get("apa");
    expect(apa?.shortTitle).toBe("APA 7th");

    const searchResults = registry.search("ieee");
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].id).toBe("ieee");
  });

  it("formats single citation with author and year", () => {
    const engine = new CSLEngine(MOCK_APA_CSL, "en-US", [item1]);
    const cluster: CitationCluster = {
      citationId: "c1",
      citationItems: [{ id: "item-1" }],
      properties: { noteIndex: 0 },
    };

    const formatted = engine.formatCitation(cluster);
    expect(formatted).toBe("(Einstein & Rosen, 1935)");
  });

  it("handles locators and prefixes in citation clusters", () => {
    const engine = new CSLEngine(MOCK_APA_CSL, "en-US", [item1]);
    const cluster: CitationCluster = {
      citationId: "c2",
      citationItems: [
        {
          id: "item-1",
          locator: "778",
          label: "page",
          prefix: "see ",
        },
      ],
      properties: { noteIndex: 0 },
    };

    const formatted = engine.formatCitation(cluster);
    expect(formatted).toBe("(see Einstein & Rosen, 1935, page 778)");
  });

  it("handles author suppression for narrative citations", () => {
    const engine = new CSLEngine(MOCK_APA_CSL, "en-US", [item2]);
    const cluster: CitationCluster = {
      citationId: "c3",
      citationItems: [
        {
          id: "item-2",
          suppressAuthor: true,
        },
      ],
      properties: { noteIndex: 0 },
    };

    const formatted = engine.formatCitation(cluster);
    expect(formatted).toBe("(1962)");
  });

  it("formats multi-cite clusters", () => {
    const engine = new CSLEngine(MOCK_APA_CSL, "en-US", [item1, item2]);
    const cluster: CitationCluster = {
      citationId: "c4",
      citationItems: [{ id: "item-1" }, { id: "item-2" }],
      properties: { noteIndex: 0 },
    };

    const formatted = engine.formatCitation(cluster);
    expect(formatted).toBe("(Einstein & Rosen, 1935; Kuhn, 1962)");
  });

  it("generates formatted alphabetical bibliography", () => {
    const engine = new CSLEngine(MOCK_APA_CSL, "en-US", [item2, item1]);
    const bib = engine.makeBibliography();

    expect(bib.entries).toHaveLength(2);
    // Einstein comes before Kuhn alphabetically
    expect(bib.entries[0]).toContain("Einstein & Rosen (1935)");
    expect(bib.entries[1]).toContain("Kuhn (1962)");
    expect(bib.html).toContain('class="csl-bib-body"');
  });
});
