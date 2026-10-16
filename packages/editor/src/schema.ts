export const NodeNames = {
  DOCUMENT: "doc",
  PARAGRAPH: "paragraph",
  HEADING: "heading",
  BLOCKQUOTE: "blockquote",
  CODE_BLOCK: "codeBlock",
  BULLET_LIST: "bulletList",
  ORDERED_LIST: "orderedList",
  LIST_ITEM: "listItem",
  TABLE: "table",
  TABLE_ROW: "tableRow",
  TABLE_HEADER: "tableHeader",
  TABLE_CELL: "tableCell",
  IMAGE: "image",
  CITATION: "citation",
  BIBLIOGRAPHY: "bibliography",
  FOOTNOTE: "footnote",
  MATH_INLINE: "mathInline",
  MATH_DISPLAY: "mathDisplay",
} as const;

export const MarkNames = {
  BOLD: "bold",
  ITALIC: "italic",
  UNDERLINE: "underline",
  STRIKE: "strike",
  CODE: "code",
  LINK: "link",
  COLOR: "textStyleColor",
  HIGHLIGHT: "highlight",
  COMMENT: "comment",
  SUGGESTION_INSERT: "suggestionInsert",
  SUGGESTION_DELETE: "suggestionDelete",
} as const;

export interface CitationNodeAttributes {
  citationId: string;
  items: Array<{
    id: string;
    locator?: string;
    label?: string;
    prefix?: string;
    suffix?: string;
    suppressAuthor?: boolean;
  }>;
  formattedText?: string;
  noteIndex?: number;
}

export interface SuggestionMarkAttributes {
  suggestionId: string;
  userId: string;
  userName: string;
  userColor: string;
  timestamp: string;
}

export interface CommentMarkAttributes {
  threadId: string;
}
