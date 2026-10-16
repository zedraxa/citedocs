// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import {
  NodeNames,
  MarkNames,
  Citation,
  CitationNodeSpec,
  SuggestionInsertMarkSpec,
  SuggestionDeleteMarkSpec,
  CommentMarkSpec,
  createEditorExtensions,
  createEditorSchema,
} from "../src/index.js";

describe("@citedocs/editor", () => {
  it("exports complete node and mark names", () => {
    expect(NodeNames.DOCUMENT).toBe("doc");
    expect(NodeNames.PARAGRAPH).toBe("paragraph");
    expect(NodeNames.HEADING).toBe("heading");
    expect(NodeNames.BULLET_LIST).toBe("bulletList");
    expect(NodeNames.ORDERED_LIST).toBe("orderedList");
    expect(NodeNames.LIST_ITEM).toBe("listItem");
    expect(NodeNames.BLOCKQUOTE).toBe("blockquote");
    expect(NodeNames.CODE_BLOCK).toBe("codeBlock");
    expect(NodeNames.CITATION).toBe("citation");
    expect(NodeNames.BIBLIOGRAPHY).toBe("bibliography");
    expect(NodeNames.FOOTNOTE).toBe("footnote");
    expect(MarkNames.BOLD).toBe("bold");
    expect(MarkNames.ITALIC).toBe("italic");
    expect(MarkNames.UNDERLINE).toBe("underline");
    expect(MarkNames.LINK).toBe("link");
    expect(MarkNames.SUGGESTION_INSERT).toBe("suggestionInsert");
    expect(MarkNames.SUGGESTION_DELETE).toBe("suggestionDelete");
    expect(MarkNames.COMMENT).toBe("comment");
  });

  it("creates schema containing required Document, Paragraph, Headings 1-6, Lists, Blockquote, CodeBlock, and Citation", () => {
    const schema = createEditorSchema();
    const nodeNames = Object.keys(schema.nodes);
    const markNames = Object.keys(schema.marks);

    // Schema nodes
    expect(nodeNames).toContain("doc");
    expect(nodeNames).toContain("paragraph");
    expect(nodeNames).toContain("heading");
    expect(nodeNames).toContain("bulletList");
    expect(nodeNames).toContain("orderedList");
    expect(nodeNames).toContain("listItem");
    expect(nodeNames).toContain("blockquote");
    expect(nodeNames).toContain("codeBlock");
    expect(nodeNames).toContain("citation");
    expect(nodeNames).toContain("text");

    // Schema marks
    expect(markNames).toContain("bold");
    expect(markNames).toContain("italic");
    expect(markNames).toContain("underline");
    expect(markNames).toContain("strike");
    expect(markNames).toContain("link");
    expect(markNames).toContain("code");

    // Verify heading supports levels 1-6
    const headingNode = schema.nodes.heading;
    expect(headingNode).toBeDefined();
    // Default attrs or levels check
    expect(headingNode.spec.attrs?.level).toBeDefined();
  });

  it("exports TipTap Citation Node extension configured as inline atom", () => {
    expect(Citation.name).toBe("citation");
    expect(Citation.type).toBe("node");
    expect(Citation.config.inline).toBe(true);
    expect(Citation.config.atom).toBe(true);
    expect(Citation.config.group).toBe("inline");
  });

  it("inserts Citation node and round-trips attributes through HTML serialization and parsing", () => {
    const extensions = createEditorExtensions();
    const editor = new Editor({
      extensions,
      content: "<p>Initial text</p>",
    });

    const citationAttrs = {
      citationId: "cit-einstein-1935",
      items: [
        {
          id: "item-einstein-1935",
          locator: "777",
          label: "page",
          prefix: "see",
          suffix: "for details",
          suppressAuthor: false,
        },
      ],
      formattedText: "(see Einstein et al., 1935, p. 777 for details)",
      noteIndex: 1,
    };

    // Insert citation node into document
    editor.commands.insertContent({
      type: "citation",
      attrs: citationAttrs,
    });

    // Check JSON representation
    const json = editor.getJSON();
    const docParagraph = json.content?.[0];
    const citationInDoc = docParagraph?.content?.find((node) => node.type === "citation");

    expect(citationInDoc).toBeDefined();
    expect(citationInDoc?.attrs?.citationId).toBe("cit-einstein-1935");
    expect(citationInDoc?.attrs?.items).toHaveLength(1);
    expect(citationInDoc?.attrs?.items[0].locator).toBe("777");
    expect(citationInDoc?.attrs?.formattedText).toBe(
      "(see Einstein et al., 1935, p. 777 for details)",
    );
    expect(citationInDoc?.attrs?.noteIndex).toBe(1);

    // Export to HTML
    const html = editor.getHTML();
    expect(html).toContain('data-citation-id="cit-einstein-1935"');
    expect(html).toContain("data-items=");
    expect(html).toContain("citedocs-citation");
    expect(html).toContain("(see Einstein et al., 1935, p. 777 for details)");

    // Round-trip: parse HTML into a fresh Editor instance
    const editor2 = new Editor({
      extensions: createEditorExtensions(),
      content: html,
    });

    const roundTrippedJson = editor2.getJSON();
    const roundTrippedParagraph = roundTrippedJson.content?.[0];
    const roundTrippedCitation = roundTrippedParagraph?.content?.find(
      (node) => node.type === "citation",
    );

    expect(roundTrippedCitation).toBeDefined();
    expect(roundTrippedCitation?.attrs?.citationId).toBe("cit-einstein-1935");
    expect(roundTrippedCitation?.attrs?.items).toEqual(citationAttrs.items);
    expect(roundTrippedCitation?.attrs?.formattedText).toBe(citationAttrs.formattedText);
    expect(roundTrippedCitation?.attrs?.noteIndex).toBe(1);

    editor.destroy();
    editor2.destroy();
  });

  it("configures CitationNodeSpec as an inline atom (backward compatibility)", () => {
    expect(CitationNodeSpec.inline).toBe(true);
    expect(CitationNodeSpec.atom).toBe(true);
    expect(CitationNodeSpec.group).toBe("inline");

    const defaultAttrs = CitationNodeSpec.defaultAttributes();
    expect(defaultAttrs.formattedText).toBe("(...)");

    const dom = CitationNodeSpec.toDOM({
      citationId: "cit-1",
      items: [{ id: "item-1", locator: "42" }],
      formattedText: "(Doe, 2023, p. 42)",
      noteIndex: 0,
    });

    expect(dom[0]).toBe("span");
    expect(dom[1]["data-citation-id"]).toBe("cit-1");
    expect(dom[1]["class"]).toContain("citedocs-citation");
    expect(dom[2]).toBe("(Doe, 2023, p. 42)");
  });

  it("configures SuggestionInsertMarkSpec with green underline style", () => {
    const dom = SuggestionInsertMarkSpec.toDOM({
      suggestionId: "sug-1",
      userId: "u-1",
      userName: "Yusuf",
      userColor: "#22c55e",
      timestamp: "2026-10-16T12:00:00Z",
    });

    expect(dom[0]).toBe("span");
    expect(dom[1]["data-suggestion-id"]).toBe("sug-1");
    expect(dom[1]["data-user-name"]).toBe("Yusuf");
    expect(dom[1]["class"]).toContain("decoration-green-500");
  });

  it("configures SuggestionDeleteMarkSpec with red strikethrough style", () => {
    const dom = SuggestionDeleteMarkSpec.toDOM({
      suggestionId: "sug-2",
      userId: "u-2",
      userName: "Advisor",
      userColor: "#ef4444",
      timestamp: "2026-10-16T12:05:00Z",
    });

    expect(dom[0]).toBe("span");
    expect(dom[1]["data-suggestion-id"]).toBe("sug-2");
    expect(dom[1]["class"]).toContain("line-through");
    expect(dom[1]["class"]).toContain("decoration-red-500");
  });

  it("configures CommentMarkSpec with highlight styling", () => {
    const dom = CommentMarkSpec.toDOM({
      threadId: "thread-99",
    });

    expect(dom[0]).toBe("span");
    expect(dom[1]["data-comment-thread-id"]).toBe("thread-99");
    expect(dom[1]["class"]).toContain("citedocs-comment-highlight");
  });
});
