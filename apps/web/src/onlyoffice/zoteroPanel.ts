/** Must match the official plugin installed by deploy/onlyoffice.Dockerfile. */
export const ZOTERO_PLUGIN_GUID = "asc.{BFC5D5C6-89DE-4168-9565-ABD8D1E48711}";

interface PluginController {
  api?: {
    asc_pluginRun: (guid: string, variation: number, data: string) => void;
    pluginsManager?: {
      getPluginByGuid: (guid: string) => unknown;
      isRunned: (guid: string) => boolean;
    };
  };
  openUIPlugin: (guid: string) => void;
}

/**
 * Community Edition has no Automation connector. Use the same controller as its
 * native Plugins tab through our same-origin /oo proxy. Keep this version-sensitive
 * SDK adapter isolated; cross-origin or incompatible editors fail visibly.
 * asc_pluginRun toggles existing plugins OFF, so focus an existing panel instead.
 */
export function openZoteroPanel(container: HTMLElement | null): boolean {
  try {
    const frame = container?.querySelector("iframe");
    const editorWindow = frame?.contentWindow as
      | (Window & {
          DE?: { getController: (name: string) => PluginController };
        })
      | null;
    const controller = editorWindow?.DE?.getController("Common.Controllers.Plugins");
    const api = controller?.api;
    const manager = api?.pluginsManager;
    if (!controller || !api || !manager?.getPluginByGuid(ZOTERO_PLUGIN_GUID)) return false;
    if (manager.isRunned(ZOTERO_PLUGIN_GUID)) {
      controller.openUIPlugin(ZOTERO_PLUGIN_GUID);
    } else {
      api.asc_pluginRun(ZOTERO_PLUGIN_GUID, 0, "");
    }
    frame?.focus();
    return true;
  } catch {
    return false;
  }
}
