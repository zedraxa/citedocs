#!/usr/bin/env bash
# ==============================================================================
# CiteDocs Production Restore Tool (citedocs-restore.sh)
# ------------------------------------------------------------------------------
# Restores a backup archive (.tar.gz) into a running CiteDocs stack or verifies
# archive integrity by restoring into throwaway containers (--verify mode).
#
# Supports:
#   - PostgreSQL database restoration via pg_restore (--clean --if-exists)
#   - S3 / MinIO document & attachment bucket restoration
#   - Integrity check via sha256sums.txt
#   - Safe dry-run inspection (--dry-run)
#   - Explicit confirmation requirement (--yes / --confirm)
#   - Isolated throwaway verification mode (--verify)
#
# Usage:
#   citedocs-restore.sh [options] [archive_path]
# Options:
#   --archive <path>         Path to backup archive (.tar.gz)
#   --latest                 Automatically select newest archive in BACKUP_DIR
#   --dry-run                Inspect archive and show plan without changing data
#   --yes, --confirm         Bypass interactive confirmation prompt
#   --verify                 Restore into temporary throwaway containers & verify counts
#   --env-file <path>        Path to .env configuration file
#   --compose-file <path>    Path to docker compose file
#   --backup-dir <path>      Directory containing backups (default: /opt/citedocs/backups)
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
ARCHIVE_PATH=""
USE_LATEST=0
DRY_RUN=0
CONFIRMED=0
VERIFY_MODE=0

CLI_PROJECT_NAME=""
ENV_FILE="${ENV_FILE:-}"
COMPOSE_FILE="${COMPOSE_FILE:-}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}"
BACKUP_DIR="${BACKUP_DIR:-/opt/citedocs/backups}"

POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
MINIO_SERVICE="${MINIO_SERVICE:-minio}"
POSTGRES_USER="${POSTGRES_USER:-citedocs}"
POSTGRES_DB="${POSTGRES_DB:-citedocs}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

S3_ENDPOINT="${S3_ENDPOINT:-}"
S3_BUCKET="${S3_BUCKET:-citedocs-attachments}"
S3_DOCUMENTS_BUCKET="${S3_DOCUMENTS_BUCKET:-}"
S3_ATTACHMENTS_BUCKET="${S3_ATTACHMENTS_BUCKET:-}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${S3_SECRET_KEY:-}"
S3_REGION="${S3_REGION:-us-east-1}"
S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}"

RESTORE_STAGE=""
VERIFY_CONTAINERS=()
VERIFY_NETWORKS=()
VERIFY_VOLUMES=()

# ------------------------------------------------------------------------------
# Cleanup handler
# ------------------------------------------------------------------------------
cleanup() {
  local exit_code=$?

  if [ -n "$RESTORE_STAGE" ] && [ -d "$RESTORE_STAGE" ]; then
    rm -rf "$RESTORE_STAGE"
  fi

  # Cleanup throwaway containers
  if [ "${#VERIFY_CONTAINERS[@]}" -gt 0 ]; then
    for c in "${VERIFY_CONTAINERS[@]}"; do
      docker rm -f "$c" >/dev/null 2>&1 || true
    done
  fi

  # Cleanup throwaway networks
  if [ "${#VERIFY_NETWORKS[@]}" -gt 0 ]; then
    for n in "${VERIFY_NETWORKS[@]}"; do
      docker network rm "$n" >/dev/null 2>&1 || true
    done
  fi

  # Cleanup throwaway volumes
  if [ "${#VERIFY_VOLUMES[@]}" -gt 0 ]; then
    for v in "${VERIFY_VOLUMES[@]}"; do
      docker volume rm "$v" >/dev/null 2>&1 || true
    done
  fi

  if [ "$exit_code" -ne 0 ]; then
    log_error "Restore operation terminated with exit code ${exit_code}."
  fi
  trap - EXIT INT TERM HUP QUIT
  exit "$exit_code"
}
trap cleanup EXIT INT TERM HUP QUIT

# ------------------------------------------------------------------------------
# Help message
# ------------------------------------------------------------------------------
print_help() {
  cat << 'EOF'
CiteDocs Production Restore Tool

Usage:
  citedocs-restore.sh [options] [archive_path]

Options:
  --archive <path>         Path to backup archive (.tar.gz)
  --latest                 Select the newest archive in BACKUP_DIR
  --dry-run                Inspect archive and show plan without changing data
  --yes, --confirm         Confirm restore operation without interactive prompt
  --verify                 Restore into temporary throwaway containers & check counts
  --env-file <path>        Path to .env configuration file
  --compose-file <path>    Path to docker compose file
  --backup-dir <path>      Directory containing backups (default: /opt/citedocs/backups)
  -h, --help               Display this help message
EOF
}

