#!/usr/bin/env bash
# ==============================================================================
# CiteDocs Backup & Restore End-to-End Integration Test
# ------------------------------------------------------------------------------
# Spawns isolated throwaway PostgreSQL (16-alpine) and MinIO (pgsty/minio:latest)
# containers via docker compose with dynamic non-conflicting ports.
#
# Steps:
#   1. Sets up throwaway project & containers.
#   2. Seeds PostgreSQL schema & rows (users, documents, library_items).
#   3. Seeds MinIO buckets & files (citedocs-documents, citedocs-attachments).
#   4. Runs deploy/backup/citedocs-backup.sh to create an archive.
#   5. Verifies archive format, contents, and cryptographic checksums.
#   6. Tests deploy/backup/citedocs-restore.sh --dry-run.
#   7. Mutates/deletes active data to simulate catastrophic data loss.
#   8. Runs deploy/backup/citedocs-restore.sh --yes.
#   9. Asserts complete round-trip fidelity (database rows and storage files).
#  10. Tests deploy/backup/citedocs-restore.sh --verify throwaway verification.
#  11. Automatically cleans up all test containers, volumes, and directories.
# ==============================================================================

set -euo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
BACKUP_SCRIPT="${REPO_ROOT}/deploy/backup/citedocs-backup.sh"
RESTORE_SCRIPT="${REPO_ROOT}/deploy/backup/citedocs-restore.sh"

TEST_ID="test_${$}_${RANDOM}"
COMPOSE_PROJECT="citedocs_test_${TEST_ID}"
TEST_DIR=$(mktemp -d "/tmp/citedocs_test_XXXXXX")
TEST_BACKUP_DIR="${TEST_DIR}/backups"
mkdir -p "$TEST_BACKUP_DIR"

COMPOSE_FILE="${TEST_DIR}/docker-compose.yml"
ENV_FILE="${TEST_DIR}/.env"

log() {
  printf '[TEST] [%s] %s\n' "$(date +'%H:%M:%S')" "$*"
}

