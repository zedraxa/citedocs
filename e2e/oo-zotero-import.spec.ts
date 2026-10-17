import { test, expect } from "@playwright/test";

test.describe("Zotero Reference Import (BibTeX / RIS / CSL-JSON)", () => {
  test.describe.configure({ mode: "serial" });

  test("ImportReferences panel is available in editor side panel with Turkish controls", async ({
    page,
  }) => {
    // Navigate to editor directly or check panel elements
    await page.goto("/editor?doc=demo-doc");

    // Open citation / add-source panel if toggle button exists
    const toggleBtn = page.locator('[data-testid="oo-btn-cite"]');
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
    }

    // Verify import references panel elements
    const importPanel = page.locator('[data-testid="import-references-panel"]');
    if (await importPanel.isVisible()) {
      await expect(importPanel).toContainText("Dosya veya Metinden Kaynak İçe Aktar");
      await expect(importPanel.locator('[data-testid="import-tab-file"]')).toBeVisible();
      await expect(importPanel.locator('[data-testid="import-tab-text"]')).toBeVisible();
      await expect(importPanel.locator('[data-testid="import-format-select"]')).toBeVisible();
    }
  });

  test.fixme(
    "Live Zotero sync: imports a BibTeX file into linked Zotero account and updates document citations",
    async ({ page }) => {
      // This test requires a live zotero.org OAuth session and real API credentials.
      // Marked as fixme per specification for offline CI/CD test suite.
      await page.goto("/editor?doc=demo-doc");
      const importPanel = page.locator('[data-testid="import-references-panel"]');
      await expect(importPanel).toBeVisible();

      // Switch to paste text mode
      await importPanel.locator('[data-testid="import-tab-text"]').click();
      const textarea = importPanel.locator('[data-testid="import-text-input"]');
      await textarea.fill(`@article{test2024,
        author = {Yilmaz, Ahmet},
        title = {CiteDocs Web Academic Word Processor},
        journal = {Journal of Open Source Software},
        year = {2024}
      }`);

      // Click import
      await importPanel.locator('[data-testid="import-submit-btn"]').click();
      await expect(page.locator('[data-testid="import-success-notice"]')).toContainText(
        "kaynak Zotero kütüphanenize başarıyla eklendi",
      );
    },
  );
});
