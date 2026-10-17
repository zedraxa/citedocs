// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EditorRoute } from "../src/App.js";

vi.mock("../src/onlyoffice/index.js", () => ({
  OnlyofficeEditorPage: ({ documentId }: { documentId: string }) => (
    <div data-testid="onlyoffice">{documentId}</div>
  ),
}));
vi.mock("../src/collabora/index.js", () => ({
  CollaboraEditorPage: () => <div data-testid="collabora" />,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.history.replaceState({}, "", "/");
});

it.each([undefined, "onlyoffice", "false"])(
  "uses ONLYOFFICE with flag %s, even with a Collabora query",
  (flag) => {
    vi.stubEnv("VITE_EDITOR_BACKEND", flag);
    window.history.replaceState({}, "", "/editor?doc=doc%2Fid&editor=collabora");
    render(<EditorRoute />);
    expect(screen.getByTestId("onlyoffice").textContent).toBe("doc/id");
    expect(screen.queryByTestId("collabora")).toBeNull();
  },
);
it("uses Collabora only when explicitly enabled", () => {
  vi.stubEnv("VITE_EDITOR_BACKEND", "collabora");
  window.history.replaceState({}, "", "/editor?doc=doc-id");
  render(<EditorRoute />);
  expect(screen.getByTestId("collabora")).toBeTruthy();
  expect(screen.queryByTestId("onlyoffice")).toBeNull();
});
