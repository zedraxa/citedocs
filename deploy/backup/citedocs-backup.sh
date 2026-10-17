#!/usr/bin/env bash
# ==============================================================================
# CiteDocs Production Backup Tool (citedocs-backup.sh)
# ------------------------------------------------------------------------------
# Dumps PostgreSQL database (custom format -F c) via docker compose exec and
# synchronizes S3/MinIO document & attachment buckets.
# Writes a timestamped archive (.tar.gz) with checksums and metadata to BACKUP_DIR.
# Optionally uploads to an off-server S3 bucket (BACKUP_S3_URI).
# Enforces minimum free disk space and applies retention policy (7 daily + 4 weekly).
#
# Usage:
#   citedocs-backup.sh [options]
# Options:
#   --env-file <path>        Path to .env configuration file
#   --compose-file <path>    Path to docker compose file
#   --backup-dir <path>      Directory to store backup archives
#   --min-free-mb <mb>       Minimum free disk threshold in MB (default: 2048)
#   --s3-uri <uri>           Off-server S3 destination (e.g. s3://bucket/prefix)
#   --retention-daily <n>    Number of daily backups to keep (default: 7)
#   --retention-weekly <n>   Number of weekly backups to keep (default: 4)
#   -h, --help               Show this help message
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
MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB:-2048}"
BACKUP_S3_URI="${BACKUP_S3_URI:-}"
RETENTION_DAILY="${RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${RETENTION_WEEKLY:-4}"

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

# ------------------------------------------------------------------------------
# Cleanup handler
# ------------------------------------------------------------------------------
cleanup() {
  local exit_code=$?
  if [ -n "$STAGE_DIR" ] && [ -d "$STAGE_DIR" ]; then
    rm -rf "$STAGE_DIR"
  fi
  if [ "$exit_code" -ne 0 ]; then
    log_error "Backup failed with exit code ${exit_code}."
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# ------------------------------------------------------------------------------
# Argument parsing
# ------------------------------------------------------------------------------
print_help() {
  cat << 'EOF'
CiteDocs Production Backup Tool

Usage:
  citedocs-backup.sh [options]

Options:
  --env-file <path>        Path to .env configuration file
  --compose-file <path>    Path to docker compose file
  --project-name <name>    Docker compose project name (default: citedocs)
  --backup-dir <path>      Directory to store backup archives (default: /opt/citedocs/backups)
  --min-free-mb <mb>       Minimum free disk threshold in MB (default: 2048)
  --s3-uri <uri>           Off-server S3 destination URI (e.g. s3://bucket/prefix)
  --retention-daily <n>    Number of daily backups to keep (default: 7)
  --retention-weekly <n>   Number of weekly backups to keep (default: 4)
  -h, --help               Display this help message
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --project-name|-p)
      CLI_PROJECT_NAME="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --min-free-mb)
      MIN_FREE_DISK_MB="$2"
      shift 2
      ;;
    --s3-uri)
      BACKUP_S3_URI="$2"
      shift 2
      ;;
    --retention-daily)
      RETENTION_DAILY="$2"
      shift 2
      ;;
    --retention-weekly)
      RETENTION_WEEKLY="$2"
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
if [ -z "$ENV_FILE" ]; then
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

# Refresh variables from loaded environment
if [ -n "$CLI_PROJECT_NAME" ]; then
  COMPOSE_PROJECT_NAME="$CLI_PROJECT_NAME"
fi
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
# Free disk space check
# ------------------------------------------------------------------------------
check_disk_space() {
  local target_dir="$1"
  local min_mb="$2"

  mkdir -p "$target_dir"
  local avail_kb
  avail_kb=$(df -Pk "$target_dir" | awk 'NR==2 {print $4}')
  if [ -z "$avail_kb" ]; then
    log_error "Unable to inspect disk space for directory: $target_dir"
    return 1
  fi

  local avail_mb=$((avail_kb / 1024))
  if [ "$avail_mb" -lt "$min_mb" ]; then
    log_error "Insufficient disk space on target filesystem (${avail_mb} MB available, minimum required is ${min_mb} MB)."
    log_error "Refusing to proceed with backup to protect system stability."
    return 1
  fi
  log_info "Free disk space check passed: ${avail_mb} MB available (${min_mb} MB required)."
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

  # If pointing to an internal 'minio' hostname inside Docker
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
# Retention policy manager (7 daily + 4 weekly by default)
# ------------------------------------------------------------------------------
apply_retention() {
  local dir="$1"
  local keep_daily="${2:-7}"
  local keep_weekly="${3:-4}"

  log_info "Applying backup retention in ${dir} (keep ${keep_daily} daily + ${keep_weekly} weekly)..."

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
# MAIN EXECUTION
# ------------------------------------------------------------------------------
main() {
  log_info "Starting CiteDocs automated backup..."

  # 1. Check disk threshold
  check_disk_space "$BACKUP_DIR" "$MIN_FREE_DISK_MB"

  # 2. Prepare staging directory
  STAGE_DIR=$(mktemp -d "${BACKUP_DIR}/.staging_XXXXXX")
  chmod 700 "$STAGE_DIR"
  mkdir -p "${STAGE_DIR}/storage"

  local timestamp
  timestamp=$(date +"%Y%m%d_%H%M%S")
  local archive_name="citedocs-backup-${timestamp}.tar.gz"
  local archive_path="${BACKUP_DIR}/${archive_name}"

  # 3. Dump PostgreSQL database
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

  # 4. Synchronize Object Storage Buckets
  local storage_endpoint
  storage_endpoint=$(resolve_storage_endpoint)
  log_info "Resolved storage endpoint: ${storage_endpoint:-AWS S3 Standard}"

  # Deduplicate buckets to backup
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

  # 5. Generate metadata & integrity checksums
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

  # 6. Compress staging into final backup archive
  log_info "Creating compressed archive: ${archive_path}..."
  tar -czf "$archive_path" -C "$STAGE_DIR" .
  sha256sum "$archive_path" > "${archive_path}.sha256"

  # Verify tar integrity
  tar -tzf "$archive_path" >/dev/null

  local archive_size
  archive_size=$(du -h "$archive_path" | awk '{print $1}')
  log_info "Backup archive successfully created: ${archive_name} (${archive_size})."

  # 7. Off-server S3 upload (if configured)
  if [ -n "$BACKUP_S3_URI" ]; then
    log_info "Uploading backup to off-server S3 destination: ${BACKUP_S3_URI}..."
    local remote_base="${BACKUP_S3_URI%/}"
    aws s3 cp "$archive_path" "${remote_base}/${archive_name}" --only-show-errors
    aws s3 cp "${archive_path}.sha256" "${remote_base}/${archive_name}.sha256" --only-show-errors
    log_info "Off-server S3 upload completed successfully."
  else
    log_info "BACKUP_S3_URI is unset. Skipping off-server S3 upload."
  fi

  # 8. Apply retention policy
  apply_retention "$BACKUP_DIR" "$RETENTION_DAILY" "$RETENTION_WEEKLY"

  log_info "CiteDocs backup process finished successfully."
}

main "$@"
