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

    # 5. Patch bundle.modern.js: expose __zoteroSettings and __zoteroCitationService on window
    if os.path.isfile(bundle_file):
        with open(bundle_file, "r", encoding="utf-8") as f:
            b_c = f.read()
        if "window.__zoteroSettings" not in b_c:
            b_c = b_c.replace(
                "r = new Z(t, e), i = new zt(",
                "window.__zoteroSettings = r = new Z(t, e), window.__zoteroCitationService = i = new zt("
            )
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
        assert os.path.isfile(bundle_file + ".gz"), "bundle.modern.js.gz missing"
        with gzip.open(bundle_file + ".gz", "rt", encoding="utf-8") as f:
            b_gz = f.read()
        assert b_gz == b_check, "decompressed bundle.modern.js.gz does not equal bundle.modern.js"

    print("Zotero Turkish translation, sync hook and citeproc script tags installed and verified successfully.")


if __name__ == "__main__":
    main()
