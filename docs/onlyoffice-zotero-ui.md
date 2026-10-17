# ONLYOFFICE editor shortcuts

The documents page uses neutral Open/Aç actions and routes to `/editor?doc=…`.
ONLYOFFICE is the default. `VITE_EDITOR_BACKEND=collabora` is required to enable
Collabora, including its legacy editor toggle; URL parameters cannot enable it.

The editor header's Zotero button becomes available after `onDocumentReady`.
It opens the installed official Zotero plugin, or reveals its existing panel
without restarting it or losing its search state. The plugin's existing native
button remains available in ONLYOFFICE's Plugins tab.

The Community Edition deployment uses the same-origin `/oo` proxy. The isolated
`apps/web/src/onlyoffice/zoteroPanel.ts` adapter inspects both the editor frame DOM
(`#panel-plugins-zotero`, `#slot-btn-pluginszotero`) and ONLYOFFICE's internal
`Common.Controllers.Plugins` controller (`openUIPlugin`, `viewPlugins.pluginPanels`, `api.asc_pluginRun`).
In modern ONLYOFFICE Docs CE (e.g. v10), `pluginsManager` is not exposed on `api`. The adapter
treats an existing or active panel in the editor DOM as already open (immediate success), focuses
the panel without restarting it, and uses `openUIPlugin` or the left sidebar slot button to reveal
collapsed or backgrounded panels. Because `asc_pluginRun` toggles an existing plugin OFF, it is
strictly reserved for launching an unstarted plugin and protected against rapid double-click toggles.
No credentials or document data are sent by this shortcut.

These are version-sensitive editor internals, compatible with Community Edition.
Keep the adapter under review when upgrading Document Server. Cross-origin
Document Server URLs, unavailable plugins, and incompatible editor versions show
a localized message directing users to the native Plugins tab.

Upstream implementation references:

- [Plugin controller and native tab behavior](https://github.com/ONLYOFFICE/web-apps/blob/master/apps/common/main/lib/controller/Plugins.js)
- [SDK plugin lifecycle](https://github.com/ONLYOFFICE/sdkjs/blob/master/common/plugins.js)
- [Installed Zotero plugin configuration](https://github.com/ONLYOFFICE/onlyoffice.github.io/blob/f3263c055c25875874004463b46c2e6a7000a9fd/sdkjs-plugins/content/zotero/config.json)

Unit/component tests cover routing, translations, readiness, opening/focusing,
repeated clicks and unavailable/cross-origin failures. For a Document Server
upgrade, also smoke-test opening a DOCX, closing Zotero, reopening from the
header, switching away to another panel, and repeatedly clicking Zotero. Check
that the plugin's current search/login state survives. These tests require a
running Document Server; the local unit suite mocks its controller.
