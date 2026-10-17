#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PATCH_SCRIPT="$REPO_ROOT/deploy/onlyoffice/patch-zotero-plugin.py"
TR_FILE="$REPO_ROOT/deploy/onlyoffice/zotero-translations/tr-TR.json"
HOOK_FILE="$REPO_ROOT/deploy/onlyoffice/zotero-sync-hook.js"

if [[ ! -f "$PATCH_SCRIPT" ]]; then
    echo "ERROR: Missing patch script at $PATCH_SCRIPT" >&2
    exit 1
fi

TMP_DIR="$(mktemp -d /tmp/oo-plugin-patch-test-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/translations" "$TMP_DIR/dist"
echo '["en-US", "es-ES"]' > "$TMP_DIR/translations/langs.json"
echo '{"variations":[{"descriptionLocale":{}}]}' > "$TMP_DIR/config.json"
cp "$TR_FILE" "$TMP_DIR/translations/tr-TR.json"
cp "$HOOK_FILE" "$TMP_DIR/zotero-sync-hook.js"
echo 'r = new Z(t, e), i = new zt(' > "$TMP_DIR/dist/bundle.modern.js"

cat <<'EOF' > "$TMP_DIR/index.html"
<!DOCTYPE html>
<html>
<head>
    <script src="https://onlyoffice.github.io/sdkjs-plugins/v1/plugins.js"></script>
    <script src="https://onlyoffice.github.io/sdkjs-plugins/v1/plugins-ui.js"></script>
    <script src="vendor/citeproc/citeproc_commonjs.js"></script>
</head>
<body></body>
</html>
EOF

# Run patch script
python3 "$PATCH_SCRIPT" "$TMP_DIR"

INDEX_FILE="$TMP_DIR/index.html"

# Assertions
if grep -q "\\\\>" "$INDEX_FILE"; then
    echo "FAIL: Corrupted escaped closing tag found in index.html" >&2
    exit 1
fi

if ! grep -q '<script src="zotero-sync-hook.js"></script>' "$INDEX_FILE"; then
    echo "FAIL: Clean zotero-sync-hook tag not found in index.html" >&2
    exit 1
fi

if ! grep -q '<script src="vendor/citeproc/citeproc_commonjs.js"></script>' "$INDEX_FILE"; then
    echo "FAIL: citeproc tag not found in index.html" >&2
    exit 1
fi

if [[ ! -f "$INDEX_FILE.gz" ]]; then
    echo "FAIL: index.html.gz was not generated" >&2
    exit 1
fi

# Assert gzip decompression matches uncompressed
gunzip -c "$INDEX_FILE.gz" > "$TMP_DIR/decompressed.html"
if ! cmp -s "$INDEX_FILE" "$TMP_DIR/decompressed.html"; then
    echo "FAIL: Decompressed index.html.gz does not match index.html" >&2
    exit 1
fi

# Run second time to verify idempotency
python3 "$PATCH_SCRIPT" "$TMP_DIR"

HOOK_COUNT="$(grep -c '<script src="zotero-sync-hook.js"></script>' "$INDEX_FILE")"
if [[ "$HOOK_COUNT" -ne 1 ]]; then
    echo "FAIL: Expected exactly 1 hook tag after second run, found $HOOK_COUNT" >&2
    exit 1
fi

echo "SUCCESS: ONLYOFFICE Zotero plugin patch verification passed cleanly."
