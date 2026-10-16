import type { CSLItem } from "@citedocs/shared";
import type { ZoteroCitationPayload, ZoteroBibliographyPayload, ZoteroDocumentPrefs } from "../src/types.js";

/**
 * Real-world Nature paper (Peter Libby, 2021, "The changing landscape of atherosclerosis", Nature 592:524–533).
 */
export const FIXTURE_ITEM_LIBBY: CSLItem = {
  id: "101",
  type: "article-journal",
  title: "The changing landscape of atherosclerosis",
  "container-title": "Nature",
  page: "524-533",
  volume: "592",
  issue: "7855",
  author: [
    {
      family: "Libby",
      given: "Peter",
    },
  ],
  issued: {
    "date-parts": [[2021]],
  },
  DOI: "10.1038/s41586-021-03392-y",
};

/**
 * Real-world book (Daniel Kahneman, 2011, "Thinking, Fast and Slow", Farrar, Straus and Giroux).
 */
export const FIXTURE_ITEM_KAHNEMAN: CSLItem = {
  id: "102",
  type: "book",
  title: "Thinking, Fast and Slow",
  publisher: "Farrar, Straus and Giroux",
  author: [
    {
      family: "Kahneman",
      given: "Daniel",
    },
  ],
  issued: {
    "date-parts": [[2011]],
  },
  ISBN: "978-0374275631",
};

/**
 * Fixture captured from real Zotero Word output (APA 7th edition).
 */
export const FIXTURE_ZOTERO_CITATION_PAYLOAD_APA: ZoteroCitationPayload = {
  citationID: "mK88p3J0",
  citationItems: [
    {
      id: "101",
      uris: ["http://zotero.org/users/local/items/101"],
      uri: ["http://zotero.org/users/local/items/101"],
      itemData: FIXTURE_ITEM_LIBBY,
    },
  ],
  properties: {
    formattedCitation: "(Libby, 2021)",
    plainCitation: "(Libby, 2021)",
    noteIndex: 0,
    dontUpdate: false,
  },
  schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json",
};

/**
 * Fixture captured from real Zotero Word output with page locator.
 */
export const FIXTURE_ZOTERO_CITATION_PAYLOAD_LOCATOR: ZoteroCitationPayload = {
  citationID: "locCit12",
  citationItems: [
    {
      id: "101",
      uris: ["http://zotero.org/users/local/items/101"],
      uri: ["http://zotero.org/users/local/items/101"],
      itemData: FIXTURE_ITEM_LIBBY,
      locator: "525",
      label: "page",
    },
  ],
  properties: {
    formattedCitation: "(Libby, 2021, p. 525)",
    plainCitation: "(Libby, 2021, p. 525)",
    noteIndex: 0,
    dontUpdate: false,
  },
  schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json",
};

/**
 * Fixture captured from real Zotero Word output in IEEE style.
 */
export const FIXTURE_ZOTERO_CITATION_PAYLOAD_IEEE: ZoteroCitationPayload = {
  citationID: "mK88p3J0",
  citationItems: [
    {
      id: "101",
      uris: ["http://zotero.org/users/local/items/101"],
      uri: ["http://zotero.org/users/local/items/101"],
      itemData: FIXTURE_ITEM_LIBBY,
    },
  ],
  properties: {
    formattedCitation: "[1]",
    plainCitation: "[1]",
    noteIndex: 0,
    dontUpdate: false,
  },
  schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json",
};

/**
 * Raw Word instruction text matching real Zotero export.
 */
export const FIXTURE_WORD_CITATION_RAW = `ADDIN ZOTERO_ITEM CSL_CITATION ${JSON.stringify(FIXTURE_ZOTERO_CITATION_PAYLOAD_APA)}`;

/**
 * Raw LibreOffice ReferenceMark name matching real Zotero export.
 */
export const FIXTURE_LIBREOFFICE_CITATION_RAW = `ZOTERO_ITEM CSL_CITATION ${JSON.stringify(FIXTURE_ZOTERO_CITATION_PAYLOAD_APA)} RND5E5D8F2A9B`;

/**
 * Bibliography payload and raw field strings.
 */
export const FIXTURE_BIBLIOGRAPHY_PAYLOAD: ZoteroBibliographyPayload = {
  uncited: [],
  omitted: [],
  custom: [],
};

export const FIXTURE_WORD_BIBLIOGRAPHY_RAW =
  'ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY';

export const FIXTURE_LIBREOFFICE_BIBLIOGRAPHY_RAW =
  'ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY RND7A2C1B4D8E';

/**
 * Document preferences fixture.
 */
export const FIXTURE_DOCUMENT_PREFS: ZoteroDocumentPrefs = {
  style: "apa",
  locale: "en-US",
  hasBibliography: 1,
};

export const FIXTURE_WORD_PREFS_RAW =
  'ZOTERO_PREF {"style":"apa","locale":"en-US","hasBibliography":1}';

export const FIXTURE_LIBREOFFICE_PREFS_RAW =
  'ZOTERO_PREF {"style":"apa","locale":"en-US","hasBibliography":1} RND9E4F2A1C3B';
