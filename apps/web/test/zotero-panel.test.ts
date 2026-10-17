// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { openZoteroPanel, ZOTERO_PLUGIN_GUID } from "../src/onlyoffice/zoteroPanel.js";

afterEach(() => document.body.replaceChildren());

function setup(running: boolean) {
  const container = document.createElement("div");
  const frame = document.createElement("iframe");
  container.append(frame);
  Object.defineProperty(frame, "contentWindow", { value: {} });
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
  return { container, frame, controller };
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
  });
});
