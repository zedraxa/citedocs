import type { ZoteroItem } from "@citedocs/shared";

export type SyncStatus = "idle" | "pulling" | "pushing" | "conflict" | "error";

export interface SyncOptions {
  userId: string;
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface SyncResult {
  updatedItems: ZoteroItem[];
  deletedItemKeys: string[];
  newLibraryVersion: number;
}

export class ZoteroSyncEngine {
  private userId: string;
  private apiKey: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;
  private currentVersion: number;
  private status: SyncStatus = "idle";

  constructor(options: SyncOptions, initialVersion = 0) {
    this.userId = options.userId;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || "https://api.zotero.org";
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.currentVersion = initialVersion;
  }

  public getStatus(): SyncStatus {
    return this.status;
  }

  public getVersion(): number {
    return this.currentVersion;
  }

  /**
   * Generates standard authentication and conditional headers for requests.
   */
  public getHeaders(write = false): Record<string, string> {
    const headers: Record<string, string> = {
      "Zotero-API-Version": "3",
      "Zotero-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };

    if (this.currentVersion > 0) {
      if (write) {
        headers["If-Unmodified-Since-Version"] = String(this.currentVersion);
      } else {
        headers["If-Modified-Since-Version"] = String(this.currentVersion);
      }
    }

    return headers;
  }

  /**
   * Checks whether the remote library has modifications.
   * Returns true if remote is newer, false if unchanged (304).
   */
  async checkUpdates(): Promise<{ hasUpdates: boolean; serverVersion: number }> {
    this.status = "pulling";
    try {
      const response = await this.fetchFn(
        `${this.baseUrl}/users/${this.userId}/items?limit=1&format=versions`,
        {
          method: "GET",
          headers: this.getHeaders(false),
        },
      );

      if (response.status === 304) {
        this.status = "idle";
        return { hasUpdates: false, serverVersion: this.currentVersion };
      }

      const lastModified = response.headers.get("Last-Modified-Version");
      const serverVersion = lastModified ? parseInt(lastModified, 10) : this.currentVersion;

      this.status = "idle";
      return {
        hasUpdates: serverVersion > this.currentVersion,
        serverVersion,
      };
    } catch (err) {
      this.status = "error";
      throw err;
    }
  }

  /**
   * Evaluates conflicts when pushing local modifications.
   */
  public evaluateConflict(localItem: ZoteroItem, remoteItem: ZoteroItem): boolean {
    if (localItem.key !== remoteItem.key) return false;
    return remoteItem.version > localItem.version;
  }

  public updateLocalVersion(newVersion: number): void {
    if (newVersion > this.currentVersion) {
      this.currentVersion = newVersion;
    }
  }
}
