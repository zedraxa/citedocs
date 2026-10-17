# ONLYOFFICE Docs Community Edition & E2E Testing Guide

This document describes how to deploy CiteDocs using **ONLYOFFICE Docs Community Edition (AGPL v3)** without Collabora, and how to run the automated **Playwright End-to-End (E2E)** test suite for the complete student workflow.

---

## 1. Overview & Architecture

CiteDocs integrates ONLYOFFICE Docs Community Edition as a primary, native collaborative document editor with seamless Zotero citation support.

### Key Architectural Differences vs. Collabora:
- **Direct REST & JWT Lifecycle:** ONLYOFFICE uses standard HTTP callbacks (`status: 2` on save, `status: 6` on force save) and download tokens, eliminating the need for a separate WOPI translation layer and WOPI host container.
- **Signed Link Security:** Document download URLs (`/api/onlyoffice/files/:id?s=...`) and callback URLs (`/api/onlyoffice/callback/:id?s=...`) are protected with HMAC-SHA256 signatures with 4-hour expiration and ONLYOFFICE JWT verification.
- **Internal Docker Network Rewriting:** Callbacks with download URLs containing the internal Document Server host (`http://onlyoffice/...`) are automatically rewritten for container-to-container communication without hairpin NAT issues.
- **Zero-Collabora Footprint:** Running ONLYOFFICE eliminates the memory-heavy Collabora CODE container (`collabora/code`) and the standalone WOPI server (`wopi`), significantly reducing CPU, RAM, and storage overhead on production nodes.

---

## 2. Production Compose Variant (Without Collabora)

CiteDocs provides a standalone production Compose setup designed specifically for ONLYOFFICE Docs CE:
- **Compose configuration:** `deploy/docker-compose.prod.onlyoffice.yml`
- **Caddy reverse proxy configuration:** `deploy/Caddyfile.onlyoffice`

### Services in this Variant:
1. `postgres` (PostgreSQL 16 Alpine database)
2. `minio` (S3-compatible attachment and document storage)
3. `translation-server` (Zotero translation-server microservice for DOI/metadata resolution)
4. `server` (CiteDocs Fastify backend & Hocuspocus WebSocket server)
5. `web` (CiteDocs Vite + React 19 production build with Nginx)
6. `caddy` (Caddy 2 reverse proxy with automatic HTTPS and `/oo/*` path prefix routing)
7. `onlyoffice` (`onlyoffice/documentserver:latest`, AGPL v3 Community Edition)

### Environment Variables
Configure your `/opt/citedocs/.env` (mode 600) with the required values:

```bash
# General / Domain
PUBLIC_HOST=docs.your-domain.edu

# Database & Object Storage
POSTGRES_PASSWORD=your_secure_postgres_password
MINIO_ROOT_USER=citedocs_minio_admin
MINIO_ROOT_PASSWORD=your_secure_minio_password
ENCRYPTION_KEY=your_64_hex_character_encryption_key

# ONLYOFFICE Integration
ONLYOFFICE_JWT_SECRET=your_secure_onlyoffice_jwt_secret

# Optional Zotero OAuth (for automated 1-click student linking)
ZOTERO_OAUTH_CLIENT_KEY=
ZOTERO_OAUTH_CLIENT_SECRET=
```

> **Security Note:** Never commit `.env` files or print secret values in logs or terminal sessions.

### Starting the Production Stack

From the repository root on your production server:

```bash
# Build and start all services in detached mode
sudo docker compose -f deploy/docker-compose.prod.onlyoffice.yml up -d --build

# Verify that all containers are healthy
sudo docker compose -f deploy/docker-compose.prod.onlyoffice.yml ps
```

### Verifying Routing & Health
```bash
# Verify CiteDocs backend health
curl -f https://${PUBLIC_HOST}/health

# Verify ONLYOFFICE Docs API script is reachable via Caddy
curl -I https://${PUBLIC_HOST}/oo/web-apps/apps/api/documents/api.js
```

---

## 3. Playwright E2E Student Flow Test Suite

The Playwright test suite (`e2e/oo-student-flow.spec.ts`) verifies the end-to-end student user journey against any CiteDocs deployment.

### Scenarios Tested:
1. **Student Registration:** Signup at `/signup` with a fresh student account (auto-verified and logged in).
2. **My Documents Dashboard:** Navigation to `/documents`, verification of storage quota indicator and user profile.
3. **Document Creation & ONLYOFFICE Mount:**
   - Clicking "Yeni Belge" dropdown -> "Boş Word (.docx)".
   - Auto-redirect to `/editor?doc=<uuid>`.
   - Verification that ONLYOFFICE editor iframe and header navigation chrome are mounted.
4. **Zotero Integration Bar:**
   - Inspection of Zotero connection status (`oo-zotero-linked` or `oo-zotero-connect`).
   - Testing opening and closing of the API key modal.
5. **Add Reference by Identifier (DOI):**
   - Submitting a test DOI (`10.1103/PhysRev.47.777`) into `oo-add-input`.
   - Asserting feedback banner (`oo-notice`) appears with appropriate user guidance.
6. **Collaboration & Sharing:**
   - Navigating back to "Belgelerim".
   - Opening document share modal (`share-dialog`).
   - Sharing document with a collaborator as **Viewer** (`viewer` role, read-only).
   - Sharing document with a collaborator as **Editor** (`editor` role, read-write).
   - Verifying both collaborators appear with their respective role badges.

### Configuration via `BASE_URL`

The test runner reads `process.env.BASE_URL` (defaulting to `http://localhost:5173` if unset):

#### Running Against Production or Staging:
```bash
BASE_URL=https://docs.sifirdanbire.com.tr pnpm test:e2e
```

#### Running Against Local Development Stack:
```bash
# 1. In terminal A, start the local dev environment:
pnpm dev

# 2. In terminal B, run the E2E tests:
BASE_URL=http://localhost:5173 pnpm test:e2e
```

### Headed Mode & Debugging

To run tests with a visible browser window:
```bash
BASE_URL=https://docs.sifirdanbire.com.tr pnpm exec playwright test --headed
```

To view the detailed Playwright HTML test report:
```bash
pnpm exec playwright show-report
```

---

## 4. Test Summary & Monorepo Validation

Before any deployment or commit, ensure the full validation pipeline passes:

```bash
# Run unit and integration tests (45 test files across monorepo)
pnpm test

# Run TypeScript typecheck across all workspace packages
pnpm typecheck

# Run ESLint across workspace
pnpm lint

# Run monorepo build (all 10 packages & apps)
pnpm build

# Run Playwright E2E suite
BASE_URL=https://docs.sifirdanbire.com.tr pnpm test:e2e
```
