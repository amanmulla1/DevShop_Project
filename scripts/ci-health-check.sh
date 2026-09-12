#!/usr/bin/env bash
# =============================================================================
# DevShop post-deployment health check.
#
# Runs ON the EC2 host (invoked by Jenkins over SSH). Verifies every live
# concern is actually healthy BEFORE declaring deployment success — an exit
# code of 0 from `docker compose up` alone is NOT treated as success.
#
# These checks use the host's loopback (127.0.0.1) so they exercise the real
# Nginx reverse-proxy / backend / frontend responses, matching the container
# architecture (frontends reach the backend via /api on the same origin).
# =============================================================================

set -euo pipefail

APP_DIR="${DEVSHOP_APP_DIR:-/opt/devshop}"
cd "${APP_DIR}"

echo "== docker compose ps =="
docker compose -f docker-compose.yml -f docker-compose.ci.yml ps --format \
  'table {{.Name}}\t{{.Service}}\t{{.Status}}' 2>/dev/null || docker compose -f docker-compose.yml ps

REQUIRED_OK="200"
failures=0

check() {
  local name="$1" url="$2" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url" || true)"
  echo "  [${name}] ${url} -> HTTP ${code}"
  if [ "${code}" != "${REQUIRED_OK}" ]; then
    echo "  ERROR: ${name} is NOT healthy (expected HTTP ${REQUIRED_OK}, got ${code})"
    failures=$((failures + 1))
  fi
}

echo "== Health checks from ${HOSTNAME} =="

check "backend-health"    "http://127.0.0.1:8080/actuator/health"
check "backend-products"  "http://127.0.0.1:8080/api/products"
check "customer-frontend" "http://127.0.0.1:5173/"
check "admin-frontend"    "http://127.0.0.1:5174/"

if [ "${failures}" -ne 0 ]; then
  echo "HEALTH CHECK FAILED: ${failures} check(s) not healthy"
  exit 1
fi

echo "ALL HEALTH CHECKS PASSED"
