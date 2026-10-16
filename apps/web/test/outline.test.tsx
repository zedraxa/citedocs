// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { LegacyApp as App } from "../src/App.js";

// Keep the real editor and all its commands; only replace network collaboration.
vi.mock("../src/hooks/useCollab.js", () => ({
  useCollab: () => ({
    provider: null,
    ydoc: undefined,
    documentId: "outline-test",
    currentUser: { id: "test", name: "Test", color: "#2563eb" },
    collaborators: [],
    status: "disconnected",
    isReadOnly: false,
  }),
}));

afterEach(cleanup);

async function setup(content: string) {
  const { container } = render(<App />);
  const surface = container.querySelector(".tiptap") as HTMLElement & { editor: Editor };
  const editor = surface.editor;
  await waitFor(() => expect(editor.isInitialized).toBe(true));
  await act(async () => {
    editor.commands.setContent(content);
  });
  return {
    editor,
    outline: within(screen.getByRole("complementary", { name: "Document Outline" })),
  };
}

describe("App document outline", () => {
  it("lists H1 through H6 in order with distinct indentation", async () => {
    const { outline } = await setup(
      Array.from({ length: 6 }, (_, i) => `<h${i + 1}>Section ${i + 1}</h${i + 1}>`).join(""),
    );
    const buttons = outline.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(
      Array.from({ length: 6 }, (_, i) => `Section ${i + 1}`),
    );
    expect(buttons.map((button) => button.style.paddingLeft)).toEqual([
      "8px",
      "20px",
      "32px",
      "44px",
      "56px",
      "68px",
    ]);
  });

  it("clicks into a heading and requests scrolling", async () => {
    const { editor, outline } = await setup("<h1>First</h1><p>Body</p><h2>Second</h2>");
    let headingPos = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && node.textContent === "Second") headingPos = pos;
    });
    let scrolled = false;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.scrolledIntoView) scrolled = true;
    });
    fireEvent.click(outline.getByRole("button", { name: "Second" }));
    expect(editor.state.selection.from).toBe(headingPos + 1);
    expect(scrolled).toBe(true);
    expect(outline.getByRole("button", { name: "Second" }).getAttribute("aria-current")).toBe(
      "location",
    );
  });

  it("reacts to heading formatting without a text change and to deletion", async () => {
    const { editor, outline } = await setup("<p>Same text</p>");
    expect(outline.queryAllByRole("button")).toHaveLength(0);
    act(() => {
      editor.chain().setTextSelection(1).setHeading({ level: 2 }).run();
    });
    expect(outline.getByRole("button", { name: "Same text" }).style.paddingLeft).toBe("20px");
    act(() => {
      editor.commands.insertContent("Renamed ");
    });
    expect(outline.getByRole("button", { name: "Renamed Same text" })).toBeTruthy();
    act(() => {
      editor.commands.clearContent();
    });
    expect(outline.queryAllByRole("button")).toHaveLength(0);
    expect(outline.getByText("No headings yet. Add headings to outline.")).toBeTruthy();
  });

  it("tracks cursor movement into section body paragraphs", async () => {
    const { editor, outline } = await setup(
      "<p>Intro</p><h1>First</h1><p>Body</p><h2>Second</h2><p>End</p>",
    );
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    });
    expect(outline.getByRole("button", { name: "Second" }).getAttribute("aria-current")).toBe(
      "location",
    );
    act(() => {
      editor.commands.setTextSelection(16);
    });
    expect(outline.getByRole("button", { name: "First" }).getAttribute("aria-current")).toBe(
      "location",
    );
    act(() => {
      editor.commands.setTextSelection(1);
    });
    expect(
      outline.getAllByRole("button").every((button) => !button.hasAttribute("aria-current")),
    ).toBe(true);
  });

  it("handles an empty document and unnamed headings", async () => {
    const { editor, outline } = await setup("<p></p>");
    expect(outline.getByText("No headings yet. Add headings to outline.")).toBeTruthy();
    act(() => {
      editor.commands.setContent("<h1></h1>");
    });
    expect(outline.getByRole("button", { name: "Untitled heading" })).toBeTruthy();
  });

  it("reopens the sidebar with the latest document", async () => {
    const { editor } = await setup("<h1>Before</h1>");
    fireEvent.click(screen.getByTitle("Toggle Document Outline"));
    expect(screen.queryByRole("complementary", { name: "Document Outline" })).toBeNull();
    act(() => {
      editor.commands.setContent("<h2>After</h2>");
    });
    fireEvent.click(screen.getByTitle("Toggle Document Outline"));
    expect(
      within(screen.getByRole("complementary", { name: "Document Outline" })).getByRole("button", {
        name: "After",
      }),
    ).toBeTruthy();
  });
});
