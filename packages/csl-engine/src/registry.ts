import type { CitationStyleMeta } from "@citedocs/shared";

export const BUILTIN_STYLES: CitationStyleMeta[] = [
  {
    id: "apa",
    title: "American Psychological Association 7th edition",
    shortTitle: "APA 7th",
    citationFormat: "author-date",
    independent: true,
  },
  {
    id: "ieee",
    title: "IEEE",
    shortTitle: "IEEE",
    citationFormat: "numeric",
    independent: true,
  },
  {
    id: "chicago-author-date",
    title: "Chicago Manual of Style 17th edition (author-date)",
    shortTitle: "Chicago (Author-Date)",
    citationFormat: "author-date",
    independent: true,
  },
  {
    id: "chicago-fullnote-bibliography",
    title: "Chicago Manual of Style 17th edition (full note)",
    shortTitle: "Chicago (Notes)",
    citationFormat: "note",
    independent: true,
  },
  {
    id: "modern-language-association",
    title: "Modern Language Association 9th edition",
    shortTitle: "MLA 9th",
    citationFormat: "author-date",
    independent: true,
  },
  {
    id: "vancouver",
    title: "Vancouver",
    shortTitle: "Vancouver",
    citationFormat: "numeric",
    independent: true,
  },
  {
    id: "harvard-cite-them-right",
    title: "Harvard (Cite Them Right)",
    shortTitle: "Harvard",
    citationFormat: "author-date",
    independent: true,
  },
  {
    id: "nature",
    title: "Nature",
    shortTitle: "Nature",
    citationFormat: "numeric",
    independent: true,
  },
  {
    id: "science",
    title: "Science",
    shortTitle: "Science",
    citationFormat: "numeric",
    independent: true,
  },
  {
    id: "acm-sig-proceedings",
    title: "ACM SIG Proceedings",
    shortTitle: "ACM",
    citationFormat: "numeric",
    independent: true,
  },
];

export const MOCK_APA_CSL = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" demote-non-dropping-particle="never">
  <info>
    <title>American Psychological Association 7th edition</title>
    <id>http://www.zotero.org/styles/apa</id>
    <link href="http://www.zotero.org/styles/apa" rel="self"/>
    <category citation-format="author-date"/>
    <category field="psychology"/>
    <category field="generic-base"/>
    <updated>2026-01-01T00:00:00+00:00</updated>
  </info>
  <citation et-al-min="3" et-al-use-first="1" disambiguate-add-year-suffix="true" collapse="year">
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=", ">
        <names variable="author">
          <name form="short" and="symbol" delimiter=", " initialize-with=". "/>
          <substitute>
            <text variable="title" form="short"/>
          </substitute>
        </names>
        <date variable="issued">
          <date-part name="year"/>
        </date>
        <group delimiter=" ">
          <label variable="locator" form="short"/>
          <text variable="locator"/>
        </group>
      </group>
    </layout>
  </citation>
  <bibliography hanging-indent="true" et-al-min="21" et-al-use-first="19">
    <sort>
      <key macro="author"/>
      <key variable="issued"/>
      <key variable="title"/>
    </sort>
    <layout>
      <group delimiter=". ">
        <names variable="author">
          <name name-as-sort-order="all" and="symbol" initialize-with=". " delimiter=", "/>
        </names>
        <date variable="issued" prefix="(" suffix=")">
          <date-part name="year"/>
        </date>
        <text variable="title" font-style="italic"/>
        <text variable="container-title"/>
      </group>
    </layout>
  </bibliography>
</style>`;

export class StyleRegistry {
  private styles: Map<string, CitationStyleMeta> = new Map();
  private xmlCache: Map<string, string> = new Map();

  constructor() {
    for (const style of BUILTIN_STYLES) {
      this.styles.set(style.id, style);
    }
    this.xmlCache.set("apa", MOCK_APA_CSL);
  }

  get(id: string): CitationStyleMeta | undefined {
    return this.styles.get(id);
  }

  getXml(id: string): string | undefined {
    return this.xmlCache.get(id);
  }

  register(meta: CitationStyleMeta, xml?: string): void {
    this.styles.set(meta.id, meta);
    if (xml) {
      this.xmlCache.set(meta.id, xml);
    }
  }

  search(query: string): CitationStyleMeta[] {
    const q = query.toLowerCase().trim();
    if (!q) return Array.from(this.styles.values());

    return Array.from(this.styles.values()).filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        (s.shortTitle && s.shortTitle.toLowerCase().includes(q)),
    );
  }

  list(): CitationStyleMeta[] {
    return Array.from(this.styles.values());
  }
}
