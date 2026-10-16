import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CSLEngine } from "@citedocs/csl-engine";
import type { CSLItem } from "@citedocs/shared";
import { NodeNames, type BibliographyNodeAttributes } from "../schema.js";
import { collectCitationClusters, switchStyle, type SwitchStyleOptions } from "../csl.js";

export interface BibliographyOptions {
  engine?: CSLEngine;
  items?: CSLItem[];
  styleId?: string;
  lang?: string;
  autoUpdate?: boolean;
}

export interface BibliographyStorage {
  engine: CSLEngine | null;
  items: CSLItem[];
  styleId: string;
  lang: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bibliography: {
      setBibliography: (attributes?: Partial<BibliographyNodeAttributes>) => ReturnType;
      insertBibliography: (attributes?: Partial<BibliographyNodeAttributes>) => ReturnType;
      updateBibliography: (attributes?: Partial<BibliographyNodeAttributes>) => ReturnType;
      switchStyle: (styleId: string, options?: SwitchStyleOptions) => ReturnType;
    };
  }
}

/**
 * Strips HTML tags and unescapes entities for clean plain text display in atom node views.
 */
export function cleanEntryText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<div[^>]*>/gi, "")
    .replace(/<\/div>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Computes an up-to-date bibliography from doc clusters by registering and processing them
 * through citeproc-js before calling makeBibliography.
 */
export function computeBibliography(
  engine: CSLEngine,
  doc: ProseMirrorNode,
): ReturnType<CSLEngine["makeBibliography"]> {
  const clusters = collectCitationClusters(doc);
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    const pre: [string, number][] = clusters
      .slice(0, i)
      .map((item) => [item.citationId, item.properties.noteIndex]);
    engine.processCitationCluster(c, pre, []);
  }
  return engine.makeBibliography();
}

export const bibliographyPluginKey = new PluginKey("citedocsBibliographyAutoUpdate");

/**
 * Bibliography TipTap Node Extension.
 *
 * Implements a block atom node rendering a live formatted academic bibliography
 * generated via @citedocs/csl-engine CSLEngine.makeBibliography.
 * Round-trips attributes through HTML data attributes for persistent rendering.
 */
