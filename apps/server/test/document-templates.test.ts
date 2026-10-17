import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { createBlankDocxBuffer } from "../src/documents/templates.js";
import { extractZoteroState } from "../src/documents/zoteroFields.js";

describe("blank DOCX language and Zotero preferences", () => {
  it.each(["generated", "asset"])(
    "declares Turkish defaults, Zotero preferences and registered parts in %s",
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
      expect(types).toContain('PartName="/docProps/custom.xml"');
      const rootRels = await zip.file("_rels/.rels")!.async("string");
      expect(rootRels).toContain('Target="docProps/custom.xml"');
      const customXml = await zip.file("docProps/custom.xml")!.async("string");
      expect(customXml).toContain('name="ZOTERO_PREF_1"');

      const state = await extractZoteroState(buffer);
      expect(state.style).toBe("apa");
      expect(state.prefs).toContain('locale="tr-TR"');
      expect(state.prefs).toContain("styles/apa");
    },
  );
});
