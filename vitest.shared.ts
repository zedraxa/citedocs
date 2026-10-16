import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Shared by the workspace and standalone package runs (pnpm -r test).
export default defineConfig({
  // Test the current workspace sources, even before the first build.
  resolve: {
    alias: Object.fromEntries(
      ["shared", "csl-engine", "zotero-core", "editor", "docx-exporter", "pdf-reader"].map(
        (name) => [
          `@citedocs/${name}`,
          fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
        ],
      ),
    ),
  },
  test: {
    pool: "forks",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Avoid CPU contention between citeproc, DOM rendering and collab latency tests.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
