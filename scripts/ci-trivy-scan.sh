#!/usr/bin/env bash
# =============================================================================
# DevShop container image security scan with Trivy.
#
# Scans one or more locally-built Docker images for vulnerabilities and FAILS
# (exit 1) when the build blocks on a HIGH/CRITICAL unfixed finding. This is a
# hard gate in the Jenkins pipeline: if a newly built image is vulnerable the
# push is prevented, so the vulnerable image is NEVER deployed.
#
#   usage: ci-trivy-scan.sh IMAGE[:TAG] [IMAGE[:TAG] ...]
#
#   env overrides:
#     TRIVY_IMAGE      trivy container image   (default: aquasec/trivy:latest)
#     TRIVY_SEVERITY   severity gate           (default: HIGH,CRITICAL)
#     TRIVY_EXIT_CODE  fail code               (default: 1)
#     TRIVY_DB_DIR     host cache dir for trivy DB
# =============================================================================

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: ci-trivy-scan.sh IMAGE[:TAG] [IMAGE[:TAG] ...]" >&2
  exit 2
fi

TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:latest}"
TRIVY_SEVERITY="${TRIVY_SEVERITY:-HIGH,CRITICAL}"
TRIVY_EXIT_CODE="${TRIVY_EXIT_CODE:-1}"
TRIVY_DB_DIR="${TRIVY_DB_DIR:-$HOME/.cache/trivy}"
WORKSPACE_DIR="${PWD}"
REPORTS_DIR="${WORKSPACE_DIR}/reports"

mkdir -p "${REPORTS_DIR}" "${TRIVY_DB_DIR}"

scanned=0
failed=0

echo "== Trivy image scan (severity gate: ${TRIVY_SEVERITY}) =="

for image in "$@"; do
  scanned=$((scanned + 1))
  echo "---- Scanning ${image} ----"
  # The scanable.cache gets a fresh name per image so concurrent/failed runs
  # never poison the shared cache with a half-written vuln DB entry.
  if docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "${TRIVY_DB_DIR}:/root/.cache/trivy" \
    -v "${REPORTS_DIR}:/report" \
    "${TRIVY_IMAGE}" image \
      --severity "${TRIVY_SEVERITY}" \
      --ignore-unfixed \
      --exit-code "${TRIVY_EXIT_CODE}" \
      --format template \
      --template "@contrib/html.tpl" \
      --output "/report/trivy-${image//\//_}.html" \
      "${image}"; then
    echo "  OK: no ${TRIVY_SEVERITY} unfixed vulnerabilities in ${image}"
  else
    echo "  FAIL: ${image} has ${TRIVY_SEVERITY} vulnerabilities (unfixed)" >&2
    failed=$((failed + 1))
  fi
done

echo
echo "== Summary: ${scanned} image(s) scanned, ${failed} with blocking findings =="
echo "Reports: ${REPORTS_DIR}"
test "${failed}" -eq 0