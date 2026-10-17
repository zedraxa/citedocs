// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act, fireEvent } from "@testing-library/react";
import { AuthProvider } from "../src/auth/AuthContext.js";
import { UserMenu } from "../src/auth/UserMenu.js";
import { DocumentsPage } from "../src/documents/DocumentsPage.js";

// Mock documents API so DocumentsPage can mount cleanly
vi.mock("../src/documents/api.js", () => ({
  fetchMyDocuments: vi.fn().mockResolvedValue({
    documents: [],
    quota: { used: 0, total: 5368709120, percentage: 0, remaining: 5368709120 },
  }),
  fetchSharedDocuments: vi.fn().mockResolvedValue({ documents: [] }),
  createBlankDocument: vi.fn(),
  uploadDocument: vi.fn(),
  renameDocument: vi.fn(),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
}));

describe("UserMenu Label Consistency & Absence of Top-Bar Toggle", () => {
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("ensures top-bar language toggle is completely absent in DocumentsPage", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          AuthProvider,
          { autoFetch: false },
          createElement(DocumentsPage)
        )
      );
      await new Promise((r) => setTimeout(r, 20));
    });

    // Old unlabeled "TR" button must not exist
    const oldToggle = container.querySelector("[data-testid='doc-lang-toggle']");
    expect(oldToggle).toBeNull();

    // No button in the header should have unlabeled "TR" or "EN" text
    const headerButtons = container.querySelectorAll("header button");
    headerButtons.forEach((btn) => {
      expect(btn.textContent?.trim()).not.toBe("TR");
      expect(btn.textContent?.trim()).not.toBe("EN");
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("ensures top-bar language toggle is completely absent in unauthenticated UserMenu", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          AuthProvider,
          { initialUser: null, autoFetch: false },
          createElement(UserMenu)
        )
      );
    });

    expect(container.querySelector("[data-testid='lang-toggle-btn']")).toBeNull();
    expect(container.querySelector("[data-testid='header-login-btn']")).not.toBeNull();
    expect(container.querySelector("[data-testid='header-signup-btn']")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("displays consistent label in UserMenu dropdown matching Turkish UI and toggles to English in lockstep", async () => {
    const mockUser = {
      id: "std-42",
      email: "ayse@universite.edu.tr",
      displayName: "Ayşe Yılmaz",
      avatarUrl: null,
      emailVerified: true,
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          AuthProvider,
          { initialUser: mockUser, initialLang: "tr", autoFetch: false },
          createElement(
            "div",
            null,
            createElement(DocumentsPage),
          )
        )
      );
      await new Promise((r) => setTimeout(r, 20));
    });

    // Initially in Turkish: DocumentsPage displays Turkish strings
    expect(container.textContent).toContain("Belgelerim");
    expect(container.textContent).toContain("Benimle Paylaşılanlar");

    // Open UserMenu dropdown
    const userMenuBtn = container.querySelector("[data-testid='user-menu-btn']") as HTMLButtonElement;
    expect(userMenuBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(userMenuBtn);
    });

    const dropdown = container.querySelector("[data-testid='user-dropdown-panel']");
    expect(dropdown).not.toBeNull();

    // Verify Turkish dropdown state: label is "Dil", active badge is "Türkçe", aria-label "Dil: Türkçe"
    const langBtn = dropdown?.querySelector("[data-testid='dropdown-lang-toggle-btn']") as HTMLButtonElement;
    expect(langBtn).not.toBeNull();
    expect(langBtn.getAttribute("aria-label")).toBe("Dil: Türkçe");
    expect(dropdown?.querySelector("[data-testid='dropdown-lang-label']")?.textContent).toBe("Dil");
    expect(dropdown?.querySelector("[data-testid='dropdown-lang-active']")?.textContent).toBe("Türkçe");
    expect(dropdown?.textContent).toContain("Belgelerim");
    expect(dropdown?.textContent).toContain("Çıkış Yap");

    // Toggling language via user menu
    await act(async () => {
      fireEvent.click(langBtn);
    });

    // The whole UI (DocumentsPage + UserMenu) switches to English simultaneously
    expect(container.textContent).toContain("My Documents");
    expect(container.textContent).toContain("Shared with Me");
    expect(langBtn.getAttribute("aria-label")).toBe("Language: English");
    expect(dropdown?.querySelector("[data-testid='dropdown-lang-label']")?.textContent).toBe("Language");
    expect(dropdown?.querySelector("[data-testid='dropdown-lang-active']")?.textContent).toBe("English");
    expect(dropdown?.textContent).toContain("My Documents");
    expect(dropdown?.textContent).toContain("Log Out");

    // Deliberate English choice is stored and marked as migrated
    expect(localStorage.getItem("citedocs_lang")).toBe("en");
    expect(localStorage.getItem("citedocs_lang_migrated")).toBe("true");

    // Toggle back to Turkish
    await act(async () => {
      fireEvent.click(langBtn);
    });

    expect(container.textContent).toContain("Belgelerim");
    expect(container.textContent).toContain("Benimle Paylaşılanlar");
    expect(langBtn.getAttribute("aria-label")).toBe("Dil: Türkçe");
    expect(dropdown?.querySelector("[data-testid='dropdown-lang-label']")?.textContent).toBe("Dil");
    expect(dropdown?.querySelector("[data-testid='dropdown-lang-active']")?.textContent).toBe("Türkçe");
    expect(localStorage.getItem("citedocs_lang")).toBe("tr");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
