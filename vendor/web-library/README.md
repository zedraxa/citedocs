# Zotero Web Library (`zotero/web-library`) Integration in CiteDocs

> **Upstream Repository:** [https://github.com/zotero/web-library](https://github.com/zotero/web-library)  
> **License:** GNU Affero General Public License v3.0 (AGPL-3.0)  
> **Target Delivery Path:** `apps/web/public/zotero-weblib/`  
> **Host Component:** `<ZoteroSidebar />` (`apps/web/src/zotero/ZoteroSidebar.tsx`)

---

## 1. Architectural Strategy & Rationale

CiteDocs adheres strictly to the architectural directive: **Do not reimplement Zotero or a word processor.**

The official `zotero/web-library` is a mature, battle-tested React/Redux application that provides:
- Hierarchical collection trees and virtual folders (My Library, Group Libraries, Trash, Unfiled Items).
- High-performance item listing with column customization, sorting, and multi-field search.
- Rich item inspection and metadata editing (creators, dates, publication data, tags, notes, attachments).
- Native compatibility with the Zotero Web API v3 data model.

### Why Iframe / Served Bundle Embedding?

1. **Clean AGPL-3.0 License Boundary:**  
   Embedding the compiled web-library within an `<iframe>` served from our own static path ensures clear separation between the AGPL-3.0 licensed frontend code and CiteDocs' MIT-licensed application layer.
2. **State & Dependency Isolation:**  
   `web-library` bundles its own React, Redux, and styling. Running it inside a sandboxed iframe prevents CSS conflicts with CiteDocs' TailwindCSS layout and avoids React version mismatches.
3. **Zero Heavy Build Artifacts in Git:**  
   We do not commit multi-megabyte minified vendor bundles directly into the git repository. Instead, vendoring is reproducible via `tools/scripts/fetch-web-library.sh` and backed by a lightweight offline placeholder during development and CI.

---

## 2. Vendoring & Build Pipeline

To build or refresh the official bundle from upstream:

```bash
# Run the vendoring script from repository root
./tools/scripts/fetch-web-library.sh
```

### Steps Performed by Script:
1. Clones `https://github.com/zotero/web-library.git` (shallow clone).
2. Installs upstream dependencies via `npm install --legacy-peer-deps`.
3. Runs `npm run build`.
4. Copies compiled HTML, JS, and CSS to `apps/web/public/zotero-weblib/`.

---

## 3. Communication Protocol (`postMessage`)

The CiteDocs document editor and the embedded Zotero Web Library communicate over standard HTML5 `postMessage`:

### 3.1 Iframe to CiteDocs Parent (Citation Insertion)
When the user clicks **"Cite in Document"** or drags an item into the editor:

```typescript
window.parent.postMessage({
  type: "CITEDOCS_ZOTERO_CITE",
  item: {
    id: "itemKey123",
    title: "Quantum Gravity & Spacetime",
    authors: "Einstein, Podolsky, Rosen",
    year: "1935",
    doi: "10.1103/PhysRev.47.777",
    itemType: "journalArticle",
    publicationTitle: "Physical Review",
    url: "https://doi.org/10.1103/PhysRev.47.777"
  }
}, "*");
```

CiteDocs' `ZoteroSidebar` listens for this event and invokes the document citation handler to insert the formatted citation directly into the active document.

### 3.2 CiteDocs Parent to Iframe (Configuration & Sync)
When the user links or switches accounts in CiteDocs:

```typescript
iframe.contentWindow.postMessage({
  type: "CITEDOCS_SET_CONFIG",
  config: {
    userId: "citedocs-user-uuid",
    zoteroUserId: "1234567",
    proxyBaseUrl: "/api/zotero/proxy",
    linked: true
  }
}, "*");
```

---

## 4. Secure API Proxying (Zero Browser Key Exposure)

The embedded Web Library is configured to route API calls through CiteDocs' server proxy:
- Base URL: `/api/zotero/proxy/users/{zoteroUserId}/*`
- The browser **never** handles or sees the user's raw Zotero API key.
- CiteDocs Fastify server retrieves the key encrypted at rest (AES-256-GCM), decrypts it in-memory, injects `Zotero-API-Key` and `Zotero-API-Version: 3`, and forwards the request to `https://api.zotero.org`.

---

## 5. Offline Development & CI Placeholder

For offline environments, test runs, and developers without internet access during builds, CiteDocs provides a faithful UI placeholder in:
`apps/web/public/zotero-weblib/index.html`

The placeholder:
- Displays the authentic 3-pane Zotero Web Library layout (Collections tree, item list, item inspector).
- Features working collection navigation and search filtering.
- Implements the exact same `CITEDOCS_ZOTERO_CITE` `postMessage` protocol so that end-to-end integration tests and user interactions function 100% offline.
