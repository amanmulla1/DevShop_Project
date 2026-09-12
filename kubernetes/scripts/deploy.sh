#!/usr/bin/env bash
# =============================================================================
# DevShop - Apply the Kubernetes manifests (manual/GitOps bootstrap helper)
#
# Primary deploy mechanism is ARGO CD (GitOps). This script is for:
#   - dry-run validation of the Kustomize overlay,
#   - creating the devshop-secret OUTSIDE the Argo CD / Git path (the Secret is
#     intentionally not managed by Argo CD, so real values never commit), and
#   - a one-off `kubectl apply` if you are not yet using Argo CD, or to verify
#     the rendered manifests.
#
# Usage (on a machine with kubectl/cluster-admin):
#   bash kubernetes/scripts/deploy.sh                 # validate + apply
#   bash kubernetes/scripts/deploy.sh --dry-run       # validate only
#
# The immutable image tag defaults to whatever is in overlays/aws/kustomization.yaml
# (rewritten by Jenkins to the build number during GitOps). Pass --tag to override
# for a one-off apply:
#   bash kubernetes/scripts/deploy.sh --tag 42
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OVERLAY="${REPO_DIR}/kubernetes/overlays/aws"
export KUBECONFIG="${KUBECONFIG:-/root/.kube/config}"

MODE="apply"
TAG=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) MODE="dry-run"; shift ;;
    --tag) TAG="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl not found"; exit 1; }

echo "== Cluster sanity =="
kubectl version --client 2>/dev/null || true
kubectl get nodes
kubectl get namespaces || true

# Optional one-off tag override (kustomize set).
if [ -n "${TAG}" ]; then
  echo "== Setting images to :${TAG} for this apply =="
  for img in devshop-backend devshop-frontend devshop-admin-frontend; do
    # The overlay uses the Kustomize `images` block where `name:` and `newTag:`
    # are on separate lines, so update the newTag line that follows each image name.
    awk -v img="amanmulla1/${img}" -v tag="${TAG}" '
      $0 ~ "name: " img "$" { want=1; print; next }
      want && /newTag:/ { sub(/newTag:.*/, "newTag: " tag); want=0 }
      { print }
    ' "${OVERLAY}/kustomization.yaml" > "${OVERLAY}/kustomization.yaml.tmp" \
      && mv "${OVERLAY}/kustomization.yaml.tmp" "${OVERLAY}/kustomization.yaml"
  done
fi

echo "== 1. Validate manifests (client-side dry-run) =="
kubectl apply -k "${OVERLAY}" --dry-run=client -o name >/dev/null
echo "OK: manifests parse and validate."

if [ "${MODE}" = "dry-run" ]; then
  echo "Dry-run complete. Nothing applied."
  exit 0
fi

echo "== 2. Ensure the devshop namespace =="
kubectl apply -f "${REPO_DIR}/kubernetes/base/namespace.yaml"

echo "== 3. Ensure the devshop-secret (NOT managed by Argo CD) =="
if [ -f "${OVERLAY}/secret.yaml" ]; then
  echo "Applying secret from ${OVERLAY}/secret.yaml (git-ignored)."
  kubectl apply -f "${OVERLAY}/secret.yaml"
else
  echo "No real secret file found (kubernetes/overlays/aws/secret.yaml)."
  echo "Create it from secret.example.yaml and apply it, OR skip if the secret "
  echo "already exists in the cluster:"
  echo "  kubectl -n devshop get secret devshop-secret || echo missing"
fi

echo "== 4. Apply DevShop workloads/config via Kustomize =="
kubectl apply -k "${OVERLAY}"

echo "== 5. Wait for rollouts =="
for dep in postgres backend customer-frontend admin-frontend; do
  echo "Waiting for rollout of deployment/${dep}..."
  kubectl -n devshop rollout status deployment/${dep} --timeout=240s || true
done

echo "== 6. Status =="
kubectl -n devshop get pods,svc,deploy,pvc,ingress,hpa
kubectl -n devshop get secret devshop-secret -o name || true

echo
echo "Deploy complete."
echo "Verify endpoints (Ingress host must map to the node IP in /etc/hosts):"
echo "  kubectl -n devshop get ingress devshop-ingress"
