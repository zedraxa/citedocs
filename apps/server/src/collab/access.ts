/**
 * Role of a collaborator on a document:
 * - 'owner': Full control (read, write, share)
 * - 'editor': Read/write document modifications
 * - 'commenter': Read-only document updates; can add comments and suggestions
 * - 'viewer': Read-only document view; cannot apply updates
 */
export type DocumentRole = "owner" | "editor" | "commenter" | "viewer";

/**
 * Access control interface for real-time document collaboration.
 * Injectable so that the real DocumentRepository (owner + document_shares roles)
 * can be plugged in seamlessly once merged.
 */
export interface DocumentAccessChecker {
  canAccess(
    userId: string,
    documentId: string,
  ): Promise<DocumentRole | null> | DocumentRole | null;
}

/**
 * In-memory document access checker for development and automated testing.
 * Enforces per-user document ownership and explicit collaborator sharing.
 */
export class InMemoryDocumentAccessChecker implements DocumentAccessChecker {
  private documentOwners = new Map<string, string>(); // documentId -> ownerUserId
  private documentShares = new Map<string, Map<string, DocumentRole>>(); // documentId -> (userId -> role)

  constructor(initialData?: {
    documents?: Record<string, string>; // documentId -> ownerId
    shares?: Record<string, Record<string, DocumentRole>>; // documentId -> { userId: role }
  }) {
    if (initialData?.documents) {
      for (const [docId, ownerId] of Object.entries(initialData.documents)) {
        this.setDocumentOwner(docId, ownerId);
      }
    }
    if (initialData?.shares) {
      for (const [docId, userShares] of Object.entries(initialData.shares)) {
        for (const [userId, role] of Object.entries(userShares)) {
          this.setDocumentShare(docId, userId, role);
        }
      }
    }
  }

  setDocumentOwner(documentId: string, ownerId: string): void {
    this.documentOwners.set(documentId, ownerId);
  }

  getDocumentOwner(documentId: string): string | undefined {
    return this.documentOwners.get(documentId);
  }

  setDocumentShare(documentId: string, userId: string, role: DocumentRole): void {
    let shares = this.documentShares.get(documentId);
    if (!shares) {
      shares = new Map();
      this.documentShares.set(documentId, shares);
    }
    shares.set(userId, role);
  }

  removeDocumentShare(documentId: string, userId: string): void {
    const shares = this.documentShares.get(documentId);
    if (shares) {
      shares.delete(userId);
    }
  }

  getDocumentShares(documentId: string): Map<string, DocumentRole> {
    return new Map(this.documentShares.get(documentId) || []);
  }

  clear(): void {
    this.documentOwners.clear();
    this.documentShares.clear();
  }

  canAccess(userId: string, documentId: string): DocumentRole | null {
    // 1. Direct document owner
    const owner = this.documentOwners.get(documentId);
    if (owner && owner === userId) {
      return "owner";
    }

    // 2. Explicit collaborator share grant
    const shares = this.documentShares.get(documentId);
    if (shares && shares.has(userId)) {
      return shares.get(userId)!;
    }

    // 3. Unauthorized
    return null;
  }
}
