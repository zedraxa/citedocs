#!/usr/bin/env bash
# ==============================================================================
# CiteDocs Production Backup Tool (citedocs-backup.sh)
# ------------------------------------------------------------------------------
# Dumps PostgreSQL database (custom format -F c) via docker compose exec and
# synchronizes S3/MinIO document & attachment buckets.
# Writes a timestamped archive (.tar.gz) with checksums and metadata to BACKUP_DIR.
# Optionally uploads to an off-server S3 bucket (BACKUP_S3_URI).
# Enforces pre-staging disk space estimation (S + A + configurable disk reserve),
# bounds local staging workspaces, and applies retention policies.
#
# Usage:
#   citedocs-backup.sh [options]
# Options:
#   --env-file <path>              Path to .env configuration file
#   --compose-file <path>          Path to docker compose file
#   --project-name|-p <name>       Docker compose project name (default: citedocs)
#   --backup-dir <path>            Directory to store backup archives (default: /opt/citedocs/backups)
#   --staging-dir <path>           Directory for temporary staging workspace (default: inside backup-dir)
#   --min-free-mb <mb>             Minimum free disk threshold in MB (floor, default: 2048)
#   --disk-reserve-percent <pct>   Safety disk reserve percentage after backup (default: 20)
#   --s3-uri <uri>                 Off-server S3 destination URI (e.g. s3://bucket/prefix)
#   --retention-daily <n>          Number of daily backups to keep (default: 7)
#   --retention-weekly <n>         Number of weekly backups to keep (default: 4)
#   --keep-local-after-upload <n>  Keep fewer local copies when S3 upload succeeds (e.g. 1 or 2)
#   --estimated-objects-mb <mb>    Manual override for live objects size in MB
#   --estimated-db-mb <mb>         Manual override for database dump size in MB
#   -h, --help                     Show this help message
# ==============================================================================

set -euo pipefail
export LC_ALL=C

# ------------------------------------------------------------------------------
# Logging utilities
# ------------------------------------------------------------------------------
log_info() {
  printf '[%s] [INFO]  %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$*"
}

log_warn() {
  printf '[%s] [WARN]  %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$*" >&2
}

log_error() {
  printf '[%s] [ERROR] %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$*" >&2
}

# ------------------------------------------------------------------------------
# Default settings
# ------------------------------------------------------------------------------
ENV_FILE="${ENV_FILE:-}"
CLI_PROJECT_NAME=""
COMPOSE_FILE="${COMPOSE_FILE:-}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}"
BACKUP_DIR="${BACKUP_DIR:-/opt/citedocs/backups}"
BACKUP_STAGING_DIR="${BACKUP_STAGING_DIR:-}"
MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB:-2048}"
DISK_RESERVE_PERCENT="${DISK_RESERVE_PERCENT:-20}"
BACKUP_S3_URI="${BACKUP_S3_URI:-}"
RETENTION_DAILY="${RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${RETENTION_WEEKLY:-4}"
KEEP_LOCAL_AFTER_UPLOAD="${KEEP_LOCAL_AFTER_UPLOAD:-}"

ESTIMATED_OBJECTS_MB="${ESTIMATED_OBJECTS_MB:-}"
ESTIMATED_DB_MB="${ESTIMATED_DB_MB:-}"

# Service and database defaults
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
MINIO_SERVICE="${MINIO_SERVICE:-minio}"
POSTGRES_USER="${POSTGRES_USER:-}"
POSTGRES_DB="${POSTGRES_DB:-}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

# Storage defaults
S3_ENDPOINT="${S3_ENDPOINT:-}"
S3_BUCKET="${S3_BUCKET:-}"
S3_DOCUMENTS_BUCKET="${S3_DOCUMENTS_BUCKET:-}"
S3_ATTACHMENTS_BUCKET="${S3_ATTACHMENTS_BUCKET:-}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${S3_SECRET_KEY:-}"
S3_REGION="${S3_REGION:-}"
S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-}"

STAGE_DIR=""
CURRENT_ARCHIVE_PATH=""
export ARCHIVE_VALID=0
export BACKUP_SUCCESS=0

# ------------------------------------------------------------------------------
# Cleanup handler
# ------------------------------------------------------------------------------
cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM HUP QUIT

  if [ -n "$STAGE_DIR" ] && [ -d "$STAGE_DIR" ]; then
    rm -rf "$STAGE_DIR"
  fi

  # If backup terminated before archive was verified, clean up partial files
  if [ "$ARCHIVE_VALID" -ne 1 ] && [ -n "$CURRENT_ARCHIVE_PATH" ] && [ -f "$CURRENT_ARCHIVE_PATH" ]; then
    rm -f "$CURRENT_ARCHIVE_PATH" "${CURRENT_ARCHIVE_PATH}.sha256"
  fi

  if [ "$exit_code" -ne 0 ]; then
    log_error "Backup failed with exit code ${exit_code}."
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM HUP QUIT

