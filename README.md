# CiteDocs

<p align="center">
  <strong>The open-source, Google Docs-grade collaborative word processor with native Zotero reference management and live Citation Style Language (CSL) formatting.</strong>
</p>

---

## 🎯 Overview

**CiteDocs** is built for students, researchers, and scientific writers who need the seamless real-time collaboration and user experience of **Google Docs**, paired directly with the complete reference management and PDF annotation extraction power of **Zotero**—running ubiquitously in any browser on any operating system (desktop, tablet, mobile).

> **Architectural Direction (ADR-001):** CiteDocs does not reinvent the wheel. Per [ADR-001: Integration Architecture](docs/ADR-001-integration.md), document editing is powered by **Collabora Online (CODE)** embedded via WOPI iframe + PostMessage, seamlessly integrated with the official **Zotero open-source suite** (`zotero/web-library`, `zotero/translation-server`, `citeproc-js`, `zotero/pdf-reader`, and native Zotero field codes). Purely web-based with zero client-side installation. TipTap (`packages/editor`) is maintained as a legacy component.

### ✨ Core Capabilities

- **Google Docs Parity:**
  - Rich-text editing with full typographical controls, semantic heading hierarchy, and reactive document outline.
  - Real-time multi-user collaboration with live colored cursors and presence via Yjs CRDT and Hocuspocus WebSocket server.
  - Suggesting mode (Track Changes) with non-destructive insertions/deletions and collaborative review cards.
  - Threaded inline comments with `@mentions` and resolution workflows.
  - Paged layout mode with simulated physical sheets (Letter / A4), margins, ruler, and print simulation.
  - Resizable interactive tables, captioned figures, KaTeX mathematical equations, and footnotes.
  - Progressive Web App (PWA) with full offline persistence (`y-indexeddb`).
- **Zotero Parity:**
  - Personal and group libraries, hierarchical collections, color-coded tags, and saved smart searches.
  - Magic identifier bar: add items instantly by **DOI**, **ISBN**, **PMID**, **arXiv ID**, or URL powered by `zotero/translation-server`.
  - Integrated PDF.js reader with text highlighting, rectangle area notes, and one-click **"Quote to Document"** with page citations.
  - Two-way synchronization with official `zotero.org` accounts using Web API v3 (`If-Modified-Since-Version` and optimistic concurrency).
  - Duplicate detection, merge tools, and automated Retraction Watch notifications.
- **CSL Citation Engine & DOCX Interoperability:**
  - Insert multi-cite clusters with page locators, prefixes, suffixes, and author suppression.
  - Dynamic, self-maintaining bibliography block automatically recomputed live as citations change.
  - Live style switcher supporting over 10,000+ CSL styles (APA 7th, IEEE, Chicago, Nature, Vancouver, MLA 9th, Harvard, ACM).
  - DOCX export embedding native `ADDIN ZOTERO_ITEM CSL_CITATION` field codes—fully recognized by Microsoft Word and LibreOffice with the Zotero desktop plugin!

---

## 🏗️ Repository Architecture

CiteDocs is organized as a high-performance TypeScript monorepo powered by `pnpm`:

```txt
citedocs/
├── apps/
│   ├── web/                    # Vite + React 19 Frontend SPA/PWA
│   └── server/                 # Fastify REST API & Hocuspocus Collaboration Server
├── packages/
│   ├── shared/                 # Universal types (Zotero, CSL, Doc) & Zod schemas
│   ├── csl-engine/             # citeproc-js wrapper & 10,000+ CSL style registry
│   ├── zotero-core/            # Translation-server client & 2-way sync engine
│   └── editor/                 # TipTap ProseMirror schema, citation & suggestion specs
├── docker-compose.yml          # Postgres, MinIO, translation-server, server, web
├── docs/
│   ├── SPEC.md                 # Complete Product Specification
│   ├── ARCHITECTURE.md         # Detailed System Architecture & Design
│   ├── ADR-001-integration.md  # Binding Integration Architecture (Collabora + Zotero)
│   └── research.md             # Technical Research Report
└── devir.md                    # Project Memory & Agent Handover Record
```

---

## 🚀 Quickstart

### Prerequisites

- **Node.js:** v22.x LTS (tested on Node v22.22.3)
- **pnpm:** v12.x or v11.x (`corepack enable && corepack prepare pnpm@12.11.2 --activate`)
- **Docker & Docker Compose** (for PostgreSQL, MinIO, and `zotero/translation-server`)

### 1. Installation

Clone the repository and install all workspace dependencies:

```bash
git clone https://github.com/zedraxa/citedocs.git
cd citedocs
pnpm install
```

### 2. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

### 3. Start Local Infrastructure

Launch PostgreSQL, MinIO object storage, and the Zotero translation microservice:

```bash
docker compose up -d postgres minio translation-server
```

### 4. Run Development Servers

Start both the Fastify/Hocuspocus backend and the Vite React frontend in parallel:

```bash
pnpm dev
```

- **Web Application:** `http://localhost:5173`
- **REST API:** `http://localhost:3000` (`http://localhost:3000/health`)
- **Hocuspocus WebSocket:** `ws://localhost:1234`
- **Zotero Translation Server:** `http://localhost:1969`
- **MinIO Console:** `http://localhost:9001` (login: `citedocs_minio` / `citedocs_minio_password`)

---

## 🧪 Testing, Linting & Build

```bash
# Run all functional tests across packages and apps with Vitest
pnpm test

# Run the same tests through each package (also uses shared timeouts)
pnpm -r test

# Run strict timing checks sequentially on an otherwise idle machine
pnpm test:perf

# Run TypeScript typechecks across the monorepo
pnpm typecheck

# Run ESLint across all packages and apps
pnpm lint

# Format codebase with Prettier
pnpm format

# Build all packages and applications for production
pnpm build
```

Tests use 60-second test/hook limits and one Vitest worker per invocation to
avoid CPU contention. CSL integration files warm citeproc once before tests;
normal runs retain all citation, bibliography, and editor assertions. The optional
`test:perf` command enables the original CSL <300 ms and editor <450 ms budgets
with `CITEDOCS_TEST_PERF=1`, using the median of five warm APA→IEEE switches.
It runs only the two timing cases, sequentially; hardware/load can still affect
these strict budgets. CI runs the functional suite, without relaxing timing limits.
The existing live translation-server test stays opt-in.

GitHub Actions uses Node 22, Corepack's pinned pnpm, a frozen lockfile install,
and lint → typecheck → build → test. No services or secrets are required.

---

## 📄 Documentation

- [Product Specification (`docs/SPEC.md`)](docs/SPEC.md)
- [System Architecture (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)
- [Binding Integration Architecture (`docs/ADR-001-integration.md`)](docs/ADR-001-integration.md)
- [Technical Research Report (`docs/research.md`)](docs/research.md)
- [Project Memory & Handover (`devir.md`)](devir.md)

---

## 📜 License

Licensed under the [GNU AGPL-3.0-or-later](LICENSE), required because CiteDocs bundles AGPL-licensed Zotero components (web-library, pdf-reader).  
*(Note: As analyzed in [ADR-001](docs/ADR-001-integration.md), relicensing CiteDocs to GNU AGPL-3.0 is recommended for complete legal compliance with integrated Zotero AGPL-3.0 components; pending final approval).*
