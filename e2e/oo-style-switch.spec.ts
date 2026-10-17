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

test.describe("ONLYOFFICE In-Place Citation Style Switch Flow (APA -> IEEE -> APA)", () => {
  test.setTimeout(180_000);

  const timestamp = Date.now();
  const studentEmail = `styleswitch_${timestamp}@university.edu`;
  const studentName = `StyleSwitch ${timestamp}`;
  const password = "StrongStudentPassword123!";

  test("switches citation style in top bar: APA (LeCun vd., 2015) -> IEEE [1] -> APA, updates bibliography, persists choice, and preserves Zotero field codes", async ({
    page,
    context,
  }) => {
    // Monitor all console logs and errors across all frames
    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      const line = `[BROWSER ${msg.type()}] ${msg.text()}`;
      consoleLogs.push(line);
      console.log(line);
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      console.log(`[PAGEERROR] ${err.message}`);
      consoleErrors.push(err.message);
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
      id: "ITEM_LECUN",
      type: "article-journal",
      title: "Deep Learning",
      author: [
        { family: "LeCun", given: "Yann" },
        { family: "Bengio", given: "Yoshua" },
        { family: "Hinton", given: "Geoffrey" },
      ],
      issued: { "date-parts": [[2015]] },
      "container-title": "Nature",
      volume: "521",
      page: "436-444",
    };

    const jsonItem = {
      key: "ITEM_LECUN",
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
        key: "ITEM_LECUN",
        version: 1,
        itemType: "journalArticle",
        title: "Deep Learning",
        creators: [
          { creatorType: "author", firstName: "Yann", lastName: "LeCun" },
          { creatorType: "author", firstName: "Yoshua", lastName: "Bengio" },
          { creatorType: "author", firstName: "Geoffrey", lastName: "Hinton" },
        ],
        publicationTitle: "Nature",
        volume: "521",
        issue: "7553",
        pages: "436-444",
        date: "2015",
      },
      links: {
        self: { href: "https://api.zotero.org/users/12345/items/ITEM_LECUN" },
        alternate: { href: "https://www.zotero.org/users/12345/items/ITEM_LECUN" },
      },
    };

    await context.route("https://api.zotero.org/**", async (route) => {
      const url = new URL(route.request().url());
      const pathPart = url.pathname;
      const format = url.searchParams.get("format");

      if (pathPart === "/" || pathPart === "") {
        return route.fulfill({ status: 200, contentType: "text/plain", body: "Zotero API" });
      }
      if (pathPart.includes("/groups")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      if (pathPart.includes("/items")) {
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

    // 2. Sign up student user
    await page.goto("/signup");
    await expect(page).toHaveTitle(/CiteDocs/i);

    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(studentName);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();

    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15000 });

    // 3. Create a new DOCX document
    const newDocBtn = page.getByTestId("new-doc-dropdown-btn");
    await expect(newDocBtn).toBeVisible();
    await newDocBtn.click();

    const createDocxBtn = page.getByTestId("create-docx-btn");
    await expect(createDocxBtn).toBeVisible();
    await createDocxBtn.click();

    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20000 });
    const editorUrl = new URL(page.url());
    const docId = editorUrl.searchParams.get("doc");
    expect(docId).toBeTruthy();

    // 4. Wait for ONLYOFFICE editor iframe and Zotero button
    const frameLoc = page.locator('iframe[name="frameEditor"], iframe').first();
    await expect(frameLoc).toBeVisible({ timeout: 30000 });

    const zoteroOpenBtn = page.getByTestId("oo-zotero-open");
    await expect(zoteroOpenBtn).toBeEnabled({ timeout: 60000 });

    // Style picker button
    const stylePickerBtn = page.getByTestId("oo-style-picker-btn");
    await expect(stylePickerBtn).toBeVisible({ timeout: 10000 });
    const currentLabel = page.getByTestId("oo-style-current-label");
    await expect(currentLabel).toHaveText("APA 7th", { timeout: 10000 });

    // 5. Open Zotero plugin panel and insert citation + bibliography under APA
    await zoteroOpenBtn.click();

    const zoteroFrame = page
      .frameLocator('iframe[name="frameEditor"]')
      .frameLocator('iframe[name="pluginFrameEditor"], iframe[src*="zotero"]');

    await expect(zoteroFrame.locator("body")).toBeVisible({ timeout: 20000 });

    const docItem = zoteroFrame.locator("#docsHolder .doc").first();
    await expect(docItem).toBeVisible({ timeout: 20000 });
    await expect(docItem).toContainText("Deep Learning");

    // Select the item and insert citation
    const checkbox = docItem.locator(".checkbox-container, input[type='checkbox']").first();
    await checkbox.click();

    const insertCitationBtn = zoteroFrame.locator("#insertLinkBtn");
    await expect(insertCitationBtn).toBeEnabled({ timeout: 10000 });
    await insertCitationBtn.click();
    console.log("[E2E Style Switch] Inserted citation under APA.");

    await page.waitForTimeout(2500);

    // Insert bibliography
    const insertBibBtn = zoteroFrame.locator("#insertBibBtn");
    await expect(insertBibBtn).toBeVisible({ timeout: 10000 });
    await insertBibBtn.click();
    console.log("[E2E Style Switch] Inserted bibliography under APA.");

    await page.waitForTimeout(2500);

    // Helper to read plugin citations
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
        if (!svc) return { citations: [] as CitationItemRecord[], plainCitations: [] as string[] };
        const citations = svc._storage?.getAllCitationsInJson?.() || [];
        const plainCitations = citations.map((c) => c.properties?.plainCitation || "");
        return { citations, plainCitations };
      });
    };

    // Helper to read document text from ONLYOFFICE editor via plugin callCommand
    const getEditorDocText = async () => {
      return await zoteroFrame.locator("body").evaluate(async () => {
        return new Promise<string>((resolve) => {
          const timer = setTimeout(() => resolve(""), 3000);
          try {
            const asc = (window as unknown as {
              Asc?: {
                plugin?: {
                  callCommand: (cmd: () => string, u: boolean, d: boolean, cb: (res: string) => void) => void;
                };
              };
            }).Asc;
            if (asc?.plugin?.callCommand) {
              asc.plugin.callCommand(
                () => {
                  const doc = Api.GetDocument();
                  let text = "";
                  const count = doc.GetElementsCount();
                  for (let i = 0; i < count; i++) {
                    const el = doc.GetElement(i);
                    if (el && typeof el.GetText === "function") {
                      text += el.GetText() + " ";
                    }
                  }
                  return text;
                },
                false,
                false,
                (text: string) => {
                  clearTimeout(timer);
                  resolve(text || "");
                },
              );
            } else {
              clearTimeout(timer);
              resolve("");
            }
          } catch {
            clearTimeout(timer);
            resolve("");
          }
        });
      });
    };

    const apaCitations = await getPluginCitations();
    console.log("[E2E Style Switch] APA citations:", JSON.stringify(apaCitations));
    expect(apaCitations.plainCitations.join(" ")).toMatch(/LeCun/i);

    const docTextApaInitial = await getEditorDocText();
    console.log(`[E2E Style Switch] Document text under initial APA: "${docTextApaInitial}"`);
    if (docTextApaInitial) {
      expect(docTextApaInitial).toMatch(/LeCun/i);
    }

    // 6. NOW: Switch to IEEE in top-bar StylePicker
    await stylePickerBtn.click();
    const ieeeOption = page.getByTestId("oo-style-item-ieee");
    await expect(ieeeOption).toBeVisible({ timeout: 5000 });
    await ieeeOption.click();

    // Verify top bar updates to IEEE
    await expect(currentLabel).toHaveText("IEEE", { timeout: 10000 });

    // Wait for in-place style switch to process
    await page.waitForTimeout(3000);

    // Verify Zotero error banner does NOT show "Yenileme başarısız oldu"
    const zoteroErrorBox = zoteroFrame.locator("#errorWrapper, .banner-error, .banner-warning");
    const errorText = (await zoteroErrorBox.textContent().catch(() => "")) || "";
    console.log(`[E2E Style Switch] Plugin error text after IEEE switch: "${errorText}"`);
    expect(errorText).not.toContain("Yenileme başarısız oldu");
    expect(errorText).not.toContain("Failed to refresh");

    // Verify plugin plainCitation changed to [1]
    const ieeeCitations = await getPluginCitations();
    console.log("[E2E Style Switch] IEEE citations:", JSON.stringify(ieeeCitations));
    expect(ieeeCitations.plainCitations.join(" ")).toContain("[1]");

    // Verify editor text changed to [1]
    const docTextIeee = await getEditorDocText();
    console.log(`[E2E Style Switch] Document text after IEEE switch: "${docTextIeee}"`);
    if (docTextIeee) {
      expect(docTextIeee).toContain("[1]");
    }

    // 7. Switch back to APA
    await stylePickerBtn.click();
    const apaOption = page.getByTestId("oo-style-item-apa");
    await expect(apaOption).toBeVisible({ timeout: 5000 });
    await apaOption.click();

    await expect(currentLabel).toHaveText("APA 7th", { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Verify plugin plainCitation restored author-date
    const restoredApa = await getPluginCitations();
    console.log("[E2E Style Switch] Restored APA citations:", JSON.stringify(restoredApa));
    expect(restoredApa.plainCitations.join(" ")).toMatch(/LeCun/i);

    // Verify editor text restored author-date
    const docTextApaRestored = await getEditorDocText();
    console.log(`[E2E Style Switch] Document text after restoring APA: "${docTextApaRestored}"`);
    if (docTextApaRestored) {
      expect(docTextApaRestored).toMatch(/LeCun/i);
    }

    // 8. Switch to IEEE once more and verify reload persistence
    await stylePickerBtn.click();
    await (await page.getByTestId("oo-style-item-ieee")).click();
    await expect(currentLabel).toHaveText("IEEE", { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Verify plugin citation is [1]
    const finalIeee = await getPluginCitations();
    expect(finalIeee.plainCitations.join(" ")).toContain("[1]");

    // Reload page (F5) and verify style choice is persisted per document
    await page.reload();
    await expect(page.locator('iframe[name="frameEditor"], iframe').first()).toBeVisible({ timeout: 30000 });
    await expect(currentLabel).toHaveText("IEEE", { timeout: 10000 });

    // Verify IEEE style preference is persisted in Word OpenXML (docProps/custom.xml)
    const downloadRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/documents/${id}/download`);
      const buf = await res.arrayBuffer();
      return { status: res.status, bytes: Array.from(new Uint8Array(buf)) };
    }, docId);
    expect(downloadRes.status).toBe(200);

    const JSZip = await getJSZip();
    const downloadedZip = await JSZip.loadAsync(Buffer.from(downloadRes.bytes));
    const customXml = (await downloadedZip.file("docProps/custom.xml")?.async("string")) || "";
    expect(customXml).toContain("ZOTERO_PREF");
    expect(customXml).toContain("ieee");
    console.log("[E2E Style Switch] Verified ZOTERO_PREF with ieee in docProps/custom.xml after reload.");
  });
});
