import { eq } from "drizzle-orm";
import { getDb, type CitedocsDb } from "../db/client.js";
import { zoteroCredentials, type ZoteroCredential } from "../db/schema.js";
import { encryptAtRest, decryptAtRest } from "../db/crypto.js";
import { OwnershipError } from "./errors.js";

export interface DecryptedZoteroCredentials {
  id: string;
  userId: string;
  zoteroUserId: string | null;
  apiKey: string | null;
  token: string | null;
  syncEnabled: boolean;
  lastSyncVersion: number;
  lastSyncedAt: Date | null;
}

export class ZoteroCredentialRepository {
  private db: CitedocsDb;

  constructor(dbInstance?: CitedocsDb) {
    this.db = dbInstance || getDb();
  }

  /**
   * Retrieves Zotero credentials for the given user, decrypting API key and token at rest.
   * If credentials belong to another user or user is empty, access is rejected.
   */
  async get(userId: string): Promise<DecryptedZoteroCredentials | null> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const rows = await this.db
      .select()
      .from(zoteroCredentials)
      .where(eq(zoteroCredentials.userId, userId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const cred = rows[0];

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

  /**
   * Saves or updates Zotero credentials for a user, encrypting the API key and token at rest.
   */
  async save(
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

    const existing = await this.db
      .select()
      .from(zoteroCredentials)
      .where(eq(zoteroCredentials.userId, userId))
      .limit(1);

    const encryptedApiKey = data.apiKey ? encryptAtRest(data.apiKey) : undefined;
    const encryptedToken = data.token ? encryptAtRest(data.token) : undefined;
    const now = new Date();

    if (existing.length > 0) {
      const updatePayload: Record<string, unknown> = {
        updatedAt: now,
      };
      if (data.zoteroUserId !== undefined) updatePayload.zoteroUserId = data.zoteroUserId;
      if (encryptedApiKey !== undefined) updatePayload.encryptedApiKey = encryptedApiKey;
      if (encryptedToken !== undefined) updatePayload.encryptedToken = encryptedToken;
      if (data.syncEnabled !== undefined) updatePayload.syncEnabled = data.syncEnabled;

      const updated = await this.db
        .update(zoteroCredentials)
        .set(updatePayload)
        .where(eq(zoteroCredentials.userId, userId))
        .returning();

      return updated[0];
    }

    const created = await this.db
      .insert(zoteroCredentials)
      .values({
        userId,
        zoteroUserId: data.zoteroUserId || null,
        encryptedApiKey: encryptedApiKey || null,
        encryptedToken: encryptedToken || null,
        syncEnabled: data.syncEnabled ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created[0];
  }

  /**
   * Deletes the user's Zotero credentials.
   */
  async delete(userId: string): Promise<boolean> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const rows = await this.db
      .delete(zoteroCredentials)
      .where(eq(zoteroCredentials.userId, userId))
      .returning();

    return rows.length > 0;
  }
}
