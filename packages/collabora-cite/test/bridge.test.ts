import { describe, it, expect, vi } from "vitest";
import {
  buildInsertCitationMessage,
  buildUpdateCitationMessage,
  buildInsertBibliographyMessage,
  buildUpdateBibliographyMessage,
  buildSetDocumentPrefsMessage,
  buildGetDocumentFieldsMessage,
  buildUnoInsertFieldMessage,
  buildUnoInsertBookmarkMessage,
  CollaboraBridge,
} from "../src/bridge.js";
import { FIXTURE_ZOTERO_CITATION_PAYLOAD_APA, FIXTURE_DOCUMENT_PREFS } from "./fixtures.js";
import type { CollaboraPostMessageSender } from "../src/postMessageInterface.js";

describe("Collabora Bridge & PostMessage Payloads (bridge.ts)", () => {
  it("buildInsertCitationMessage produces compliant CallPythonScript payload", () => {
    const msg = buildInsertCitationMessage(
      FIXTURE_ZOTERO_CITATION_PAYLOAD_APA,
      "(Libby, 2021)",
      { rndSuffix: "RND12345" },
    );

    expect(msg.MessageId).toBe("CallPythonScript");
    expect(msg.ScriptFile).toBe("zotero_collabora.py");
    expect(msg.Function).toBe("insert_citation");
    expect(msg.Values.citationJson).toBeDefined();
    expect(msg.Values.citationJson.type).toBe("string");
    expect(msg.Values.formattedText.value).toBe("(Libby, 2021)");
    expect(msg.Values.markName.value).toContain("ZOTERO_ITEM CSL_CITATION");
    expect(msg.Values.markName.value).toContain("RND12345");
  });

  it("buildUpdateCitationMessage produces compliant CallPythonScript payload", () => {
    const markName = "ZOTERO_ITEM CSL_CITATION {} RND12345";
    const msg = buildUpdateCitationMessage(
      markName,
      FIXTURE_ZOTERO_CITATION_PAYLOAD_APA,
      "[1]",
    );

    expect(msg.MessageId).toBe("CallPythonScript");
    expect(msg.Function).toBe("update_citation");
    expect(msg.Values.markName.value).toBe(markName);
    expect(msg.Values.formattedText.value).toBe("[1]");
  });

  it("buildInsertBibliographyMessage produces compliant CallPythonScript payload", () => {
    const msg = buildInsertBibliographyMessage("Libby, P. (2021). Nature...", {
      rndSuffix: "RNDBIB12",
    });

    expect(msg.MessageId).toBe("CallPythonScript");
    expect(msg.Function).toBe("insert_bibliography");
    expect(msg.Values.markName.value).toContain("ZOTERO_BIBL");
    expect(msg.Values.markName.value).toContain("RNDBIB12");
    expect(msg.Values.formattedText.value).toBe("Libby, P. (2021). Nature...");
  });

  it("buildUpdateBibliographyMessage produces compliant CallPythonScript payload", () => {
    const msg = buildUpdateBibliographyMessage("ZOTERO_BIBL {} RNDBIB12", "[1] P. Libby...");

    expect(msg.MessageId).toBe("CallPythonScript");
    expect(msg.Function).toBe("update_bibliography");
    expect(msg.Values.markName.value).toBe("ZOTERO_BIBL {} RNDBIB12");
    expect(msg.Values.formattedText.value).toBe("[1] P. Libby...");
  });

  it("buildSetDocumentPrefsMessage produces compliant CallPythonScript payload", () => {
    const msg = buildSetDocumentPrefsMessage(FIXTURE_DOCUMENT_PREFS, {
      rndSuffix: "RNDPREF1",
    });

    expect(msg.MessageId).toBe("CallPythonScript");
    expect(msg.Function).toBe("set_document_prefs");
    expect(msg.Values.markName.value).toContain("ZOTERO_PREF");
    expect(msg.Values.markName.value).toContain("RNDPREF1");
  });

  it("buildGetDocumentFieldsMessage produces compliant CallPythonScript payload", () => {
    const msg = buildGetDocumentFieldsMessage();

    expect(msg.MessageId).toBe("CallPythonScript");
    expect(msg.Function).toBe("get_document_fields");
  });

  it("buildUnoInsertFieldMessage and buildUnoInsertBookmarkMessage produce Send_UNO_Command payload", () => {
    const unoField = buildUnoInsertFieldMessage("ReferenceField", "Field text");
    expect(unoField.MessageId).toBe("Send_UNO_Command");
    expect(unoField.Values.Command).toBe(".uno:InsertField");
    expect(unoField.Values.Args?.TypeName.value).toBe("ReferenceField");

    const unoBookmark = buildUnoInsertBookmarkMessage("ZOTERO_BREF_123");
    expect(unoBookmark.MessageId).toBe("Send_UNO_Command");
    expect(unoBookmark.Values.Command).toBe(".uno:InsertBookmark");
    expect(unoBookmark.Values.Args?.Bookmark.value).toBe("ZOTERO_BREF_123");
  });

  it("CollaboraBridge dispatches serialized messages to PostMessage sender with target origin", () => {
    const mockSender: CollaboraPostMessageSender = {
      postMessage: vi.fn(),
    };

    const bridge = new CollaboraBridge(mockSender, "https://collabora.citedocs.org");
    bridge.insertCitation(FIXTURE_ZOTERO_CITATION_PAYLOAD_APA, "(Libby, 2021)");

    expect(mockSender.postMessage).toHaveBeenCalledTimes(1);
    const [payload, origin] = (mockSender.postMessage as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(origin).toBe("https://collabora.citedocs.org");

    const parsed = JSON.parse(payload);
    expect(parsed.MessageId).toBe("CallPythonScript");
    expect(parsed.Function).toBe("insert_citation");
  });
});
