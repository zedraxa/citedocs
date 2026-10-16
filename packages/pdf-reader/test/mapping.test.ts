import { describe, it, expect } from "vitest";
import {
  generateZoteroKey,
  formatSortIndex,
  parseSortIndex,
  toZoteroAnnotationItem,
  fromZoteroAnnotationItem,
} from "../src/mapping.js";
import type { ZoteroReaderAnnotation, ZoteroAnnotationItemData } from "../src/types.js";

describe("Zotero Annotation Mapping", () => {
  it("generates valid 8-character Zotero alphanumeric keys", () => {
    const key = generateZoteroKey();
    expect(key).toHaveLength(8);
    expect(key).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
  });

  it("formats and parses sortIndex with 0-padding", () => {
    const sortIndex = formatSortIndex(3, 120, 45);
    expect(sortIndex).toBe("00003|000120|00045");

    const parsed = parseSortIndex(sortIndex);
    expect(parsed).toEqual({ pageIndex: 3, y: 120, x: 45 });
  });

  it("handles empty or malformed sortIndex gracefully", () => {
    expect(parseSortIndex("")).toEqual({ pageIndex: 0, y: 0, x: 0 });
    expect(parseSortIndex("invalid")).toEqual({ pageIndex: 0, y: 0, x: 0 });
  });

  it("converts ZoteroReaderAnnotation to ZoteroAnnotationItem format", () => {
    const readerAnnotation: ZoteroReaderAnnotation = {
      id: "ABC12345",
      type: "highlight",
      color: "#ffd400",
      pageLabel: "14",
      sortIndex: "00013|000200|000100",
      position: {
        pageIndex: 13,
        rects: [[100, 200, 300, 220]],
        rotation: 0,
      },
      text: "Quantum entanglement defies local realism.",
      comment: "Crucial theorem reference.",
      tags: ["physics", { tag: "quantum" }],
      dateCreated: "2026-10-16T12:00:00.000Z",
      dateModified: "2026-10-16T12:05:00.000Z",
    };

    const item = toZoteroAnnotationItem(readerAnnotation, "ATTACH01", 5);

    expect(item.key).toBe("ABC12345");
    expect(item.version).toBe(5);
    expect(item.data.parentItem).toBe("ATTACH01");
    expect(item.data.itemType).toBe("annotation");
    expect(item.data.annotationType).toBe("highlight");
    expect(item.data.annotationText).toBe("Quantum entanglement defies local realism.");
    expect(item.data.annotationComment).toBe("Crucial theorem reference.");
    expect(item.data.annotationColor).toBe("#ffd400");
    expect(item.data.annotationPageLabel).toBe("14");
    expect(item.data.annotationSortIndex).toBe("00013|000200|000100");
    expect(JSON.parse(item.data.annotationPosition)).toEqual(readerAnnotation.position);
    expect(item.data.tags).toEqual([{ tag: "physics" }, { tag: "quantum" }]);
  });

  it("converts ZoteroAnnotationItem back to ZoteroReaderAnnotation", () => {
    const itemData: ZoteroAnnotationItemData = {
      key: "NOTE9999",
      version: 1,
      parentItem: "PARENT123",
      itemType: "annotation",
      annotationType: "note",
      annotationText: "",
      annotationComment: "Verify experiment in lab next week.",
      annotationColor: "#ff6666",
      annotationPageLabel: "5",
      annotationSortIndex: "00004|000050|000020",
      annotationPosition: JSON.stringify({
        pageIndex: 4,
        rects: [[20, 50, 80, 110]],
        rotation: 0,
      }),
      tags: [{ tag: "todo" }],
      dateAdded: "2026-10-16T10:00:00.000Z",
      dateModified: "2026-10-16T10:10:00.000Z",
    };

    const annotation = fromZoteroAnnotationItem(itemData);

    expect(annotation.id).toBe("NOTE9999");
    expect(annotation.type).toBe("note");
    expect(annotation.color).toBe("#ff6666");
    expect(annotation.pageLabel).toBe("5");
    expect(annotation.comment).toBe("Verify experiment in lab next week.");
    expect(annotation.position.pageIndex).toBe(4);
    expect(annotation.position.rects).toEqual([[20, 50, 80, 110]]);
    expect(annotation.tags).toEqual(["todo"]);
  });

  it("round-trips annotations faithfully", () => {
    const original: ZoteroReaderAnnotation = {
      id: "ROUND001",
      type: "underline",
      color: "#2ea8e5",
      pageLabel: "2",
      sortIndex: "00001|000150|000080",
      position: {
        pageIndex: 1,
        rects: [[80, 150, 250, 165]],
        rotation: 0,
      },
      text: "Underlined text segment.",
      comment: "Underline comment.",
      tags: ["important"],
      dateCreated: "2026-10-16T15:00:00.000Z",
      dateModified: "2026-10-16T15:00:00.000Z",
    };

    const item = toZoteroAnnotationItem(original, "ATT_XYZ");
    const restored = fromZoteroAnnotationItem(item);

    expect(restored.id).toBe(original.id);
    expect(restored.type).toBe(original.type);
    expect(restored.color).toBe(original.color);
    expect(restored.text).toBe(original.text);
    expect(restored.comment).toBe(original.comment);
    expect(restored.position).toEqual(original.position);
    expect(restored.tags).toEqual(original.tags);
  });
});
