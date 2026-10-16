import { type AnyExtension, getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import type { Schema } from "@tiptap/pm/model";
import { Citation } from "./extensions/citation.js";

export interface EditorExtensionOptions {
  placeholder?: string;
  enablePlaceholder?: boolean;
  enableHistory?: boolean;
  headingLevels?: (1 | 2 | 3 | 4 | 5 | 6)[];
}

/**
 * Creates the standard CiteDocs TipTap v3 extension bundle.
 * Includes: Document, Paragraph, Heading (1-6), BulletList, OrderedList,
 * ListItem, Blockquote, CodeBlock, Marks (Bold, Italic, Underline, Strike, Link, Code),
 * TextAlign, Placeholder, and the custom Citation atom node.
 */
export function createEditorExtensions(options: EditorExtensionOptions = {}): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: {
        levels: options.headingLevels ?? [1, 2, 3, 4, 5, 6],
      },
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: "text-blue-600 underline cursor-pointer",
        },
      },
      undoRedo: options.enableHistory !== false ? {} : false,
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Citation,
  ];

  if (options.enablePlaceholder !== false) {
    extensions.push(
      Placeholder.configure({
        placeholder: options.placeholder ?? "Start writing or type '@' for citations...",
        emptyEditorClass: "is-editor-empty",
      }),
    );
  }

  return extensions;
}

/**
 * Generates the full ProseMirror Schema for CiteDocs from the TipTap extension set.
 */
export function createEditorSchema(options?: EditorExtensionOptions): Schema {
  return getSchema(createEditorExtensions(options));
}
