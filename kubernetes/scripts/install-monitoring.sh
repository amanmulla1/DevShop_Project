#!/usr/bin/env bash
# =============================================================================
# DevShop - Install the MONITORING stack via Argo CD (Phase 8)
#
# The monitoring stack (Prometheus, Grafana, Alertmanager, node-exporter,
# kube-state-metrics, postgres-exporter, dashboards, alert/recording rules) is
# GitOps-managed by Argo CD from the kubernetes/monitoring path (source of
# truth in Git). This script ONLY:
#   1. registers the Argo CD `monitoring` Application, and
#   2. waits for it to become Synced + Healthy, then
#   3. verifies Prometheus, Grafana, exporters and targets.
#
# It does NOT kubectl apply the monitoring resources as the normal flow - Argo
# CD does that from Git (self-healing). Run AFTER the DevShop application is
# healthy (install-argocd.sh + the app sync).
#
# Run as root on the EC2 host (or a user with cluster-admin):
#   bash kubernetes/scripts/install-monitoring.sh
# =============================================================================
set -euo pipefail

export KUBECONFIG="${KUBECONFIG:-/root/.kube/config}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl not found"; exit 1; }

echo "== Registering the Argo CD 'monitoring' Application (GitOps source of truth) =="
kubectl apply -f "${REPO_DIR}/kubernetes/monitoring/namespace.yaml"
kubectl apply -f "${REPO_DIR}/kubernetes/argocd/application-monitoring.yaml"

echo "== Waiting for the monitoring Application to become Synced + Healthy =="
FOUND=""
for i in $(seq 1 60); do
  STATE=$(kubectl -n argocd get application monitoring \
          -o jsonpath='{.status.sync.status} {.status.health.status}' 2>/dev/null || true)
  case "$STATE" in
    *"Synced"*"Healthy"*) FOUND="$STATE"; echo "Argo CD monitoring: $STATE"; break ;;
  esac
  sleep 10
done
if [ -z "${FOUND}" ]; then
  echo "ERROR: monitoring Application not Synced+Healthy after timeout."
  kubectl -n argocd get application monitoring -o yaml || true
  exit 1
fi

echo "== Verifying the monitoring components =="
for i in $(seq 1 30); do
  PROM=$(kubectl -n monitoring get deploy prometheus -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)
  GRA=$(kubectl -n monitoring get deploy grafana -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)
  if [ "${PROM:-0}" = "1" ] && [ "${GRA:-0}" = "1" ]; then
    echo "OK: Prometheus and Grafana are Ready."
    break
  fi
  sleep 10
done
kubectl -n monitoring get deploy,pods

# Prometheus self-check: query the number of UP scrape targets.
echo "== Prometheus targets (UP count) =="
kubectl -n monitoring exec deploy/prometheus -- wget -q -O - 'http://127.0.0.1:9090/api/v1/targets?state=active' 2>/dev/null \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); ups=[t for t in d["data"]["activeTargets"] if t["health"]=="up"]; print("UP targets:", len(ups)); [print(" ", t["scrapeUrl"]) for t in ups]' 2>/dev/null \
  || echo "promtool target query unavailable (check via the Prometheus UI / port-forward)."

echo
echo "================================================================"
echo "Monitoring stack installed (GitOps-managed by Argo CD)."
echo "Access (NOT exposed publicly - use port-forward):"
echo "  Prometheus:  kubectl -n monitoring port-forward svc/prometheus 9090:9090"
echo "  Grafana:     kubectl -n monitoring port-forward svc/grafana 3000:3000"
echo "  Alertmanager: kubectl -n monitoring port-forward svc/alertmanager 9093:9093"
echo "================================================================"
