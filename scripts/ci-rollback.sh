#!/usr/bin/env bash
# =============================================================================
# DevShop rollback helper (documented, simple, non-destructive).
#
# Rolls back to a previously pushed IMMUTABLE image tag by re-running the same
# deploy helper as CI would, pointing at the older image tag. Old images are
# never deleted from the registry, and PostgreSQL data is preserved.
#
# Usage:
#   DEVSHOP_APP_DIR=/opt/devshop scripts/ci-rollback.sh REGISTRY PREVIOUS_TAG
#   e.g. DEVSHOP_APP_DIR=/opt/devshop scripts/ci-rollback.sh amanmulla1 41
#
# Example: if tag 42 fails, roll back to 41:
#   scripts/ci-rollback.sh amanmulla1 41
# =============================================================================

set -euo pipefail

REGISTRY="${1:?Usage: ci-rollback.sh REGISTRY PREVIOUS_TAG}"
PREVIOUS_TAG="${2:?Usage: ci-rollback.sh REGISTRY PREVIOUS_TAG}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== Rolling back DevShop to tag ${PREVIOUS_TAG} =="
exec "${SCRIPT_DIR}/ci-deploy.sh" "${REGISTRY}" "${PREVIOUS_TAG}"
