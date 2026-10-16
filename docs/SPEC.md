# CiteDocs: Product Specification Document (SPEC)

> **Version:** 2.0.0  
> **Status:** Standardized Product Specification (Binding)  
> **Target Audience:** Students, Academic Researchers, and the Open-Source Scientific Community  
> **Repository Topology:** TypeScript pnpm Monorepo  
> **Binding Architecture Direction:** See [ADR-001: Integration Architecture](ADR-001-integration.md) (Collabora Online CODE + Open-Source Zotero Suite)  
> **License:** [GNU AGPL-3.0-or-later](../LICENSE)

---

## 1. Executive Summary & Product Vision

Academic and scientific writing is notoriously fragmented. Researchers and students currently switch frictionally between:

1. A reference manager (e.g. Zotero desktop) to catalog papers, read PDFs, and extract highlights.
2. A word processor (e.g. Google Docs, LibreOffice Writer, or Microsoft Word) for drafting and collaborative editing.
3. Third-party plugins or browser extensions that are often fragile, corrupt document structures, or fail entirely on mobile devices, iPads, and Chromebooks.

**CiteDocs** resolves this fragmentation by building a unified, open-source, web-first platform. Guided by the core principle defined in **ADR-001**:
> **Do not reimplement Zotero. Do not reimplement a word processor.**  
> **Integrate real, battle-tested open-source components into a unified, zero-install, web-native platform.**

CiteDocs provides:
- **Collabora Online (CODE)** as the primary WYSIWYG document authoring engine, embedded via standard **WOPI (Web Application Open Platform Interface)** iframe and bidirectional `PostMessage` communication.
- **The official Zotero open-source suite**: `zotero/web-library` sidebar, `zotero/translation-server` identifier resolution, `citeproc-js` dynamic bibliography formatting across 10,000+ CSL styles, `zotero/pdf-reader` annotation extraction, and native Zotero field codes (`ADDIN ZOTERO_ITEM CSL_CITATION` and `ADDIN ZOTERO_BIBL`).
- **CiteDocs Unifying Cloud Fabric**: Multi-tenant identity, per-user data isolation, encrypted-at-rest Zotero account linking (AES-256-GCM), S3-compatible cloud storage with generous free quotas (≥5 GB per student), and explicit sharing models.
- **Legacy TipTap Status**: The bespoke TipTap v3 editor (`packages/editor`) is officially designated as **LEGACY** (frozen, do not extend, preserved for backwards compatibility and migration).

---

## 2. Document Engine: Collabora Online (CODE) via WOPI

### 2.1 Full Word Processor Parity & Standards Compliance

Rather than emulating typographical layout in a browser canvas, CiteDocs embeds **Collabora Online Development Edition (CODE)**, delivering authentic LibreOffice Writer / Microsoft Word engine fidelity directly inside any modern browser:

- **Strict Physical Pagination:** True A4 and US Letter paginated layouts with millimeter-accurate margins, visual page breaks, and print simulation.
- **Headers, Footers & Rulers:** Multi-page headers and footers with "different first page" support, page number fields ("Page X of Y"), and interactive margin rulers.
- **Footnotes & Endnotes:** Native footnote balancing and endnote sectioning at page bottoms, automatically incrementing and formatting without layout drift.
- **Advanced Tables:** Resizable table grids with arbitrary $M \times N$ dimensions, merged/split cells, cell background colors, borders, and column divider dragging.
- **Images & Captions:** Inline, floating, and text-wrapped images with auto-numbered figure captions navigable in the document structure.
- **Mathematical Formulas:** Built-in equation editing supporting LaTeX and MathML notation.
- **Native File Format Fidelity:** Native persistence and roundtrip fidelity with OpenDocument Text (`.odt`) and Microsoft Word OpenXML (`.docx`).

### 2.2 Track Changes (Suggesting Mode) & Threaded Comments

- **Suggesting Mode (Track Changes):**
  - Non-destructive inline insertions and deletions tagged with collaborator identity and timestamps.
  - Review cards in the margin with one-click **Accept** (`✓`) or **Reject** (`✗`), plus bulk resolution for authorized editors.
