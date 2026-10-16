# CiteDocs: Product Specification Document (SPEC)

> **Version:** 1.0.0  
> **Target Audience:** Yusuf (Student & Academic Researcher in Scientific Writing) and the Open-Source Academic Community  
> **Status:** Approved for Implementation  
> **Project Goal:** A ubiquitous web application functioning seamlessly in any modern browser across any OS (desktop, tablet, mobile), delivering complete Google Docs editor parity fused natively with the entire Zotero reference management capability suite and real-time CSL citation rendering.

---

## 1. Executive Summary & Product Vision

Academic and scientific writing is notoriously fragmented. Researchers currently switch frictionally between:

1. A reference manager (e.g. Zotero desktop) to catalog papers, read PDFs, and extract highlights.
2. A word processor (e.g. Google Docs or Microsoft Word) for drafting and collaborative editing.
3. Third-party plugins or browser extensions that are often buggy, break document structures, or fail on mobile devices and tablets.

**CiteDocs** resolves this fragmentation by building a unified, open-source, web-first application. It offers an exact Google Docs writing and collaboration experience, backed by native Zotero data models, an integrated PDF.js reader with annotation extraction, live `citeproc-js` dynamic bibliography generation across 10,000+ CSL styles, and two-way synchronization with official `zotero.org` accounts.

---

## 2. Editor Parity with Google Docs

### 2.1 Rich Text & Typography

