import { describe, it, expect } from "vitest";
import {
  buildZoteroPrefXml,
  parseZoteroPrefXml,
  chunkZoteroPref,
  reassembleZoteroPref,
  DEFAULT_STYLE_ID,
  DEFAULT_LOCALE,
  PINNED_STYLE_IDS,
} from "../src/zoteroPref.js";

describe("Zotero Preferences XML & Chunking (zoteroPref)", () => {
  it("builds a valid Zotero Word preference XML string with default locale and version", () => {
    const xml = buildZoteroPrefXml({
      styleId: "apa",
      sessionId: "test-sess-1234",
    });

    expect(xml).toContain('<data data-version="3"');
    expect(xml).toContain('<session id="test-sess-1234"/>');
    expect(xml).toContain('style id="http://www.zotero.org/styles/apa"');
    expect(xml).toContain('locale="tr-TR"');
    expect(xml).toContain('hasBibliography="1"');
    expect(xml).toContain('<pref name="fieldType" value="Field"/>');
  });

  it("handles custom style URLs, custom locale, and custom session", () => {
    const xml = buildZoteroPrefXml({
      styleId: "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
      locale: "tr-TR",
      hasBibliography: false,
      sessionId: "custom-session",
      zoteroVersion: "7.0.2",
    });

    expect(xml).toContain('zotero-version="7.0.2"');
    expect(xml).toContain('<session id="custom-session"/>');
    expect(xml).toContain(
      'style id="http://www.zotero.org/styles/turkiye-bilimsel-ve-teknolojik-arastirma-kurumu"',
    );
    expect(xml).toContain('hasBibliography="0"');
  });

  it("normalizes styleId that already contains full URL", () => {
    const xml = buildZoteroPrefXml({
      styleId: "https://www.zotero.org/styles/ieee",
      sessionId: "s1",
    });
    expect(xml).toContain('style id="http://www.zotero.org/styles/ieee"');
  });

  it("parses valid Zotero preference XML and extracts styleId and locale", () => {
    const xml =
      '<data data-version="3" zotero-version="7.0"><session id="abc-123"/><style id="http://www.zotero.org/styles/apa" locale="tr-TR" hasBibliography="1" bibliographyStyleHasBeenSet="0"/><prefs><pref name="fieldType" value="Field"/></prefs></data>';

    const parsed = parseZoteroPrefXml(xml);
    expect(parsed).not.toBeNull();
    expect(parsed?.styleId).toBe("apa");
    expect(parsed?.styleHref).toBe("http://www.zotero.org/styles/apa");
    expect(parsed?.locale).toBe("tr-TR");
    expect(parsed?.hasBibliography).toBe(true);
    expect(parsed?.sessionId).toBe("abc-123");
    expect(parsed?.fieldType).toBe("Field");
  });

  it("parses styleId from https URL", () => {
    const xml =
      '<data data-version="3"><style id="https://www.zotero.org/styles/chicago-author-date" hasBibliography="0"/><prefs/></data>';
    const parsed = parseZoteroPrefXml(xml);
    expect(parsed?.styleId).toBe("chicago-author-date");
    expect(parsed?.hasBibliography).toBe(false);
    expect(parsed?.locale).toBe("tr-TR"); // fallback default
  });

  it("returns null on malformed XML", () => {
    expect(parseZoteroPrefXml("")).toBeNull();
    expect(parseZoteroPrefXml("<invalid>foo</invalid>")).toBeNull();
  });

  it("chunks XML into chunks of at most 250 characters and reassembles perfectly", () => {
    const xml = buildZoteroPrefXml({
      styleId: "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
      locale: "tr-TR",
      sessionId: "long-session-identifier-for-chunking-verification-1234567890",
    });

    const chunks = chunkZoteroPref(xml, 50); // small chunk size to verify multi-chunking
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].name).toBe("ZOTERO_PREF_1");
    expect(chunks[1].name).toBe("ZOTERO_PREF_2");
    for (const chunk of chunks) {
      expect(chunk.value.length).toBeLessThanOrEqual(50);
    }

    const reassembled = reassembleZoteroPref(chunks);
    expect(reassembled).toBe(xml);
  });

  it("reassembles when given a Record<string, string> with shuffled keys", () => {
    const chunks = {
      ZOTERO_PREF_3: "part3",
      ZOTERO_PREF_1: "part1-",
      ZOTERO_PREF_2: "part2-",
      OTHER_PROP: "ignored",
    };

    expect(reassembleZoteroPref(chunks)).toBe("part1-part2-part3");
  });

  it("verifies pinned style ids contain all required popular styles", () => {
    expect(DEFAULT_STYLE_ID).toBe("apa");
    expect(DEFAULT_LOCALE).toBe("tr-TR");

    expect(PINNED_STYLE_IDS).toContain("apa");
    expect(PINNED_STYLE_IDS).toContain("ieee");
    expect(PINNED_STYLE_IDS).toContain("chicago-author-date");
    expect(PINNED_STYLE_IDS).toContain("chicago-notes-bibliography");
    expect(PINNED_STYLE_IDS).toContain("modern-language-association");
    expect(PINNED_STYLE_IDS).toContain("harvard-cite-them-right");
    expect(PINNED_STYLE_IDS).toContain("vancouver");
    expect(PINNED_STYLE_IDS).toContain(
      "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
    );
  });
});
