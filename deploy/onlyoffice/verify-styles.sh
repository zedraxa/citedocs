#!/usr/bin/env bash
# ==============================================================================
# CiteDocs ONLYOFFICE & Server CSL Style / Locale Verification Script
# ==============================================================================
# Doğrulananlar:
# 1. ONLYOFFICE Zotero eklentisinde IEEE, APA ve Chicago CSL dosyaları
#    (hem sürümsüz hem sürümlü yollar üzerinden, HTTP 200 ve geçerli <style XML)
# 2. ONLYOFFICE Zotero eklentisinde tr-TR ve en-US yerelleştirme XML dosyaları
#    (HTTP 200 ve geçerli <locale XML)
# 3. CiteDocs Fastify API (/api/csl/styles/:id) uç noktaları:
#    - :id.csl ile ham XML dönüşü
#    - ?format=xml ile ham XML dönüşü
#    - Accept: application/vnd.citationstyles.style+xml ile ham XML dönüşü
#    - Varsayılan JSON yanıtı içinde geçerli xml alanı
# ==============================================================================

set -euo pipefail

OO_BASE="${1:-http://localhost:8083}"
SERVER_BASE="${2:-http://localhost:3000}"

# Strip trailing slashes
OO_BASE="${OO_BASE%/}"
SERVER_BASE="${SERVER_BASE%/}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

FAILED=0
PASSED=0

