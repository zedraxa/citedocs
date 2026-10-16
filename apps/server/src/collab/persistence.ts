/**
 * Pluggable persistence interface for collaborative documents.
 * Allows switching between in-memory (dev/tests) and PostgreSQL (yjs_state bytea).
 */
export interface CollabPersistence {
  loadDocument(documentName: string): Promise<Uint8Array | null>;
  storeDocument(documentName: string, state: Uint8Array): Promise<void>;
}

/**
 * In-memory persistence implementation storing Yjs document update states.
 */
export class InMemoryCollabPersistence implements CollabPersistence {
  private documents = new Map<string, Uint8Array>();

  async loadDocument(documentName: string): Promise<Uint8Array | null> {
    return this.documents.get(documentName) ?? null;
  }

  async storeDocument(documentName: string, state: Uint8Array): Promise<void> {
    this.documents.set(documentName, state);
  }

  hasDocument(documentName: string): boolean {
    return this.documents.has(documentName);
  }

  clear(): void {
    this.documents.clear();
  }
}
