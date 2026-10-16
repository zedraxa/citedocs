export type CreatorType =
  "author" | "editor" | "translator" | "contributor" | "seriesEditor" | "reviewedAuthor";

export interface ZoteroCreator {
  creatorType: CreatorType;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export type ZoteroItemType =
  | "journalArticle"
  | "book"
  | "bookSection"
  | "conferencePaper"
  | "thesis"
  | "report"
  | "webpage"
  | "preprint"
  | "patent"
  | "document"
  | "attachment"
  | "note";

export interface ZoteroTag {
  tag: string;
  type?: number;
}

export interface ZoteroItem {
  key: string;
  version: number;
  itemType: ZoteroItemType;
  title: string;
  creators: ZoteroCreator[];
  abstractNote?: string;
  publicationTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  date?: string;
  series?: string;
  seriesTitle?: string;
  seriesText?: string;
  journalAbbreviation?: string;
  DOI?: string;
  ISBN?: string;
  ISSN?: string;
  url?: string;
  accessDate?: string;
  archive?: string;
  archiveLocation?: string;
  libraryCatalog?: string;
  callNumber?: string;
  rights?: string;
  extra?: string;
  tags: ZoteroTag[];
  collections: string[];
  relations?: Record<string, string[]>;
  dateAdded?: string;
  dateModified?: string;
}

export interface ZoteroCollection {
  key: string;
  version: number;
  name: string;
  parentCollection?: string | false;
}

export interface ZoteroAttachment {
  key: string;
  version: number;
  parentItem: string;
  linkMode: "imported_file" | "linked_file" | "imported_url" | "linked_url";
  title: string;
  contentType: string;
  filename?: string;
  url?: string;
  md5?: string;
  mtime?: number;
}

export interface ZoteroAnnotation {
  key: string;
  parentItem: string;
  type: "highlight" | "note" | "image";
  text?: string;
  comment?: string;
  color: string;
  pageNumber: number;
  rects?: number[][];
}