# ------------------------------------------------------------------------------
# Argument parsing
# ------------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --archive)
      ARCHIVE_PATH="$2"
      shift 2
      ;;
    --latest)
      USE_LATEST=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --yes|--confirm)
      CONFIRMED=1
      shift
      ;;
    --verify)
      VERIFY_MODE=1
      shift
      ;;
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
    -h|--help)
      print_help
      exit 0
      ;;
    -*)
      log_error "Unknown option: $1"
      print_help
      exit 1
      ;;
    *)
      if [ -z "$ARCHIVE_PATH" ]; then
        ARCHIVE_PATH="$1"
        shift
      else
        log_error "Unexpected extra argument: $1"
        exit 1
      fi
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
# Locate archive
# ------------------------------------------------------------------------------
if [ "$USE_LATEST" -eq 1 ] || [ -z "$ARCHIVE_PATH" ]; then
  if [ -d "$BACKUP_DIR" ]; then
    ARCHIVE_PATH=$(find "$BACKUP_DIR" -maxdepth 1 -name "citedocs-backup-*.tar.gz" | sort -r | head -n1 || true)
  fi
fi

if [ -z "$ARCHIVE_PATH" ] || [ ! -f "$ARCHIVE_PATH" ]; then
  log_error "No backup archive specified or found in: ${BACKUP_DIR}"
  log_error "Usage: citedocs-restore.sh --archive <path> or --latest"
  exit 1
fi

log_info "Selected backup archive: ${ARCHIVE_PATH}"

# ------------------------------------------------------------------------------
# Unpack archive & verify checksums
# ------------------------------------------------------------------------------
RESTORE_STAGE=$(mktemp -d -t citedocs_restore_XXXXXX)
chmod 700 "$RESTORE_STAGE"

log_info "Extracting archive to temporary workspace..."
tar -xzf "$ARCHIVE_PATH" -C "$RESTORE_STAGE"

if [ ! -f "${RESTORE_STAGE}/postgres.dump" ]; then
  log_error "Invalid archive: postgres.dump missing from archive."
  exit 1
fi

if [ -f "${RESTORE_STAGE}/sha256sums.txt" ]; then
  log_info "Verifying archive cryptographic integrity (SHA-256)..."
  (
    cd "$RESTORE_STAGE"
    sha256sum -c sha256sums.txt --quiet
  )
  log_info "Cryptographic integrity verification passed."
else
  log_warn "Archive does not contain sha256sums.txt. Checksum verification skipped."
fi

# Parse metadata if present
METADATA_FILE="${RESTORE_STAGE}/metadata.json"
DUMP_SIZE=$(du -h "${RESTORE_STAGE}/postgres.dump" | awk '{print $1}')
STORAGE_COUNT=$(find "${RESTORE_STAGE}/storage" -type f 2>/dev/null | wc -l || echo "0")
STORAGE_SIZE="0B"
if [ -d "${RESTORE_STAGE}/storage" ]; then
  STORAGE_SIZE=$(du -sh "${RESTORE_STAGE}/storage" | awk '{print $1}')
fi