cleanup() {
  local exit_code=$?
  log "Cleaning up test environment (${COMPOSE_PROJECT})..."
  if [ -f "$COMPOSE_FILE" ]; then
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$TEST_DIR"
  if [ "$exit_code" -ne 0 ]; then
    printf '\033[1;31m[TEST] FAILED with exit code %d\033[0m\n' "$exit_code"
  else
    printf '\033[1;32m[TEST] ALL BACKUP AND RESTORE TESTS PASSED SUCCESSFULLY!\033[0m\n'
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

log "Creating test compose configuration in: ${TEST_DIR}"

# 1. Generate throwaway docker-compose.yml
cat << EOF > "$COMPOSE_FILE"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: citedocs
      POSTGRES_USER: citedocs
      POSTGRES_PASSWORD: test_secret_pg_123
    ports:
      - "0:5432"
  minio:
    image: pgsty/minio:latest
    environment:
      MINIO_ROOT_USER: citedocs_test_minio
      MINIO_ROOT_PASSWORD: citedocs_test_secret_pass
    command: server /data
    ports:
      - "0:9000"
EOF

# 2. Start throwaway stack
log "Starting throwaway containers via docker compose..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d

# 3. Wait for PostgreSQL readiness
log "Waiting for PostgreSQL service readiness..."
for _ in {1..30}; do
  if docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T postgres pg_isready -U citedocs >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 4. Wait for MinIO readiness
log "Waiting for MinIO service readiness..."
for _ in {1..30}; do
  if docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T minio mc alias set local http://127.0.0.1:9000 citedocs_test_minio citedocs_test_secret_pass >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Resolve dynamic host ports
PG_PORT=$(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" port postgres 5432 | awk -F: '{print $NF}')
MINIO_PORT=$(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" port minio 9000 | awk -F: '{print $NF}')
log "Services ready: PostgreSQL on 127.0.0.1:${PG_PORT}, MinIO on 127.0.0.1:${MINIO_PORT}"

# Generate test .env file
cat << EOF > "$ENV_FILE"
POSTGRES_USER=citedocs
POSTGRES_DB=citedocs
POSTGRES_PASSWORD=test_secret_pg_123
S3_ENDPOINT=http://127.0.0.1:${MINIO_PORT}
S3_BUCKET=citedocs-attachments
S3_DOCUMENTS_BUCKET=citedocs-documents
S3_ATTACHMENTS_BUCKET=citedocs-attachments
S3_ACCESS_KEY=citedocs_test_minio
S3_SECRET_KEY=citedocs_test_secret_pass
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT}
EOF

# 5. Seed PostgreSQL schema & test records
log "Seeding PostgreSQL test database..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T postgres psql -U citedocs -d citedocs << 'EOF'
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  s3_object_key text,
  file_size int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  item_type text NOT NULL,
  doi text,
  created_at timestamptz DEFAULT now()
);

INSERT INTO users (id, email, display_name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ogrenci1@istanbul.edu.tr', 'Ahmet Yılmaz'),
  ('22222222-2222-2222-2222-222222222222', 'ogrenci2@metu.edu.tr', 'Ayşe Demir');

INSERT INTO documents (id, owner_user_id, title, s3_object_key, file_size) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Tez Taslağı - Bölüm 1', 'docs/tez1.docx', 2048),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Scientific Writing Final Essay', 'docs/essay.docx', 4096);

INSERT INTO library_items (id, owner_user_id, title, item_type, doi) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Attention Is All You Need', 'journalArticle', '10.48550/arXiv.1706.03762');
EOF

# 6. Seed MinIO object storage
log "Seeding MinIO object storage buckets..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T minio mc mb local/citedocs-documents
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T minio mc mb local/citedocs-attachments

docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T minio sh -c "
  echo 'ONLYOFFICE DOCX CONTENT AHMET TEZ' > /tmp/tez1.docx
  mc cp /tmp/tez1.docx local/citedocs-documents/docs/tez1.docx

  echo 'ONLYOFFICE DOCX CONTENT AYSE ESSAY' > /tmp/essay.docx
  mc cp /tmp/essay.docx local/citedocs-documents/docs/essay.docx

  echo 'PDF ATTACHMENT ATTENTION IS ALL YOU NEED' > /tmp/vaswani2017.pdf
  mc cp /tmp/vaswani2017.pdf local/citedocs-attachments/pdfs/vaswani2017.pdf
"

# 7. Execute backup script
log "Executing citedocs-backup.sh..."
"$BACKUP_SCRIPT" \
  --env-file "$ENV_FILE" \
  --compose-file "$COMPOSE_FILE" \
  --project-name "$COMPOSE_PROJECT" \
  --backup-dir "$TEST_BACKUP_DIR" \
  --min-free-mb 50

# 8. Verify generated backup archive
log "Verifying generated archive properties..."
ARCHIVE_FILE=$(find "$TEST_BACKUP_DIR" -maxdepth 1 -name "citedocs-backup-*.tar.gz" | head -n1)
if [ -z "$ARCHIVE_FILE" ] || [ ! -f "$ARCHIVE_FILE" ]; then
  log "FAIL: No backup archive found in ${TEST_BACKUP_DIR}"
  exit 1
fi

log "Found archive: $(basename "$ARCHIVE_FILE")"

# Verify sha256 checksum file
if [ ! -f "${ARCHIVE_FILE}.sha256" ]; then
  log "FAIL: Archive sha256 checksum file is missing!"
  exit 1
fi
(cd "$TEST_BACKUP_DIR" && sha256sum -c "${ARCHIVE_FILE}.sha256")
log "Archive top-level sha256 verified."

# Inspect tar contents
TAR_LIST=$(tar -tzf "$ARCHIVE_FILE")
echo "$TAR_LIST" | grep -q "postgres.dump" || (log "FAIL: postgres.dump not in archive" && exit 1)
echo "$TAR_LIST" | grep -q "metadata.json" || (log "FAIL: metadata.json not in archive" && exit 1)
echo "$TAR_LIST" | grep -q "sha256sums.txt" || (log "FAIL: sha256sums.txt not in archive" && exit 1)
echo "$TAR_LIST" | grep -q "storage/citedocs-documents/docs/tez1.docx" || (log "FAIL: tez1.docx not in archive" && exit 1)
echo "$TAR_LIST" | grep -q "storage/citedocs-attachments/pdfs/vaswani2017.pdf" || (log "FAIL: vaswani2017.pdf not in archive" && exit 1)
log "Archive internal file structure verified."

# 9. Test restore dry-run
log "Testing citedocs-restore.sh --dry-run..."
"$RESTORE_SCRIPT" \
  --archive "$ARCHIVE_FILE" \
  --env-file "$ENV_FILE" \
  --compose-file "$COMPOSE_FILE" \
  --project-name "$COMPOSE_PROJECT" \
  --backup-dir "$TEST_BACKUP_DIR" \
  --dry-run
log "Dry-run completed successfully."

# 10. Simulate catastrophic data loss (DROP/DELETE in Postgres and MinIO)
log "Simulating data loss: purging active Postgres and MinIO..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T postgres psql -U citedocs -d citedocs -c "DROP TABLE documents; DROP TABLE library_items; DROP TABLE users;"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T minio mc rm --recursive --force local/citedocs-documents/
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T minio mc rm --recursive --force local/citedocs-attachments/

# Verify that data is indeed gone
ACTIVE_USERS=$(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T postgres psql -U citedocs -d citedocs -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d '[:space:]')
if [ "$ACTIVE_USERS" -ne 0 ]; then
  log "FAIL: Database was not properly cleared for restore test"
  exit 1
fi

# 11. Execute restore
log "Executing citedocs-restore.sh --yes..."
"$RESTORE_SCRIPT" \
  --archive "$ARCHIVE_FILE" \
  --env-file "$ENV_FILE" \
  --compose-file "$COMPOSE_FILE" \
  --project-name "$COMPOSE_PROJECT" \
  --backup-dir "$TEST_BACKUP_DIR" \
  --yes

# 12. Assert database & storage round-trip integrity
log "Asserting database data round-trip..."
RESTORED_USER_COUNT=$(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T postgres psql -U citedocs -d citedocs -t -c "SELECT count(*) FROM users;" | tr -d '[:space:]')
RESTORED_DOC_COUNT=$(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T postgres psql -U citedocs -d citedocs -t -c "SELECT count(*) FROM documents;" | tr -d '[:space:]')
RESTORED_ITEM_COUNT=$(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T postgres psql -U citedocs -d citedocs -t -c "SELECT count(*) FROM library_items;" | tr -d '[:space:]')

if [ "$RESTORED_USER_COUNT" -ne 2 ]; then
  log "FAIL: Expected 2 users, found ${RESTORED_USER_COUNT}"
  exit 1
fi
if [ "$RESTORED_DOC_COUNT" -ne 2 ]; then
  log "FAIL: Expected 2 documents, found ${RESTORED_DOC_COUNT}"
  exit 1
fi
if [ "$RESTORED_ITEM_COUNT" -ne 1 ]; then
  log "FAIL: Expected 1 library item, found ${RESTORED_ITEM_COUNT}"
  exit 1
fi
log "PostgreSQL round-trip: 2 users, 2 documents, 1 library item verified."

log "Asserting MinIO object storage round-trip..."
DOC_CONTENT=$(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T minio mc cat local/citedocs-documents/docs/tez1.docx)
if [ "$DOC_CONTENT" != "ONLYOFFICE DOCX CONTENT AHMET TEZ" ]; then
  log "FAIL: tez1.docx content mismatch after restore: '${DOC_CONTENT}'"
  exit 1
fi

PDF_CONTENT=$(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T minio mc cat local/citedocs-attachments/pdfs/vaswani2017.pdf)
if [ "$PDF_CONTENT" != "PDF ATTACHMENT ATTENTION IS ALL YOU NEED" ]; then
  log "FAIL: vaswani2017.pdf content mismatch after restore: '${PDF_CONTENT}'"
  exit 1
fi
log "MinIO object storage round-trip: documents and attachment files 100% match."

# 13. Test isolated verification mode (--verify)
log "Testing citedocs-restore.sh --verify (isolated throwaway containers)..."
"$RESTORE_SCRIPT" \
  --archive "$ARCHIVE_FILE" \
  --verify
log "Isolated verification mode (--verify) succeeded."

log "Integration test completed successfully!"
