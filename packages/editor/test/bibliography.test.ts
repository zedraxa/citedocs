// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vitest";
import { CSLEngine } from "@citedocs/csl-engine";
import { performance } from "perf_hooks";
import { Editor } from "@tiptap/core";
import type { CSLItem } from "@citedocs/shared";
import {
  NodeNames,
  createEditorExtensions,
  createEditorSchema,
  Bibliography,
  BibliographyNodeSpec,
  collectCitationClusters,
  collectCitationNodes,
  updateCitationClusters,
  updateBibliography,
  switchStyle,
  insertBibliography,
} from "../src/index.js";

describe("Milestone 3 Part B — Bibliography & CSL Editor Integration", () => {
  const item1: CSLItem = {
    id: "einstein1935",
    type: "article-journal",
    title: "Can Quantum-Mechanical Description of Physical Reality be Considered Complete?",
    author: [
      { family: "Einstein", given: "Albert" },
      { family: "Podolsky", given: "Boris" },
      { family: "Rosen", given: "Nathan" },
    ],
    issued: { "date-parts": [[1935]] },
    "container-title": "Physical Review",
    volume: "47",
    page: "777-780",
    DOI: "10.1103/PhysRev.47.777",
  };

  const item2: CSLItem = {
    id: "kuhn1962",
    type: "book",
    title: "The Structure of Scientific Revolutions",
    author: [{ family: "Kuhn", given: "Thomas S." }],
    issued: { "date-parts": [[1962]] },
    publisher: "University of Chicago Press",
  };

  beforeAll(() => {
    // Exercise parsing/rendering once per file; keep warm-up state out of editors.
    const engine = new CSLEngine("apa", "en-US", [item1]);
    engine.formatCitation({
      citationId: "warmup",
      citationItems: [{ id: item1.id }],
      properties: { noteIndex: 0 },
    });
    engine.makeBibliography();
    engine.switchStyle("ieee");
  });

  it("exports Bibliography TipTap node extension configured as block atom", () => {
    expect(Bibliography.name).toBe("bibliography");
    expect(Bibliography.type).toBe("node");
    expect(Bibliography.config.group).toBe("block");
    expect(Bibliography.config.atom).toBe(true);
    expect(Bibliography.config.selectable).toBe(true);
    expect(Bibliography.config.draggable).toBe(true);
  });

  it("configures BibliographyNodeSpec with default attributes and DOM serialization", () => {
    expect(BibliographyNodeSpec.name).toBe("bibliography");
    expect(BibliographyNodeSpec.group).toBe("block");
    expect(BibliographyNodeSpec.atom).toBe(true);

    const defaultAttrs = BibliographyNodeSpec.defaultAttributes();
    expect(defaultAttrs.styleId).toBe("apa");
    expect(defaultAttrs.lang).toBe("en-US");
    expect(defaultAttrs.entries).toEqual([]);

    const dom = BibliographyNodeSpec.toDOM({
      styleId: "apa",
      lang: "en-US",
      entries: ["Einstein, A. (1935). Quantum Reality."],
      html: '<div class="csl-bib-body"><div class="csl-entry">Einstein...</div></div>',
      text: "Einstein, A. (1935). Quantum Reality.",
    });

    expect(dom[0]).toBe("div");
    expect(dom[1]["data-bibliography"]).toBe("true");
    expect(dom[1]["data-style-id"]).toBe("apa");
    expect(dom[1]["data-entries"]).toContain("Einstein");
  });

  it("inserting two citation clusters then a bibliography node produces APA-like author-date/text bibliography containing both items", () => {
    const editor = new Editor({
      extensions: createEditorExtensions({
        cslItems: [item1, item2],
        cslStyleId: "apa",
      }),
      content: "<p>Intro text</p>",
    });

    // 1. Insert Citation 1 (Einstein 1935)
    editor.commands.insertCitation({
      citationId: "cit-1",
      items: [{ id: "einstein1935" }],
      formattedText: "(Einstein et al., 1935)",
    });

    // 2. Insert Citation 2 (Kuhn 1962)
    editor.commands.insertCitation({
      citationId: "cit-2",
      items: [{ id: "kuhn1962" }],
      formattedText: "(Kuhn, 1962)",
    });

    // 3. Insert Bibliography node
    const inserted = insertBibliography(editor);
    expect(inserted).toBe(true);

    // 4. Verify the bibliography node in document AST
    const json = editor.getJSON();
    const bibNode = json.content?.find((node) => node.type === NodeNames.BIBLIOGRAPHY);

    expect(bibNode).toBeDefined();
    expect(bibNode?.attrs?.styleId).toBe("apa");
    expect(bibNode?.attrs?.entries).toHaveLength(2);

    const entries = bibNode?.attrs?.entries as string[];
    // APA sorts alphabetically: Einstein before Kuhn
    expect(entries[0]).toContain("Einstein");
    expect(entries[0]).toContain("1935");
    expect(entries[1]).toContain("Kuhn");
    expect(entries[1]).toContain("1962");

    // HTML format verification
    const bibHtml = bibNode?.attrs?.html as string;
    expect(bibHtml).toContain("csl-bib-body");
    expect(bibHtml).toContain("Einstein");
    expect(bibHtml).toContain("Kuhn");

    // Plain text format verification
    const bibText = bibNode?.attrs?.text as string;
    expect(bibText).toContain("Einstein");
    expect(bibText).toContain("Kuhn");

    editor.destroy();
  });

  it("switchStyle apa -> ieee updates citation formattedText and bibliography content for 50 items / 100 clusters", () => {
    // 1. Generate 50 unique items
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

    // 2. Generate 100 citation clusters mapped across the 50 items
    const paragraphs: Array<{
      type: string;
      content: Array<{
        type: string;
        attrs?: Record<string, unknown>;
        text?: string;
      }>;
    }> = [];

    for (let c = 1; c <= 100; c++) {
      const itemIdx = ((c - 1) % 50) + 1;
      paragraphs.push({
        type: "paragraph",
        content: [
          { type: "text", text: `Paragraph ${c} discussing discovery: ` },
          {
            type: "citation",
            attrs: {
              citationId: `bench-c-${c}`,
              items: [{ id: `bench-item-${itemIdx}` }],
              formattedText: "(...)",
            },
          },
        ],
      });
    }

    // Add empty bibliography node at the end
    paragraphs.push({
      type: "bibliography",
      content: [],
    });

    const editor = new Editor({
      extensions: createEditorExtensions({
        cslItems: items,
        cslStyleId: "apa",
      }),
      content: {
        type: "doc",
        content: paragraphs,
      },
    });

    // Initial warm up (same spirit as csl-engine test)
    switchStyle(editor, "apa", { items });
    switchStyle(editor, "ieee", { items });
    switchStyle(editor, "apa", { items });

    // Verify initial APA state: citations have author-year formatted text
    const initialClusters = collectCitationClusters(editor);
    expect(initialClusters).toHaveLength(100);

    // Benchmark switch: APA 7th -> IEEE
    const result = switchStyle(editor, "ieee", { items });

    // Preserve the existing 450 ms editor budget in the isolated perf command.
    if (process.env.CITEDOCS_TEST_PERF === "1") {
      // Warm up switching so JIT optimizes the path
      for (let w = 0; w < 2; w++) {
        switchStyle(editor, "apa", { items });
        switchStyle(editor, "ieee", { items });
      }
      const samples: number[] = [];
      for (let run = 0; run < 5; run++) {
        switchStyle(editor, "apa", { items });
        const startRun = performance.now();
        switchStyle(editor, "ieee", { items });
        samples.push(performance.now() - startRun);
      }
      const median = samples.sort((a, b) => a - b)[2];
      console.info(`Editor style switch median (5 warm runs): ${median.toFixed(1)} ms`);
      const threshold = process.env.CI ? 650 : 450;
      expect(median).toBeLessThan(threshold);
    }

    // Verify all 100 citation clusters in editor AST are re-evaluated to IEEE numeric format
    expect(result.clusterUpdates).toHaveLength(100);
    expect(result.clusterUpdates[0].formattedText).toBe("[1]");
    expect(result.clusterUpdates[1].formattedText).toBe("[2]");

    const docJson = editor.getJSON();
    const citationNodes: Array<{ formattedText: string }> = [];
    let updatedBibNode: { attrs?: Record<string, unknown> } | undefined;

    for (const block of docJson.content || []) {
      if (block.type === "paragraph") {
        for (const child of block.content || []) {
          if (child.type === "citation") {
            citationNodes.push(child.attrs as { formattedText: string });
          }
        }
      } else if (block.type === "bibliography") {
        updatedBibNode = block;
      }
    }

    expect(citationNodes).toHaveLength(100);
    expect(citationNodes[0].formattedText).toBe("[1]");
    expect(citationNodes[1].formattedText).toBe("[2]");

    // Verify bibliography node content is re-rendered in IEEE format
    expect(updatedBibNode).toBeDefined();
    expect(updatedBibNode?.attrs?.styleId).toBe("ieee");
    expect(updatedBibNode?.attrs?.entries).toHaveLength(50);

    const bibEntries = updatedBibNode?.attrs?.entries as string[];
    expect(bibEntries[0]).toContain("[1]");
    expect(updatedBibNode?.attrs?.html).toContain("csl-bib-body");

    editor.destroy();
  });

  it("preserves citation and bibliography attributes across HTML serialization and round-trip parsing", () => {
    const editor = new Editor({
      extensions: createEditorExtensions({
        cslItems: [item1, item2],
      }),
      content: "<p>Text</p>",
    });

    editor.commands.insertCitation({
      citationId: "roundtrip-cit-1",
      items: [{ id: "einstein1935", locator: "777", label: "page" }],
      formattedText: "(Einstein et al., 1935, p. 777)",
      noteIndex: 2,
    });

    insertBibliography(editor, {
      styleId: "apa",
      lang: "en-US",
      items: [item1],
    });

    const html = editor.getHTML();

    // Check Citation HTML serialization
    expect(html).toContain('data-citation-id="roundtrip-cit-1"');
    expect(html).toContain("data-items=");
    expect(html).toContain("(Einstein et al., 1935, p. 777)");

    // Check Bibliography HTML serialization
    expect(html).toContain('data-bibliography="true"');
    expect(html).toContain('data-style-id="apa"');
    expect(html).toContain('class="citedocs-bibliography');
    expect(html).toContain('class="csl-bib-body"');

    // Round-trip into a fresh Editor instance
    const editor2 = new Editor({
      extensions: createEditorExtensions(),
      content: html,
    });

    const json = editor2.getJSON();
    const para = json.content?.[0];
    const parsedCitation = para?.content?.find((node) => node.type === "citation");
    const parsedBib = json.content?.find((node) => node.type === "bibliography");

    // Verify Citation node round-trip
    expect(parsedCitation).toBeDefined();
    expect(parsedCitation?.attrs?.citationId).toBe("roundtrip-cit-1");
    expect(parsedCitation?.attrs?.items[0].locator).toBe("777");
    expect(parsedCitation?.attrs?.formattedText).toBe("(Einstein et al., 1935, p. 777)");
    expect(parsedCitation?.attrs?.noteIndex).toBe(2);

    // Verify Bibliography node round-trip
    expect(parsedBib).toBeDefined();
    expect(parsedBib?.attrs?.styleId).toBe("apa");
    expect(parsedBib?.attrs?.lang).toBe("en-US");
    expect(parsedBib?.attrs?.entries?.length).toBeGreaterThan(0);

    editor.destroy();
    editor2.destroy();
  });

  it("helpers collectCitationClusters and updateCitationClusters format clusters in document order", () => {
    const editor = new Editor({
      extensions: createEditorExtensions({
        cslItems: [item1, item2],
      }),
      content: `
        <p>First <span data-citation-id="c1" data-items='[{"id":"kuhn1962"}]'>(...)</span></p>
        <p>Second <span data-citation-id="c2" data-items='[{"id":"einstein1935"}]'>(...)</span></p>
      `,
    });

    const clusters = collectCitationClusters(editor);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].citationId).toBe("c1");
    expect(clusters[1].citationId).toBe("c2");

    const nodes = collectCitationNodes(editor);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].pos).toBeGreaterThan(0);

    // Format all citation nodes with updateCitationClusters
    const updates = updateCitationClusters(editor);
    expect(updates.length).toBeGreaterThanOrEqual(2);

    const json = editor.getJSON();
    const c1 = json.content?.[0]?.content?.[1];
    const c2 = json.content?.[1]?.content?.[1];

    expect(c1?.attrs?.formattedText).toContain("Kuhn");
    expect(c2?.attrs?.formattedText).toContain("Einstein");

    // Update bibliography node using updateBibliography
    insertBibliography(editor, { styleId: "apa" });
    const bibResult = updateBibliography(editor);
    expect(bibResult).toBeDefined();
    expect(bibResult?.entries.length).toBe(2);

    editor.destroy();
  });

  it("supports disabling bibliography extension via options", () => {
    // 1. Disabled with bibliography: false
    const schemaNoBib = createEditorSchema({ bibliography: false });
    expect(Object.keys(schemaNoBib.nodes)).not.toContain("bibliography");

    // 2. Disabled with enableBibliography: false
    const schemaNoBib2 = createEditorSchema({ enableBibliography: false });
    expect(Object.keys(schemaNoBib2.nodes)).not.toContain("bibliography");

    // 3. Enabled by default
    const schemaWithBib = createEditorSchema();
    expect(Object.keys(schemaWithBib.nodes)).toContain("bibliography");
  });
});
