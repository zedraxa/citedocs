// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import {
  DocumentsPage,
  ShareDialog,
  RenameDialog,
  formatBytes,
  docTranslations,
  getDocumentLanguage,
  type DocumentItem,
  type SharedDocumentItem,
  type ShareItem,
} from "../src/documents/index.js";
import { AuthProvider } from "../src/auth/index.js";

describe("Web Documents & Cloud Storage Layer (@citedocs/web)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.restoreAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  describe("Utility & i18n Functions", () => {
    it("formatBytes formats bytes into human readable binary units correctly", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(512)).toBe("512 B");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1048576)).toBe("1 MB");
      expect(formatBytes(1073741824)).toBe("1 GB");
      expect(formatBytes(5368709120)).toBe("5 GB");
    });

    it("docTranslations provides identical key structures in Turkish and English", () => {
      const enKeys = Object.keys(docTranslations.en).sort();
      const trKeys = Object.keys(docTranslations.tr).sort();
      expect(trKeys).toEqual(enKeys);
      expect(docTranslations.en.myDocuments).toBe("My Documents");
      expect(docTranslations.tr.myDocuments).toBe("Belgelerim");
      expect(docTranslations.en.open).toBe("Open");
      expect(docTranslations.tr.open).toBe("Aç");
      for (const translations of Object.values(docTranslations)) {
        expect(translations.editorTagline).toContain("ONLYOFFICE");
        expect(Object.values(translations).join(" ")).not.toMatch(/Collabora/);
      }
    });

    it("getDocumentLanguage safely defaults to browser or english language", () => {
      const lang = getDocumentLanguage();
      expect(["en", "tr"]).toContain(lang);
    });
  });

  describe("RenameDialog", () => {
    const mockDoc: DocumentItem = {
      id: "doc-1",
      title: "Initial Thesis Draft",
      ownerUserId: "user-1",
      s3ObjectKey: "docs/doc-1/thesis.docx",
      fileSize: 10240,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      createdAt: "2026-10-16T12:00:00Z",
      updatedAt: "2026-10-16T12:00:00Z",
      deletedAt: null,
    };

    it("renders with initial title and updates on input", async () => {
      const onRename = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          createElement(RenameDialog, {
            document: mockDoc,
            isOpen: true,
            onClose,
            onRename,
            lang: "en",
          })
        );
      });

      const input = container.querySelector("[data-testid='rename-input']") as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.value).toBe("Initial Thesis Draft");

      fireEvent.change(input, { target: { value: "Updated Thesis Draft" } });
      expect(input.value).toBe("Updated Thesis Draft");

      const submitBtn = container.querySelector("[data-testid='rename-submit-btn']") as HTMLButtonElement;
      expect(submitBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(onRename).toHaveBeenCalledWith("Updated Thesis Draft");
    });

    it("disables submit button when title is empty or unchanged", async () => {
      const onRename = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          createElement(RenameDialog, {
            document: mockDoc,
            isOpen: true,
            onClose,
            onRename,
            lang: "en",
          })
        );
      });

      const input = container.querySelector("[data-testid='rename-input']") as HTMLInputElement;
      const submitBtn = container.querySelector("[data-testid='rename-submit-btn']") as HTMLButtonElement;

      // Initially unchanged -> disabled
      expect(submitBtn.disabled).toBe(true);

      // Whitespace -> disabled
      fireEvent.change(input, { target: { value: "   " } });
      expect(submitBtn.disabled).toBe(true);

      // Changed -> enabled
      fireEvent.change(input, { target: { value: "New Title" } });
      expect(submitBtn.disabled).toBe(false);
    });

    it("calls onClose when cancel button or backdrop is clicked", async () => {
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          createElement(RenameDialog, {
            document: mockDoc,
            isOpen: true,
            onClose,
            onRename: vi.fn(),
            lang: "en",
          })
        );
      });

      const cancelBtn = container.querySelector("[data-testid='rename-cancel-btn']") as HTMLButtonElement;
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalledTimes(1);

      const backdrop = container.querySelector("[data-testid='rename-dialog-backdrop']") as HTMLDivElement;
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });

  describe("ShareDialog", () => {
    const mockDoc: DocumentItem = {
      id: "doc-123",
      title: "Shared Research Notes",
      ownerUserId: "user-1",
      s3ObjectKey: "docs/doc-123/file.docx",
      fileSize: 20480,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      createdAt: "2026-10-16T12:00:00Z",
      updatedAt: "2026-10-16T12:00:00Z",
      deletedAt: null,
    };

    const mockShares: ShareItem[] = [
      {
        id: "share-1",
        documentId: "doc-123",
        userId: "user-2",
        email: "student2@university.edu",
        role: "viewer",
        createdBy: "user-1",
        createdAt: "2026-10-16T12:30:00Z",
        updatedAt: "2026-10-16T12:30:00Z",
      },
    ];

    it("fetches shares and displays existing collaborators", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (typeof url === "string" && url.includes("/shares")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ shares: mockShares }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      await act(async () => {
        root.render(
          createElement(ShareDialog, {
            document: mockDoc,
            isOpen: true,
            onClose: vi.fn(),
            lang: "en",
          })
        );
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(container.textContent).toContain("Shared Research Notes");
      expect(container.textContent).toContain("student2@university.edu");
      expect(container.textContent).toContain("Viewer");
    });

    it("submits email share with selected role and unshares", async () => {
      let currentShares = [...mockShares];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/shares") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          const newShare: ShareItem = {
            id: "share-2",
            documentId: "doc-123",
            userId: null,
            email: body.email,
            role: body.role,
            createdBy: "user-1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          currentShares.push(newShare);
          return {
            ok: true,
            status: 201,
            json: async () => ({ share: newShare }),
          } as Response;
        }
        if (urlStr.includes("/shares/share-1") && init?.method === "DELETE") {
          currentShares = currentShares.filter((s) => s.id !== "share-1");
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          } as Response;
        }
        if (urlStr.includes("/shares")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ shares: currentShares }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      await act(async () => {
        root.render(
          createElement(ShareDialog, {
            document: mockDoc,
            isOpen: true,
            onClose: vi.fn(),
            lang: "en",
          })
        );
        await new Promise((r) => setTimeout(r, 20));
      });

      // Type email and submit
      const emailInput = container.querySelector("[data-testid='share-email-input']") as HTMLInputElement;
      const roleSelect = container.querySelector("[data-testid='share-role-select']") as HTMLSelectElement;
      const form = emailInput.closest("form")!;

      fireEvent.change(emailInput, { target: { value: "colleague@university.edu" } });
      fireEvent.change(roleSelect, { target: { value: "editor" } });

      await act(async () => {
        fireEvent.submit(form);
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(container.textContent).toContain("colleague@university.edu");

      // Test Unshare
      const unshareBtn = container.querySelector("[data-testid='unshare-btn-share-1']") as HTMLButtonElement;
      expect(unshareBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(unshareBtn);
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(container.textContent).not.toContain("student2@university.edu");
    });
  });

  describe("DocumentsPage Component", () => {
    const mockOwnedDocs: DocumentItem[] = [
      {
        id: "doc-owned-1",
        title: "Quantum Physics Paper.docx",
        ownerUserId: "user-1",
        s3ObjectKey: "docs/doc-owned-1/Quantum Physics Paper.docx",
        fileSize: 1048576, // 1 MB
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        createdAt: "2026-10-15T10:00:00Z",
        updatedAt: "2026-10-16T09:00:00Z",
        deletedAt: null,
      },
      {
        id: "doc-owned-2",
        title: "Astrophysics Lab Report.odt",
        ownerUserId: "user-1",
        s3ObjectKey: "docs/doc-owned-2/Astrophysics Lab Report.odt",
        fileSize: 2097152, // 2 MB
        mimeType: "application/vnd.oasis.opendocument.text",
        createdAt: "2026-10-14T10:00:00Z",
        updatedAt: "2026-10-14T11:00:00Z",
        deletedAt: null,
      },
    ];

    const mockSharedDocs: SharedDocumentItem[] = [
      {
        document: {
          id: "doc-shared-1",
          title: "Collaborative Study Group.docx",
          ownerUserId: "user-2",
          s3ObjectKey: "docs/doc-shared-1/file.docx",
          fileSize: 524288, // 512 KB
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          createdAt: "2026-10-10T10:00:00Z",
          updatedAt: "2026-10-16T08:00:00Z",
          deletedAt: null,
        },
        shareRole: "viewer",
        sharedBy: {
          id: "user-2",
          email: "teacher@university.edu",
          displayName: "Dr. Teacher",
        },
      },
    ];

    beforeEach(() => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = String(url);
        const method = (init?.method || "GET").toUpperCase();

        if (urlStr.includes("/api/documents/shared-with-me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ documents: mockSharedDocs }),
          } as Response;
        }

        if (urlStr.includes("/api/documents/quota")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              quota: {
                used: 3145728, // 3 MB
                total: 5368709120, // 5 GB
                remaining: 5365563392,
                percentage: 0.05,
              },
            }),
          } as Response;
        }

        if (urlStr.includes("/api/documents/upload") && method === "POST") {
          const uploaded: DocumentItem = {
            id: "doc-uploaded",
            title: "UploadedDocument.docx",
            ownerUserId: "user-1",
            s3ObjectKey: "docs/doc-uploaded/UploadedDocument.docx",
            fileSize: 8192,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          };
          return {
            ok: true,
            status: 201,
            json: async () => ({ document: uploaded }),
          } as Response;
        }

        if (urlStr.includes("/api/documents/doc-owned-1") && method === "DELETE") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          } as Response;
        }

        if (urlStr.includes("/api/documents") && method === "POST") {
          const body = JSON.parse(String(init?.body || "{}"));
          const format = body.format || "docx";
          const title = body.title || `Untitled Document.${format}`;
          const created: DocumentItem = {
            id: "doc-created-new",
            title,
            ownerUserId: "user-1",
            s3ObjectKey: `docs/doc-created-new/${title}`,
            fileSize: 4096,
            mimeType: format === "odt"
              ? "application/vnd.oasis.opendocument.text"
              : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          };
          return {
            ok: true,
            status: 201,
            json: async () => ({ document: created }),
          } as Response;
        }

        if (urlStr.includes("/api/documents") && method === "GET") {
          const searchMatch = urlStr.match(/[?&]search=([^&]+)/);
          const searchTerm = searchMatch ? decodeURIComponent(searchMatch[1]!).toLowerCase() : "";
          const filtered = searchTerm
            ? mockOwnedDocs.filter((d) => d.title.toLowerCase().includes(searchTerm))
            : mockOwnedDocs;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              documents: filtered,
              quota: {
                used: 3145728,
                total: 5368709120,
                remaining: 5365563392,
                percentage: 0.05,
              },
            }),
          } as Response;
        }

        if (urlStr.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: { id: "user-1", email: "student@uni.edu", emailVerified: true } }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      });
    });

    it("renders document list, 5 GB storage quota bar, and action controls", async () => {
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

      // Storage Quota indicator
      const quotaIndicator = container.querySelector("[data-testid='storage-quota-indicator']");
      expect(quotaIndicator).not.toBeNull();
      expect(quotaIndicator?.textContent).toContain("5 GB");
      expect(quotaIndicator?.textContent).toContain("%100 Ücretsiz Bulut Alanı");

      // Document titles
      expect(container.textContent).toContain("Quantum Physics Paper.docx");
      expect(container.textContent).toContain("Astrophysics Lab Report.odt");

      // Verify action buttons
      expect(container.querySelector("[data-testid='new-doc-dropdown-btn']")).not.toBeNull();
      expect(container.querySelector("[data-testid='upload-doc-btn']")).not.toBeNull();
      expect(container.querySelector("[data-testid='doc-search-input']")).not.toBeNull();
    });

    it("switches to Shared with me tab and shows collaborator badges", async () => {
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

      const sharedTabBtn = container.querySelector("[data-testid='tab-shared-documents']") as HTMLButtonElement;
      expect(sharedTabBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(sharedTabBtn);
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(container.textContent).toContain("Collaborative Study Group.docx");
      expect(container.textContent).toContain("Dr. Teacher");
      expect(container.textContent).toContain("Görüntüleyici");
    });

    it("filters documents when searching in search input", async () => {
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

      const searchInput = container.querySelector("[data-testid='doc-search-input']") as HTMLInputElement;
      expect(searchInput).not.toBeNull();

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: "Quantum" } });
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(container.textContent).toContain("Quantum Physics Paper.docx");
      expect(container.textContent).not.toContain("Astrophysics Lab Report.odt");
    });

    it("toggles UI language between English and Turkish", async () => {
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

      // Default is Turkish
      expect(container.textContent).toContain("Belgelerim");
      expect(container.textContent).toContain("Benimle Paylaşılanlar");

      const langToggle = container.querySelector("[data-testid='doc-lang-toggle']") as HTMLButtonElement;
      expect(langToggle).not.toBeNull();

      await act(async () => {
        fireEvent.click(langToggle);
      });

      // Toggled to English
      expect(container.textContent).toContain("My Documents");
      expect(container.textContent).toContain("Shared with Me");

      // Toggle back to Turkish
      await act(async () => {
        fireEvent.click(langToggle);
      });

      expect(container.textContent).toContain("Belgelerim");
      expect(container.textContent).toContain("Benimle Paylaşılanlar");
    });

    it("creates a blank .docx document via dropdown menu", async () => {
      const onOpen = vi.fn();
      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(DocumentsPage, { onOpenDocument: onOpen })
          )
        );
        await new Promise((r) => setTimeout(r, 20));
      });

      const newDropdownBtn = container.querySelector("[data-testid='new-doc-dropdown-btn']") as HTMLButtonElement;
      fireEvent.click(newDropdownBtn);

      const createDocxBtn = container.querySelector("[data-testid='create-docx-btn']") as HTMLButtonElement;
      expect(createDocxBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(createDocxBtn);
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Untitled Document.docx" })
      );
      expect(container.textContent).toContain("Untitled Document.docx");
    });

    it("creates a blank .odt document via dropdown menu", async () => {
      const onOpen = vi.fn();
      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(DocumentsPage, { onOpenDocument: onOpen })
          )
        );
        await new Promise((r) => setTimeout(r, 20));
      });

      const newDropdownBtn = container.querySelector("[data-testid='new-doc-dropdown-btn']") as HTMLButtonElement;
      fireEvent.click(newDropdownBtn);

      const createOdtBtn = container.querySelector("[data-testid='create-odt-btn']") as HTMLButtonElement;
      expect(createOdtBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(createOdtBtn);
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Untitled Document.odt" })
      );
      expect(container.textContent).toContain("Untitled Document.odt");
    });

    it("handles file upload via hidden input", async () => {
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

      const fileInput = container.querySelector("[data-testid='file-upload-input']") as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      const fakeFile = new File(["dummy content"], "UploadedDocument.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [fakeFile] } });
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(container.textContent).toContain("UploadedDocument.docx");
    });

    it("triggers onOpenDocument callback when document card is clicked", async () => {
      const onOpen = vi.fn();

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(DocumentsPage, { onOpenDocument: onOpen })
          )
        );
        await new Promise((r) => setTimeout(r, 20));
      });

      const openBtn = container.querySelector("[data-testid='open-doc-doc-owned-1']") as HTMLElement;
      expect(openBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(openBtn);
      });

      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({ id: "doc-owned-1", title: "Quantum Physics Paper.docx" })
      );
    });

    it("opens a document at the default editor route without a Collabora override", async () => {
      const originalUrl = window.location.href;
      try {
        await act(async () => {
          root.render(createElement(AuthProvider, { autoFetch: false }, createElement(DocumentsPage)));
          await new Promise((r) => setTimeout(r, 20));
        });
        const button = container.querySelector("[data-testid='open-doc-doc-owned-1']") as HTMLElement;
        expect(["Open", "Aç"]).toContain(button.textContent);
        expect(container.textContent).toContain("ONLYOFFICE");
        expect(container.textContent).not.toContain("Collabora");
        fireEvent.click(button);
        expect(window.location.pathname).toBe("/editor");
        const params = new URLSearchParams(window.location.search);
        expect(params.get("doc")).toBe("doc-owned-1");
        expect(params.get("title")).toBe("Quantum Physics Paper.docx");
        expect(params.has("editor")).toBe(false);
      } finally {
        window.history.replaceState({}, "", originalUrl);
      }
    });

    it("deletes document after confirmation", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);

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

      const deleteBtn = container.querySelector("[data-testid='delete-doc-doc-owned-1']") as HTMLButtonElement;
      expect(deleteBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(deleteBtn);
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(container.textContent).not.toContain("Quantum Physics Paper.docx");
    });

    it("navigates back to editor when back button is clicked", async () => {
      const onNavigate = vi.fn();

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(DocumentsPage, { onNavigateToEditor: onNavigate })
          )
        );
        await new Promise((r) => setTimeout(r, 20));
      });

      const backBtn = container.querySelector("[data-testid='back-to-editor-btn']") as HTMLButtonElement;
      expect(backBtn).not.toBeNull();

      fireEvent.click(backBtn);
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });
  });
});
