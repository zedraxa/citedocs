# CiteDocs: System Architecture & Technical Design (ARCHITECTURE)

> **Version:** 1.0.0  
> **Status:** Standardized Architecture Document  
> **Repository Topology:** TypeScript pnpm Monorepo

---

## 1. System Architecture Overview

CiteDocs is architected as a modular, decoupled, event-driven web application. It combines a high-performance client-side rich-text editor engine with an asynchronous real-time collaboration backend, a dedicated bibliographic citation processor, and a microservice-based translation and synchronization subsystem.

### 1.1 High-Level Component Topology

```mermaid
graph TD
    subgraph ClientLayer["Client Layer (Any Browser / Desktop / Tablet / Phone)"]
        UI["CiteDocs Web App (Vite + React 19)"]
        Editor["TipTap v3 + ProseMirror Canvas"]
        CRDT["Yjs Client (Doc State + UndoManager)"]
        PDFViewer["PDF.js Reader & Annotation Canvas"]
        CSLClient["Client CSL Cache & Citation Store"]
        PWA["PWA Service Worker & IndexedDB (y-indexeddb)"]

        UI --> Editor
        Editor <--> CRDT
        UI --> PDFViewer
        UI --> CSLClient
        CRDT <--> PWA
    end

    subgraph EdgeLayer["Edge / Ingress Layer"]
        Nginx["Reverse Proxy / Nginx / Caddy (SSL & Routing)"]
    end

    subgraph ServiceLayer["Service & Application Layer"]
        CollabServer["Hocuspocus Collab Server (Node.js/Fastify)"]
        APIServer["CiteDocs REST API Server (Fastify)"]
        TransServer["Zotero Translation Server (Docker: port 1969)"]
        SyncWorker["Zotero 2-Way Sync Engine (Background Worker)"]
    end

    subgraph StorageLayer["Data & Persistence Layer"]
        Postgres[("PostgreSQL 16 (Relational Metadata + Yjs Bytea)")]
        Redis[("Redis 7 (Pub/Sub + Collab Awareness + Task Queue)")]
        S3Storage[("S3-Compatible Storage (MinIO / AWS S3 / Cloudflare R2)")]
    end

    subgraph ExternalServices["External Ecosystem"]
        ZoteroOrg["zotero.org Web API v3"]
        AcademicAPIs["Crossref / DataCite / PubMed / arXiv / Unpaywall"]
        CSLRepo["Citation Style Language GitHub Repos"]
    end

    ClientLayer <==>|WebSocket WSS| Nginx
    ClientLayer <==>|HTTPS REST| Nginx
    Nginx <--> CollabServer
    Nginx <--> APIServer

    CollabServer <--> Postgres
    CollabServer <--> Redis
    APIServer <--> Postgres
    APIServer <--> S3Storage
    APIServer <--> TransServer
    SyncWorker <--> Postgres
    SyncWorker <--> ZoteroOrg
    SyncWorker <--> S3Storage
    TransServer <--> AcademicAPIs
    APIServer <--> CSLRepo
```

---

## 2. Technology Stack Selection & Rationale

### 2.1 Monorepo Architecture: `pnpm` + TypeScript

- **Tool:** `pnpm` workspaces + TypeScript 5.5+ project references.
- **Rationale:**
  - Strict dependency isolation prevents phantom dependencies.
  - Fast, space-efficient hardlink caching.
  - Clean separation of concern across reusable packages (`@citedocs/shared`, `@citedocs/csl-engine`, `@citedocs/zotero-core`, `@citedocs/editor`, `@citedocs/docx-exporter`, `@citedocs/database`).

### 2.2 Frontend Framework: Vite + React 19 vs. Next.js 15

