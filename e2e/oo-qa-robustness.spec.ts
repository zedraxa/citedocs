import { test, expect, type Page } from "@playwright/test";

async function safeGoto(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch {
    await page.waitForTimeout(1500);
    await page.goto(url);
  }
}

test.describe("Requirement 4: Basic Robustness QA Suite (oo-qa-robustness)", () => {
  test.setTimeout(180_000);

  test("zero console errors and zero failed 4xx/5xx requests from own origin during full student lifecycle", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedOwnOriginRequests: Array<{ url: string; status: number; statusText: string }> = [];

    // Track own origin
    let ownOrigin = "";

    page.on("pageerror", (err) => {
      pageErrors.push(err.message || String(err));
      console.error(`[QA Robustness PageError] ${err.message}`);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore known benign browser noise like favicon or Chrome extension messages
        if (text.includes("favicon.ico") || text.includes("chrome-extension://")) return;
        consoleErrors.push(text);
        console.warn(`[QA Robustness ConsoleError] ${text}`);
      }
    });

    page.on("response", (response) => {
      try {
        const urlObj = new URL(response.url());
        if (!ownOrigin && urlObj.hostname.includes("sifirdanbire.com.tr")) {
          ownOrigin = urlObj.origin;
        }

        const isOwnOrigin = ownOrigin ? urlObj.origin === ownOrigin : response.url().startsWith("/");
        const status = response.status();

        // 401 from /api/auth/session is the standard unauthenticated check before login
        const isExpectedUnauthCheck = status === 401 && urlObj.pathname.includes("/api/auth/session");

        if (isOwnOrigin && status >= 400 && !isExpectedUnauthCheck) {
          failedOwnOriginRequests.push({
            url: response.url(),
            status,
            statusText: response.statusText(),
          });
          console.error(`[QA Robustness Network Error] HTTP ${status} from ${urlObj.pathname}`);
        }
      } catch {
        // invalid URL
      }
    });

    const timestamp = Date.now();
    const studentEmail = `qa+robust_${timestamp}@example.com`;
    const studentName = `Sağlamlık Öğrenci ${timestamp}`;
    const password = "StrongStudentPassword123!";

    // -------------------------------------------------------------------------
    // Phase 1: Signup
    // -------------------------------------------------------------------------
    await safeGoto(page, "/signup");
    await expect(page).toHaveTitle(/CiteDocs/i);

    const emailInput = page.getByTestId("signup-email-input");
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
    await emailInput.fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(studentName);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();

    try {
      await expect(page).toHaveURL(/.*\/documents/, { timeout: 8000 });
    } catch {
      if (page.url().includes("/signup")) {
        console.log("[QA Robustness] Transient network glitch during signup submit, re-clicking submit...");
        await page.waitForTimeout(1000);
        await page.getByTestId("signup-submit-btn").click();
        await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });
      }
    }
    await expect(page.getByTestId("documents-page")).toBeVisible();

    // -------------------------------------------------------------------------
    // Phase 2: Documents Dashboard Navigation
    // -------------------------------------------------------------------------
    await expect(page.getByTestId("storage-quota-indicator")).toBeVisible();
    await page.getByTestId("tab-shared-documents").click();
    await page.getByTestId("tab-my-documents").click();

    // -------------------------------------------------------------------------
    // Phase 3: Create Document & Enter ONLYOFFICE Editor
    // -------------------------------------------------------------------------
    await page.getByTestId("new-doc-dropdown-btn").click();
    await page.getByTestId("create-docx-btn").click();
    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });

    const editorUrl = new URL(page.url());
    const docId = editorUrl.searchParams.get("doc");
    expect(docId).toBeTruthy();

    const zoteroBtn = page.getByTestId("oo-zotero-open");
    await expect(zoteroBtn).toBeEnabled({ timeout: 45_000 });

    // -------------------------------------------------------------------------
    // Phase 4: In-Editor Workflow
    // -------------------------------------------------------------------------
    // Open Citation Panel
    await page.getByTestId("oo-panel-toggle").click();
    await expect(page.getByTestId("oo-cite-panel")).toBeVisible();
    await page.getByTestId("oo-panel-close").click();

    // Trigger Zotero button
    await zoteroBtn.click();
    await page.waitForTimeout(3000);

    // -------------------------------------------------------------------------
    // Phase 5: Return to Documents, Rename & Share Dialogs
    // -------------------------------------------------------------------------
    await page.getByTestId("oo-back").click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    // Rename document
    await page.getByTestId(`rename-doc-${docId}`).click();
    const renameInput = page.getByTestId("rename-input");
    await expect(renameInput).toBeVisible();
    const renamedTitle = `Tez Belgesi ${timestamp}`;
    await renameInput.fill(renamedTitle);
    await page.getByTestId("rename-submit-btn").click();
    await expect(page.getByTestId("rename-dialog-backdrop")).not.toBeVisible();
    await expect(page.getByTestId(`document-card-${docId}`)).toContainText(renamedTitle);

    // Share dialog
    await page.getByTestId(`share-doc-${docId}`).click();
    await expect(page.getByTestId("share-dialog")).toBeVisible();
    await page.getByTestId("share-close-btn").click();

    // -------------------------------------------------------------------------
    // Phase 6: Document Cleanup
    // -------------------------------------------------------------------------
    page.once("dialog", (d) => d.accept());
    await page.getByTestId(`delete-doc-${docId}`).click();
    await expect(page.getByTestId(`document-card-${docId}`)).not.toBeVisible({ timeout: 10_000 });

    // -------------------------------------------------------------------------
    // Phase 7: Logout and Login
    // -------------------------------------------------------------------------
    await page.getByTestId("user-menu-btn").click();
    await page.getByTestId("user-logout-btn").click();
    await expect(page).toHaveURL(/.*\/login/, { timeout: 15_000 });

    await page.getByTestId("login-email-input").fill(studentEmail);
    await page.getByTestId("login-password-input").fill(password);
    await page.getByTestId("login-submit-btn").click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    // -------------------------------------------------------------------------
    // Phase 8: Robustness Assertions
    // -------------------------------------------------------------------------
    console.log(`[QA Robustness Summary] Page errors: ${pageErrors.length}, Console errors: ${consoleErrors.length}, Failed own-origin requests: ${failedOwnOriginRequests.length}`);

    expect(pageErrors, `Uncaught page errors occurred: ${JSON.stringify(pageErrors)}`).toEqual([]);

    // Filter console errors for fatal errors originating from our application code
    const fatalAppErrors = consoleErrors.filter((msg) => {
      // Browser automatic network console logs for expected 401 unauthenticated session checks
      if (msg.includes("Failed to load resource") && (msg.includes("401") || msg.includes("ERR_NETWORK_CHANGED") || msg.includes("ERR_QUIC"))) {
        return false;
      }
      // Third-party ONLYOFFICE internal debug warnings or cross-origin canvas logs are excluded
      return !msg.includes("sdkjs") && !msg.includes("web-apps") && !msg.includes("Download failed");
    });
    expect(fatalAppErrors, `Fatal app console errors occurred: ${JSON.stringify(fatalAppErrors)}`).toEqual([]);

    expect(
      failedOwnOriginRequests,
      `Failed HTTP requests from own origin occurred: ${JSON.stringify(failedOwnOriginRequests)}`
    ).toEqual([]);
  });
});
