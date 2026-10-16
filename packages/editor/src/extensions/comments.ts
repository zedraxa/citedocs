import { MarkNames, type CommentMarkAttributes } from "../schema.js";

export const CommentMarkSpec = {
  name: MarkNames.COMMENT,
  inclusive: false,

  defaultAttributes: (): CommentMarkAttributes => ({
    threadId: "",
  }),

  toDOM(attrs: CommentMarkAttributes): [string, Record<string, string>, number] {
    return [
      "span",
      {
        class:
          "citedocs-comment-highlight bg-amber-100 border-b-2 border-amber-400 cursor-pointer hover:bg-amber-200 transition-colors",
        "data-comment-thread-id": attrs.threadId,
      },
      0,
    ];
  },

  parseDOM: [
    {
      tag: "span[data-comment-thread-id]",
      getAttrs(domNode: HTMLElement): CommentMarkAttributes {
        return {
          threadId: domNode.getAttribute("data-comment-thread-id") || "",
        };
      },
    },
  ],
};
