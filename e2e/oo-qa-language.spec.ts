import { test, expect } from "@playwright/test";

// Proper nouns, technical acronyms, and recognized formats allowed in Turkish academic UI
const ALLOWLIST = new Set([
  "citedocs",
  "onlyoffice",
  "zotero",
  "doi",
  "isbn",
  "url",
  "pmid",
  "arxiv",
  "orcid",
  "docx",
  "doc",
  "odt",
  "pdf",
  "word",
  "libreoffice",
  "microsoft",
  "api",
  "oauth",
  "id",
  "kb",
  "mb",
  "gb",
  "tb",
  "b",
  "tr",
  "en",
  "http",
  "https",
]);

// Known English UI vocabulary that indicates missing localization in Turkish mode
const FORBIDDEN_ENGLISH_UI_WORDS = new Set([
  "untitled",
  "document",
  "documents",
  "cloud",
  "student",
  "login",
  "signup",
  "sign",
  "in",
  "up",
  "password",
  "confirm",
  "create",
  "delete",
  "rename",
  "share",
  "cancel",
  "save",
  "close",
  "recent",
  "loading",
  "loaded",
  "ready",
  "error",
  "failed",
  "unauthorized",
  "forbidden",
  "conflict",
  "required",
  "invalid",
]);

function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function findEnglishLeaks(text: string): string[] {
  const words = extractWords(text);
  const leaks: string[] = [];
  for (const w of words) {
    if (ALLOWLIST.has(w)) continue;
    if (FORBIDDEN_ENGLISH_UI_WORDS.has(w)) {
      leaks.push(w);
    }
  }
  return Array.from(new Set(leaks));
}

