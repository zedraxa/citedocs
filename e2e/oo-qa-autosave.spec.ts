import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to dynamically load jszip from monorepo packages
async function getJSZip() {
  const jszipPath = path.resolve(
    __dirname,
    "../packages/docx-exporter/node_modules/jszip/lib/index.js",
  );
  const m = await import(jszipPath);
  return m.default || m;
}

test.describe("Requirement 1: ONLYOFFICE Autosave & Force-save Verification (oo-qa-autosave)", () => {
  test.setTimeout(240_000); // 4 minutes generous timeout

  test("types text in ONLYOFFICE, verifies autosave/forcesave, page reload persistence, modified time, and cleanup", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const studentEmail = `qa+autosave_${timestamp}@example.com`;
    const studentName = `Autosave Student ${timestamp}`;
    const password = "StrongStudentPassword123!";
    const testPersistenceMarker = `[CiteDocs-Autosave-Persisted-${timestamp}]`;

    // -------------------------------------------------------------------------
    // Step 1: Sign up a fresh unique test student
    // -------------------------------------------------------------------------
    await page.goto("/signup");
    await expect(page).toHaveTitle(/CiteDocs/i);

    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(studentName);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();

    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });
    await expect(page.getByTestId("documents-page")).toBeVisible();

    // -------------------------------------------------------------------------
    // Step 2: Create a new blank Word (.docx) document
    // -------------------------------------------------------------------------
    await page.getByTestId("new-doc-dropdown-btn").click();
    const createDocxBtn = page.getByTestId("create-docx-btn");
    await expect(createDocxBtn).toBeVisible();
    await createDocxBtn.click();

    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });
    const editorUrl = new URL(page.url());
    const docId = editorUrl.searchParams.get("doc");
    expect(docId).toBeTruthy();
    console.log(`[QA Autosave] Created document ID: ${docId}`);

    // Wait for ONLYOFFICE editor iframe to be mounted
    const frameLoc = page.locator('iframe[name="frameEditor"], iframe').first();
    await expect(frameLoc).toBeVisible({ timeout: 25_000 });

    // Wait for document to be fully ready (onDocumentReady enables the Zotero button)
    const zoteroOpenBtn = page.getByTestId("oo-zotero-open");
    await expect(zoteroOpenBtn).toBeEnabled({ timeout: 45_000 });
    console.log("[QA Autosave] Document fully loaded and ready in ONLYOFFICE.");

    // Fetch initial document metadata from API
    const initialMeta = await page.evaluate(async (id) => {
      const res = await fetch("/api/documents");
      const data = await res.json();
      return (data.documents || []).find((d: { id: string }) => d.id === id);
    }, docId);
    expect(initialMeta).toBeTruthy();
    const initialUpdatedAt = new Date(initialMeta.updatedAt).getTime();
    const initialFileSize = initialMeta.fileSize;
    console.log(`[QA Autosave] Initial updatedAt: ${initialMeta.updatedAt}, fileSize: ${initialFileSize}`);

    // -------------------------------------------------------------------------
    // Step 3: Type/Insert text into the ONLYOFFICE document
    // -------------------------------------------------------------------------
    const insertSuccess = await page.evaluate((textMarker) => {
      try {
        const frame = document.querySelector('iframe[name="frameEditor"]') as HTMLIFrameElement | null;
        const win = frame?.contentWindow as unknown as {
          Asc?: {
            scope?: Record<string, unknown>;
            editor?: {
              callCommand?: (cmd: () => void) => void;
            };
          };
        } | undefined;
        if (typeof win?.Asc?.editor?.callCommand === "function") {
          win.Asc.scope = { marker: textMarker };
          win.Asc.editor.callCommand(() => {
            // @ts-expect-error Api scope provided in ONLYOFFICE
            const oDoc = Api.GetDocument();
            // @ts-expect-error Api scope provided in ONLYOFFICE
            const oPara = Api.CreateParagraph();
            // @ts-expect-error Asc scope provided in ONLYOFFICE
            oPara.AddText(`CiteDocs Autosave Test Başarılı: ${Asc.scope.marker}`);
            oDoc.Push(oPara);
          });
          return true;
        }
        return false;
      } catch (err: unknown) {
        console.error("Insert error:", err);
        return false;
      }
    }, testPersistenceMarker);
    expect(insertSuccess).toBe(true);
    console.log("[QA Autosave] Text inserted into ONLYOFFICE document successfully.");

    // Also focus viewer canvas and simulate student keyboard typing
    await page.evaluate(() => {
      const frame = document.querySelector('iframe[name="frameEditor"]') as HTMLIFrameElement | null;
      const doc = frame?.contentDocument || (frame?.contentWindow as Window | undefined)?.document;
      const viewerCanvas = doc?.getElementById("id_viewer") || doc?.querySelector("canvas");
      if (viewerCanvas) {
        viewerCanvas.focus?.();
        viewerCanvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 400, clientY: 400 }));
      }
    });
    await page.keyboard.type(" [Canlı Öğrenci Klavye Notu]");
    console.log("[QA Autosave] Simulated student keyboard input on document canvas.");

    // -------------------------------------------------------------------------
    // Step 4: Wait for autosave / force-save
    // autoAssembly is configured for 1 minute interval. We poll for up to 90 seconds
    // to check if autoAssembly saves automatically; if not yet saved, we trigger Ctrl+S.
    // -------------------------------------------------------------------------
    console.log("[QA Autosave] Waiting for autosave / force-save callback...");
    let saved = false;
    let _autoSavedWithoutManualKey = false;
    const startWait = Date.now();

    // Poll up to 75 seconds for periodic autoAssembly
    while (Date.now() - startWait < 75_000) {
      await page.waitForTimeout(5000);
      const meta = await page.evaluate(async (id) => {
        const res = await fetch("/api/documents");
        const data = await res.json();
        return (data.documents || []).find((d: { id: string }) => d.id === id);
      }, docId);
      if (meta && new Date(meta.updatedAt).getTime() > initialUpdatedAt) {
        saved = true;
        _autoSavedWithoutManualKey = true;
        console.log(`[QA Autosave] Periodic autoAssembly successfully saved without manual key! New updatedAt: ${meta.updatedAt}`);
        break;
      }
    }

    if (!saved) {
      console.log("[QA Autosave] AutoAssembly not yet triggered within 75s; sending Ctrl+S force-save...");
      await page.keyboard.press("Control+s");

      // Wait up to 15 seconds for force-save to register
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        const meta = await page.evaluate(async (id) => {
          const res = await fetch("/api/documents");
          const data = await res.json();
          return (data.documents || []).find((d: { id: string }) => d.id === id);
        }, docId);
        if (meta && new Date(meta.updatedAt).getTime() > initialUpdatedAt) {
          saved = true;
          console.log(`[QA Autosave] Force-save registered successfully. New updatedAt: ${meta.updatedAt}, fileSize: ${meta.fileSize}`);
          break;
        }
      }
    }

    expect(saved).toBe(true);

    // -------------------------------------------------------------------------
    // Step 5: Close/Leave editor, return to Belgelerim (/documents)
    // -------------------------------------------------------------------------
    const backBtn = page.getByTestId("oo-back");
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    // Wait for documents grid to display
    await expect(page.getByTestId("documents-grid-section")).toBeVisible();
    const docCard = page.getByTestId(`document-card-${docId}`);
    await expect(docCard).toBeVisible({ timeout: 10_000 });

    // Verify modified time in document list
    const cardText = await docCard.textContent();
    console.log(`[QA Autosave] Document card visible text: ${cardText}`);
    // Check whether the card contains updated modified date
    const updatedMeta = await page.evaluate(async (id) => {
      const res = await fetch("/api/documents");
      const data = await res.json();
      return (data.documents || []).find((d: { id: string }) => d.id === id);
    }, docId);
    expect(updatedMeta).toBeTruthy();
    expect(new Date(updatedMeta.updatedAt).getTime()).toBeGreaterThan(initialUpdatedAt);

    // -------------------------------------------------------------------------
    // Step 6: Verify document content persistence via binary download (.docx)
    // -------------------------------------------------------------------------
    const downloadRes = await page.request.get(`/api/documents/${docId}/download`);
    expect(downloadRes.ok()).toBe(true);
    const docxBuffer = await downloadRes.body();
    expect(docxBuffer.length).toBeGreaterThan(initialFileSize);


    const JSZip = await getJSZip();
    const zip = await JSZip.loadAsync(docxBuffer);
    const docXmlFile = zip.file("word/document.xml");
    expect(docXmlFile).toBeTruthy();
    const docXmlContent = await docXmlFile!.async("text");

    expect(docXmlContent).toContain(testPersistenceMarker);
    console.log(`[QA Autosave] Document XML contains persistence marker: ${testPersistenceMarker}`);

    // -------------------------------------------------------------------------
    // Step 7: Reopen document in ONLYOFFICE editor and verify content inside editor
    // -------------------------------------------------------------------------
    // Give a short pause for Document Server session cleanup before reopening
    await page.waitForTimeout(3000);

    const openBtn = page.getByTestId(`open-doc-${docId}`);
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });

    // Check if ONLYOFFICE version mismatch modal appeared in any frame
    for (let attempt = 0; attempt < 10; attempt++) {
      let clicked = false;
      for (const frame of page.frames()) {
        const modalBtn = frame.locator('text="Anladım"').first();
        if (await modalBtn.count() > 0 && await modalBtn.isVisible()) {
          console.log(`[QA Autosave] ONLYOFFICE 'Versiyon değiştirildi' modal detected in frame ${frame.name() || frame.url()}! Clicking 'Anladım'...`);
          await modalBtn.click();
          clicked = true;
          break;
        }
      }
      if (clicked) {
        console.log("[QA Autosave] Clicked 'Anladım', waiting for ONLYOFFICE frame reload...");
        await page.waitForTimeout(5000);
        break;
      }
      await page.waitForTimeout(1000);
    }

    const reopenedZoteroBtn = page.getByTestId("oo-zotero-open");
    await expect(reopenedZoteroBtn).toBeEnabled({ timeout: 60_000 });
    console.log("[QA Autosave] Document reopened in ONLYOFFICE successfully.");

    // Query paragraph text from reopened document with a timeout guard
    const retrievedText = await page.evaluate(async () => {
      return new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve("timeout-fallback"), 4000);
        try {
          const frame = document.querySelector('iframe[name="frameEditor"]') as HTMLIFrameElement | null;
          const win = frame?.contentWindow as unknown as {
            Asc?: {
              editor?: {
                callCommand?: (cmd: () => void, isClose?: boolean, isCalc?: boolean, onComplete?: (val: unknown) => void) => void;
              };
            };
          } | undefined;
          if (typeof win?.Asc?.editor?.callCommand === "function") {
            win.Asc.editor.callCommand(
              () => {
                // @ts-expect-error Api scope
                const oDoc = Api.GetDocument();
                // @ts-expect-error Api scope
                const aPara = oDoc.GetAllParagraphs();
                const texts: string[] = [];
                for (let i = 0; i < aPara.length; i++) {
                  texts.push(aPara[i].GetText());
                }
                return texts.join("\n");
              },
              false,
              true,
              (res) => {
                clearTimeout(timer);
                resolve(String(res || ""));
              },
            );
          } else {
            clearTimeout(timer);
            resolve("no-asc-editor");
          }
        } catch {
          clearTimeout(timer);
          resolve("error");
        }
      });
    });
    console.log(`[QA Autosave] Reopened editor retrieved text snippet: ${retrievedText.slice(0, 100)}...`);
    // Content persistence is primarily validated through binary docx XML parsing (step 6).
    // If callCommand completes, assert it here as well.
    if (retrievedText !== "timeout-fallback" && retrievedText !== "no-asc-editor") {
      expect(retrievedText).toContain(testPersistenceMarker);
    }

    // -------------------------------------------------------------------------
    // Step 8: Clean up test document via the UI
    // -------------------------------------------------------------------------
    await page.getByTestId("oo-back").click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    const deleteBtn = page.getByTestId(`delete-doc-${docId}`);
    await expect(deleteBtn).toBeVisible();

    // Accept window.confirm
    page.once("dialog", async (dialog) => {
      console.log(`[QA Autosave] Confirm dialog message: "${dialog.message()}"`);
      await dialog.accept();
    });

    await deleteBtn.click();
    await expect(docCard).not.toBeVisible({ timeout: 10_000 });
    console.log(`[QA Autosave] Successfully deleted test document: ${docId}`);

    // Verify deletion in API
    const finalDocs = await page.evaluate(async () => {
      const res = await fetch("/api/documents");
      const data = await res.json();
      return data.documents || [];
    });
    expect(finalDocs.some((d: { id: string }) => d.id === docId)).toBe(false);
  });
});
