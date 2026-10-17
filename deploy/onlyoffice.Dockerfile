FROM onlyoffice/documentserver:latest
# Zotero is not guaranteed to be installed in the CE image. Pin the plugin source
# and install it on the Document Server origin so its stored credentials work.
ADD https://github.com/ONLYOFFICE/onlyoffice.github.io/archive/f3263c055c25875874004463b46c2e6a7000a9fd.tar.gz /tmp/plugins.tar.gz
RUN mkdir -p /tmp/oo-plugins \
    && tar -xzf /tmp/plugins.tar.gz -C /tmp/oo-plugins --strip-components=1 \
    && cp -a /tmp/oo-plugins/sdkjs-plugins/content/zotero /var/www/onlyoffice/documentserver/sdkjs-plugins/zotero \
    && rm -rf /tmp/oo-plugins /tmp/plugins.tar.gz

COPY deploy/onlyoffice/zotero-translations/tr-TR.json /var/www/onlyoffice/documentserver/sdkjs-plugins/zotero/translations/tr-TR.json
RUN cp /var/www/onlyoffice/documentserver/sdkjs-plugins/zotero/translations/tr-TR.json /var/www/onlyoffice/documentserver/sdkjs-plugins/zotero/translations/tr.json \
    && (node -e ' \
      const fs = require("fs"); \
      const p = "/var/www/onlyoffice/documentserver/sdkjs-plugins/zotero"; \
      const langsPath = p + "/translations/langs.json"; \
      if (fs.existsSync(langsPath)) { \
        const langs = JSON.parse(fs.readFileSync(langsPath, "utf8")); \
        if (!langs.includes("tr-TR")) langs.push("tr-TR"); \
        fs.writeFileSync(langsPath, JSON.stringify(langs, null, 2)); \
      } \
      const cfgPath = p + "/config.json"; \
      if (fs.existsSync(cfgPath)) { \
        const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); \
        cfg.nameLocale = cfg.nameLocale || {}; \
        cfg.nameLocale["tr"] = "Zotero"; \
        if (cfg.variations && cfg.variations[0]) { \
          cfg.variations[0].descriptionLocale = cfg.variations[0].descriptionLocale || {}; \
          cfg.variations[0].descriptionLocale["tr"] = "Zotero servisini kullanarak gerekli stilde kaynakçalar oluşturun."; \
        } \
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2)); \
      }' 2>/dev/null || true)
