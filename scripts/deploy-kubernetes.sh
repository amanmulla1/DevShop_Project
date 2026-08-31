#!/usr/bin/env bash
# =============================================================================
# DevShop - Deploy (or update) the DevShop application on K3s
#
# Usage (run on the node with kubectl access, or from a machine with KUBECONFIG
# pointing at the cluster):
#
#   bash scripts/deploy-kubernetes.sh                      # deploys latest tag
#   bash scripts/deploy-kubernetes.sh --tag 42             # immutable build #42
#   bash scripts/deploy-kubernetes.sh --tag 42 --registry amanmulla1
#
# This script:
#   1. Dry-run validates the full Kustomize bundle.
#   2. Ensures a Secret exists (creates kubernetes/secret.yaml from the safe
#      example template, and REMINDS you to set real values).
#   3. Applies namespace -> config -> postgres -> backend -> frontends -> ingress.
#   4. Sets each Deployment to the requested immutable image tag.
#   5. Waits for rollouts and prints cluster status.
#
# NOTE: scripts/install-k3s.sh must have been run first (cluster Ready).
# Default registry is amanmulla1 (override with --registry).
# Do NOT commit kubernetes/secret.yaml (it is git-ignored).
# =============================================================================
set -euo pipefail

REGISTRY="${REGISTRY:-amanmulla1}"
TAG="${TAG:-latest}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_DIR="${DIR}/kubernetes"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag)      TAG="$2"; shift 2 ;;
    --registry) REGISTRY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl not found"; exit 1; }

echo "== Cluster sanity =="
kubectl version --client
kubectl get nodes
kubectl get storageclass

# --- Ensure a Secret exists (never commit the real one) ----------------------
if [ ! -f "${K8S_DIR}/secret.yaml" ]; then
  echo "== Creating kubernetes/secret.yaml from the example template =="
  cp "${K8S_DIR}/secret.example.yaml" "${K8S_DIR}/secret.yaml"
  echo "WARNING: kubernetes/secret.yaml was created with PLACEHOLDER values."
  echo "         Edit it (base64) with REAL DB_PASSWORD / JWT_SECRET / "
  echo "         ADMIN_PASSWORD before deploying to anything non-local."
fi

# --- Validate with dry-run ---------------------------------------------------
echo "== Dry-run validation (client-side) =="
kubectl apply -k "${K8S_DIR}" --dry-run=client -o name >/dev/null
echo "OK: manifests parse and validate."

# --- Apply in dependency order (kubectl handles ordering within the bundle) --
echo "== Applying DevShop resources =="
kubectl apply -k "${K8S_DIR}"

# --- Set immutable image tags ------------------------------------------------
echo "== Setting Deployments to ${REGISTRY}/<image>:${TAG} =="
kubectl set image deployment/backend backend="${REGISTRY}/devshop-backend:${TAG}" -n devshop
kubectl set image deployment/customer-frontend customer-frontend="${REGISTRY}/devshop-frontend:${TAG}" -n devshop
kubectl set image deployment/admin-frontend admin-frontend="${REGISTRY}/devshop-admin-frontend:${TAG}" -n devshop

# --- Wait for rollouts -------------------------------------------------------
for dep in postgres backend customer-frontend admin-frontend; do
  echo "== Waiting for rollout of deployment/${dep} =="
  kubectl rollout status deployment/${dep} -n devshop --timeout=180s
done

# --- Print status ------------------------------------------------------------
echo "== Status =="
kubectl get pods,svc,deploy,pvc,ingress,hpa -n devshop
kubectl get secret devshop-secret -n devshop -o name

echo
echo "Deployment complete. Tag: ${REGISTRY}/<image>:${TAG}"
echo "Verify app via Ingress (see kubernetes/README.md for host/DNS setup)."
