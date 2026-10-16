// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AddByIdentifier,
  resolveUserId,
  resolveApiUrl,
  extractItemDetails,
} from "../src/components/AddByIdentifier.js";

describe("AddByIdentifier Component", () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockNatureResponse = {
    success: true,
    userId: "student-alice-42",
    items: [
      {
        id: "item-nature-3392",
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
      id: "item-nature-3392",
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

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  describe("Utility functions", () => {
    it("resolveApiUrl uses default or custom URL", () => {
      expect(resolveApiUrl("http://localhost:4000/")).toBe("http://localhost:4000");
      expect(resolveApiUrl()).toBe("http://localhost:3001");
    });

    it("resolveUserId resolves URL param or fallback demo-user", () => {
      expect(resolveUserId("custom-student")).toBe("custom-student");
      expect(resolveUserId()).toBe("demo-user");
    });

    it("extractItemDetails extracts title, authors, year, and DOI accurately", () => {
      const parsed = extractItemDetails(mockNatureResponse);
      expect(parsed.title).toBe("The changing landscape of atherosclerosis");
      expect(parsed.authors).toBe("Peter Libby");
      expect(parsed.year).toBe("2021");
      expect(parsed.doi).toBe("10.1038/s41586-021-03392-y");
    });
  });

  it("submitting DOI 10.1038/s41586-021-03392-y calls POST .../api/items/from-identifier with identifier and X-User-Id header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockNatureResponse,
    });
    globalThis.fetch = fetchMock;

    await act(async () => {
      root.render(
        createElement(AddByIdentifier, {
          userId: "student-alice-42",
          apiUrl: "http://localhost:3001",
        }),
      );
    });

    const input = container.querySelector("[data-testid='identifier-input']") as HTMLInputElement;
    expect(input).not.toBeNull();

    // Type DOI into input
    await act(async () => {
      input.value = "10.1038/s41586-021-03392-y";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const form = container.querySelector("[data-testid='identifier-form']") as HTMLFormElement;
    expect(form).not.toBeNull();

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // Verify fetch was called with expected endpoint and headers
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [callUrl, callInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callUrl).toBe("http://localhost:3001/api/items/from-identifier");
    expect(callInit.method).toBe("POST");
    expect((callInit.headers as Record<string, string>)["X-User-Id"]).toBe("student-alice-42");
    expect(JSON.parse(String(callInit.body))).toEqual({
      identifier: "10.1038/s41586-021-03392-y",
    });

    // UI shows result card
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
  });

  it("handles failed upstream (502) error gracefully without crashing", async () => {
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

    await act(async () => {
      root.render(createElement(AddByIdentifier, {}));
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

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify error banner is displayed with 502 message and component did not crash
    const errorBanner = container.querySelector("[data-testid='identifier-error']");
    expect(errorBanner).not.toBeNull();
    expect(errorBanner?.textContent).toContain("502");
    expect(errorBanner?.textContent).toContain("translation-server");

    // Result card should not be present
    expect(container.querySelector("[data-testid='identifier-result']")).toBeNull();
  });

  it("empty submit does not fire a request", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await act(async () => {
      root.render(createElement(AddByIdentifier, {}));
    });

    const form = container.querySelector("[data-testid='identifier-form']") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).not.toHaveBeenCalled();

    // Also test whitespace-only submit
    const input = container.querySelector("[data-testid='identifier-input']") as HTMLInputElement;
    await act(async () => {
      input.value = "     ";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("notifies onItemAdded and allows citing result item", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockNatureResponse,
    });
    globalThis.fetch = fetchMock;

    const onItemAdded = vi.fn();
    const onCiteItem = vi.fn();

    await act(async () => {
      root.render(
        createElement(AddByIdentifier, {
          onItemAdded,
          onCiteItem,
        }),
      );
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

    expect(onItemAdded).toHaveBeenCalledTimes(1);
    expect(onItemAdded.mock.calls[0]?.[0]?.title).toContain("atherosclerosis");

    // Click "Cite in Document" button
    const citeButton = container.querySelector(
      "[data-testid='btn-cite-result']",
    ) as HTMLButtonElement;
    expect(citeButton).not.toBeNull();

    await act(async () => {
      citeButton.click();
    });

    expect(onCiteItem).toHaveBeenCalledTimes(1);
    expect(onCiteItem.mock.calls[0]?.[0]?.title).toContain("atherosclerosis");
  });
});
