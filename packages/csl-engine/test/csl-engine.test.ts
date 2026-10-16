import { describe, it, expect, beforeAll } from "vitest";
import { performance } from "perf_hooks";
import {
  CSLEngine,
  StyleRegistry,
  LocaleRegistry,
  UnknownStyleError,
  IEEE_STYLE_XML,
  MLA_STYLE_XML,
  VANCOUVER_STYLE_XML,
  MOCK_APA_CSL,
} from "../src/index.js";
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

  const item3: CSLItem = {
    id: "item-3",
    type: "article-journal",
    title: "A Mathematical Theory of Communication",
    author: [{ family: "Shannon", given: "Claude E." }],
    issued: { "date-parts": [[1948]] },
    "container-title": "Bell System Technical Journal",
    volume: "27",
  };

  let apaEngine: CSLEngine;

  beforeAll(() => {
    // Warm citeproc once per file without leaving citations in the shared fixture.
    const warmup = new CSLEngine("apa", "en-US", [item1]);
    warmup.formatCitation({
      citationId: "warmup",
      citationItems: [{ id: item1.id }],
      properties: { noteIndex: 0 },
    });
    warmup.makeBibliography();
    warmup.switchStyle("ieee");

    // Prepare common APA fixture engine
    apaEngine = new CSLEngine("apa", "en-US", [item1, item2, item3]);
  });

  it("registers and searches built-in styles", () => {
    const registry = new StyleRegistry();
    const allStyles = registry.list();
    expect(allStyles.length).toBeGreaterThanOrEqual(10);

    const apa = registry.get("apa");
    expect(apa?.shortTitle).toBe("APA 7th");

    const searchResults = registry.search("ieee");
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].id).toBe("ieee");

    const searchMla = registry.search("mla");
    expect(searchMla.some((s) => s.id === "modern-language-association")).toBe(true);
  });

  it("bundles official styles and locales offline with CC BY-SA license notices", () => {
    const styleRegistry = new StyleRegistry();
    const localeRegistry = new LocaleRegistry();

    // Verify all required styles are bundled
    const requiredStyles = [
      "apa",
      "ieee",
      "chicago-author-date",
      "modern-language-association",
      "vancouver",
    ];

    for (const styleId of requiredStyles) {
      const xml = styleRegistry.getXml(styleId);
      expect(xml, `Style XML for ${styleId} should be bundled`).toBeDefined();
      expect(xml).toContain('license="http://creativecommons.org/licenses/by-sa/3.0/"');
    }

    // Verify locales
    const enUsXml = localeRegistry.get("en-US");
    expect(enUsXml).toBeDefined();
    expect(enUsXml).toContain('license="http://creativecommons.org/licenses/by-sa/3.0/"');

    const trTrXml = localeRegistry.get("tr-TR");
    expect(trTrXml).toBeDefined();
    expect(trTrXml).toContain('license="http://creativecommons.org/licenses/by-sa/3.0/"');
  });

  it("formats single citation with author and year (APA 7th)", () => {
    const cluster: CitationCluster = {
      citationId: "c1",
      citationItems: [{ id: "item-1" }],
      properties: { noteIndex: 0 },
    };

    const formatted = apaEngine.formatCitation(cluster);
    expect(formatted).toBe("(Einstein & Rosen, 1935)");
  });

  it("handles locators and prefixes in citation clusters", () => {
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

    const formatted = apaEngine.formatCitation(cluster);
    expect(formatted).toBe("(see Einstein & Rosen, 1935, p. 778)");
  });

  it("handles author suppression for narrative citations", () => {
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

    const formatted = apaEngine.formatCitation(cluster);
    expect(formatted).toBe("(1962)");
  });

  it("formats multi-cite clusters", () => {
    const cluster: CitationCluster = {
      citationId: "c4",
      citationItems: [{ id: "item-1" }, { id: "item-2" }],
      properties: { noteIndex: 0 },
    };

    const formatted = apaEngine.formatCitation(cluster);
    expect(formatted).toBe("(Einstein & Rosen, 1935; Kuhn, 1962)");
  });

  it("generates formatted alphabetical bibliography in APA 7th (HTML and text)", () => {
    const engine = new CSLEngine(MOCK_APA_CSL, "en-US", [item2, item1]);
    const bib = engine.makeBibliography();

    expect(bib.entries).toHaveLength(2);
    // Einstein comes before Kuhn alphabetically in APA
    expect(bib.entries[0]).toContain("Einstein, A.");
    expect(bib.entries[0]).toContain("Rosen, N.");
    expect(bib.entries[0]).toContain("1935");
    expect(bib.entries[1]).toContain("Kuhn, T. S.");
    expect(bib.entries[1]).toContain("1962");
    expect(bib.html).toContain('class="csl-bib-body"');

    // Plain text bibliography output
    expect(bib.text).toBeDefined();
    expect(bib.text).toContain("Einstein, A., & Rosen, N. (1935)");
    expect(bib.text).toContain("Kuhn, T. S. (1962)");
  });

  it("renders numeric citations and ordered bibliography in IEEE style", () => {
    const engine = new CSLEngine(IEEE_STYLE_XML, "en-US", [item3, item1, item2]);

    // Cite item3 first, then item1
    const cluster1: CitationCluster = {
      citationId: "c1",
      citationItems: [{ id: "item-3" }],
      properties: { noteIndex: 0 },
    };
    const cluster2: CitationCluster = {
      citationId: "c2",
      citationItems: [{ id: "item-1" }],
      properties: { noteIndex: 0 },
    };

    const updates1 = engine.processCitationCluster(cluster1, [], []);
    expect(updates1).toHaveLength(1);
    expect(updates1[0].formattedText).toBe("[1]");

    const updates2 = engine.processCitationCluster(cluster2, [["c1", 0]], []);
    expect(updates2).toHaveLength(1);
    expect(updates2[0].formattedText).toBe("[2]");

    const bib = engine.makeBibliography();
    expect(bib.entries).toHaveLength(2);
    // First entry cited is Shannon (item-3), so [1] must be Shannon
    expect(bib.entries[0]).toContain("[1]");
    expect(bib.entries[0]).toContain("Shannon");
    // Second entry cited is Einstein (item-1), so [2] must be Einstein
    expect(bib.entries[1]).toContain("[2]");
    expect(bib.entries[1]).toContain("Einstein");
  });

  it("renders localized terms in Turkish locale (tr-TR) vs English (en-US)", () => {
    // MLA uses 'and' between two authors, localized via CSL locale
    const engineTr = new CSLEngine(MLA_STYLE_XML, "tr-TR", [item1]);
    const cluster: CitationCluster = {
      citationId: "c-tr",
      citationItems: [{ id: "item-1" }],
      properties: { noteIndex: 0 },
    };

    const formattedTr = engineTr.formatCitation(cluster);
    // In Turkish locale, 'and' must be rendered as 've'
    expect(formattedTr).toBe("(Einstein ve Rosen)");

    const engineEn = new CSLEngine(MLA_STYLE_XML, "en-US", [item1]);
    const formattedEn = engineEn.formatCitation(cluster);
    expect(formattedEn).toBe("(Einstein and Rosen)");
  });

  it("switching APA -> IEEE updates all clusters and bibliography for 50 items / 100 clusters", () => {
    const items: CSLItem[] = [];
    for (let i = 1; i <= 50; i++) {
      items.push({
        id: `bench-item-${i}`,
        type: "article-journal",
        title: `Research Discovery ${i}`,
        author: [{ family: `Researcher${i}`, given: `Initial${i}` }],
        issued: { "date-parts": [[2000 + (i % 24)]] },
        "container-title": `Journal of Testing ${i % 7}`,
      });
    }

    const clusters: CitationCluster[] = [];
    for (let c = 1; c <= 100; c++) {
      const itemIdx = ((c - 1) % 50) + 1;
      clusters.push({
        citationId: `bench-c-${c}`,
        citationItems: [{ id: `bench-item-${itemIdx}` }],
        properties: { noteIndex: 0 },
      });
    }

    // Initialize with APA 7th
    const engine = new CSLEngine("apa", "en-US", items);
    for (const cluster of clusters) {
      engine.registerCluster(cluster);
    }

    // Generate initial bibliography to establish state and warm up JIT
    engine.makeBibliography();
    engine.switchStyle("ieee");
    engine.switchStyle("apa");

    // Measure style switch from APA 7th -> IEEE
    const start = performance.now();
    const result = engine.switchStyle("ieee");
    const duration = performance.now() - start;

    // Strict SLA runs separately, with no competing test files/packages.
    if (process.env.CITEDOCS_TEST_PERF === "1") {
      // Warm up switching so JIT optimizes the path
      for (let w = 0; w < 2; w++) {
        engine.switchStyle("apa");
        engine.switchStyle("ieee");
      }
      const samples: number[] = [];
      for (let run = 0; run < 5; run++) {
        engine.switchStyle("apa");
        const startRun = performance.now();
        engine.switchStyle("ieee");
        samples.push(performance.now() - startRun);
      }
      const median = samples.sort((a, b) => a - b)[2];
      console.info(`CSL style switch median (5 warm runs): ${median.toFixed(1)} ms`);
      const threshold = process.env.CI ? 500 : 300;
      expect(median).toBeLessThan(threshold);
    }

    // Assert all 100 clusters are recomputed with numeric citations
    expect(result.clusterUpdates).toHaveLength(100);
    expect(result.clusterUpdates[0].formattedText).toBe("[1]");
    expect(result.clusterUpdates[1].formattedText).toBe("[2]");

    // Assert bibliography has 50 entries ordered in IEEE numeric style
    expect(result.bibliography.entries).toHaveLength(50);
    expect(result.bibliography.entries[0]).toContain("[1]");
    expect(result.bibliography.html).toContain('class="csl-bib-body"');
  });

  it("lazy-loading interface throws typed UnknownStyleError for unknown styles", async () => {
    const registry = new StyleRegistry();

    // Unknown style without loader
    await expect(registry.load("non-existent-style-12345")).rejects.toThrow(UnknownStyleError);

    try {
      await registry.load("custom-journal-x");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownStyleError);
      const styleErr = err as UnknownStyleError;
      expect(styleErr.code).toBe("UNKNOWN_STYLE");
      expect(styleErr.styleId).toBe("custom-journal-x");
    }

    // CSLEngine with unknown style throws UnknownStyleError
    expect(() => new CSLEngine("unknown-style-abc")).toThrow(UnknownStyleError);

    // Test async loader integration (simulating on-demand fetching for 10,000+ official styles)
    registry.setLoader(async (styleId: string) => {
      if (styleId === "custom-lazy-style") {
        return VANCOUVER_STYLE_XML;
      }
      return undefined;
    });

    const loadedXml = await registry.load("custom-lazy-style");
    expect(loadedXml).toBe(VANCOUVER_STYLE_XML);
    // Cached on subsequent lookup
    expect(registry.getXml("custom-lazy-style")).toBe(VANCOUVER_STYLE_XML);
  });

  it("handles missing items gracefully with fallback without crashing", () => {
    const engine = new CSLEngine("apa", "en-US", []);
    const cluster: CitationCluster = {
      citationId: "c-missing",
      citationItems: [{ id: "non-existent-item" }],
      properties: { noteIndex: 0 },
    };

    const formatted = engine.formatCitation(cluster);
    expect(formatted).toContain("Unknown");
  });
});
