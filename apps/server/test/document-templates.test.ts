import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { createBlankDocxBuffer } from "../src/documents/templates.js";

describe("blank DOCX language", () => {
  it.each(["generated", "asset"])(
    "declares Turkish defaults and registered parts in %s",
    async (source) => {
      const buffer =
        source === "generated"
          ? await createBlankDocxBuffer()
          : await readFile(new URL("../../../deploy/office/blank.docx", import.meta.url));
      const zip = await JSZip.loadAsync(buffer);
      const styles = await zip.file("word/styles.xml")!.async("string");
      expect(styles).toMatch(
        /<w:docDefaults>\s*<w:rPrDefault><w:rPr><w:lang w:val="tr-TR" w:eastAsia="tr-TR" w:bidi="tr-TR"/,
      );
      const document = await zip.file("word/document.xml")!.async("string");
      expect(document).toContain('<w:lang w:val="tr-TR"');
      const settings = await zip.file("word/settings.xml")!.async("string");
      expect(settings).toContain('<w:themeFontLang w:val="tr-TR"');
      const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
      const types = await zip.file("[Content_Types].xml")!.async("string");
      for (const part of ["styles", "settings"]) {
        expect(rels).toContain(`relationships/${part}" Target="${part}.xml"`);
        expect(types).toContain(`PartName="/word/${part}.xml"`);
      }
    },
  );
});
