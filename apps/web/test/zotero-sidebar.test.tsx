// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { ZoteroSidebar } from "../src/zotero/ZoteroSidebar.js";
import { ZoteroAccountModal } from "../src/zotero/ZoteroAccountModal.js";
import type { ZoteroItemPayload, ZoteroAccountInfo } from "../src/zotero/types.js";

describe("Zotero Web Library Sidebar & Account Linking UI (apps/web)", () => {
  const mockItem: ZoteroItemPayload = {
    id: "einstein1935",
    title: "Can Quantum-Mechanical Description of Physical Reality be Considered Complete?",
    authors: "Einstein, Podolsky, Rosen",
    year: "1935",
    doi: "10.1103/PhysRev.47.777",
    itemType: "journalArticle",
    publicationTitle: "Physical Review",
  };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders ZoteroSidebar with header, iframe, and account status pill", async () => {
    const handleCite = vi.fn();
    const handleClose = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        linked: false,
        userId: "user-123",
        zoteroUserId: null,
        username: null,
        maskedKey: null,
        syncEnabled: false,
      }),
    });

    render(
      <ZoteroSidebar
        userId="user-123"
        isOpen={true}
        onClose={handleClose}
        onCiteItem={handleCite}
        iframeSrc="/zotero-weblib/index.html"
      />
    );

    const sidebar = screen.getByTestId("zotero-sidebar");
    expect(sidebar).toBeDefined();
    expect(sidebar.textContent).toContain("Zotero Web Library");

    const iframe = screen.getByTestId("zotero-weblib-iframe") as HTMLIFrameElement;
    expect(iframe).toBeDefined();
    expect(iframe.getAttribute("src")).toBe("/zotero-weblib/index.html");

    const accountPill = screen.getByTestId("zotero-account-pill");
    expect(accountPill.textContent).toContain("Zotero'yu Bağla");
  });

  it("does not render sidebar when isOpen is false", () => {
    render(
      <ZoteroSidebar
        userId="user-123"
        isOpen={false}
        onClose={vi.fn()}
        onCiteItem={vi.fn()}
      />
    );

    expect(screen.queryByTestId("zotero-sidebar")).toBeNull();
  });

  it("invokes onClose when close button is clicked", () => {
    const handleClose = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ linked: false }),
    });

    render(
      <ZoteroSidebar
        userId="user-123"
        isOpen={true}
        onClose={handleClose}
        onCiteItem={vi.fn()}
      />
    );

    const closeBtn = screen.getByTestId("close-zotero-sidebar-btn");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("handles incoming CITEDOCS_ZOTERO_CITE postMessage and calls onCiteItem", async () => {
    const handleCite = vi.fn();
    const handleItemAdded = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ linked: false }),
    });

    render(
      <ZoteroSidebar
        userId="user-123"
        isOpen={true}
        onClose={vi.fn()}
        onCiteItem={handleCite}
        onItemAdded={handleItemAdded}
      />
    );

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "CITEDOCS_ZOTERO_CITE",
            item: mockItem,
          },
        })
      );
    });

    expect(handleCite).toHaveBeenCalledTimes(1);
    expect(handleCite).toHaveBeenCalledWith(mockItem);
    expect(handleItemAdded).toHaveBeenCalledWith(mockItem);
  });

  it("renders ZoteroAccountModal and connects a valid API key", async () => {
    const handleUpdate = vi.fn();
    const handleClose = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        linked: true,
        userId: "user-123",
        zoteroUserId: "7654321",
        maskedKey: "key_••••••••1234",
        syncEnabled: true,
      }),
    });
    globalThis.fetch = fetchMock;

    render(
      <ZoteroAccountModal
        userId="user-123"
        account={null}
        isOpen={true}
        onClose={handleClose}
        onAccountUpdated={handleUpdate}
      />
    );

    const input = screen.getByTestId("input-zotero-api-key");
    fireEvent.change(input, { target: { value: "my_secret_zotero_key_1234" } });

    const submitBtn = screen.getByTestId("btn-save-zotero-key");
    fireEvent.click(submitBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain("/api/zotero/account");
    expect(fetchCall[1].method).toBe("POST");
    expect(JSON.parse(fetchCall[1].body)).toEqual({
      apiKey: "my_secret_zotero_key_1234",
    });

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          linked: true,
          zoteroUserId: "7654321",
          maskedKey: "key_••••••••1234",
        })
      );
    });

    expect(screen.getByTestId("account-modal-success").textContent).toContain("başarıyla bağlandı");
  });

  it("displays connected state and disconnect button when already linked", async () => {
    const handleUpdate = vi.fn();
    const linkedAccount: ZoteroAccountInfo = {
      linked: true,
      userId: "user-123",
      zoteroUserId: "7654321",
      username: "alice",
      maskedKey: "abcd••••••••efgh",
      syncEnabled: true,
      lastSyncedAt: null,
      lastSyncVersion: 1,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, unlinked: true }),
    });
    globalThis.fetch = fetchMock;

    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ZoteroAccountModal
        userId="user-123"
        account={linkedAccount}
        isOpen={true}
        onClose={vi.fn()}
        onAccountUpdated={handleUpdate}
      />
    );

    expect(screen.getByText("Hesap Zotero.org'a Bağlandı")).toBeDefined();
    expect(screen.getByText("7654321")).toBeDefined();
    expect(screen.getByText("abcd••••••••efgh")).toBeDefined();

    const disconnectBtn = screen.getByTestId("btn-disconnect-zotero");
    fireEvent.click(disconnectBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          linked: false,
        })
      );
    });
  });
});
