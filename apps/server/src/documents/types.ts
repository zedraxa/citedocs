export type ShareRole = "viewer" | "editor";
export type DocumentUserRole = "owner" | "editor" | "viewer";

export interface DocumentRecord {
  id: string;
  ownerUserId: string;
  title: string;
  s3ObjectKey: string;
  fileSize: number;
  mimeType: string;
  yjsState?: Buffer | null;
  cslStyleId: string;
  cslLocale: string;
  preferences?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface DocumentShareRecord {
  id: string;
  documentId: string;
  userId?: string | null;
  email?: string | null;
  role: ShareRole;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentWithRole extends DocumentRecord {
  userRole: DocumentUserRole;
}

export interface SharedDocumentItem {
  document: DocumentRecord;
  shareRole: ShareRole;
  sharedBy?: {
    id: string;
    email?: string | null;
    displayName?: string | null;
  };
}

export interface DocumentFilter {
  search?: string;
  sortBy?: "updatedAt" | "createdAt" | "title" | "size";
  sortOrder?: "asc" | "desc";
}

export interface StorageQuotaInfo {
  used: number;
  total: number;
  percentage: number;
  remaining: number;
}
