import type { ZoteroItem, CSLItem, CSLName, CSLDate } from "@citedocs/shared";

const ITEM_TYPE_MAP: Record<string, string> = {
  journalArticle: "article-journal",
  book: "book",
  bookSection: "chapter",
  conferencePaper: "paper-conference",
  thesis: "thesis",
  report: "report",
  webpage: "webpage",
  preprint: "article",
  patent: "patent",
  document: "document",
};

export function zoteroItemToCSL(item: ZoteroItem): CSLItem {
  const authors: CSLName[] = [];
  const editors: CSLName[] = [];
  const translators: CSLName[] = [];

  for (const creator of item.creators || []) {
    const cslName: CSLName = {};
    if (creator.lastName) {
      cslName.family = creator.lastName;
      if (creator.firstName) cslName.given = creator.firstName;
    } else if (creator.name) {
      cslName.literal = creator.name;
    }

    if (creator.creatorType === "author") {
      authors.push(cslName);
    } else if (creator.creatorType === "editor") {
      editors.push(cslName);
    } else if (creator.creatorType === "translator") {
      translators.push(cslName);
    } else {
      authors.push(cslName);
    }
  }

  const issued: CSLDate = parseDateToCSL(item.date);

  const csl: CSLItem = {
    id: item.key,
    type: ITEM_TYPE_MAP[item.itemType] || "article",
    title: item.title,
    author: authors.length > 0 ? authors : undefined,
    editor: editors.length > 0 ? editors : undefined,
    translator: translators.length > 0 ? translators : undefined,
    issued: issued,
    "container-title": item.publicationTitle,
    volume: item.volume,
    issue: item.issue,
    page: item.pages,
    DOI: item.DOI,
    ISBN: item.ISBN,
    ISSN: item.ISSN,
    URL: item.url,
    abstract: item.abstractNote,
  };

  return csl;
}

export function parseDateToCSL(dateStr?: string): CSLDate {
  if (!dateStr) return {};

  const clean = dateStr.trim();
  // Match YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = isoMatch[2] ? parseInt(isoMatch[2], 10) : undefined;
    const day = isoMatch[3] ? parseInt(isoMatch[3], 10) : undefined;

    const parts: number[] = [year];
    if (month !== undefined) parts.push(month);
    if (day !== undefined) parts.push(day);

    return { "date-parts": [parts] };
  }

  // Fallback: look for 4-digit year
  const yearMatch = clean.match(/\b(\d{4})\b/);
  if (yearMatch) {
    return {
      "date-parts": [[parseInt(yearMatch[1], 10)]],
      raw: clean,
    };
  }

  return { literal: clean };
}