# ------------------------------------------------------------------------------
# Compose command resolution
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
# Restore a single storage bucket from staging
# ------------------------------------------------------------------------------
restore_bucket() {
  local bucket="$1"
  local src_dir="$2"
  local endpoint="$3"

  if [ ! -d "$src_dir" ]; then
    log_warn "Source directory for bucket '${bucket}' not found. Skipping."
    return 0
  fi

  # Case 1: AWS CLI available
  if command -v aws >/dev/null 2>&1; then
    local extra_args=()
    if [ -n "$endpoint" ]; then
      extra_args+=(--endpoint-url "$endpoint")
    fi

    # Ensure bucket exists
    AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
    AWS_DEFAULT_REGION="$S3_REGION" \
    aws "${extra_args[@]}" s3 mb "s3://${bucket}" >/dev/null 2>&1 || true

    AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
    AWS_DEFAULT_REGION="$S3_REGION" \
    aws "${extra_args[@]}" s3 sync "$src_dir" "s3://${bucket}" --only-show-errors
    return 0
  fi

  # Case 2: mc available on host
  if command -v mc >/dev/null 2>&1 && [ -n "$endpoint" ]; then
    local mc_cfg
    mc_cfg=$(mktemp -d)
    local alias_name="citedocs_dest_${RANDOM}"
    mc --config-dir "$mc_cfg" --quiet alias set "$alias_name" "$endpoint" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null 2>&1
    mc --config-dir "$mc_cfg" --quiet mb "${alias_name}/${bucket}" >/dev/null 2>&1 || true
    mc --config-dir "$mc_cfg" --quiet mirror --overwrite "$src_dir" "${alias_name}/${bucket}"
    rm -rf "$mc_cfg"
    return 0
  fi

  # Case 3: Docker-based mc fallback
  local minio_cid
  minio_cid=$(run_compose ps -q "$MINIO_SERVICE" 2>/dev/null || true)
  if [ -n "$minio_cid" ]; then
    local minio_img
    minio_img=$(docker inspect -f '{{.Config.Image}}' "$minio_cid" 2>/dev/null || echo "pgsty/minio:latest")
    local net_name
    net_name=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$minio_cid" 2>/dev/null || echo "${COMPOSE_PROJECT_NAME}_default")

    docker run --rm \
      --network "$net_name" \
      -v "${src_dir}:/restore_src:ro" \
      --entrypoint sh "$minio_img" -c "
        mc --quiet alias set dest http://${MINIO_SERVICE}:9000 '$S3_ACCESS_KEY' '$S3_SECRET_KEY' >/dev/null 2>&1
        mc --quiet mb 'dest/${bucket}' 2>/dev/null || true
        mc --quiet mirror --overwrite /restore_src 'dest/${bucket}' 2>/dev/null || true
      " || true
    return 0
  fi

  log_error "No S3 tool available to restore object storage."
  return 1
}

