#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# CiteDocs: Vendor & Build Script for zotero/web-library (AGPL-3.0)
# ==============================================================================
# This script fetches the official Zotero Web Library repository, builds its
# production bundle, and copies the compiled assets to CiteDocs web public directory.
#
# Requirements:
#   - git, node >= 18, npm or pnpm
#   - Internet connection (run during vendor preparation, not during offline CI)
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENDOR_DIR="${ROOT_DIR}/vendor/web-library"
TARGET_DIR="${ROOT_DIR}/apps/web/public/zotero-weblib"
REPO_URL="https://github.com/zotero/web-library.git"
BRANCH_OR_TAG="master"

echo "==> [CiteDocs] Preparing zotero/web-library bundle..."
echo "    Source Repo: ${REPO_URL} (${BRANCH_OR_TAG})"
echo "    Target:      ${TARGET_DIR}"

TMP_DIR="$(mktemp -d -t zotero-weblib-XXXXXX)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "==> Cloning upstream repository..."
git clone --depth 1 --branch "${BRANCH_OR_TAG}" "${REPO_URL}" "${TMP_DIR}/repo"

cd "${TMP_DIR}/repo"

echo "==> Installing upstream dependencies..."
npm install --legacy-peer-deps

echo "==> Building production bundle..."
npm run build || npm run dist || npm run compile

echo "==> Deploying bundle to ${TARGET_DIR}..."
mkdir -p "${TARGET_DIR}"

if [ -d "${TMP_DIR}/repo/dist" ]; then
  cp -r "${TMP_DIR}/repo/dist/"* "${TARGET_DIR}/"
elif [ -d "${TMP_DIR}/repo/build" ]; then
  cp -r "${TMP_DIR}/repo/build/"* "${TARGET_DIR}/"
fi

echo "==> [Success] zotero/web-library bundle vendored successfully into ${TARGET_DIR}"