# ------------------------------------------------------------------------------
# Argument parsing
# ------------------------------------------------------------------------------
print_help() {
  cat << 'EOF'
CiteDocs Production Backup Tool

Usage:
  citedocs-backup.sh [options]

Options:
  --env-file <path>              Path to .env configuration file
  --compose-file <path>          Path to docker compose file
  --project-name|-p <name>       Docker compose project name (default: citedocs)
  --backup-dir <path>            Directory to store backup archives (default: /opt/citedocs/backups)
  --staging-dir <path>           Directory for temporary staging workspace (default: inside backup-dir)
  --min-free-mb <mb>             Minimum free disk threshold in MB (default: 2048)
  --disk-reserve-percent <pct>   Safety disk reserve percentage after backup (default: 20)
  --s3-uri <uri>                 Off-server S3 destination URI (e.g. s3://bucket/prefix)
  --retention-daily <n>          Number of daily backups to keep (default: 7)
  --retention-weekly <n>         Number of weekly backups to keep (default: 4)
  --keep-local-after-upload <n>  Keep fewer local copies when S3 upload succeeds (e.g. 1 or 2)
  --estimated-objects-mb <mb>    Manual override for live objects size in MB
  --estimated-db-mb <mb>         Manual override for database dump size in MB
  -h, --help                     Display this help message
EOF
}

CLI_ENV_FILE=""
CLI_COMPOSE_FILE=""
CLI_BACKUP_DIR=""
CLI_STAGING_DIR=""
CLI_MIN_FREE_MB=""
CLI_DISK_RESERVE_PERCENT=""
CLI_S3_URI=""
CLI_RETENTION_DAILY=""
CLI_RETENTION_WEEKLY=""
CLI_KEEP_LOCAL_AFTER_UPLOAD=""
CLI_ESTIMATED_OBJECTS_MB=""
CLI_ESTIMATED_DB_MB=""

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file)
      CLI_ENV_FILE="$2"
      shift 2
      ;;
    --compose-file)
      CLI_COMPOSE_FILE="$2"
      shift 2
      ;;
    --project-name|-p)
      CLI_PROJECT_NAME="$2"
      shift 2
      ;;
    --backup-dir)
      CLI_BACKUP_DIR="$2"
      shift 2
      ;;
    --staging-dir)
      CLI_STAGING_DIR="$2"
      shift 2
      ;;
    --min-free-mb)
      CLI_MIN_FREE_MB="$2"
      shift 2
      ;;
    --disk-reserve-percent)
      CLI_DISK_RESERVE_PERCENT="$2"
      shift 2
      ;;
    --s3-uri)
      CLI_S3_URI="$2"
      shift 2
      ;;
    --retention-daily)
      CLI_RETENTION_DAILY="$2"
      shift 2
      ;;
    --retention-weekly)
      CLI_RETENTION_WEEKLY="$2"
      shift 2
      ;;
    --keep-local-after-upload)
      CLI_KEEP_LOCAL_AFTER_UPLOAD="$2"
      shift 2
      ;;
    --estimated-objects-mb)
      CLI_ESTIMATED_OBJECTS_MB="$2"
      shift 2
      ;;
    --estimated-db-mb)
      CLI_ESTIMATED_DB_MB="$2"
      shift 2
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      print_help
      exit 1
      ;;
  esac
done

