FROM onlyoffice/documentserver:latest
# Zotero is not guaranteed to be installed in the CE image. Pin the plugin source
# and install it on the Document Server origin so its stored credentials work.
ADD https://github.com/ONLYOFFICE/onlyoffice.github.io/archive/f3263c055c25875874004463b46c2e6a7000a9fd.tar.gz /tmp/plugins.tar.gz
RUN mkdir -p /tmp/oo-plugins \
    && tar -xzf /tmp/plugins.tar.gz -C /tmp/oo-plugins --strip-components=1 \
    && cp -a /tmp/oo-plugins/sdkjs-plugins/content/zotero /var/www/onlyoffice/documentserver/sdkjs-plugins/zotero \
    && rm -rf /tmp/oo-plugins /tmp/plugins.tar.gz

# Periodic force-save (autoAssembly) configuration: install jq and wrap container entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends jq && rm -rf /var/lib/apt/lists/*
COPY deploy/docker-entrypoint-onlyoffice.sh /app/ds/run-document-server-citedocs.sh
RUN chmod +x /app/ds/run-document-server-citedocs.sh

ENTRYPOINT ["/app/ds/run-document-server-citedocs.sh"]

