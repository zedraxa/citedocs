// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("virtualizes large style repositories (~10k styles) mounting only visible items and overscan [ZC-05]", async () => {
    const LARGE_COUNT = 10_000;
    const largeMockStyles: StyleItem[] = Array.from({ length: LARGE_COUNT }, (_, i) => ({
      id: `style-item-${i}`,
      title: `Academic Style ${i}`,
      shortTitle: `AS ${i}`,
      citationFormat: i % 2 === 0 ? "author-date" : "numeric",
    }));

    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/styles?q=academic")) {
        return new Response(JSON.stringify({ styles: largeMockStyles, total: LARGE_COUNT }));
      }
      return new Response(JSON.stringify({ styles: [] }));
    });
    vi.stubGlobal("fetch", fetchFn);

    const onSelect = vi.fn();
    const { container } = render(
      <StylePicker
        documentId="doc-virt-test"
        currentStyleId="apa"
        onStyleSelected={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("oo-style-picker-btn"));

    const searchInput = screen.getByTestId("oo-style-search-input");
    fireEvent.change(searchInput, { target: { value: "academic" } });

    await waitFor(() => {
      expect(screen.getByTestId("oo-style-virtual-spacer")).toBeDefined();
      expect(screen.getByTestId("oo-style-item-style-item-0")).toBeDefined();
    });

    // Verify virtual spacer height corresponds to 10k items (10,000 * 46px = 460,000px)
    const spacer = screen.getByTestId("oo-style-virtual-spacer");
    expect(spacer.style.height).toBe(`${LARGE_COUNT * 46}px`);

    // Verify DOM node count: out of 10,000 styles, only a tiny window (<= 25 items) is mounted
    const mountedButtons = container.querySelectorAll('[data-testid^="oo-style-item-"]');
    expect(mountedButtons.length).toBeGreaterThan(0);
    expect(mountedButtons.length).toBeLessThanOrEqual(25);

    // Style at index 500 should NOT be mounted initially
    expect(screen.queryByTestId("oo-style-item-style-item-500")).toBeNull();

    // Scroll down by 4,600px (around index 100)
    const scrollContainer = screen.getByTestId("oo-style-list-container");
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 4600 } });

    await waitFor(() => {
      // Style 0 should now be unmounted
      expect(screen.queryByTestId("oo-style-item-style-item-0")).toBeNull();
      // Style 100 should now be mounted
      expect(screen.getByTestId("oo-style-item-style-item-100")).toBeDefined();
    });

    // Still only a small window of DOM elements mounted
    const scrolledButtons = container.querySelectorAll('[data-testid^="oo-style-item-"]');
    expect(scrolledButtons.length).toBeGreaterThan(0);
    expect(scrolledButtons.length).toBeLessThanOrEqual(25);

    // Clicking a virtualized row selects it and closes the dropdown
    fireEvent.click(screen.getByTestId("oo-style-item-style-item-100"));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: "style-item-100", title: "Academic Style 100" }),
      );
      expect(screen.queryByTestId("oo-style-picker-dropdown")).toBeNull();
    });
  });

  it("supports keyboard navigation with ArrowDown, ArrowUp, and Enter selection", async () => {
    const onSelect = vi.fn();
    render(
      <StylePicker
        documentId="doc-keyboard-test"
        currentStyleId="apa"
        onStyleSelected={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("oo-style-picker-btn"));

    const searchInput = screen.getByTestId("oo-style-search-input");

    // Initial pinned active style is APA 7 (index 0). ArrowDown moves to IEEE (index 1).
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    const ieeeItem = screen.getByTestId("oo-style-item-ieee");
    expect(ieeeItem.className).toContain("ring-1 ring-blue-400");

    // ArrowDown again moves to Chicago Author-Date (index 2).
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    const chicagoItem = screen.getByTestId("oo-style-item-chicago-author-date");
    expect(chicagoItem.className).toContain("ring-1 ring-blue-400");

    // ArrowUp moves back to IEEE (index 1).
    fireEvent.keyDown(searchInput, { key: "ArrowUp" });
    expect(ieeeItem.className).toContain("ring-1 ring-blue-400");

    // Enter selects IEEE
    fireEvent.keyDown(searchInput, { key: "Enter" });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: "ieee" }),
      );
      expect(screen.queryByTestId("oo-style-picker-dropdown")).toBeNull();
    });
  });

  it("closes dropdown when Escape key is pressed", () => {
    render(<StylePicker documentId="doc-esc-test" currentStyleId="apa" />);

    fireEvent.click(screen.getByTestId("oo-style-picker-btn"));
    expect(screen.getByTestId("oo-style-picker-dropdown")).toBeDefined();

    const searchInput = screen.getByTestId("oo-style-search-input");
    fireEvent.keyDown(searchInput, { key: "Escape" });

    expect(screen.queryByTestId("oo-style-picker-dropdown")).toBeNull();
  });

  it("clears search input with clear button and restores pinned popular styles", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/styles?q=tubitak")) {
        return new Response(JSON.stringify({ styles: MOCK_SEARCH_RESULTS, total: 2 }));
      }
      return new Response(JSON.stringify({ styles: [] }));
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<StylePicker documentId="doc-clear-test" currentStyleId="apa" />);

    fireEvent.click(screen.getByTestId("oo-style-picker-btn"));

    const searchInput = screen.getByTestId("oo-style-search-input");
    fireEvent.change(searchInput, { target: { value: "tubitak" } });

    await waitFor(() => {
      expect(screen.getByText("Arama Sonuçları (en fazla 50)")).toBeDefined();
    });

    // Clear search with clear button
    const clearBtn = screen.getByTestId("oo-style-search-clear");
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText("Sık Kullanılan Popüler Stiller")).toBeDefined();
      expect(screen.getByTestId("oo-style-item-apa")).toBeDefined();
    });
  });

  it("displays Turkish empty state message when search returns no matching styles", async () => {
    const fetchFn = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ styles: [], total: 0 }));
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<StylePicker documentId="doc-empty-test" currentStyleId="apa" />);

    fireEvent.click(screen.getByTestId("oo-style-picker-btn"));

    const searchInput = screen.getByTestId("oo-style-search-input");
    fireEvent.change(searchInput, { target: { value: "bulunamayanstilxyz" } });

    await waitFor(() => {
      expect(screen.getByText("Eşleşen atıf stili bulunamadı.")).toBeDefined();
      expect(
        screen.getByText(
          "Lütfen farklı anahtar kelimeler deneyin (örn. APA, MLA, Chicago, IEEE, Harvard).",
        ),
      ).toBeDefined();
    });
  });
});
