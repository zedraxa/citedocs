import type { ZoteroAccountInfo, ZoteroConfigInfo } from "./types.js";
import { isNetworkError } from "../auth/api.js";

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
        error: body.message || body.error || "Zotero hesabı bağlanamadı",
      };
    }

    return {
      success: true,
      data: body,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: isNetworkError(err)
        ? "Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin."
        : err instanceof Error
          ? err.message
          : "Zotero hesabı bağlanamadı",
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

export interface ImportReferencesRequest {
  data?: string;
  filename?: string;
  format?: string;
  save?: boolean;
  items?: Record<string, unknown>[];
}

export interface ItemPreviewData {
  title: string;
  authors?: string;
  year?: string;
  doi?: string;
  itemType?: string;
  publicationTitle?: string;
  key?: string;
}

export interface FailedItemData {
  index: number;
  title: string;
  reason: string;
  code?: number;
}

export interface ImportReferencesResponse {
  success: boolean;
  saved: boolean;
  total: number;
  savedCount: number;
  failedCount: number;
  savedItems?: ItemPreviewData[];
  failedItems?: FailedItemData[];
  items?: ItemPreviewData[];
  rawItems?: Record<string, unknown>[];
  message: string;
  error?: string;
}

export async function importZoteroReferences(
  payload: ImportReferencesRequest,
  customApiUrl?: string,
  userId?: string,
): Promise<{ ok: boolean; status: number; data: ImportReferencesResponse }> {
  const base = (customApiUrl || API_BASE).replace(/\/+$/, "");
  const headers = getHeaders(userId || "");

  try {
    const res = await fetch(`${base}/api/zotero/import`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as ImportReferencesResponse;
    return { ok: res.ok, status: res.status, data };
  } catch (err: unknown) {
    const isNet = isNetworkError(err);
    return {
      ok: false,
      status: isNet ? 0 : 500,
      data: {
        success: false,
        saved: false,
        total: 0,
        savedCount: 0,
        failedCount: 0,
        message: isNet
          ? "Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin."
          : err instanceof Error
            ? err.message
            : "İçe aktarma sırasında beklenmeyen bir hata oluştu.",
        error: isNet ? "Network Error" : "Unknown Error",
      },
    };
  }
}