check_endpoint() {
    local desc="$1"
    local url="$2"
    local expected_pattern="$3"
    local accept_header="${4:-*/*}"

    printf "  • %-60s " "$desc..."

    local http_code
    local body
    local tmp_file
    tmp_file=$(mktemp)

    http_code=$(curl -s -L -o "$tmp_file" -w "%{http_code}" -H "Accept: $accept_header" "$url" 2>/dev/null || echo "000")

    if [[ "$http_code" != "200" ]]; then
        printf "${RED}BAŞARISIZ (HTTP %s)${NC}\n" "$http_code"
        echo "    URL: $url"
        FAILED=$((FAILED + 1))
        rm -f "$tmp_file"
        return 1
    fi

    if grep -q "$expected_pattern" "$tmp_file"; then
        printf "${GREEN}BAŞARILI (HTTP 200, eşleşti: %s)${NC}\n" "$expected_pattern"
        PASSED=$((PASSED + 1))
        rm -f "$tmp_file"
        return 0
    else
        printf "${RED}BAŞARISIZ (İçerikte '%s' bulunamadı)${NC}\n" "$expected_pattern"
        echo "    URL: $url"
        echo "    Önizleme: $(head -c 160 "$tmp_file")..."
        FAILED=$((FAILED + 1))
        rm -f "$tmp_file"
        return 1
    fi
}

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE} CiteDocs CSL Stil ve Yerelleştirme Doğrulama Betiği${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo "  ONLYOFFICE Sunucusu : $OO_BASE"
echo "  CiteDocs API        : $SERVER_BASE"
echo ""

# ------------------------------------------------------------------------------
# 1. ONLYOFFICE Zotero Eklentisi Statik CSL Dosyaları (Sürümsüz)
# ------------------------------------------------------------------------------
echo -e "${YELLOW}[1/4] ONLYOFFICE Sürümsüz Eklenti Yolları Denetleniyor...${NC}"
check_endpoint "ONLYOFFICE IEEE CSL (Sürümsüz)" \
    "$OO_BASE/sdkjs-plugins/zotero/resources/csl/styles/ieee.csl" \
    "<style"

check_endpoint "ONLYOFFICE APA CSL (Sürümsüz)" \
    "$OO_BASE/sdkjs-plugins/zotero/resources/csl/styles/apa.csl" \
    "<style"

check_endpoint "ONLYOFFICE Chicago CSL (Sürümsüz)" \
    "$OO_BASE/sdkjs-plugins/zotero/resources/csl/styles/chicago-author-date.csl" \
    "<style"

check_endpoint "ONLYOFFICE tr-TR Yerelleştirme XML (Sürümsüz)" \
    "$OO_BASE/sdkjs-plugins/zotero/resources/csl/locales/locales-tr-TR.xml" \
    "<locale"

check_endpoint "ONLYOFFICE en-US Yerelleştirme XML (Sürümsüz)" \
    "$OO_BASE/sdkjs-plugins/zotero/resources/csl/locales/locales-en-US.xml" \
    "<locale"

echo ""

# ------------------------------------------------------------------------------
# 2. ONLYOFFICE Sürümlü Önek Altındaki Yollar
# ------------------------------------------------------------------------------
echo -e "${YELLOW}[2/4] ONLYOFFICE Sürümlü Önek Altındaki Yollar Denetleniyor...${NC}"
# ONLYOFFICE tipik olarak 10.0.0-169 veya benzeri bir sürümlü önek kullanır.
check_endpoint "ONLYOFFICE IEEE CSL (10.0.0-169 Sürümlü)" \
    "$OO_BASE/10.0.0-169/sdkjs-plugins/zotero/resources/csl/styles/ieee.csl" \
    "<style"

check_endpoint "ONLYOFFICE APA CSL (10.0.0-169 Sürümlü)" \
    "$OO_BASE/10.0.0-169/sdkjs-plugins/zotero/resources/csl/styles/apa.csl" \
    "<style"

check_endpoint "ONLYOFFICE tr-TR Yerelleştirme (10.0.0-169 Sürümlü)" \
    "$OO_BASE/10.0.0-169/sdkjs-plugins/zotero/resources/csl/locales/locales-tr-TR.xml" \
    "<locale"

echo ""

# ------------------------------------------------------------------------------
# 3. CiteDocs Fastify CSL API Uç Noktaları (Raw XML)
# ------------------------------------------------------------------------------
echo -e "${YELLOW}[3/4] CiteDocs API Ham XML Uç Noktaları Denetleniyor...${NC}"
check_endpoint "API IEEE Ham CSL (.csl uzantısı ile)" \
    "$SERVER_BASE/api/csl/styles/ieee.csl" \
    "<style"

check_endpoint "API APA Ham CSL (.csl uzantısı ile)" \
    "$SERVER_BASE/api/csl/styles/apa.csl" \
    "<style"

check_endpoint "API Chicago Ham CSL (.csl uzantısı ile)" \
    "$SERVER_BASE/api/csl/styles/chicago-author-date.csl" \
    "<style"

check_endpoint "API IEEE Ham CSL (?format=xml ile)" \
    "$SERVER_BASE/api/csl/styles/ieee?format=xml" \
    "<style"

check_endpoint "API IEEE Ham CSL (Accept: application/vnd.citationstyles.style+xml)" \
    "$SERVER_BASE/api/csl/styles/ieee" \
    "<style" \
    "application/vnd.citationstyles.style+xml"

echo ""

# ------------------------------------------------------------------------------
# 4. CiteDocs Fastify CSL API Uç Noktaları (JSON Yanıtı)
# ------------------------------------------------------------------------------
echo -e "${YELLOW}[4/4] CiteDocs API JSON Uç Noktaları Denetleniyor...${NC}"
check_endpoint "API IEEE JSON (xml alanı içermeli)" \
    "$SERVER_BASE/api/csl/styles/ieee" \
    '"xml":' \
    "application/json"

check_endpoint "API APA JSON (xml alanı içermeli)" \
    "$SERVER_BASE/api/csl/styles/apa" \
    '"xml":' \
    "application/json"

check_endpoint "API Stil Arama /api/csl/styles?q=ieee" \
    "$SERVER_BASE/api/csl/styles?q=ieee" \
    '"id":"ieee"' \
    "application/json"

echo ""
echo -e "${BLUE}======================================================================${NC}"
if [[ "$FAILED" -eq 0 ]]; then
    echo -e "${GREEN}✓ TÜM DENETİMLER BAŞARILI! ($PASSED/$((PASSED+FAILED)) test geçti)${NC}"
    echo -e "${GREEN}  CSL XML ve yerelleştirme dosyaları hem ONLYOFFICE hem API üzerinden erişilebilir.${NC}"
    echo -e "${BLUE}======================================================================${NC}"
    exit 0
else
    echo -e "${RED}✗ BAZI DENETİMLER BAŞARISIZ OLDU! (Başarılı: $PASSED, Başarısız: $FAILED)${NC}"
    echo -e "${RED}  Lütfen yukarıdaki hata çıktılarını inceleyiniz.${NC}"
    echo -e "${BLUE}======================================================================${NC}"
    exit 1
fi
