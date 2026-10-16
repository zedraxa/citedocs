# CiteDocs Server (`@citedocs/server`)

CiteDocs backend server powering the REST API, Drizzle ORM persistence layer, and Hocuspocus collaborative synchronization.

---

## 1. Drizzle ORM & Database Architecture

CiteDocs uses PostgreSQL 16 with **Drizzle ORM** (`drizzle-orm`) and `pg` connection pooling.

### Connection & Configuration
- **Configuration File:** `apps/server/drizzle.config.ts`
- **Schema Location:** `src/db/schema.ts`
- **SQL Migrations Folder:** `drizzle/`
- **Environment Variable:** `DATABASE_URL`
  - Default: `postgres://citedocs:citedocs_secret_password@localhost:5432/citedocs` (matches `docker-compose.yml`)

### NPM Scripts
- `pnpm db:generate`: Generates SQL migrations into `drizzle/` using Drizzle Kit.
- `pnpm db:migrate`: Executes pending SQL migrations programmatically via `src/db/migrate.ts`.

---

## 2. Multi-Tenant Model: Per-User Isolation & Ownership

CiteDocs strictly isolates data per individual student account:

1. **Row-Level Ownership on Every Entity:**
   Every document, library item, collection, tag, creator, and attachment table contains a non-nullable `owner_user_id` foreign key referencing `users.id` (with `ON DELETE CASCADE`).
   
2. **Repository Layer Enforcement (`src/repositories/`):**
   - All repository queries filter by `owner_user_id = currentUserId`.
   - Any attempt to access, mutate, or delete an entity belonging to another user throws an `OwnershipError` (HTTP 403 Forbidden).
   - Creation functions enforce `ownerUserId = currentUserId`, rejecting any client-side impersonation.

3. **Explicit Sharing Only (`document_shares`):**
   - Documents are private to the creator by default.
   - Collaboration is possible only when the document owner explicitly grants access in `document_shares` (`owner`, `editor`, `commenter`, `viewer`).
   - Libraries are never implicitly shared.

4. **Zotero Credentials Encrypted at Rest:**
   - Per-user Zotero API keys and OAuth tokens are stored in `zotero_credentials` using AES-256-GCM encryption (`src/db/crypto.ts`).
   - Raw credentials are never exposed through public client endpoints and are decrypted only when needed by internal synchronization workers.

---

## 3. Temporary Authentication Stub (Milestone 2)

During M2 development and initial client integration, authenticated student identity is established via the `X-User-Id` request header:

```http
GET /api/items HTTP/1.1
Host: localhost:3000
X-User-Id: student-uuid-123
```

- If `X-User-Id` is missing on protected endpoints, the server responds with `401 Unauthorized`.
- In **Milestone 3 (Production Authentication)**, this temporary header stub will be replaced with Argon2id passwords / OAuth 2.0 (Google, ORCID) and secure HTTP-only session cookies.

---

## 4. Endpoints

- `GET /health`: Healthcheck endpoint (public).
- `GET /api/csl/styles`: List available CSL styles with search support (public).
- `POST /api/zotero/translate`: DOI / ISBN / identifier resolution via translation-server, persisted to `ItemRepository` (auth required via `X-User-Id`).
- `POST /api/items/from-identifier`: REST alias to resolve and persist item by identifier into `ItemRepository` (auth required via `X-User-Id`).
- `POST /api/zotero/search`: Backward-compatible resolution endpoint (auth required via `X-User-Id`).
- `GET /api/items`: List library items owned by the authenticated user (`?itemType=...&q=...`).
- `POST /api/items`: Create a library item for the authenticated user.
- `GET /api/items/:id`: Get a specific library item (rejection with 403 if owned by another user).
- `PUT /api/items/:id`: Update a library item (rejection with 403 if owned by another user).
- `DELETE /api/items/:id`: Delete a library item (rejection with 403 if owned by another user).
