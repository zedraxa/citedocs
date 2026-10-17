import {
  buildZoteroPrefXml,
  chunkZoteroPref,
  normalizeStyleId,
  DEFAULT_LOCALE,
  DEFAULT_STYLE_ID,
  ZOTERO_PLUGIN_STORAGE_KEYS,
  getStyleCitationFormat,
  type ZoteroPrefChunk,
} from "@citedocs/shared";

export interface ApplyStyleResult {
  inEditorApplied: boolean;
  pluginRefreshed: boolean;
  chunks: ZoteroPrefChunk[];
  prefXml: string;
}

/**
 * Synchronizes chosen style and locale to localStorage keys read by the official ONLYOFFICE Zotero plugin
 * (CslStylesManager, LocalesManager, CslStylesStorage).
 * Writes across all accessible target windows (host, editor frame, plugin frame) to guarantee persistence.
 */
export function syncZoteroPluginStorage(
  styleId = DEFAULT_STYLE_ID,
  locale = DEFAULT_LOCALE,
  targetWindows?: (Window | null | undefined)[],
): void {
  const cleanId = normalizeStyleId(styleId || DEFAULT_STYLE_ID);
  const format = getStyleCitationFormat(cleanId);
  const wins = targetWindows && targetWindows.length > 0
    ? targetWindows
    : [typeof window !== "undefined" ? window : null];

  for (const win of wins) {
    if (!win) continue;
    try {
      const storage = win.localStorage;
      if (!storage) continue;
      // Real keys read by official ONLYOFFICE Zotero plugin
      storage.setItem(ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_ID, cleanId);
      storage.setItem(ZOTERO_PLUGIN_STORAGE_KEYS.LANG, locale);
      storage.setItem(ZOTERO_PLUGIN_STORAGE_KEYS.FORMAT_ID, format);
      storage.setItem(ZOTERO_PLUGIN_STORAGE_KEYS.CONTAIN_BIBLIOGRAPHY, "true");
      storage.setItem(ZOTERO_PLUGIN_STORAGE_KEYS.NOTES_STYLE_ID, "footnotes");

      // Backward-compatible / alias keys
      storage.setItem(ZOTERO_PLUGIN_STORAGE_KEYS.STYLE, cleanId);
      storage.setItem(ZOTERO_PLUGIN_STORAGE_KEYS.LOCALE, locale);
      storage.setItem(ZOTERO_PLUGIN_STORAGE_KEYS.STYLE_UNDERSCORE, cleanId);
      storage.setItem(ZOTERO_PLUGIN_STORAGE_KEYS.LOCALE_UNDERSCORE, locale);
    } catch {
      /* storage blocked or cross-origin */
    }
  }
}

/**
 * Applies the selected citation style into an active ONLYOFFICE editor session.
 * 1. Prepares canonical Zotero Word preference XML chunked into ZOTERO_PREF_1.. (<=250 chars).
 * 2. Writes custom properties via Asc.editor.callCommand / connector.executeMethod.
 * 3. Syncs storage keys across host window, editor frame window, and plugin frame window.
 * 4. Triggers Zotero plugin refresh/re-render via direct hook, controller settings, refresh button, and postMessage.
 */
