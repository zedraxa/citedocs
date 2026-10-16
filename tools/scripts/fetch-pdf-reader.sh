#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# CiteDocs: Vendor & Build Script for zotero/reader (AGPL-3.0)
# ==============================================================================
# This script fetches the official Zotero Reader repository (including submodules),
# compiles its production web bundle, and deploys the assets to CiteDocs web public.
#
# Requirements:
#   - git, node >= 18, npm or pnpm
#   - Internet connection (run during vendor preparation, not during offline CI)
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_DIR="${ROOT_DIR}/apps/web/public/zotero-pdf-reader"
REPO_URL="https://github.com/zotero/reader.git"
BRANCH_OR_TAG="master"

echo "==> [CiteDocs] Preparing zotero/reader bundle..."
echo "    Source Repo: ${REPO_URL} (${BRANCH_OR_TAG})"
echo "    Target:      ${TARGET_DIR}"

TMP_DIR="$(mktemp -d -t zotero-reader-XXXXXX)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "==> Cloning upstream repository (recursive with submodules)..."
git clone --depth 1 --recursive --branch "${BRANCH_OR_TAG}" "${REPO_URL}" "${TMP_DIR}/repo"

cd "${TMP_DIR}/repo"

echo "==> Installing upstream dependencies..."
export NODE_OPTIONS="${NODE_OPTIONS:---openssl-legacy-provider}"
npm install --legacy-peer-deps

echo "==> Building web production bundle..."
npm run build:web || npm run build:zotero || npm run build || npx webpack --config-name web

echo "==> Deploying bundle to ${TARGET_DIR}..."
mkdir -p "${TARGET_DIR}"

if [ -d "${TMP_DIR}/repo/build/web" ]; then
  cp -r "${TMP_DIR}/repo/build/web/"* "${TARGET_DIR}/"
elif [ -d "${TMP_DIR}/repo/build" ]; then
  cp -r "${TMP_DIR}/repo/build/"* "${TARGET_DIR}/"
elif [ -d "${TMP_DIR}/repo/dist" ]; then
  cp -r "${TMP_DIR}/repo/dist/"* "${TARGET_DIR}/"
fi

echo "==> [Success] zotero/reader bundle vendored successfully into ${TARGET_DIR}"
