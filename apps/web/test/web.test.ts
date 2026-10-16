// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App.js";

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
    delete (window as any).location;
    (window as any).location = new URL(
      "http://localhost:5173/?doc=assignment-quantum&user=Niels%20Bohr&color=%2316a34a",
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

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
    (window as any).location = new URL(`http://localhost:5173/${originalSearch}`);
  });
});

