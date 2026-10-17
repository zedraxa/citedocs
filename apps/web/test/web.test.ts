// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement, act } from "react";
import { waitFor } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { LegacyApp as App } from "../src/App.js";

describe("@citedocs/web", () => {
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
  });

  it("exports App component function", () => {
    expect(typeof App).toBe("function");
  });

  it("renders Google Docs chrome and TipTap editor canvas", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

    // Verify Google Docs Header
    expect(container.querySelector("header")).not.toBeNull();
    expect(container.textContent).toContain("Scientific Writing Assignment");

    // Verify Action Toolbar controls exist
    expect(container.querySelector("button[title*='Bold']")).not.toBeNull();
    expect(container.querySelector("button[title*='Italic']")).not.toBeNull();
    expect(container.querySelector("button[title*='Underline']")).not.toBeNull();
    expect(container.querySelector("button[title*='Add Citation']")).not.toBeNull();

    // Verify TipTap ProseMirror editable canvas surface is mounted
    const tiptapSurface = container.querySelector(".tiptap.ProseMirror");
    expect(tiptapSurface).not.toBeNull();
    expect(tiptapSurface?.getAttribute("contenteditable")).toBe("true");

    // Verify Citation atom nodes rendered inside document canvas
    const citationNode = container.querySelector(".citedocs-citation");
    expect(citationNode).not.toBeNull();

    // Verify Collaborative Presence Avatars and Connection Status Indicator in Docs Chrome
    const statusIndicator = container.querySelector("[data-testid='collab-status']");
    expect(statusIndicator).not.toBeNull();

    const presenceAvatars = container.querySelector("[data-testid='collab-presence']");
    expect(presenceAvatars).not.toBeNull();

    // Footer shows document ID
    expect(container.querySelector("footer")?.textContent).toContain("doc: demo-document");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("reads document ID and user parameters from URL and renders custom presence", async () => {
    // Simulate window.location.search with ?doc=assignment-quantum&user=Niels%20Bohr&color=%2316a34a
    const originalSearch = window.location.search;
    const win = window as unknown as { location?: URL };
    delete win.location;
    win.location = new URL(
      "http://localhost:5173/?doc=assignment-quantum&user=Niels%20Bohr&color=%2316a34a",
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

    // Header presence contains Niels Bohr's initials "NB"
    const presenceContainer = container.querySelector("[data-testid='collab-presence']");
    expect(presenceContainer).not.toBeNull();
    expect(presenceContainer?.textContent).toContain("NB");

    // Footer displays the custom document ID from the URL
    expect(container.querySelector("footer")?.textContent).toContain("doc: assignment-quantum");

    await act(async () => {
      root.unmount();
    });
    container.remove();

    // Restore location
    win.location = new URL(`http://localhost:5173/${originalSearch}`);
  });

  describe("Add by Identifier Integration in App", () => {
    const mockNatureResponse = {
      success: true,
      userId: "demo-user",
      items: [
        {
          id: "nature-libby-2021",
          title: "The changing landscape of atherosclerosis",
          itemType: "journalArticle",
          publicationTitle: "Nature",
          parsedDate: "2021-04-21",
          date: "2021-04-21",
          doi: "10.1038/s41586-021-03392-y",
          DOI: "10.1038/s41586-021-03392-y",
          creators: [
            {
              creatorType: "author",
              firstName: "Peter",
              lastName: "Libby",
            },
          ],
        },
      ],
      item: {
        id: "nature-libby-2021",
        title: "The changing landscape of atherosclerosis",
        itemType: "journalArticle",
        publicationTitle: "Nature",
        parsedDate: "2021-04-21",
        date: "2021-04-21",
        doi: "10.1038/s41586-021-03392-y",
        DOI: "10.1038/s41586-021-03392-y",
        creators: [
          {
            creatorType: "author",
            firstName: "Peter",
            lastName: "Libby",
          },
        ],
      },
    };

    it("opens Add by Identifier modal, submits DOI, displays result card, and appends to library", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockNatureResponse,
      });
      globalThis.fetch = fetchMock;

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(createElement(App));
      });
      await act(async () => {
        await vi.dynamicImportSettled();
      });
      await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

      // 1. Click "Add by Identifier" in toolbar
      const addByIdBtn = container.querySelector(
        "[data-testid='add-by-identifier-btn']",
      ) as HTMLButtonElement;
      expect(addByIdBtn).not.toBeNull();

      await act(async () => {
        addByIdBtn.click();
      });

      // 2. Modal is open and Add by Identifier component is mounted
      const modal = container.querySelector("[data-testid='zotero-modal']");
      expect(modal).not.toBeNull();

      const input = container.querySelector("[data-testid='identifier-input']") as HTMLInputElement;
      expect(input).not.toBeNull();

      // 3. Fill DOI and submit
      await act(async () => {
        input.value = "10.1038/s41586-021-03392-y";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      const form = container.querySelector("[data-testid='identifier-form']") as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      // 4. Assert fetch was invoked correctly
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/items/from-identifier");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["X-User-Id"]).toBeDefined();
      expect(JSON.parse(String(init.body))).toEqual({
        identifier: "10.1038/s41586-021-03392-y",
      });

      // 5. Result card appears in UI
      const resultCard = container.querySelector("[data-testid='identifier-result']");
      expect(resultCard).not.toBeNull();
      expect(container.querySelector("[data-testid='result-title']")?.textContent).toContain(
        "atherosclerosis",
      );
      expect(container.querySelector("[data-testid='result-authors']")?.textContent).toContain(
        "Peter Libby",
      );
      expect(container.querySelector("[data-testid='result-year']")?.textContent).toBe("2021");
      expect(container.querySelector("[data-testid='result-doi']")?.textContent).toContain(
        "10.1038/s41586-021-03392-y",
      );

      // 6. Switch to Search Library tab to confirm item was appended to library list
      const searchTab = container.querySelector("[data-testid='tab-search']") as HTMLButtonElement;
      await act(async () => {
        searchTab.click();
      });

      const libraryList = container.querySelector("[data-testid='library-items-list']");
      expect(libraryList?.textContent).toContain("atherosclerosis");
      expect(libraryList?.textContent).toContain("Peter Libby");

      // 7. Click on the item to insert citation into document
      const itemElement = container.querySelector(
        "[data-testid='citation-item-nature-libby-2021']",
      ) as HTMLDivElement;
      expect(itemElement).not.toBeNull();

      await act(async () => {
        itemElement.click();
      });

      // Modal closes upon citation insertion
      expect(container.querySelector("[data-testid='zotero-modal']")).toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it("shows error banner and does not crash when upstream returns 502", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({
          error: "Failed to resolve identifier via translation server",
          message: "translation-server 502 Bad Gateway",
        }),
      });
      globalThis.fetch = fetchMock;

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(createElement(App));
      });
      await act(async () => {
        await vi.dynamicImportSettled();
      });
      await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

      // Open Add by Identifier
      const addByIdBtn = container.querySelector(
        "[data-testid='add-by-identifier-btn']",
      ) as HTMLButtonElement;
      await act(async () => {
        addByIdBtn.click();
      });

      const input = container.querySelector("[data-testid='identifier-input']") as HTMLInputElement;
      const form = container.querySelector("[data-testid='identifier-form']") as HTMLFormElement;

      await act(async () => {
        input.value = "10.1038/s41586-021-03392-y";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      // Error banner is visible
      const errorBanner = container.querySelector("[data-testid='identifier-error']");
      expect(errorBanner).not.toBeNull();
      expect(errorBanner?.textContent).toContain("502");

      // App is still healthy
      expect(container.querySelector(".tiptap.ProseMirror")).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it("empty submit in App does not trigger fetch request", async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(createElement(App));
      });
      await act(async () => {
        await vi.dynamicImportSettled();
      });
      await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

      const addByIdBtn = container.querySelector(
        "[data-testid='add-by-identifier-btn']",
      ) as HTMLButtonElement;
      await act(async () => {
        addByIdBtn.click();
      });

      const form = container.querySelector("[data-testid='identifier-form']") as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(fetchMock).not.toHaveBeenCalled();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });
});