- **Threaded Comments:**
  - Anchor comments to any text selection or table element.
  - Multi-user threaded replies, `@mentions`, and resolution archives.

### 2.3 WOPI Host Architecture

Collabora Online communicates with the CiteDocs backend exclusively over the standard **WOPI (Web Application Open Platform Interface)** protocol:

- **CheckFileInfo (`GET /wopi/files/:id`):** Returns document metadata, file size, version hash, user permissions (`UserCanWrite`), and `PostMessageOrigin`.
- **GetFile (`GET /wopi/files/:id/contents`):** Streams the binary `.docx` or `.odt` document from S3/MinIO to Collabora.
- **PutFile (`POST /wopi/files/:id/contents`):** Persists updated document binaries received from Collabora to S3, with strict concurrency control via `X-WOPI-Lock`.
- **Lock Management (`POST /wopi/files/:id`):** Implements `LOCK`, `UNLOCK`, `REFRESH_LOCK`, and `GET_LOCK` operations with 30-minute lock leases.
- **Token Security:** Ephemeral HMAC-SHA256 signed access tokens (`access_token` query parameter) scoped to specific `fileId`, `userId`, and expiration timestamps.

### 2.4 Browser Iframe & Bidirectional PostMessage Bridge

- The document canvas is rendered in a sandboxed `<iframe>` pointing to the Collabora Online action URL.
- Authentication credentials are submitted securely via an automated form POST (`access_token` and `access_token_ttl`), keeping tokens out of the visible browser address bar.
- The CiteDocs React shell coordinates with Collabora over `window.postMessage`:
  - `Host_PostmessageReady`: Handshake notification when the host frame is ready.
  - `App_LoadingStatus` & `Document_Loaded`: State tracking for loading indicators.
  - `Action_Save`: Programmatic document save triggering.
  - `CallPythonScript`: UNO macro invocation for citation and bibliography operations.
  - `Send_UNO_Command`: Direct dispatch of LibreOffice commands (`.uno:InsertText`, `.uno:InsertField`).

### 2.5 Legacy Status of TipTap Editor (`packages/editor`)

The bespoke rich-text editor canvas located in `packages/editor` (TipTap v3 + ProseMirror + Yjs) is officially **LEGACY**:
- **Frozen:** No new features, nodes, marks, or extensions will be developed for `@citedocs/editor`.
- **Preserved:** Existing unit tests and packages remain in the monorepo to prevent build breaks and support legacy documents.
- **Migration Path:** Legacy documents will be converted to standard `.docx` files stored in S3 and rendered through the Collabora CODE pipeline (per ADR-001 §6).

---

## 3. Upstream Zotero Ecosystem Integration

CiteDocs embeds and orchestrates battle-tested open-source Zotero components without reimplementing bibliographic domain logic:

### 3.1 Zotero Web Library Sidebar (`zotero/web-library`)

- Embedded as a collapsible sidebar alongside the Collabora document canvas.
- Provides standard personal and group library views, hierarchical collections, color-coded tags, and saved smart searches.
- Communicates with the CiteDocs parent shell via `PostMessage` events (`CITEDOCS_ZOTERO_CITE`, `CITEDOCS_SET_CONFIG`), enabling zero-click citation insertion directly from the library browser into the active document.
- Proxies requests to `api.zotero.org` through CiteDocs' authenticated proxy service (`/api/zotero/proxy/*`), injecting decrypted user credentials server-side without exposing API keys to the browser.

### 3.2 Identifier Resolution via `zotero/translation-server`

- Integrated microservice running official Zotero publisher translators.
- **Magic Add Bar ("Add Item by Identifier"):**
  - Resolves standard academic identifiers: **DOI**, **ISBN**, **PMID**, **arXiv ID**, and URLs.
  - Dispatches queries to `zotero/translation-server` (`POST /search`), receiving normalized Zotero item JSON.
  - Automatically transforms payloads to CSL-JSON and persists items to the user's PostgreSQL library and S3 attachment storage.
  - Seamlessly queries Unpaywall to retrieve and attach open-access PDFs when available.

