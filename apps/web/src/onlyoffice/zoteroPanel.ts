/** Must match the official plugin installed by deploy/onlyoffice.Dockerfile. */
export const ZOTERO_PLUGIN_GUID = "asc.{BFC5D5C6-89DE-4168-9565-ABD8D1E48711}";

export interface PluginController {
  api?: {
    asc_pluginRun?: (guid: string, variation: number, data: string) => void;
    pluginsManager?: {
      getPluginByGuid?: (guid: string) => unknown;
      isRunned?: (guid: string) => boolean;
    };
  };
  openUIPlugin?: (guid: string) => void;
  viewPlugins?: {
    pluginPanels?: Record<string, unknown>;
  };
}

const launchMap = new WeakMap<HTMLElement, number>();

/**
 * Community Edition has no Automation connector. Use the same controller and DOM
 * elements as its native Plugins tab through our same-origin /oo proxy.
 *
 * ONLYOFFICE Docs CE behavior:
 * - When autostarted or running, the left sidebar mounts #panel-plugins-zotero and #slot-btn-pluginszotero.
 * - asc_pluginRun toggles an already-running plugin OFF, so it must NEVER be called when
 *   the panel is already open/running or in the middle of launching.
 * - If the panel is already open or in the background, we focus/reveal it via openUIPlugin
 *   and/or the left-menu slot button, treating "already open" as an immediate success.
 * - If the plugin is not yet running, we launch it via asc_pluginRun or openUIPlugin.
 */
export function openZoteroPanel(
  container: HTMLElement | null,
  editorInstance?: unknown,
): boolean {
  try {
    if (!container) return false;
    const frame = container.querySelector("iframe");
    if (!frame) return false;

    // Cross-origin check: accessing frame.contentWindow / contentDocument throws SecurityError.
    const editorWindow = frame.contentWindow as
      | (Window & {
          DE?: { getController?: (name: string) => PluginController };
          Asc?: {
            editor?: {
              asc_pluginRun?: (guid: string, variation: number, data: string) => void;
            };
          };
        })
      | null;
    if (!editorWindow) return false;

    // Accessing cross-origin window/document throws DOMException (SecurityError).
    const de = editorWindow.DE;
    const editorDoc = frame.contentDocument || editorWindow.document;

    // Check DOM for existing plugin panel or left toolbar slot button
    const panelEl = editorDoc?.getElementById("panel-plugins-zotero") as HTMLElement | null;
    const slotBtnEl = editorDoc?.getElementById("slot-btn-pluginszotero") as HTMLElement | null;

    const controller = de?.getController ? de.getController("Common.Controllers.Plugins") : null;
    const api = controller?.api;

    if (
      api?.pluginsManager?.getPluginByGuid &&
      !api.pluginsManager.getPluginByGuid(ZOTERO_PLUGIN_GUID) &&
      !panelEl &&
      !slotBtnEl
    ) {
      return false;
    }

    const hasPanelInCtrl = Boolean(
      controller?.viewPlugins?.pluginPanels?.[ZOTERO_PLUGIN_GUID]
    );
    const isRunnedManager = Boolean(
      api?.pluginsManager?.isRunned?.(ZOTERO_PLUGIN_GUID)
    );

    const isRunning = Boolean(
      panelEl ||
      slotBtnEl ||
      hasPanelInCtrl ||
      isRunnedManager
    );

    const now = Date.now();
    const lastLaunchTime = launchMap.get(frame) || 0;
    const recentlyLaunched = now - lastLaunchTime < 3000;

    if (isRunning || recentlyLaunched) {
      // Reveal or focus existing/starting panel without toggling it off
      try {
        controller?.openUIPlugin?.(ZOTERO_PLUGIN_GUID);
      } catch {
        /* ignore */
      }

      // If panel is collapsed or another left tab is active, activate via slot button
      if (slotBtnEl && (!panelEl || !panelEl.classList.contains("active") || panelEl.offsetWidth === 0)) {
        try {
          const btn = (slotBtnEl.querySelector("button") || slotBtnEl) as HTMLElement;
          btn?.click?.();
        } catch {
          /* ignore */
        }
      }

      // Focus the plugin panel's iframe or the editor frame
      try {
        const pluginFrame = panelEl?.querySelector("iframe") as HTMLElement | null;
        if (pluginFrame && typeof pluginFrame.focus === "function") {
          pluginFrame.focus();
        } else if (typeof frame.focus === "function") {
          frame.focus();
        }
      } catch {
        /* ignore */
      }

      return true;
    }

    // Plugin not running and not in-flight: launch it
    launchMap.set(frame, now);

    if (typeof api?.asc_pluginRun === "function") {
      api.asc_pluginRun(ZOTERO_PLUGIN_GUID, 0, "");
      frame.focus?.();
      return true;
    }

    if (typeof editorWindow.Asc?.editor?.asc_pluginRun === "function") {
      editorWindow.Asc.editor.asc_pluginRun(ZOTERO_PLUGIN_GUID, 0, "");
      frame.focus?.();
      return true;
    }

    if (typeof controller?.openUIPlugin === "function") {
      controller.openUIPlugin(ZOTERO_PLUGIN_GUID);
      frame.focus?.();
      return true;
    }

    // Optional serviceCommand fallback if provided by editorInstance
    const editorObj = editorInstance as {
      serviceCommand?: (cmd: string, data: unknown) => void;
    } | null;
    if (typeof editorObj?.serviceCommand === "function") {
      try {
        editorObj.serviceCommand("asc_pluginRun", {
          guid: ZOTERO_PLUGIN_GUID,
          variation: 0,
          data: "",
        });
        frame.focus?.();
        return true;
      } catch {
        /* ignore */
      }
    }

    return false;
  } catch {
    return false;
  }
}

