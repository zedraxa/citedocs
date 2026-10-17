// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { openZoteroPanel, ZOTERO_PLUGIN_GUID } from "../src/onlyoffice/zoteroPanel.js";

afterEach(() => document.body.replaceChildren());

function setup(running: boolean) {
  const container = document.createElement("div");
  const frame = document.createElement("iframe");
  container.append(frame);
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(frame, "contentWindow", { value: { document: doc } });
  Object.defineProperty(frame, "contentDocument", { value: doc });
  const controller = {
    api: {
      asc_pluginRun: vi.fn(),
      pluginsManager: {
        getPluginByGuid: vi.fn().mockReturnValue({}),
        isRunned: vi.fn().mockReturnValue(running),
      },
    },
    openUIPlugin: vi.fn(),
  };
  Object.assign(frame.contentWindow!, { DE: { getController: () => controller } });
  return { container, frame, controller, doc };
}

describe("Zotero panel adapter", () => {
  it("starts the installed plugin when closed", () => {
    const { container, controller } = setup(false);
    expect(openZoteroPanel(container)).toBe(true);
    expect(controller.api.asc_pluginRun).toHaveBeenCalledWith(ZOTERO_PLUGIN_GUID, 0, "");
    expect(controller.openUIPlugin).not.toHaveBeenCalled();
  });

  it("reopens or focuses an existing panel without toggling it off on repeated clicks", () => {
    const { container, controller } = setup(true);
    expect(openZoteroPanel(container)).toBe(true);
    expect(openZoteroPanel(container)).toBe(true);
    expect(controller.openUIPlugin).toHaveBeenCalledWith(ZOTERO_PLUGIN_GUID);
    expect(controller.openUIPlugin).toHaveBeenCalledTimes(2);
    expect(controller.api.asc_pluginRun).not.toHaveBeenCalled();
  });

  it("treats #panel-plugins-zotero already open in DOM as immediate success without calling asc_pluginRun", () => {
    const { container, controller, doc, frame } = setup(false);
    // In ONLYOFFICE Docs CE v10, pluginsManager is undefined
    delete (controller.api as Record<string, unknown>).pluginsManager;

    const panel = doc.createElement("div");
    panel.id = "panel-plugins-zotero";
    panel.className = "plugin-panel content-box active";
    const pluginFrame = { focus: vi.fn() };
    panel.querySelector = vi.fn().mockImplementation((selector: string) => {
      if (selector === "iframe") return pluginFrame;
      return null;
    });
    doc.body.appendChild(panel);

    frame.focus = vi.fn();

    expect(openZoteroPanel(container)).toBe(true);
    expect(controller.openUIPlugin).toHaveBeenCalledWith(ZOTERO_PLUGIN_GUID);
    expect(controller.api.asc_pluginRun).not.toHaveBeenCalled();
    expect(pluginFrame.focus).toHaveBeenCalled();
  });

  it("activates a backgrounded or collapsed panel via slot button click and openUIPlugin", () => {
    const { container, controller, doc } = setup(false);
    delete (controller.api as Record<string, unknown>).pluginsManager;

    // Panel exists but is not active
    const panel = doc.createElement("div");
    panel.id = "panel-plugins-zotero";
    panel.className = "plugin-panel content-box";
    doc.body.appendChild(panel);

    // Slot button exists in left toolbar
    const slot = doc.createElement("div");
    slot.id = "slot-btn-pluginszotero";
    const slotButton = doc.createElement("button");
    slotButton.onclick = vi.fn();
    slot.appendChild(slotButton);
    doc.body.appendChild(slot);

    expect(openZoteroPanel(container)).toBe(true);
    expect(controller.openUIPlugin).toHaveBeenCalledWith(ZOTERO_PLUGIN_GUID);
    expect(slotButton.onclick).toHaveBeenCalled();
    expect(controller.api.asc_pluginRun).not.toHaveBeenCalled();
  });

  it("prevents toggling off during rapid in-flight launch clicks", () => {
    const { container, controller } = setup(false);
    delete (controller.api as Record<string, unknown>).pluginsManager;

    // Click 1: launches plugin via asc_pluginRun
    expect(openZoteroPanel(container)).toBe(true);
    expect(controller.api.asc_pluginRun).toHaveBeenCalledTimes(1);

    // Click 2 (rapid/double click before DOM mounts): does NOT call asc_pluginRun again
    expect(openZoteroPanel(container)).toBe(true);
    expect(controller.api.asc_pluginRun).toHaveBeenCalledTimes(1);
  });

  it("supports Asc.editor fallback when controller.api.asc_pluginRun is absent", () => {
    const container = document.createElement("div");
    const frame = document.createElement("iframe");
    container.append(frame);
    const ascPluginRun = vi.fn();
    Object.defineProperty(frame, "contentWindow", {
      value: {
        Asc: { editor: { asc_pluginRun: ascPluginRun } },
        document: document.implementation.createHTMLDocument(),
      },
    });
    expect(openZoteroPanel(container)).toBe(true);
    expect(ascPluginRun).toHaveBeenCalledWith(ZOTERO_PLUGIN_GUID, 0, "");
  });

  it("supports editorInstance serviceCommand fallback", () => {
    const container = document.createElement("div");
    const frame = document.createElement("iframe");
    container.append(frame);
    Object.defineProperty(frame, "contentWindow", {
      value: {
        document: document.implementation.createHTMLDocument(),
      },
    });
    const serviceCommand = vi.fn();
    expect(openZoteroPanel(container, { serviceCommand })).toBe(true);
    expect(serviceCommand).toHaveBeenCalledWith("asc_pluginRun", {
      guid: ZOTERO_PLUGIN_GUID,
      variation: 0,
      data: "",
    });
  });

  it("fails visibly when the plugin is missing or the editor is cross-origin", () => {
    const { container, frame, controller } = setup(false);
    controller.api.pluginsManager.getPluginByGuid.mockReturnValue(null);
    expect(openZoteroPanel(container)).toBe(false);
    expect(controller.api.asc_pluginRun).not.toHaveBeenCalled();

    Object.defineProperty(frame.contentWindow, "DE", {
      get: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
    expect(openZoteroPanel(container)).toBe(false);
    expect(openZoteroPanel(null)).toBe(false);

    const emptyContainer = document.createElement("div");
    expect(openZoteroPanel(emptyContainer)).toBe(false);
  });
});
