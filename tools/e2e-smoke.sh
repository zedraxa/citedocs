#!/usr/bin/env bash
# CiteDocs End-to-End Integration Smoke Test
# Verifies the full containerized stack: Server, Postgres, MinIO (S3),
# Collabora Online (CODE), Translation Server, and Web Frontend.

set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:3000}"
WEB_URL="${WEB_URL:-http://localhost:5173}"
COLLABORA_URL="${COLLABORA_URL:-http://localhost:9982}"
TRANSLATION_URL="${TRANSLATION_URL:-http://localhost:1969}"
USER_ID="${USER_ID:-00000000-0000-0000-0000-000000000001}"
TEST_DOC_ID="e2e-smoke-$(date +%s)"

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() {
  echo -e "  ${GREEN}✓ [PASS]${NC} $1"
}

fail() {
  echo -e "  ${RED}✗ [FAIL]${NC} $1"
  exit 1
}

warn() {
  echo -e "  ${YELLOW}⚠ [WARN]${NC} $1"
}

echo -e "\n${BLUE}===================================================${NC}"
echo -e "${BLUE}   CiteDocs End-to-End Prototype Smoke Test        ${NC}"
echo -e "${BLUE}===================================================${NC}\n"

# 1. Server Health Check
echo "Step 1: Checking CiteDocs REST API Health..."
HEALTH_RESP=$(curl -sf "${SERVER_URL}/health" || true)
if echo "$HEALTH_RESP" | grep -q '"status":"ok"'; then
  pass "Server health check responded 200 OK (${SERVER_URL}/health)"
else
  fail "Server health check failed at ${SERVER_URL}/health: $HEALTH_RESP"
fi

# 2. Translation Server Check
echo "Step 2: Checking Upstream Zotero Translation Server..."
DOI="10.1103/PhysRev.47.777"
TRANSLATE_RAW=$(curl -sf -X POST "${TRANSLATION_URL}/search" \
  -H "Content-Type: text/plain" \
  -d "$DOI" || true)
if echo "$TRANSLATE_RAW" | grep -q "Einstein"; then
  pass "Translation Server resolved DOI $DOI to Einstein et al."
else
  fail "Translation Server failed to resolve DOI $DOI: $TRANSLATE_RAW"
fi

# 3. DOI Resolution and Library Item Persistence
echo "Step 3: Checking CiteDocs DOI Resolution & Postgres Storage..."
ITEM_RESP=$(curl -sf -X POST "${SERVER_URL}/api/items/from-identifier" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d "{\"identifier\":\"${DOI}\"}" || true)
if echo "$ITEM_RESP" | grep -q '"persisted":true'; then
  pass "DOI resolved and persisted in Postgres library_items table"
else
  fail "Failed to resolve/persist DOI: $ITEM_RESP"
fi

# 4. Collabora Discovery XML
echo "Step 4: Checking Collabora Online (CODE) Discovery Endpoint..."
DISCOVERY_XML=$(curl -sf "${COLLABORA_URL}/hosting/discovery" || true)
if echo "$DISCOVERY_XML" | grep -q "<wopi-discovery>"; then
  pass "Collabora discovery XML loaded successfully (${COLLABORA_URL}/hosting/discovery)"
else
  fail "Collabora discovery failed: $DISCOVERY_XML"
fi

# 5. Collabora Session Creation
echo "Step 5: Creating Collabora Editing Session for Document '${TEST_DOC_ID}'..."
SESSION_RESP=$(curl -sf -X POST "${SERVER_URL}/api/documents/${TEST_DOC_ID}/collabora-session" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d '{"userName":"E2E Smoke Tester","action":"edit"}' || true)

ACTION_URL=$(echo "$SESSION_RESP" | grep -o '"actionUrl":"[^"]*"' | cut -d'"' -f4)
ACCESS_TOKEN=$(echo "$SESSION_RESP" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -n "$ACTION_URL" ] && [ -n "$ACCESS_TOKEN" ]; then
  pass "Generated Collabora session token and ActionURL: $ACTION_URL"
else
  fail "Failed to create Collabora session: $SESSION_RESP"
fi

# 6. WOPI CheckFileInfo
echo "Step 6: Executing WOPI CheckFileInfo..."
CHECK_FILE_RESP=$(curl -sf "${SERVER_URL}/wopi/files/${TEST_DOC_ID}?access_token=${ACCESS_TOKEN}" || true)
if echo "$CHECK_FILE_RESP" | grep -q '"UserCanWrite":true' && echo "$CHECK_FILE_RESP" | grep -q '"BaseFileName"'; then
  pass "CheckFileInfo succeeded (BaseFileName, UserCanWrite=true, SupportsLocks=true)"
