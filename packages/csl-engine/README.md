# @citedocs/csl-engine

High-performance, CSL 1.0.2-compliant citation and bibliography engine wrapper for [CiteDocs](https://github.com/citedocs/citedocs), powered by `citeproc-js`.

Runs universally in browser (Vite SPA/PWA), Node.js (Fastify), and WebWorkers with zero DOM dependencies.

---

## Features

- **Full CSL 1.0.2 Compliance:** Wraps `citeproc-js` for 100% specification parity with Zotero and Mendeley.
- **In-Text Citation Formatting:** Handles complex clusters (multi-cites, page/chapter locators, prefix/suffix, narrative author suppression).
- **Document-Order Processing:** Incremental cluster rendering via `processCitationCluster` maintaining `citationsPre` and `citationsPost`.
- **Dual-Format Bibliography:** Generates structured HTML (`csl-bib-body` / `csl-entry`) and clean plain text outputs.
- **Sub-300ms Style Switching:** Instantly re-evaluates 100+ citation clusters and regenerates bibliography (measured $<160\text{ ms}$ for 50 items / 100 clusters) using engine pooling.
- **Bundled Core Styles & Locales:** Pre-bundles official styles (`apa`, `ieee`, `chicago-author-date`, `modern-language-association`, `vancouver`) and locales (`en-US`, `tr-TR`) offline.
- **Lazy-Loading Interface:** Async `StyleLoader` and `LocaleLoader` for on-demand streaming from the 10,000+ CSL repository catalog.
- **Strict Typed API:** Written in TypeScript 5.8+ with typed errors (`UnknownStyleError`, `UnknownLocaleError`).

---

## Installation

Within the CiteDocs monorepo:

```bash
pnpm add @citedocs/csl-engine
```

---

## Quick Start

### 1. Author-Date Citations & Bibliography (APA 7th)

```typescript
import { CSLEngine, APA_STYLE_XML } from "@citedocs/csl-engine";
import type { CSLItem, CitationCluster } from "@citedocs/shared";

const items: CSLItem[] = [
  {
    id: "einstein1935",
    type: "article-journal",
    title: "Can Quantum-Mechanical Description of Physical Reality be Considered Complete?",
    author: [
      { family: "Einstein", given: "Albert" },
      { family: "Podolsky", given: "Boris" },
      { family: "Rosen", given: "Nathan" },
    ],
    issued: { "date-parts": [[1935]] },
    "container-title": "Physical Review",
    volume: "47",
    page: "777-780",
    DOI: "10.1103/PhysRev.47.777",
  },
];

// Initialize engine (accepts style ID or raw XML)
const engine = new CSLEngine("apa", "en-US", items);

// Format in-text citation
const cluster: CitationCluster = {
  citationId: "c1",
  citationItems: [{ id: "einstein1935", locator: "778", label: "page", prefix: "see " }],
  properties: { noteIndex: 0 },
};

console.log(engine.formatCitation(cluster));
// "(see Einstein et al., 1935, p. 778)"

// Generate bibliography
const bib = engine.makeBibliography();
console.log(bib.html);
// "<div class=\"csl-bib-body\">\n  <div class=\"csl-entry\">Einstein, A., Podolsky, B., & Rosen, N. (1935)...</div>\n</div>"
```

### 2. Numeric Citations (IEEE)

```typescript
const engine = new CSLEngine("ieee", "en-US", items);

const updates = engine.processCitationCluster({
  citationId: "c1",
  citationItems: [{ id: "einstein1935" }],
  properties: { noteIndex: 0 },
});

console.log(updates[0].formattedText);
// "[1]"
```

### 3. High-Speed Style Switching (< 300 ms SLA)

```typescript
// Re-renders all registered clusters in document order and updates bibliography
const result = engine.switchStyle("ieee");

console.log(result.clusterUpdates);
// Updated cluster texts ([1], [2], ...)
console.log(result.bibliography.entries);
// Numbered IEEE bibliography entries
```

### 4. Localization (Turkish `tr-TR`)

```typescript
const engine = new CSLEngine("modern-language-association", "tr-TR", items);
// Renders localized terms (e.g. "ve" instead of "and")
console.log(engine.formatCitation(cluster));
// "(Einstein ve Rosen)"
```

### 5. Lazy-Loading 10,000+ CSL Styles

```typescript
import { StyleRegistry, UnknownStyleError } from "@citedocs/csl-engine";

const registry = new StyleRegistry();

// Configure async fetcher for official repository styles
registry.setLoader(async (styleId: string) => {
  const res = await fetch(`https://raw.githubusercontent.com/citation-style-language/styles/master/${styleId}.csl`);
  if (!res.ok) return undefined;
  return res.text();
});

// Load on-demand
const natureXml = await registry.load("nature");
```

---

## API Reference

### `CSLEngine`
- `new CSLEngine(styleXmlOrId, lang?, initialItems?, options?)`: Creates engine.
- `formatCitation(cluster, format?)`: Formats a single citation cluster (`"text"` | `"html"`).
- `processCitationCluster(cluster, pre?, post?)`: Processes cluster in document context, returning `CitationClusterUpdate[]`.
- `makeBibliography(format?)`: Computes bibliography with `.entries`, `.html`, and `.text`.
- `switchStyle(newStyleXmlOrId, newLang?)`: Switches style with engine pooling, returning `StyleSwitchResult`.
- `switchStyleById(styleId, lang?, registry?)`: Async switch resolving style via registry.
- `updateItems(items)`: Registers or updates bibliographic records.
- `addItem(item)`: Appends single record.
- `getItem(id)`: Retrieves record.
- `registerCluster(cluster)` / `setClusterOrder(ids)`: Manages document cluster ordering.
- `setOutputFormat("html" | "text" | "rtf")`: Toggles output formatting mode.

### `StyleRegistry`
- `get(id)`: Returns metadata (`CitationStyleMeta`).
- `getXml(id)`: Returns cached CSL XML string.
- `load(id)`: Returns XML or calls `loader`; throws `UnknownStyleError` on failure.
- `search(query)`: Searches styles by name/ID/shortTitle.
- `list()`: Returns all known styles.
- `setLoader(loader)`: Configures async fallback loader.

### `LocaleRegistry`
- `get(lang)`: Resolves locale XML with fallback to `en-US`.
- `load(lang)`: Async loads locale or throws `UnknownLocaleError`.
- `setLoader(loader)`: Configures async fallback loader.

### Errors
- `UnknownStyleError`: Thrown when a style ID cannot be resolved (`.code === "UNKNOWN_STYLE"`, `.styleId`).
- `UnknownLocaleError`: Thrown when a locale cannot be resolved (`.code === "UNKNOWN_LOCALE"`, `.localeId`).

---

## License & Attribution

- Engine implementation: MIT License.
- Bundled CSL styles and locales are sourced from the [official Citation Style Language repositories](https://github.com/citation-style-language) and distributed under the [Creative Commons Attribution-ShareAlike 3.0 Unported License](http://creativecommons.org/licenses/by-sa/3.0/) (CC BY-SA 3.0). Embedded `<rights>` tags and author credits are preserved.
