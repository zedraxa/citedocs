import type {
  ZoteroReaderAnnotation,
  ZoteroReaderAnnotationPosition,
  ZoteroAnnotationItem,
  ZoteroAnnotationItemData,
  ZoteroAnnotationType,
} from "./types.js";

/**
 * Characters used by Zotero for base32 item keys (excludes easily confused characters).
 */
const ZOTERO_KEY_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Generates an 8-character Zotero-style alphanumeric key.
 */
export function generateZoteroKey(): string {
  let key = "";
  for (let i = 0; i < 8; i++) {
    const idx = Math.floor(Math.random() * ZOTERO_KEY_CHARS.length);
    key += ZOTERO_KEY_CHARS[idx];
  }
  return key;
}

/**
 * Formats a sortIndex string consistent with Zotero:
 * Formatted as "PPPPP|YYYYYY|XXXXX" where PPPPP is 5-digit 0-padded page index,
 * followed by coordinates.
 */
export function formatSortIndex(pageIndex: number, y = 0, x = 0): string {
  const p = Math.max(0, Math.floor(pageIndex)).toString().padStart(5, "0");
  const yCoord = Math.max(0, Math.floor(y)).toString().padStart(6, "0");
  const xCoord = Math.max(0, Math.floor(x)).toString().padStart(5, "0");
  return `${p}|${yCoord}|${xCoord}`;
}

/**
 * Parses a sortIndex string into page index and coordinates.
 */
export function parseSortIndex(sortIndex: string): { pageIndex: number; y: number; x: number } {
  if (!sortIndex || typeof sortIndex !== "string") {
    return { pageIndex: 0, y: 0, x: 0 };
  }
  const parts = sortIndex.split("|");
  const pageIndex = parts[0] ? parseInt(parts[0], 10) : 0;
  const y = parts[1] ? parseInt(parts[1], 10) : 0;
  const x = parts[2] ? parseInt(parts[2], 10) : 0;
  return {
    pageIndex: Number.isFinite(pageIndex) ? pageIndex : 0,
    y: Number.isFinite(y) ? y : 0,
    x: Number.isFinite(x) ? x : 0,
  };
}

/**
 * Normalizes tags from either string array or object array into Zotero API format.
 */
function normalizeTagsToApi(
  tags?: Array<{ tag: string } | string>,
): Array<{ tag: string }> {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => (typeof t === "string" ? { tag: t } : { tag: t.tag }));
}

/**
 * Maps a Zotero Reader annotation object into the official Zotero Web API v3 item format.
 */
export function toZoteroAnnotationItem(
  annotation: ZoteroReaderAnnotation,
  parentItemKey: string,
  version = 0,
): ZoteroAnnotationItem {
  const key = annotation.id || generateZoteroKey();
  const sortIndex =
    annotation.sortIndex ||
    formatSortIndex(
      annotation.position?.pageIndex ?? 0,
      annotation.position?.rects?.[0]?.[1] ?? 0,
      annotation.position?.rects?.[0]?.[0] ?? 0,
    );

  const positionJson = JSON.stringify(
    annotation.position || {
      pageIndex: 0,
      rects: [],
      rotation: 0,
    },
  );

  const data: ZoteroAnnotationItemData = {
    key,
    version,
    parentItem: parentItemKey,
    itemType: "annotation",
    annotationType: annotation.type || "highlight",
    annotationText: annotation.text || "",
    annotationComment: annotation.comment || "",
    annotationColor: annotation.color || "#ffd400",
    annotationPageLabel: annotation.pageLabel || String((annotation.position?.pageIndex ?? 0) + 1),
    annotationSortIndex: sortIndex,
    annotationPosition: positionJson,
    tags: normalizeTagsToApi(annotation.tags),
    dateAdded: annotation.dateCreated || new Date().toISOString(),
    dateModified: annotation.dateModified || new Date().toISOString(),
  };

  return {
    key,
    version,
    data,
  };
}

/**
 * Maps an official Zotero Web API v3 annotation item (or its data payload)
 * into a Zotero Reader annotation object.
 */
export function fromZoteroAnnotationItem(
  input: ZoteroAnnotationItem | ZoteroAnnotationItemData,
): ZoteroReaderAnnotation {
  const data: ZoteroAnnotationItemData = "data" in input ? input.data : input;

  let position: ZoteroReaderAnnotationPosition = {
    pageIndex: 0,
    rects: [],
    rotation: 0,
  };

  if (typeof data.annotationPosition === "string" && data.annotationPosition.trim().length > 0) {
    try {
      const parsed = JSON.parse(data.annotationPosition) as Partial<ZoteroReaderAnnotationPosition>;
      position = {
        pageIndex: typeof parsed.pageIndex === "number" ? parsed.pageIndex : 0,
        rects: Array.isArray(parsed.rects) ? parsed.rects : [],
        rotation: typeof parsed.rotation === "number" ? parsed.rotation : 0,
      };
    } catch {
      // Fallback with pageIndex from sortIndex
      const { pageIndex } = parseSortIndex(data.annotationSortIndex);
      position = { pageIndex, rects: [], rotation: 0 };
    }
  }

  const validTypes: ZoteroAnnotationType[] = ["highlight", "underline", "note", "image", "ink"];
  const type: ZoteroAnnotationType = validTypes.includes(data.annotationType)
    ? data.annotationType
    : "highlight";

  return {
    id: data.key,
    type,
    color: data.annotationColor || "#ffd400",
    pageLabel: data.annotationPageLabel || String(position.pageIndex + 1),
    sortIndex: data.annotationSortIndex || formatSortIndex(position.pageIndex),
    position,
    text: data.annotationText || "",
    comment: data.annotationComment || "",
    tags: Array.isArray(data.tags) ? data.tags.map((t) => t.tag) : [],
    dateCreated: data.dateAdded,
    dateModified: data.dateModified,
  };
}