# ------------------------------------------------------------------------------
# Load environment configuration (.env)
# ------------------------------------------------------------------------------
load_env_file() {
  local file="$1"
  if [ -f "$file" ]; then
    log_info "Loading configuration from: $file"
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line#"${line%%[![:space:]]*}"}"
      if [[ -z "$line" || "$line" =~ ^# ]]; then
        continue
      fi
      line="${line#export }"
      if [[ "$line" == *=* ]]; then
        local key="${line%%=*}"
        local val="${line#*=}"
        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"
        if [[ "$val" =~ ^\"(.*)\"$ ]]; then
          val="${BASH_REMATCH[1]}"
        elif [[ "$val" =~ ^\'(.*)\'$ ]]; then
          val="${BASH_REMATCH[1]}"
        fi
        export "$key"="$val"
      fi
    done < "$file"
  fi
}

# Auto-discover .env if not specified
if [ -n "$CLI_ENV_FILE" ]; then
  ENV_FILE="$CLI_ENV_FILE"
elif [ -z "$ENV_FILE" ]; then
  if [ -f "/opt/citedocs/.env" ]; then
    ENV_FILE="/opt/citedocs/.env"
  elif [ -f "./.env" ]; then
    ENV_FILE="./.env"
  elif [ -f "../../.env" ]; then
    ENV_FILE="../../.env"
  fi
fi

if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  load_env_file "$ENV_FILE"
fi

# Apply CLI overrides (CLI flags take precedence over .env file)
[ -n "$CLI_COMPOSE_FILE" ] && COMPOSE_FILE="$CLI_COMPOSE_FILE"
[ -n "$CLI_PROJECT_NAME" ] && COMPOSE_PROJECT_NAME="$CLI_PROJECT_NAME"
[ -n "$CLI_BACKUP_DIR" ] && BACKUP_DIR="$CLI_BACKUP_DIR"
[ -n "$CLI_STAGING_DIR" ] && BACKUP_STAGING_DIR="$CLI_STAGING_DIR"
[ -n "$CLI_MIN_FREE_MB" ] && MIN_FREE_DISK_MB="$CLI_MIN_FREE_MB"
[ -n "$CLI_DISK_RESERVE_PERCENT" ] && DISK_RESERVE_PERCENT="$CLI_DISK_RESERVE_PERCENT"
[ -n "$CLI_S3_URI" ] && BACKUP_S3_URI="$CLI_S3_URI"
[ -n "$CLI_RETENTION_DAILY" ] && RETENTION_DAILY="$CLI_RETENTION_DAILY"
[ -n "$CLI_RETENTION_WEEKLY" ] && RETENTION_WEEKLY="$CLI_RETENTION_WEEKLY"
[ -n "$CLI_KEEP_LOCAL_AFTER_UPLOAD" ] && KEEP_LOCAL_AFTER_UPLOAD="$CLI_KEEP_LOCAL_AFTER_UPLOAD"
[ -n "$CLI_ESTIMATED_OBJECTS_MB" ] && ESTIMATED_OBJECTS_MB="$CLI_ESTIMATED_OBJECTS_MB"
[ -n "$CLI_ESTIMATED_DB_MB" ] && ESTIMATED_DB_MB="$CLI_ESTIMATED_DB_MB"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-citedocs}"
POSTGRES_USER="${POSTGRES_USER:-citedocs}"
POSTGRES_DB="${POSTGRES_DB:-citedocs}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
S3_ENDPOINT="${S3_ENDPOINT:-}"
S3_BUCKET="${S3_BUCKET:-citedocs-attachments}"
S3_DOCUMENTS_BUCKET="${S3_DOCUMENTS_BUCKET:-$S3_BUCKET}"
S3_ATTACHMENTS_BUCKET="${S3_ATTACHMENTS_BUCKET:-$S3_BUCKET}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-${AWS_ACCESS_KEY_ID:-${MINIO_ROOT_USER:-}}}"
S3_SECRET_KEY="${S3_SECRET_KEY:-${AWS_SECRET_ACCESS_KEY:-${MINIO_ROOT_PASSWORD:-}}}"
S3_REGION="${S3_REGION:-${AWS_REGION:-us-east-1}}"
S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}"

# ------------------------------------------------------------------------------
# Docker Compose command resolution
# ------------------------------------------------------------------------------
if [ -z "$COMPOSE_FILE" ]; then
  if [ -f "deploy/docker-compose.prod.onlyoffice.yml" ]; then
    COMPOSE_FILE="deploy/docker-compose.prod.onlyoffice.yml"
  elif [ -f "/opt/citedocs/deploy/docker-compose.prod.onlyoffice.yml" ]; then
    COMPOSE_FILE="/opt/citedocs/deploy/docker-compose.prod.onlyoffice.yml"
  elif [ -f "deploy/docker-compose.prod.yml" ]; then
    COMPOSE_FILE="deploy/docker-compose.prod.yml"
  elif [ -f "docker-compose.yml" ]; then
    COMPOSE_FILE="docker-compose.yml"
  fi
fi

COMPOSE_ARGS=()
if [ -n "$COMPOSE_FILE" ] && [ -f "$COMPOSE_FILE" ]; then
  COMPOSE_ARGS+=(-f "$COMPOSE_FILE")
fi
if [ -n "$COMPOSE_PROJECT_NAME" ]; then
  COMPOSE_ARGS+=(-p "$COMPOSE_PROJECT_NAME")
fi

run_compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

# ------------------------------------------------------------------------------
# Storage endpoint resolution (Docker container IP vs host vs AWS)
# ------------------------------------------------------------------------------
resolve_storage_endpoint() {
  local endpoint="${S3_ENDPOINT:-}"
  if [ -z "$endpoint" ]; then
    echo ""
    return 0
  fi

  if echo "$endpoint" | grep -qE "://(minio)(:[0-9]+)?(/|$)"; then
    local container_id
    container_id=$(run_compose ps -q "$MINIO_SERVICE" 2>/dev/null || true)
    if [ -n "$container_id" ]; then
      local host_port
      host_port=$(docker port "$container_id" 9000 2>/dev/null | head -n1 | awk -F: '{print $NF}')
      if [ -n "$host_port" ]; then
        echo "http://127.0.0.1:${host_port}"
        return 0
      fi

      local container_ip
      container_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container_id" 2>/dev/null || true)
      if [ -n "$container_ip" ]; then
        local port
        port=$(echo "$endpoint" | awk -F: '{print $NF}' | tr -d '/')
        [ -z "$port" ] && port="9000"
        echo "http://${container_ip}:${port}"
        return 0
      fi
    fi
  fi

  echo "$endpoint"
}

# ------------------------------------------------------------------------------
# Stale staging & partial archive cleanup (bounded to backup directories only)
# ------------------------------------------------------------------------------
clean_stale_staging_and_partials() {
  local target_dirs=("$BACKUP_DIR")
  if [ -n "$BACKUP_STAGING_DIR" ] && [ "$BACKUP_STAGING_DIR" != "$BACKUP_DIR" ]; then
    target_dirs+=("$BACKUP_STAGING_DIR")
  fi

  for dir in "${target_dirs[@]}"; do
    if [ ! -d "$dir" ]; then
      continue
    fi

    # Security guard: never clean root or broad system directories
    case "$dir" in
      /|/opt|/usr|/var|/home|/root|/etc|/tmp)
        log_warn "Refusing to run stale cleanup on root/system path: $dir"
        continue
        ;;
    esac

    # 1. Clean stale staging directories from interrupted prior runs
    while IFS= read -r stale_dir; do
      if [ -n "$stale_dir" ] && [ -d "$stale_dir" ]; then
        log_warn "Cleaning stale staging workspace from earlier run: $(basename "$stale_dir")"
        rm -rf "$stale_dir"
      fi
    done < <(find "$dir" -maxdepth 1 -mindepth 1 -type d \( -name ".staging_*" -o -name "staging_*" -o -name ".staging.*" \) 2>/dev/null || true)

    # 2. Clean temporary/partial archive files (*.tmp, *.part, *.partial)
    while IFS= read -r part_file; do
      if [ -n "$part_file" ] && [ -f "$part_file" ]; then
        log_warn "Cleaning stale partial archive file from earlier run: $(basename "$part_file")"
        rm -f "$part_file"
      fi
    done < <(find "$dir" -maxdepth 1 -mindepth 1 -type f \( -name "citedocs-backup-*.tmp*" -o -name "citedocs-backup-*.part*" -o -name "citedocs-backup-*.partial*" -o -name "*.tar.gz.tmp" -o -name "*.tar.gz.part" \) 2>/dev/null || true)

    # 3. Clean broken/truncated archives (0-byte or corrupted archives left by killed runs)
    while IFS= read -r arch_file; do
      if [ -n "$arch_file" ] && [ -f "$arch_file" ]; then
        if ! tar -tzf "$arch_file" >/dev/null 2>&1; then
          log_warn "Cleaning corrupted/truncated archive from earlier run: $(basename "$arch_file")"
          rm -f "$arch_file" "${arch_file}.sha256"
        fi
      fi
    done < <(find "$dir" -maxdepth 1 -mindepth 1 -type f -name "citedocs-backup-*.tar.gz" 2>/dev/null || true)
  done
}

# ------------------------------------------------------------------------------
# Pre-staging Space Estimation & Disk Capacity Check
# ------------------------------------------------------------------------------
estimate_live_objects_kb() {
  if [ -n "$ESTIMATED_OBJECTS_MB" ]; then
    echo $((ESTIMATED_OBJECTS_MB * 1024))
    return 0
  fi

  local total_bytes=0
  local storage_endpoint
  storage_endpoint=$(resolve_storage_endpoint)

  local buckets_to_check=()
  for b in "$S3_DOCUMENTS_BUCKET" "$S3_ATTACHMENTS_BUCKET"; do
    if [ -n "$b" ]; then
      local found=0
      for existing in "${buckets_to_check[@]:-}"; do
        if [ "$existing" = "$b" ]; then
          found=1
          break
        fi
      done
      [ "$found" -eq 0 ] && buckets_to_check+=("$b")
    fi
  done
  [ "${#buckets_to_check[@]}" -eq 0 ] && buckets_to_check+=("citedocs-attachments")

  for b in "${buckets_to_check[@]}"; do
    local b_bytes=0
    if command -v aws >/dev/null 2>&1; then
      local extra_args=()
      [ -n "$storage_endpoint" ] && extra_args+=(--endpoint-url "$storage_endpoint")
      local summary=""
      summary=$(AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" AWS_DEFAULT_REGION="$S3_REGION" \
        aws "${extra_args[@]}" s3 ls --summarize --recursive "s3://${b}" 2>/dev/null || true)
      if [ -n "$summary" ]; then
        local sz
        sz=$(echo "$summary" | grep -i "Total Size:" | awk '{print $NF}' | tr -d '\r')
        if [[ "$sz" =~ ^[0-9]+$ ]]; then
          b_bytes="$sz"
        fi
      fi
    fi

    if [ "$b_bytes" -le 0 ]; then
      local minio_cid
      minio_cid=$(run_compose ps -q "$MINIO_SERVICE" 2>/dev/null || true)
      if [ -n "$minio_cid" ]; then
        local du_out
        du_out=$(docker exec "$minio_cid" du -sk "/data/${b}" 2>/dev/null || true)
        if [ -n "$du_out" ]; then
          local du_kb
          du_kb=$(echo "$du_out" | awk '{print $1}')
          if [[ "$du_kb" =~ ^[0-9]+$ ]]; then
            b_bytes=$((du_kb * 1024))
          fi
        fi
      fi
    fi
    total_bytes=$((total_bytes + b_bytes))
  done

  echo $(( (total_bytes + 1023) / 1024 ))
}

estimate_db_dump_kb() {
  if [ -n "$ESTIMATED_DB_MB" ]; then
    echo $((ESTIMATED_DB_MB * 1024))
    return 0
  fi

  local db_bytes=0
  local pg_cid
  pg_cid=$(run_compose ps -q "$POSTGRES_SERVICE" 2>/dev/null || true)
  if [ -n "$pg_cid" ]; then
    local pg_env=()
    [ -n "$POSTGRES_PASSWORD" ] && pg_env=(-e "PGPASSWORD=${POSTGRES_PASSWORD}")
    local query_out
    query_out=$(run_compose exec -T "${pg_env[@]}" "$POSTGRES_SERVICE" \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT pg_database_size('$POSTGRES_DB');" 2>/dev/null || true)
    if [[ "$query_out" =~ ^[0-9]+$ ]]; then
      db_bytes="$query_out"
    fi
  fi

  echo $(( (db_bytes + 1023) / 1024 ))
}

check_disk_space() {
  local target_dir="${1:-$BACKUP_DIR}"
  local min_mb="${2:-$MIN_FREE_DISK_MB}"

  local staging_base="${BACKUP_STAGING_DIR:-$target_dir}"
  mkdir -p "$staging_base"
  mkdir -p "$target_dir"

  local est_objects_kb est_db_kb
  est_objects_kb=$(estimate_live_objects_kb)
  est_db_kb=$(estimate_db_dump_kb)

  local s_kb=$((est_objects_kb + est_db_kb))
  # Archive size A is estimated equal to staging S (DOCX, PDF and pg_dump -F c are already compressed)
  local a_kb=$s_kb

  local s_mb=$(( (s_kb + 1023) / 1024 ))
  local a_mb=$(( (a_kb + 1023) / 1024 ))

  local staging_fs archive_fs
  staging_fs=$(df -Pk "$staging_base" | awk 'NR==2 {print $1}')
  archive_fs=$(df -Pk "$target_dir" | awk 'NR==2 {print $1}')

  local floor_kb=$((min_mb * 1024))

  if [ "$staging_fs" = "$archive_fs" ]; then
    local total_kb avail_kb
    total_kb=$(df -Pk "$target_dir" | awk 'NR==2 {print $2}')
    avail_kb=$(df -Pk "$target_dir" | awk 'NR==2 {print $4}')

    if [ -z "$avail_kb" ] || [ -z "$total_kb" ]; then
      log_error "Unable to inspect disk space for directory: $target_dir"
      return 1
    fi

    local reserve_kb=$(( (total_kb * DISK_RESERVE_PERCENT) / 100 ))
    local needed_kb=$(( s_kb + a_kb + reserve_kb ))
    local required_kb=$needed_kb
    if [ "$floor_kb" -gt "$required_kb" ]; then
      required_kb="$floor_kb"
    fi

    local avail_mb=$((avail_kb / 1024))
    local required_mb=$(( (required_kb + 1023) / 1024 ))
    local reserve_mb=$((reserve_kb / 1024))

    if [ "$avail_kb" -lt "$required_kb" ]; then
      log_error "Insufficient disk space on target filesystem (${target_dir}): ${avail_mb} MB available, ${required_mb} MB required."
      log_error "Calculation breakdown: staging S=${s_mb} MB + archive A=${a_mb} MB + ${DISK_RESERVE_PERCENT}% disk reserve=${reserve_mb} MB (floor MIN_FREE_DISK_MB=${min_mb} MB)."
      log_error "Refusing to proceed with backup to protect system stability."
      return 1
    fi
    log_info "Free disk space check passed: ${avail_mb} MB available (required: ${required_mb} MB = S:${s_mb}MB + A:${a_mb}MB + reserve:${reserve_mb}MB [${DISK_RESERVE_PERCENT}%], floor:${min_mb}MB)."
  else
    # Separate staging and archive filesystems
    local s_total_kb s_avail_kb
    s_total_kb=$(df -Pk "$staging_base" | awk 'NR==2 {print $2}')
    s_avail_kb=$(df -Pk "$staging_base" | awk 'NR==2 {print $4}')
    local s_reserve_kb=$(( (s_total_kb * DISK_RESERVE_PERCENT) / 100 ))
    local s_needed_kb=$(( s_kb + s_reserve_kb ))
    local s_required_kb=$s_needed_kb
    [ "$floor_kb" -gt "$s_required_kb" ] && s_required_kb="$floor_kb"

    local s_avail_mb=$((s_avail_kb / 1024))
    local s_required_mb=$(( (s_required_kb + 1023) / 1024 ))
    local s_reserve_mb=$((s_reserve_kb / 1024))

    if [ "$s_avail_kb" -lt "$s_required_kb" ]; then
      log_error "Insufficient disk space on staging filesystem (${staging_base}): ${s_avail_mb} MB available, ${s_required_mb} MB required."
      log_error "Calculation breakdown: staging S=${s_mb} MB + ${DISK_RESERVE_PERCENT}% disk reserve=${s_reserve_mb} MB (floor MIN_FREE_DISK_MB=${min_mb} MB)."
      log_error "Refusing to proceed with backup to protect system stability."
      return 1
    fi

    local a_total_kb a_avail_kb
    a_total_kb=$(df -Pk "$target_dir" | awk 'NR==2 {print $2}')
    a_avail_kb=$(df -Pk "$target_dir" | awk 'NR==2 {print $4}')
    local a_reserve_kb=$(( (a_total_kb * DISK_RESERVE_PERCENT) / 100 ))
    local a_needed_kb=$(( a_kb + a_reserve_kb ))
    local a_required_kb=$a_needed_kb
    [ "$floor_kb" -gt "$a_required_kb" ] && a_required_kb="$floor_kb"

    local a_avail_mb=$((a_avail_kb / 1024))
    local a_required_mb=$(( (a_required_kb + 1023) / 1024 ))
    local a_reserve_mb=$((a_reserve_kb / 1024))

    if [ "$a_avail_kb" -lt "$a_required_kb" ]; then
      log_error "Insufficient disk space on archive filesystem (${target_dir}): ${a_avail_mb} MB available, ${a_required_mb} MB required."
      log_error "Calculation breakdown: archive A=${a_mb} MB + ${DISK_RESERVE_PERCENT}% disk reserve=${a_reserve_mb} MB (floor MIN_FREE_DISK_MB=${min_mb} MB)."
      log_error "Refusing to proceed with backup to protect system stability."
      return 1
    fi

    log_info "Free disk space check passed on staging (${s_avail_mb} MB avail) and archive (${a_avail_mb} MB avail) filesystems."
  fi
}

# ------------------------------------------------------------------------------
# Mirror a single storage bucket to destination directory
# ------------------------------------------------------------------------------
backup_bucket() {
  local bucket="$1"
  local dest_dir="$2"
  local endpoint="$3"

  mkdir -p "$dest_dir"

  # Case 1: AWS CLI available
  if command -v aws >/dev/null 2>&1; then
    local extra_args=()
    if [ -n "$endpoint" ]; then
      extra_args+=(--endpoint-url "$endpoint")
    fi

    local sync_status=0
    AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
    AWS_DEFAULT_REGION="$S3_REGION" \
    aws "${extra_args[@]}" s3 sync "s3://${bucket}" "$dest_dir" --only-show-errors || sync_status=$?

    if [ "$sync_status" -ne 0 ]; then
      # If bucket is empty or not yet created, tolerate with warning
      log_warn "Bucket s3://${bucket} sync reported non-zero (${sync_status}). Verifying if empty."
      local ls_out=""
      ls_out=$(AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" AWS_DEFAULT_REGION="$S3_REGION" aws "${extra_args[@]}" s3 ls "s3://${bucket}" 2>&1 || true)
      if echo "$ls_out" | grep -qE "NoSuchBucket|does not exist"; then
        log_warn "Bucket s3://${bucket} does not exist yet. Created empty backup folder."
        return 0
      fi
      log_error "Failed to synchronize bucket s3://${bucket}."
      return 1
    fi
    return 0
  fi

  # Case 2: mc available on host
  if command -v mc >/dev/null 2>&1 && [ -n "$endpoint" ]; then
    local mc_cfg
    mc_cfg=$(mktemp -d)
    local alias_name="citedocs_src_${RANDOM}"
    mc --config-dir "$mc_cfg" --quiet alias set "$alias_name" "$endpoint" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null 2>&1
    mc --config-dir "$mc_cfg" --quiet mirror --overwrite "${alias_name}/${bucket}" "$dest_dir" || true
    rm -rf "$mc_cfg"
    return 0
  fi

  # Case 3: Docker-based mc fallback using minio container image
  local minio_cid
  minio_cid=$(run_compose ps -q "$MINIO_SERVICE" 2>/dev/null || true)
  if [ -n "$minio_cid" ]; then
    local minio_img
    minio_img=$(docker inspect -f '{{.Config.Image}}' "$minio_cid" 2>/dev/null || echo "pgsty/minio:latest")
    local net_name
    net_name=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$minio_cid" 2>/dev/null || echo "${COMPOSE_PROJECT_NAME}_default")

    docker run --rm \
      --network "$net_name" \
      -v "${dest_dir}:/backup_target" \
      --entrypoint sh "$minio_img" -c "
        mc --quiet alias set src http://${MINIO_SERVICE}:9000 '$S3_ACCESS_KEY' '$S3_SECRET_KEY' >/dev/null 2>&1
        mc --quiet mirror --overwrite 'src/${bucket}' /backup_target 2>/dev/null || true
      " || true
    return 0
  fi

  log_error "No S3 sync tool available (neither 'aws', 'mc', nor running MinIO Docker container)."
  return 1
}

# ------------------------------------------------------------------------------
# Standard Retention Policy Manager (daily + weekly)
# ------------------------------------------------------------------------------
apply_retention() {
  local dir="$1"
  local keep_daily="${2:-7}"
  local keep_weekly="${3:-4}"

  log_info "Applying standard backup retention in ${dir} (keep ${keep_daily} daily + ${keep_weekly} weekly)..."

  local files=()
  while IFS= read -r f; do
    [ -n "$f" ] && files+=("$f")
  done < <(find "$dir" -maxdepth 1 -name "citedocs-backup-*.tar.gz" | sort -r)

  if [ "${#files[@]}" -eq 0 ]; then
    log_info "No previous backup archives found to prune."
    return 0
  fi

  declare -A keep_files=()
  declare -A seen_daily=()
  declare -A seen_weekly=()
  local daily_count=0
  local weekly_count=0

  for f in "${files[@]}"; do
    local base
    base=$(basename "$f")
    local date_part
    date_part=$(echo "$base" | sed -E 's/citedocs-backup-([0-9]{8})_.*/\1/')
    if [ -z "$date_part" ] || [ "${#date_part}" -ne 8 ]; then
      continue
    fi

    local year="${date_part:0:4}"
    local month="${date_part:4:2}"
    local day="${date_part:6:2}"
    local week_num
    week_num=$(date -d "${year}-${month}-${day}" +%G-W%V 2>/dev/null || echo "${year}-${month}")

    # Daily bucket
    if [ -z "${seen_daily[$date_part]:-}" ]; then
      seen_daily[$date_part]=1
      if [ "$daily_count" -lt "$keep_daily" ]; then
        keep_files["$f"]=1
        ((daily_count++)) || true
      fi
    fi

    # Weekly bucket
    if [ -z "${seen_weekly[$week_num]:-}" ]; then
      seen_weekly[$week_num]=1
      if [ "$weekly_count" -lt "$keep_weekly" ]; then
        keep_files["$f"]=1
        ((weekly_count++)) || true
      fi
    fi
  done

  local pruned_count=0
  for f in "${files[@]}"; do
    if [ -z "${keep_files["$f"]:-}" ]; then
      log_info "Retention pruning expired archive: $(basename "$f")"
      rm -f "$f" "${f}.sha256"
      ((pruned_count++)) || true
    fi
  done
  log_info "Retention completed. ${pruned_count} archives pruned, $((${#files[@]} - pruned_count)) retained."
}

# ------------------------------------------------------------------------------
# Post-Upload Reduced Retention Manager (when offsite S3 upload succeeded)
# ------------------------------------------------------------------------------
apply_upload_retention() {
  local dir="$1"
  local keep_count="$2"

  log_info "Off-server S3 upload succeeded. Applying post-upload local retention (keeping ${keep_count} most recent local archives)..."

  local files=()
  while IFS= read -r f; do
    [ -n "$f" ] && files+=("$f")
  done < <(find "$dir" -maxdepth 1 -name "citedocs-backup-*.tar.gz" | sort -r)

  if [ "${#files[@]}" -le "$keep_count" ]; then
    log_info "Found ${#files[@]} local archives (<= ${keep_count}). No archives to prune."
    return 0
  fi

  local pruned_count=0
  local idx=0
  for f in "${files[@]}"; do
    if [ "$idx" -ge "$keep_count" ]; then
      log_info "Post-upload retention pruning local archive: $(basename "$f")"
      rm -f "$f" "${f}.sha256"
      ((pruned_count++)) || true
    fi
    ((idx++)) || true
  done

  log_info "Post-upload retention complete. ${pruned_count} local archives pruned, ${keep_count} retained."
}

# ------------------------------------------------------------------------------
# MAIN EXECUTION
# ------------------------------------------------------------------------------
main() {
  local start_seconds
  start_seconds=$(date +%s)

  log_info "Starting CiteDocs automated backup..."

  # 1. Detect and clean stale staging directories and partial archives from prior runs
  clean_stale_staging_and_partials

  # 2. Check disk space before staging (estimating live objects + DB dump S plus archive A plus reserve)
  check_disk_space "$BACKUP_DIR" "$MIN_FREE_DISK_MB"

  # 3. Prepare staging workspace
  local staging_base="${BACKUP_STAGING_DIR:-$BACKUP_DIR}"
  mkdir -p "$staging_base"
  STAGE_DIR=$(mktemp -d "${staging_base}/.staging_XXXXXX")
  chmod 700 "$STAGE_DIR"
  mkdir -p "${STAGE_DIR}/storage"

  local timestamp
  timestamp=$(date +"%Y%m%d_%H%M%S")
  local archive_name="citedocs-backup-${timestamp}.tar.gz"
  local archive_path="${BACKUP_DIR}/${archive_name}"
  CURRENT_ARCHIVE_PATH="$archive_path"

  # 4. Dump PostgreSQL database
  log_info "Dumping PostgreSQL database '${POSTGRES_DB}' via service '${POSTGRES_SERVICE}'..."
  local dump_file="${STAGE_DIR}/postgres.dump"

  local pg_env=()
  if [ -n "$POSTGRES_PASSWORD" ]; then
    pg_env=(-e "PGPASSWORD=${POSTGRES_PASSWORD}")
  fi

  run_compose exec -T "${pg_env[@]}" "$POSTGRES_SERVICE" \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c > "$dump_file"

  if [ ! -s "$dump_file" ]; then
    log_error "PostgreSQL pg_dump produced an empty or missing dump file."
    return 1
  fi
  local dump_size
  dump_size=$(du -h "$dump_file" | awk '{print $1}')
  log_info "PostgreSQL dump completed successfully (${dump_size})."

  # 5. Synchronize Object Storage Buckets
  local storage_endpoint
  storage_endpoint=$(resolve_storage_endpoint)
  log_info "Resolved storage endpoint: ${storage_endpoint:-AWS S3 Standard}"

  local buckets_to_backup=()
  for b in "$S3_DOCUMENTS_BUCKET" "$S3_ATTACHMENTS_BUCKET"; do
    if [ -n "$b" ]; then
      local exists=0
      for existing in "${buckets_to_backup[@]:-}"; do
        if [ "$existing" = "$b" ]; then
          exists=1
          break
        fi
      done
      if [ "$exists" -eq 0 ]; then
        buckets_to_backup+=("$b")
      fi
    fi
  done

  if [ "${#buckets_to_backup[@]}" -eq 0 ]; then
    buckets_to_backup+=("citedocs-attachments")
  fi

  local total_objects=0
  for b in "${buckets_to_backup[@]}"; do
    log_info "Synchronizing bucket '${b}'..."
    backup_bucket "$b" "${STAGE_DIR}/storage/${b}" "$storage_endpoint"
    local b_count
    b_count=$(find "${STAGE_DIR}/storage/${b}" -type f | wc -l)
    total_objects=$((total_objects + b_count))
    log_info "Bucket '${b}' synchronized (${b_count} objects)."
  done

  local storage_size
  storage_size=$(du -sh "${STAGE_DIR}/storage" | awk '{print $1}')
  log_info "Object storage backup completed: ${total_objects} total objects (${storage_size})."

  # 6. Generate metadata & integrity checksums
  local git_sha="unknown"
  if command -v git >/dev/null 2>&1; then
    git_sha=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  fi

  cat << EOF > "${STAGE_DIR}/metadata.json"
{
  "timestamp": "${timestamp}",
  "backup_version": "1.0",
  "git_commit": "${git_sha}",
  "database": {
    "service": "${POSTGRES_SERVICE}",
    "db": "${POSTGRES_DB}",
    "user": "${POSTGRES_USER}",
    "dump_file": "postgres.dump",
    "dump_format": "custom",
    "dump_size": "${dump_size}"
  },
  "storage": {
    "endpoint": "${storage_endpoint}",
    "buckets": $(printf '%s\n' "${buckets_to_backup[@]}" | jq -R . | jq -s . 2>/dev/null || echo '[]'),
    "total_objects": ${total_objects},
    "storage_size": "${storage_size}"
  }
}
EOF

  log_info "Generating cryptographic checksums (SHA-256)..."
  (
    cd "$STAGE_DIR"
    find . -type f ! -name "sha256sums.txt" -print0 | sort -z | xargs -0 sha256sum > sha256sums.txt
  )

  # 7. Compress staging into final backup archive
  log_info "Creating compressed archive: ${archive_path}..."
  tar -czf "$archive_path" -C "$STAGE_DIR" .
  sha256sum "$archive_path" > "${archive_path}.sha256"

  # Verify tar integrity
  tar -tzf "$archive_path" >/dev/null
  ARCHIVE_VALID=1

  # Immediately remove staging workspace to free staging space S
  rm -rf "$STAGE_DIR"
  STAGE_DIR=""
  log_info "Staging workspace cleaned up."

  local archive_size_human archive_size_bytes
  archive_size_human=$(du -h "$archive_path" | awk '{print $1}')
  archive_size_bytes=$(wc -c < "$archive_path" | tr -d '[:space:]')
  log_info "Backup archive successfully created: ${archive_name} (${archive_size_human} / ${archive_size_bytes} bytes)."

  # 8. Off-server S3 upload (if configured)
  local s3_uploaded=0
  if [ -n "$BACKUP_S3_URI" ]; then
    log_info "Uploading backup to off-server S3 destination: ${BACKUP_S3_URI}..."
    local remote_base="${BACKUP_S3_URI%/}"
    aws s3 cp "$archive_path" "${remote_base}/${archive_name}" --only-show-errors
    aws s3 cp "${archive_path}.sha256" "${remote_base}/${archive_name}.sha256" --only-show-errors
    log_info "Off-server S3 upload completed successfully."
    s3_uploaded=1
  else
    log_info "BACKUP_S3_URI is unset. Skipping off-server S3 upload."
  fi

  # 9. Apply retention policy
  if [ "$s3_uploaded" -eq 1 ] && [ -n "$KEEP_LOCAL_AFTER_UPLOAD" ]; then
    apply_upload_retention "$BACKUP_DIR" "$KEEP_LOCAL_AFTER_UPLOAD"
  else
    apply_retention "$BACKUP_DIR" "$RETENTION_DAILY" "$RETENTION_WEEKLY"
  fi

  local end_seconds duration_seconds
  end_seconds=$(date +%s)
  duration_seconds=$((end_seconds - start_seconds))
  BACKUP_SUCCESS=1
  log_info "CiteDocs backup process finished successfully in ${duration_seconds}s (archive: ${archive_name}, size: ${archive_size_human} / ${archive_size_bytes} bytes)."
}

main "$@"