### 3.3 Dynamic CSL Engine (`citeproc-js`)

- Bundled in `@citedocs/csl-engine` and `@citedocs/collabora-cite` using the official `citeproc-js` JavaScript CSL 1.0.2 processor.
- Access to the complete `citation-style-language/styles` catalog (10,000+ academic styles: APA 7th, IEEE, Chicago, Nature, Science, Vancouver, MLA 9th, Harvard, ACM).
- Localized formatting via official CSL locale repositories (`en-US`, `tr-TR`, `de-DE`, `fr-FR`, etc.).
- Sub-millisecond formatting with pre-warmed global engine caching pools.

### 3.4 PDF Annotation & Quote Extraction (`zotero/pdf-reader`)

- Official Zotero PDF reader component integrated for reading attached research papers.
- Supports colored highlights, rectangular area notes, and sticky annotations.
- **"Quote to Document" Action:** Selecting highlighted text in a PDF allows one-click insertion into the active Collabora document as a formatted quotation with an attached in-text citation and page locator (e.g. `(Einstein et al., 1935, p. 777)`).

### 3.5 Two-Way Synchronization with `zotero.org`

- Optional linking of personal `zotero.org` accounts.
- Background sync worker executing two-way incremental synchronization using Zotero Web API v3 (`If-Modified-Since-Version` optimistic concurrency).
- Automatic conflict resolution with field-wise three-way merging.

---

## 4. In-Document Citations & Zotero Field-Code Compatibility

### 4.1 Native Field Code Interoperability

CiteDocs guarantees 100% fidelity with desktop word processors by utilizing standard Zotero field codes:

- **Microsoft Word OpenXML (`.docx`):**
  - In-Text Citation: `ADDIN ZOTERO_ITEM CSL_CITATION {json}`
  - Bibliography Block: `ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY`
  - Document Preferences: `ADDIN ZOTERO_PREF {json}`
- **LibreOffice Writer OpenDocument (`.odt` / Collabora CODE):**
  - In-Text Citation: `com.sun.star.text.ReferenceMark` with name `ZOTERO_ITEM CSL_CITATION {json} RND<suffix>`
  - Bibliography Block: `com.sun.star.text.Bookmark` with name `ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY RND<suffix>`
  - Document Preferences: `ZOTERO_PREF {json} RND<suffix>`

### 4.2 Seamless Desktop Roundtripping

Because CiteDocs uses official Zotero field code schemas:
1. A student drafts and cites a paper in CiteDocs in their browser.
2. The student exports the `.docx` file and emails it to a thesis advisor or co-author.
3. The advisor opens the document in Microsoft Word or LibreOffice on their desktop with the official Zotero plugin installed.
4. The desktop Zotero plugin **immediately recognizes all citations and the bibliography**. The advisor can add citations, refresh styles, or reorder references with zero conversion artifacts or broken fields.

### 4.3 Python UNO Integration Macro (`apps/collabora-scripts`)

To manipulate ReferenceMarks and Bookmarks inside Collabora Online without roundtripping through file storage:
- `zotero_collabora.py` executes inside Collabora Online via the `CallPythonScript` PostMessage command.
- Exposes native functions:
  - `insert_citation`: Inserts visible formatted citation text and wraps it in a typed `ZOTERO_ITEM` ReferenceMark.
  - `update_citation`: Updates the visible citation text and ReferenceMark payload in place.
  - `insert_bibliography`: Inserts formatted bibliography entries inside a `ZOTERO_BIBL` Bookmark.
  - `update_bibliography`: Refreshes bibliography entries when document citations change.
  - `get_document_fields`: Enumerates all citation and bibliography marks for document refresh.
  - `set_document_prefs`: Persists document-wide CSL style and locale preferences.

---

## 5. Multi-Tenant Architecture, Security & Storage Policy

### 5.1 Per-User Ownership and Strict Data Isolation (Required)

CiteDocs serves multiple independent students and research groups under a secure multi-tenant model:

