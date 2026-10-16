import type { ZoteroAccountInfo, ZoteroConfigInfo } from "./types.js";

const env =
  typeof import.meta !== "undefined"
    ? (import.meta as unknown as { env?: Record<string, string> }).env
    : undefined;
const API_BASE = (env?.VITE_API_URL || "").replace(/\/+$/, "");

function getHeaders(userId: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (userId) {
    headers["X-User-Id"] = userId;
  }
  return headers;
}

export async function fetchZoteroAccount(userId: string): Promise<ZoteroAccountInfo> {
  try {
    const res = await fetch(`${API_BASE}/api/zotero/account`, {
      method: "GET",
      headers: getHeaders(userId),
    });
    if (!res.ok) {
      return {
        linked: false,
        userId,
        zoteroUserId: null,
        username: null,
        maskedKey: null,
        syncEnabled: false,
        lastSyncedAt: null,
        lastSyncVersion: 0,
      };
    }
    const data = await res.json();
    return data;
  } catch {
    return {
      linked: false,
      userId,
      zoteroUserId: null,
      username: null,
      maskedKey: null,
      syncEnabled: false,
      lastSyncedAt: null,
      lastSyncVersion: 0,
    };
  }
}

export async function linkZoteroApiKey(
  userId: string,
  apiKey: string
): Promise<{ success: boolean; data?: ZoteroAccountInfo; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/zotero/account`, {
      method: "POST",
      headers: getHeaders(userId),
      body: JSON.stringify({ apiKey }),
    });

    const body = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: body.message || body.error || "Failed to link Zotero account",
      };
    }

    return {
      success: true,
      data: body,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function unlinkZoteroAccount(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/zotero/account`, {
      method: "DELETE",
      headers: getHeaders(userId),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchZoteroConfig(userId: string): Promise<ZoteroConfigInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/api/zotero/config`, {
      method: "GET",
      headers: getHeaders(userId),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.config || null;
  } catch {
    return null;
  }
}
