export type ShareRole = "viewer" | "editor";
export type DocumentTab = "my" | "shared";

export interface DocumentItem {
  id: string;
  ownerUserId: string;
  title: string;
  s3ObjectKey: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SharedDocumentItem {
  document: DocumentItem;
  shareRole: ShareRole;
  sharedBy?: {
    id: string;
    email?: string | null;
    displayName?: string | null;
  };
}

export interface ShareItem {
  id: string;
  documentId: string;
  userId?: string | null;
  email?: string | null;
  role: ShareRole;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorageQuotaInfo {
  used: number;
  total: number;
  percentage: number;
  remaining: number;
}
