import type { ZoteroItem } from "@citedocs/shared";

export type LibraryType = "user" | "group";

export interface UserLibraryTarget {
  type: "user";
  userId: string | number;
}

export interface GroupLibraryTarget {
  type: "group";
  groupId: string | number;
}

export type LibraryTarget = UserLibraryTarget | GroupLibraryTarget;

/**
 * Returns the URI path segment for a library target (e.g. "users/12345" or "groups/67890").
 */
export function formatLibraryTarget(target: LibraryTarget): string {
  if (target.type === "user") {
    return `users/${target.userId}`;
  }
  return `groups/${target.groupId}`;
}

/**
 * Returns a unique storage identifier string for a library target (e.g. "user:12345" or "group:67890").
 */
export function getLibraryId(target: LibraryTarget): string {
  if (target.type === "user") {
    return `user:${target.userId}`;
  }
  return `group:${target.groupId}`;
}

export interface KeyPermissions {
  key?: string;
  userId: number | string;
  username: string;
  access: {
    user?: {
      library?: boolean;
      files?: boolean;
      notes?: boolean;
      write?: boolean;
    };
    groups?: {
      all?: boolean;
      [groupId: string]: unknown;
    };
  };
}

export interface ZoteroDeletedResponse {
  items: string[];
  collections?: string[];
  searches?: string[];
  tags?: string[];
}

export interface ZoteroWriteResponse {
  success: Record<string, string>;
  unchanged: Record<string, string>;
  failed: Record<string, { code: number; message: string }>;
  lastModifiedVersion?: number;
}

export interface ZoteroApiResponse<T> {
  data: T;
  status: number;
  lastModifiedVersion?: number;
  totalResults?: number;
  links?: {
    next?: string;
    prev?: string;
    first?: string;
    last?: string;
  };
  backoffSeconds?: number;
  retryAfterSeconds?: number;
}

export interface ConflictDetail {
  itemKey: string;
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  resolvedValue: unknown;
  resolution: "remote-wins" | "local-wins";
}

export interface LocalChanges {
  created: ZoteroItem[];
  updated: ZoteroItem[];
  deletedKeys: string[];
}

export type SyncStatus = "idle" | "pulling" | "pushing" | "conflict" | "error";

export interface SyncOptions {
  userId?: string;
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface SyncResult {
  libraryVersion: number;
  pulledCount: number;
  deletedRemotelyCount: number;
  pushedCreatedCount: number;
  pushedUpdatedCount: number;
  pushedDeletedCount: number;
  conflicts: ConflictDetail[];
  /** Backward compatibility aliases */
  updatedItems: ZoteroItem[];
  deletedItemKeys: string[];
  newLibraryVersion: number;
}

export interface GetItemsOptions {
  since?: number;
  format?: "json" | "versions";
  limit?: number;
  start?: number;
  itemKeys?: string[];
  sort?: string;
  direction?: "asc" | "desc";
}
