// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { StylePicker, type StyleItem } from "../src/onlyoffice/StylePicker.js";

vi.mock("../src/auth/api.js", () => ({
  getApiBaseUrl: () => "",
  getCsrfToken: () => "csrf-token-123",
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const MOCK_SEARCH_RESULTS: StyleItem[] = [
  {
    id: "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
    title: "TÜBİTAK (Türkiye Bilimsel ve Teknolojik Araştırma Kurumu) (Türkçe)",
    shortTitle: "TÜBİTAK",
    citationFormat: "numeric",
    isPinned: true,
  },
  {
    id: "turkish-journal-of-electrical-engineering-and-computer-sciences",
    title: "Turkish Journal of Electrical Engineering & Computer Sciences",
    shortTitle: "Turk J Elec Eng & Comp Sci",
    citationFormat: "numeric",
  },
];

describe("StylePicker Component", () => {
  it("renders trigger button with default APA 7th edition label", () => {
    render(<StylePicker documentId="doc-123" currentStyleId="apa" />);

    const triggerBtn = screen.getByTestId("oo-style-picker-btn");
    expect(triggerBtn).toBeDefined();

    const label = screen.getByTestId("oo-style-current-label");
    expect(label.textContent).toBe("APA 7th");
  });

  it("opens dropdown and lists pinned popular styles including APA 7, IEEE, and TÜBİTAK", async () => {
    render(<StylePicker documentId="doc-123" currentStyleId="apa" />);

    const triggerBtn = screen.getByTestId("oo-style-picker-btn");
    fireEvent.click(triggerBtn);

    const dropdown = screen.getByTestId("oo-style-picker-dropdown");
    expect(dropdown).toBeDefined();

    // Verify pinned popular styles are rendered
    expect(screen.getByTestId("oo-style-item-apa")).toBeDefined();
    expect(screen.getByTestId("oo-style-item-ieee")).toBeDefined();
    expect(screen.getByTestId("oo-style-item-turkiye-bilimsel-ve-teknolojik-arastirma-kurumu")).toBeDefined();
    expect(screen.getByTestId("oo-style-item-chicago-author-date")).toBeDefined();
    expect(screen.getByTestId("oo-style-item-modern-language-association")).toBeDefined();
    expect(screen.getByTestId("oo-style-item-harvard-cite-them-right")).toBeDefined();
    expect(screen.getByTestId("oo-style-item-vancouver")).toBeDefined();

    // Verify Turkish section header
    expect(screen.getByText("Sık Kullanılan Popüler Stiller")).toBeDefined();
  });

  it("performs debounced search against /api/styles with min 2 characters", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/styles?q=tubitak")) {
        return new Response(JSON.stringify({ styles: MOCK_SEARCH_RESULTS, total: 2 }));
      }
      return new Response(JSON.stringify({ styles: [] }));
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<StylePicker documentId="doc-123" currentStyleId="apa" />);

    fireEvent.click(screen.getByTestId("oo-style-picker-btn"));

    const searchInput = screen.getByTestId("oo-style-search-input");

    // 1 char should not trigger search
    fireEvent.change(searchInput, { target: { value: "t" } });
    expect(fetchFn).not.toHaveBeenCalled();

    // 2+ chars triggers debounced search
    fireEvent.change(searchInput, { target: { value: "tubitak" } });

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledWith(
        expect.stringContaining("/api/styles?q=tubitak"),
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Arama Sonuçları (en fazla 50)")).toBeDefined();
      expect(
        screen.getByTestId("oo-style-item-turkiye-bilimsel-ve-teknolojik-arastirma-kurumu"),
      ).toBeDefined();
    });
  });

  it("selects a style, calls onStyleSelected callback, and closes dropdown", async () => {
    const onSelect = vi.fn();
    render(
      <StylePicker
        documentId="doc-123"
        currentStyleId="apa"
        onStyleSelected={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("oo-style-picker-btn"));

    const ieeeItem = screen.getByTestId("oo-style-item-ieee");
    fireEvent.click(ieeeItem);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: "ieee", title: "IEEE" }),
      );
    });

    // Dropdown should be closed after selection
    expect(screen.queryByTestId("oo-style-picker-dropdown")).toBeNull();

    // Trigger label should reflect the selected style
    expect(screen.getByTestId("oo-style-current-label").textContent).toBe("IEEE");
  });

  it("works without requiring Zotero account linking", () => {
    // Zero localStorage credentials
    localStorage.clear();

    render(<StylePicker documentId="doc-unlinked" currentStyleId="apa" />);

    const triggerBtn = screen.getByTestId("oo-style-picker-btn") as HTMLButtonElement;
    expect(triggerBtn.disabled).toBe(false);

    fireEvent.click(triggerBtn);
    expect(screen.getByTestId("oo-style-picker-dropdown")).toBeDefined();
  });
});
