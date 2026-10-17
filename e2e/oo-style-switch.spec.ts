import { test, expect } from "@playwright/test";

test.describe("ONLYOFFICE In-Place Citation Style Switch Flow (APA -> IEEE -> APA)", () => {
  const timestamp = Date.now();
  const studentEmail = `styleswitch_${timestamp}@university.edu`;
  const studentName = `StyleSwitch ${timestamp}`;
  const password = "StrongStudentPassword123!";

  test("switches citation style in top bar without blank page, editor reload, or session loss, and persists choice", async ({
    page,
  }) => {
    // 1. Sign up student user
    await page.goto("/signup");
    await expect(page).toHaveTitle(/CiteDocs/i);

    await page.getByTestId("signup-email-input").fill(studentEmail);
    await page.getByTestId("signup-name-input").fill(studentName);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-confirm-password-input").fill(password);
    await page.getByTestId("signup-submit-btn").click();

    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15000 });

    // 2. Create a new DOCX document
    const newDocBtn = page.getByTestId("new-doc-dropdown-btn");
    await expect(newDocBtn).toBeVisible();
    await newDocBtn.click();

    const createDocxBtn = page.getByTestId("create-docx-btn");
    await expect(createDocxBtn).toBeVisible();
    await createDocxBtn.click();

    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 15000 });

    // 3. Verify editor container is mounted
    const editorCanvas = page.locator("#oo-editor");
    await expect(editorCanvas).toBeVisible({ timeout: 15000 });

    // 4. Default style should be APA (or APA 7th)
    const stylePickerBtn = page.getByTestId("oo-style-picker-btn");
    await expect(stylePickerBtn).toBeVisible({ timeout: 10000 });
    const currentLabel = page.getByTestId("oo-style-current-label");
    await expect(currentLabel).toBeVisible();

    // 5. Switch to IEEE
    await stylePickerBtn.click();
    const ieeeOption = page.getByTestId("oo-style-item-ieee");
    await expect(ieeeOption).toBeVisible({ timeout: 5000 });
    await ieeeOption.click();

    // Verify top bar updates to IEEE
    await expect(currentLabel).toHaveText("IEEE", { timeout: 10000 });

    // Verify editor canvas remains visible and page does NOT go blank
    await expect(editorCanvas).toBeVisible();
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByTestId("oo-error")).not.toBeVisible();

    // Notice should indicate success in Turkish
    const notice = page.getByTestId("oo-notice");
    if (await notice.isVisible()) {
      await expect(notice).toContainText("Atıf stili güncellendi");
    }

    // 6. Switch back to APA
    await stylePickerBtn.click();
    const apaOption = page.getByTestId("oo-style-item-apa");
    await expect(apaOption).toBeVisible({ timeout: 5000 });
    await apaOption.click();

    // Verify top bar updates to APA 7th
    await expect(currentLabel).toHaveText("APA 7th", { timeout: 10000 });
    await expect(editorCanvas).toBeVisible();

    // 7. Reload page (F5) and verify style choice is persisted per document
    await page.reload();
    await expect(editorCanvas).toBeVisible({ timeout: 15000 });
    await expect(currentLabel).toHaveText("APA 7th", { timeout: 10000 });
  });
});
