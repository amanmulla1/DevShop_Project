#!/usr/bin/env bash
# =============================================================================
# Build + tag + push the 4 DevShop Dockerfiles to Docker Hub
#
# 1. docker login          (authenticate to Docker Hub: your <USERNAME>)
# 2. ./authorize.sh         (optionally: set the username / tag once)
# 3. ./build-and-push.sh    (builds all 4 images and pushes them)
#
# This is NOT docker-compose - just 4 standalone Dockerfiles in this folder.
#
# Resulting images (edit NAMESPACE / TAG below to change):
#   <NAMESPACE>/devshop-backend:latest          <- Demo/dockerfiles/backend.Dockerfile
#   <NAMESPACE>/devshop-frontend:latest         <- Demo/dockerfiles/customer-frontend.Dockerfile
#   <NAMESPACE>/devshop-admin-frontend:latest   <- Demo/dockerfiles/admin-frontend.Dockerfile
#   <NAMESPACE>/devshop-postgres:16             <- Demo/dockerfiles/postgres.Dockerfile
# =============================================================================
set -euo pipefail

# ---- Config (override via env) ----------------------------------------------
NAMESPACE="${NAMESPACE:-amanmulla1}"
TAG="${TAG:-latest}"
PG_TAG="${PG_TAG:-16}"

# ---- Repository-relative paths (run this script from the repo root) ---------
# ../../application relative to this folder == <repo>/application
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../application" && pwd)"
DF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log(){ printf '\033[1;36m[build]\033[0m %s\n' "$*"; }

log "Docker Hub namespace: $NAMESPACE"
log "App source dir      : $APP_DIR"
log "Dockerfile dir      : $DF_DIR"

# ---- 1. Backend (Java / Spring Boot) ----------------------------------------
log "Building + pushing backend ..."
docker build -f "$DF_DIR/backend.Dockerfile"  -t "$NAMESPACE/devshop-backend:${TAG}"          "$APP_DIR/backend"
docker push "$NAMESPACE/devshop-backend:${TAG}"

# ---- 2. Customer frontend (Node / nginx) ------------------------------------
log "Building + pushing customer frontend ..."
docker build -f "$DF_DIR/customer-frontend.Dockerfile" -t "$NAMESPACE/devshop-frontend:${TAG}" "$APP_DIR/frontend"
docker push "$NAMESPACE/devshop-frontend:${TAG}"

# ---- 3. Admin frontend (Node / nginx) ---------------------------------------
log "Building + pushing admin frontend ..."
docker build -f "$DF_DIR/admin-frontend.Dockerfile"   -t "$NAMESPACE/devshop-admin-frontend:${TAG}" "$APP_DIR/admin-frontend"
docker push "$NAMESPACE/devshop-admin-frontend:${TAG}"

# ---- 4. PostgreSQL (customized postgres:16) ---------------------------------
log "Building + pushing postgres ..."
docker build -f "$DF_DIR/postgres.Dockerfile" -t "$NAMESPACE/devshop-postgres:${PG_TAG}" "$DF_DIR"
docker push "$NAMESPACE/devshop-postgres:${PG_TAG}"

log "Done. All 4 images are on Docker Hub under $NAMESPACE."
