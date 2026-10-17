#!/bin/sh
# Never stops services, prunes volumes, or deletes forgotten files by default.
set -eu
export LC_ALL=C
apply=0; forgotten=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) apply=1;;
    --dry-run) apply=0;;
    --include-forgotten) forgotten=1;;
    *) echo 'Kullanım: cleanup.sh [--dry-run|--apply] [--include-forgotten]' >&2; exit 2;;
  esac
  shift
done
DAYS=${DAYS:-30}
case "$DAYS" in ''|*[!0-9]*|0) echo 'DAYS pozitif tam sayı olmalı' >&2; exit 2;; esac
OO_CONTAINER=${OO_CONTAINER:-citedocs-onlyoffice}
if [ "$apply" -eq 1 ]; then
  [ "${MAINTENANCE_CONFIRMED:-}" = yes ] || { echo 'UYARI: Önce girişleri kapatın, oturumları kaydedin; MAINTENANCE_CONFIRMED=yes gerekir.' >&2; exit 2; }
  if [ "$forgotten" -eq 1 ] && [ "${FORGOTTEN_RECOVERY_CONFIRMED:-}" != yes ]; then
    echo 'UYARI: forgotten kurtarma kopyası doğrulanmalı; FORGOTTEN_RECOVERY_CONFIRMED=yes gerekir.' >&2; exit 2
  fi
fi
printf 'Temizlik: apply=%s, yaş >%s gün, forgotten=%s\n' "$apply" "$DAYS" "$forgotten"
# Keep the container running, but require both document writers stopped by the operator.
# No image pull, temporary container, host-path override or recursive rm.
docker exec -i "$OO_CONTAINER" sh -s -- "$apply" "$DAYS" "$forgotten" <<'INNER'
set -eu
apply=$1; days=$2; forgotten=$3
if [ "$apply" -eq 1 ]; then
  for service in ds:docservice ds:converter; do
    # supervisorctl exits nonzero for STOPPED; inspect output, not exit status.
    state=$(supervisorctl status "$service" 2>/dev/null || :)
    case "$state" in "$service"*STOPPED*) :;; *) echo "UYARI: $service STOPPED değil; silme reddedildi" >&2; exit 2;; esac
  done
fi
base=/var/lib/onlyoffice/documentserver/App_Data/cache/files
[ -d "$base" ] && [ ! -L "$base" ] || { echo 'Cache yolu doğrulanamadı' >&2; exit 2; }
for kind in data forgotten; do
  [ "$kind" != forgotten ] || [ "$forgotten" -eq 1 ] || continue
  root=$base/$kind
  [ -d "$root" ] && [ ! -L "$root" ] || { echo "Cache alt yolu doğrulanamadı: $root" >&2; exit 2; }
  # Only whole inactive session trees are eligible; fresh entries protect all old files.
  for session in "$root"/*; do
    [ -d "$session" ] && [ ! -L "$session" ] || continue
    recent=$(find "$session" ! -mtime +"$days" -print)
    links=$(find "$session" -type l -print)
    [ -z "$recent$links" ] || continue
    find "$session" -type f -mtime +"$days" -print
    if [ "$apply" -eq 1 ]; then
      find "$session" -type f -mtime +"$days" -exec rm -- {} \;
      find "$session" -depth -type d -exec sh -c 'rmdir -- "$1" 2>/dev/null || :' sh {} \;
    fi
  done
done
INNER
hours=$((DAYS*24))
if [ "$apply" -eq 1 ]; then
  docker image prune --force --filter "until=${hours}h"
  docker builder prune --force --filter "until=${hours}h"
else
  echo "DRY-RUN: Dosya silinmedi. Docker prune çalıştırılmadı (yaş >${hours}h)."
  echo 'Dangling imajlar (yaş filtresi uygulanmamış ön liste):'
  docker image ls --filter dangling=true
  echo 'Build cache özeti (kesin uygunluk prune sırasında Docker tarafından belirlenir):'
  docker system df
fi
