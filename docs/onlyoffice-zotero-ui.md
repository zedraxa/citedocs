# ONLYOFFICE editor shortcuts

The documents page uses neutral Open/Aç actions and routes to `/editor?doc=…`.
ONLYOFFICE is the default. `VITE_EDITOR_BACKEND=collabora` is required to enable
Collabora, including its legacy editor toggle; URL parameters cannot enable it.

The editor header's Zotero button becomes available after `onDocumentReady`.
It opens the installed official Zotero plugin, or reveals its existing panel
without restarting it or losing its search state. The plugin's existing native
button remains available in ONLYOFFICE's Plugins tab.

The Community Edition deployment uses the same-origin `/oo` proxy. The isolated
`apps/web/src/onlyoffice/zoteroPanel.ts` adapter accesses ONLYOFFICE's native
`Common.Controllers.Plugins` controller in the editor frame. It checks plugin
registration and running state before calling `asc_pluginRun` or `openUIPlugin`.
The former toggles an already running plugin off, so it must not be called for
an existing panel. No credentials or document data are sent by this shortcut.

These are version-sensitive editor internals, not the paid Automation connector.
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
