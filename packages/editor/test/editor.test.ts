import { describe, it, expect } from "vitest";
import {
  NodeNames,
  MarkNames,
  CitationNodeSpec,
  SuggestionInsertMarkSpec,
  SuggestionDeleteMarkSpec,
  CommentMarkSpec,
} from "../src/index.js";

describe("@citedocs/editor", () => {
  it("exports complete node and mark names", () => {
    expect(NodeNames.CITATION).toBe("citation");
    expect(NodeNames.BIBLIOGRAPHY).toBe("bibliography");
    expect(NodeNames.FOOTNOTE).toBe("footnote");
    expect(MarkNames.SUGGESTION_INSERT).toBe("suggestionInsert");
    expect(MarkNames.SUGGESTION_DELETE).toBe("suggestionDelete");
    expect(MarkNames.COMMENT).toBe("comment");
  });

  it("configures CitationNodeSpec as an inline atom", () => {
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