export function applyStyleInOnlyoffice(
  container: HTMLElement | null,
  editorInstance?: unknown,
  styleId = DEFAULT_STYLE_ID,
  locale = DEFAULT_LOCALE,
): ApplyStyleResult {
  const cleanId = normalizeStyleId(styleId || DEFAULT_STYLE_ID);
  const format = getStyleCitationFormat(cleanId);
  const prefXml = buildZoteroPrefXml({
    styleId: cleanId,
    locale,
    hasBibliography: true,
  });
  const chunks = chunkZoteroPref(prefXml, 250);

  let inEditorApplied = false;
  let pluginRefreshed = false;

  const frame = container?.querySelector("iframe") as HTMLIFrameElement | null;
  const editorWindow = frame?.contentWindow as
    | (Window & {
        Asc?: {
          scope?: { chunks: ZoteroPrefChunk[]; styleId: string; locale: string };
          editor?: {
            callCommand?: (
              cmd: () => void,
              isClose?: boolean,
              isCalc?: boolean,
              onComplete?: (res: unknown) => void,
            ) => void;
          };
        };
      })
    | null;
  const editorDoc = frame?.contentDocument || editorWindow?.document;
  const panelEl = editorDoc?.getElementById("panel-plugins-zotero") as HTMLElement | null;
  const pluginFrame = panelEl?.querySelector("iframe") as HTMLIFrameElement | null;
  const pluginWindow = pluginFrame?.contentWindow as (Window & Record<string, unknown>) | null;
  const pluginDoc = pluginFrame?.contentDocument || pluginWindow?.document;

  // 1. Sync localStorage across host window, editor frame, and plugin frame
  syncZoteroPluginStorage(cleanId, locale, [
    typeof window !== "undefined" ? window : null,
    editorWindow,
    pluginWindow,
  ]);

  try {
    if (!container) {
      return { inEditorApplied, pluginRefreshed, chunks, prefXml };
    }

    // 2. Try connector if available (Automation API in some editions)
    const editorObj = editorInstance as {
      createConnector?: () => {
        executeMethod?: (method: string, params: unknown[], cb?: (res: unknown) => void) => void;
      };
    } | null;

    if (typeof editorObj?.createConnector === "function") {
      try {
        const connector = editorObj.createConnector();
        if (typeof connector?.executeMethod === "function") {
          for (const c of chunks) {
            connector.executeMethod("AddCustomProperty", [c.name, c.value]);
          }
          inEditorApplied = true;
        }
      } catch {
        /* connector method not supported */
      }
    }

    // 3. Use Asc.editor.callCommand via editor frame window
    if (typeof editorWindow?.Asc?.editor?.callCommand === "function") {
      try {
        editorWindow.Asc.scope = { chunks, styleId: cleanId, locale };
        editorWindow.Asc.editor.callCommand(
          () => {
            // @ts-expect-error ONLYOFFICE internal Api
            const scope = Asc.scope;
            // @ts-expect-error ONLYOFFICE internal Api
            const props = typeof Api.GetCustomProperties === "function"
              // @ts-expect-error ONLYOFFICE internal Api
              ? Api.GetCustomProperties()
              // @ts-expect-error ONLYOFFICE internal Api
              : (typeof Api.GetDocument === "function" && Api.GetDocument().GetCustomProperties
                // @ts-expect-error ONLYOFFICE internal Api
                ? Api.GetDocument().GetCustomProperties()
                : null);

            if (props && typeof props.Add === "function") {
              for (let i = 0; i < scope.chunks.length; i++) {
                props.Add(scope.chunks[i].name, scope.chunks[i].value);
              }
            }
          },
          false,
          true,
        );
        inEditorApplied = true;
      } catch {
        /* callCommand error */
      }
    }

    // 4. Trigger Zotero plugin refresh/re-render if plugin frame or window is accessible
    if (pluginWindow || pluginDoc) {
      try {
        // A. Direct hook if available on pluginWindow
        const pWin = pluginWindow as unknown as {
          __citedocsSyncStyle?: (s: string, l: string, f?: string) => Promise<void> | void;
          __zoteroSettings?: {
            getStyleManager?: () => {
              getStyle?: (s: string, b: boolean) => Promise<unknown>;
              saveLastUsedNotesStyle?: (s: string) => void;
              getLastUsedNotesStyle?: () => string;
              getLastUsedFormat?: () => string;
            };
            getLocalesManager?: () => {
              loadLocale?: (l: string) => Promise<unknown>;
              saveLastUsedLanguage?: (l: string) => void;
            };
          };
          __zoteroCitationService?: {
            updateCslItems?: (bHardRefresh?: boolean) => Promise<unknown>;
            updateCslItemsInNotes?: (notesStyle: string) => Promise<unknown>;
          };
        } | null;

        if (typeof pWin?.__citedocsSyncStyle === "function") {
          pWin.__citedocsSyncStyle(cleanId, locale, format);
          pluginRefreshed = true;
        } else if (pWin?.__zoteroSettings && pWin?.__zoteroCitationService) {
          try {
            const styleMgr = pWin.__zoteroSettings.getStyleManager?.();
            const locMgr = pWin.__zoteroSettings.getLocalesManager?.();
            if (locMgr) {
              locMgr.loadLocale?.(locale);
              locMgr.saveLastUsedLanguage?.(locale);
            }
            if (styleMgr) {
              styleMgr.getStyle?.(cleanId, true);
            }
            const notesStyle = styleMgr?.getLastUsedNotesStyle?.() || "footnotes";
            if (format === "note") {
              pWin.__zoteroCitationService.updateCslItemsInNotes?.(notesStyle);
            } else {
              pWin.__zoteroCitationService.updateCslItems?.(true);
            }
            pluginRefreshed = true;
          } catch {
            /* ignore */
          }
        }

        // B. DOM refresh button trigger in plugin document
        if (pluginDoc) {
          const refreshBtn = (pluginDoc.getElementById("refreshBtn") ||
            pluginDoc.querySelector(
              "button#refreshBtn, #refreshBtn, button#refresh, .btn-refresh, [data-action='refresh'], button[title*='Refresh'], button[title*='Yenile']",
            )) as HTMLElement | null;

          if (refreshBtn && typeof refreshBtn.click === "function") {
            refreshBtn.click();
            pluginRefreshed = true;
          }
        }

        // C. PostMessage to plugin frame
        if (pluginWindow && typeof pluginWindow.postMessage === "function") {
          pluginWindow.postMessage(
            { type: "zotero:refreshStyle", styleId: cleanId, locale, format },
            "*",
          );
          pluginWindow.postMessage(
            { type: "zotero:setStyle", styleId: cleanId, locale, format },
            "*",
          );
          pluginWindow.postMessage(
            { type: "citedocs:styleChange", styleId: cleanId, locale, format },
            "*",
          );
          pluginRefreshed = true;
        }
      } catch {
        /* cross-origin or plugin unmounted */
      }
    }
  } catch {
    /* ignore DOM errors */
  }

  return { inEditorApplied, pluginRefreshed, chunks, prefXml };
}

