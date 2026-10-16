import { describe, it, expect } from "vitest";
import { exportDocumentToDocx, importDocxZoteroFields } from "../src/index.js";
import type { DocxExportInput } from "../src/types.js";

describe("@citedocs/docx-exporter: Round-Trip", () => {
  it("importDocxZoteroFields round-trips the citation JSON for the exported fixture", async () => {
    const input: DocxExportInput = {
      title: "Round-Trip Verification Document",
      paragraphs: [
        {
          type: "heading",
          level: 1,
          children: ["1. Introduction"],
        },
        {
          children: [
            "Recent advancements in science (",
            {
              type: "citation",
              citationId: "cit-kuhn-1962",
              items: [
                {
                  id: "kuhn1962",
                  locator: "42",
                  label: "page",
                  prefix: "see ",
                  suffix: " for paradigm shifts",
                  itemData: {
                    id: "kuhn1962",
                    type: "book",
                    title: "The Structure of Scientific Revolutions",
                    author: [{ family: "Kuhn", given: "Thomas S." }],
                    issued: { "date-parts": [[1962]] },
                    publisher: "University of Chicago Press",
                  },
                },
              ],
              formattedText: "(see Kuhn, 1962, p. 42 for paradigm shifts)",
            },
            ") have shown revolutionary progress. Later, Shannon (",
            {
              type: "citation",
              citationId: "cit-shannon-1948",
              items: [
                {
                  id: "shannon1948",
                  suppressAuthor: true,
                  locator: "379-423",
                  label: "page",
                  itemData: {
                    id: "shannon1948",
                    type: "article-journal",
                    title: "A Mathematical Theory of Communication",
                    author: [{ family: "Shannon", given: "Claude E." }],
                    issued: { "date-parts": [[1948]] },
                    "container-title": "Bell System Technical Journal",
                    volume: 27,
                  },
                },
              ],
              formattedText: "(1948, pp. 379-423)",
            },
            ") formalized communication theory.",
          ],
        },
      ],
      bibliography: {
        heading: "References",
        asField: true,
        entries: [
          "Kuhn, T. S. (1962). <i>The Structure of Scientific Revolutions</i>. University of Chicago Press.",
          "Shannon, C. E. (1948). A Mathematical Theory of Communication. <i>Bell System Technical Journal</i>, 27, 379–423.",
        ],
      },
    };

    // 1. Export document to DOCX
    const docxBuffer = await exportDocumentToDocx(input);
    expect(docxBuffer).toBeInstanceOf(Buffer);
    expect(docxBuffer.length).toBeGreaterThan(1000);

    // 2. Import and scan Zotero fields from the exported DOCX buffer
    const extracted = await importDocxZoteroFields(docxBuffer);

    // 3. Verify extracted citations count
    expect(extracted).toHaveLength(2);
    expect(extracted.citations).toHaveLength(2);

    // 4. Verify Citation 1 (Kuhn)
    const cit1 = extracted[0];
    expect(cit1.citationID).toBe("cit-kuhn-1962");
    expect(cit1.properties.formattedCitation).toBe("(see Kuhn, 1962, p. 42 for paradigm shifts)");
    expect(cit1.citationItems).toHaveLength(1);

    const item1 = cit1.citationItems[0];
    expect(item1.id).toBe("kuhn1962");
    expect(item1.locator).toBe("42");
    expect(item1.label).toBe("page");
    expect(item1.prefix).toBe("see ");
    expect(item1.suffix).toBe(" for paradigm shifts");
    expect(item1.itemData).toBeDefined();
    expect((item1.itemData as Record<string, unknown>).title).toBe(
      "The Structure of Scientific Revolutions",
    );
    expect((item1.itemData as Record<string, unknown>).publisher).toBe(
      "University of Chicago Press",
    );

    // 5. Verify Citation 2 (Shannon)
    const cit2 = extracted[1];
    expect(cit2.citationID).toBe("cit-shannon-1948");
    expect(cit2.properties.formattedCitation).toBe("(1948, pp. 379-423)");
    expect(cit2.citationItems).toHaveLength(1);

    const item2 = cit2.citationItems[0];
    expect(item2.id).toBe("shannon1948");
    expect(item2["suppress-author"]).toBe(true);
    expect(item2.locator).toBe("379-423");
    expect(item2.label).toBe("page");
    expect(item2.itemData).toBeDefined();
    expect((item2.itemData as Record<string, unknown>).title).toBe(
      "A Mathematical Theory of Communication",
    );

    // 6. Verify Bibliography field
    expect(extracted.bibliography).toBeDefined();
    expect(extracted.bibliography!.fieldType).toBe("bibliography");
  });
});