- **Selected:** **Vite + React 19 SPA/PWA** (with TailwindCSS and Lucide Icons).
- **Deep Justification:**
  1. **Editor Runtimes are 100% Client-Side:** ProseMirror, TipTap, Yjs, PDF.js, and `citeproc-js` require direct browser DOM and canvas access. Next.js SSR provides no value for an authenticated document editing canvas and requires tedious `'use client'` workarounds and dynamic imports.
  2. **Superior PWA & Offline Experience:** Vite integrates cleanly with Workbox to provide instant PWA application shell caching and offline IndexedDB synchronization (`y-indexeddb`).
  3. **Instant Development Feedback:** esbuild/Vite HMR renders modifications in $<50\text{ ms}$, ensuring a frictionless developer experience when building intricate UI interactions.
  4. **Decoupled WebSocket Collab:** Collaborative document synchronization requires long-lived stateful WebSocket connections. Next.js serverless functions cannot host persistent WebSockets, necessitating an independent collaboration server regardless.
  5. **Resource Efficiency:** The static Vite build compiles to pure HTML/JS/CSS served via Nginx in $<10\text{ MB}$ RAM, drastically reducing hosting costs compared to running continuous Node.js SSR pods.

### 2.3 Editor Engine: TipTap v3 + ProseMirror + Yjs

- **Selected:** **TipTap v3 headless core (`@tiptap/*` ^3.x, current major; do not use v2)** + custom ProseMirror extensions + `y-prosemirror`.
- **Rationale:**
  - TipTap provides a developer-friendly modular abstraction over ProseMirror, which is the world's most battle-tested, robust rich-text schema engine (used by The New York Times, Atlassian Confluence, and Notion).
  - First-class Yjs collaboration extensions (`@tiptap/extension-collaboration` and `@tiptap/extension-collaboration-caret` (v3 name for the former collaboration-cursor)) provide sub-50ms deterministic CRDT merge semantics.

### 2.4 Collaboration Backend: Hocuspocus Server

- **Selected:** **Hocuspocus** (`@hocuspocus/server`) by the TipTap team.
- **Rationale:**
  - Built specifically for Yjs WebSocket synchronization with optimized binary protocol (`y-protocols`).
  - Lifecycle hooks (`onAuthenticate`, `onLoadDocument`, `onStoreDocument`, `onAwarenessUpdate`) enable seamless authentication, PostgreSQL persistence, and audit logging.
  - Native Redis adapter allows horizontal scaling across multiple load-balanced nodes.

### 2.5 Citation Engine: `citeproc-js` & CSL Repositories

- **Selected:** `citeproc-js` (compiled CSL 1.0.2 processor).
- **Rationale:**
  - Exact 100% compliance with official Citation Style Language specification.
  - Powers Zotero desktop and web; guarantees indistinguishable formatting results.
  - Efficiently supports incremental cluster updates (`processCitationCluster`) and batch bibliography generation (`makeBibliography`).

### 2.6 Database & Persistence: PostgreSQL 16 + Drizzle ORM

- **Selected:** PostgreSQL 16 with **Drizzle ORM**.
- **Rationale:**
  - PostgreSQL is the gold standard for relational integrity, JSONB semi-structured metadata, and binary bytea storage for Yjs document states.
  - Drizzle ORM provides zero-overhead, type-safe SQL queries with instant cold-start times and clean migration generation, outperforming heavier ORMs like Prisma.

### 2.7 Object Storage: S3-Compatible Storage

- **Selected:** S3 API protocol (MinIO for local development and self-hosting; AWS S3 or Cloudflare R2 for production).
- **Rationale:**
  - Vendor-neutral API for storing PDF attachments, document images, and full-text search indexes.
  - Presigned URLs allow direct browser uploads, removing file proxy overhead from application servers.

---

### 2.8 Authentication & Identity Providers

- **Local accounts:** email + Argon2id password.
- **Social / academic SSO (all free):** Google OAuth 2.0 and ORCID OAuth 2.0.
- **Zotero link (optional):** OAuth 1.0a or API key for two-way `zotero.org` sync; stored encrypted at rest.
- **No paid IdP or license server.** Session model: HTTP-only secure JWT (or opaque session) cookies with tenant isolation.

### Multi-Tenant Model: Per-User Ownership & Isolation (required)

