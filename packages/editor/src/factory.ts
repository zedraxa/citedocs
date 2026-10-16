import { type AnyExtension, getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import type { Schema } from "@tiptap/pm/model";
import type { Doc, XmlFragment } from "yjs";
import { Citation } from "./extensions/citation.js";

export interface CollabUser {
  name: string;
  color: string;
  [key: string]: unknown;
}

export interface CollabExtensionOptions {
  provider?: unknown;
  document?: Doc | null;
  field?: string;
  fragment?: XmlFragment | null;
  user?: CollabUser;
}

export interface EditorExtensionOptions {
  placeholder?: string;
  enablePlaceholder?: boolean;
  enableHistory?: boolean;
  headingLevels?: (1 | 2 | 3 | 4 | 5 | 6)[];
  provider?: unknown;
  document?: Doc | null;
  fragment?: XmlFragment | null;
  field?: string;
  user?: CollabUser;
  collab?: CollabExtensionOptions;
}

/**
 * Creates the standard CiteDocs TipTap v3 extension bundle.
 * Includes: Document, Paragraph, Heading (1-6), BulletList, OrderedList,
 * ListItem, Blockquote, CodeBlock, Marks (Bold, Italic, Underline, Strike, Link, Code),
 * TextAlign, Placeholder, and the custom Citation atom node.
 *
 * When a collaboration provider is passed (either via `options.provider` or
 * `options.collab.provider`), Collaboration (Y.Doc fragment) and
 * CollaborationCaret extensions are included, and StarterKit's built-in
 * undo/redo history is disabled (StarterKit undoRedo: false) in favor of Yjs CRDT history.
 */
export function createEditorExtensions(options: EditorExtensionOptions = {}): AnyExtension[] {
  const rawProvider = options.collab?.provider ?? options.provider;
  const isCollab = Boolean(rawProvider);
  const providerWithDoc = rawProvider as { document?: Doc } | undefined;

  // When collaborating, built-in undo/redo history MUST be disabled in StarterKit.
  // TipTap v3 uses Yjs's collaborative undo manager via the Collaboration extension.
  const enableHistory = isCollab ? false : options.enableHistory !== false;

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
      undoRedo: enableHistory ? {} : false,
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Citation,
  ];

  if (isCollab) {
    const document =
      options.collab?.document ?? options.document ?? providerWithDoc?.document ?? null;
    const fragment = options.collab?.fragment ?? options.fragment ?? null;
    const field = options.collab?.field ?? options.field ?? "default";

    extensions.push(
      Collaboration.configure({
        document,
        fragment,
        field,
      }),
    );

    const user = options.collab?.user ?? options.user ?? {
      name: "Anonymous Student",
      color: "#2563eb",
    };

    extensions.push(
      CollaborationCaret.configure({
        provider: rawProvider as never,
        user,
      }),
    );
  }

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

