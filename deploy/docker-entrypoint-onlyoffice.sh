#!/bin/bash
set -e

CONF_DIR="${CONF_DIR:-/etc/onlyoffice/documentserver}"
LOCAL_JSON="${CONF_DIR}/local.json"
OVERRIDE_JSON="${CONF_DIR}/local-production-linux.json"

INTERVAL="${OO_AUTOASSEMBLY_INTERVAL:-1m}"
STEP="${OO_AUTOASSEMBLY_STEP:-1m}"
ENABLE="${OO_AUTOASSEMBLY_ENABLE:-true}"

mkdir -p "${CONF_DIR}"

# 1. Write / update local-production-linux.json (node-config production-linux override)
cat <<EOF > "${OVERRIDE_JSON}"
{
  "services": {
    "CoAuthoring": {
      "autoAssembly": {
        "enable": ${ENABLE},
        "interval": "${INTERVAL}",
        "step": "${STEP}"
      }
    }
  }
}
EOF
chown -R ds:ds "${OVERRIDE_JSON}" 2>/dev/null || true
chmod 644 "${OVERRIDE_JSON}" 2>/dev/null || true

# 2. Merge into local.json if available
if [ -f "${LOCAL_JSON}" ]; then
  if command -v jq >/dev/null 2>&1; then
    tmp=$(mktemp)
    jq --argjson enable "${ENABLE}" --arg interval "${INTERVAL}" --arg step "${STEP}" \
      '.services.CoAuthoring.autoAssembly = {
        enable: $enable,
        interval: $interval,
        step: $step
      }' "${LOCAL_JSON}" > "${tmp}" && mv "${tmp}" "${LOCAL_JSON}"
  elif command -v node >/dev/null 2>&1; then
    node -e "
      const fs = require('fs');
      try {
        const file = '${LOCAL_JSON}';
        const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        data.services = data.services || {};
        data.services.CoAuthoring = data.services.CoAuthoring || {};
        data.services.CoAuthoring.autoAssembly = {
          enable: ${ENABLE},
          interval: '${INTERVAL}',
          step: '${STEP}'
        };
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      } catch (e) {
        console.error('Failed to update local.json:', e);
      }
    "
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json
try:
    with open('${LOCAL_JSON}', 'r') as f:
        data = json.load(f)
except Exception:
    data = {}
data.setdefault('services', {}).setdefault('CoAuthoring', {})['autoAssembly'] = {
    'enable': ${ENABLE},
    'interval': '${INTERVAL}',
    'step': '${STEP}'
}
with open('${LOCAL_JSON}', 'w') as f:
    json.dump(data, f, indent=2)
"
  fi
  chown ds:ds "${LOCAL_JSON}" 2>/dev/null || true
  chmod 644 "${LOCAL_JSON}" 2>/dev/null || true
fi

# 3. Execute original entrypoint or custom command
if [ "$#" -eq 0 ]; then
  exec /app/ds/run-document-server.sh
else
  exec "$@"
fi