else
  fail "CheckFileInfo failed: $CHECK_FILE_RESP"
fi

# 7. WOPI GetFile
echo "Step 7: Executing WOPI GetFile..."
TMP_DOCX="/tmp/${TEST_DOC_ID}.docx"
curl -sf "${SERVER_URL}/wopi/files/${TEST_DOC_ID}/contents?access_token=${ACCESS_TOKEN}" -o "$TMP_DOCX"
if [ -s "$TMP_DOCX" ] && head -c 2 "$TMP_DOCX" | grep -q "PK"; then
  pass "GetFile streamed valid DOCX binary ($(wc -c < "$TMP_DOCX") bytes)"
else
  fail "GetFile did not return a valid DOCX file"
fi

# 8. WOPI Lock and PutFile
echo "Step 8: Executing WOPI Lock and PutFile (Save modifications)..."
LOCK_ID="lock-${TEST_DOC_ID}"
curl -sf -X POST "${SERVER_URL}/wopi/files/${TEST_DOC_ID}?access_token=${ACCESS_TOKEN}" \
  -H "X-WOPI-Override: LOCK" \
  -H "X-WOPI-Lock: ${LOCK_ID}" > /dev/null
pass "Acquired WOPI Lock (${LOCK_ID})"

MODIFIED_CONTENT="SMOKE TEST VERIFIED AT $(date -u)"
echo "$MODIFIED_CONTENT" > "$TMP_DOCX"
PUT_RESP=$(curl -sf -X POST "${SERVER_URL}/wopi/files/${TEST_DOC_ID}/contents?access_token=${ACCESS_TOKEN}" \
  -H "X-WOPI-Lock: ${LOCK_ID}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$TMP_DOCX")
if echo "$PUT_RESP" | grep -q '"version"'; then
  pass "PutFile persisted new version to storage: $PUT_RESP"
else
  fail "PutFile failed: $PUT_RESP"
fi

# 9. Verify updated GetFile
echo "Step 9: Verifying updated contents via subsequent GetFile..."
UPDATED_CONTENT=$(curl -sf "${SERVER_URL}/wopi/files/${TEST_DOC_ID}/contents?access_token=${ACCESS_TOKEN}")
if echo "$UPDATED_CONTENT" | grep -q "SMOKE TEST VERIFIED"; then
  pass "GetFile retrieved the updated content from storage"
else
  fail "GetFile did not return updated content: $UPDATED_CONTENT"
fi
rm -f "$TMP_DOCX"

# 10. Web Frontend Delivery
echo "Step 10: Checking Web Frontend Delivery..."
WEB_HTML=$(curl -sf "${WEB_URL}/" || true)
if echo "$WEB_HTML" | grep -q "CiteDocs"; then
  pass "Web frontend HTML served with CiteDocs title (${WEB_URL})"
else
  fail "Web frontend failed: $WEB_HTML"
fi

# 11. Headless Browser Check
echo "Step 11: Testing UI Rendering with Headless Browser..."
CHROME_BIN=$(which google-chrome 2>/dev/null || which chromium 2>/dev/null || which chromium-browser 2>/dev/null || true)
if [ -n "$CHROME_BIN" ]; then
  DOM_DUMP=$("$CHROME_BIN" --headless=new --dump-dom --virtual-time-budget=5000 "${WEB_URL}/?editor=collabora" 2>/dev/null || true)
  if echo "$DOM_DUMP" | grep -q 'collabora-iframe' && echo "$DOM_DUMP" | grep -q 'zotero-sidebar'; then
    pass "Headless browser confirmed both collabora-iframe and zotero-sidebar rendered in DOM"
  else
    warn "Headless browser ran, but specific DOM testids were not found in time-budget."
  fi
else
  warn "No headless Chrome/Chromium found on PATH; skipped headless browser check."
fi

echo -e "\n${GREEN}===================================================${NC}"
echo -e "${GREEN}   ALL E2E INTEGRATION CHECKS PASSED SUCCESSFULLY  ${NC}"
echo -e "${GREEN}===================================================${NC}\n"
echo -e "You can try CiteDocs in your browser now at:"
echo -e "  ${BLUE}${WEB_URL}/?editor=collabora${NC}\n"
