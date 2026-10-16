import { ZoteroCredentialRepository, type DecryptedZoteroCredentials } from "./zoteroRepository.js";
import { type ZoteroCredential } from "../db/schema.js";
import { encryptAtRest, decryptAtRest } from "../db/crypto.js";
import { OwnershipError } from "./errors.js";
import type { CitedocsDb } from "../db/client.js";

/**
 * In-memory implementation of ZoteroCredentialRepository for unit tests and local dev.
 * Validates user ownership and encrypts/decrypts API keys at rest using AES-256-GCM.
 */
export class InMemoryZoteroCredentialRepository extends ZoteroCredentialRepository {
  private credentialsMap = new Map<string, ZoteroCredential>();

  constructor() {
    super({} as CitedocsDb);
  }

  clear(): void {
    this.credentialsMap.clear();
  }

  override async get(userId: string): Promise<DecryptedZoteroCredentials | null> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const cred = this.credentialsMap.get(userId);
    if (!cred) {
      return null;
    }

    return {
      id: cred.id,
      userId: cred.userId,
      zoteroUserId: cred.zoteroUserId,
      apiKey: cred.encryptedApiKey ? decryptAtRest(cred.encryptedApiKey) : null,
      token: cred.encryptedToken ? decryptAtRest(cred.encryptedToken) : null,
      syncEnabled: cred.syncEnabled,
      lastSyncVersion: cred.lastSyncVersion,
      lastSyncedAt: cred.lastSyncedAt,
    };
  }

  override async save(
    userId: string,
    data: {
      zoteroUserId?: string;
      apiKey?: string;
      token?: string;
      syncEnabled?: boolean;
    }
  ): Promise<ZoteroCredential> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const existing = this.credentialsMap.get(userId);
    const encryptedApiKey = data.apiKey ? encryptAtRest(data.apiKey) : undefined;
    const encryptedToken = data.token ? encryptAtRest(data.token) : undefined;
    const now = new Date();

    if (existing) {
      const updated: ZoteroCredential = {
        ...existing,
        zoteroUserId: data.zoteroUserId !== undefined ? data.zoteroUserId : existing.zoteroUserId,
        encryptedApiKey: encryptedApiKey !== undefined ? encryptedApiKey : existing.encryptedApiKey,
        encryptedToken: encryptedToken !== undefined ? encryptedToken : existing.encryptedToken,
        syncEnabled: data.syncEnabled !== undefined ? data.syncEnabled : existing.syncEnabled,
        updatedAt: now,
      };
      this.credentialsMap.set(userId, updated);
      return updated;
    }

    const created: ZoteroCredential = {
      id: `zcred-${Math.random().toString(36).substring(2, 9)}`,
      userId,
      zoteroUserId: data.zoteroUserId || null,
      encryptedApiKey: encryptedApiKey || null,
      encryptedToken: encryptedToken || null,
      syncEnabled: data.syncEnabled ?? true,
      lastSyncVersion: 0,
      lastSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.credentialsMap.set(userId, created);
    return created;
  }

  override async delete(userId: string): Promise<boolean> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    return this.credentialsMap.delete(userId);
  }
}
