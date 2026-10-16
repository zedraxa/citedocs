# @citedocs/zotero-core

Comprehensive TypeScript engine for official **Zotero Web API v3** two-way synchronization, translation server integration, and CSL-JSON metadata transformation for CiteDocs.

---

## 1. Overview & Core Capabilities

`@citedocs/zotero-core` provides the bibliographic backbone for CiteDocs:
- **Typed Zotero Web API v3 Client (`ZoteroWebApiClient`):** Full support for user (`/users/{userId}`) and group (`/groups/{groupId}`) libraries, batched writes/deletes (max 50 objects), RFC 5988 Link header pagination, rate limiting (`Backoff` and `Retry-After`), and optimistic concurrency control (`If-Unmodified-Since-Version`).
- **Two-Way Incremental Sync Engine (`SyncEngine`):** Implements Zotero's documented sync protocol via lightweight version maps (`?format=versions&since=`), tombstone deletions (`/deleted?since=`), and automatic conflict resolution.
- **Strict Per-Student Data Isolation & Key Redaction:** Never returns or logs raw API keys. All errors, logs, and stack traces automatically redact API keys (`[REDACTED]`).
- **Pluggable Storage Abstraction (`SyncStore`):** Decoupled storage interface with an `InMemorySyncStore` for unit tests and a clear contract for Drizzle ORM per-user PostgreSQL persistence.
- **Translation Server Client (`TranslationClient`):** High-speed DOI, ISBN, PMID, and arXiv resolution via `zotero/translation-server`.
- **CSL-JSON Converter (`zoteroItemToCSL`):** Converts Zotero bibliographic items into Citation Style Language format for `citeproc-js`.

---

## 2. Per-User API Key & Data Isolation

In CiteDocs, **every student links their own personal `zotero.org` account**:
- API keys are stored encrypted at rest on the server (`zotero_credentials` table) using AES-256-GCM.
- When executing synchronization, each sync worker instantiates an isolated `ZoteroWebApiClient` and `SyncStore` scoped strictly to that student's user ID.
- **Zero API Key Leakage:** The client and error classes guarantee that personal API keys never leak into logs, exceptions, or error payloads:

```typescript
import { ZoteroWebApiClient, redactApiKey } from "@citedocs/zotero-core";

const client = new ZoteroWebApiClient({
  apiKey: studentApiKey, // encrypted at rest, passed in memory
  sleepFn: async (ms) => { /* injectable clock */ },
});

// Any error thrown by the client automatically redacts the key:
try {
  await client.getCurrentKey();
} catch (err) {
  console.error(err.message); // Contains "[REDACTED]", never the actual key!
}
```

---

## 3. Rate Limiting, Backoff & Retry-After

The Zotero Web API v3 enforces rate limits and temporary backoff requests via response headers:
1. **`Backoff: <seconds>` Header:** Can be returned on any HTTP response (including 200 OK). The client pauses for the requested duration before dispatching subsequent requests.
2. **`Retry-After: <seconds>` Header (HTTP 429 Too Many Requests / 503 Service Unavailable):** When rate limited or when upstream maintenance occurs, the client automatically backs off and retries up to `maxRetries` (default: 3).
3. **Injectable Sleep Clock (`sleepFn`):** For fast, 100% offline unit tests, inject a mock sleep function:

```typescript
const client = new ZoteroWebApiClient({
  apiKey: "secret",
  sleepFn: async (ms) => {
    // Vitest mock: resolves immediately without real clock delay
  },
});
```

---

## 4. Conflict Policy & Optimistic Concurrency (HTTP 412)

Zotero uses integer library versions for optimistic concurrency. When pushing local changes:
1. Every write and delete request includes `If-Unmodified-Since-Version: <lastLibraryVersion>` and a unique 32-character hexadecimal `Zotero-Write-Token`.
2. If the remote library was modified concurrently by another client (or web browser), Zotero responds with **HTTP 412 Precondition Failed**.
3. **Automatic Re-pull & Field-Wise Merge:**
   - The `SyncEngine` catches the 412 conflict and re-pulls the latest remote versions and modified items.
   - **Merge Rules:**
     - **Remote wins** on fields changed remotely.
     - **Local wins** on fields changed only locally.
     - **True conflicts** (both local and remote modified the same field to different values): remote wins and the conflict details (`itemKey`, `field`, `localValue`, `remoteValue`, `resolvedValue`) are exposed in `result.conflicts`.
   - The merged items are re-pushed with the updated library version.

```typescript
const result = await syncEngine.sync();

if (result.conflicts.length > 0) {
  console.log("Resolved conflicts during sync:", result.conflicts);
  // Example: [ { itemKey: 'ABC12345', field: 'title', localValue: 'My Draft', remoteValue: 'Published Title', resolvedValue: 'Published Title', resolution: 'remote-wins' } ]
}
```

---

## 5. Pluggable `SyncStore` Architecture

Storage is completely decoupled from sync networking via the `SyncStore` interface:

```typescript
export interface SyncStore {
  getLibraryVersion(libraryId: string): Promise<number>;
  setLibraryVersion(libraryId: string, version: number): Promise<void>;
  getLocalChanges(libraryId: string): Promise<LocalChanges>;
  markChangesSynced(
    libraryId: string,
    synced: { created?: Record<string, string>; updated?: string[]; deleted?: string[] },
    newVersion: number
  ): Promise<void>;
  upsertRemoteItems(libraryId: string, items: ZoteroItem[]): Promise<void>;
  deleteRemoteItems(libraryId: string, itemKeys: string[]): Promise<void>;
  getItem(libraryId: string, key: string): Promise<ZoteroItem | undefined>;
  getAllItems(libraryId: string): Promise<ZoteroItem[]>;
  getBaseItem?(libraryId: string, key: string): Promise<ZoteroItem | undefined>;
}
```

- `InMemorySyncStore`: Included reference implementation used for offline unit and acceptance tests.
- **Production Integration:** `apps/server` connects `SyncStore` to PostgreSQL via Drizzle ORM (`library_items`, `item_creators`, `tags`, `collections`), scoping every query to `owner_user_id`.

---

## 6. API Reference

### `ZoteroWebApiClient`
- `getCurrentKey(): Promise<KeyPermissions>`
- `getItems(target, options): Promise<ZoteroApiResponse<ZoteroItem[]>>`
- `getAllItems(target, options): Promise<{ items, lastModifiedVersion, totalResults }>` (paginates >100 items)
- `getItemVersions(target, options): Promise<ZoteroApiResponse<Record<string, number>>>`
- `getItemsByKeys(target, keys): Promise<ZoteroItem[]>` (batched in chunks of <= 50)
- `getDeleted(target, since): Promise<ZoteroApiResponse<ZoteroDeletedResponse>>`
- `createOrUpdateItems(target, items, options): Promise<ZoteroWriteResponse>` (batches of <= 50 with Write Token)
- `deleteItems(target, itemKeys, options): Promise<{ deletedKeys, lastModifiedVersion }>` (batches of <= 50)

### `SyncEngine`
- `sync(): Promise<SyncResult>`
- `getStatus(): SyncStatus` ("idle" | "pulling" | "pushing" | "conflict" | "error")
- `getLibraryVersion(): Promise<number>`

---

## 7. Testing

All tests run completely offline without hitting the real network using recorded JSON fixtures and injected fetch / sleep mock functions:

```bash
pnpm -C packages/zotero-core test
```
