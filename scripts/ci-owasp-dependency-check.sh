#!/usr/bin/env bash
# =============================================================================
# DevShop OWASP Dependency-Check scan (Software Composition Analysis).
#
# Scans the compiled-dependencies manifests of ALL services — the backend
# Maven pom.xml and both frontends' package-lock.json — for known vulnerable
# components. Any finding rated CVSS >= 7 (HIGH/CRITICAL) FAILS the build so a
# vulnerable dependency never ships.
#
#   usage: ci-owasp-dependency-check.sh
#
#   env overrides:
#     DEPCHECK_IMAGE     dependency-check container image (default: owasp/dependency-check:latest)
#     DEPCHECK_OUT       host report dir (default: ./reports)
#     NVD_API_KEY        NVD 2.0 API key, speeds up/keeps NVDB fresh (optional)
#     FAIL_ON_CVSS       failing severity threshold (default: 7)
# =============================================================================

set -euo pipefail

DEPCHECK_IMAGE="${DEPCHECK_IMAGE:-owasp/dependency-check:latest}"
DEPCHECK_OUT="${DEPCHECK_OUT:-${PWD}/reports}"
FAIL_ON_CVSS="${FAIL_ON_CVSS:-7}"
SOURCE_DIR="${PWD}"

mkdir -p "${DEPCHECK_OUT}"

echo "== OWASP Dependency-Check (fail on CVSS >= ${FAIL_ON_CVSS}) =="

# NOTE: no `-u`, so the OWASP image (root) can always write its NVD DB cache
# and the reports out of the box on a fresh host.
docker_args=(
  run --rm
  -v "${SOURCE_DIR}:/src"
  -v "${DEPCHECK_OUT}:/report"
  -v "${HOME}/.cache/dependency-check:/usr/share/dependency-check/data"
  "${DEPCHECK_IMAGE}"
  --scan /src/application
  --format HTML
  --format JSON
  --out /report
  --failOnCVSS "${FAIL_ON_CVSS}"
)

# Optional NVD 2.0 API key (documented in jenkins/README.md). Without it the
# scan still works but is throttled by NVD rate limits.
if [ -n "${NVD_API_KEY:-}" ]; then
  echo "NVD API key found - using it for the NVD 2.0 feed."
  docker_args+=("--nvdApiKey" "${NVD_API_KEY}")
fi

docker "${docker_args[@]}"

echo
echo "OWASP Dependency-Check PASSED - no finding at or above CVSS ${FAIL_ON_CVSS}."
echo "Reports: ${DEPCHECK_OUT}"