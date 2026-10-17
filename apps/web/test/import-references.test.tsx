// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ImportReferences,
  PENDING_IMPORT_KEY,
} from "../src/components/ImportReferences.js";

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("ImportReferences Component", () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockPreviewResponse = {
    success: true,
    saved: false,
    total: 2,
    savedCount: 0,
    failedCount: 0,
    items: [
      {
        title: "Attention Is All You Need",
        authors: "Ashish Vaswani, Noam Shazeer",
        year: "2017",
        doi: "10.48550/arXiv.1706.03762",
        itemType: "journalArticle",
      },
      {
        title: "Deep Residual Learning for Image Recognition",
        authors: "Kaiming He, Xiangyu Zhang",
        year: "2016",
        doi: "10.1109/CVPR.2016.90",
        itemType: "conferencePaper",
      },
    ],
    rawItems: [
      { itemType: "journalArticle", title: "Attention Is All You Need" },
      { itemType: "conferencePaper", title: "Deep Residual Learning for Image Recognition" },
    ],
    message: "2 kaynak bulundu. Zotero kütüphanenize kaydetmek için 'Kütüphaneme Aktar' butonuna tıklayın.",
  };

  const mockSuccessSavedResponse = {
    success: true,
    saved: true,
    total: 2,
    savedCount: 2,
    failedCount: 0,
    savedItems: [
      {
        title: "Attention Is All You Need",
        authors: "Ashish Vaswani, Noam Shazeer",
        year: "2017",
        key: "KEY123",
      },
      {
        title: "Deep Residual Learning for Image Recognition",
        authors: "Kaiming He, Xiangyu Zhang",
        year: "2016",
        key: "KEY456",
      },
    ],
    failedItems: [],
    message: "2 kaynak Zotero kütüphanenize başarıyla eklendi.",
  };

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    sessionStorage.clear();
  });

  it("renders with Turkish labels, file dropzone by default, and format selector", () => {
    act(() => {
      root.render(createElement(ImportReferences, {}));
    });

    const panel = container.querySelector('[data-testid="import-references-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Dosya veya Metinden Kaynak İçe Aktar");
    expect(panel?.textContent).toContain("Maks. 2 MB / 500 Kaynak");

    const dropzone = container.querySelector('[data-testid="import-dropzone"]');
    expect(dropzone).not.toBeNull();
    expect(dropzone?.textContent).toContain("Bir dosya seçin veya buraya sürükleyin");

    const formatSelect = container.querySelector('[data-testid="import-format-select"]') as HTMLSelectElement;
    expect(formatSelect).not.toBeNull();
    expect(formatSelect.value).toBe("auto");
    expect(formatSelect.textContent).toContain("BibTeX (.bib)");
    expect(formatSelect.textContent).toContain("RIS (.ris)");
    expect(formatSelect.textContent).toContain("CSL-JSON (.json)");
  });

  it("switches to paste text mode when text tab is clicked", async () => {
    act(() => {
      root.render(createElement(ImportReferences, {}));
    });

    const textTab = container.querySelector('[data-testid="import-tab-text"]') as HTMLButtonElement;
    expect(textTab).not.toBeNull();

    await act(async () => {
      textTab.click();
    });

    const textarea = container.querySelector('[data-testid="import-text-input"]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.placeholder).toContain("BibTeX (@article{...}), RIS (TY  - ...) veya CSL-JSON");

    // File dropzone should not be visible
    expect(container.querySelector('[data-testid="import-dropzone"]')).toBeNull();
  });

  it("previews references when BibTeX text is entered and Preview button is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPreviewResponse,
    });
    globalThis.fetch = fetchMock;

    const onPreview = vi.fn();

    act(() => {
      root.render(
        createElement(ImportReferences, {
          onItemPreview: onPreview,
          apiUrl: "http://localhost:3001",
        }),
      );
    });

    // Switch to text tab
    const textTab = container.querySelector('[data-testid="import-tab-text"]') as HTMLButtonElement;
    await act(async () => {
      textTab.click();
    });

    const textarea = container.querySelector('[data-testid="import-text-input"]') as HTMLTextAreaElement;
    const bibtexData = "@article{vaswani2017,\n  title={Attention Is All You Need}\n}";

    await act(async () => {
      setInputValue(textarea, bibtexData);
    });

    const previewBtn = container.querySelector('[data-testid="import-preview-btn"]') as HTMLButtonElement;
    expect(previewBtn.disabled).toBe(false);

    await act(async () => {
      previewBtn.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("http://localhost:3001/api/zotero/import");
    expect(calledInit.method).toBe("POST");
    const parsedBody = JSON.parse(calledInit.body);
    expect(parsedBody.save).toBe(false);
    expect(parsedBody.data).toContain("Attention Is All You Need");

    // Check preview items rendered
    const summary = container.querySelector('[data-testid="import-summary"]');
    expect(summary?.textContent).toContain("2 kaynak bulundu");

    const previewList = container.querySelector('[data-testid="import-preview-list"]');
    expect(previewList?.textContent).toContain("Attention Is All You Need");
    expect(previewList?.textContent).toContain("Deep Residual Learning for Image Recognition");
    expect(previewList?.textContent).toContain("Ashish Vaswani, Noam Shazeer");
    expect(onPreview).toHaveBeenCalledWith(mockPreviewResponse.items);
  });

  it("submits references directly to Zotero when submit button is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockSuccessSavedResponse,
    });
    globalThis.fetch = fetchMock;

    const onImported = vi.fn();

    act(() => {
      root.render(
        createElement(ImportReferences, {
          onItemsImported: onImported,
          apiUrl: "http://localhost:3001",
        }),
      );
    });

    // Switch to text
    const textTab = container.querySelector('[data-testid="import-tab-text"]') as HTMLButtonElement;
    await act(async () => {
      textTab.click();
    });

    const textarea = container.querySelector('[data-testid="import-text-input"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(textarea, "TY  - JOUR\nTI  - Deep Residual Learning\nER  -");
    });

    const submitBtn = container.querySelector('[data-testid="import-submit-btn"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const parsedBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(parsedBody.save).toBe(true);

    const successNotice = container.querySelector('[data-testid="import-success-notice"]');
    expect(successNotice).not.toBeNull();
    expect(successNotice?.textContent).toContain("2 kaynak Zotero kütüphanenize başarıyla eklendi");
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("shows unlinked notice and inline connect button when user is not linked to Zotero (status 409)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        success: false,
        error: "ZoteroNotLinkedError",
        total: 2,
        items: mockPreviewResponse.items,
        rawItems: mockPreviewResponse.rawItems,
        message: "Zotero hesabınız bağlı değil.",
      }),
    });
    globalThis.fetch = fetchMock;

    const onConnect = vi.fn();

    act(() => {
      root.render(
        createElement(ImportReferences, {
          documentId: "doc-123",
          linked: false,
          onConnectZotero: onConnect,
        }),
      );
    });

    // Switch to text
    const textTab = container.querySelector('[data-testid="import-tab-text"]') as HTMLButtonElement;
    await act(async () => {
      textTab.click();
    });

    const textarea = container.querySelector('[data-testid="import-text-input"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(textarea, "@article{test, title={Test}}");
    });

    const submitBtn = container.querySelector('[data-testid="import-submit-btn"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    const unlinkedNotice = container.querySelector('[data-testid="import-unlinked-notice"]');
    expect(unlinkedNotice).not.toBeNull();
    expect(unlinkedNotice?.textContent).toContain("Zotero Hesabı Bağlı Değil");

    const connectBtn = container.querySelector('[data-testid="import-connect-btn"]') as HTMLButtonElement;
    expect(connectBtn).not.toBeNull();
    expect(connectBtn.textContent).toContain("Zotero'yu bağla");

    await act(async () => {
      connectBtn.click();
    });

    expect(onConnect).toHaveBeenCalledTimes(1);
    const stored = sessionStorage.getItem(PENDING_IMPORT_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.documentId).toBe("doc-123");
    expect(parsed.items).toHaveLength(2);
  });

  it("shows Turkish error message when file size exceeds 2 MB limit", async () => {
    act(() => {
      root.render(createElement(ImportReferences, {}));
    });

    const fileInput = container.querySelector('[data-testid="import-file-input"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    // Create a mock large file > 2 MB
    const largeFile = new File(["x".repeat(100)], "huge_library.bib", { type: "text/plain" });
    Object.defineProperty(largeFile, "size", { value: 3 * 1024 * 1024 }); // 3 MB

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [largeFile],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const errorDiv = container.querySelector('[data-testid="import-error"]');
    expect(errorDiv).not.toBeNull();
    expect(errorDiv?.textContent).toContain("Dosya boyutu 2 MB sınırını aşıyor");
    expect(errorDiv?.textContent).toContain("3.0 MB");
  });

  it("displays partial failures clearly in Turkish", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        saved: true,
        total: 2,
        savedCount: 1,
        failedCount: 1,
        savedItems: [mockSuccessSavedResponse.savedItems[0]],
        failedItems: [
          {
            index: 1,
            title: "Corrupt Item",
            reason: "Zotero şeması geçersiz veya eksik alan",
            code: 400,
          },
        ],
        message: "1 kaynak Zotero kütüphanenize eklendi. 1 kaynak eklenemedi.",
      }),
    });
    globalThis.fetch = fetchMock;

    act(() => {
      root.render(createElement(ImportReferences, {}));
    });

    const textTab = container.querySelector('[data-testid="import-tab-text"]') as HTMLButtonElement;
    await act(async () => {
      textTab.click();
    });

    const textarea = container.querySelector('[data-testid="import-text-input"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(textarea, "dummy data");
    });

    const submitBtn = container.querySelector('[data-testid="import-submit-btn"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    const successNotice = container.querySelector('[data-testid="import-success-notice"]');
    expect(successNotice?.textContent).toContain("1 kaynak Zotero kütüphanenize başarıyla eklendi");

    const failedNotice = container.querySelector('[data-testid="import-failed-notice"]');
    expect(failedNotice).not.toBeNull();
    expect(failedNotice?.textContent).toContain("1 kaynak eklenemedi:");
    expect(failedNotice?.textContent).toContain("Corrupt Item");
    expect(failedNotice?.textContent).toContain("Zotero şeması geçersiz veya eksik alan");
  });

  it("resumes pending import automatically if stored in sessionStorage and user is linked", async () => {
    const pendingData = {
      documentId: "doc-resume",
      items: [{ itemType: "book", title: "Resumed Book" }],
    };
    sessionStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(pendingData));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        saved: true,
        total: 1,
        savedCount: 1,
        failedCount: 0,
        savedItems: [{ title: "Resumed Book", key: "RESUMED_KEY" }],
        message: "1 kaynak Zotero kütüphanenize başarıyla eklendi.",
      }),
    });
    globalThis.fetch = fetchMock;

    await act(async () => {
      root.render(
        createElement(ImportReferences, {
          documentId: "doc-resume",
          linked: true,
        }),
      );
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const parsedBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(parsedBody.save).toBe(true);
    expect(parsedBody.items).toHaveLength(1);

    // Should clear storage
    expect(sessionStorage.getItem(PENDING_IMPORT_KEY)).toBeNull();

    const successNotice = container.querySelector('[data-testid="import-success-notice"]');
    expect(successNotice?.textContent).toContain("1 kaynak Zotero kütüphanenize başarıyla eklendi");
  });

  it("clears data when clear button is clicked", async () => {
    act(() => {
      root.render(createElement(ImportReferences, {}));
    });

    const textTab = container.querySelector('[data-testid="import-tab-text"]') as HTMLButtonElement;
    await act(async () => {
      textTab.click();
    });

    const textarea = container.querySelector('[data-testid="import-text-input"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(textarea, "sample text");
    });

    const clearBtn = container.querySelector('[data-testid="import-clear-btn"]') as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();

    await act(async () => {
      clearBtn.click();
    });

    expect(textarea.value).toBe("");
    expect(container.querySelector('[data-testid="import-clear-btn"]')).toBeNull();
  });
});
