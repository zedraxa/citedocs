// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, screen, act } from "@testing-library/react";
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