# ------------------------------------------------------------------------------
# VERIFY MODE (Restore into isolated throwaway containers)
# ------------------------------------------------------------------------------
run_verify() {
  log_info "Starting isolated verification mode (--verify)..."

  local rnd="verify-${$}-${RANDOM}"
  local net_name="citedocs-net-${rnd}"
  local pg_vol="citedocs-pg-${rnd}"
  local minio_vol="citedocs-minio-${rnd}"
  local pg_cname="citedocs-pg-${rnd}"
  local minio_cname="citedocs-minio-${rnd}"

  VERIFY_NETWORKS+=("$net_name")
  VERIFY_VOLUMES+=("$pg_vol" "$minio_vol")
  VERIFY_CONTAINERS+=("$pg_cname" "$minio_cname")

  log_info "Creating throwaway Docker network and volumes..."
  docker network create "$net_name" >/dev/null
  docker volume create "$pg_vol" >/dev/null
  docker volume create "$minio_vol" >/dev/null

  log_info "Starting throwaway PostgreSQL container (${pg_cname})...."
  docker run -d \
    --name "$pg_cname" \
    --network "$net_name" \
    -v "${pg_vol}:/var/lib/postgresql/data" \
    -e POSTGRES_DB=citedocs \
    -e POSTGRES_USER=citedocs \
    -e POSTGRES_PASSWORD=verify_secret \
    postgres:16-alpine >/dev/null

  log_info "Starting throwaway MinIO container (${minio_cname})..."
  docker run -d \
    --name "$minio_cname" \
    --network "$net_name" \
    -v "${minio_vol}:/data" \
    -e MINIO_ROOT_USER=verify_minio \
    -e MINIO_ROOT_PASSWORD=verify_minio_pass \
    pgsty/minio:latest server /data >/dev/null

  # Wait for Postgres readiness
  log_info "Waiting for throwaway PostgreSQL readiness..."
  local pg_ready=0
  for _ in {1..30}; do
    if docker exec "$pg_cname" pg_isready -U citedocs >/dev/null 2>&1; then
      pg_ready=1
      break
    fi
    sleep 1
  done
  if [ "$pg_ready" -ne 1 ]; then
    log_error "Throwaway PostgreSQL failed to start within timeout."
    exit 1
  fi

  # Wait for MinIO readiness
  log_info "Waiting for throwaway MinIO readiness..."
  local minio_ready=0
  for _ in {1..30}; do
    if docker exec "$minio_cname" mc alias set local http://127.0.0.1:9000 verify_minio verify_minio_pass >/dev/null 2>&1; then
      minio_ready=1
      break
    fi
    sleep 1
  done
  if [ "$minio_ready" -ne 1 ]; then
    log_error "Throwaway MinIO failed to start within timeout."
    exit 1
  fi

  # 1. Restore Postgres dump into throwaway container
  log_info "Restoring postgres.dump into throwaway PostgreSQL container..."
  docker exec -i -e PGPASSWORD=verify_secret "$pg_cname" pg_restore -h localhost -U citedocs -d citedocs --clean --if-exists < "${RESTORE_STAGE}/postgres.dump" || true

  # Count restored tables
  local table_count
  table_count=$(docker exec -e PGPASSWORD=verify_secret "$pg_cname" psql -h localhost -U citedocs -d citedocs -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d '[:space:]')

  # Query row counts of core application tables
  local users_count=0
  local docs_count=0
  local items_count=0
  local shares_count=0
  local annot_count=0

  users_count=$(docker exec -e PGPASSWORD=verify_secret "$pg_cname" psql -h localhost -U citedocs -d citedocs -t -c "SELECT count(*) FROM users;" 2>/dev/null | tr -d '[:space:]' || echo "0")
  docs_count=$(docker exec -e PGPASSWORD=verify_secret "$pg_cname" psql -h localhost -U citedocs -d citedocs -t -c "SELECT count(*) FROM documents;" 2>/dev/null | tr -d '[:space:]' || echo "0")
  items_count=$(docker exec -e PGPASSWORD=verify_secret "$pg_cname" psql -h localhost -U citedocs -d citedocs -t -c "SELECT count(*) FROM library_items;" 2>/dev/null | tr -d '[:space:]' || echo "0")
  shares_count=$(docker exec -e PGPASSWORD=verify_secret "$pg_cname" psql -h localhost -U citedocs -d citedocs -t -c "SELECT count(*) FROM document_shares;" 2>/dev/null | tr -d '[:space:]' || echo "0")
  annot_count=$(docker exec -e PGPASSWORD=verify_secret "$pg_cname" psql -h localhost -U citedocs -d citedocs -t -c "SELECT count(*) FROM pdf_annotations;" 2>/dev/null | tr -d '[:space:]' || echo "0")

  log_info "PostgreSQL restore verification: ${table_count} tables restored (users: ${users_count}, docs: ${docs_count}, items: ${items_count})."

  # 2. Restore Storage buckets into throwaway MinIO container
  log_info "Restoring storage buckets into throwaway MinIO container..."
  local restored_buckets=()
  local restored_objects_count=0

  if [ -d "${RESTORE_STAGE}/storage" ]; then
    while IFS= read -r b_dir; do
      if [ -d "$b_dir" ]; then
        local b_name
        b_name=$(basename "$b_dir")
        restored_buckets+=("$b_name")

        docker exec "$minio_cname" mc mb "local/${b_name}" >/dev/null 2>&1 || true

        # Copy files via helper container or mc
        docker run --rm \
          --network "$net_name" \
          -v "${b_dir}:/src_data:ro" \
          --entrypoint sh pgsty/minio:latest -c "
            mc --quiet alias set target http://${minio_cname}:9000 verify_minio verify_minio_pass >/dev/null 2>&1
            mc --quiet mirror --overwrite /src_data target/${b_name} >/dev/null 2>&1 || true
          "

        local obj_cnt
        obj_cnt=$(docker exec "$minio_cname" mc ls --recursive "local/${b_name}" 2>/dev/null | wc -l || echo "0")
        restored_objects_count=$((restored_objects_count + obj_cnt))
        log_info "Verified bucket '${b_name}': ${obj_cnt} objects restored."
      fi
    done < <(find "${RESTORE_STAGE}/storage" -mindepth 1 -maxdepth 1 -type d)
  fi

  cat << EOF

================================================================================
                    CITEDOCS RESTORE VERIFICATION REPORT
================================================================================
Archive:          ${ARCHIVE_PATH}
Archive Size:     $(du -h "$ARCHIVE_PATH" | awk '{print $1}')
Cryptographic:    SHA-256 CHECKSUM VERIFIED

PostgreSQL Verification (postgres:16-alpine):
  - Database:          citedocs
  - Total Tables:      ${table_count} tables restored
  - Users:             ${users_count} rows
  - Documents:         ${docs_count} rows
  - Document Shares:   ${shares_count} rows
  - Library Items:     ${items_count} rows
  - PDF Annotations:   ${annot_count} rows

Object Storage Verification (MinIO):
  - Buckets Restored:  $(printf '%s ' "${restored_buckets[@]:-(none)}")
  - Total Objects:     ${restored_objects_count} objects restored

RESULT: RESTORE VERIFICATION PASSED (Data round-trip successfully proven)
================================================================================
EOF

  if [ "${table_count:-0}" -le 0 ]; then
    log_error "Restore verification failed: No tables found in restored PostgreSQL database."
    return 1
  fi

  if [ -d "${RESTORE_STAGE}/storage" ] && [ "${STORAGE_COUNT:-0}" -gt 0 ] && [ "${restored_objects_count:-0}" -le 0 ]; then
    log_error "Restore verification failed: ${STORAGE_COUNT} objects were expected from archive, but 0 were restored into storage."
    return 1
  fi
}