export const Bibliography = Node.create<BibliographyOptions, BibliographyStorage>({
  name: NodeNames.BIBLIOGRAPHY,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      engine: undefined,
      items: [],
      styleId: "apa",
      lang: "en-US",
      autoUpdate: true,
    };
  },

  addStorage() {
    return {
      engine: null,
      items: [],
      styleId: "apa",
      lang: "en-US",
    };
  },

  onCreate() {
    const styleId = this.options.styleId ?? "apa";
    const lang = this.options.lang ?? "en-US";
    const items = this.options.items ?? [];
    this.storage.styleId = styleId;
    this.storage.lang = lang;
    this.storage.items = [...items];

    if (this.options.engine) {
      this.storage.engine = this.options.engine;
    } else {
      try {
        this.storage.engine = new CSLEngine(styleId, lang, items);
      } catch {
        // Fallback or lazy init
        this.storage.engine = null;
      }
    }
  },

  addAttributes() {
    return {
      bibliographyId: {
        default: "bibliography",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-bibliography-id") || element.getAttribute("id") || "bibliography",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-bibliography-id": (attributes.bibliographyId as string) || "bibliography",
        }),
      },
      styleId: {
        default: "apa",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-style-id") || "apa",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-style-id": (attributes.styleId as string) || "apa",
        }),
      },
      lang: {
        default: "en-US",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-lang") || "en-US",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-lang": (attributes.lang as string) || "en-US",
        }),
      },
      entries: {
        default: [],
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-entries");
          if (raw) {
            try {
              return JSON.parse(raw);
            } catch {
              try {
                return JSON.parse(raw.replace(/&quot;/g, '"'));
              } catch {
                // fall through
              }
            }
          }
          const entryElements = element.querySelectorAll(".csl-entry");
          if (entryElements.length > 0) {
            return Array.from(entryElements).map((el) => el.textContent?.trim() || "");
          }
          return [];
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-entries": JSON.stringify(attributes.entries || []),
        }),
      },
      html: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-html") ||
          element.querySelector(".csl-bib-body")?.outerHTML ||
          element.innerHTML ||
          "",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-html": (attributes.html as string) || "",
        }),
      },
      text: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-text") ||
          element.textContent?.trim() ||
          "",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-text": (attributes.text as string) || "",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-bibliography]",
      },
      {
        tag: "div.citedocs-bibliography",
      },
      {
        tag: "div[data-csl-bibliography]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const entries: string[] = (node.attrs.entries as string[]) || [];
    const entriesDOM =
      entries.length > 0
        ? entries.map((entry) => [
            "div",
            { class: "csl-entry" },
            cleanEntryText(entry),
          ])
        : [["div", { class: "csl-entry csl-entry-empty text-gray-400 italic" }, "No references cited."]];

    return [
      "div",
      mergeAttributes(
        {
          class:
            "citedocs-bibliography csl-bib-container mt-6 pt-4 border-t border-gray-200 select-none",
          "data-bibliography": "true",
        },
        HTMLAttributes,
      ),
      ["div", { class: "csl-bib-body" }, ...entriesDOM],
    ];
  },

  addCommands() {
    return {
      setBibliography:
        (attributes?: Partial<BibliographyNodeAttributes>) =>
        ({ commands, editor }) => {
          let attrs = { ...attributes };
          if (!attrs.entries || attrs.entries.length === 0) {
            const engine =
              this.storage.engine ??
              (this.options.items?.length
                ? new CSLEngine(
                    attrs.styleId ?? this.storage.styleId ?? "apa",
                    attrs.lang ?? this.storage.lang ?? "en-US",
                    this.options.items,
                  )
                : null);

            if (engine) {
              const bib = computeBibliography(engine, editor.state.doc);
              attrs = {
                styleId: engine.getStyleXml() ? attrs.styleId ?? this.storage.styleId ?? "apa" : "apa",
                lang: engine.getLang(),
                entries: bib.entries,
                html: bib.html,
                text: bib.text,
                ...attrs,
              };
            }
          }

          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },

      insertBibliography:
        (attributes?: Partial<BibliographyNodeAttributes>) =>
        ({ commands, editor }) => {
          let attrs = { ...attributes };
          if (!attrs.entries || attrs.entries.length === 0) {
            const engine =
              this.storage.engine ??
              (this.options.items?.length
                ? new CSLEngine(
                    attrs.styleId ?? this.storage.styleId ?? "apa",
                    attrs.lang ?? this.storage.lang ?? "en-US",
                    this.options.items,
                  )
                : null);

            if (engine) {
              const bib = computeBibliography(engine, editor.state.doc);
              attrs = {
                styleId: attrs.styleId ?? this.storage.styleId ?? "apa",
                lang: engine.getLang(),
                entries: bib.entries,
                html: bib.html,
                text: bib.text,
                ...attrs,
              };
            }
          }

          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },

      updateBibliography:
        (attributes?: Partial<BibliographyNodeAttributes>) =>
        ({ tr, dispatch, editor }) => {
          let bibPos = -1;
          let existingNode: ProseMirrorNode | null = null;

          editor.state.doc.descendants((node, pos) => {
            if (node.type.name === NodeNames.BIBLIOGRAPHY && bibPos === -1) {
              bibPos = pos;
              existingNode = node;
              return false;
            }
          });

          if (bibPos === -1 || !existingNode) {
            return false;
          }

          const currentAttrs = (existingNode as ProseMirrorNode).attrs;
          let mergedAttrs: BibliographyNodeAttributes = {
            ...currentAttrs,
            ...attributes,
          };

          if (!attributes?.entries || attributes.entries.length === 0) {
            const engine =
              this.storage.engine ??
              (this.options.items?.length
                ? new CSLEngine(
                    mergedAttrs.styleId ?? "apa",
                    mergedAttrs.lang ?? "en-US",
                    this.options.items,
                  )
                : null);

            if (engine) {
              const bib = computeBibliography(engine, editor.state.doc);
              mergedAttrs = {
                ...mergedAttrs,
                entries: bib.entries,
                html: bib.html,
                text: bib.text,
              };
            }
          }

          if (dispatch) {
            tr.setNodeMarkup(bibPos, undefined, mergedAttrs);
          }
          return true;
        },

      switchStyle:
        (styleId: string, options?: SwitchStyleOptions) =>
        ({ editor }) => {
          switchStyle(editor, styleId, options);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const storage = this.storage;

    return [
      new Plugin({
        key: bibliographyPluginKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!options.autoUpdate) {
            return null;
          }

          if (transactions.some((tr) => tr.getMeta(bibliographyPluginKey)?.skipAutoUpdate)) {
            return null;
          }

          const docChanged = transactions.some((tr) => tr.docChanged);
          if (!docChanged) {
            return null;
          }

          // Check if bibliography node exists in new doc
          let bibPos = -1;
          let bibNode: ProseMirrorNode | null = null;
          newState.doc.descendants((node, pos) => {
            if (node.type.name === NodeNames.BIBLIOGRAPHY && bibPos === -1) {
              bibPos = pos;
              bibNode = node;
              return false;
            }
          });

          if (bibPos === -1 || !bibNode) {
            return null;
          }

          const targetNode = bibNode as ProseMirrorNode;

          const engine =
            storage.engine ??
            (options.items?.length
              ? new CSLEngine(
                  (targetNode.attrs.styleId as string) || "apa",
                  (targetNode.attrs.lang as string) || "en-US",
                  options.items,
                )
              : null);

          if (!engine) {
            return null;
          }

          const bib = computeBibliography(engine, newState.doc);

          // Only update if bibliography content actually changed (avoids infinite loop)
          if (
            bib.html === targetNode.attrs.html &&
            Array.isArray(targetNode.attrs.entries) &&
            targetNode.attrs.entries.length === bib.entries.length
          ) {
            return null;
          }

          const tr = newState.tr;
          tr.setNodeMarkup(bibPos, undefined, {
            ...targetNode.attrs,
            entries: bib.entries,
            html: bib.html,
            text: bib.text,
          });

          return tr;
        },
      }),
    ];
  },
});

