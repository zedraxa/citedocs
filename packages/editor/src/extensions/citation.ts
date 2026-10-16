import { NodeNames, type CitationNodeAttributes } from "../schema.js";

export const CitationNodeSpec = {
  name: NodeNames.CITATION,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  defaultAttributes: (): CitationNodeAttributes => ({
    citationId: "",
    items: [],
    formattedText: "(...)",
    noteIndex: 0,
  }),

  toDOM(attrs: CitationNodeAttributes): [string, Record<string, string>, string] {
    return [
      "span",
      {
        class:
          "citedocs-citation inline-block cursor-pointer px-1 rounded bg-blue-50 text-blue-800 hover:bg-blue-100 font-medium select-none transition-colors",
        "data-citation-id": attrs.citationId,
        "data-items": JSON.stringify(attrs.items),
        "data-note-index": String(attrs.noteIndex || 0),
      },
      attrs.formattedText || "(...)",
    ];
  },

  parseDOM: [
    {
      tag: "span[data-citation-id]",
      getAttrs(domNode: HTMLElement): CitationNodeAttributes {
        const citationId = domNode.getAttribute("data-citation-id") || "";
        const rawItems = domNode.getAttribute("data-items");
        const items = rawItems ? JSON.parse(rawItems) : [];
        const noteIndex = parseInt(domNode.getAttribute("data-note-index") || "0", 10);
        const formattedText = domNode.textContent || "(...)";

        return {
          citationId,
          items,
          formattedText,
          noteIndex,
        };
      },
    },
  ],
};
