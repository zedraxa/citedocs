// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../src/App.js";

const loaded = vi.hoisted(() => ({ onlyoffice: vi.fn(), collabora: vi.fn(), legacy: vi.fn() }));
vi.mock("../src/auth/index.js", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  ProtectedRoute: ({ children }: { children: ReactNode }) => children,
  LoginPage: () => <div>Giriş yap</div>,
  SignupPage: () => null,
  ForgotPasswordPage: () => null,
  ResetPasswordPage: () => null,
}));
vi.mock("../src/documents/index.js", () => ({ DocumentsPage: () => <div>Belgelerim</div> }));
vi.mock("../src/onlyoffice/index.js", () => {
  loaded.onlyoffice();
  return { OnlyofficeEditorPage: () => <div>Belge editörü</div> };
});
vi.mock("../src/collabora/index.js", () => {
  loaded.collabora();
  return { CollaboraEditorPage: () => null };
});
vi.mock("../src/LegacyEditorPage.js", () => {
  loaded.legacy();
  return { AppEditor: () => null };
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.unstubAllEnvs();
});

it("does not import editors for login or documents, then loads the requested editor", async () => {
  vi.stubEnv("VITE_EDITOR_BACKEND", "onlyoffice");
  window.history.replaceState({}, "", "/login");
  const { rerender } = render(<App />);
  expect(screen.getByText("Giriş yap")).toBeTruthy();
  window.history.replaceState({}, "", "/documents");
  rerender(<App />);
  expect(screen.getByRole("status").textContent).toBe("Yükleniyor…");
  expect(await screen.findByText("Belgelerim")).toBeTruthy();
  for (const load of Object.values(loaded)) expect(load).not.toHaveBeenCalled();
  window.history.replaceState({}, "", "/editor?doc=test");
  rerender(<App />);
  expect(await screen.findByText("Belge editörü")).toBeTruthy();
  expect(loaded.onlyoffice).toHaveBeenCalledTimes(1);
  expect(loaded.collabora).not.toHaveBeenCalled();
  expect(loaded.legacy).not.toHaveBeenCalled();
});
