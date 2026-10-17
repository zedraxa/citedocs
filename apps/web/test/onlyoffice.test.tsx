// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { OnlyofficeEditorPage } from "../src/onlyoffice/OnlyofficeEditorPage.js";

afterEach(cleanup);

describe("OnlyofficeEditorPage Component & oo-cite-panel (apps/web)", () => {
  const docId = "doc-test-123";
  const docTitle = "Literature Review on Nanomedicine";
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/zotero/plugin-credentials")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            linked: false,
            oauthAvailable: true,
          }),
        };
      }
      if (url.includes(`/api/documents/${docId}/onlyoffice-config`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            documentServerUrl: "http://localhost/oo",
            role: "owner",
            config: {
              document: { fileType: "docx", title: `${docTitle}.docx` },
              editorConfig: { user: { id: "u-1" } },
            },
          }),
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      };
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders editor page with title, back button, and initial unlinked state", async () => {
    const onBack = vi.fn();
    render(<OnlyofficeEditorPage documentId={docId} documentTitle={docTitle} onBackToDocuments={onBack} />);

    expect(screen.getByText(docTitle)).toBeTruthy();
    expect(screen.getByTestId("oo-back")).toBeTruthy();
    expect(screen.getByTestId("oo-add-form")).toBeTruthy();
    expect(screen.getByTestId("oo-panel-toggle")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId("oo-zotero-connect")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("oo-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("syncs credentials into localStorage when user has linked Zotero account", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/api/zotero/plugin-credentials")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            linked: true,
            zoteroUserId: "10203040",
            apiKey: "SECRET_ZOTERO_API_KEY_ABCD",
            oauthAvailable: true,
          }),
        };
      }
      if (url.includes(`/api/documents/${docId}/onlyoffice-config`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            documentServerUrl: "http://localhost/oo",
            config: { document: { fileType: "docx" } },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<OnlyofficeEditorPage documentId={docId} documentTitle={docTitle} onBackToDocuments={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("oo-zotero-linked")).toBeTruthy();
    });

    // Check localStorage was populated for ONLYOFFICE Zotero plugin
    expect(localStorage.getItem("zoteroUserId")).toBe("10203040");
    expect(localStorage.getItem("zoteroApiKey")).toBe("SECRET_ZOTERO_API_KEY_ABCD");
  });

  it("toggles the dedicated citation panel open and closed", async () => {
    render(<OnlyofficeEditorPage documentId={docId} documentTitle={docTitle} onBackToDocuments={vi.fn()} />);

    // Initially closed
    expect(screen.queryByTestId("oo-cite-panel")).toBeNull();

    // Toggle open
    fireEvent.click(screen.getByTestId("oo-panel-toggle"));
    expect(screen.getByTestId("oo-cite-panel")).toBeTruthy();
    expect(screen.getByTestId("oo-panel-input")).toBeTruthy();
    expect(screen.getByTestId("oo-panel-submit")).toBeTruthy();

    // Close via close button in panel
    fireEvent.click(screen.getByTestId("oo-panel-close"));
    expect(screen.queryByTestId("oo-cite-panel")).toBeNull();
  });

  it("submits identifier via citation panel and shows rich item card and history", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/zotero/plugin-credentials")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            linked: true,
            zoteroUserId: "10203040",
            apiKey: "API_KEY_TEST",
            oauthAvailable: true,
          }),
        };
      }
      if (url.includes(`/api/documents/${docId}/onlyoffice-config`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            documentServerUrl: "http://localhost/oo",
            config: { document: { fileType: "docx" } },
          }),
        };
      }
      if (url.includes("/api/zotero/add-by-identifier")) {
        const body = JSON.parse(String(init?.body || "{}"));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            saved: true,
            key: "ZOTERO_ITEM_KEY_55",
            item: {
              title: "The changing landscape of atherosclerosis",
              creators: [{ creatorType: "author", firstName: "Peter", lastName: "Libby" }],
              date: "2021",
              DOI: body.identifier,
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<OnlyofficeEditorPage documentId={docId} documentTitle={docTitle} onBackToDocuments={vi.fn()} />);

    // Wait for credentials load
    await waitFor(() => {
      expect(screen.getByTestId("oo-zotero-linked")).toBeTruthy();
    });

    // Open citation panel
    fireEvent.click(screen.getByTestId("oo-panel-toggle"));

    const panelInput = screen.getByTestId("oo-panel-input");
    fireEvent.change(panelInput, { target: { value: "10.1038/s41586-021-03392-y" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("oo-panel-submit"));
    });

    // Verify result card displayed
    await waitFor(() => {
      const card = screen.getByTestId("oo-last-added-card");
      expect(card).toBeTruthy();
      expect(card.textContent).toContain("The changing landscape of atherosclerosis");
      expect(card.textContent).toContain("Peter Libby");
    });

    // Verify banner notice displayed
    expect(screen.getByTestId("oo-notice")).toBeTruthy();
    expect(screen.getByTestId("oo-notice").textContent).toContain("Zotero kütüphanene eklendi");
  });

  it("handles OAuth return query parameters (?zotero=connected) with friendly notice", async () => {
    // Simulate window.location.search having ?zotero=connected
    const oldSearch = window.location.search;
    delete (window as unknown as { location?: unknown }).location;
    window.location = {
      ...window.location,
      pathname: "/editor",
      search: "?doc=doc-test-123&zotero=connected",
      hash: "",
    } as unknown as Location;

    render(<OnlyofficeEditorPage documentId={docId} documentTitle={docTitle} onBackToDocuments={vi.fn()} />);

    expect(screen.getByTestId("oo-notice")).toBeTruthy();
    expect(screen.getByTestId("oo-notice").textContent).toContain("Zotero hesabı başarıyla bağlandı");

    window.location.search = oldSearch;
  });
});
