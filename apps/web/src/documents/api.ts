import {
  getApiBaseUrl,
  getCsrfToken,
  createNetworkError,
  createApiError,
  isNetworkError,
} from "../auth/api.js";
import type {
  DocumentItem,
  SharedDocumentItem,
  ShareItem,
  StorageQuotaInfo,
  ShareRole,
} from "./types.js";

async function docFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers.set("x-csrf-token", csrf);
    }
    if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
      headers.set("Content-Type", "application/json");
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (err: unknown) {
    if (isNetworkError(err)) {
      throw createNetworkError(err);
    }
    throw err;
  }

  const contentType = res.headers?.get ? res.headers.get("content-type") || "" : "application/json";
  let data: Record<string, unknown> | null = null;
  if (contentType.includes("application/json") || typeof res.json === "function") {
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw createApiError(res.status, data);
  }

  return (data as unknown as T) || ({} as T);
}

export async function fetchMyDocuments(search?: string): Promise<{
  documents: DocumentItem[];
  quota: StorageQuotaInfo;
}> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return docFetch<{ documents: DocumentItem[]; quota: StorageQuotaInfo }>(
    `/api/documents${query}`
  );
}

export async function fetchSharedDocuments(search?: string): Promise<{
  documents: SharedDocumentItem[];
}> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return docFetch<{ documents: SharedDocumentItem[] }>(
    `/api/documents/shared-with-me${query}`
  );
}

export async function fetchQuota(): Promise<StorageQuotaInfo> {
  return docFetch<StorageQuotaInfo>("/api/documents/quota");
}

export async function createBlankDocument(
  title?: string,
  format: "docx" | "odt" = "docx"
): Promise<{ document: DocumentItem }> {
  return docFetch<{ document: DocumentItem }>("/api/documents", {
    method: "POST",
    body: JSON.stringify({ title, format }),
  });
}

export async function uploadDocument(
  file: File
): Promise<{ document: DocumentItem }> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/documents/upload`;

  const formData = new FormData();
  formData.append("file", file, file.name);

  const headers = new Headers();
  headers.set("Accept", "application/json");
  const csrf = getCsrfToken();
  if (csrf) {
    headers.set("x-csrf-token", csrf);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      credentials: "include",
    });
  } catch (err: unknown) {
    if (isNetworkError(err)) {
      throw createNetworkError(err);
    }
    throw err;
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw createApiError(res.status, data, "Belge yüklenemedi");
  }

  return data as unknown as { document: DocumentItem };
}

export async function renameDocument(
  documentId: string,
  title: string
): Promise<{ document: DocumentItem }> {
  return docFetch<{ document: DocumentItem }>(`/api/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteDocument(documentId: string): Promise<{ success: boolean }> {
  return docFetch<{ success: boolean }>(`/api/documents/${documentId}`, {
    method: "DELETE",
  });
}

export async function downloadDocument(documentId: string, fileName: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/documents/${documentId}/download`;

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
    });
  } catch (err: unknown) {
    if (isNetworkError(err)) {
      throw createNetworkError(err);
    }
    throw err;
  }

  if (!res.ok) {
    throw createApiError(res.status, null, `İndirme başarısız oldu (${res.status})`);
  }

  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export async function listShares(documentId: string): Promise<ShareItem[]> {
  const res = await docFetch<{ shares: ShareItem[] }>(
    `/api/documents/${documentId}/shares`
  );
  return res.shares || [];
}

export async function shareDocument(
  documentId: string,
  email: string,
  role: ShareRole = "viewer"
): Promise<{ share: ShareItem }> {
  return docFetch<{ share: ShareItem }>(`/api/documents/${documentId}/shares`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function unshareDocument(
  documentId: string,
  shareId: string
): Promise<{ success: boolean }> {
  return docFetch<{ success: boolean }>(
    `/api/documents/${documentId}/shares/${shareId}`,
    {
      method: "DELETE",
    }
  );
}
