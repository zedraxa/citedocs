import { test, expect } from "@playwright/test";

test.describe("ONLYOFFICE Docs CE + Zotero Full Student Flow (oo-e2e)", () => {
  const timestamp = Date.now();
  const studentEmail = `student_${timestamp}@university.edu`;
  const studentName = `Student ${timestamp}`;
  const password = "StrongStudentPassword123!";
  const viewerEmail = `collab_v_${timestamp}@university.edu`;
  const editorEmail = `collab_e_${timestamp}@university.edu`;

  test("completes the full student flow: signup -> My Documents -> create doc in ONLYOFFICE -> Zotero panel -> add by DOI -> share view/edit", async ({
    page,
  }) => {
    // -------------------------------------------------------------------------
    // Step 1: Student Signup
    // -------------------------------------------------------------------------
    await page.goto("/signup");
    await expect(page).toHaveTitle(/CiteDocs/i);

    // Verify signup form elements
    const emailInput = page.getByTestId("signup-email-input");
    const nameInput = page.getByTestId("signup-name-input");
    const passwordInput = page.getByTestId("signup-password-input");
    const confirmPasswordInput = page.getByTestId("signup-confirm-password-input");
    const submitBtn = page.getByTestId("signup-submit-btn");

    await expect(emailInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Fill in student registration
    await emailInput.fill(studentEmail);
    await nameInput.fill(studentName);
    await passwordInput.fill(password);
    await confirmPasswordInput.fill(password);
    await submitBtn.click();

    // After signup, student is automatically authenticated and redirected to /documents
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15000 });

    // -------------------------------------------------------------------------
    // Step 2: My Documents Dashboard
    // -------------------------------------------------------------------------
    await expect(page.getByTestId("documents-page")).toBeVisible();
    await expect(page.getByTestId("tab-my-documents")).toBeVisible();
    await expect(page.getByTestId("storage-quota-indicator")).toBeVisible();

    // Verify student user is authenticated
    const userMenu = page.getByTestId("user-menu-trigger");
    if (await userMenu.isVisible()) {
      await expect(userMenu).toContainText(studentName.split(" ")[0]);
    }

    // -------------------------------------------------------------------------
    // Step 3: Create a Blank Document & Open in ONLYOFFICE
    // -------------------------------------------------------------------------
    const newDocBtn = page.getByTestId("new-doc-dropdown-btn");
    await expect(newDocBtn).toBeVisible();
    await newDocBtn.click();

    const createDocxBtn = page.getByTestId("create-docx-btn");
    await expect(createDocxBtn).toBeVisible();
    await createDocxBtn.click();

    // CiteDocs creates the document and automatically redirects to the ONLYOFFICE editor
    await expect(page).toHaveURL(/.*\/editor\?doc=/, { timeout: 15000 });

    // Verify ONLYOFFICE editor page chrome is mounted
    // Verify ONLYOFFICE editor container or iframe is mounted
    const editorElement = page.locator("#oo-editor, iframe").first();
    await expect(editorElement).toBeVisible({ timeout: 15000 });

    // Verify document title or back button is present in the editor header
    const titleOrBack = page.getByTestId("oo-doc-title").or(page.getByTestId("oo-back"));
    await expect(titleOrBack.first()).toBeVisible();

    // -------------------------------------------------------------------------
    // Step 4: Zotero Header Controls, Cite Panel & Status
    // -------------------------------------------------------------------------
    // Verify 1-click Zotero header button is present in the editor header
    const zoteroOpenBtn = page.getByTestId("oo-zotero-open");
    await expect(zoteroOpenBtn).toBeVisible();

    // Verify quick cite panel toggle button is present
    const panelToggleBtn = page.getByTestId("oo-panel-toggle");
    await expect(panelToggleBtn).toBeVisible();

    // The header displays the Add-by-DOI/Identifier form and Zotero connect/linked button
    const addForm = page.getByTestId("oo-add-form");
    const addInput = page.getByTestId("oo-add-input");
    const addSubmit = page.getByTestId("oo-add-submit");

    await expect(addForm).toBeVisible();
    await expect(addInput).toBeVisible();
    await expect(addSubmit).toBeVisible();

    // Either Zotero is already linked or the "Zotero'yu bağla" action is visible
    const zoteroLinked = page.getByTestId("oo-zotero-linked");
    const zoteroConnect = page.getByTestId("oo-zotero-connect");

    const isLinked = await zoteroLinked.isVisible();
    const isConnectVisible = await zoteroConnect.isVisible();
    expect(isLinked || isConnectVisible).toBe(true);

    // Verify no application errors are shown
    await expect(page.getByTestId("oo-error")).not.toBeVisible();

    // -------------------------------------------------------------------------
    // Step 5: Add Reference by Identifier & Verify Side Citation Panel Feedback
    // -------------------------------------------------------------------------
    const testDoi = "10.1103/PhysRev.47.777";
    await addInput.fill(testDoi);
    await addSubmit.click();

    // A notice banner appears giving feedback (either success or prompt to link account)
    await expect(page.getByTestId("oo-notice")).toBeVisible({ timeout: 10000 });
    const noticeText = await page.getByTestId("oo-notice").textContent();
    expect(noticeText).toBeTruthy();

    // If account was not yet linked, the side citation panel opens automatically
    // with unlinked status card and OAuth connect action
    const citePanel = page.getByTestId("oo-cite-panel");
    if (await citePanel.isVisible()) {
      await expect(page.getByTestId("oo-panel-input")).toBeVisible();
      const panelCloseBtn = page.getByTestId("oo-panel-close");
      if (await panelCloseBtn.isVisible()) {
        await panelCloseBtn.click();
        await expect(citePanel).not.toBeVisible();
      }
    }

    // -------------------------------------------------------------------------
    // Step 6: Return to My Documents & Share Document (as View and Edit)
    // -------------------------------------------------------------------------
    const backBtn = page.getByTestId("oo-back");
    await backBtn.click();
    await expect(page).toHaveURL(/.*\/documents/, { timeout: 15000 });

    // Wait for documents list to load
    await expect(page.getByTestId("documents-grid-section")).toBeVisible();

    // Find the first document card and click its Share button
    const shareBtn = page.locator('[data-testid^="share-doc-"]').first();
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    // Verify Share Dialog opens
    const shareDialog = page.getByTestId("share-dialog");
    await expect(shareDialog).toBeVisible();

    const shareEmailInput = page.getByTestId("share-email-input");
    const shareRoleSelect = page.getByTestId("share-role-select");
    const shareSubmitBtn = page.getByTestId("share-submit-btn");

    // 6a. Share as "Viewer" (Read-only)
    await shareEmailInput.fill(viewerEmail);
    await shareRoleSelect.selectOption("viewer");
    await shareSubmitBtn.click();

    // Verify collaborator appears in the shares list with Viewer role
    await expect(shareDialog.getByText(viewerEmail)).toBeVisible({ timeout: 10000 });
    const viewerRow = shareDialog.locator("div.flex.items-center.justify-between").filter({ hasText: viewerEmail });
    await expect(viewerRow.getByText(/^(Viewer|Görüntüleyici)/i)).toBeVisible();

    // 6b. Share as "Editor" (Can edit)
    await shareEmailInput.fill(editorEmail);
    await shareRoleSelect.selectOption("editor");
    await shareSubmitBtn.click();

    // Verify second collaborator appears in the shares list with Editor role
    await expect(shareDialog.getByText(editorEmail)).toBeVisible({ timeout: 10000 });
    const editorRow = shareDialog.locator("div.flex.items-center.justify-between").filter({ hasText: editorEmail });
    await expect(editorRow.getByText(/^(Editor|Düzenleyici)/i)).toBeVisible();

    // Close the Share Dialog
    const closeBtn = page.getByTestId("share-close-btn");
    await closeBtn.click();
    await expect(shareDialog).not.toBeVisible();
  });

  test("supports configurable BASE_URL and verifies documents page loads correctly", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();

    // Navigate to root (unauthenticated user is redirected to /login or /signup)
    await page.goto("/");
    await expect(page).toHaveURL(/.*(\/login|\/documents|\/signup)/);

    // Verify CiteDocs branding is visible on the authentication / landing page
    await expect(page.getByText(/CiteDocs/i).first()).toBeVisible();
  });
});
