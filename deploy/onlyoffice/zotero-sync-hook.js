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

  const _expose = function (k, v) {
    try { window[k] = v; } catch (_) {}
    try { if (window.parent) window.parent[k] = v; } catch (_) {}
    try { if (window.top) window.top[k] = v; } catch (_) {}
  };

  function findZoteroObjects() {
    const list = [window];
    try { if (window.parent && !list.includes(window.parent)) list.push(window.parent); } catch (_) {}
    try { if (window.top && !list.includes(window.top)) list.push(window.top); } catch (_) {}
    for (const w of list) {
      try {
        if (w && w.__zoteroSettings && w.__zoteroCitationService) {
          return { settings: w.__zoteroSettings, service: w.__zoteroCitationService, win: w };
        }
      } catch (_) {}
    }
    return null;
  }

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

      // If plugin is still initializing, wait briefly for settings & citation service across accessible windows
      let zObjs = findZoteroObjects();
      if (!zObjs) {
        for (let i = 0; i < 25; i++) {
          await new Promise(function (resolve) { setTimeout(resolve, 100); });
          zObjs = findZoteroObjects();
          if (zObjs) break;
        }
      }

      // A. Use exposed settings & citationService if available
      if (zObjs) {
        try {
          const { settings, service, win: targetWin } = zObjs;
          const styleMgr = settings.getStyleManager ? settings.getStyleManager() : null;
          const locMgr = settings.getLocalesManager ? settings.getLocalesManager() : null;

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
                  const sRes = await fetch("/api/csl/styles/" + cleanId, {
                    headers: { Accept: "application/vnd.citationstyles.style+xml, application/xml, text/xml;q=0.9, text/plain;q=0.8, application/json;q=0.5" },
                  });
                  if (sRes.ok) {
                    const ctype = sRes.headers.get("content-type") || "";
                    if (ctype.includes("json")) {
                      const sJson = await sRes.json().catch(function () { return null; });
                      if (sJson && typeof sJson.xml === "string") {
                        sXml = sJson.xml;
                      }
                    } else {
                      const txt = await sRes.text().catch(function () { return null; });
                      if (txt && txt.trim().startsWith("{")) {
                        try {
                          const parsed = JSON.parse(txt);
                          if (parsed && parsed.xml) sXml = parsed.xml;
                        } catch (_) {}
                      } else if (txt) {
                        sXml = txt;
                      }
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
            const ascObj = targetWin.Asc || window.Asc || {};
            ascObj.scope = ascObj.scope || {};
            ascObj.scope.bibStyle = ascObj.scope.bibStyle || {};
            targetWin.Asc = ascObj;
            window.Asc = ascObj;
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

          if (settings._stateSettings) {
            settings._stateSettings = newState;
          }

          const isNote = targetFormat === "note";
          if (isNote && typeof service.updateCslItemsInNotes === "function") {
            await service.updateCslItemsInNotes(notesStyle);
          } else if (typeof service.updateCslItems === "function") {
            await service.updateCslItems(true);
          }

          return true;
        } catch (err) {
          const topCons = (window.top && window.top.console) || (window.parent && window.parent.console) || window.console;
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
        try {
          window.Asc = window.Asc || {};
          window.Asc.scope = window.Asc.scope || {};
          window.Asc.scope.bibStyle = window.Asc.scope.bibStyle || {};
        } catch (_) {}
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

  // Expose on window, parent, and top for direct invocation across frames
  _expose("__citedocsSyncStyle", syncAndRefresh);

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
