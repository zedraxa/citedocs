// @vitest-environment happy-dom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "../src/auth/AuthContext.js";
import { DocumentsPage } from "../src/documents/DocumentsPage.js";
import { fetchMyDocuments, fetchSharedDocuments } from "../src/documents/api.js";

vi.mock("../src/documents/api.js", () => ({
  fetchMyDocuments: vi.fn(),
  fetchSharedDocuments: vi.fn(),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchMyDocuments).mockResolvedValue({
    documents: [],
    quota: { used: 0, total: 1024, percentage: 0, remaining: 1024 },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

it("loads once on StrictMode mount and coalesces rapid search input", async () => {
  render(
    <StrictMode>
      <AuthProvider autoFetch={false}>
        <DocumentsPage />
      </AuthProvider>
    </StrictMode>,
  );
  await advance(0);
  expect(fetchMyDocuments).toHaveBeenCalledTimes(1);
  expect(fetchSharedDocuments).not.toHaveBeenCalled();
  const input = screen.getByTestId("doc-search-input");
  fireEvent.change(input, { target: { value: "a" } });
  await advance(100);
  fireEvent.change(input, { target: { value: "ab" } });
  await advance(249);
  expect(fetchMyDocuments).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(fetchMyDocuments).toHaveBeenCalledTimes(2);
  expect(fetchMyDocuments).toHaveBeenLastCalledWith("ab");
});

it("ignores an obsolete request failure after a newer search succeeds", async () => {
  let rejectOld!: (reason: Error) => void;
  vi.mocked(fetchMyDocuments).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectOld = reject;
      }),
  );
  render(
    <AuthProvider autoFetch={false}>
      <DocumentsPage />
    </AuthProvider>,
  );
  await advance(0);
  fireEvent.change(screen.getByTestId("doc-search-input"), { target: { value: "yeni" } });
  await advance(250);
  await act(async () => {
    rejectOld(new Error("Eski istek hatası"));
  });
  expect(screen.queryByText("Eski istek hatası")).toBeNull();
  expect(fetchMyDocuments).toHaveBeenLastCalledWith("yeni");
});

it("cancels a pending search on unmount", async () => {
  const { unmount } = render(
    <AuthProvider autoFetch={false}>
      <DocumentsPage />
    </AuthProvider>,
  );
  await advance(0);
  fireEvent.change(screen.getByTestId("doc-search-input"), { target: { value: "arama" } });
  unmount();
  await advance(250);
  expect(fetchMyDocuments).toHaveBeenCalledTimes(1);
});

it("does not replace newer results with a late successful response", async () => {
  let resolveOld!: (result: Awaited<ReturnType<typeof fetchMyDocuments>>) => void;
  vi.mocked(fetchMyDocuments).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  render(
    <AuthProvider autoFetch={false}>
      <DocumentsPage />
    </AuthProvider>,
  );
  await advance(0);
  fireEvent.change(screen.getByTestId("doc-search-input"), { target: { value: "yeni" } });
  await advance(250);
  const currentContent = document.body.textContent;
  await act(async () => {
    resolveOld({
      documents: [],
      quota: { used: 512, total: 1024, percentage: 50, remaining: 512 },
    });
  });
  expect(document.body.textContent).toBe(currentContent);
});
