import type { KeyPermissions } from "@citedocs/zotero-core";
import { ZoteroCredentialRepository } from "../repositories/zoteroRepository.js";
import {
  maskApiKey,
  type ZoteroAccountStatus,
  type ZoteroConfigResponse,
} from "./types.js";

export class ZoteroValidationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ZoteroValidationError";
    this.statusCode = statusCode;
  }
}

export interface ZoteroAccountServiceOptions {
  credentialRepo?: ZoteroCredentialRepository;
  fetchFn?: typeof fetch;
  apiBaseUrl?: string;
}

export class ZoteroAccountService {
  private readonly credentialRepo: ZoteroCredentialRepository;
  private readonly fetchFn: typeof fetch;
  private readonly apiBaseUrl: string;

  constructor(options: ZoteroAccountServiceOptions = {}) {
    this.credentialRepo = options.credentialRepo || new ZoteroCredentialRepository();
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.apiBaseUrl = (options.apiBaseUrl || "https://api.zotero.org").replace(/\/+$/, "");
  }

  /**
   * Validates an API key against zotero.org/keys/current.
   * Throws ZoteroValidationError if invalid, inactive, or unreachable.
   */
  async validateKey(apiKey: string): Promise<KeyPermissions> {
    const trimmed = (apiKey || "").trim();
    if (!trimmed) {
      throw new ZoteroValidationError("Zotero API key cannot be empty", 400);
    }

    const url = `${this.apiBaseUrl}/keys/current`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          "Zotero-API-Version": "3",
          "Zotero-API-Key": trimmed,
          Accept: "application/json",
        },
      });
    } catch (err: unknown) {
      throw new ZoteroValidationError(
        `Failed to reach Zotero API during key validation: ${err instanceof Error ? err.message : String(err)}`,
        502
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new ZoteroValidationError(
        "Invalid Zotero API key: authentication failed at zotero.org",
        401
      );
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new ZoteroValidationError(
        `Zotero API key validation rejected with HTTP ${response.status}: ${errText}`,
        response.status >= 500 ? 502 : 400
      );
    }

    const data = (await response.json()) as KeyPermissions;
    return data;
  }

  /**
   * Links a user's Zotero API key: validates via zotero.org,
   * stores encrypted at rest in the credentials repository,
   * and returns masked status. Never returns the full key.
   */
  async linkApiKey(userId: string, apiKey: string): Promise<ZoteroAccountStatus> {
    if (!userId) {
      throw new ZoteroValidationError("User ID is required", 401);
    }

    const keyInfo = await this.validateKey(apiKey);
    const zoteroUserId = keyInfo.userId ? String(keyInfo.userId) : null;

    const saved = await this.credentialRepo.save(userId, {
      apiKey: apiKey.trim(),
      zoteroUserId: zoteroUserId ?? undefined,
      syncEnabled: true,
    });

    return {
      linked: true,
      userId,
      zoteroUserId: saved.zoteroUserId,
      username: keyInfo.username || null,
      maskedKey: maskApiKey(apiKey),
      permissions: keyInfo.access || null,
      syncEnabled: saved.syncEnabled,
      lastSyncedAt: saved.lastSyncedAt ? saved.lastSyncedAt.toISOString() : null,
      lastSyncVersion: saved.lastSyncVersion,
    };
  }

  /**
   * Returns current Zotero account linking status for a user.
   * If credentials exist, masks the API key (never exposes raw key).
   */
  async getStatus(userId: string): Promise<ZoteroAccountStatus> {
    if (!userId) {
      throw new ZoteroValidationError("User ID is required", 401);
    }

    const cred = await this.credentialRepo.get(userId);
    if (!cred || !cred.apiKey) {
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

    return {
      linked: true,
      userId,
      zoteroUserId: cred.zoteroUserId,
      username: null,
      maskedKey: maskApiKey(cred.apiKey),
      syncEnabled: cred.syncEnabled,
      lastSyncedAt: cred.lastSyncedAt ? cred.lastSyncedAt.toISOString() : null,
      lastSyncVersion: cred.lastSyncVersion,
    };
  }

  /**
   * Deletes a user's linked Zotero credentials.
   */
  async unlink(userId: string): Promise<boolean> {
    if (!userId) {
      throw new ZoteroValidationError("User ID is required", 401);
    }

    return this.credentialRepo.delete(userId);
  }

  /**
   * Returns configuration required by web-library for the user.
   */
  async getConfig(userId: string): Promise<ZoteroConfigResponse> {
    const status = await this.getStatus(userId);

    const webLibraryUrl = status.zoteroUserId
      ? `https://www.zotero.org/users/${status.zoteroUserId}/items`
      : "https://www.zotero.org/settings/keys";

    return {
      linked: status.linked,
      userId,
      zoteroUserId: status.zoteroUserId,
      proxyBaseUrl: `/api/zotero/proxy`,
      webLibraryUrl,
      syncEnabled: status.syncEnabled,
    };
  }

  /**
   * Helper to retrieve decrypted API key for internal server operations (proxy/sync).
   * Strictly internal: this must NEVER be sent in API replies.
   */
  async getInternalDecryptedKey(userId: string): Promise<{ apiKey: string; zoteroUserId: string | null } | null> {
    if (!userId) return null;
    const cred = await this.credentialRepo.get(userId);
    if (!cred || !cred.apiKey) return null;
    return {
      apiKey: cred.apiKey,
      zoteroUserId: cred.zoteroUserId,
    };
  }
}
