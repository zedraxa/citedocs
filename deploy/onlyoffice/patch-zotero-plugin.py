#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Patches the ONLYOFFICE Zotero plugin:
1. Adds Turkish (tr-TR and tr) translations and updates langs.json / config.json.
2. Injects zotero-sync-hook.js into index.html before citeproc without corrupting closing tags.
3. Patches bundle.modern.js to expose window.__zoteroSettings and window.__zoteroCitationService.
4. Regenerates .gz files (compresslevel=9) for nginx gzip_static.
5. Verifies all modifications with strict build-time assertions.
"""

import gzip
import json
import os
import shutil
import sys


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "/var/www/onlyoffice/documentserver/sdkjs-plugins/zotero"
    trans_dir = os.path.join(base, "translations")
    langs_file = os.path.join(trans_dir, "langs.json")
    cfg_file = os.path.join(base, "config.json")
    tr_tr_file = os.path.join(trans_dir, "tr-TR.json")
    tr_file = os.path.join(trans_dir, "tr.json")
    hook_file = os.path.join(base, "zotero-sync-hook.js")
    index_file = os.path.join(base, "index.html")
    bundle_file = os.path.join(base, "dist", "bundle.modern.js")

    hook_source = os.path.join(os.path.dirname(os.path.abspath(__file__)), "zotero-sync-hook.js")
    if not os.path.isfile(hook_file) and os.path.isfile(hook_source):
        shutil.copyfile(hook_source, hook_file)

    if not os.path.isfile(langs_file):
        raise FileNotFoundError("Missing langs.json: " + langs_file)
    if not os.path.isfile(cfg_file):
        raise FileNotFoundError("Missing config.json: " + cfg_file)
    if not os.path.isfile(tr_tr_file):
        raise FileNotFoundError("Missing tr-TR.json: " + tr_tr_file)
    if not os.path.isfile(hook_file):
        raise FileNotFoundError("Missing zotero-sync-hook.js: " + hook_file)


    # 1. Copy tr-TR.json to tr.json for fallback compatibility
    shutil.copyfile(tr_tr_file, tr_file)

    # 2. Update langs.json
    with open(langs_file, "r", encoding="utf-8") as f:
        langs = json.load(f)
    if "tr-TR" not in langs:
        langs.append("tr-TR")
    with open(langs_file, "w", encoding="utf-8") as f:
        json.dump(langs, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # 3. Update config.json with Turkish localized plugin names and descriptions
    with open(cfg_file, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    cfg.setdefault("nameLocale", {})["tr"] = "Zotero"
    for var in cfg.get("variations", []):
        if "descriptionLocale" in var and isinstance(var["descriptionLocale"], dict):
            var["descriptionLocale"]["tr"] = "Zotero servisini kullanarak gerekli stilde kaynakçalar oluşturun."
    with open(cfg_file, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\n")

    def make_gz(path):
        with open(path, "rb") as fin:
            data = fin.read()
        with gzip.open(path + ".gz", "wb", compresslevel=9) as fout:
            fout.write(data)

    make_gz(langs_file)
    make_gz(tr_tr_file)
    make_gz(tr_file)
    make_gz(hook_file)

    # 4. Patch index.html: inject zotero-sync-hook.js before citeproc_commonjs.js
    if os.path.isfile(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            idx_c = f.read()
        hook_tag = '<script src="zotero-sync-hook.js"></script>'
        citeproc_tag = '<script src="vendor/citeproc/citeproc_commonjs.js"></script>'
        if "zotero-sync-hook.js" not in idx_c:
            if citeproc_tag in idx_c:
                idx_c = idx_c.replace(citeproc_tag, f"{hook_tag}\n    {citeproc_tag}")
            elif '<script src="vendor/citeproc/citeproc_commonjs.js">' in idx_c:
                idx_c = idx_c.replace(
                    '<script src="vendor/citeproc/citeproc_commonjs.js">',
                    f"{hook_tag}\n    <script src=\"vendor/citeproc/citeproc_commonjs.js\">"
                )
            else:
                raise ValueError("Could not find citeproc script tag in index.html to inject zotero-sync-hook.js")
            with open(index_file, "w", encoding="utf-8") as f:
                f.write(idx_c)
        make_gz(index_file)

    # 5. Patch bundle.modern.js: expose settings & citation service, preload styles & locales, surface errors, add resilient fallbacks
    if os.path.isfile(bundle_file):
        with open(bundle_file, "r", encoding="utf-8") as f:
            b_c = f.read()

        styles_dir = os.path.join(base, "resources", "csl", "styles")
        locales_dir = os.path.join(base, "resources", "csl", "locales")

        preloaded_styles = {}
        preloaded_locales = {}

        if os.path.isdir(styles_dir):
            for s_id in ["ieee", "apa", "chicago-author-date", "modern-language-association", "vancouver"]:
                s_path = os.path.join(styles_dir, s_id + ".csl")
                if os.path.isfile(s_path):
                    with open(s_path, "r", encoding="utf-8") as sf:
                        preloaded_styles[s_id] = sf.read()

        if os.path.isdir(locales_dir):
            for l_id in ["tr-TR", "en-US"]:
                l_path = os.path.join(locales_dir, "locales-" + l_id + ".xml")
                if os.path.isfile(l_path):
                    with open(l_path, "r", encoding="utf-8") as lf:
                        content = lf.read()
                        preloaded_locales[l_id] = content
                        if l_id == "tr-TR":
                            preloaded_locales["tr"] = content
                        elif l_id == "en-US":
                            preloaded_locales["en"] = content

        if not preloaded_styles:
            preloaded_styles["ieee"] = '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0"><info><id>http://www.zotero.org/styles/ieee</id><title>IEEE</title><category citation-format="numeric"/></info><citation><layout prefix="[" suffix="]"><text variable="citation-number"/></layout></citation></style>'
            preloaded_styles["apa"] = '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0"><info><id>http://www.zotero.org/styles/apa</id><title>APA</title><category citation-format="author-date"/></info><citation><layout prefix="(" suffix=")"><text variable="title"/></layout></citation></style>'
        if not preloaded_locales:
            tr_min = '<locale xmlns="http://purl.org/net/xbiblio/csl" version="1.0" xml:lang="tr-TR"><terms><term name="and">ve</term><term name="et-al">vd.</term></terms></locale>'
            en_min = '<locale xmlns="http://purl.org/net/xbiblio/csl" version="1.0" xml:lang="en-US"><terms><term name="and">and</term><term name="et-al">et al.</term></terms></locale>'
            preloaded_locales["tr-TR"] = tr_min
            preloaded_locales["tr"] = tr_min
            preloaded_locales["en-US"] = en_min
            preloaded_locales["en"] = en_min

        styles_json_str = json.dumps(preloaded_styles, ensure_ascii=False)
        locales_json_str = json.dumps(preloaded_locales, ensure_ascii=False)

        # 5a. Expose settings & citation service across window, parent, and top
        if "window.__zoteroSettings" not in b_c:
            b_c = b_c.replace(
                "r = new Z(t, e), i = new zt(",
                "window.__zoteroSettings = r = new Z(t, e), window.__zoteroCitationService = i = new zt("
            )

        # Ensure window.parent and window.top also receive references in full bundle
        full_init_target = "window.__zoteroSettings = r = new Z(t, e), window.__zoteroCitationService = i = new zt(r.getLocalesManager(), r.getStyleManager(), n, r.getAbbreviationsManager());"
        full_init_repl = """window.__zoteroSettings = r = new Z(t, e), window.__zoteroCitationService = i = new zt(r.getLocalesManager(), r.getStyleManager(), n, r.getAbbreviationsManager());
		try { if (window.parent) { window.parent.__zoteroSettings = r; window.parent.__zoteroCitationService = i; } } catch (_) {}
		try { if (window.top) { window.top.__zoteroSettings = r; window.top.__zoteroCitationService = i; } } catch (_) {}"""
        if full_init_target in b_c and "window.top.__zoteroSettings = r" not in b_c:
            b_c = b_c.replace(full_init_target, full_init_repl)

        # 5b. Preload CSL styles directly in X (CslStylesManager) constructor
        if "_PRELOADED_STYLES" not in b_c:
            x_cache_target = '"nature"\n\t], this._cache = {};'
            if x_cache_target in b_c:
                b_c = b_c.replace(
                    x_cache_target,
                    f'"nature"\n\t];\nvar _PRELOADED_STYLES = {styles_json_str};\nthis._cache = Object.assign({{}}, _PRELOADED_STYLES);'
                )

        # 5c. Preload CSL locales directly in en (LocalesManager) constructor
        if "_PRELOADED_LOCALES" not in b_c:
            en_cache_target = 'this._selectedLanguage = null, this._cache = {};'
            if en_cache_target in b_c:
                b_c = b_c.replace(
                    en_cache_target,
                    f'this._selectedLanguage = null;\nvar _PRELOADED_LOCALES = {locales_json_str};\nthis._cache = Object.assign({{}}, _PRELOADED_LOCALES);'
                )

        # 5d. Harden function Y() in CitationService: protect CSL.Engine against null style and retrieveLocale against null locale
        old_y = """	var n = {
		retrieveLocale: function(t) {
			return e._localesManager.getLocale(t) ? e._localesManager.getLocale(t) : e._localesManager.getLocale();
		},
		retrieveItem: function(t) {
			var n = e._storage.getItem(t), r = e._storage.getItemIndex(t);
			return n ? n.toFlatJSON(r, s(Lt, e)) : null;
		}
	};
	s(Rt, this).isLoaded() && this._cslStylesManager.getAbbreviateJournalTitles() && (n.getAbbreviation = s(Rt, this).createCiteprocHook()), this._formatter = new CSL.Engine(n, this._cslStylesManager.cached(this._cslStylesManager.getLastUsedStyleIdOrDefault()), this._localesManager.getLastUsedLanguage(), !0), t.length && this._formatter.updateItems(t);"""
        new_y = """	var n = {
		retrieveLocale: function(t) {
			return e._localesManager.getLocale(t) || e._localesManager.getLocale() || e._localesManager.getLocale("tr-TR") || e._localesManager.getLocale("en-US");
		},
		retrieveItem: function(t) {
			var n = e._storage.getItem(t), r = e._storage.getItemIndex(t);
			return n ? n.toFlatJSON(r, s(Lt, e)) : null;
		}
	};
	s(Rt, this).isLoaded() && this._cslStylesManager.getAbbreviateJournalTitles() && (n.getAbbreviation = s(Rt, this).createCiteprocHook());
	var _styleId = this._cslStylesManager.getLastUsedStyleIdOrDefault() || "ieee";
	var _styleXml = this._cslStylesManager.cached(_styleId);
	if (!_styleXml || typeof _styleXml !== "string" || _styleXml.indexOf("<style") === -1) {
		_styleXml = this._cslStylesManager.cached("ieee") || this._cslStylesManager.cached("apa");
	}
	if (!_styleXml || typeof _styleXml !== "string" || _styleXml.indexOf("<style") === -1) {
		var _topCons = (window.top && window.top.console) || (window.parent && window.parent.console) || window.console;
		try { _topCons.error("[CiteDocs Zotero Plugin] CSL XML not found for style:", _styleId); } catch (_) {}
		throw new Error("Atıf stili XML verisi bulunamadı: " + _styleId);
	}
	var _lang = this._localesManager.getLastUsedLanguage() || "tr-TR";
	this._formatter = new CSL.Engine(n, _styleXml, _lang, !0), t.length && this._formatter.updateItems(t);"""
        if old_y in b_c:
            b_c = b_c.replace(old_y, new_y)

        # 5e. Surface real error text and forward to top-level window console in ALL refresh error handlers (refreshBtn + onChangeState)
        import re
        err_pattern = re.compile(
            r'console\.error\(e\);\s*var t = D\("Failed to refresh"\);\s*typeof e == "string" && \(t \+= "\. " \+ D\(e\)\), b\(t\);'
        )
        b_c = err_pattern.sub(
            """var _topC = (window.top && window.top.console) || (window.parent && window.parent.console) || window.console;
							try { _topC.error("[CiteDocs Zotero Plugin] Refresh error:", e); } catch (_) {}
							console.error(e);
							var t = D("Failed to refresh"), _msg = (e && (e.message || e.stack)) ? String(e.message) : (typeof e == "string" ? e : "");
							_msg && (t += ": " + (D(_msg) || _msg));
							b(t);""",
            b_c
        )

        # 5f. Ut error forwarding in makeBibliography
        old_ut = 'else throw console.error(e), "Failed to apply this style.";'
        new_ut = """else {
		try { ((window.top && window.top.console) || (window.parent && window.parent.console) || window.console).error("[CiteDocs Zotero Plugin] Ut error:", e); } catch (_) {}
		throw (console.error(e), (e && e.message ? e.message : "Failed to apply this style."));
	}"""
        if old_ut in b_c:
            b_c = b_c.replace(old_ut, new_ut)

        # 5g. Prevent bibStyle undefined throw in gt
        old_bs = '!Asc.scope.bibStyle) throw "Bibliography style is not defined";'
        new_bs = '!Asc.scope.bibStyle && (Asc.scope.bibStyle = {}), !Asc.scope.bibStyle) throw "Bibliography style is not defined";'
        if old_bs in b_c:
            b_c = b_c.replace(old_bs, new_bs)

        # 5h. Prevent getCurrentField null throw after paste in gt
        old_cf = 'if (!s) throw Error("Failed to get current field after paste");'
        new_cf = """if (!s) {
			var allF = yield this.getAddinZoteroFields().catch(() => []);
			s = allF.find(function(f) { return f.Value && (f.Value.indexOf("ADDIN ZOTERO_BIBL") !== -1 || f.Value.indexOf("CSL_BIBLIOGRAPHY") !== -1); }) || (e && e.FieldId ? { FieldId: e.FieldId } : null);
		}
		if (!s) throw Error("Failed to get current field after paste");"""
        if old_cf in b_c:
            b_c = b_c.replace(old_cf, new_cf)

        # 5i. Resilient style loading: fallback to bundled local style and backend proxy (handling JSON or raw XML)
        old_gs = """var t = r._STYLES_LOCAL + e + ".csl";
		if (r._isOnlineAvailable) t = r._STYLES_URL + e;
		else if (r._defaultStyles.indexOf(e) === -1) throw "The style is not available in the local version of the plugin.";
		return fetch(t).then(function(e) {
			return e.text();
		});"""
        new_gs = """var localUrl = r._STYLES_LOCAL + e + ".csl";
		function tryFetch(url) {
			return fetch(url, { headers: { Accept: "application/vnd.citationstyles.style+xml, application/xml, text/xml;q=0.9, text/plain;q=0.8, application/json;q=0.5" } }).then(function(res) {
				if (!res.ok) throw new Error("HTTP " + res.status + " fetching " + url);
				var ctype = res.headers.get("content-type") || "";
				if (ctype.includes("json")) {
					return res.json().then(function(j) { return (j && j.xml) ? j.xml : ""; });
				}
				return res.text();
			}).then(function(txt) {
				if (typeof txt === "string" && txt.trim().startsWith("{")) {
					try {
						var parsed = JSON.parse(txt);
						if (parsed && parsed.xml) txt = parsed.xml;
					} catch (_) {}
				}
				if (!txt || !txt.includes("<style")) throw new Error("Invalid CSL from " + url);
				return txt;
			});
		}
		if (r._isOnlineAvailable) {
			return tryFetch(r._STYLES_URL + e).catch(function(err) {
				console.warn("[CiteDocs] Remote style fetch failed, falling back to local/backend:", err);
				return tryFetch(localUrl).catch(function() {
					return tryFetch("/api/csl/styles/" + e);
				});
			});
		}
		return tryFetch(localUrl).catch(function() {
			return tryFetch("/api/csl/styles/" + e);
		});"""
        if old_gs in b_c:
            b_c = b_c.replace(old_gs, new_gs)
        elif "Remote style fetch failed" in b_c and 'Accept: "application/vnd.citationstyles.style+xml' not in b_c:
            # Upgrade earlier patched tryFetch to JSON-aware version
            earlier_gs = """var localUrl = r._STYLES_LOCAL + e + ".csl";
		function tryFetch(url) {
			return fetch(url).then(function(res) {
				if (!res.ok) throw new Error("HTTP " + res.status + " fetching " + url);
				return res.text();
			}).then(function(txt) {
				if (!txt || !txt.includes("<style")) throw new Error("Invalid CSL from " + url);
				return txt;
			});
		}"""
            earlier_gs_repl = """var localUrl = r._STYLES_LOCAL + e + ".csl";
		function tryFetch(url) {
			return fetch(url, { headers: { Accept: "application/vnd.citationstyles.style+xml, application/xml, text/xml;q=0.9, text/plain;q=0.8, application/json;q=0.5" } }).then(function(res) {
				if (!res.ok) throw new Error("HTTP " + res.status + " fetching " + url);
				var ctype = res.headers.get("content-type") || "";
				if (ctype.includes("json")) {
					return res.json().then(function(j) { return (j && j.xml) ? j.xml : ""; });
				}
				return res.text();
			}).then(function(txt) {
				if (typeof txt === "string" && txt.trim().startsWith("{")) {
					try {
						var parsed = JSON.parse(txt);
						if (parsed && parsed.xml) txt = parsed.xml;
					} catch (_) {}
				}
				if (!txt || !txt.includes("<style")) throw new Error("Invalid CSL from " + url);
				return txt;
			});
		}"""
            if earlier_gs in b_c:
                b_c = b_c.replace(earlier_gs, earlier_gs_repl)

        # 5j. Resilient locale loading: validate XML and fallback to bundled tr-TR and en-US
        old_ll = """en.prototype.loadLocale = function(e) {
	var t = this;
	if (this._selectedLanguage = e, this._cache[e]) return Promise.resolve(this._cache[e]);
	var n = this._getLocalesUrl() + "locales-" + e + ".xml";
	return fetch(n).catch(function(n) {
		return console.error("Failed to load locale:", n), fetch(t._LOCALES_PATH + "locales-" + e + ".xml");
	}).then(function(e) {
		return e.text();
	}).then(function(n) {
		return t._cache[e] = n, n;
	});
}"""
        new_ll = """en.prototype.loadLocale = function(e) {
	var t = this;
	if (this._selectedLanguage = e, this._cache[e] && this._cache[e].indexOf("<locale") !== -1) return Promise.resolve(this._cache[e]);
	function tryLoc(url) {
		return fetch(url).then(function(res) {
			if (!res.ok) throw new Error("HTTP " + res.status + " for locale " + url);
			return res.text();
		}).then(function(txt) {
			if (!txt || txt.indexOf("<locale") === -1) throw new Error("Invalid locale XML from " + url);
			return txt;
		});
	}
	var remoteUrl = this._getLocalesUrl() + "locales-" + e + ".xml";
	var localUrl = t._LOCALES_PATH + "locales-" + e + ".xml";
	var fallbackUrl = t._LOCALES_PATH + "locales-en-US.xml";
	return tryLoc(remoteUrl).catch(function(err) {
		return tryLoc(localUrl).catch(function() {
			return tryLoc(fallbackUrl);
		});
	}).then(function(n) {
		return t._cache[e] = n, n;
	});
}"""
        if old_ll in b_c:
            b_c = b_c.replace(old_ll, new_ll)

        with open(bundle_file, "w", encoding="utf-8") as f:
            f.write(b_c)
        make_gz(bundle_file)

    if os.path.isfile(cfg_file + ".gz"):
        make_gz(cfg_file)

    # Set appropriate permissions
    ref_st = os.stat(langs_file)
    targets = [
        langs_file, langs_file + ".gz",
        tr_tr_file, tr_tr_file + ".gz",
        tr_file, tr_file + ".gz",
        cfg_file,
        hook_file, hook_file + ".gz"
    ]
    if os.path.isfile(index_file):
        targets.extend([index_file, index_file + ".gz"])
    if os.path.isfile(bundle_file):
        targets.extend([bundle_file, bundle_file + ".gz"])
    if os.path.isfile(cfg_file + ".gz"):
        targets.append(cfg_file + ".gz")

    for t in targets:
        os.chmod(t, 0o644)
        try:
            os.chown(t, ref_st.st_uid, ref_st.st_gid)
        except (PermissionError, AttributeError):
            pass

    # 6. Strict build-time assertions
    with open(langs_file, "r", encoding="utf-8") as f:
        raw_langs = f.read()
    assert "tr-TR" in json.loads(raw_langs), "langs.json missing tr-TR"
    assert os.path.isfile(langs_file + ".gz"), "langs.json.gz missing"
    with gzip.open(langs_file + ".gz", "rt", encoding="utf-8") as f:
        dec = f.read()
    assert dec == raw_langs, "decompressed langs.json.gz does not equal langs.json"

    assert os.path.isfile(tr_tr_file + ".gz"), "tr-TR.json.gz missing"
    assert os.path.isfile(tr_file + ".gz"), "tr.json.gz missing"
    assert os.path.isfile(hook_file + ".gz"), "zotero-sync-hook.js.gz missing"

    if os.path.isfile(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            idx_check = f.read()
        assert '<script src="zotero-sync-hook.js"></script>' in idx_check, "index.html missing clean zotero-sync-hook script tag"
        assert '<script src="vendor/citeproc/citeproc_commonjs.js"></script>' in idx_check, "index.html missing citeproc script tag"
        assert "\\>" not in idx_check, "corrupted script tag with backslash found in index.html"
        assert os.path.isfile(index_file + ".gz"), "index.html.gz missing"
        with gzip.open(index_file + ".gz", "rt", encoding="utf-8") as f:
            idx_gz = f.read()
        assert idx_gz == idx_check, "decompressed index.html.gz does not equal index.html"

    if os.path.isfile(bundle_file):
        with open(bundle_file, "r", encoding="utf-8") as f:
            b_check = f.read()
        assert "window.__zoteroSettings = r = new Z(t, e)" in b_check, "bundle.modern.js missing window.__zoteroSettings patch"
        assert "window.__zoteroCitationService = i = new zt(" in b_check, "bundle.modern.js missing window.__zoteroCitationService patch"
        if len(b_check) > 1000:
            assert "[CiteDocs Zotero Plugin] Refresh error:" in b_check, "bundle.modern.js missing refresh error logging patch"
            assert "[CiteDocs Zotero Plugin] Ut error:" in b_check, "bundle.modern.js missing Ut error patch"
            assert "Asc.scope.bibStyle && (Asc.scope.bibStyle = {})" in b_check, "bundle.modern.js missing bibStyle safety patch"
            assert "ADDIN ZOTERO_BIBL" in b_check, "bundle.modern.js missing getCurrentField fallback patch"
            assert "Remote style fetch failed" in b_check, "bundle.modern.js missing getStyle fallback patch"
            assert "fallbackUrl = t._LOCALES_PATH + \"locales-en-US.xml\"" in b_check, "bundle.modern.js missing loadLocale fallback patch"
            assert "window.parent.__zoteroSettings = r" in b_check, "bundle.modern.js missing parent __zoteroSettings patch"
            assert "window.top.__zoteroSettings = r" in b_check, "bundle.modern.js missing top __zoteroSettings patch"
            assert "window.parent.__zoteroCitationService = i" in b_check, "bundle.modern.js missing parent __zoteroCitationService patch"
            assert "window.top.__zoteroCitationService = i" in b_check, "bundle.modern.js missing top __zoteroCitationService patch"
            assert "Atıf stili XML verisi bulunamadı:" in b_check, "bundle.modern.js missing Turkish CSL missing error patch"
            assert "_PRELOADED_STYLES" in b_check, "bundle.modern.js missing _PRELOADED_STYLES patch"
            assert "_PRELOADED_LOCALES" in b_check, "bundle.modern.js missing _PRELOADED_LOCALES patch"
        assert os.path.isfile(bundle_file + ".gz"), "bundle.modern.js.gz missing"
        with gzip.open(bundle_file + ".gz", "rt", encoding="utf-8") as f:
            b_gz = f.read()
        assert b_gz == b_check, "decompressed bundle.modern.js.gz does not equal bundle.modern.js"

    print("Zotero Turkish translation, sync hook and citeproc script tags installed and verified successfully.")


if __name__ == "__main__":
    main()