- **Individual User Accounts:** Every user maintains their own account.
- **Mandatory Ownership Scoping:** Every database entity (`documents`, `library_items`, `collections`, `attachments`, `wopi_locks`) carries a non-null `owner_id`.
- **Server-Side Enforcement:** Every REST API route, WOPI request, and file access verifies `owner_id` or an explicit share grant. Automated cross-tenant isolation test suites run in CI to prove User A cannot access User B's data.
- **Per-User Zotero Credential Security:** Each user links their own Zotero account. Zotero API keys and OAuth tokens are encrypted at rest using **AES-256-GCM envelope encryption** with server-held keys. Plaintext keys are never returned to the client or written to logs.

### 5.2 Explicit Sharing Model

- Collaboration occurs exclusively through explicit `document_shares` entries created by the document owner (`Owner`, `Editor`, `Commenter`, `Viewer`).
- **No Implicit Library Leakage:** Sharing a document never grants access to the owner's personal reference library or Zotero credentials. Citations inside shared documents carry their embedded CSL-JSON item metadata self-sufficiently.

### 5.3 Generous Free Storage Policy (≥5 GB per Student)

CiteDocs is a volunteer, non-commercial platform dedicated to academic equity:
- **Free Cloud Storage:** Hosted instances provide **≥5 GB** of free S3 object storage per registered student for PDFs and documents.
- **No Paid Plans or Upsells:** CiteDocs contains no freemium tiers, no feature paywalls, and no advertisements.
- **Fair-Use Abuse Protection:** Generous soft limits (e.g. 10,000 documents per user) exist purely to prevent automated system abuse, raised upon request for academic needs.

### 5.4 Licensing: GNU AGPL-3.0

Because CiteDocs bundles and links AGPL-3.0 licensed components from the Zotero ecosystem (`zotero/web-library`, `zotero/pdf-reader`, `citeproc-js`), CiteDocs is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-or-later)**:
- Preserves the software in the academic commons.
- Ensures all network users under AGPL §13 have direct access to the corresponding source code.
- Decouples cleanly from Collabora Online's MPL-2.0 container boundary via standard WOPI REST and browser `PostMessage` protocols.

---

## 6. User Stories & Acceptance Criteria

### US-1: Document Authoring in Collabora via WOPI
- **As a** student writing a term paper,
- **I want to** open and edit a `.docx` document in my browser with full page formatting,
- **So that** I have true Word/LibreOffice typography without installing local desktop office suites.
- **Acceptance Criteria:**
  1. Opening a document loads Collabora Online CODE in an `<iframe>` via WOPI.
  2. WOPI `CheckFileInfo` and `GetFile` load the file from S3 storage.
  3. Edits are saved back to S3 storage via `PutFile` when saving.
  4. Reloading the page displays the persisted modifications.

### US-2: In-Text Citation Insertion with Native Zotero Field Codes
- **As an** academic researcher,
- **I want to** select references from my Zotero library sidebar and insert them into my document,
- **So that** citations match journal CSL formatting and embed standard Zotero field codes.
- **Acceptance Criteria:**
  1. Zotero web-library sidebar renders alongside the Collabora editor.
  2. Clicking "Cite" formats the reference using `citeproc-js` (e.g. APA `(Einstein et al., 1935)`).
  3. A `ZOTERO_ITEM CSL_CITATION` field is inserted into the Collabora document.
  4. The document bibliography automatically updates with the complete bibliographic entry.
  5. The exported `.docx` document opens in desktop Word / LibreOffice with working Zotero fields.

### US-3: Add Item by Identifier via Translation Server
- **As a** student with a paper DOI,
- **I want to** paste the DOI into the Add by Identifier bar,
- **So that** full bibliographic metadata and available PDFs are added to my library automatically.
- **Acceptance Criteria:**
  1. Submitting a DOI (e.g. `10.1038/s41586-021-03392-y`) queries `zotero/translation-server`.
  2. The resolved record is stored in the student's isolated database library.
  3. The item is immediately available for citation in the Collabora editor.
