import { MarkNames, type SuggestionMarkAttributes } from "../schema.js";

export const SuggestionInsertMarkSpec = {
  name: MarkNames.SUGGESTION_INSERT,
  inclusive: false,

  defaultAttributes: (): SuggestionMarkAttributes => ({
    suggestionId: "",
    userId: "",
    userName: "",
    userColor: "#22c55e",
    timestamp: new Date().toISOString(),
  }),

  toDOM(attrs: SuggestionMarkAttributes): [string, Record<string, string>, number] {
    return [
      "span",
      {
        class:
          "citedocs-suggestion-insert underline decoration-green-500 decoration-2 text-green-900 bg-green-50/70",
        "data-suggestion-id": attrs.suggestionId,
        "data-user-id": attrs.userId,
        "data-user-name": attrs.userName,
        "data-user-color": attrs.userColor,
        "data-timestamp": attrs.timestamp,
        title: `Suggested by ${attrs.userName}`,
      },
      0,
    ];
  },

  parseDOM: [
    {
      tag: "span[data-suggestion-id][class*='citedocs-suggestion-insert']",
      getAttrs(domNode: HTMLElement): SuggestionMarkAttributes {
        return {
          suggestionId: domNode.getAttribute("data-suggestion-id") || "",
          userId: domNode.getAttribute("data-user-id") || "",
          userName: domNode.getAttribute("data-user-name") || "Collaborator",
          userColor: domNode.getAttribute("data-user-color") || "#22c55e",
          timestamp: domNode.getAttribute("data-timestamp") || "",
        };
      },
    },
  ],
};

export const SuggestionDeleteMarkSpec = {
  name: MarkNames.SUGGESTION_DELETE,
  inclusive: false,

  defaultAttributes: (): SuggestionMarkAttributes => ({
    suggestionId: "",
    userId: "",
    userName: "",
    userColor: "#ef4444",
    timestamp: new Date().toISOString(),
  }),

  toDOM(attrs: SuggestionMarkAttributes): [string, Record<string, string>, number] {
    return [
      "span",
      {
        class:
          "citedocs-suggestion-delete line-through decoration-red-500 decoration-2 text-red-700 bg-red-50/70",
        "data-suggestion-id": attrs.suggestionId,
        "data-user-id": attrs.userId,
        "data-user-name": attrs.userName,
        "data-user-color": attrs.userColor,
        "data-timestamp": attrs.timestamp,
        title: `Deletion suggested by ${attrs.userName}`,
      },
      0,
    ];
  },

  parseDOM: [
    {
      tag: "span[data-suggestion-id][class*='citedocs-suggestion-delete']",
      getAttrs(domNode: HTMLElement): SuggestionMarkAttributes {
        return {
          suggestionId: domNode.getAttribute("data-suggestion-id") || "",
          userId: domNode.getAttribute("data-user-id") || "",
          userName: domNode.getAttribute("data-user-name") || "Collaborator",
          userColor: domNode.getAttribute("data-user-color") || "#ef4444",
          timestamp: domNode.getAttribute("data-timestamp") || "",
        };
      },
    },
  ],
};
