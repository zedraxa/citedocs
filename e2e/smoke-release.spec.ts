import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helper to dynamically load JSZip from existing workspace dependencies.
 */
async function getJSZip() {
  const primaryPath = path.resolve(
    __dirname,
    "../packages/docx-exporter/node_modules/jszip/lib/index.js",
  );
  try {
    const m = await import(primaryPath);
    return m.default || m;
  } catch {
    const fallbackPath = path.resolve(
      __dirname,
      "../apps/server/node_modules/jszip/lib/index.js",
    );
    const m = await import(fallbackPath);
    return m.default || m;
  }
}

/**
 * Creates a minimal valid .odt buffer for testing ODT file upload and notice banner.
 */
async function createMinimalOdtBuffer(): Promise<Buffer> {
  const JSZip = await getJSZip();
  const zip = new JSZip();

  // OpenDocument requires mimetype to be the first uncompressed entry
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", {
    compression: "STORE",
  });

  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`,
  );

  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.3">
  <office:body>
    <office:text>
      <text:p>CiteDocs post-deploy smoke test ODT dokumani.</text:p>
    </office:text>
  </office:body>
</office:document-content>`,
  );

  const generated = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(generated);
}

test.describe("Post-Deploy Release Smoke Verification (smoke-release)", () => {
  test.setTimeout(180_000); // 3 minutes total timeout for full multi-step lifecycle

  test("1. Verifies student signup, Turkish Belgelerim, ONLYOFFICE lang=tr, top-bar StylePicker, Zotero panel, ODT banner & cleanup", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const studentEmail = `smoke_release_${timestamp}@university.edu`;
    const studentName = `Yusuf Ogrenci ${timestamp}`;
    const password = "SmokePassword123!";
    let createdDocId: string | null = null;

    // -------------------------------------------------------------------------
    // Step 1: Signup with a fresh unique student account
    // -------------------------------------------------------------------------
    await test.step("Signup with a fresh unique account", async () => {
      await page.goto("/signup");
      await expect(page).toHaveTitle(/CiteDocs/i);

      await page.getByTestId("signup-email-input").fill(studentEmail);
      await page.getByTestId("signup-name-input").fill(studentName);
      await page.getByTestId("signup-password-input").fill(password);
      await page.getByTestId("signup-confirm-password-input").fill(password);
      await page.getByTestId("signup-submit-btn").click();

      // Automatically verified and redirected to /documents
      await expect(page).toHaveURL(/.*\/documents/, { timeout: 20_000 });
    });

    // -------------------------------------------------------------------------
    // Step 2: Belgelerim loads in Turkish
    // -------------------------------------------------------------------------
    await test.step("Belgelerim dashboard loads with Turkish localization", async () => {
      await expect(page.getByTestId("documents-page")).toBeVisible();

      // Verify "Belgelerim" tab header
      const myDocsTab = page.getByTestId("tab-my-documents");
      await expect(myDocsTab).toBeVisible();
      await expect(myDocsTab).toContainText("Belgelerim");

      // Verify "Yeni Belge" dropdown button
      const newDocBtn = page.getByTestId("new-doc-dropdown-btn");
      await expect(newDocBtn).toBeVisible();
      await expect(newDocBtn).toContainText("Yeni Belge");

      // Verify quota and user greeting
      await expect(page.getByTestId("storage-quota-indicator")).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Step 3: New blank document opens in ONLYOFFICE with lang=tr
    // -------------------------------------------------------------------------
    await test.step("New blank document opens in ONLYOFFICE with lang=tr", async () => {
      const newDocBtn = page.getByTestId("new-doc-dropdown-btn");
      await newDocBtn.click();

      const createDocxBtn = page.getByTestId("create-docx-btn");
      await expect(createDocxBtn).toBeVisible();
      await createDocxBtn.click();

      // Redirects to editor
      await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 25_000 });

      const currentUrl = page.url();
      const match = currentUrl.match(/doc=([a-f0-9-]+)/i);
      createdDocId = match ? match[1] : null;
      expect(createdDocId).toBeTruthy();

      // Verify ONLYOFFICE editor container/iframe is mounted
      const frameElement = page.locator('iframe[name="frameEditor"], iframe').first();
      await expect(frameElement).toBeVisible({ timeout: 30_000 });

      // Verify ONLYOFFICE API config endpoint specifies lang: "tr" and region: "tr-TR"
      const configRes = await page.evaluate(async (id) => {
        const res = await fetch(`/api/documents/${id}/onlyoffice-config`);
        return res.json();
      }, createdDocId);

      expect(configRes.config).toBeTruthy();
      expect(configRes.config.editorConfig?.lang).toBe("tr");
      expect(configRes.config.editorConfig?.region).toBe("tr-TR");

      // Verify iframe src has lang=tr parameter
      const iframeSrc = (await frameElement.getAttribute("src")) || "";
      expect(iframeSrc).toContain("lang=tr");
    });

    // -------------------------------------------------------------------------
    // Step 4: CSL style picker is visible in editor top bar and lists styles
    // -------------------------------------------------------------------------
    await test.step("CSL style picker is visible in the editor top bar and lists styles (ZC-03, ZC-05)", async () => {
      const stylePickerBtn = page.getByTestId("oo-style-picker-btn");
      await expect(stylePickerBtn).toBeVisible({ timeout: 15_000 });
      await expect(stylePickerBtn).toBeEnabled();

      // Default label contains APA 7
      const styleLabel = page.getByTestId("oo-style-current-label");
      await expect(styleLabel).toContainText(/APA 7/i);

      // Open style picker dropdown
      await stylePickerBtn.click();
      const dropdown = page.getByTestId("oo-style-picker-dropdown");
      await expect(dropdown).toBeVisible();

      // Verify popular pinned styles are visible
      await expect(page.getByTestId("oo-style-item-apa")).toBeVisible();
      await expect(page.getByTestId("oo-style-item-ieee")).toBeVisible();

      // Search for TÜBİTAK style with Turkish character search
      const searchInput = page.getByTestId("oo-style-search-input");
      await searchInput.fill("tubitak");
      await expect(
        page.getByTestId("oo-style-item-turkiye-bilimsel-ve-teknolojik-arastirma-kurumu"),
      ).toBeVisible({ timeout: 5_000 });

      // Close dropdown by clicking close button or trigger button
      const closeBtn = dropdown.getByRole("button", { name: "Kapat" });
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await stylePickerBtn.click();
      }
      await expect(dropdown).not.toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Step 5: Zotero button and add-by-identifier panel open on the same screen
    // -------------------------------------------------------------------------
    await test.step("Zotero button and add-by-identifier panel open on the same screen", async () => {
      // 1-Click Zotero button in editor header
      const zoteroOpenBtn = page.getByTestId("oo-zotero-open");
      await expect(zoteroOpenBtn).toBeVisible();

      // Add by identifier controls in top bar
      const addForm = page.getByTestId("oo-add-form");
      const addInput = page.getByTestId("oo-add-input");
      const addSubmit = page.getByTestId("oo-add-submit");
      await expect(addForm).toBeVisible();
      await expect(addInput).toBeVisible();
      await expect(addSubmit).toBeVisible();

      // Quick citation side panel toggle button
      const panelToggleBtn = page.getByTestId("oo-panel-toggle");
      await expect(panelToggleBtn).toBeVisible();

      // Open quick cite panel and verify it mounts on the SAME screen alongside ONLYOFFICE editor
      await panelToggleBtn.click();
      const citePanel = page.getByTestId("oo-cite-panel");
      await expect(citePanel).toBeVisible();

      // Close the side panel
      const panelCloseBtn = page.getByTestId("oo-panel-close");
      if (await panelCloseBtn.isVisible()) {
        await panelCloseBtn.click();
        await expect(citePanel).not.toBeVisible();
      }
    });

    // -------------------------------------------------------------------------
    // Step 6: ODT notice banner appears when an .odt is uploaded (ZC-01)
    // -------------------------------------------------------------------------
    await test.step("ODT notice banner appears when an .odt file is uploaded", async () => {
      // Return to Belgelerim dashboard
      const backBtn = page.getByTestId("oo-back");
      await backBtn.click();
      await expect(page).toHaveURL(/.*\/documents/, { timeout: 20_000 });
      await expect(page.getByTestId("documents-page")).toBeVisible();

      // Prepare minimal valid .odt binary fixture
      const odtBuffer = await createMinimalOdtBuffer();
      const odtFileName = `SmokeTest_${timestamp}.odt`;

      // Upload file via file input
      const fileInput = page.getByTestId("file-upload-input");
      await fileInput.setInputFiles({
        name: odtFileName,
        mimeType: "application/vnd.oasis.opendocument.text",
        buffer: odtBuffer,
      });

      // Assert ODT notice banner appears on dashboard
      const noticeBanner = page.getByTestId("odt-notice-banner");
      await expect(noticeBanner).toBeVisible({ timeout: 15_000 });
      await expect(noticeBanner).toContainText("LibreOffice / ODT Biçimi Uyarısı");
      await expect(noticeBanner).toContainText(".docx");

      // Verify "DOCX olarak kopya oluştur" action button is available
      const convertBtn = page.getByTestId("convert-to-docx-btn");
      await expect(convertBtn).toBeVisible();

      // Dismiss the notice banner
      const dismissBtn = page.getByTestId("odt-notice-dismiss");
      if (await dismissBtn.isVisible()) {
        await dismissBtn.click();
        await expect(noticeBanner).not.toBeVisible();
      }
    });

    // -------------------------------------------------------------------------
    // Step 7: Clean up test documents where UI allows
    // -------------------------------------------------------------------------
    await test.step("Clean up test documents", async () => {
      // Navigate to /documents if not already there
      if (!page.url().includes("/documents")) {
        await page.goto("/documents");
        await expect(page.getByTestId("documents-page")).toBeVisible();
      }

      // Delete all visible document cards owned by this test student
      const deleteButtons = page.locator('[data-testid^="delete-doc-"]');
      let count = await deleteButtons.count();

      while (count > 0) {
        page.once("dialog", (dialog) => dialog.accept());
        await deleteButtons.first().click();
        await page.waitForTimeout(800);
        count = await deleteButtons.count();
      }

      console.log(`[Smoke Release] All test documents cleaned up successfully for ${studentEmail}`);
    });
  });

  // ---------------------------------------------------------------------------
  // Checks requiring a linked Zotero account are marked test.fixme
  // ---------------------------------------------------------------------------
  test.fixme(
    "2. [FIXME ZOTERO-AUTH]: Inserting citations and 2-way syncing with Zotero Web Library requires a linked user account",
    async () => {
      // REASON: This post-deploy smoke test creates a fresh unlinked student account.
      // Testing live Zotero Web API synchronization, item import from personal collections,
      // and live citation insertion into ONLYOFFICE AST requires an authenticated
      // Zotero account (either pre-configured API key or OAuth 1.0a authorization flow).
      // On production, students perform this 1-click step via the "Zotero'yu bağla" button.
    },
  );
});
