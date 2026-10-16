import { describe, it, expect } from "vitest";
import { parseFieldCode, parseDocumentFields } from "../src/parser.js";
import {
  createWordCitationFieldCode,
  createLibreOfficeCitationMarkName,
} from "../src/fields.js";
import {
  FIXTURE_ZOTERO_CITATION_PAYLOAD_APA,
  FIXTURE_WORD_CITATION_RAW,
  FIXTURE_LIBREOFFICE_CITATION_RAW,
  FIXTURE_WORD_BIBLIOGRAPHY_RAW,
  FIXTURE_LIBREOFFICE_BIBLIOGRAPHY_RAW,
  FIXTURE_WORD_PREFS_RAW,
  FIXTURE_LIBREOFFICE_PREFS_RAW,
} from "./fixtures.js";

describe("Field Code Parsing & Round-Trip (parser.ts)", () => {
  it("parses real Zotero Word citation instruction", () => {
    const parsed = parseFieldCode(FIXTURE_WORD_CITATION_RAW, "(Libby, 2021)");

    expect(parsed.type).toBe("citation");
    expect(parsed.format).toBe("word");
    expect(parsed.citation).toBeDefined();
    expect(parsed.citation?.citationID).toBe("mK88p3J0");
    expect(parsed.citation?.properties.formattedCitation).toBe("(Libby, 2021)");
    expect(parsed.citation?.citationItems[0].id).toBe("101");
    expect(parsed.citation?.citationItems[0].itemData?.title).toBe(
      "The changing landscape of atherosclerosis",
    );
    expect(parsed.formattedText).toBe("(Libby, 2021)");
  });

  it("parses real Zotero LibreOffice ReferenceMark with RND suffix", () => {
    const parsed = parseFieldCode(FIXTURE_LIBREOFFICE_CITATION_RAW, "(Libby, 2021)");

    expect(parsed.type).toBe("citation");
    expect(parsed.format).toBe("libreoffice");
    expect(parsed.rndSuffix).toBe("5E5D8F2A9B");
    expect(parsed.citation).toBeDefined();
    expect(parsed.citation?.citationID).toBe("mK88p3J0");
    expect(parsed.citation?.properties.formattedCitation).toBe("(Libby, 2021)");
    expect(parsed.markName).toBe(FIXTURE_LIBREOFFICE_CITATION_RAW);
  });

  it("parses real Zotero Word bibliography instruction", () => {
    const parsed = parseFieldCode(FIXTURE_WORD_BIBLIOGRAPHY_RAW);

    expect(parsed.type).toBe("bibliography");
    expect(parsed.format).toBe("word");
    expect(parsed.bibliography).toBeDefined();
    expect(parsed.bibliography?.uncited).toEqual([]);
    expect(parsed.bibliography?.omitted).toEqual([]);
    expect(parsed.bibliography?.custom).toEqual([]);
  });

  it("parses real Zotero LibreOffice bibliography ReferenceMark", () => {
    const parsed = parseFieldCode(FIXTURE_LIBREOFFICE_BIBLIOGRAPHY_RAW);

    expect(parsed.type).toBe("bibliography");
    expect(parsed.format).toBe("libreoffice");
    expect(parsed.rndSuffix).toBe("7A2C1B4D8E");
    expect(parsed.bibliography).toBeDefined();
  });

  it("parses document preferences (Word and LibreOffice)", () => {
    const parsedWord = parseFieldCode(FIXTURE_WORD_PREFS_RAW);
    expect(parsedWord.type).toBe("pref");
    expect(parsedWord.prefs?.style).toBe("apa");
    expect(parsedWord.prefs?.locale).toBe("en-US");

    const parsedLibreOffice = parseFieldCode(FIXTURE_LIBREOFFICE_PREFS_RAW);
    expect(parsedLibreOffice.type).toBe("pref");
    expect(parsedLibreOffice.rndSuffix).toBe("9E4F2A1C3B");
    expect(parsedLibreOffice.prefs?.style).toBe("apa");
  });

  it("executes lossless round-trip: generate -> parse -> payload match (Word)", () => {
    const generated = createWordCitationFieldCode(FIXTURE_ZOTERO_CITATION_PAYLOAD_APA);
    const parsed = parseFieldCode(generated);

    expect(parsed.type).toBe("citation");
    expect(parsed.citation).toEqual(FIXTURE_ZOTERO_CITATION_PAYLOAD_APA);
  });

  it("executes lossless round-trip: generate -> parse -> payload match (LibreOffice)", () => {
    const generated = createLibreOfficeCitationMarkName(
      FIXTURE_ZOTERO_CITATION_PAYLOAD_APA,
      "RNDTEST123",
    );
    const parsed = parseFieldCode(generated);

    expect(parsed.type).toBe("citation");
    expect(parsed.rndSuffix).toBe("RNDTEST123");
    expect(parsed.citation).toEqual(FIXTURE_ZOTERO_CITATION_PAYLOAD_APA);
  });

  it("parses array of document fields with parseDocumentFields", () => {
    const fields = [
      FIXTURE_WORD_CITATION_RAW,
      FIXTURE_LIBREOFFICE_CITATION_RAW,
      FIXTURE_WORD_BIBLIOGRAPHY_RAW,
      FIXTURE_LIBREOFFICE_PREFS_RAW,
      { name: "UNKNOWN_FIELD", text: "text" },
    ];

    const results = parseDocumentFields(fields);
    expect(results).toHaveLength(5);
    expect(results[0].type).toBe("citation");
    expect(results[1].type).toBe("citation");
    expect(results[2].type).toBe("bibliography");
    expect(results[3].type).toBe("pref");
    expect(results[4].type).toBe("unknown");
  });

  it("handles XML-encoded and entity-escaped strings safely", () => {
    const xmlRaw = `ADDIN ZOTERO_ITEM CSL_CITATION {&quot;citationID&quot;:&quot;xml1&quot;,&quot;properties&quot;:{&quot;formattedCitation&quot;:&quot;(Smith, 2020)&quot;},&quot;citationItems&quot;:[{&quot;id&quot;:&quot;1&quot;}]}`;
    const parsed = parseFieldCode(xmlRaw);

    expect(parsed.type).toBe("citation");
    expect(parsed.citation?.citationID).toBe("xml1");
    expect(parsed.citation?.properties.formattedCitation).toBe("(Smith, 2020)");
  });
});
