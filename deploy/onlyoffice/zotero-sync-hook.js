/**
 * CiteDocs Zotero Plugin Sync Hook
 *
 * Ensures:
 * 1. Default style and locale in the official ONLYOFFICE Zotero plugin match
 *    the CiteDocs document defaults (APA 7th edition, tr-TR) rather than IEEE / en-US.
 * 2. Listens for style synchronization messages (postMessage) from the CiteDocs editor bridge.
 * 3. Exposes window.__citedocsSyncStyle for direct in-frame or cross-frame style updates.
 * 4. Interacts with the plugin's settings, locales, and citation service to re-render all
 *    citations and the bibliography in place whenever the user changes the style in the top bar.
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

  let isSyncing = false;
  let pendingSync = null;

  // 2. Core sync & refresh logic
  async function syncAndRefresh(styleId, locale, format) {
    if (!styleId) return false;
    if (isSyncing) {
      pendingSync = { styleId: styleId, locale: locale, format: format };
      return true;
    }
    isSyncing = true;

    try {
      const cleanId = String(styleId).split(/[#?]/)[0].replace(/\/+$/, "").split("/").pop() || "apa";
      const cleanLocale = locale || "tr-TR";
      const defaultFormat = cleanId === "apa" || cleanId.includes("author-date") ? "author-date" : (cleanId.includes("note") ? "note" : "numeric");
      const cleanFormat = format || defaultFormat;

      try {
        localStorage.setItem("zoteroStyleId", cleanId);
        localStorage.setItem("zoteroLang", cleanLocale);
        localStorage.setItem("zoteroFormatId", cleanFormat);
        localStorage.setItem("zoteroContainBibliography", "true");
      } catch (e) {
        /* ignore */
      }

      const win = window;

      // If plugin is still initializing, wait briefly for settings & citation service
      if (!win.__zoteroSettings || !win.__zoteroCitationService) {
        for (let i = 0; i < 20; i++) {
          await new Promise(function (resolve) { setTimeout(resolve, 100); });
          if (win.__zoteroSettings && win.__zoteroCitationService) break;
        }
      }

      // A. Use exposed settings & citationService if available
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
            // If not cached, fall back through local bundle, remote repo, and CiteDocs backend
            if (typeof styleMgr.cached === "function" && !styleMgr.cached(cleanId)) {
              let sXml = null;
              // Try 1: local bundled style path
              try {
                const sRes = await fetch("./resources/csl/styles/" + cleanId + ".csl");
                if (sRes.ok) sXml = await sRes.text();
              } catch (e) {}

              // Try 2: remote zotero.org styles repository
              if (!sXml || !sXml.includes("<style")) {
                try {
                  const sRes = await fetch("https://www.zotero.org/styles/" + cleanId);
                  if (sRes.ok) sXml = await sRes.text();
                } catch (e) {}
              }

              // Try 3: CiteDocs backend CSL endpoint
              if (!sXml || !sXml.includes("<style")) {
                try {
                  const sRes = await fetch("/api/csl/styles/" + cleanId);
                  if (sRes.ok) {
                    const sJson = await sRes.json().catch(function () { return null; });
                    if (sJson && typeof sJson.xml === "string") {
                      sXml = sJson.xml;
                    }
                  }
                } catch (e) {}
              }

              if (sXml && sXml.includes("<style")) {
                if (typeof styleMgr._saveLastUsedStyle === "function") {
                  styleMgr._saveLastUsedStyle(cleanId, sXml, cleanFormat);
                } else if (styleMgr._cache) {
                  styleMgr._cache[cleanId] = sXml;
                }
                if (Array.isArray(styleMgr._defaultStyles) && styleMgr._defaultStyles.indexOf(cleanId) === -1) {
                  styleMgr._defaultStyles.push(cleanId);
                }
              }
            }
          }

          // Ensure Asc.scope.bibStyle is never undefined
          try {
            win.Asc = win.Asc || {};
            win.Asc.scope = win.Asc.scope || {};
            win.Asc.scope.bibStyle = win.Asc.scope.bibStyle || {};
          } catch (_) {}

          const targetFormat = cleanFormat || (styleMgr && styleMgr.getLastUsedFormat ? styleMgr.getLastUsedFormat() : defaultFormat);
          const notesStyle = (styleMgr && styleMgr.getLastUsedNotesStyle && styleMgr.getLastUsedNotesStyle()) || "footnotes";

          const newState = {
            language: cleanLocale,
            style: cleanId,
            notesStyle: notesStyle,
            styleFormat: targetFormat,
            includeUrlForPaperArticles: styleMgr && typeof styleMgr.getIncludeUrlForPaperArticles === "function" ? styleMgr.getIncludeUrlForPaperArticles() : false,
            abbreviateJournalTitles: styleMgr && typeof styleMgr.getAbbreviateJournalTitles === "function" ? styleMgr.getAbbreviateJournalTitles() : false,
          };

          if (win.__zoteroSettings._stateSettings) {
            win.__zoteroSettings._stateSettings = newState;
          }

          const isNote = targetFormat === "note";
          if (isNote && typeof win.__zoteroCitationService.updateCslItemsInNotes === "function") {
            await win.__zoteroCitationService.updateCslItemsInNotes(notesStyle);
          } else if (typeof win.__zoteroCitationService.updateCslItems === "function") {
            await win.__zoteroCitationService.updateCslItems(true);
          }

          return true;
        } catch (err) {
          const topCons = (win.top && win.top.console) || (win.parent && win.parent.console) || win.console;
          try {
            topCons.error("[CiteDocs] Error applying style via Zotero plugin service:", err);
          } catch (_) {
            console.error(err);
          }
          throw err;
        }
      }

      // B. Fallback: Trigger refresh button in DOM ONLY if direct service was not available at all
      const refreshBtn = document.getElementById("refreshBtn") || document.querySelector("button#refreshBtn, .btn-refresh");
      if (refreshBtn && typeof refreshBtn.click === "function") {
        refreshBtn.click();
        return true;
      }
      return false;
    } finally {
      isSyncing = false;
      if (pendingSync) {
        const next = pendingSync;
        pendingSync = null;
        void syncAndRefresh(next.styleId, next.locale, next.format);
      }
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
      void syncAndRefresh(event.data.styleId, event.data.locale, event.data.format);
    }
  });
})();