- **Tenant = individual user.** Every student has their own account; every `documents`, `library_items`, `collections`, `attachments`, `annotations`, and `zotero_links` row carries a non-null `owner_id`.
- **Per-user Zotero linking:** each user links their own `zotero.org` account; the OAuth token / API key is stored only in `zotero_links`, encrypted at rest (AES-256-GCM envelope encryption with a server/KMS key), decrypted only inside the sync worker, never sent to the client.
- **Enforcement on every request:** Fastify auth middleware resolves `userId` from the session; all repositories scope queries by `owner_id` or a `document_shares` grant (backed by Postgres row-level security policies). Hocuspocus `onAuthenticate` verifies ownership or an explicit share before loading a Yjs document. S3/MinIO objects use per-user key prefixes and are served only through short-lived presigned URLs after the same check.
- **Sharing is explicit:** collaboration is possible only through `document_shares` rows created by the owner (roles Owner/Editor/Commenter/Viewer). Libraries are never implicitly shared.
- **Tests:** a cross-tenant isolation test suite (user A vs user B on REST, WebSocket, and file endpoints) is part of CI and must stay green.


### 2.9 Free-Tier Storage Policy

- Default hosted quotas: ≥5 GB PDF/object storage per user; soft caps on document/library counts only for abuse prevention.
- Self-hosted Docker deployments set their own caps (or none). Object storage is MinIO locally and S3/R2 in the cheap AWS blueprint (§7).

## 3. Monorepo Package Topology

