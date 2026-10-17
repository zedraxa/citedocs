import {
  buildZoteroPrefXml,
  chunkZoteroPref,
  normalizeStyleId,
  DEFAULT_LOCALE,
  type ZoteroPrefChunk,
} from "@citedocs/shared";

export interface ApplyStyleResult {
  inEditorApplied: boolean;
  pluginRefreshed: boolean;
  chunks: ZoteroPrefChunk[];
  prefXml: string;
}

/**
 * Synchronizes chosen style/locale to localStorage keys used by the official ONLYOFFICE Zotero plugin.
 */
export function syncZoteroPluginStorage(styleId: string, locale = DEFAULT_LOCALE): void {
  try {
    const cleanId = normalizeStyleId(styleId);
    localStorage.setItem("zoteroStyle", cleanId);
    localStorage.setItem("zoteroStyleId", cleanId);
    localStorage.setItem("zoteroLocale", locale);
    localStorage.setItem("zotero_style", cleanId);
    localStorage.setItem("zotero_locale", locale);
  } catch {
    /* storage blocked */
  }
}

/**
 * Applies the selected citation style into an active ONLYOFFICE editor session.
 * 1. Prepares canonical Zotero Word preference XML chunked into ZOTERO_PREF_1.. (<=250 chars).
 * 2. Writes custom properties via Asc.editor.callCommand / connector.executeMethod.
 * 3. Triggers Zotero plugin refresh if the plugin panel is open.
 * 4. Syncs same-origin localStorage keys so Zotero plugin stays consistent.
 */
export function applyStyleInOnlyoffice(
  container: HTMLElement | null,
  editorInstance?: unknown,
  styleId = "apa",
  locale = DEFAULT_LOCALE,
): ApplyStyleResult {
  const cleanId = normalizeStyleId(styleId);
  const prefXml = buildZoteroPrefXml({
    styleId: cleanId,
    locale,
    hasBibliography: true,
  });
  const chunks = chunkZoteroPref(prefXml, 250);

  // Sync localStorage keys for the Zotero plugin
  syncZoteroPluginStorage(cleanId, locale);

  let inEditorApplied = false;
  let pluginRefreshed = false;

  try {
    if (!container) {
      return { inEditorApplied, pluginRefreshed, chunks, prefXml };
    }

    const frame = container.querySelector("iframe") as HTMLIFrameElement | null;
    if (!frame) {
      return { inEditorApplied, pluginRefreshed, chunks, prefXml };
    }

    const editorWindow = frame.contentWindow as
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

    // 1. Try connector if available (Automation API in some editions)
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

    // 2. Use Asc.editor.callCommand via editor frame window
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

    // 3. Trigger Zotero plugin refresh if plugin panel is mounted
    const editorDoc = frame.contentDocument || editorWindow?.document;
    const panelEl = editorDoc?.getElementById("panel-plugins-zotero") as HTMLElement | null;
    const pluginFrame = panelEl?.querySelector("iframe") as HTMLIFrameElement | null;

    if (pluginFrame && pluginFrame.contentWindow) {
      try {
        const pluginDoc = pluginFrame.contentDocument || pluginFrame.contentWindow.document;
        // Search for refresh button in plugin DOM
        const refreshBtn = pluginDoc.querySelector(
          "button#refresh, .btn-refresh, [data-action='refresh'], button[title*='Refresh'], button[title*='Yenile']",
        ) as HTMLElement | null;

        if (refreshBtn && typeof refreshBtn.click === "function") {
          refreshBtn.click();
          pluginRefreshed = true;
        } else {
          // Send message to plugin iframe
          pluginFrame.contentWindow.postMessage(
            { type: "zotero:refreshStyle", styleId: cleanId, locale },
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
