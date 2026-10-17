import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for CiteDocs ONLYOFFICE student flow.
 * Configurable via BASE_URL environment variable:
 *   BASE_URL=https://docs.sifirdanbire.com.tr pnpm test:e2e
 * Defaults to http://localhost:5173 for local testing.
 */
const BASE_URL = process.env.BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath:
            process.env.CHROME_BIN ||
            (process.platform === "linux" ? "/usr/bin/google-chrome" : undefined),
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
          ],
        },
      },
    },
  ],
});
