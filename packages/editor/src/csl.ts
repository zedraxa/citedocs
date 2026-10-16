import { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CSLEngine, type BibliographyOutput, type CitationClusterUpdate } from "@citedocs/csl-engine";
import type { CSLItem, CitationCluster, CitationItem } from "@citedocs/shared";
import { NodeNames } from "./schema.js";
import { bibliographyPluginKey, type BibliographyStorage } from "./extensions/bibliography.js";

export interface CitationNodeEntry {
  node: ProseMirrorNode;
  pos: number;
  cluster: CitationCluster;
}

export interface SwitchStyleOptions {
  engine?: CSLEngine;
  items?: CSLItem[];
  lang?: string;
  insertBibliographyIfMissing?: boolean;
}

export interface SwitchStyleResult {
  styleId: string;
  durationMs: number;
  clusterUpdates: CitationClusterUpdate[];
  bibliography: BibliographyOutput;
}

export interface InsertBibliographyOptions {
  styleId?: string;
  lang?: string;
  items?: CSLItem[];
  engine?: CSLEngine;
}

function getBibStorage(editor: Editor): BibliographyStorage | undefined {
  return (editor.storage as unknown as Record<string, unknown>).bibliography as BibliographyStorage | undefined;
}

/**
 * Traverses a ProseMirror document or Editor instance and collects all CitationClusters
 * in document order.
 */
export function collectCitationClusters(
  docOrEditor: ProseMirrorNode | Editor,
): CitationCluster[] {
  const doc = "state" in docOrEditor ? docOrEditor.state.doc : docOrEditor;
  const clusters: CitationCluster[] = [];

  doc.descendants((child) => {
    if (child.type.name === NodeNames.CITATION) {
      clusters.push({
        citationId: (child.attrs.citationId as string) || "",
        citationItems: (child.attrs.items as CitationItem[]) || [],
        properties: {
          noteIndex: (child.attrs.noteIndex as number) || 0,
          formattedCitation: (child.attrs.formattedText as string) || undefined,
        },
      });
    }
  });

  return clusters;
}

/**
 * Collects all citation nodes along with their document positions and parsed clusters.
 */
export function collectCitationNodes(
  docOrEditor: ProseMirrorNode | Editor,
): CitationNodeEntry[] {
  const doc = "state" in docOrEditor ? docOrEditor.state.doc : docOrEditor;
  const entries: CitationNodeEntry[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === NodeNames.CITATION) {
      entries.push({
        node,
        pos,
        cluster: {
          citationId: (node.attrs.citationId as string) || "",
          citationItems: (node.attrs.items as CitationItem[]) || [],
          properties: {
            noteIndex: (node.attrs.noteIndex as number) || 0,
            formattedCitation: (node.attrs.formattedText as string) || undefined,
          },
        },
      });
    }
  });

  return entries;
}

/**
 * Re-evaluates all citation clusters in document order using CSLEngine and updates
 * the formattedText attributes on every citation node in a single transaction.
 */
export function updateCitationClusters(
  editor: Editor,
  engine?: CSLEngine,
): CitationClusterUpdate[] {
  const bibStorage = getBibStorage(editor);
  const cslEngine =
    engine ??
    bibStorage?.engine ??
    new CSLEngine(
      bibStorage?.styleId ?? "apa",
      bibStorage?.lang ?? "en-US",
      bibStorage?.items ?? [],
    );

  const citationEntries = collectCitationNodes(editor);
  if (citationEntries.length === 0) return [];

  for (const { cluster } of citationEntries) {
    cslEngine.registerCluster(cluster);
  }

  const allUpdates: CitationClusterUpdate[] = [];
  const tr = editor.state.tr;
  let hasChanges = false;

  for (let i = 0; i < citationEntries.length; i++) {
    const { cluster, pos, node } = citationEntries[i];
    const pre: [string, number][] = citationEntries
      .slice(0, i)
      .map((e) => [e.cluster.citationId, e.cluster.properties.noteIndex]);

    const updates = cslEngine.processCitationCluster(cluster, pre, []);
    for (const u of updates) {
      allUpdates.push(u);
      if (u.citationId === cluster.citationId && u.formattedText !== node.attrs.formattedText) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          formattedText: u.formattedText,
        });
        hasChanges = true;
      }
    }
  }

  if (hasChanges) {
    tr.setMeta(bibliographyPluginKey, { skipAutoUpdate: true });
    editor.view.dispatch(tr);
  }

  return allUpdates;
}

export const formatCitationNodes = updateCitationClusters;

/**
 * Generates an up-to-date bibliography from document citations and updates the existing
 * bibliography node in the editor.
 */
export function updateBibliography(
  editor: Editor,
  engine?: CSLEngine,
  options?: { styleId?: string; lang?: string },
): BibliographyOutput | null {
  const bibStorage = getBibStorage(editor);
  const cslEngine =
    engine ??
    bibStorage?.engine ??
    new CSLEngine(
      options?.styleId ?? bibStorage?.styleId ?? "apa",
      options?.lang ?? bibStorage?.lang ?? "en-US",
      bibStorage?.items ?? [],
    );

  const clusters = collectCitationClusters(editor);
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    const pre: [string, number][] = clusters
      .slice(0, i)
      .map((item) => [item.citationId, item.properties.noteIndex]);
    cslEngine.processCitationCluster(c, pre, []);
  }

  const bibOutput = cslEngine.makeBibliography();

  let bibPos = -1;
  let bibNode: ProseMirrorNode | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === NodeNames.BIBLIOGRAPHY && bibPos === -1) {
      bibPos = pos;
      bibNode = node;
      return false;
    }
  });

  if (bibPos !== -1 && bibNode) {
    const targetNode = bibNode as ProseMirrorNode;
    const tr = editor.state.tr;
    tr.setNodeMarkup(bibPos, undefined, {
      ...targetNode.attrs,
      styleId: options?.styleId ?? targetNode.attrs.styleId ?? "apa",
      lang: options?.lang ?? targetNode.attrs.lang ?? "en-US",
      entries: bibOutput.entries,
      html: bibOutput.html,
      text: bibOutput.text,
    });
    tr.setMeta(bibliographyPluginKey, { skipAutoUpdate: true });
    editor.view.dispatch(tr);
  }

  return bibOutput;
}

