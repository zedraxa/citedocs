#!/bin/sh
# POSIX shell; Linux host tools required. No production credentials are read.
set -eu
export LC_ALL=C
status=0
warn() { printf 'UYARI: %s\n' "$*"; [ "$status" -ge 1 ] || status=1; }
critical() { printf 'KRİTİK: %s\n' "$*"; status=2; }
number() { case "$2" in ''|*[!0-9]*) printf 'Geçersiz sayı: %s\n' "$1" >&2; exit 2;; esac; }
high() {
  number "$1" "$2"
  printf '%s: %s (uyarı=%s kritik=%s)\n' "$1" "$2" "$3" "$4"
  if [ "$2" -ge "$4" ]; then critical "$1 eşik aşıldı ($2)";
  elif [ "$2" -ge "$3" ]; then warn "$1 eşik aşıldı ($2)"; fi
}
low() {
  number "$1" "$2"
  printf '%s: %s (uyarı=%s kritik=%s)\n' "$1" "$2" "$3" "$4"
  if [ "$2" -le "$4" ]; then critical "$1 yetersiz ($2)";
  elif [ "$2" -le "$3" ]; then warn "$1 yetersiz ($2)"; fi
}
DISK_WARN=${DISK_WARN:-80}; DISK_CRIT=${DISK_CRIT:-90}
INODE_WARN=${INODE_WARN:-80}; INODE_CRIT=${INODE_CRIT:-90}
RAM_WARN_MB=${RAM_WARN_MB:-768}; RAM_CRIT_MB=${RAM_CRIT_MB:-384}
SWAP_WARN=${SWAP_WARN:-25}; SWAP_CRIT=${SWAP_CRIT:-50}
CACHE_WARN_MB=${CACHE_WARN_MB:-5120}; CACHE_CRIT_MB=${CACHE_CRIT_MB:-10240}
RESTART_WARN=${RESTART_WARN:-1}; RESTART_CRIT=${RESTART_CRIT:-3}
for pair in "$DISK_WARN:$DISK_CRIT" "$INODE_WARN:$INODE_CRIT" "$SWAP_WARN:$SWAP_CRIT" "$CACHE_WARN_MB:$CACHE_CRIT_MB" "$RESTART_WARN:$RESTART_CRIT" "$RAM_CRIT_MB:$RAM_WARN_MB"; do
  a=${pair%:*}; b=${pair#*:}; number threshold "$a"; number threshold "$b"
  [ "$a" -lt "$b" ] || { echo 'Geçersiz eşik sırası' >&2; exit 2; }
done
for pct in "$DISK_CRIT" "$INODE_CRIT" "$SWAP_CRIT"; do
  [ "$pct" -le 100 ] || { echo 'Yüzde 100 üstü olamaz' >&2; exit 2; }
done
# Newline-separated filesystem paths, including Docker root and backup destination.
CHECK_PATHS=${CHECK_PATHS:-/}
oldifs=$IFS; IFS='
'
for target in $CHECK_PATHS; do
  if row=$(df -Pk "$target" 2>/dev/null); then
    value=$(printf '%s\n' "$row" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
    high "Disk % ($target)" "$value" "$DISK_WARN" "$DISK_CRIT"
  else critical "Disk okunamadı: $target"; fi
  if row=$(df -Pi "$target" 2>/dev/null); then
    value=$(printf '%s\n' "$row" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
    high "Inode % ($target)" "$value" "$INODE_WARN" "$INODE_CRIT"
  else critical "Inode okunamadı: $target"; fi
done
IFS=$oldifs
mem=${MEMINFO_PATH:-/proc/meminfo}
if [ -r "$mem" ]; then
  available=$(awk '/^MemAvailable:/ {print int($2/1024)}' "$mem")
  total=$(awk '/^SwapTotal:/ {print $2}' "$mem")
  free=$(awk '/^SwapFree:/ {print $2}' "$mem")
  low 'Kullanılabilir RAM MiB' "$available" "$RAM_WARN_MB" "$RAM_CRIT_MB"
  number SwapTotal "$total"; number SwapFree "$free"
  printf 'Swap boş/toplam KiB: %s/%s\n' "$free" "$total"
  if [ "$total" -eq 0 ]; then warn 'Swap tanımlı değil';
  else high 'Swap kullanım %' "$(( (total-free)*100/total ))" "$SWAP_WARN" "$SWAP_CRIT"; fi
else critical 'RAM bilgisi okunamadı'; fi
printf '\nDocker disk kullanımı ve volume boyutları (SIZE sütununa göre inceleyin):\n'
if usage=$(docker system df -v); then
  printf '%s\n' "$usage"
  printf '\nEn büyük 10 volume (bayt, ad, Docker boyutu):\n'
  printf '%s\n' "$usage" | awk '
    /^Local Volumes space usage:/ {volumes=1; next}
    volumes && /^Build cache/ {volumes=0}
    volumes && NF==3 && $2 ~ /^[0-9]+$/ {
      size=$3; n=size+0; unit=size; gsub(/[0-9.]/,"",unit)
      factor=1
      if (unit=="kB") factor=1000
      if (unit=="MB") factor=1000000
      if (unit=="GB") factor=1000000000
      if (unit=="TB") factor=1000000000000
      printf "%.0f %s %s\n", n*factor, $1, size
    }' | sort -nr | head -n 10
else critical 'Docker disk bilgisi alınamadı'; fi
if ids=$(docker ps -aq); then
  [ -n "$ids" ] || critical 'Hiç konteyner bulunamadı'
  for id in $ids; do
    if info=$(docker inspect --format '{{.Name}} {{.RestartCount}} {{.State.Status}} {{.State.OOMKilled}}' "$id"); then
      # Docker names and these fields cannot contain whitespace.
      set -- $info
      high "Yeniden başlama $1" "$2" "$RESTART_WARN" "$RESTART_CRIT"
      [ "$3" = running ] || warn "Konteyner çalışmıyor: $1 ($3)"
      [ "$4" = false ] || critical "OOM: $1"
    else critical "Konteyner okunamadı: $id"; fi
  done
else critical 'Konteyner listesi alınamadı'; fi
OO_CONTAINER=${OO_CONTAINER:-citedocs-onlyoffice}
if cache=$(docker exec "$OO_CONTAINER" du -sk /var/lib/onlyoffice/documentserver/App_Data/cache/files); then
  kb=$(printf '%s\n' "$cache" | awk 'NR==1 {print $1}')
  number cache "$kb"
  high 'ONLYOFFICE cache+forgotten MiB' "$((kb/1024))" "$CACHE_WARN_MB" "$CACHE_CRIT_MB"
else critical 'ONLYOFFICE cache ölçülemedi; container/yol yapılandırmasını doğrulayın'; fi
if [ "$status" -ne 0 ] && [ -n "${CAPACITY_WEBHOOK_URL:-}" ]; then
  # Generic JSON receiver; URL and response are never printed (may contain secrets).
  if ! curl --silent --fail --output /dev/null --connect-timeout 5 --max-time 15 \
    -H 'Content-Type: application/json' --data "{\"text\":\"CiteDocs kapasite UYARI: seviye $status. journalctl -u citedocs-capacity.service ile inceleyin.\"}" \
    "$CAPACITY_WEBHOOK_URL" 2>/dev/null; then critical 'Webhook gönderilemedi'; fi
fi
printf 'Kapasite denetimi çıkış kodu: %s\n' "$status"
exit "$status"
