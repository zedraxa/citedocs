import type { KeyPermissions } from "@citedocs/zotero-core";

export interface LinkApiKeyInput {
  apiKey: string;
}

export function validateLinkApiKeyInput(input: unknown): { success: true; data: LinkApiKeyInput } | { success: false; error: string } {
  if (!input || typeof input !== "object") {
    return { success: false, error: "Request body must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.apiKey !== "string" || !obj.apiKey.trim()) {
    return { success: false, error: "A non-empty apiKey string is required" };
  }
  if (obj.apiKey.trim().length > 128) {
    return { success: false, error: "API key is too long (maximum 128 characters)" };
  }
  return { success: true, data: { apiKey: obj.apiKey.trim() } };
}

export interface ZoteroAccountStatus {
  linked: boolean;
  userId: string;
  zoteroUserId: string | null;
  username: string | null;
  maskedKey: string | null;
  permissions?: KeyPermissions["access"] | null;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSyncVersion: number;
}

export interface ZoteroConfigResponse {
  linked: boolean;
  userId: string;
  zoteroUserId: string | null;
  proxyBaseUrl: string;
  webLibraryUrl: string;
  syncEnabled: boolean;
}

/**
 * Masks an API key so that only a short prefix/suffix is visible.
 * Never leaks the full key to clients or logs.
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}
