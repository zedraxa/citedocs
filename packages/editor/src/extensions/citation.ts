import { Node, mergeAttributes } from "@tiptap/core";
import { NodeNames, type CitationNodeAttributes } from "../schema.js";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    citation: {
      setCitation: (attributes: CitationNodeAttributes) => ReturnType;
      insertCitation: (attributes: CitationNodeAttributes) => ReturnType;
    };
  }
}

/**
 * Citation TipTap Node Extension.
 *
 * Implements an inline atom node representing a scholarly reference cluster.
 * Attributes round-trip through HTML data attributes for persistent rendering
 * and copy-paste interoperability.
 */
export const Citation = Node.create({
  name: NodeNames.CITATION,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      citationId: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-citation-id") || "",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-citation-id": attributes.citationId as string,
        }),
      },
      items: {
        default: [],
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-items");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            try {
              const decoded = raw.replace(/&quot;/g, '"');
              return JSON.parse(decoded);
            } catch {
              return [];
            }
          }
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-items": JSON.stringify(attributes.items || []),
        }),
      },
      formattedText: {
        default: "(...)",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-formatted-text") || element.textContent?.trim() || "(...)",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-formatted-text": (attributes.formattedText as string) || "(...)",
        }),
      },
      noteIndex: {
        default: 0,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-note-index");
          return raw ? parseInt(raw, 10) : 0;
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-note-index": String((attributes.noteIndex as number) || 0),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-citation-id]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const formattedText = node.attrs.formattedText || "(...)";
    return [
      "span",
      mergeAttributes(
        {
          class:
            "citedocs-citation inline-block cursor-pointer px-1 rounded bg-blue-50 text-blue-800 hover:bg-blue-100 font-medium select-none transition-colors border border-blue-200",
        },
        HTMLAttributes,
      ),
      formattedText,
    ];
  },

  addCommands() {
    return {
      setCitation:
        (attributes: CitationNodeAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
      insertCitation:
        (attributes: CitationNodeAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});

/**
 * Backward-compatible ProseMirror schema specification for Citation node.
 */
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