/**
 * Backward-compatible ProseMirror schema specification for Bibliography node.
 */
export const BibliographyNodeSpec = {
  name: NodeNames.BIBLIOGRAPHY,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  defaultAttributes: (): BibliographyNodeAttributes => ({
    bibliographyId: "bibliography",
    styleId: "apa",
    lang: "en-US",
    entries: [],
    html: "",
    text: "",
  }),

  toDOM(attrs: BibliographyNodeAttributes): [string, Record<string, string>, [string, Record<string, string>, ...unknown[]]] {
    const entries = attrs.entries || [];
    const entriesDOM =
      entries.length > 0
        ? entries.map((entry) => [
            "div",
            { class: "csl-entry" },
            cleanEntryText(entry),
          ])
        : [["div", { class: "csl-entry csl-entry-empty" }, "No references cited."]];

    return [
      "div",
      {
        class: "citedocs-bibliography csl-bib-container",
        "data-bibliography": "true",
        "data-bibliography-id": attrs.bibliographyId || "bibliography",
        "data-style-id": attrs.styleId || "apa",
        "data-lang": attrs.lang || "en-US",
        "data-entries": JSON.stringify(attrs.entries || []),
        "data-html": attrs.html || "",
        "data-text": attrs.text || "",
      },
      ["div", { class: "csl-bib-body" }, ...entriesDOM],
    ];
  },

  parseDOM: [
    {
      tag: "div[data-bibliography]",
      getAttrs(domNode: HTMLElement): BibliographyNodeAttributes {
        const rawEntries = domNode.getAttribute("data-entries");
        let entries: string[] = [];
        if (rawEntries) {
          try {
            entries = JSON.parse(rawEntries);
          } catch {
            entries = [];
          }
        }
        return {
          bibliographyId: domNode.getAttribute("data-bibliography-id") || "bibliography",
          styleId: domNode.getAttribute("data-style-id") || "apa",
          lang: domNode.getAttribute("data-lang") || "en-US",
          entries,
          html: domNode.getAttribute("data-html") || domNode.innerHTML || "",
          text: domNode.getAttribute("data-text") || domNode.textContent?.trim() || "",
        };
      },
    },
  ],
};
