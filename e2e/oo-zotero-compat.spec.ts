import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to dynamically load jszip
async function getJSZip() {
  const jszipPath = path.resolve(
    __dirname,
    "../packages/docx-exporter/node_modules/jszip/lib/index.js",
  );
  const m = await import(jszipPath);
  return m.default || m;
}

// Helper to dynamically load exportDocumentToDocx & importDocxZoteroFields
async function getDocxExporter() {
  const exporterPath = path.resolve(
    __dirname,
    "../packages/docx-exporter/dist/index.js",
  );
  return await import(exporterPath);
}

test.describe("Zotero & CSL Style Compatibility (oo-zotero-compat)", () => {
  test.setTimeout(300_000); // 5 minutes generous timeout

  test("Requirement 1: DOCX with Word Zotero field codes survives save, edit, download and upload round-trip", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const studentEmail = `qa+zoteroroundtrip_${timestamp}@example.com`;
    const studentName = `Zotero Compat Student ${timestamp}`;
    const password = "StrongStudentPassword123!";

    const citationId = `cit-word-compat-${timestamp}`;
    const itemTitle = `Akademik Bilisim ve Atif Uyumlulugu ${timestamp}`;
    const formattedCit = `(Yilmaz, 2024)`;

    const { exportDocumentToDocx, importDocxZoteroFields } = await getDocxExporter();
    const JSZip = await getJSZip();

    // -------------------------------------------------------------------------
    // Step 1: Build genuine Microsoft Word DOCX with Zotero complex field codes
    // -------------------------------------------------------------------------
    const docxBuffer = await exportDocumentToDocx({
      title: "Zotero Uyumluluk Calismasi",
      paragraphs: [
        {
          children: [
            "Bu makale Microsoft Word Zotero eklentisi tarafindan eklenmis canli bir atif icermektedir: ",
            {
              type: "citation",
              citationId,
              items: [
                {
                  id: `item-${timestamp}`,
                  locator: "42-45",
                  label: "page",
                  uris: [`http://zotero.org/users/local/items/item-${timestamp}`],
                  itemData: {
                    id: `item-${timestamp}`,
                    type: "article-journal",
                    title: itemTitle,
                    author: [{ family: "Yilmaz", given: "Ahmet" }],
                    issued: { "date-parts": [[2024]] },
                    "container-title": "Turk Bilgisayar ve Matematik Egitimi Dergisi",
                    volume: 15,
                    issue: 2,
                  },
                },
              ],
              formattedText: formattedCit,
            },
            " ve metin akisi devam etmektedir.",
          ],
        },
      ],
      bibliography: {
        heading: "Kaynakca",
        asField: true,
        entries: [
          `Yilmaz, A. (2024). ${itemTitle}. <i>Turk Bilgisayar ve Matematik Egitimi Dergisi</i>, 15(2), 42–45.`,
        ],
      },
    });

    // Verify initial fixture validity
    const initialExtracted = await importDocxZoteroFields(docxBuffer);
    expect(initialExtracted).toHaveLength(1);
    expect(initialExtracted[0].citationID).toBe(citationId);
    expect(initialExtracted.bibliography).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 2: Sign up fresh student account on live site
    // -------------------------------------------------------------------------
    await page.goto("/signup");
    await expect(page).toHaveTitle(/CiteDocs/i);
    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(studentName);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();

    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    // -------------------------------------------------------------------------
    // Step 3: Upload Word DOCX fixture via multipart POST /api/documents/upload
    // -------------------------------------------------------------------------
    const uploadRes = await page.evaluate(
      async ({ bufferBytes, filename }) => {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(bufferBytes)], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        formData.append("file", blob, filename);
        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });
        return { status: res.status, data: await res.json() };
      },
      { bufferBytes: Array.from(docxBuffer), filename: `Zotero_Word_${timestamp}.docx` },
    );

    expect(uploadRes.status).toBe(201);
    const docId = uploadRes.data.document.id;
    expect(docId).toBeTruthy();

    // Verify server-side citation extraction via GET /api/documents/:id/citations
    const citationsRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/documents/${id}/citations`);
      return { status: res.status, data: await res.json() };
    }, docId);

    expect(citationsRes.status).toBe(200);
    expect(citationsRes.data.citations).toHaveLength(1);
    expect(citationsRes.data.citations[0].code).toContain("ADDIN ZOTERO_ITEM CSL_CITATION");
    expect(citationsRes.data.bibliography?.code).toContain("ADDIN ZOTERO_BIBL");

    // -------------------------------------------------------------------------
    // Step 4: Open document in ONLYOFFICE editor
    // -------------------------------------------------------------------------
    await page.goto(`/editor?doc=${docId}`);
    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });

    // Wait for ONLYOFFICE editor iframe to be mounted
    const frameLoc = page.locator('iframe[name="frameEditor"], iframe').first();
    await expect(frameLoc).toBeVisible({ timeout: 25_000 });

    const zoteroOpenBtn = page.getByTestId("oo-zotero-open");
    await expect(zoteroOpenBtn).toBeEnabled({ timeout: 60_000 });

    // -------------------------------------------------------------------------
    // Step 5: Edit document in ONLYOFFICE & trigger force-save (Ctrl+S)
    // -------------------------------------------------------------------------
    const editMarker = `[Edited-In-ONLYOFFICE-${timestamp}]`;
    const insertSuccess = await page.evaluate((marker) => {
      try {
        const frame = document.querySelector('iframe[name="frameEditor"]') as HTMLIFrameElement | null;
        const win = frame?.contentWindow as
          | (Window & {
              Asc?: {
                scope?: { marker: string };
                editor?: { callCommand: (fn: () => void) => void };
              };
            })
          | null;
        if (typeof win?.Asc?.editor?.callCommand === "function") {
          win.Asc.scope = { marker };
          win.Asc.editor.callCommand(() => {
            // @ts-expect-error ONLYOFFICE internal Api
            const oDoc = Api.GetDocument();
            // @ts-expect-error ONLYOFFICE internal Api
            const oPara = Api.CreateParagraph();
            // @ts-expect-error ONLYOFFICE internal Api
            oPara.AddText(`ONLYOFFICE Edit Satiri: ${Asc.scope.marker}`);
            oDoc.Push(oPara);
          });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }, editMarker);
    expect(insertSuccess).toBe(true);

    const initialMeta = await page.evaluate(async (id) => {
      const res = await fetch("/api/documents");
      const data = await res.json();
      return (data.documents || []).find((d: { id: string }) => d.id === id);
    }, docId);
    const initialUpdatedAt = new Date(initialMeta.updatedAt).getTime();

    // Focus viewer canvas inside ONLYOFFICE iframe to ensure Ctrl+S reaches the editor
    await page.evaluate(() => {
      const frame = document.querySelector('iframe[name="frameEditor"]') as HTMLIFrameElement | null;
      const doc = frame?.contentDocument || (frame?.contentWindow as Window | undefined)?.document;
      const viewerCanvas = doc?.getElementById("id_viewer") || doc?.querySelector("canvas");
      if (viewerCanvas) {
        viewerCanvas.focus?.();
        viewerCanvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 400, clientY: 400 }));
      }
    });
    await page.keyboard.type(" [Canli Klavye]");
    await page.waitForTimeout(500);
    await page.keyboard.press("Control+s");

    // Wait up to 35 seconds for force-save callback to register
    let saved = false;
    for (let i = 0; i < 35; i++) {
      await page.waitForTimeout(1000);
      const meta = await page.evaluate(async (id) => {
        const res = await fetch("/api/documents");
        const data = await res.json();
        return (data.documents || []).find((d: { id: string }) => d.id === id);
      }, docId);
      if (meta && new Date(meta.updatedAt).getTime() > initialUpdatedAt) {
        saved = true;
        break;
      }
    }
    expect(saved).toBe(true);

    // -------------------------------------------------------------------------
    // Step 6: Download saved DOCX binary and assert field code preservation
    // -------------------------------------------------------------------------
    const downloadRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/documents/${id}/download`);
      const buf = await res.arrayBuffer();
      return { status: res.status, bytes: Array.from(new Uint8Array(buf)) };
    }, docId);

    expect(downloadRes.status).toBe(200);
    const downloadedBuffer = Buffer.from(downloadRes.bytes);
    expect(downloadedBuffer.length).toBeGreaterThan(1000);

    // Unzip and inspect raw OpenXML
    const downloadedZip = await JSZip.loadAsync(downloadedBuffer);
    const downloadedDocXml = await downloadedZip.file("word/document.xml")?.async("string");

    // Definitively assert Zotero Word field codes survived ONLYOFFICE save & download
    expect(downloadedDocXml).toContain("ADDIN ZOTERO_ITEM");
    expect(downloadedDocXml).toContain("CSL_CITATION");
    expect(downloadedDocXml).toContain(citationId);
    expect(downloadedDocXml).toContain("ADDIN ZOTERO_BIBL");
    expect(downloadedDocXml).toContain("CSL_BIBLIOGRAPHY");
    expect(downloadedDocXml).toContain(editMarker);

    // Also assert with importDocxZoteroFields parser
    const reimported = await importDocxZoteroFields(downloadedBuffer);
    expect(reimported).toHaveLength(1);
    expect(reimported[0].citationID).toBe(citationId);
    expect(reimported.bibliography).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 7: Clean up test document
    // -------------------------------------------------------------------------
    await page.goto("/documents");
    await expect(page.getByTestId("documents-grid-section")).toBeVisible();
    const docCard = page.getByTestId(`document-card-${docId}`);
    if (await docCard.isVisible()) {
      page.once("dialog", async (dialog) => {
        await dialog.accept();
      });
      await page.getByTestId(`delete-doc-${docId}`).click();
      await expect(docCard).not.toBeVisible({ timeout: 10_000 });
    }
  });

  test.fixme(
    "Requirement 1 [FIXME ZC-01]: ODT LibreOffice Zotero reference marks survive ONLYOFFICE round-trip",
    async () => {
      // Confirmed Bug ZC-01: ONLYOFFICE Document Server strips LibreOffice Zotero reference marks
      // (<text:reference-mark-start text:name="ZOTERO_ITEM CSL_CITATION ..."/>) upon save/export,
      // converting citations to unlinked plain text.
    },
  );

  test.fixme(
    "Requirement 1 [FIXME ZC-02]: CiteDocs /api/documents/:id/citations extracts Zotero citations from ODT files",
    async () => {
      // Confirmed Bug ZC-02: apps/server/src/documents/zoteroFields.ts only inspects word/document.xml
      // and returns empty citations for any ODF (.odt) document.
    },
  );

  test("Requirement 2: Full CSL style repository (10,000+ styles) and local bundle are accessible from editor origin", async ({
    request,
  }) => {
    // 1. Verify local bundle styles.json is served with 2,864 independent styles
    const localRes = await request.get(
      "https://docs.sifirdanbire.com.tr/oo/sdkjs-plugins/zotero/resources/csl/styles.json",
    );
    expect(localRes.status()).toBe(200);
    const localStyles = await localRes.json();
    expect(Array.isArray(localStyles)).toBe(true);
    expect(localStyles.length).toBe(2864);

    // 2. Verify remote full Zotero CSL repository styles.json is reachable and has 10,800+ styles
    const remoteRes = await request.get(
      "https://www.zotero.org/styles-files/styles.json",
    );
    expect(remoteRes.status()).toBe(200);
    expect(remoteRes.headers()["access-control-allow-origin"]).toBe("*");
    const remoteStyles = await remoteRes.json();
    expect(Array.isArray(remoteStyles)).toBe(true);
    expect(remoteStyles.length).toBeGreaterThan(10800);

    // 3. Verify specific Turkish academic citation styles are reachable in the repository
    const turkishStyle = remoteStyles.find(
      (s: { name: string; title: string }) =>
        s.name.includes("turkiye-bilimsel") ||
        s.name.includes("turkish-journal") ||
        s.name.includes("istanbul-universitesi"),
    );
    expect(turkishStyle).toBeDefined();

    // 4. Verify direct CSL download from zotero.org/styles with CORS
    const cslRes = await request.get("https://www.zotero.org/styles/apa");
    expect(cslRes.status()).toBe(200);
    expect(cslRes.headers()["access-control-allow-origin"]).toBe("*");
    const cslXml = await cslRes.text();
    expect(cslXml).toContain("<style");
    expect(cslXml).toContain("American Psychological Association");
  });

  test("Requirement 2 [RESOLVED ZC-03 & ZC-05]: CiteDocs style picker is reachable inside ONLYOFFICE without prior Zotero account linking and search results are capped", async ({
    page,
    request,
  }) => {
    // 1. Verify backend style search endpoint is functional, cached, and limits results to 50 (ZC-05)
    const stylesApiRes = await request.get("/api/styles?q=ieee");
    expect(stylesApiRes.status()).toBe(200);
    const stylesData = await stylesApiRes.json();
    expect(Array.isArray(stylesData.styles)).toBe(true);
    expect(stylesData.styles.length).toBeLessThanOrEqual(50);
    expect(stylesData.styles[0].id).toBe("ieee");

    // 2. Sign up a fresh student account (with no linked Zotero account)
    const timestamp = Date.now();
    const studentEmail = `qa+stylepicker_${timestamp}@example.com`;
    const password = "StrongStudentPassword123!";

    await page.goto("/signup");
    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(`Style Picker Student ${timestamp}`);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();

    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    // 3. Create a new document
    await page.getByTestId("new-document-button").click();
    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });

    // 4. Verify StylePicker is present on the top bar and accessible WITHOUT linking Zotero (ZC-03)
    const styleBtn = page.getByTestId("oo-style-picker-btn");
    await expect(styleBtn).toBeVisible({ timeout: 15_000 });
    await expect(styleBtn).toBeEnabled();

    // Default style label is APA 7th
    const styleLabel = page.getByTestId("oo-style-current-label");
    await expect(styleLabel).toContainText(/APA 7/i);

    // 5. Open dropdown and verify popular pinned styles (APA 7, IEEE, TÜBİTAK, etc.)
    await styleBtn.click();
    const dropdown = page.getByTestId("oo-style-picker-dropdown");
    await expect(dropdown).toBeVisible();

    await expect(page.getByTestId("oo-style-item-apa")).toBeVisible();
    await expect(page.getByTestId("oo-style-item-ieee")).toBeVisible();
    await expect(
      page.getByTestId("oo-style-item-turkiye-bilimsel-ve-teknolojik-arastirma-kurumu"),
    ).toBeVisible();

    // 6. Search for TÜBİTAK with Turkish normalization and assert debounced search <= 50 items (ZC-05)
    const searchInput = page.getByTestId("oo-style-search-input");
    await searchInput.fill("tubitak");
    await expect(
      page.getByTestId("oo-style-item-turkiye-bilimsel-ve-teknolojik-arastirma-kurumu"),
    ).toBeVisible({ timeout: 5_000 });

    // 7. Select TÜBİTAK style and verify applied notice & updated trigger button label
    await page
      .getByTestId("oo-style-item-turkiye-bilimsel-ve-teknolojik-arastirma-kurumu")
      .click();
    await expect(dropdown).not.toBeVisible();
    await expect(styleLabel).toContainText(/TÜBİTAK/i);
    await expect(page.getByTestId("oo-notice")).toContainText(/Atıf stili güncellendi/i);
  });
});
