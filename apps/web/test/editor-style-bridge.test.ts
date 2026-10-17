// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_LOCALE,
  DEFAULT_STYLE_ID,
  ZOTERO_PLUGIN_STORAGE_KEYS,
} from "@citedocs/shared";
import {
  applyStyleInOnlyoffice,
  syncZoteroPluginStorage,
} from "../src/onlyoffice/editorStyleBridge.js";

describe("editorStyleBridge", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("syncZoteroPluginStorage", () => {
    it("syncs official ONLYOFFICE Zotero plugin keys and legacy aliases to localStorage", () => {
      syncZoteroPluginStorage("turkiye-bilimsel-ve-teknolojik-arastirma-kurumu", "tr-TR");

      // Canonical keys read by official ONLYOFFICE Zotero plugin
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_ID)).toBe(
        "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
      );
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.LANG)).toBe("tr-TR");
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.FORMAT_ID)).toBe("numeric");
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.CONTAIN_BIBLIOGRAPHY)).toBe("true");
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.NOTES_STYLE_ID)).toBe("footnotes");

      // Backward-compatible alias keys
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.STYLE)).toBe(
        "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
      );
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.LOCALE)).toBe("tr-TR");
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_UNDERSCORE)).toBe(
        "turkiye-bilimsel-ve-teknolojik-arastirma-kurumu",
      );
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.LOCALE_UNDERSCORE)).toBe("tr-TR");
    });

    it("defaults to APA 7th edition ('apa') and 'tr-TR' when called without arguments", () => {
      syncZoteroPluginStorage();

      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_ID)).toBe(DEFAULT_STYLE_ID);
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.LANG)).toBe(DEFAULT_LOCALE);
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.FORMAT_ID)).toBe("author-date");
    });

    it("correctly infers citation formats (author-date, numeric, note)", () => {
      // APA -> author-date
      syncZoteroPluginStorage("apa", "tr-TR");
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.FORMAT_ID)).toBe("author-date");

      // IEEE -> numeric
      syncZoteroPluginStorage("ieee", "tr-TR");
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.FORMAT_ID)).toBe("numeric");

      // Chicago note -> note
      syncZoteroPluginStorage("chicago-note-bibliography", "tr-TR");
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.FORMAT_ID)).toBe("note");
    });

    it("syncs across multiple target windows (host, editor, plugin frames)", () => {
      const mockStorage1: Record<string, string> = {};
      const mockStorage2: Record<string, string> = {};

      const mockWin1 = {
        localStorage: {
          setItem: vi.fn((k: string, v: string) => {
            mockStorage1[k] = v;
          }),
        },
      } as unknown as Window;

      const mockWin2 = {
        localStorage: {
          setItem: vi.fn((k: string, v: string) => {
            mockStorage2[k] = v;
          }),
        },
      } as unknown as Window;

      syncZoteroPluginStorage("ieee", "tr-TR", [mockWin1, mockWin2]);

      expect(mockWin1.localStorage.setItem).toHaveBeenCalledWith(
        ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_ID,
        "ieee",
      );
      expect(mockWin2.localStorage.setItem).toHaveBeenCalledWith(
        ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_ID,
        "ieee",
      );
      expect(mockStorage1[ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_ID]).toBe("ieee");
      expect(mockStorage2[ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_ID]).toBe("ieee");
    });

    it("gracefully tolerates cross-origin or throwing storage without crashing", () => {
      const throwingWin = {
        get localStorage() {
          throw new DOMException("Permission denied", "SecurityError");
        },
      } as unknown as Window;

      expect(() => {
        syncZoteroPluginStorage("ieee", "tr-TR", [throwingWin, null, undefined]);
      }).not.toThrow();
    });
  });

  describe("applyStyleInOnlyoffice", () => {
    it("handles missing container gracefully and still syncs host storage", async () => {
      const result = await applyStyleInOnlyoffice(null, undefined, "apa", "tr-TR");

      expect(result.inEditorApplied).toBe(false);
      expect(result.pluginRefreshed).toBe(false);
      expect(result.prefXml).toContain("apa");
      expect(result.prefXml).toContain("tr-TR");
      expect(localStorage.getItem(ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_ID)).toBe("apa");
    });

    it("calls Asc.editor.callCommand when frame window is available and populates Asc.scope", async () => {
      const callCommand = vi.fn((cmd: () => void) => {
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

      const result = await applyStyleInOnlyoffice(container, undefined, "ieee", "tr-TR");

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].name).toBe("ZOTERO_PREF_1");
      expect(result.chunks[0].value).toContain("ieee");
      expect(result.inEditorApplied).toBe(true);
      expect(callCommand).toHaveBeenCalledOnce();
      expect(mockWin.Asc.scope).toEqual({
        chunks: result.chunks,
        styleId: "ieee",
        locale: "tr-TR",
      });
    });

    it("uses connector.executeMethod when createConnector is available", async () => {
      const executeMethod = vi.fn();
      const mockEditor = {
        createConnector: vi.fn().mockReturnValue({ executeMethod }),
      };

      const container = {
        querySelector: vi.fn().mockReturnValue(null),
      } as unknown as HTMLElement;

      const result = await applyStyleInOnlyoffice(container, mockEditor, "ieee", "tr-TR");

      expect(mockEditor.createConnector).toHaveBeenCalledOnce();
      expect(executeMethod).toHaveBeenCalled();
      expect(executeMethod).toHaveBeenCalledWith(
        "AddCustomProperty",
        expect.arrayContaining(["ZOTERO_PREF_1"]),
      );
      expect(result.inEditorApplied).toBe(true);
    });

    it("triggers direct plugin hook __citedocsSyncStyle when available on pluginWindow", async () => {
      const syncStyleFn = vi.fn();
      const mockPluginWin = {
        __citedocsSyncStyle: syncStyleFn,
        postMessage: vi.fn(),
      };

      const mockPluginFrame = {
        contentWindow: mockPluginWin,
        contentDocument: { getElementById: vi.fn().mockReturnValue(null) },
      };

      const mockEditorDoc = {
        getElementById: vi.fn().mockImplementation((id: string) => {
          if (id === "panel-plugins-zotero") {
            return {
              querySelector: vi.fn().mockReturnValue(mockPluginFrame),
            };
          }
          return null;
        }),
      };

      const mockEditorWin = {
        document: mockEditorDoc,
      };

      const container = {
        querySelector: vi.fn().mockReturnValue({
          contentWindow: mockEditorWin,
          contentDocument: mockEditorDoc,
        }),
      } as unknown as HTMLElement;

      const result = await applyStyleInOnlyoffice(container, undefined, "ieee", "tr-TR");

      expect(syncStyleFn).toHaveBeenCalledWith("ieee", "tr-TR", "numeric");
      expect(result.pluginRefreshed).toBe(true);
    });

    it("triggers __zoteroSettings and __zoteroCitationService when available", async () => {
      const loadLocale = vi.fn();
      const saveLastUsedLanguage = vi.fn();
      const getStyle = vi.fn();
      const updateCslItems = vi.fn();

      const mockPluginWin = {
        __zoteroSettings: {
          getLocalesManager: () => ({ loadLocale, saveLastUsedLanguage }),
          getStyleManager: () => ({ getStyle, getLastUsedNotesStyle: () => "footnotes" }),
        },
        __zoteroCitationService: {
          updateCslItems,
        },
        postMessage: vi.fn(),
      };

      const mockPluginFrame = {
        contentWindow: mockPluginWin,
        contentDocument: { getElementById: vi.fn().mockReturnValue(null) },
      };

      const mockEditorDoc = {
        getElementById: vi.fn().mockImplementation((id: string) => {
          if (id === "panel-plugins-zotero") {
            return {
              querySelector: vi.fn().mockReturnValue(mockPluginFrame),
            };
          }
          return null;
        }),
      };

      const container = {
        querySelector: vi.fn().mockReturnValue({
          contentWindow: { document: mockEditorDoc },
          contentDocument: mockEditorDoc,
        }),
      } as unknown as HTMLElement;

      const result = await applyStyleInOnlyoffice(container, undefined, "ieee", "tr-TR");

      expect(loadLocale).toHaveBeenCalledWith("tr-TR");
      expect(saveLastUsedLanguage).toHaveBeenCalledWith("tr-TR");
      expect(getStyle).toHaveBeenCalledWith("ieee", true);
      expect(updateCslItems).toHaveBeenCalledWith(true);
      expect(result.pluginRefreshed).toBe(true);
    });

    it("clicks DOM #refreshBtn when present in plugin frame document", async () => {
      const clickFn = vi.fn();
      const mockRefreshBtn = { click: clickFn };

      const mockPluginDoc = {
        getElementById: vi.fn().mockImplementation((id: string) => {
          if (id === "refreshBtn") return mockRefreshBtn;
          return null;
        }),
        querySelector: vi.fn(),
      };

      const mockPluginFrame = {
        contentWindow: { postMessage: vi.fn() },
        contentDocument: mockPluginDoc,
      };

      const mockEditorDoc = {
        getElementById: vi.fn().mockImplementation((id: string) => {
          if (id === "panel-plugins-zotero") {
            return {
              querySelector: vi.fn().mockReturnValue(mockPluginFrame),
            };
          }
          return null;
        }),
      };

      const container = {
        querySelector: vi.fn().mockReturnValue({
          contentWindow: { document: mockEditorDoc },
          contentDocument: mockEditorDoc,
        }),
      } as unknown as HTMLElement;

      const result = await applyStyleInOnlyoffice(container, undefined, "ieee", "tr-TR");

      expect(clickFn).toHaveBeenCalledOnce();
      expect(result.pluginRefreshed).toBe(true);
    });

    it("sends postMessages to pluginWindow with style, locale, and format", async () => {
      const postMessage = vi.fn();
      const mockPluginWin = { postMessage };

      const mockPluginFrame = {
        contentWindow: mockPluginWin,
        contentDocument: {
          getElementById: vi.fn().mockReturnValue(null),
          querySelector: vi.fn().mockReturnValue(null),
        },
      };

      const mockEditorDoc = {
        getElementById: vi.fn().mockImplementation((id: string) => {
          if (id === "panel-plugins-zotero") {
            return {
              querySelector: vi.fn().mockReturnValue(mockPluginFrame),
            };
          }
          return null;
        }),
      };

      const container = {
        querySelector: vi.fn().mockReturnValue({
          contentWindow: { document: mockEditorDoc },
          contentDocument: mockEditorDoc,
        }),
      } as unknown as HTMLElement;

      const result = await applyStyleInOnlyoffice(container, undefined, "apa", "tr-TR");

      expect(postMessage).toHaveBeenCalledWith(
        { type: "zotero:refreshStyle", styleId: "apa", locale: "tr-TR", format: "author-date" },
        "*",
      );
      expect(postMessage).toHaveBeenCalledWith(
        { type: "zotero:setStyle", styleId: "apa", locale: "tr-TR", format: "author-date" },
        "*",
      );
      expect(postMessage).toHaveBeenCalledWith(
        { type: "citedocs:styleChange", styleId: "apa", locale: "tr-TR", format: "author-date" },
        "*",
      );
      expect(result.pluginRefreshed).toBe(true);
    });
    it("discovers and triggers __citedocsSyncStyle when exposed on host/top window even without pluginFrame", async () => {
      const syncStyleFn = vi.fn();
      // @ts-expect-error test mock on window
      window.__citedocsSyncStyle = syncStyleFn;

      try {
        const mockEditorDoc = {
          getElementById: vi.fn().mockReturnValue(null),
          querySelectorAll: vi.fn().mockReturnValue([]),
        };

        const container = {
          querySelector: vi.fn().mockReturnValue({
            contentWindow: { document: mockEditorDoc },
            contentDocument: mockEditorDoc,
          }),
        } as unknown as HTMLElement;

        const result = await applyStyleInOnlyoffice(container, undefined, "ieee", "tr-TR");

        expect(syncStyleFn).toHaveBeenCalledWith("ieee", "tr-TR", "numeric");
        expect(result.pluginRefreshed).toBe(true);
      } finally {
        // @ts-expect-error clean up mock
        delete window.__citedocsSyncStyle;
      }
    });
  });
});