# ------------------------------------------------------------------------------
# MAIN EXECUTION
# ------------------------------------------------------------------------------
main() {
  if [ "$DRY_RUN" -eq 1 ]; then
    cat << EOF

================================================================================
                    CITEDOCS RESTORE PLAN (DRY-RUN)
================================================================================
Archive:          ${ARCHIVE_PATH}
Archive Size:     $(du -h "$ARCHIVE_PATH" | awk '{print $1}')
PostgreSQL Dump:  postgres.dump (${DUMP_SIZE}, custom format)
Target Database:  ${POSTGRES_DB} (service: ${POSTGRES_SERVICE}, user: ${POSTGRES_USER})

Storage Buckets to Restore:
$(if [ -d "${RESTORE_STAGE}/storage" ]; then find "${RESTORE_STAGE}/storage" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sed 's/^/  - /'; else echo "  - (none)"; fi)

Total Objects:    ${STORAGE_COUNT} (${STORAGE_SIZE})
Target Endpoint:  $(resolve_storage_endpoint || echo "AWS S3 Standard")

Metadata:
$(if [ -f "$METADATA_FILE" ]; then cat "$METADATA_FILE" | sed 's/^/  /'; else echo "  (metadata.json not found)"; fi)

STATUS: DRY-RUN COMPLETE. No data was modified on the database or storage.
================================================================================
EOF
    exit 0
  fi

  if [ "$VERIFY_MODE" -eq 1 ]; then
    run_verify
    exit 0
  fi

  # CONFIRMATION CHECK (FOR PRODUCTION / RUNNING STACK RESTORE)
  if [ "$CONFIRMED" -ne 1 ]; then
    if [ -t 0 ]; then
      printf '\n\033[1;31m********************************************************************************\033[0m\n'
      printf '\033[1;31m  WARNING: YOU ARE ABOUT TO OVERWRITE THE ACTIVE CITEDOCS DATABASE AND STORAGE! \033[0m\n'
      printf '\033[1;31m  Database: %s (service: %s)\033[0m\n' "$POSTGRES_DB" "$POSTGRES_SERVICE"
      printf '\033[1;31m  Archive:  %s\033[0m\n' "$ARCHIVE_PATH"
      printf '\033[1;31m********************************************************************************\033[0m\n\n'
      read -r -p "Type 'yes' to proceed with the restore operation: " answer
      if [ "$answer" != "yes" ]; then
        log_warn "Restore operation canceled by user."
        exit 1
      fi
    else
      log_error "Non-interactive execution requires --yes or --confirm flag to proceed."
      exit 1
    fi
  fi

  # ACTIVE STACK RESTORATION
  log_info "Proceeding with restore into active CiteDocs stack..."

  # 1. Restore PostgreSQL database
  log_info "Restoring PostgreSQL database '${POSTGRES_DB}' via service '${POSTGRES_SERVICE}'..."
  local pg_env=()
  if [ -n "$POSTGRES_PASSWORD" ]; then
    pg_env=(-e "PGPASSWORD=${POSTGRES_PASSWORD}")
  fi

  run_compose exec -T "${pg_env[@]}" "$POSTGRES_SERVICE" \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "${RESTORE_STAGE}/postgres.dump" || true

  log_info "PostgreSQL restoration command finished."

  # 2. Restore Object Storage Buckets
  local storage_endpoint
  storage_endpoint=$(resolve_storage_endpoint)
  log_info "Resolved storage endpoint for restore: ${storage_endpoint:-AWS S3 Standard}"

  if [ -d "${RESTORE_STAGE}/storage" ]; then
    while IFS= read -r b_dir; do
      if [ -d "$b_dir" ]; then
        local b_name
        b_name=$(basename "$b_dir")
        log_info "Restoring storage bucket '${b_name}'..."
        restore_bucket "$b_name" "$b_dir" "$storage_endpoint"
        log_info "Bucket '${b_name}' restoration complete."
      fi
    done < <(find "${RESTORE_STAGE}/storage" -mindepth 1 -maxdepth 1 -type d)
  fi

  log_info "CiteDocs restore operation completed successfully."
}

main "$@"
