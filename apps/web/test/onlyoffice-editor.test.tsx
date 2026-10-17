// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, screen, act, fireEvent } from "@testing-library/react";
import { OnlyofficeEditorPage } from "../src/onlyoffice/OnlyofficeEditorPage.js";

vi.mock("../src/auth/api.js", () => ({ getApiBaseUrl: () => "", getCsrfToken: () => "csrf" }));
afterEach(() => {
  cleanup();
  delete window.DocsAPI;
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("ONLYOFFICE document editor", () => {
  it("opens the signed server config, tolerates unavailable Zotero and destroys on exit", async () => {
    localStorage.setItem("zoteroApiKey", "old-user-test-key");
    localStorage.setItem("zoteroUserId", "old-user");
    const config = {
      token: "server-signed-token",
      document: { key: "doc-key", permissions: { edit: false } },
      editorConfig: {
        mode: "view",
        user: { id: "alice", name: "Alice" },
        plugins: { autostart: ["zotero-guid"] },
      },
    };
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("plugin-credentials")) throw new Error("Zotero unavailable");
      return new Response(JSON.stringify({ documentServerUrl: "/oo", config }));
    });
    vi.stubGlobal("fetch", fetchFn);
    const destroyEditor = vi.fn();
    const DocEditor = vi.fn().mockImplementation(() => ({ destroyEditor }));
    window.DocsAPI = { DocEditor };
    const view = render(
      <OnlyofficeEditorPage
        documentId="doc/id"
        documentTitle="Paper"
        onBackToDocuments={vi.fn()}
      />,
    );
    await waitFor(() => expect(DocEditor).toHaveBeenCalledOnce());
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/documents/doc%2Fid/onlyoffice-config",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(DocEditor).toHaveBeenCalledWith("oo-editor", expect.objectContaining(config));
    expect(localStorage.getItem("zoteroApiKey")).toBeNull();
    expect(localStorage.getItem("zoteroUserId")).toBeNull();
    const editorConfig = DocEditor.mock.calls[0][1];
    act(() => editorConfig.events.onError({ data: { errorDescription: "Document failed" } }));
    expect(screen.getByTestId("oo-error").textContent).toBe("Document failed");
    expect(screen.queryByText("Editör yükleniyor…")).toBeNull();
    view.unmount();
    expect(destroyEditor).toHaveBeenCalledOnce();
  });
  it.each(["en", "tr"])(
    "enables Zotero after readiness, opens the panel, and handles failure (%s)",
    async (lang) => {
      localStorage.setItem("citedocs_lang", lang);
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockImplementation(
            async (url: string) =>
              new Response(
                JSON.stringify(
                  url.includes("plugin-credentials")
                    ? { linked: false }
                    : { documentServerUrl: "/oo", config: {} },
                ),
              ),
          ),
      );
      const DocEditor = vi.fn().mockImplementation(() => ({ destroyEditor: vi.fn() }));
      window.DocsAPI = { DocEditor };
      render(
        <OnlyofficeEditorPage documentId="doc" documentTitle="Paper" onBackToDocuments={vi.fn()} />,
      );
      const button = screen.getByTestId("oo-zotero-open") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      await waitFor(() => expect(DocEditor).toHaveBeenCalledOnce());
      const events = DocEditor.mock.calls[0][1].events;
      act(() => events.onAppReady());
      expect(button.disabled).toBe(true);
      act(() => events.onDocumentReady());
      expect(button.disabled).toBe(false);
      fireEvent.click(button);
      expect(screen.getByTestId("oo-notice").textContent).toContain(
        lang === "tr" ? "Eklentiler" : "Plugins tab",
      );
      expect(button.getAttribute("aria-label")).toBe(
        lang === "tr" ? "Zotero panelini aç" : "Open Zotero panel",
      );
      const frame = document.createElement("iframe");
      Object.defineProperty(frame, "contentWindow", { value: {} });
      vi.spyOn(
        document.getElementById("oo-editor")!.parentElement!,
        "querySelector",
      ).mockReturnValue(frame);
      const openUIPlugin = vi.fn();
      Object.assign(frame.contentWindow!, {
        DE: {
          getController: () => ({
            api: { pluginsManager: { getPluginByGuid: () => ({}), isRunned: () => true } },
            openUIPlugin,
          }),
        },
      });
      fireEvent.click(button);
      expect(openUIPlugin).toHaveBeenCalledOnce();
      expect(screen.queryByTestId("oo-notice")).toBeNull();
      act(() => events.onError({}));
      expect(button.disabled).toBe(true);
    },
  );
  it("shows denied document access without constructing an editor", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async (url: string) =>
          url.includes("plugin-credentials")
            ? new Response(JSON.stringify({ linked: false }))
            : new Response(JSON.stringify({ error: "Access denied" }), { status: 403 }),
        ),
    );
    const DocEditor = vi.fn();
    window.DocsAPI = { DocEditor };
    render(
      <OnlyofficeEditorPage
        documentId="denied"
        documentTitle="Paper"
        onBackToDocuments={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("oo-error").textContent).toBe("Access denied"));
    expect(DocEditor).not.toHaveBeenCalled();
  });
});
