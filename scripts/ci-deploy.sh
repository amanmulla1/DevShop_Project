#!/usr/bin/env bash
# =============================================================================
# DevShop CI deployment helper.
#
# Runs ON the target (EC2) host, invoked by Jenkins over SSH. It:
#   1. Ensures the application repository exists on the host (clone if missing,
#      otherwise update the checked-out branch non-destructively).
#   2. Pulls the three PREBUILT application images from the registry at the
#      exact immutable tag supplied by Jenkins.
#   3. Recreates containers with `docker compose up -d`.
#
# PostgreSQL is NOT touched: the devshop-postgres-data volume persists, no
# destructive reset, and `down -v` is never run. All runtime secrets live in
# the server's .env (git-ignored) and are NOT overwritten by this script.
#
# Usage:
#   DEVSHOP_APP_DIR=/opt/devshop scripts/ci-deploy.sh REGISTRY IMAGE_TAG
#   e.g. DEVSHOP_APP_DIR=/opt/devshop scripts/ci-deploy.sh amanmulla1 42
# =============================================================================

set -euo pipefail

REGISTRY="${1:?Usage: ci-deploy.sh REGISTRY IMAGE_TAG}"
IMAGE_TAG="${2:?Usage: ci-deploy.sh REGISTRY IMAGE_TAG}"

APP_DIR="${DEVSHOP_APP_DIR:-/opt/devshop}"
REPO_URL="https://github.com/amanmulla1/DevShop_Project.git"
BRANCH="main"

echo "== Deploying DevShop tag ${IMAGE_TAG} (registry=${REGISTRY}) to $(hostname) =="

# --- 1. Ensure the repository is present and on the right branch ------------
if [ ! -d "${APP_DIR}/.git" ]; then
  echo "Cloning repository into ${APP_DIR} ..."
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
else
  echo "Updating repository in ${APP_DIR} ..."
  git -C "${APP_DIR}" fetch --tags origin "${BRANCH}"
  git -C "${APP_DIR}" checkout "${BRANCH}"
  # Non-destructive fast-forward update. Fails (does not reset) on divergence.
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
fi

# --- 2. Pull the immutable images (registry, no local build) -----------------
export REGISTRY IMAGE_TAG
cd "${APP_DIR}"
echo "== Pulling application images @ ${IMAGE_TAG} =="
docker compose -f docker-compose.yml -f docker-compose.ci.yml pull \
  backend customer-frontend admin-frontend

# --- 3. Recreate containers with the newly pulled images ---------------------
echo "== Recreating application containers =="
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d

echo "== Deploy helper finished (PostgreSQL volume untouched) =="
