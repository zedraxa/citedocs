/**
 * CiteDocs Zotero Plugin Sync Hook
 *
 * Ensures:
 * 1. Default style and locale in the official ONLYOFFICE Zotero plugin match
 *    the CiteDocs document defaults (APA 7th edition, tr-TR) rather than IEEE / en-US.
 * 2. Listens for style synchronization messages (postMessage) from the CiteDocs editor bridge.
 * 3. Exposes window.__citedocsSyncStyle for direct in-frame or cross-frame style updates.
 * 4. Interacts with the plugin's settings, locales, and citation service to re-render all
 *    citations and the bibliography whenever the user changes the style in the top bar.
 */
(function () {
  // 1. Establish default APA 7 / tr-TR settings if not previously set
  try {
    if (!localStorage.getItem("zoteroStyleId")) {
      localStorage.setItem("zoteroStyleId", "apa");
      localStorage.setItem("zoteroFormatId", "author-date");
      localStorage.setItem("zoteroContainBibliography", "true");
      localStorage.setItem("zoteroNotesStyleId", "footnotes");
    }
    if (!localStorage.getItem("zoteroLang")) {
      localStorage.setItem("zoteroLang", "tr-TR");
    }
  } catch (e) {
    /* localStorage blocked */
  }

  // 2. Core sync & refresh logic
  async function syncAndRefresh(styleId, locale, format) {
    if (!styleId) return;
    const cleanId = String(styleId).split(/[#?]/)[0].replace(/\/+$/, "").split("/").pop() || "apa";
    const cleanLocale = locale || "tr-TR";

    try {
      localStorage.setItem("zoteroStyleId", cleanId);
      localStorage.setItem("zoteroLang", cleanLocale);
      if (format) {
        localStorage.setItem("zoteroFormatId", format);
      }
      localStorage.setItem("zoteroContainBibliography", "true");
    } catch (e) {
      /* ignore */
    }

    // A. Use exposed settings & citationService if available
    const win = window;
    if (win.__zoteroSettings && win.__zoteroCitationService) {
      try {
        const styleMgr = win.__zoteroSettings.getStyleManager ? win.__zoteroSettings.getStyleManager() : null;
        const locMgr = win.__zoteroSettings.getLocalesManager ? win.__zoteroSettings.getLocalesManager() : null;

        if (locMgr && typeof locMgr.loadLocale === "function") {
          await locMgr.loadLocale(cleanLocale).catch(function () {});
          // If not cached (e.g. offline or network blocked), fall back to local bundled locale
          if (typeof locMgr.getLocale === "function" && !locMgr.getLocale(cleanLocale)) {
            try {
              const lRes = await fetch("./resources/csl/locales/locales-" + cleanLocale + ".xml");
              if (lRes.ok) {
                const lXml = await lRes.text();
                if (lXml && lXml.includes("<locale") && locMgr._cache) {
                  locMgr._cache[cleanLocale] = lXml;
                }
              }
            } catch (e) {
              /* ignore fallback error */
            }
          }
          if (typeof locMgr.saveLastUsedLanguage === "function") {
            locMgr.saveLastUsedLanguage(cleanLocale);
          }
        }

        if (styleMgr && typeof styleMgr.getStyle === "function") {
          await styleMgr.getStyle(cleanId, true).catch(function () {});
          // If not cached, fall back to local bundled style
          if (typeof styleMgr.cached === "function" && !styleMgr.cached(cleanId)) {
            try {
              const sRes = await fetch("./resources/csl/styles/" + cleanId + ".csl");
              if (sRes.ok) {
                const sXml = await sRes.text();
                if (sXml && sXml.includes("<style")) {
                  if (typeof styleMgr._saveLastUsedStyle === "function") {
                    styleMgr._saveLastUsedStyle(cleanId, sXml, format || "author-date");
                  } else if (styleMgr._cache) {
                    styleMgr._cache[cleanId] = sXml;
                  }
                }
              }
            } catch (e) {
              /* ignore fallback error */
            }
          }
        }

        const isNote = format === "note" || (styleMgr && styleMgr.getLastUsedFormat && styleMgr.getLastUsedFormat() === "note");
        if (isNote && typeof win.__zoteroCitationService.updateCslItemsInNotes === "function") {
          const notesStyle = (styleMgr && styleMgr.getLastUsedNotesStyle && styleMgr.getLastUsedNotesStyle()) || "footnotes";
          await win.__zoteroCitationService.updateCslItemsInNotes(notesStyle);
        } else if (typeof win.__zoteroCitationService.updateCslItems === "function") {
          await win.__zoteroCitationService.updateCslItems(true);
        }
        return;
      } catch (err) {
        console.error("[CiteDocs] Error applying style via Zotero plugin service:", err);
      }
    }

    // B. Fallback: Trigger refresh button in DOM
    const refreshBtn = document.getElementById("refreshBtn") || document.querySelector("button#refreshBtn, .btn-refresh");
    if (refreshBtn && typeof refreshBtn.click === "function") {
      refreshBtn.click();
    }
  }

  // Expose on window for direct invocation
  window.__citedocsSyncStyle = syncAndRefresh;

  // 3. Listen for postMessage from parent editor page
  window.addEventListener("message", function (event) {
    if (!event.data || typeof event.data !== "object") return;
    const type = event.data.type;
    if (
      type === "zotero:refreshStyle" ||
      type === "zotero:setStyle" ||
      type === "citedocs:styleChange"
    ) {
      syncAndRefresh(event.data.styleId, event.data.locale, event.data.format);
    }
  });
})();