```txt
citedocs/
├── apps/
│   ├── web/                    # Vite + React 19 Frontend SPA & PWA
│   │   ├── src/
│   │   │   ├── components/     # UI Components (Toolbar, Outline, PDF, Library)
│   │   │   ├── hooks/          # React hooks (useCollab, useCitation, useZotero)
│   │   │   ├── stores/         # State management (Zustand)
│   │   │   └── App.tsx
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── server/                 # Fastify REST API & Hocuspocus Collab Server
│       ├── src/
│       │   ├── collab/         # Hocuspocus server configuration & hooks
│       │   ├── routes/         # REST API routes (auth, documents, zotero, csl)
│       │   ├── services/       # Business logic (sync, translation proxy, citations)
│       │   └── index.ts
│       └── package.json
├── packages/
│   ├── shared/                 # Universal types, DTOs, Zod validation schemas
│   │   ├── src/
│   │   │   ├── types/          # Document, User, Citation, Zotero types
│   │   │   └── schemas/        # Zod validation schemas
│   │   └── package.json
│   ├── csl-engine/             # citeproc-js wrapper & CSL style indexer
│   │   ├── src/
│   │   │   ├── engine.ts       # CSL Engine wrapper
│   │   │   ├── sys.ts          # citeproc sys interface implementation
│   │   │   └── styles.ts       # Style registry, loader & search
│   │   └── package.json
│   ├── zotero-core/            # Zotero API v3 client & translation-server client
│   │   ├── src/
│   │   │   ├── api.ts          # Zotero Web API v3 client
│   │   │   ├── sync.ts         # 2-way sync engine & state machine
│   │   │   ├── translation.ts  # translation-server HTTP client
│   │   │   └── csl-converter.ts# Zotero Item -> CSL-JSON converter
│   │   └── package.json
│   ├── editor/                 # TipTap extensions, schema & UI bindings
│   │   ├── src/
│   │   │   ├── extensions/     # Citation, Footnote, Suggestion, Comments, Math
│   │   │   ├── layout/         # Paged layout & print styling
│   │   │   └── schema.ts       # ProseMirror schema definition
│   │   └── package.json
│   ├── docx-exporter/          # DOCX generation with native Zotero field codes
│   │   ├── src/
│   │   │   ├── exporter.ts     # TipTap -> DOCX with ADDIN ZOTERO_ITEM
│   │   │   └── importer.ts     # DOCX -> TipTap with field code extraction
│   │   └── package.json
│   └── database/               # PostgreSQL schema & Drizzle ORM client
│       ├── src/
│       │   ├── schema/         # Database table definitions
│       │   └── client.ts       # Drizzle connection client
│       └── package.json
├── docker/                     # Docker Compose configurations
├── docs/                       # Specifications, research, architecture
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

---

## 4. Database Schema & Data Modeling

The relational schema is implemented in PostgreSQL via Drizzle ORM:

```mermaid
erDiagram
    USERS ||--o{ DOCUMENTS : owns
    USERS ||--o{ LIBRARIES : owns
    USERS ||--o{ SESSIONS : has

    DOCUMENTS ||--o{ DOCUMENT_VERSIONS : tracks
    DOCUMENTS ||--o{ COMMENTS : contains
    DOCUMENTS ||--o{ SUGGESTIONS : contains

    LIBRARIES ||--o{ COLLECTIONS : organizes
    LIBRARIES ||--o{ ITEMS : stores
    LIBRARIES ||--o{ TAGS : categorizes

    ITEMS ||--o{ ITEM_CREATORS : has
    ITEMS ||--o{ ATTACHMENTS : holds
    ITEMS ||--o{ NOTES : attaches
    ITEMS ||--o{ ITEM_TAGS : labeled_by
    TAGS ||--o{ ITEM_TAGS : labels

    ATTACHMENTS ||--o{ ANNOTATIONS : highlights

    USERS {
        uuid id PK
        string email UK
        string password_hash
        string display_name
        string avatar_url
        timestamp created_at
    }

    DOCUMENTS {
        uuid id PK
        uuid owner_id FK
        string title
        bytea yjs_state
        string csl_style_id
        string csl_locale
        jsonb preferences
        timestamp updated_at
    }

    ITEMS {
        uuid id PK
        uuid library_id FK
        string zotero_key UK
        integer version
        string item_type
        jsonb metadata
        timestamp date_added
        timestamp date_modified
    }

    ATTACHMENTS {
        uuid id PK
        uuid item_id FK
        string content_type
        string file_path
        integer file_size
        string md5_hash
    }

    ANNOTATIONS {
        uuid id PK
        uuid attachment_id FK
        string type
        jsonb coordinates
        string color
        text comment
        text extracted_text
        integer page_number
    }
```

---

## 5. Key Workflows & Data Pipelines

### 5.1 Real-Time Citation Processing Pipeline

When a user inserts, edits, or reorders a citation, or changes the document's CSL style:

```mermaid
sequenceDiagram
    autonumber
    actor User as User in Editor
    participant Node as TipTap CitationNode
    participant Engine as CSL Engine (@citedocs/csl-engine)
    participant Registry as CSL Styles Registry
    participant Doc as Yjs Document

    User->>Node: Insert Citation (Cluster of 1..N Item IDs + Locators)
    Node->>Doc: Apply Transaction (Insert Citation Atom Node)
    Doc->>Engine: OnDocumentChange: Harvest Citation Clusters
    alt Style Changed
        User->>Registry: Select New CSL Style (e.g. IEEE -> APA 7th)
        Registry-->>Engine: Load CSL XML & Locales
        Engine->>Engine: Re-instantiate CSL.Engine
    end
    Engine->>Engine: engine.updateItems(allReferencedItemIds)
    loop For each citation cluster in order
        Engine->>Engine: engine.processCitationCluster(cluster, pre, post)
    end
    Engine-->>Node: Batch Update Formatted HTML Strings
    Engine->>Doc: engine.makeBibliography() -> Update Bibliography Block
    Node-->>User: Instant Visual Update (<250ms)
```

### 5.2 Zotero Two-Way Sync State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> PullCheck: Scheduled Poll / Manual Trigger
    PullCheck --> FetchingUpdates: Server Version > Local Version
    PullCheck --> Idle: 304 Not Modified
    FetchingUpdates --> ApplyLocalDB: Download Batches of 50 Items
    ApplyLocalDB --> SyncAttachments: Check for New/Modified PDF Attachments
    SyncAttachments --> Idle: Pull Complete

    Idle --> PushQueue: User Adds/Edits Item Locally
    PushQueue --> PushExecute: Send Batch POST with If-Unmodified-Since-Version
    PushExecute --> UpdateLocalVersion: 200 OK (Server Accepted)
    PushExecute --> ConflictResolution: 412 Precondition Failed
    ConflictResolution --> MergePrompt: Interactive or 3-Way Merge
    MergePrompt --> PushExecute: Retry with Resolved Data
    UpdateLocalVersion --> Idle
```

### 5.3 DOCX Export with Native Zotero Field Codes

1. **Traversal:** The exporter iterates through the ProseMirror document JSON structure.
2. **Text & Styling:** Headings, paragraphs, bold/italic, lists, and tables map to standard OpenXML WordprocessingML elements (`w:p`, `w:r`, `w:tbl`, `w:rPr`).
3. **Citation Conversion:**
   - Each TipTap `citation` node is converted to a complex field:
     - `<w:fldChar w:fldCharType="begin"/>`
     - `<w:instrText> ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"...","citationItems":[...],"properties":{"formattedCitation":"..."}} </w:instrText>`
     - `<w:fldChar w:fldCharType="separate"/>`
     - `<w:r><w:t>Formatted Citation Text</w:t></w:r>`
     - `<w:fldChar w:fldCharType="end"/>`
4. **Bibliography Conversion:**
   - The bibliography node maps to:
     - `<w:fldChar w:fldCharType="begin"/>`
     - `<w:instrText> ADDIN ZOTERO_BIBL {"custom":[]} CSL_BIBLIOGRAPHY </w:instrText>`
     - `<w:fldChar w:fldCharType="separate"/>`
     - Output of formatted bibliography paragraphs.
     - `<w:fldChar w:fldCharType="end"/>`
5. **Output Packaging:** Bundled via `jszip` into a valid `.docx` archive.

---

## 6. Milestone Plan & Autonomous Agent Roadmap

The project is structured into 7 sequential milestones (M0 through M6), designed for parallel execution by specialized coding agents:

```mermaid
gantt
    title CiteDocs Development Roadmap
    dateFormat  YYYY-MM-DD
    section Milestones
    M0: Monorepo Scaffold & Infrastructure :done, m0, 2026-10-16, 2026-10-18
    M1: Core Editor & Collaborative Foundation :active, m1, 2026-10-18, 2026-10-25
    M2: Zotero Data Layer & Translation Engine :m2, 2026-10-25, 2026-11-01
    M3: CSL Citation Engine & Live Bibliography :m3, 2026-11-01, 2026-11-08
    M4: Google Docs Parity (Suggesting, Comments, Outline, Paged Layout) :m4, 2026-11-08, 2026-11-15
    M5: PDF.js Reader & Annotation Extraction :m5, 2026-11-15, 2026-11-22
    M6: Zotero 2-Way Sync & DOCX Native Field Interoperability :m6, 2026-11-22, 2026-11-29
```

### Detailed Agent Work Breakdown

#### Milestone 0: Monorepo Scaffold & Core Infrastructure (Current)

- **Goal:** Monorepo configuration, TypeScript compilation, linting, tests, CI/CD workflow, and Docker environment.
- **Agent Task M0.1:** Setup `pnpm-workspace.yaml`, `tsconfig.base.json`, and root scripts.
- **Agent Task M0.2:** Initialize `@citedocs/shared`, `@citedocs/csl-engine`, `@citedocs/zotero-core`, `@citedocs/editor`.
- **Agent Task M0.3:** Scaffold `apps/web` (Vite + React) and `apps/server` (Fastify + Hocuspocus).
- **Agent Task M0.4:** Configure `docker-compose.yml` (Postgres, MinIO, translation-server, Hocuspocus).
- **Agent Task M0.5:** Setup Vitest workspace & GitHub Actions CI workflow.
- **Acceptance Tests:** `pnpm build`, `pnpm test`, `pnpm lint` pass with 100% success.

#### Milestone 1: Editor Canvas & Collaborative Foundation

- **Goal:** Real-time multi-user rich text editor with presence cursors.
- **Agent Tasks:**
  - Implement TipTap base schema (Paragraph, Heading 1-6, Lists, Blockquote, CodeBlock).
  - Configure Hocuspocus WebSocket connection with Yjs awareness.
  - Render live collaborator cursors and selection bounding boxes.
- **Acceptance Tests:** Two browser tabs reflect simultaneous typing with $<50\text{ ms}$ latency; cursors display distinct user names and colors.

#### Milestone 2: Zotero Core Data Modeling & Translation Server Client

- **Goal:** Local bibliographic library database with magic identifier lookups.
- **Agent Tasks:**
  - Drizzle PostgreSQL schema for items, collections, tags, creators, and attachments.
  - HTTP client for `zotero/translation-server` (`/search`, `/web`, `/import`, `/export`).
  - "Add Item by Identifier" UI component supporting DOI, ISBN, PMID, arXiv ID.
- **Acceptance Tests:** Submitting DOI `10.1038/s41586-021-03392-y` stores complete bibliographic metadata in PostgreSQL.

#### Milestone 3: Dynamic CSL Engine & Live In-Document Bibliography

- **Goal:** Real-time CSL citations in editor and automatic bibliography recomputation.
- **Agent Tasks:**
  - Implement `citeproc-js` wrapper in `@citedocs/csl-engine`.
  - Create TipTap `CitationNode` atom extension.
  - Implement quick citation search bar (`Ctrl+Shift+P`).
  - Index and lazy-load 10,000+ CSL styles and locales.
  - Build dynamic self-updating `BibliographyNode`.
- **Acceptance Tests:** Inserting citation clusters renders correct author-date or numeric citation; switching style from APA 7th to IEEE updates all in-text citations and bibliography within $<300\text{ ms}$.

#### Milestone 4: Google Docs Feature Parity Suite

- **Goal:** Document outline, suggesting mode (track changes), threaded comments, and paged layout.
- **Agent Tasks:**
  - Suggesting mode mark extension (`suggestion-insert`, `suggestion-delete`) with review cards.
  - Threaded comments extension with anchored text spans and sidebar drawer.
  - Reactive document outline sidebar with auto-scrolling.
  - Paged print layout with configurable margins, ruler, and visual page breaks.
- **Acceptance Tests:** Suggestions can be accepted/rejected collaboratively; comments can be resolved/reopened; print view matches physical page setup.

#### Milestone 5: Integrated PDF.js Reader & Annotation Extraction

- **Goal:** In-browser PDF reading, highlighting, and quote-to-document extraction.
- **Agent Tasks:**
  - Integrate `pdfjs-dist` viewer canvas and text layer.
  - Implement colored highlights and rectangle area annotations.
  - "Insert Quote into Doc" feature inserting blockquote + linked page citation.
- **Acceptance Tests:** Highlighting text in PDF and clicking "Quote to Doc" inserts text into active document with page locator citation.

#### Milestone 6: Two-Way zotero.org Sync & DOCX Native Field Codes

- **Goal:** Cloud synchronization with Zotero accounts and Word-compatible export.
- **Agent Tasks:**
  - Implement Zotero Web API v3 incremental sync with `If-Modified-Since-Version`.
  - Build `@citedocs/docx-exporter` serializing `ADDIN ZOTERO_ITEM CSL_CITATION`.
  - Support importing `.docx` with existing Zotero field codes.
- **Acceptance Tests:** Opening exported `.docx` in Microsoft Word with Zotero plugin allows clicking "Refresh" with zero errors.

---

## 7. Self-Hosting & Deployment Architecture

CiteDocs ships as free open-source software with **no paywalls**. Operators may self-host for $0 (own hardware) or run a low-cost public instance; agents must never deploy or spend money without an explicit human ask.

### 7.1 Single-Server Self-Hosting (Docker Compose)

CiteDocs is fully containerized for one-click self-hosting on any VPS (DigitalOcean, Hetzner, Linode, or home server):

```yaml
# docker-compose.yml excerpt
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: citedocs
      POSTGRES_USER: citedocs
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    volumes:
      - miniodata:/data

  translation-server:
    image: zotero/translation-server:latest
    restart: always

  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    environment:
      DATABASE_URL: postgres://citedocs:${DB_PASSWORD}@postgres:5432/citedocs
      TRANSLATION_SERVER_URL: http://translation-server:1969
      S3_ENDPOINT: http://minio:9000
    depends_on:
      - postgres
      - translation-server

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - server
```

**Total Hardware Footprint:** $<1\text{ GB}$ RAM, 1 vCPU, runs comfortably on a $5/month cloud VPS.

### 7.2 Low-Cost AWS Production Blueprint ($15 - $25 / month)

- **Frontend:** Cloudflare Pages or AWS S3 + CloudFront CDN ($0.50/mo).
- **Backend API & Collab:** AWS Lightsail Container Service ($7/mo) or single ECS Fargate Spot task.
- **Database:** Managed Postgres on Supabase Free Tier / Neon Serverless ($0–$5/mo) or Lightsail Database.
- **Storage:** AWS S3 Standard with Infrequent Access or Cloudflare R2 ($1/mo for 100GB with zero egress fees).
- **Translation Service:** Container running alongside server in Lightsail cluster.
