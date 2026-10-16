import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { exportDocumentToDocx, htmlToTextRuns } from "../src/index.js";
import type { DocxExportInput } from "../src/types.js";

describe("@citedocs/docx-exporter: Exporter", () => {
  it("exporting a doc with one in-text citation produces a .docx whose raw XML (unzip) contains ADDIN ZOTERO_ITEM and CSL_CITATION", async () => {
    const input: DocxExportInput = {
      title: "Sample Manuscript",
      paragraphs: [
        {
          children: [
            "As demonstrated in recent findings ",
            {
              type: "citation",
              citationId: "cit-alpha-1",
              items: [
                {
                  id: "item-101",
                  locator: "42",
                  label: "page",
                  uris: ["http://zotero.org/users/12345/items/ABC101"],
                  itemData: {
                    id: "item-101",
                    type: "article-journal",
                    title: "The Open Science Manifesto",
                    author: [{ family: "Doe", given: "John" }],
                    issued: { "date-parts": [[2023]] },
                  },
                },
              ],
              formattedText: "(Doe, 2023, p. 42)",
            },
            ", the results are conclusive.",
          ],
        },
      ],
    };

    const buffer = await exportDocumentToDocx(input);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);

    // Unzip and inspect raw XML
    const zip = await JSZip.loadAsync(buffer);
    const docXmlFile = zip.file("word/document.xml");
    expect(docXmlFile).toBeDefined();

    const xml = await docXmlFile!.async("text");

    // Acceptance criteria checks
    expect(xml).toContain("ADDIN ZOTERO_ITEM");
    expect(xml).toContain("CSL_CITATION");
    expect(xml).toContain("cit-alpha-1");
    expect(xml).toContain("item-101");
    expect(xml).toContain("The Open Science Manifesto");
    expect(xml).toContain("(Doe, 2023, p. 42)");

    // Field boundaries
    expect(xml).toContain('w:fldCharType="begin"');
    expect(xml).toContain('w:fldCharType="separate"');
    expect(xml).toContain('w:fldCharType="end"');
    expect(xml).toContain('xml:space="preserve"');
  });

  it("exporting two citations + bibliography includes both citation payloads and is a valid zip/docx", async () => {
    const input: DocxExportInput = {
      title: "Comprehensive Study",
      paragraphs: [
        {
          children: [
            "Primary finding cited here ",
            {
              type: "citation",
              citationId: "cit-1",
              items: [
                {
                  id: "ref-1",
                  locator: "15",
                  label: "page",
                  itemData: {
                    id: "ref-1",
                    type: "book",
                    title: "Classical Mechanics",
                    author: [{ family: "Goldstein", given: "Herbert" }],
                    issued: { "date-parts": [[1980]] },
                  },
                },
              ],
              formattedText: "(Goldstein, 1980, p. 15)",
            },
            ".",
          ],
        },
        {
          children: [
            "Secondary finding cited later ",
            {
              type: "citation",
              citationId: "cit-2",
              items: [
                {
                  id: "ref-2",
                  suppressAuthor: true,
                  itemData: {
                    id: "ref-2",
                    type: "article-journal",
                    title: "Quantum Theory of Radiation",
                    author: [{ family: "Einstein", given: "Albert" }],
                    issued: { "date-parts": [[1917]] },
                  },
                },
              ],
              formattedText: "(1917)",
            },
            ".",
          ],
        },
      ],
      bibliography: {
        heading: "References",
        asField: true,
        entries: [
          "Einstein, A. (1917). Quantum Theory of Radiation. <i>Physikalische Zeitschrift</i>, 18, 121–128.",
          "Goldstein, H. (1980). <i>Classical Mechanics</i>. Addison-Wesley.",
        ],
      },
    };

    const buffer = await exportDocumentToDocx(input);

    // Open as zip
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")!.async("text");

    // Both citation IDs and titles are present
    expect(docXml).toContain("cit-1");
    expect(docXml).toContain("Classical Mechanics");
    expect(docXml).toContain("cit-2");
    expect(docXml).toContain("Quantum Theory of Radiation");
    expect(docXml).toContain("&quot;suppress-author&quot;:true");

    // Bibliography field code present
    expect(docXml).toContain("ADDIN ZOTERO_BIBL");
    expect(docXml).toContain("CSL_BIBLIOGRAPHY");
    expect(docXml).toContain("Physikalische Zeitschrift");
    expect(docXml).toContain("References");
  });

  it("handles headings, styled text runs (bold, italic, strike, underline, code)", async () => {
    const input: DocxExportInput = {
      paragraphs: [
        {
          type: "heading",
          level: 2,
          children: ["Section 2: Methodology"],
        },
        {
          children: [
            { type: "text", text: "Bold statement ", bold: true },
            { type: "text", text: "italic phrase ", italic: true },
            { type: "text", text: "underlined ", underline: true },
            { type: "text", text: "deleted ", strike: true },
            { type: "text", text: "console.log()", code: true },
          ],
        },
      ],
    };

    const buffer = await exportDocumentToDocx(input);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")!.async("text");

    expect(xml).toContain("Section 2: Methodology");
    expect(xml).toContain("Heading2");
    expect(xml).toContain("Bold statement");
    expect(xml).toContain("italic phrase");
    expect(xml).toContain("console.log()");
  });

  it("supports bibliography fallback mode without field code when asField is false", async () => {
    const input: DocxExportInput = {
      paragraphs: [{ children: ["Some content."] }],
      bibliography: {
        heading: "Works Cited",
        asField: false,
        entries: ["Entry A without field code.", "Entry B without field code."],
      },
    };

    const buffer = await exportDocumentToDocx(input);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")!.async("text");

    expect(xml).not.toContain("ADDIN ZOTERO_BIBL");
    expect(xml).toContain("Works Cited");
    expect(xml).toContain("Entry A without field code.");
    expect(xml).toContain("Entry B without field code.");
  });

  it("htmlToTextRuns parses inline HTML tags into styled runs", () => {
    const html = "Smith, J. (2020). <i>Book Title</i>. In <b>Conference Proc.</b> (pp. 1-5).";
    const runs = htmlToTextRuns(html);

    expect(runs.length).toBeGreaterThan(1);
    // Find italic run
    const italicRun = runs.find((r) =>
      (r as unknown as { root: unknown[] }).root.some((c: unknown) =>
        JSON.stringify(c).includes("Book Title"),
      ),
    );
    expect(italicRun).toBeDefined();
  });
});
