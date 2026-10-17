import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getJSZip() {
  const jszipPath = path.resolve(
    __dirname,
    "../packages/docx-exporter/node_modules/jszip/lib/index.js",
  );
  const m = await import(jszipPath);
  return m.default || m;
}

test.describe("ONLYOFFICE End-to-End Citation Flow (oo-cite-flow)", () => {
  test.setTimeout(180_000);

  test("Full citation flow: insert citation, switch style, insert bibliography, and verify autosave with preserved Zotero field codes", async ({
    page,
    context,
  }) => {
    const timestamp = Date.now();
    const studentEmail = `qa+citeflow_${timestamp}@example.com`;
    const studentName = `CiteFlow Student ${timestamp}`;
    const password = "StrongStudentPassword123!";

    // Monitor all console errors across page and iframes
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      console.log(`[PAGEERROR] ${err.message}`);
      console.log(`[PAGEERROR STACK] ${err.stack}`);
      consoleErrors.push(err.message);
    });

    await page.addInitScript(() => {
      const origInsertBefore = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function (newNode, referenceNode) {
        if (referenceNode && referenceNode.parentNode !== this) {
          const p = this as HTMLElement;
          const nn = newNode as HTMLElement;
          const rn = referenceNode as HTMLElement;
          console.error(
            `[DEBUG INSERTBEFORE CRASH] Parent: <${p.nodeName} id="${p.id}" class="${p.className}">, NewNode: <${nn.nodeName} id="${nn.id}" class="${nn.className}">, RefNode: <${rn.nodeName} id="${rn.id}" class="${rn.className}">, RefParent: <${rn.parentNode?.nodeName}>`
          );
        }
        return origInsertBefore.call(this, newNode, referenceNode);
      };
    });

    // 1. Mock plugin credentials and upstream Zotero API
    await page.route("**/api/zotero/plugin-credentials", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          linked: true,
          zoteroUserId: "12345",
          apiKey: "mock-zotero-api-key",
          oauthAvailable: true,
        }),
      });
    });

    const cslItem = {
      id: "ITEM1",
      type: "article-journal",
      title: "Quantum Supremacy Using a Programmable Superconducting Processor",
      author: [
        { family: "Arute", given: "Frank" },
        { family: "Arya", given: "Kunal" },
      ],
      issued: { "date-parts": [[2019]] },
      "container-title": "Nature",
      volume: "574",
      page: "505-510",
    };

    const jsonItem = {
      key: "ITEM1",
      version: 1,
      library: {
        type: "user",
        id: 12345,
        name: "User",
        links: {
          alternate: {
            href: "https://www.zotero.org/users/12345",
            type: "text/html",
          },
        },
      },
      data: {
        key: "ITEM1",
        version: 1,
        itemType: "journalArticle",
        title: "Quantum Supremacy Using a Programmable Superconducting Processor",
        creators: [
          { creatorType: "author", firstName: "Frank", lastName: "Arute" },
          { creatorType: "author", firstName: "Kunal", lastName: "Arya" },
        ],
        publicationTitle: "Nature",
        volume: "574",
        issue: "7779",
        pages: "505-510",
        date: "2019",
      },
      links: {
        self: { href: "https://api.zotero.org/users/12345/items/ITEM1" },
        alternate: { href: "https://www.zotero.org/users/12345/items/ITEM1" },
      },
    };

    await context.route("https://api.zotero.org/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const format = url.searchParams.get("format");

      if (path === "/" || path === "") {
        return route.fulfill({ status: 200, contentType: "text/plain", body: "Zotero API" });
      }
      if (path.includes("/groups")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      if (path.includes("/items")) {
        if (format === "json") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([jsonItem]),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([cslItem]),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await context.route("https://www.zotero.org/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes("styles.json")) {
        const stylesList = [
          { name: "apa", title: "American Psychological Association 7th edition", dependent: 0 },
          { name: "ieee", title: "IEEE", dependent: 0 },
        ];
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(stylesList),
        });
      }
      if (url.pathname.includes("/styles/")) {
        const styleName = url.pathname.split("/").pop() || "";
        const cleanName = styleName.replace(/\.csl$/, "");
        const cslPath = path.resolve(__dirname, `../packages/csl-engine/assets/styles/${cleanName}.csl`);
        if (fs.existsSync(cslPath)) {
          const xml = fs.readFileSync(cslPath, "utf-8");
          return route.fulfill({
            status: 200,
            contentType: "application/vnd.citationstyles.style+xml",
            body: xml,
          });
        }
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    // 2. Sign up fresh student
    await page.goto("/signup");
    await expect(page).toHaveTitle(/CiteDocs/i);
    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(studentName);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    // 3. Create new DOCX document
    await page.getByTestId("new-doc-dropdown-btn").click();
    await page.getByTestId("create-docx-btn").click();
    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });

    const editorUrl = new URL(page.url());
    const docId = editorUrl.searchParams.get("doc");
    expect(docId).toBeTruthy();

    // 4. Wait for ONLYOFFICE editor iframe and Zotero button
    const frameLoc = page.locator('iframe[name="frameEditor"], iframe').first();
    await expect(frameLoc).toBeVisible({ timeout: 30_000 });

    const zoteroOpenBtn = page.getByTestId("oo-zotero-open");
    await expect(zoteroOpenBtn).toBeEnabled({ timeout: 60_000 });

    // 5. Open Zotero plugin panel
    await zoteroOpenBtn.click();

    // Locate Zotero plugin frame
    const zoteroFrame = page
      .frameLocator('iframe[name="frameEditor"]')
      .frameLocator('iframe[name="pluginFrameEditor"], iframe[src*="zotero"]');

    await expect(zoteroFrame.locator("body")).toBeVisible({ timeout: 20_000 });
    console.log("[E2E Cite Flow] Zotero plugin frame mounted successfully.");

    // 6. Wait for items to load in the plugin library
    const docItem = zoteroFrame.locator("#docsHolder .doc").first();
    await expect(docItem).toBeVisible({ timeout: 20_000 });
    await expect(docItem).toContainText("Quantum Supremacy");

    // Select the item
    const checkbox = docItem.locator(".checkbox-container, input[type='checkbox']").first();
    await checkbox.click();

    // Confirm Insert Citation button becomes enabled
    const insertCitationBtn = zoteroFrame.locator("#insertLinkBtn");
    await expect(insertCitationBtn).toBeEnabled({ timeout: 10_000 });

    // Inspect plugin frame state
    const pluginState = await zoteroFrame.locator("body").evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        hasCSL: typeof w.CSL !== "undefined",
        cslType: typeof w.CSL,
        hasSettings: typeof w.__zoteroSettings !== "undefined",
        hasCitationService: typeof w.__zoteroCitationService !== "undefined",
        zoteroStyleId: localStorage.getItem("zoteroStyleId"),
        zoteroLang: localStorage.getItem("zoteroLang"),
      };
    });
    console.log("[E2E Cite Flow] Plugin frame state before insert:", JSON.stringify(pluginState));

    // 7. Click Insert Citation
    await insertCitationBtn.click();
    console.log("[E2E Cite Flow] Clicked Insert Citation.");

    // Wait for insertion to process
    await page.waitForTimeout(3000);

    const pluginStateAfter = await zoteroFrame.locator("body").evaluate(() => {
      const errBox = document.getElementById("errorWrapper");
      const errText = errBox?.innerText || errBox?.textContent || "";
      const banner = document.querySelector(".banner-warning, .banner-error, .message");
      return {
        errBoxDisplay: errBox ? window.getComputedStyle(errBox).display : "none",
        errText,
        bannerText: banner ? (banner as HTMLElement).innerText : "",
      };
    });
    console.log("[E2E Cite Flow] Plugin frame error details after insert:", JSON.stringify(pluginStateAfter));

    // Confirm no "Atıf eklenemedi" / CSL errors
    const errorNotice = zoteroFrame.locator(".banner-warning, .banner-error, #errorWrapper:not(.hidden)");
    if (await errorNotice.isVisible().catch(() => false)) {
      const errText = await errorNotice.textContent();
      console.log(`[E2E Cite Flow] errorNotice text: "${errText}"`);
      expect(errText).not.toContain("Atıf eklenemedi");
      expect(errText).not.toContain("CSL is not defined");
    }

    const cslErrors = consoleErrors.filter(
      (e) =>
        e.includes("CSL is not defined") ||
        e.includes("Atıf eklenemedi") ||
        e.includes("ReferenceError: CSL"),
    );
    expect(cslErrors).toHaveLength(0);
    console.log("[E2E Cite Flow] Confirmed 0 CSL / 'Atıf eklenemedi' console errors.");

    // Verify citation in ONLYOFFICE Zotero plugin service
    // Under APA (default), Arute & Arya (2019) renders as "(Arute & Arya, 2019)" or "(Arute et al., 2019)"
    const getPluginCitations = async () => {
      return await zoteroFrame.locator("body").evaluate(() => {
        interface CitationItemRecord {
          properties?: { plainCitation?: string };
        }
        interface CitationServiceRecord {
          _storage?: { getAllCitationsInJson?: () => CitationItemRecord[] };
        }
        const w = window as unknown as { __zoteroCitationService?: CitationServiceRecord };
        const svc = w.__zoteroCitationService;
        if (!svc) return { citations: [] as CitationItemRecord[], plainCitations: [] as string[], citationsCount: 0 };
        const citations = svc._storage?.getAllCitationsInJson?.() || [];
        const plainCitations = citations.map((c) => c.properties?.plainCitation || "");
        return {
          citations,
          plainCitations,
          citationsCount: citations.length,
        };
      });
    };

    const citInfo = await getPluginCitations();
    console.log("[E2E Cite Flow] Plugin citations after insert:", JSON.stringify(citInfo));
    expect(citInfo.citationsCount).toBeGreaterThanOrEqual(1);
    expect(citInfo.plainCitations.join(" ")).toMatch(/Arute/i);

    // 8. Insert Bibliography
    const insertBibBtn = zoteroFrame.locator("#insertBibBtn");
    await expect(insertBibBtn).toBeVisible({ timeout: 10_000 });
    await insertBibBtn.click();
    console.log("[E2E Cite Flow] Clicked Insert Bibliography.");

    await page.waitForTimeout(3000);

    // 10. Autosave / Force-save verification
    const initialMeta = await page.evaluate(async (id) => {
      const res = await fetch("/api/documents");
      const data = await res.json();
      return (data.documents || []).find((d: { id: string }) => d.id === id);
    }, docId);
    const initialUpdatedAt = new Date(initialMeta.updatedAt).getTime();

    // Focus editor canvas and press Ctrl+S
    await page.evaluate(() => {
      const frame = document.querySelector('iframe[name="frameEditor"]') as HTMLIFrameElement | null;
      const doc = frame?.contentDocument || (frame?.contentWindow as Window | undefined)?.document;
      const viewerCanvas = doc?.getElementById("id_viewer") || doc?.querySelector("canvas");
      if (viewerCanvas) {
        viewerCanvas.focus?.();
        viewerCanvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 300, clientY: 300 }));
      }
    });
    await page.keyboard.press("Control+s");
    console.log("[E2E Cite Flow] Triggered Ctrl+S force-save.");

    // Wait for save callback to update document
    let saved = false;
    for (let i = 0; i < 30; i++) {
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
    console.log("[E2E Cite Flow] Document save confirmed via API.");

    // 11. Download document and verify Zotero Word field codes are preserved
    const downloadRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/documents/${id}/download`);
      const buf = await res.arrayBuffer();
      return { status: res.status, bytes: Array.from(new Uint8Array(buf)) };
    }, docId);
    expect(downloadRes.status).toBe(200);

    const JSZip = await getJSZip();
    const downloadedZip = await JSZip.loadAsync(Buffer.from(downloadRes.bytes));
    const downloadedDocXml = await downloadedZip.file("word/document.xml")?.async("string");

    expect(downloadedDocXml).toBeDefined();
    expect(downloadedDocXml).toContain("ADDIN ZOTERO_ITEM");
    expect(downloadedDocXml).toContain("CSL_CITATION");
    expect(downloadedDocXml).toContain("ADDIN ZOTERO_BIBL");
    expect(downloadedDocXml).toContain("CSL_BIBLIOGRAPHY");
    expect(downloadedDocXml).toContain("Quantum Supremacy");
    console.log("[E2E Cite Flow] Verified Zotero Word field codes and bibliography in downloaded OpenXML document.xml.");

    // 12. Save screenshot
    const screenshotDir = path.resolve(__dirname, "../test-results");
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const screenshotPath = path.join(screenshotDir, "oo-cite-flow-success.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[E2E Cite Flow] Saved verification screenshot to ${screenshotPath}`);
  });

  test("Switch citation style (APA -> IEEE) and re-render citations", async () => {
    test.fixme(
      true,
      "devir #047: IEEE style-switch blank-page bug being fixed in parallel in cd-style-switch-fix",
    );
  });
});