/**
 * High-speed citation style switcher targeting <300ms SLA for ~50 items / 100 clusters.
 *
 * Atomically re-renders all citation clusters and the live bibliography within a single
 * ProseMirror transaction without causing full document reloads or node shifts.
 */
export function switchStyle(
  editor: Editor,
  styleId: string,
  options?: SwitchStyleOptions,
): SwitchStyleResult {
  const start = performance.now();
  const bibStorage = getBibStorage(editor);
  const lang =
    options?.lang ??
    bibStorage?.lang ??
    "en-US";

  let engine =
    options?.engine ??
    bibStorage?.engine;

  if (options?.items && options.items.length > 0) {
    if (!engine) {
      engine = new CSLEngine(styleId, lang, options.items);
    } else {
      const existingCount = engine.getItems().length;
      if (existingCount < options.items.length) {
        engine.updateItems(options.items);
      }
    }
    if (bibStorage) {
      bibStorage.items = [...options.items];
    }
  }

  if (!engine) {
    const storedItems = bibStorage?.items || [];
    engine = new CSLEngine(styleId, lang, storedItems);
  }

  if (bibStorage) {
    bibStorage.engine = engine;
    bibStorage.styleId = styleId;
    bibStorage.lang = lang;
  }

  // Register all document citation clusters if not already registered
  const clusters = collectCitationClusters(editor.state.doc);
  const existingClusters = engine.getClusters();
  if (existingClusters.length !== clusters.length) {
    for (const cluster of clusters) {
      engine.registerCluster(cluster);
    }
  }

  // Switch style with engine pooling
  const switchResult = engine.switchStyle(styleId, lang);

  // Map cluster updates by citation ID
  const updateMap = new Map<string, string>();
  for (const update of switchResult.clusterUpdates) {
    updateMap.set(update.citationId, update.formattedText);
  }

  // Apply atomic changes to all citation nodes and bibliography node in a single transaction
  const tr = editor.state.tr;
  let foundBib = false;
  let bibPos = -1;
  let bibNode: ProseMirrorNode | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === NodeNames.CITATION) {
      const citationId = (node.attrs.citationId as string) || "";
      const newFormatted = updateMap.get(citationId);
      if (newFormatted !== undefined && newFormatted !== node.attrs.formattedText) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          formattedText: newFormatted,
        });
      }
    } else if (node.type.name === NodeNames.BIBLIOGRAPHY && !foundBib) {
      foundBib = true;
      bibPos = pos;
      bibNode = node;
    }
  });

  if (foundBib && bibNode && bibPos !== -1) {
    const targetNode = bibNode as ProseMirrorNode;
    tr.setNodeMarkup(bibPos, undefined, {
      ...targetNode.attrs,
      styleId,
      lang,
      entries: switchResult.bibliography.entries,
      html: switchResult.bibliography.html,
      text: switchResult.bibliography.text,
    });
  } else if (options?.insertBibliographyIfMissing && editor.schema.nodes[NodeNames.BIBLIOGRAPHY]) {
    const bibNodeType = editor.schema.nodes[NodeNames.BIBLIOGRAPHY];
    const newBibNode = bibNodeType.create({
      styleId,
      lang,
      entries: switchResult.bibliography.entries,
      html: switchResult.bibliography.html,
      text: switchResult.bibliography.text,
    });
    tr.insert(tr.doc.content.size, newBibNode);
  }

  tr.setMeta(bibliographyPluginKey, { skipAutoUpdate: true });
  editor.view.dispatch(tr);

  const durationMs = performance.now() - start;

  return {
    styleId,
    durationMs,
    clusterUpdates: switchResult.clusterUpdates,
    bibliography: switchResult.bibliography,
  };
}

/**
 * Inserts a bibliography node into the document, computing initial bibliography from citations.
 */
export function insertBibliography(
  editor: Editor,
  options?: InsertBibliographyOptions,
): boolean {
  const bibStorage = getBibStorage(editor);
  const styleId =
    options?.styleId ??
    bibStorage?.styleId ??
    "apa";
  const lang =
    options?.lang ??
    bibStorage?.lang ??
    "en-US";
  const items =
    options?.items ??
    bibStorage?.items ??
    [];

  let engine: CSLEngine | undefined =
    options?.engine ??
    bibStorage?.engine ??
    undefined;
  if (!engine) {
    try {
      engine = new CSLEngine(styleId, lang, items);
    } catch {
      engine = undefined;
    }
  }

  let entries: string[] = [];
  let html = "";
  let text = "";

  if (engine) {
    const clusters = collectCitationClusters(editor.state.doc);
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const pre: [string, number][] = clusters
        .slice(0, i)
        .map((item) => [item.citationId, item.properties.noteIndex]);
      engine.processCitationCluster(c, pre, []);
    }
    const bib = engine.makeBibliography();
    entries = bib.entries;
    html = bib.html;
    text = bib.text ?? "";
  }

  return editor.commands.insertContent({
    type: NodeNames.BIBLIOGRAPHY,
    attrs: {
      styleId,
      lang,
      entries,
      html,
      text,
    },
  });
}
