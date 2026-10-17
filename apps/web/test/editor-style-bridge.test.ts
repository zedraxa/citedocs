// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyStyleInOnlyoffice,
  syncZoteroPluginStorage,
} from "../src/onlyoffice/editorStyleBridge.js";

describe("editorStyleBridge", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("syncs Zotero plugin localStorage keys with chosen style and locale", () => {
    syncZoteroPluginStorage("turkiye-bilimsel-ve-teknolojik-arastirma-kurumu", "tr-TR");
    expect(localStorage.getItem("zoteroStyle")).toBe(
      "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
    );
    expect(localStorage.getItem("zoteroLocale")).toBe("tr-TR");
    expect(localStorage.getItem("zotero_style")).toBe(
      "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
    );
  });

  it("calls Asc.editor.callCommand when frame window is available", () => {
    const callCommand = vi.fn((cmd: () => void) => {
      // Execute cmd to verify it doesn't throw in mock environment
      try {
        cmd();
      } catch {
        /* Api is mock */
      }
    });

    const mockWin = {
      Asc: {
        scope: undefined as unknown,
        editor: { callCommand },
      },
    };

    const container = {
      querySelector: vi.fn().mockReturnValue({
        contentWindow: mockWin,
      }),
    } as unknown as HTMLElement;

    const result = applyStyleInOnlyoffice(container, undefined, "ieee", "tr-TR");

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0].name).toBe("ZOTERO_PREF_1");
    expect(result.chunks[0].value).toContain("ieee");
    expect(result.inEditorApplied).toBe(true);
    expect(callCommand).toHaveBeenCalledOnce();
    expect(mockWin.Asc.scope).toBeDefined();
  });

  it("handles missing container gracefully", () => {
    const result = applyStyleInOnlyoffice(null, undefined, "apa", "tr-TR");
    expect(result.inEditorApplied).toBe(false);
    expect(result.prefXml).toContain("apa");
    expect(localStorage.getItem("zoteroStyle")).toBe("apa");
  });
});
