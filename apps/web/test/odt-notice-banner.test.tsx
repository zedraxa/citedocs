// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { OdtNoticeBanner } from "../src/onlyoffice/OdtNoticeBanner.js";
import * as docsApi from "../src/documents/api.js";
import type { DocumentItem } from "../src/documents/types.js";
import { OnlyofficeEditorPage } from "../src/onlyoffice/OnlyofficeEditorPage.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OdtNoticeBanner component", () => {
  const mockDocxItem: DocumentItem = {
    id: "new-docx-1",
    title: "Tez_Taslagi.docx",
    ownerUserId: "user-1",
    s3ObjectKey: "users/user-1/documents/new-docx-1.docx",
    fileSize: 2048,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  it("renders clear Turkish notice and conversion button when documentTitle ends with .odt", () => {
    render(
      <OdtNoticeBanner
        documentId="odt-1"
        documentTitle="Tez_Taslagi.odt"
      />
    );

    const banner = screen.getByTestId("odt-notice-banner");
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain("Zotero masaüstü eklentileriyle (Word ve LibreOffice) tam iki yönlü uyumluluk için");
    expect(banner.textContent).toContain(".docx");
    expect(banner.textContent).toContain("ONLYOFFICE, ODT dosyaları kaydedildiğinde Zotero atıflarını düz metne dönüştürmektedir");

    const convertBtn = screen.getByTestId("convert-to-docx-btn");
    expect(convertBtn).not.toBeNull();
    expect(convertBtn.textContent).toContain("DOCX olarak kopya oluştur");
  });

  it("does not render notice for .docx documents", () => {
    render(
      <OdtNoticeBanner
        documentId="docx-1"
        documentTitle="Tez_Taslagi.docx"
      />
    );

    expect(screen.queryByTestId("odt-notice-banner")).toBeNull();
  });

  it("renders when mimeType is opendocument even if title has no extension", () => {
    render(
      <OdtNoticeBanner
        documentId="odt-2"
        documentTitle="Adsız Belge"
        mimeType="application/vnd.oasis.opendocument.text"
      />
    );

    expect(screen.getByTestId("odt-notice-banner")).not.toBeNull();
  });

  it("fetches document metadata when type is unknown and renders if ODT", async () => {
    vi.spyOn(docsApi, "fetchDocument").mockResolvedValue({
      document: {
        id: "odt-async",
        title: "Dönem Ödevi",
        ownerUserId: "user-1",
        s3ObjectKey: "key",
        fileSize: 1000,
        mimeType: "application/vnd.oasis.opendocument.text",
        createdAt: "2026-10-17T00:00:00Z",
        updatedAt: "2026-10-17T00:00:00Z",
        deletedAt: null,
      },
      role: "owner",
    });

    render(
      <OdtNoticeBanner
        documentId="odt-async"
        documentTitle="Dönem Ödevi"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("odt-notice-banner")).not.toBeNull();
    });
  });

  it("successfully calls convertOdtToDocx and triggers onConverted callback", async () => {
    const convertSpy = vi.spyOn(docsApi, "convertOdtToDocx").mockResolvedValue({
      document: mockDocxItem,
    });
    const onConverted = vi.fn();

    render(
      <OdtNoticeBanner
        documentId="odt-1"
        documentTitle="Tez_Taslagi.odt"
        onConverted={onConverted}
      />
    );

    const convertBtn = screen.getByTestId("convert-to-docx-btn");
    fireEvent.click(convertBtn);

    expect(convertBtn.textContent).toContain("Dönüştürülüyor…");
    await waitFor(() => {
      expect(convertSpy).toHaveBeenCalledWith("odt-1");
      expect(onConverted).toHaveBeenCalledWith(mockDocxItem);
    });
  });

  it("redirects to editor with new doc if onConverted is not provided", async () => {
    vi.spyOn(docsApi, "convertOdtToDocx").mockResolvedValue({
      document: mockDocxItem,
    });

    // Mock window.location
    const originalLocation = window.location;
    // @ts-expect-error test mock
    delete window.location;
    window.location = { ...originalLocation, href: "" } as unknown as Location;

    render(
      <OdtNoticeBanner
        documentId="odt-1"
        documentTitle="Tez_Taslagi.odt"
      />
    );

    fireEvent.click(screen.getByTestId("convert-to-docx-btn"));

    await waitFor(() => {
      expect(window.location.href).toBe(
        `/editor?doc=${encodeURIComponent("new-docx-1")}&title=${encodeURIComponent("Tez_Taslagi.docx")}`
      );
    });

    window.location = originalLocation;
  });

  it("displays Turkish error message when conversion fails", async () => {
    vi.spyOn(docsApi, "convertOdtToDocx").mockRejectedValue(
      new Error("Dönüştürme servisi yanıt vermedi")
    );

    render(
      <OdtNoticeBanner
        documentId="odt-1"
        documentTitle="Tez_Taslagi.odt"
      />
    );

    fireEvent.click(screen.getByTestId("convert-to-docx-btn"));

    await waitFor(() => {
      const errorMsg = screen.getByTestId("odt-convert-error");
      expect(errorMsg).not.toBeNull();
      expect(errorMsg.textContent).toBe("Dönüştürme servisi yanıt vermedi");
    });
  });

  it("dismisses the banner when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <OdtNoticeBanner
        documentId="odt-1"
        documentTitle="Tez_Taslagi.odt"
        onClose={onClose}
      />
    );

    expect(screen.getByTestId("odt-notice-banner")).not.toBeNull();
    const dismissBtn = screen.getByTestId("odt-notice-dismiss");
    fireEvent.click(dismissBtn);

    expect(screen.queryByTestId("odt-notice-banner")).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("mounts and renders in OnlyofficeEditorPage when opening an ODT document", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("plugin-credentials")) {
          return new Response(JSON.stringify({ linked: false }));
        }
        if (url.includes("onlyoffice-config")) {
          return new Response(JSON.stringify({ documentServerUrl: "/oo", config: {} }));
        }
        return new Response(JSON.stringify({}));
      })
    );
    const DocEditor = vi.fn().mockImplementation(() => ({ destroyEditor: vi.fn() }));
    window.DocsAPI = { DocEditor };

    render(
      <OnlyofficeEditorPage
        documentId="doc-test-odt"
        documentTitle="Makale_Taslagi.odt"
        onBackToDocuments={vi.fn()}
      />
    );

    expect(screen.getByTestId("odt-notice-banner")).not.toBeNull();
    expect(screen.getByTestId("convert-to-docx-btn")).not.toBeNull();
  });
});

