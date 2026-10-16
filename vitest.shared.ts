import { defineConfig } from "vitest/config";

// Shared by the workspace and standalone package runs (pnpm -r test).
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Avoid CPU contention between citeproc, DOM rendering and collab latency tests.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