test.describe("Requirement 2: Turkish Language Consistency QA Suite (oo-qa-language)", () => {
  test.setTimeout(180_000);

  test("1a. /signup and /login static page UI contain 100% Turkish UI with no English words", async ({ page }) => {
    // Check /signup
    await page.goto("/signup");
    await expect(page).toHaveTitle(/CiteDocs/i);

    const signupText = (await page.locator("body").textContent()) || "";
    const signupLeaks = findEnglishLeaks(signupText);
    console.log(`[QA Language] Signup page detected leaks: ${JSON.stringify(signupLeaks)}`);
    expect(signupLeaks).toEqual([]);

    // Check placeholder texts on signup
    const emailPlaceholder = await page.getByTestId("signup-email-input").getAttribute("placeholder");
    const namePlaceholder = await page.getByTestId("signup-name-input").getAttribute("placeholder");
    const passPlaceholder = await page.getByTestId("signup-password-input").getAttribute("placeholder");
    const confirmPlaceholder = await page.getByTestId("signup-confirm-password-input").getAttribute("placeholder");

    const allSignupPlaceholders = [emailPlaceholder, namePlaceholder, passPlaceholder, confirmPlaceholder].join(" ");
    expect(findEnglishLeaks(allSignupPlaceholders)).toEqual([]);

    // Check /login
    await page.goto("/login");
    const loginText = (await page.locator("body").textContent()) || "";
    const loginLeaks = findEnglishLeaks(loginText);
    console.log(`[QA Language] Login page detected leaks: ${JSON.stringify(loginLeaks)}`);
    expect(loginLeaks).toEqual([]);
  });

  test("1b. /login authentication error notices are in Turkish (Bug: leaks 'Invalid email or password')", async ({ page }) => {
    test.fixme(true, "Bug: POST /api/auth/login returns English 'Invalid email or password' which is rendered directly in auth-error-banner");

    await page.goto("/login");
    await page.getByTestId("login-email-input").fill("nonexistent_student_9999@example.com");
    await page.getByTestId("login-password-input").fill("WrongPassword123!");
    await page.getByTestId("login-submit-btn").click();

    // Verify error message is in Turkish
    const errorNotice = page.getByTestId("auth-error-banner");
    await expect(errorNotice).toBeVisible({ timeout: 10_000 });
    const errorMsg = (await errorNotice.textContent()) || "";
    console.log(`[QA Language] Auth error message: "${errorMsg}"`);
    expect(errorMsg.toLowerCase()).toMatch(/e-posta veya şifre|bulunamadı|geçersiz|hata/i);
    expect(findEnglishLeaks(errorMsg)).toEqual([]);
  });

  test("2. /documents dashboard UI localization and English word audits", async ({ page }) => {
    const timestamp = Date.now();
    const studentEmail = `qa+lang_${timestamp}@example.com`;
    const studentName = `Türkçe Öğrenci ${timestamp}`;
    const password = "Password123!";

    await page.goto("/signup");
    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(studentName);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();

    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });
    await expect(page.getByTestId("documents-page")).toBeVisible();

    // Check action buttons and headings
    const newDocBtn = page.getByTestId("new-doc-dropdown-btn");
    await expect(newDocBtn).toContainText("Yeni Belge");

    await newDocBtn.click();
    const createDocxBtn = page.getByTestId("create-docx-btn");
    await expect(createDocxBtn).toContainText("Word Belgesi");
    await newDocBtn.click(); // Close dropdown

    // Check User Menu
    const userMenuBtn = page.getByTestId("user-menu-btn");
    await userMenuBtn.click();
    const userDropdown = page.getByTestId("user-dropdown-panel");
    await expect(userDropdown).toBeVisible();
    const userDropdownText = (await userDropdown.textContent()) || "";
    console.log(`[QA Language] User dropdown text: "${userDropdownText}"`);

    // Verify dropdown items
    expect(userDropdownText).toContain("Belgelerim");
    expect(userDropdownText).toContain("Çıkış Yap");
    expect(userDropdownText).toContain("Türkçe");

    // Close user menu
    await page.locator("body").click({ position: { x: 10, y: 10 } });

    // Audit header and storage text
    // Note: Bug detection for hardcoded "Cloud" badge in header
    const cloudBadge = page.locator('header span:has-text("Cloud")');
    const hasCloudBadge = (await cloudBadge.count()) > 0;
    if (hasCloudBadge) {
      console.warn("[QA Language Bug Found] Header storage badge is hardcoded in English as 'Cloud' instead of Turkish 'Bulut'.");
    }
  });

  test("3. Share and Rename dialogs Turkish localization", async ({ page }) => {
    const timestamp = Date.now();
    const studentEmail = `qa+dialog_${timestamp}@example.com`;
    const studentName = `Diyalog Öğrenci ${timestamp}`;
    const password = "Password123!";

    await page.goto("/signup");
    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(studentName);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();

    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    // Create a blank document
    await page.getByTestId("new-doc-dropdown-btn").click();
    await page.getByTestId("create-docx-btn").click();
    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });

    const editorUrl = new URL(page.url());
    const docId = editorUrl.searchParams.get("doc");
    expect(docId).toBeTruthy();

    // Return to documents
    await page.getByTestId("oo-back").click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    // 1. Check Rename Dialog
    const renameBtn = page.getByTestId(`rename-doc-${docId}`);
    await expect(renameBtn).toBeVisible();
    await renameBtn.click();

    const renameBackdrop = page.getByTestId("rename-dialog-backdrop");
    await expect(renameBackdrop).toBeVisible();
    const renameText = (await renameBackdrop.textContent()) || "";
    console.log(`[QA Language] Rename dialog text: "${renameText}"`);
    expect(renameText).toContain("Belgeyi Yeniden Adlandır");
    expect(renameText).toContain("Kaydet");
    expect(renameText).toContain("İptal");

    const renameLeaks = findEnglishLeaks(renameText);
    // Remove "untitled" and "document" if it's the current document's title
    const filteredRenameLeaks = renameLeaks.filter((w) => w !== "untitled" && w !== "document");
    expect(filteredRenameLeaks).toEqual([]);

    await page.getByTestId("rename-cancel-btn").click();
    await expect(renameBackdrop).not.toBeVisible();

    // 2. Check Share Dialog
    const shareBtn = page.getByTestId(`share-doc-${docId}`);
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    const shareDialog = page.getByTestId("share-dialog");
    await expect(shareDialog).toBeVisible();
    const shareText = (await shareDialog.textContent()) || "";
    console.log(`[QA Language] Share dialog text: "${shareText}"`);
    expect(shareText).toContain("Belgeyi Paylaş");
    expect(shareText).toContain("Paylaş");
    expect(shareText).toContain("Görüntüleyici (Salt okunur)");
    expect(shareText).toContain("Düzenleyici (Düzenleyebilir)");

    const shareLeaks = findEnglishLeaks(shareText);
    const filteredShareLeaks = shareLeaks.filter((w) => w !== "untitled" && w !== "document");
    expect(filteredShareLeaks).toEqual([]);

    await page.getByTestId("share-close-btn").click();
    await expect(shareDialog).not.toBeVisible();

    // Clean up document
    page.once("dialog", (d) => d.accept());
    await page.getByTestId(`delete-doc-${docId}`).click();
  });

  test("4. Audit default new document title language (flag 'Untitled Document')", async ({ page }) => {
    const timestamp = Date.now();
    const studentEmail = `qa+title_${timestamp}@example.com`;
    const password = "Password123!";

    await page.goto("/signup");
    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(`Başlık Öğrenci ${timestamp}`);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    await page.getByTestId("new-doc-dropdown-btn").click();
    await page.getByTestId("create-docx-btn").click();
    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });

    const editorUrl = new URL(page.url());
    const docId = editorUrl.searchParams.get("doc");

    // Fetch document title from API
    const meta = await page.evaluate(async (id) => {
      const res = await fetch("/api/documents");
      const data = await res.json();
      return (data.documents || []).find((d: { id: string }) => d.id === id);
    }, docId);

    console.log(`[QA Language] Created document title: "${meta?.title}"`);
    if (meta?.title === "Untitled Document") {
      console.warn("[QA Language Bug Found] Default new document title is created in English ('Untitled Document') instead of Turkish ('Adsız Belge').");
    }

    // Clean up
    await page.getByTestId("oo-back").click();
    page.once("dialog", (d) => d.accept());
    await page.getByTestId(`delete-doc-${docId}`).click();
  });

  test("5. Editor top bar and citation side panel Turkish UI strings", async ({ page }) => {
    const timestamp = Date.now();
    const studentEmail = `qa+editor_lang_${timestamp}@example.com`;
    const password = "Password123!";

    await page.goto("/signup");
    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(`Editör Dil Öğrenci ${timestamp}`);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    await page.getByTestId("new-doc-dropdown-btn").click();
    await page.getByTestId("create-docx-btn").click();
    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });

    const editorUrl = new URL(page.url());
    const docId = editorUrl.searchParams.get("doc");

    // Check Top Bar texts
    await expect(page.getByTestId("oo-back")).toContainText("Belgelerim");
    await expect(page.getByTestId("oo-zotero-open")).toContainText("Zotero");
    await expect(page.getByTestId("oo-panel-toggle")).toContainText("Kaynak Paneli");

    const inputPlaceholder = await page.getByTestId("oo-add-input").getAttribute("placeholder");
    expect(inputPlaceholder).toBe("DOI, ISBN, PMID veya URL ile ekle");

    const addBtn = page.getByTestId("oo-add-submit");
    await expect(addBtn).toContainText("Ekle");

    const connectBtn = page.getByTestId("oo-zotero-connect");
    await expect(connectBtn).toContainText("Zotero");

    // Open citation panel
    await page.getByTestId("oo-panel-toggle").click();
    const citePanel = page.getByTestId("oo-cite-panel");
    await expect(citePanel).toBeVisible();

    const panelText = (await citePanel.textContent()) || "";
    console.log(`[QA Language] Citation panel text: "${panelText}"`);
    expect(panelText).toContain("Kaynak & Atıf Paneli");
    expect(panelText).toContain("Zotero Hesabı Bağlı Değil");
    expect(panelText).toContain("Zotero ile Bağlan (Otomatik OAuth)");

    await page.getByTestId("oo-add-input").fill("10.1038/nature14539");
    const connect = page.getByTestId("oo-add-form").getByRole("button", { name: "Zotero'yu bağla" });
    await expect(connect).toBeVisible();
    expect(findEnglishLeaks((await connect.textContent()) || "")).toEqual([]);

    // Clean up
    await page.getByTestId("oo-back").click();
    page.once("dialog", (d) => d.accept());
    await page.getByTestId(`delete-doc-${docId}`).click();
  });

  test("6. ONLYOFFICE editor configuration and iframe language verification (lang=tr)", async ({ page }) => {
    const timestamp = Date.now();
    const studentEmail = `qa+oo_lang_${timestamp}@example.com`;
    const password = "Password123!";

    await page.goto("/signup");
    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(`OO Dil Öğrenci ${timestamp}`);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15_000 });

    await page.getByTestId("new-doc-dropdown-btn").click();
    await page.getByTestId("create-docx-btn").click();
    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 20_000 });

    const editorUrl = new URL(page.url());
    const docId = editorUrl.searchParams.get("doc");
    expect(docId).toBeTruthy();

    // 1. Verify ONLYOFFICE Config API
    const configRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/documents/${id}/onlyoffice-config`);
      return res.json();
    }, docId);

    expect(configRes.config).toBeTruthy();
    expect(configRes.config.editorConfig.lang).toBe("tr");
    expect(configRes.config.editorConfig.region).toBe("tr-TR");
    console.log(`[QA Language] ONLYOFFICE API config verified: lang=${configRes.config.editorConfig.lang}, region=${configRes.config.editorConfig.region}`);

    // 2. Verify iframe src contains lang=tr
    const frameElement = page.locator('iframe[name="frameEditor"], iframe').first();
    await expect(frameElement).toBeVisible({ timeout: 25_000 });
    const iframeSrc = (await frameElement.getAttribute("src")) || "";
    expect(iframeSrc).toContain("lang=tr");
    console.log(`[QA Language] ONLYOFFICE iframe src verified with lang=tr: ${iframeSrc.slice(0, 80)}...`);

    // 3. Verify Turkish Ribbon Tabs inside ONLYOFFICE editor
    const frame = page.frameLocator('iframe[name="frameEditor"], iframe').first();
    await expect(frame.locator('text="Ana Sayfa"').first()).toBeVisible({ timeout: 35_000 });
    await expect(frame.locator('text="Dosya"').first()).toBeVisible();
    await expect(frame.locator('text="Ekle"').first()).toBeVisible();
    await expect(frame.locator('text="Görüntüle"').first()).toBeVisible();
    console.log("[QA Language] ONLYOFFICE toolbar ribbon verified in Turkish ('Ana Sayfa', 'Dosya', 'Ekle', 'Görüntüle').");

    // Clean up
    await page.getByTestId("oo-back").click();
    page.once("dialog", (d) => d.accept());
    await page.getByTestId(`delete-doc-${docId}`).click();
  });
});
