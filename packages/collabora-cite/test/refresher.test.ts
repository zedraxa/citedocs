import { describe, it, expect } from "vitest";
import { refreshDocument } from "../src/refresher.js";
import {
  FIXTURE_WORD_CITATION_RAW,
  FIXTURE_LIBREOFFICE_CITATION_RAW,
  FIXTURE_WORD_BIBLIOGRAPHY_RAW,
  FIXTURE_ITEM_LIBBY,
  FIXTURE_ITEM_KAHNEMAN,
} from "./fixtures.js";
import { createZoteroCitationPayload, createLibreOfficeCitationMarkName } from "../src/fields.js";

describe("Style Refresh & Document Update (refresher.ts)", () => {
  it("style switch apa->ieee changes formattedCitation from (Libby, 2021) to [1]", () => {
    const fields = [FIXTURE_WORD_CITATION_RAW, FIXTURE_WORD_BIBLIOGRAPHY_RAW];

    const result = refreshDocument(fields, {
      styleId: "ieee",
      locale: "en-US",
    });

    expect(result.styleId).toBe("ieee");
    expect(result.citations).toHaveLength(1);

    const refreshedCit = result.citations[0];
    expect(refreshedCit.plainText).toBe("[1]");
    expect(refreshedCit.formattedText).toBe("[1]");
    expect(refreshedCit.newPayload.properties.formattedCitation).toBe("[1]");
    expect(refreshedCit.fieldCode).toContain("ADDIN ZOTERO_ITEM CSL_CITATION");
    expect(refreshedCit.fieldCode).toContain('"[1]"');

    // Bibliography should also be formatted in IEEE numeric style
    expect(result.bibliography).toBeDefined();
    expect(result.bibliography?.entries[0]).toContain("[1]");
    expect(result.bibliography?.entries[0]).toContain("P. Libby");
  });

  it("style switch apa->ieee preserves LibreOffice ReferenceMark RND suffix and builds CallPythonScript PostMessages", () => {
    const fields = [FIXTURE_LIBREOFFICE_CITATION_RAW];

    const result = refreshDocument(fields, {
      styleId: "ieee",
      locale: "en-US",
    });

    expect(result.citations).toHaveLength(1);
    const refreshedCit = result.citations[0];
    expect(refreshedCit.plainText).toBe("[1]");
    expect(refreshedCit.markName).toContain("ZOTERO_ITEM CSL_CITATION");
    expect(refreshedCit.markName).toContain("RND5E5D8F2A9B");

    // PostMessages generated for Collabora
    expect(result.postMessages.length).toBeGreaterThan(0);
    const msg = result.postMessages[0];
    expect(msg.MessageId).toBe("CallPythonScript");
    if (msg.MessageId === "CallPythonScript") {
      expect(msg.Function).toBe("update_citation");
      expect(msg.Values.markName.value).toBe(FIXTURE_LIBREOFFICE_CITATION_RAW);
      expect(msg.Values.formattedText.value).toBe("[1]");
    }
  });

  it("handles multiple citations in document order with proper IEEE numbering [1] and [2]", () => {
    const cit1 = createZoteroCitationPayload({
      citationID: "cit1",
      items: [{ id: "101", itemData: FIXTURE_ITEM_LIBBY }],
      formattedCitation: "(Libby, 2021)",
    });
    const cit2 = createZoteroCitationPayload({
      citationID: "cit2",
      items: [{ id: "102", itemData: FIXTURE_ITEM_KAHNEMAN }],
      formattedCitation: "(Kahneman, 2011)",
    });

    const mark1 = createLibreOfficeCitationMarkName(cit1, "RND1");
    const mark2 = createLibreOfficeCitationMarkName(cit2, "RND2");

    const result = refreshDocument([mark1, mark2], {
      styleId: "ieee",
      locale: "en-US",
    });

    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].plainText).toBe("[1]");
    expect(result.citations[1].plainText).toBe("[2]");

    // Now switch back from IEEE to APA
    const updatedFields = result.citations.map((c) => c.fieldCode);
    const apaResult = refreshDocument(updatedFields, {
      styleId: "apa",
      locale: "en-US",
    });

    expect(apaResult.citations[0].plainText).toBe("(Libby, 2021)");
    expect(apaResult.citations[1].plainText).toBe("(Kahneman, 2011)");
  });
});
