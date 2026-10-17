// @vitest-environment happy-dom
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, screen, act, fireEvent } from "@testing-library/react";
import { OnlyofficeEditorPage } from "../src/onlyoffice/OnlyofficeEditorPage.js";

vi.mock("../src/auth/api.js", () => ({ getApiBaseUrl: () => "", getCsrfToken: () => "csrf" }));
afterEach(() => {
  cleanup();
  delete window.DocsAPI;
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
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

describe("pending Zotero identifier", () => {
  const pendingKey = "citedocs.pendingZoteroAdd";
  function setup(
    linked: boolean,
    result: "success" | "http" | "network" = "success",
    oauthAvailable = true,
  ) {
    const add = vi.fn(async () => {
      if (result === "network") throw new Error("Failed to fetch");
      return new Response(
        JSON.stringify(
          result === "success"
            ? { saved: true, key: "item", item: { title: "Test source" } }
            : { error: "Upstream service failed" },
        ),
        { status: result === "http" ? 502 : 200 },
      );
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("add-by-identifier")) return add();
        return new Response(
          JSON.stringify(
            url.includes("plugin-credentials")
              ? { linked, oauthAvailable }
              : { documentServerUrl: "/oo", config: {} },
          ),
        );
      }),
    );
    window.DocsAPI = { DocEditor: vi.fn().mockImplementation(() => ({ destroyEditor: vi.fn() })) };
    const view = render(
      <StrictMode>
        <OnlyofficeEditorPage documentId="doc" documentTitle="Paper" onBackToDocuments={vi.fn()} />
      </StrictMode>,
    );
    return { add, ...view };
  }

  it("keeps connect next to the input, stores the identifier and returns to this document", async () => {
    window.history.replaceState({}, "", "/editor?doc=doc");
    setup(false);
    const connect = await screen.findByRole("button", { name: "Zotero'yu bağla" });
    await waitFor(() => expect(window.DocsAPI!.DocEditor).toHaveBeenCalled());
    expect(screen.getByTestId("oo-add-form").contains(connect)).toBe(true);
    fireEvent.change(screen.getByTestId("oo-add-input"), {
      target: { value: "10.1038/nature14539" },
    });
    fireEvent.click(connect);
    expect(JSON.parse(sessionStorage.getItem(pendingKey)!)).toEqual({
      documentId: "doc",
      identifier: "10.1038/nature14539",
    });
    expect(window.location.pathname).toBe("/api/zotero/oauth/start");
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/editor?doc=doc");
  });

  it("explains unavailable OAuth without redirecting", async () => {
    setup(false, "success", false);
    await waitFor(() => expect(window.DocsAPI!.DocEditor).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("oo-zotero-connect"));
    expect(screen.getByTestId("oo-notice").textContent).toContain("yapılandırılmamış");
    expect(window.location.pathname).toBe("/");
    expect(sessionStorage.getItem(pendingKey)).toBeNull();
  });

  it.each(["success", "http", "network"] as const)(
    "consumes the pending add once on %s",
    async (result) => {
      sessionStorage.setItem(
        pendingKey,
        JSON.stringify({ documentId: "doc", identifier: "9780262033848" }),
      );
      const { add, unmount } = setup(true, result);
      await waitFor(() => expect(add).toHaveBeenCalledOnce());
      expect(sessionStorage.getItem(pendingKey)).toBeNull();
      await waitFor(() =>
        expect(screen.getByTestId("oo-notice").textContent).toContain(
          result === "success"
            ? "Zotero kütüphanene eklendi"
            : result === "http"
              ? "Kaynak eklenemedi"
              : "Kaynak eklenemedi",
        ),
      );
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/zotero/add-by-identifier",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ identifier: "9780262033848" }),
        }),
      );
      unmount();
      const next = setup(true);
      await waitFor(() => expect(window.DocsAPI!.DocEditor).toHaveBeenCalled());
      expect(next.add).not.toHaveBeenCalled();
    },
  );

  it("does not consume another document's pending identifier", async () => {
    const raw = JSON.stringify({ documentId: "other", identifier: "123" });
    sessionStorage.setItem(pendingKey, raw);
    const { add } = setup(true);
    await waitFor(() => expect(window.DocsAPI!.DocEditor).toHaveBeenCalled());
    expect(add).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(pendingKey)).toBe(raw);
  });

  it("restores typed input after a cancelled connection without adding", async () => {
    sessionStorage.setItem(pendingKey, JSON.stringify({ documentId: "doc", identifier: "123" }));
    const { add } = setup(false);
    await waitFor(() =>
      expect((screen.getByTestId("oo-add-input") as HTMLInputElement).value).toBe("123"),
    );
    expect(add).not.toHaveBeenCalled();
  });

  it("renders StylePicker in the top bar, loads document style, and applies selected style", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/documents/doc/citations")) {
        return new Response(JSON.stringify({ citations: [], bibliography: null, style: "ieee" }));
      }
      if (url.includes("/api/documents/doc/style") && init?.method === "PUT") {
        return new Response(JSON.stringify({ ok: true, styleId: "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu" }));
      }
      if (url.includes("/api/documents/doc/onlyoffice-config")) {
        return new Response(
          JSON.stringify({
            documentServerUrl: "/oo",
            config: {
              token: "test-token",
              document: { key: "doc-key", permissions: { edit: true } },
              editorConfig: { mode: "edit", user: { id: "u1", name: "User" } },
            },
          }),
        );
      }
      if (url.includes("plugin-credentials")) {
        return new Response(JSON.stringify({ linked: false }));
      }
      return new Response(JSON.stringify({}));
    });
    vi.stubGlobal("fetch", fetchFn);

    window.DocsAPI = { DocEditor: vi.fn().mockImplementation(() => ({ destroyEditor: vi.fn() })) };

    render(
      <OnlyofficeEditorPage
        documentId="doc"
        documentTitle="Academic Paper"
        onBackToDocuments={vi.fn()}
      />,
    );

    // Initial style should load from citations API (ieee)
    await waitFor(() => {
      const label = screen.getByTestId("oo-style-current-label");
      expect(label.textContent).toBe("IEEE");
    });

    // Open style picker
    fireEvent.click(screen.getByTestId("oo-style-picker-btn"));
    expect(screen.getByTestId("oo-style-picker-dropdown")).toBeDefined();

    // Select TÜBİTAK style
    const tubitakBtn = screen.getByTestId(
      "oo-style-item-turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
    );
    fireEvent.click(tubitakBtn);

    // Should call PUT /api/documents/doc/style
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledWith(
        "/api/documents/doc/style",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            styleId: "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
            locale: "tr-TR",
          }),
        }),
      );
    });

    // Notice should appear in Turkish
    await waitFor(() => {
      expect(screen.getByTestId("oo-notice").textContent).toContain("Atıf stili güncellendi");
    });
  });
});
