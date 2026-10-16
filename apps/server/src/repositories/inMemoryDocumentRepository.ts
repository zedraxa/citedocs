import { NotFoundError, OwnershipError } from "./errors.js";
import { checkDocumentPermission } from "./ownership.js";
import type { IDocumentRepository } from "./documentRepository.js";
import type {
  DocumentRecord,
  DocumentShareRecord,
  DocumentWithRole,
  SharedDocumentItem,
  DocumentFilter,
  ShareRole,
} from "../documents/types.js";
import type { NewDocument } from "../db/schema.js";

export class InMemoryDocumentRepository implements IDocumentRepository {
  private documents = new Map<string, DocumentRecord>();
  private shares = new Map<string, DocumentShareRecord>();
  private knownUsers = new Map<string, { id: string; email: string; displayName?: string }>();

  /**
   * Helper to seed known users for email-to-id resolution in tests.
   */
  seedUser(user: { id: string; email: string; displayName?: string }): void {
    this.knownUsers.set(user.id, {
      ...user,
      email: user.email.toLowerCase().trim(),
    });
  }

  async list(userId: string): Promise<Array<DocumentRecord & { shareRole?: string }>> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const owned = await this.listOwned(userId);
    const shared = await this.listSharedWith(userId);

    return [
      ...owned.map((d) => ({ ...d, shareRole: "owner" })),
      ...shared.map((s) => ({ ...s.document, shareRole: s.shareRole })),
    ];
  }

  async listOwned(userId: string, filter?: DocumentFilter): Promise<DocumentRecord[]> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    let docs = Array.from(this.documents.values()).filter(
      (d) => d.ownerUserId === userId && !d.deletedAt
    );

    if (filter?.search && filter.search.trim() !== "") {
      const q = filter.search.toLowerCase().trim();
      docs = docs.filter((d) => d.title.toLowerCase().includes(q));
    }

    if (filter?.sortBy === "title") {
      docs.sort((a, b) =>
        filter.sortOrder === "desc"
          ? b.title.localeCompare(a.title)
          : a.title.localeCompare(b.title)
      );
    } else if (filter?.sortBy === "size") {
      docs.sort((a, b) =>
        filter.sortOrder === "desc" ? b.fileSize - a.fileSize : a.fileSize - b.fileSize
      );
    } else if (filter?.sortBy === "createdAt") {
      docs.sort((a, b) =>
        filter.sortOrder === "desc"
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime()
      );
    } else {
      docs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    return docs.map((d) => ({ ...d }));
  }

  async listSharedWith(
    userId: string,
    email?: string,
    filter?: DocumentFilter
  ): Promise<SharedDocumentItem[]> {
    if (!userId && !email) {
      throw new OwnershipError("Unauthenticated: valid user ID or email is required");
    }

    const normalizedEmail = email ? email.toLowerCase().trim() : undefined;
    const userShares = Array.from(this.shares.values()).filter((s) => {
      const matchUser = userId && s.userId === userId;
      const matchEmail =
        normalizedEmail && s.email && s.email.toLowerCase().trim() === normalizedEmail;
      return matchUser || matchEmail;
    });

    const seenDocIds = new Set<string>();
    const items: SharedDocumentItem[] = [];

    for (const share of userShares) {
      if (seenDocIds.has(share.documentId)) continue;
      const doc = this.documents.get(share.documentId);
      if (!doc || doc.deletedAt) continue;

      if (filter?.search && filter.search.trim() !== "") {
        const q = filter.search.toLowerCase().trim();
        if (!doc.title.toLowerCase().includes(q)) continue;
      }

      seenDocIds.add(doc.id);

      const owner = Array.from(this.knownUsers.values()).find(
        (u) => u.id === doc.ownerUserId
      );

      items.push({
        document: { ...doc },
        shareRole: share.role,
        sharedBy: owner
          ? {
              id: owner.id,
              email: owner.email,
              displayName: owner.displayName,
            }
          : undefined,
      });
    }

    if (filter?.sortBy === "title") {
      items.sort((a, b) =>
        filter.sortOrder === "desc"
          ? b.document.title.localeCompare(a.document.title)
          : a.document.title.localeCompare(b.document.title)
      );
    } else {
      items.sort((a, b) => b.document.updatedAt.getTime() - a.document.updatedAt.getTime());
    }

    return items;
  }

  async getById(
    userId: string,
    documentId: string,
    email?: string
  ): Promise<DocumentWithRole | null> {
    if (!userId && !email) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const doc = this.documents.get(documentId);
    if (!doc || doc.deletedAt) {
      return null;
    }

    if (userId && doc.ownerUserId === userId) {
      return { ...doc, userRole: "owner" };
    }

    const normalizedEmail = email ? email.toLowerCase().trim() : undefined;
    const share = Array.from(this.shares.values()).find(
      (s) =>
        s.documentId === documentId &&
        ((userId && s.userId === userId) ||
          (normalizedEmail && s.email && s.email.toLowerCase().trim() === normalizedEmail))
    );

    if (!share) {
      throw new OwnershipError("Access denied: you do not have permission to view this document");
    }

    return { ...doc, userRole: share.role };
  }

  async findRawById(documentId: string): Promise<DocumentRecord | null> {
    const doc = this.documents.get(documentId);
    if (!doc || doc.deletedAt) return null;
    return { ...doc };
  }

  async getStorageUsage(userId: string): Promise<number> {
    if (!userId) return 0;
    return Array.from(this.documents.values())
      .filter((d) => d.ownerUserId === userId && !d.deletedAt)
      .reduce((sum, d) => sum + (d.fileSize || 0), 0);
  }

  async create(
    userId: string,
    data: Omit<NewDocument, "id" | "ownerUserId" | "createdAt" | "updatedAt"> & {
      id?: string;
      s3ObjectKey?: string;
      fileSize?: number;
      mimeType?: string;
    }
  ): Promise<DocumentRecord> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const id = data.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const doc: DocumentRecord = {
      id,
      ownerUserId: userId,
      title: data.title || "Untitled Document",
      s3ObjectKey: data.s3ObjectKey || `users/${userId}/documents/${id}.docx`,
      fileSize: data.fileSize ?? 0,
      mimeType:
        data.mimeType ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      yjsState: data.yjsState,
      cslStyleId: data.cslStyleId || "apa",
      cslLocale: data.cslLocale || "en-US",
      preferences: (data.preferences as Record<string, unknown>) || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.documents.set(id, doc);
    return { ...doc };
  }

  async update(
    userId: string,
    documentId: string,
    data: Partial<Omit<NewDocument, "id" | "ownerUserId" | "createdAt">>,
    email?: string
  ): Promise<DocumentRecord> {
    const docWithRole = await this.getById(userId, documentId, email);
    if (!docWithRole) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    const canWrite = checkDocumentPermission(
      docWithRole.ownerUserId,
      userId,
      docWithRole.userRole,
      "write"
    );

    if (!canWrite) {
      throw new OwnershipError("Access denied: you do not have edit permissions for this document");
    }

    const existing = this.documents.get(documentId)!;
    const updated: DocumentRecord = {
      ...existing,
      ...data,
      title: data.title ?? existing.title,
      s3ObjectKey: (data.s3ObjectKey ?? existing.s3ObjectKey) || `users/${existing.ownerUserId}/documents/${existing.id}.docx`,
      fileSize: data.fileSize ?? existing.fileSize,
      mimeType: data.mimeType ?? existing.mimeType,
      preferences: (data.preferences !== undefined ? data.preferences : existing.preferences) as Record<string, unknown> | null,
      updatedAt: new Date(),
    };

    this.documents.set(documentId, updated);
    return { ...updated };
  }

  async delete(userId: string, documentId: string): Promise<boolean> {
    const docWithRole = await this.getById(userId, documentId);
    if (!docWithRole) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    if (docWithRole.ownerUserId !== userId) {
      throw new OwnershipError("Access denied: only the document owner can delete this document");
    }

    const existing = this.documents.get(documentId)!;
    existing.deletedAt = new Date();
    existing.updatedAt = new Date();
    this.documents.set(documentId, existing);
    return true;
  }

  async hardDelete(userId: string, documentId: string): Promise<boolean> {
    const docWithRole = await this.getById(userId, documentId);
    if (!docWithRole) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    if (docWithRole.ownerUserId !== userId) {
      throw new OwnershipError("Access denied: only the document owner can delete this document");
    }

    this.documents.delete(documentId);
    // Remove all shares for this document
    for (const [key, share] of this.shares.entries()) {
      if (share.documentId === documentId) {
        this.shares.delete(key);
      }
    }
    return true;
  }

  async share(
    ownerUserId: string,
    documentId: string,
    targetUserIdOrEmail: string,
    role: ShareRole = "viewer",
    createdBy?: string
  ): Promise<DocumentShareRecord> {
    const docWithRole = await this.getById(ownerUserId, documentId);
    if (!docWithRole) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    if (docWithRole.ownerUserId !== ownerUserId) {
      throw new OwnershipError("Access denied: only the document owner can share it");
    }

    const isEmail = targetUserIdOrEmail.includes("@");
    let targetEmail: string | null = isEmail ? targetUserIdOrEmail.toLowerCase().trim() : null;
    let targetUserId: string | null = !isEmail ? targetUserIdOrEmail : null;

    if (isEmail && targetEmail) {
      const match = Array.from(this.knownUsers.values()).find(
        (u) => u.email === targetEmail
      );
      if (match) targetUserId = match.id;
    } else if (targetUserId) {
      const match = this.knownUsers.get(targetUserId);
      if (match) targetEmail = match.email;
    }

    const existingShare = Array.from(this.shares.values()).find(
      (s) =>
        s.documentId === documentId &&
        ((targetUserId && s.userId === targetUserId) ||
          (targetEmail && s.email && s.email.toLowerCase().trim() === targetEmail))
    );

    const now = new Date();
    if (existingShare) {
      existingShare.role = role;
      if (targetUserId) existingShare.userId = targetUserId;
      if (targetEmail) existingShare.email = targetEmail;
      existingShare.updatedAt = now;
      this.shares.set(existingShare.id, existingShare);
      return { ...existingShare };
    }

    const id = `share-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newShare: DocumentShareRecord = {
      id,
      documentId,
      userId: targetUserId,
      email: targetEmail,
      role,
      createdBy: createdBy || ownerUserId,
      createdAt: now,
      updatedAt: now,
    };

    this.shares.set(id, newShare);
    return { ...newShare };
  }

  async unshare(
    ownerUserId: string,
    documentId: string,
    shareIdOrEmail: string
  ): Promise<boolean> {
    const docWithRole = await this.getById(ownerUserId, documentId);
    if (!docWithRole) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    if (docWithRole.ownerUserId !== ownerUserId) {
      throw new OwnershipError("Access denied: only the document owner can unshare it");
    }

    const isEmail = shareIdOrEmail.includes("@");
    const targetEmail = isEmail ? shareIdOrEmail.toLowerCase().trim() : undefined;

    const toDeleteKey = Array.from(this.shares.entries()).find(
      ([, s]) =>
        s.documentId === documentId &&
        (s.id === shareIdOrEmail ||
          s.userId === shareIdOrEmail ||
          (targetEmail && s.email && s.email.toLowerCase().trim() === targetEmail))
    )?.[0];

    if (toDeleteKey) {
      this.shares.delete(toDeleteKey);
      return true;
    }
    return false;
  }

  async listShares(
    userId: string,
    documentId: string,
    email?: string
  ): Promise<DocumentShareRecord[]> {
    const docWithRole = await this.getById(userId, documentId, email);
    if (!docWithRole) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    return Array.from(this.shares.values())
      .filter((s) => s.documentId === documentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((s) => ({ ...s }));
  }

  clear(): void {
    this.documents.clear();
    this.shares.clear();
    this.knownUsers.clear();
  }
}
