export interface ZoteroItemPayload {
  id: string;
  title: string;
  authors: string;
  year: string;
  doi?: string;
  itemType?: string;
  publicationTitle?: string;
  url?: string;
  locator?: string;
}

export interface ZoteroAccountInfo {
  linked: boolean;
  userId: string;
  zoteroUserId: string | null;
  username: string | null;
  maskedKey: string | null;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSyncVersion: number;
}

export interface ZoteroConfigInfo {
  linked: boolean;
  userId: string;
  zoteroUserId: string | null;
  proxyBaseUrl: string;
  webLibraryUrl: string;
  syncEnabled: boolean;
}

export type WebLibraryPostMessage =
  | {
      type: "CITEDOCS_ZOTERO_CITE";
      item: ZoteroItemPayload;
    }
  | {
      type: "CITEDOCS_ZOTERO_ITEM_SELECTED";
      item: ZoteroItemPayload;
    }
  | {
      type: "CITEDOCS_SET_CONFIG";
      config: Partial<ZoteroConfigInfo>;
    }
  | {
      type: "CITEDOCS_REFRESH";
    };
