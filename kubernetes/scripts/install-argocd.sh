#!/usr/bin/env bash
# =============================================================================
# DevShop - Install Argo CD (GitOps) on the standard Kubernetes cluster
#
# Installs the official open-source Argo CD into the `argocd` namespace, then
# registers the DevShop Application (kubernetes/argocd/application.yaml) which
# points Argo CD at the GitHub repo's kubernetes/overlays/aws Kustomize base.
#
# Run after install-kubernetes.sh (and optionally install-storage/ingress):
#   bash kubernetes/scripts/install-argocd.sh
#
# SECURITY: the Argo CD admin UI is NOT exposed publicly. Use kubectl
# port-forward to view it (see output at the end). The initial admin password is
# retrieved from the argocd-initial-admin-secret (printed once at the end).
# Rotate it after first login.
# =============================================================================
set -euo pipefail

export KUBECONFIG="${KUBECONFIG:-/root/.kube/config}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl not found"; exit 1; }

echo "== Installing Argo CD (official manifests) =="
# Pin a known-good release so the install is reproducible.
ARGO_VERSION="${ARGO_VERSION:-v2.12.4}"
kubectl create namespace argocd 2>/dev/null || true
kubectl apply -n argocd -f "https://raw.githubusercontent.com/argoproj/argo-cd/${ARGO_VERSION}/manifests/install.yaml"

echo "== Waiting for Argo CD components =="
kubectl -n argocd rollout status statefulset/argocd-server --timeout=180s 2>/dev/null || true
for i in $(seq 1 30); do
  READY=$(kubectl -n argocd get pods --no-headers 2>/dev/null | awk '$3=="Running"' | wc -l)
  TOTAL=$(kubectl -n argocd get pods --no-headers 2>/dev/null | wc -l)
  if [ "${TOTAL:-0}" -gt 0 ] && [ "${READY:-0}" -eq "${TOTAL}" ]; then
    echo "Argo CD pods Running (${READY}/${TOTAL})."; break
  fi
  sleep 5
done
kubectl -n argocd get pods

echo "== Registering the DevShop Application (GitOps source of truth) =="
kubectl apply -f "${REPO_DIR}/kubernetes/argocd/namespace.yaml"
kubectl apply -f "${REPO_DIR}/kubernetes/argocd/application.yaml"

echo "== Verify the Application =="
for i in $(seq 1 20); do
  STATE=$(kubectl -n argocd get application devshop -o jsonpath='{.status.sync.status} {.status.health.status}' 2>/dev/null || true)
  [ -n "${STATE}" ] && break
  sleep 5
done
echo "DevShop Application state: ${STATE:-unknown}"
kubectl -n argocd get applications

echo
echo "================================================================"
echo "Argo CD installed."
# Do not print secrets. Print the command to retrieve the ephemeral admin
# password instead of the value itself.
echo "Initial admin password (retrieve; rotate after first login):"
echo "  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo"
echo
echo "Access the Argo CD UI safely via port-forward (NOT exposed publicly):"
echo "  kubectl -n argocd port-forward svc/argocd-server 8080:443"
echo "  open https://localhost:8080  (username: admin)"
echo
echo "The DevShop Application auto-syncs from:"
echo "  https://github.com/amanmulla1/DevShop_Project.git  (path kubernetes/overlays/aws)"
echo "================================================================"
