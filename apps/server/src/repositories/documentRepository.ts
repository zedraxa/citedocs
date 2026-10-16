import { eq, and, desc } from "drizzle-orm";
import { getDb, type CitedocsDb } from "../db/client.js";
import {
  documents,
  documentShares,
  type Document,
  type NewDocument,
  type DocumentShare,
} from "../db/schema.js";
import { checkDocumentPermission } from "./ownership.js";
import { NotFoundError, OwnershipError } from "./errors.js";

export class DocumentRepository {
  private db: CitedocsDb;

  constructor(dbInstance?: CitedocsDb) {
    this.db = dbInstance || getDb();
  }

  /**
   * Retrieves all documents accessible by the user (owned or shared).
   */
  async list(userId: string): Promise<Array<Document & { shareRole?: string }>> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    // Owned documents
    const owned = await this.db
      .select()
      .from(documents)
      .where(eq(documents.ownerUserId, userId))
      .orderBy(desc(documents.updatedAt));

    // Shared documents
    const sharedRows = await this.db
      .select({
        document: documents,
        shareRole: documentShares.role,
      })
      .from(documentShares)
      .innerJoin(documents, eq(documentShares.documentId, documents.id))
      .where(eq(documentShares.userId, userId))
      .orderBy(desc(documents.updatedAt));

    const combined: Array<Document & { shareRole?: string }> = [
      ...owned.map((doc) => ({ ...doc, shareRole: "owner" })),
      ...sharedRows.map((row) => ({ ...row.document, shareRole: row.shareRole })),
    ];

    return combined;
  }

  /**
   * Retrieves a document by its ID, enforcing ownership or explicit share grant.
   * If a user tries to access a document they do not own and is not shared with them,
   * throws an OwnershipError.
   */
  async getById(
    userId: string,
    documentId: string
  ): Promise<(Document & { userRole: string }) | null> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const rows = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const doc = rows[0];

    if (doc.ownerUserId === userId) {
      return { ...doc, userRole: "owner" };
    }

    // Check explicit document shares
    const shareRows = await this.db
      .select()
      .from(documentShares)
      .where(
        and(
          eq(documentShares.documentId, documentId),
          eq(documentShares.userId, userId)
        )
      )
      .limit(1);

    if (shareRows.length === 0) {
      throw new OwnershipError("Access denied: you do not have permission to view this document");
    }

    return { ...doc, userRole: shareRows[0].role };
  }

  /**
   * Creates a new document strictly owned by the specified user.
   */
  async create(
    userId: string,
    data: Omit<NewDocument, "id" | "ownerUserId" | "createdAt" | "updatedAt">
  ): Promise<Document> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const now = new Date();
    const rows = await this.db
      .insert(documents)
      .values({
        ...data,
        ownerUserId: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return rows[0];
  }

  /**
   * Updates a document if the user is the owner or has an "editor" share role.
   */
  async update(
    userId: string,
    documentId: string,
    data: Partial<Omit<NewDocument, "id" | "ownerUserId" | "createdAt">>
  ): Promise<Document> {
    const docWithRole = await this.getById(userId, documentId);
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

    const rows = await this.db
      .update(documents)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning();

    return rows[0];
  }

  /**
   * Deletes a document. Only the owner can delete a document.
   */
  async delete(userId: string, documentId: string): Promise<boolean> {
    const docWithRole = await this.getById(userId, documentId);
    if (!docWithRole) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    if (docWithRole.ownerUserId !== userId) {
      throw new OwnershipError("Access denied: only the document owner can delete this document");
    }

    const rows = await this.db
      .delete(documents)
      .where(eq(documents.id, documentId))
      .returning();

    return rows.length > 0;
  }

  /**
   * Shares a document with another user. Only the owner can manage sharing.
   */
  async share(
    ownerUserId: string,
    documentId: string,
    targetUserId: string,
    role: "owner" | "editor" | "commenter" | "viewer" = "viewer"
  ): Promise<DocumentShare> {
    const docWithRole = await this.getById(ownerUserId, documentId);
    if (!docWithRole) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    if (docWithRole.ownerUserId !== ownerUserId) {
      throw new OwnershipError("Access denied: only the document owner can share it");
    }

    // Check if share already exists to update role
    const existing = await this.db
      .select()
      .from(documentShares)
      .where(
        and(
          eq(documentShares.documentId, documentId),
          eq(documentShares.userId, targetUserId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const updated = await this.db
        .update(documentShares)
        .set({ role })
        .where(eq(documentShares.id, existing[0].id))
        .returning();
      return updated[0];
    }

    const created = await this.db
      .insert(documentShares)
      .values({
        documentId,
        userId: targetUserId,
        role,
      })
      .returning();

    return created[0];
  }
}
