FROM onlyoffice/documentserver:latest
# Zotero is not guaranteed to be installed in the CE image. Pin the plugin source
# and install it on the Document Server origin so its stored credentials work.
ADD https://github.com/ONLYOFFICE/onlyoffice.github.io/archive/f3263c055c25875874004463b46c2e6a7000a9fd.tar.gz /tmp/plugins.tar.gz
RUN mkdir -p /tmp/oo-plugins \
    && tar -xzf /tmp/plugins.tar.gz -C /tmp/oo-plugins --strip-components=1 \
    && cp -a /tmp/oo-plugins/sdkjs-plugins/content/zotero /var/www/onlyoffice/documentserver/sdkjs-plugins/zotero \
    && rm -rf /tmp/oo-plugins /tmp/plugins.tar.gz

COPY deploy/onlyoffice/zotero-translations/tr-TR.json /var/www/onlyoffice/documentserver/sdkjs-plugins/zotero/translations/tr-TR.json
RUN python3 -c 'exec("\n".join([\
    "import gzip, json, os, shutil",\
    "base = \"/var/www/onlyoffice/documentserver/sdkjs-plugins/zotero\"",\
    "trans_dir = os.path.join(base, \"translations\")",\
    "langs_file = os.path.join(trans_dir, \"langs.json\")",\
    "cfg_file = os.path.join(base, \"config.json\")",\
    "tr_tr_file = os.path.join(trans_dir, \"tr-TR.json\")",\
    "tr_file = os.path.join(trans_dir, \"tr.json\")",\
    "if not os.path.isfile(langs_file):",\
    "    raise FileNotFoundError(\"Missing langs.json: \" + langs_file)",\
    "if not os.path.isfile(cfg_file):",\
    "    raise FileNotFoundError(\"Missing config.json: \" + cfg_file)",\
    "if not os.path.isfile(tr_tr_file):",\
    "    raise FileNotFoundError(\"Missing tr-TR.json: \" + tr_tr_file)",\
    "shutil.copyfile(tr_tr_file, tr_file)",\
    "with open(langs_file, \"r\", encoding=\"utf-8\") as f:",\
    "    langs = json.load(f)",\
    "if \"tr-TR\" not in langs:",\
    "    langs.append(\"tr-TR\")",\
    "with open(langs_file, \"w\", encoding=\"utf-8\") as f:",\
    "    json.dump(langs, f, indent=2, ensure_ascii=False)",\
    "    f.write(\"\\n\")",\
    "with open(cfg_file, \"r\", encoding=\"utf-8\") as f:",\
    "    cfg = json.load(f)",\
    "cfg.setdefault(\"nameLocale\", {})[\"tr\"] = \"Zotero\"",\
    "for var in cfg.get(\"variations\", []):",\
    "    if \"descriptionLocale\" in var and isinstance(var[\"descriptionLocale\"], dict):",\
    "        var[\"descriptionLocale\"][\"tr\"] = \"Zotero servisini kullanarak gerekli stilde kaynakçalar oluşturun.\"",\
    "with open(cfg_file, \"w\", encoding=\"utf-8\") as f:",\
    "    json.dump(cfg, f, indent=2, ensure_ascii=False)",\
    "    f.write(\"\\n\")",\
    "def make_gz(path):",\
    "    with open(path, \"rb\") as fin:",\
    "        data = fin.read()",\
    "    with gzip.open(path + \".gz\", \"wb\", compresslevel=9) as fout:",\
    "        fout.write(data)",\
    "make_gz(langs_file)",\
    "make_gz(tr_tr_file)",\
    "make_gz(tr_file)",\
    "if os.path.isfile(cfg_file + \".gz\"): make_gz(cfg_file)",\
    "ref_st = os.stat(langs_file)",\
    "targets = [langs_file, langs_file + \".gz\", tr_tr_file, tr_tr_file + \".gz\", tr_file, tr_file + \".gz\", cfg_file]",\
    "if os.path.isfile(cfg_file + \".gz\"): targets.append(cfg_file + \".gz\")",\
    "for t in targets:",\
    "    os.chmod(t, 0o644)",\
    "    try:",\
    "        os.chown(t, ref_st.st_uid, ref_st.st_gid)",\
    "    except PermissionError:",\
    "        pass",\
    "with open(langs_file, \"r\", encoding=\"utf-8\") as f:",\
    "    raw_langs = f.read()",\
    "assert \"tr-TR\" in json.loads(raw_langs), \"langs.json missing tr-TR\"",\
    "assert os.path.isfile(langs_file + \".gz\"), \"langs.json.gz missing\"",\
    "with gzip.open(langs_file + \".gz\", \"rt\", encoding=\"utf-8\") as f:",\
    "    dec = f.read()",\
    "assert dec == raw_langs, \"decompressed langs.json.gz does not equal langs.json\"",\
    "assert os.path.isfile(tr_tr_file + \".gz\"), \"tr-TR.json.gz missing\"",\
    "assert os.path.isfile(tr_file + \".gz\"), \"tr.json.gz missing\"",\
    "print(\"Zotero Turkish translation installed and verified successfully.\")",\
]))'
