import { describe, it, expect } from "vitest";
import {
  createZoteroCitationPayload,
  createWordCitationFieldCode,
  createLibreOfficeCitationMarkName,
  createWordBibliographyFieldCode,
  createLibreOfficeBibliographyMarkName,
  createWordDocumentPrefsFieldCode,
  createLibreOfficeDocumentPrefsMarkName,
  generateRandomSuffix,
  generateCitationId,
  CSL_CITATION_SCHEMA,
} from "../src/fields.js";
import {
  FIXTURE_ITEM_LIBBY,
  FIXTURE_ZOTERO_CITATION_PAYLOAD_APA,
  FIXTURE_WORD_CITATION_RAW,
  FIXTURE_LIBREOFFICE_CITATION_RAW,
  FIXTURE_WORD_BIBLIOGRAPHY_RAW,
  FIXTURE_LIBREOFFICE_BIBLIOGRAPHY_RAW,
  FIXTURE_DOCUMENT_PREFS,
  FIXTURE_WORD_PREFS_RAW,
  FIXTURE_LIBREOFFICE_PREFS_RAW,
} from "./fixtures.js";

describe("Zotero Field Code Generation (fields.ts)", () => {
  it("generateRandomSuffix generates alphanumeric strings of expected length", () => {
    const s1 = generateRandomSuffix(10);
    const s2 = generateRandomSuffix(10);
    expect(s1).toHaveLength(10);
    expect(s2).toHaveLength(10);
    expect(s1).not.toBe(s2);
    expect(/^[A-Za-z0-9]+$/.test(s1)).toBe(true);
  });

  it("generateCitationId generates valid citation IDs", () => {
    const id = generateCitationId();
    expect(id).toHaveLength(8);
    expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
  });

  it("createZoteroCitationPayload builds payload matching CSL citation schema", () => {
    const payload = createZoteroCitationPayload({
      citationID: "mK88p3J0",
      items: [
        {
          id: "101",
          itemData: FIXTURE_ITEM_LIBBY,
        },
      ],
      formattedCitation: "(Libby, 2021)",
      plainCitation: "(Libby, 2021)",
      noteIndex: 0,
      dontUpdate: false,
    });

    expect(payload.citationID).toBe("mK88p3J0");
    expect(payload.schema).toBe(CSL_CITATION_SCHEMA);
    expect(payload.properties.formattedCitation).toBe("(Libby, 2021)");
    expect(payload.properties.plainCitation).toBe("(Libby, 2021)");
    expect(payload.properties.noteIndex).toBe(0);
    expect(payload.properties.dontUpdate).toBe(false);
    expect(payload.citationItems[0].id).toBe("101");
    expect(payload.citationItems[0].uris).toEqual(["http://zotero.org/users/local/items/101"]);
    expect(payload.citationItems[0].itemData).toEqual(FIXTURE_ITEM_LIBBY);
  });

  it("createWordCitationFieldCode matches fixture captured from real Zotero Word output", () => {
    const fieldCode = createWordCitationFieldCode(FIXTURE_ZOTERO_CITATION_PAYLOAD_APA);
    expect(fieldCode).toBe(FIXTURE_WORD_CITATION_RAW);
    expect(fieldCode.startsWith("ADDIN ZOTERO_ITEM CSL_CITATION ")).toBe(true);

    const jsonPart = fieldCode.replace("ADDIN ZOTERO_ITEM CSL_CITATION ", "");
    const parsed = JSON.parse(jsonPart);
    expect(parsed.citationID).toBe("mK88p3J0");
    expect(parsed.properties.formattedCitation).toBe("(Libby, 2021)");
  });

  it("createLibreOfficeCitationMarkName matches fixture captured from real Zotero LibreOffice output", () => {
    const markName = createLibreOfficeCitationMarkName(
      FIXTURE_ZOTERO_CITATION_PAYLOAD_APA,
      "5E5D8F2A9B",
    );
    expect(markName).toBe(FIXTURE_LIBREOFFICE_CITATION_RAW);
    expect(markName.startsWith("ZOTERO_ITEM CSL_CITATION ")).toBe(true);
    expect(markName.endsWith(" RND5E5D8F2A9B")).toBe(true);
  });

  it("createWordBibliographyFieldCode matches fixture captured from real Zotero Word output", () => {
    const biblField = createWordBibliographyFieldCode();
    expect(biblField).toBe(FIXTURE_WORD_BIBLIOGRAPHY_RAW);
    expect(biblField.startsWith("ADDIN ZOTERO_BIBL ")).toBe(true);
    expect(biblField.endsWith(" CSL_BIBLIOGRAPHY")).toBe(true);
  });

  it("createLibreOfficeBibliographyMarkName matches fixture captured from real Zotero LibreOffice output", () => {
    const biblMark = createLibreOfficeBibliographyMarkName(undefined, "7A2C1B4D8E");
    expect(biblMark).toBe(FIXTURE_LIBREOFFICE_BIBLIOGRAPHY_RAW);
    expect(biblMark.startsWith("ZOTERO_BIBL ")).toBe(true);
    expect(biblMark.includes(" CSL_BIBLIOGRAPHY RND7A2C1B4D8E")).toBe(true);
  });

  it("createWordDocumentPrefsFieldCode matches fixture captured from real Zotero prefs", () => {
    const prefsField = createWordDocumentPrefsFieldCode(FIXTURE_DOCUMENT_PREFS);
    expect(prefsField).toBe(FIXTURE_WORD_PREFS_RAW);
    expect(prefsField.startsWith("ZOTERO_PREF ")).toBe(true);
  });

  it("createLibreOfficeDocumentPrefsMarkName matches fixture captured from real Zotero LibreOffice prefs", () => {
    const prefsMark = createLibreOfficeDocumentPrefsMarkName(FIXTURE_DOCUMENT_PREFS, "9E4F2A1C3B");
    expect(prefsMark).toBe(FIXTURE_LIBREOFFICE_PREFS_RAW);
    expect(prefsMark.startsWith("ZOTERO_PREF ")).toBe(true);
    expect(prefsMark.endsWith(" RND9E4F2A1C3B")).toBe(true);
  });
});