- **Font Family & Hierarchy:** Full support for serif (Times New Roman, Merriweather, Georgia), sans-serif (Arial, Roboto, Inter), and monospaced fonts (JetBrains Mono, Courier New). Custom web font loading.
- **Inline Formatting:** Bold, Italic, Underline, Strikethrough, Subscript, Superscript, Code span, Text color (hex picker + theme palette), Text highlight color.
- **Paragraph Formatting:**
  - Alignments: Left, Center, Right, Justified.
  - Line Spacing: Single (1.0), 1.15, 1.5, Double (2.0), Custom line spacing (0.5 to 5.0).
  - Paragraph Spacing: Add/Remove space before paragraph, Add/Remove space after paragraph.
  - Indentation: Left indent, Right indent, First line indent, Hanging indent (essential for bibliographies).
  - Clear formatting (`Ctrl+\` or toolbar button).

### 2.2 Headings & Document Outline

- **Heading Styles:** Title, Subtitle, Heading 1 through Heading 6 with customizable semantic styling.
- **Reactive Document Outline:**
  - Left sidebar drawer automatically parsing document heading hierarchy.
  - Real-time sync with active viewport: highlights current section as user scrolls.
  - Click-to-navigate with smooth scrolling.
  - Collapsible/expandable outline nodes.
  - Reorder sections by dragging heading nodes in outline.

### 2.3 Tables

- **Grid Operations:** Insert table with arbitrary $M \times N$ dimensions via interactive visual picker.
- **Row & Column Controls:** Insert row above/below, insert column left/right, delete row/column.
- **Cell Management:** Merge selected cells, split cells, customize cell background color, cell vertical alignment (top, middle, bottom), customizable border widths and colors.
- **Interactive Resizing:** Draggable column dividers with pixel-accurate constraints.

### 2.4 Images & Media

- **Insertion Channels:** File upload, drag-and-drop directly onto editor canvas, paste from clipboard, or URL embedding.
- **Image Properties:**
  - Resizing: Interactive corner and edge drag handles preserving aspect ratio (or freeform with Shift toggle).
  - Alignment: Inline with text, Wrap text (left/right float), Break text (block display).
  - Captions: Integrated caption node with auto-numbering ("Figure 1: ...") navigable in document outline.
  - Storage: Optimized upload to S3/MinIO bucket with automatic WebP thumbnail generation.

### 2.5 Suggesting Mode (Track Changes)

- **Editor Modes:**
  - **Editing Mode:** Direct modifications apply to the document.
  - **Suggesting Mode:** Changes are tracked non-destructively:
    - **Insertions:** Rendered with green text and underline, annotated with author tag and timestamp.
    - **Deletions:** Rendered with red text and strikethrough rather than removal, annotated with author tag and timestamp.
    - **Replacements:** Atomic deletion of old text paired with insertion of proposed text.
  - **Viewing Mode:** Read-only preview showing final state without suggestions or comments.
- **Review UI:**
  - Floating cards alongside suggestions in the right gutter.
  - One-click **Accept** (`✓`) or **Reject** (`✗`).
  - Bulk actions: "Accept All Suggestions" and "Reject All Suggestions" for authorized editors.

### 2.6 Threaded Comments

- **Anchor Mechanics:** Users can select any text range and trigger `Add Comment` (`Ctrl+Alt+M`).
- **Thread Structure:** Initial comment message followed by nested replies with author avatar, name, and relative timestamp.
- **Mentions:** Typing `@username` prompts user autocomplete and notifies mentioned collaborators.
- **Lifecycle:** Active comment -> Resolve comment (moves to collapsible Comment History archive) -> Reopen comment if needed.
- **Canvas Alignment:** Active comment card scrolls into view and aligns vertically with the highlighted text anchor.

### 2.7 Version History & Revisions

- **Automated Checkpoints:** Continuous incremental Yjs state saves with periodic named checkpoints (every 10 minutes of active editing or upon major events).
- **Named Revisions:** Ability to label checkpoints (e.g., "Draft 1 submitted to Advisor", "Pre-peer review").
- **Visual Diffing:** Side-by-side or inline view showing additions (green) and deletions (red) between any two arbitrary revisions.
- **Restore:** Single-click rollback to any historical revision with audit trail logging.

### 2.8 Real-Time Multi-User Collaboration & Presence

- **CRDT Concurrency:** Sub-50ms peer-to-peer sync via Yjs CRDT over WebSocket connections (Hocuspocus).
- **Presence & Awareness:**
  - Live collaborative carets displaying user name, assigned distinct color, and avatar flag.
  - Live selection highlights showing active text selection of remote peers.
  - Online collaborators list in top right header with ping status.
- **Sharing & Granular Permissions:**
  - Document access tiers: `Owner`, `Editor` (can edit, comment, suggest), `Commenter` (can only comment and suggest), `Viewer` (read-only).
  - Public link sharing with password protection and expiration options.

### 2.9 Find & Replace

- Full-featured search modal (`Ctrl+H` / `Ctrl+F`):
  - Match case toggle (`Aa`).
  - Match whole word toggle (`\b`).
  - Regular Expression toggle (`.*`).
- Real-time match counter ("3 of 42 matches") with highlighted canvas matches.
- Next / Previous navigation buttons (`Enter` / `Shift+Enter`).
- Replace single instance or "Replace All" with atomic undo support.

### 2.10 Word Count & Academic Analytics

- Live telemetry bar and detailed modal (`Ctrl+Shift+C`):
  - Word count.
  - Character count (with spaces and without spaces).
  - Paragraph count.
  - Estimated page count (standard 250 words/page or physical layout calculation).
  - Reading time and speaking time.
  - Flesch-Kincaid Reading Ease and Grade Level score.
  - Citation density metric (citations per 1,000 words).

### 2.11 Page Layout & Print Simulation

- **Print Layout View:** Toggle between seamless infinite scroll mode and paged layout mode:
  - Simulated physical pages (US Letter: $8.5 \times 11\text{ in}$ or ISO A4: $210 \times 297\text{ mm}$).
  - Visual page breaks with shadow boundaries.
  - Configurable margins: Normal (1 inch / 25.4 mm), Narrow (0.5 inch), Wide (2 inch), Custom.
  - Interactive horizontal ruler with margin drag stops and tab stops.
  - Header and Footer zones with separate first page option and automatic page numbering ("Page X of Y").
- **Print Preview & Print:** Standard `Ctrl+P` outputs CSS `@media print` rules matching exact layout settings.

### 2.12 Footnotes & Endnotes

- Insert footnote (`Ctrl+Alt+F`): Generates auto-incrementing superscript reference number in text.
- In paged view, footnotes render at the bottom of the corresponding page separated by a horizontal rule.
- In infinite view, footnotes render in an expandable bottom drawer.

### 2.13 Mathematical Equations (LaTeX / KaTeX)

- **Inline Math:** Triggered via `$formula$` or toolbar button, rendering live inline typography.
- **Display Math:** Triggered via `$$formula$$` or toolbar button, centered block equation.
- **Visual Math Editor Modal:** Live KaTeX preview, quick symbol palette (Greek letters, operators, fractions, integrals, matrices), and raw LaTeX source editing.

### 2.14 Offline Editing & Progressive Web App (PWA)

- Service Worker cache ensuring full offline boot capability on desktop, tablet, and mobile browsers.
- Local IndexedDB document cache via `y-indexeddb`. Edits performed while disconnected persist locally and synchronize automatically upon reconnection with zero data loss.
- Offline status indicator badge ("Offline - saving locally").

### 2.15 Import & Export Parity

- **Supported Import Formats:**
  - Microsoft Word (`.docx`): Converts headings, tables, styles, images, and extracts existing Zotero field codes.
  - OpenDocument Text (`.odt`): Full structure parsing.
  - Markdown (`.md`): Extended CommonMark with table and math syntax.
  - Plain text (`.txt`): Raw text import.
- **Supported Export Formats:**
  - Microsoft Word (`.docx`): Rich styling, images, tables, plus native `ADDIN ZOTERO_ITEM CSL_CITATION` field codes!
  - PDF (`.pdf`): Pixel-perfect export using browser print engine or server-side Chromium.
  - Markdown (`.md`): Clean Markdown with CSL citation keys (e.g., `[@doe2023]`).
  - HTML (`.html`): Self-contained web document with embedded CSS.
  - Plain text (`.txt`).

### 2.16 Mobile & Tablet Responsiveness

- Responsive layout adapting across smartphone (<640px), tablet (640px–1024px), and desktop (>1024px).
- Touch-friendly selection handles, floating quick-action format bubble above selections.
- Collapsible bottom sheet for document outline, comments, and reference library on mobile viewports.
- Virtual keyboard awareness preventing toolbar occlusion.

---

## 3. Zotero Parity Specifications

### 3.1 Library & Collection Architecture

- **Personal Library:** Every user has their default "My Library" containing all bibliographic entries, collections, tags, and notes.
- **Group Libraries:** Collaborative shared libraries with role-based membership (Admin, Member, Viewer). Items and attached documents in group libraries are shared instantly across all group members.
- **Hierarchical Collections:** Nested folder hierarchy (unlimited depth) allowing items to exist in multiple collections simultaneously without duplication.
- **Tags System:**
  - Color-coded tags (up to 9 colored quick-tags assignable via number keys 1–9).
  - User-created tags vs. Automatic tags (imported from publisher metadata).
- **Saved Searches:** Dynamic smart collections based on Boolean filter rules (e.g., `Year is after 2020 AND Tag contains "machine-learning" AND ItemType is journalArticle`).
- **Trash & Soft Deletion:** Items moved to Trash remain restorable for 30 days before permanent deletion.

### 3.2 Item Types & Comprehensive Field Modeling

CiteDocs implements all standard Zotero item types:

- `journalArticle`, `book`, `bookSection`, `conferencePaper`, `thesis`, `report`, `webpage`, `preprint`, `patent`, `case`, `statute`, `presentation`, `manuscript`, `dataset`, etc.
- Multi-author creator modeling with roles (`author`, `editor`, `translator`, `contributor`, `seriesEditor`, `reviewedAuthor`).
- Granular date parsing (supporting exact dates, year-only, date ranges, and circa designations).

### 3.3 Adding Items via Identifiers (Translation-Server Integration)

- **Magic Add Bar ("Add Item by Identifier"):**
  - Supports: **DOI** (e.g. `10.1038/...`), **ISBN** (10 or 13 digits), **PMID / PMCID**, **arXiv ID** (e.g. `arXiv:2301.12345`), **URL**.
  - Dispatches lookup request to `zotero/translation-server` microservice.
  - Fetches clean metadata, abstract, publication details, and automatically attempts to locate open-access PDF attachments via Unpaywall API.

### 3.4 Web Saving & Snapshot Capture

- Single-click web importer modal / browser bookmarklet translating current web pages into structured bibliographic items with full metadata and HTML/PDF snapshots.

### 3.5 PDF Storage & Built-In PDF.js Reader

- **PDF Attachment Storage:** PDFs stored securely in S3/MinIO bucket linked to parent bibliographic record.
- **Integrated PDF.js Reader View:**
  - Side-by-side view (Split screen: Document Editor on left, PDF Reader on right).
  - Full-screen dedicated reader mode.
  - Zoom, rotation, page thumbnail strip, document outline / bookmarks navigator.
- **Annotation & Extraction Suite:**
  - Colored text highlighting (Yellow, Green, Blue, Pink, Purple).
  - Area rectangular annotations for figures, equations, and charts.
  - Free-text sticky notes attached to coordinates.
  - **Quote-to-Document Action:** Select text in PDF -> Click "Insert Quote into Document" -> Automatically inserts blockquote into the active editor along with a connected CiteDocs citation citing the exact page number!
  - **Extract Highlights to Note:** One-click generation of a formatted Zotero child note summarizing all highlights and annotations with linked page numbers.

### 3.6 Advanced Library Intelligence

- **Duplicate Detection & Merge:**
  - Automated background scan identifying duplicates based on DOI match, title similarity (Levenshtein distance), and author/year match.
  - Interactive merge modal showing field differences with master record selection.
- **Retracted Item Warnings:**
  - Automated integration with the **Retraction Watch** database (via Crossref / Zotero Retraction database).
  - Warning badges displayed in library and in-document citations if a cited paper has been retracted or has an expression of concern.
- **Related Items:** Manual and automatic linkage between related items (e.g., linking a preprint to its final published journal version).
- **Full-Text PDF Search:** Automated background PDF text extraction allowing search queries to match text within indexed PDF attachment bodies.

### 3.7 Import & Export Interoperability

- **Import File Formats:** BibTeX (`.bib`), BibLaTeX, RIS (`.ris`), CSL-JSON (`.json`), Zotero RDF, EndNote XML.
- **Export File Formats:** Single item or batch export to BibTeX, BibLaTeX, RIS, CSL-JSON, CSV, or formatted text.

### 3.8 Two-Way Synchronization with zotero.org

- **User Authentication:** Connect existing Zotero account via User ID and API Key (or OAuth 1.0a).
- **Sync Engine:**
  - Pulls full library hierarchy, items, collections, tags, and notes.
  - Listens to local changes and pushes incremental updates with optimistic concurrency (`If-Unmodified-Since-Version`).
  - Full attachment synchronization with Zotero File Storage or user's custom WebDAV/S3 backend.

---

## 4. In-Document Citations & CSL Engine

### 4.1 Citation Insertion & Editing Workflow

- **Keyboard Shortcut:** `Ctrl+Shift+P` (or `@cite` / toolbar button) opens the **CiteDocs Quick Citation Bar** (matching the red Zotero popup bar aesthetic).
- **Search Capability:** Instant prefix/fuzzy search across author names, titles, years, tags, and publication venues.
- **Multi-Cite Clusters:** Select multiple sources within a single cluster (e.g. `[1-3]` or `(Alberts et al., 2014; Smith, 2020)`).
- **Per-Item Modifiers:**
  - **Page / Locator:** Specify locator type (`page`, `chapter`, `figure`, `verse`, `line`, etc.) and number (e.g., `pp. 42-45`).
  - **Prefix / Suffix:** Add custom text (e.g., Prefix: "see also ", Suffix: " for a counter-argument").
  - **Suppress Author:** Hide author name for narrative citations (e.g., "As argued by Smith (2020)...").

### 4.2 Auto-Generated & Auto-Updating Bibliography

- Insert bibliography via toolbar menu (`Insert -> Bibliography`).
- Inserts a dynamic, self-maintaining `bibliography` block at the end of the document (or chosen location).
- Recomputed live whenever citations are added, edited, reordered, or removed.
- Displays appropriate section heading ("References", "Bibliography", or "Works Cited" depending on active CSL style).

### 4.3 10,000+ CSL Styles & Live Style Switching

- **Catalog Access:** Instant searchable selector covering all styles from the official Citation Style Language repository:
  - Major Academic Standards: APA (7th ed.), IEEE, Chicago (Author-Date & Notes-Bibliography), MLA (9th ed.), Vancouver, Harvard, Nature, Science, ACM, Elsevier, Springer, etc.
  - Over 10,000 journal-specific styles.
- **Live Dynamic Switching:** Changing document citation style re-renders all in-text citations and the bibliography in under 300ms without document reloading or data corruption.
- **Locale Switching:** Select language locale (English US/UK, Turkish, French, German, Spanish, Chinese, etc.) to format terms like "and", "et al.", "edition", and date formats.
- **Sorting & Renumbering:** Automatic numeric reordering (e.g., IEEE sorting citations strictly in order of appearance `[1]`, `[2]`, `[3]` or alphabetically).
- **Unlink Citations:** "Unlink Citations" command permanently flattens all citations and bibliography into plain static text for final journal manuscript submissions.

### 4.4 Microsoft Word Compatibility via DOCX Field Codes

- Documents exported to `.docx` embed standard Zotero field codes (`ADDIN ZOTERO_ITEM CSL_CITATION` and `ADDIN ZOTERO_BIBL CSL_BIBLIOGRAPHY`).
- When opened by collaborators in Microsoft Word or LibreOffice equipped with the Zotero desktop extension, the document functions natively with zero conversion artifacts.

---

## 5. Non-Functional Specifications & Benchmarks

| Metric / Requirement        | Target Specification                                                                                                   |
| :-------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| **Max Document Size**       | 100,000 words, 500+ bibliographic citations, 100+ images without browser tab crash or frame drops.                     |
| **Keystroke Input Latency** | $<16\text{ ms}$ (steady 60 FPS typing experience).                                                                     |
| **Collab Sync Latency**     | $<50\text{ ms}$ local network, $<150\text{ ms}$ global cross-region over WebSocket.                                    |
| **CSL Re-render Latency**   | $<250\text{ ms}$ for 100 citations upon style change.                                                                  |
| **Offline Recovery**        | 100% deterministic merge of offline edits via Yjs CRDT with zero data loss.                                            |
| **Accessibility**           | Full WCAG 2.1 AA compliance with keyboard navigation, ARIA landmarks, screen reader descriptions, high-contrast modes. |
| **Security & Privacy**      | End-to-end TLS encryption, Argon2id password hashing, HTTP-only secure JWT cookies, tenant isolation in database.      |
| **Deployment Footprint**    | Complete Docker Compose stack running in $<1\text{ GB}$ total RAM for single-server self-hosting.                      |

---

## 5.1 Product Principles: Free, Volunteer, Non-Commercial

CiteDocs is a **volunteer, non-commercial, fully free open-source** project. There are **no paid tiers, no feature paywalls, and no upsells**. Every capability in this SPEC is available to every user at no cost.

### Accounts & Sign-Up (required)

- **Free registration** for everyone with no invitation code and no waiting list.
- Sign-up / login methods (all free):
  - Email + password (Argon2id).
  - Google OAuth.
  - ORCID OAuth (preferred for academic users).
- Optional linking of a `zotero.org` account via OAuth / API key for two-way library sync (see §3.8). Users may use CiteDocs without linking Zotero.

### Cloud Storage Quotas (generous free defaults)

Hosted CiteDocs instances provide ample free cloud storage so students can work without buying plans:

- **Documents & libraries metadata:** effectively unlimited for normal academic use (soft limit e.g. 10,000 documents / 100,000 library items per user, raised on request).
- **PDF & attachment storage:** **≥ 5 GB per user** free by default on the public/volunteer host (configurable higher for self-hosted deployments).
- **Collaborative docs & sharing:** unlimited collaborators within reasonable fair-use rate limits.
- Quotas exist only to protect the volunteer host from abuse; they must never gate core features behind payment.

### Sharing & Collaboration

- Share documents by link or by account email with roles Owner / Editor / Commenter / Viewer (see §2.8).
- Real-time multi-user editing, comments, and suggesting mode are free for all roles.
- Library / collection sharing for group coursework is free.

### Hosting Paths (no commercial lock-in)

1. **Self-host:** one-command Docker Compose (Postgres + MinIO + translation-server + API + web) on a home server or ~$5/mo VPS — see `docs/ARCHITECTURE.md` §7.1.
2. **Low-cost public host:** optional AWS / Cloudflare free-tier or ~$15–25/mo blueprint for a community instance — see §7.2. Deploying spend requires an explicit human decision; agents never deploy or spend money on their own.
3. Source stays public; forks and private self-hosts are encouraged.

### Explicit Non-Goals

- No freemium, premium, or "Pro" SKU.
- No ads inside the editor or library.
- No selling user documents, libraries, or PDFs.

---

## 6. User Stories & Acceptance Criteria

### US-1: Live Citation Insertion

- **As a** Scientific Writing student (Yusuf),
- **I want to** search my library and insert a citation with a specific page locator while typing,
- **So that** my document accurately cites the literature without breaking my flow.
- **Acceptance Criteria:**
  1. Pressing `Ctrl+Shift+P` opens the quick search popup in $<100\text{ ms}$.
  2. Typing query filters library items live.
  3. Selecting an item and entering page "42" inserts formatted citation node into TipTap document.
  4. The bibliography automatically adds the full reference entry formatted according to the current document CSL style.

### US-2: Collaborative Track Changes (Suggesting Mode)

- **As an** advisor reviewing Yusuf's thesis,
- **I want to** suggest edits and leave comments instead of directly altering text,
- **So that** Yusuf can review, accept, or reject each edit.
- **Acceptance Criteria:**
  1. Switching to "Suggesting" mode logs all typing as green underlined insertions and backspaces as red strikethrough deletions.
  2. Hovering or clicking a suggestion displays an attribution card with advisor's name, avatar, and timestamp.
  3. Clicking "Accept" applies change permanently to Yjs document; clicking "Reject" rolls it back cleanly.

### US-3: Native Zotero Two-Way Sync

- **As a** researcher with an extensive existing Zotero collection,
- **I want to** connect my `zotero.org` account,
- **So that** my papers, collections, and PDFs are instantly available in CiteDocs.
- **Acceptance Criteria:**
  1. Entering Zotero API key initiates sync workflow.
  2. Collections hierarchy, items, tags, and notes replicate to local PostgreSQL database.
  3. Adding a paper by DOI in CiteDocs syncs upstream to `zotero.org` with proper version tags.

### US-4: Free Account & Cloud Library

- **As a** Scientific Writing student,
- **I want to** create a free CiteDocs account (email, Google, or ORCID) and save documents plus PDFs in the cloud,
- **So that** I can write and cite from my PC or tablet without paying or self-hosting.
- **Acceptance Criteria:**
  1. Sign-up page offers email, Google, and ORCID with no payment step.
  2. After login I can create a doc, upload a PDF (≥10 MB), and reopen both from another browser.
  3. No UI copy mentions paid plans, trials, or locked features.
