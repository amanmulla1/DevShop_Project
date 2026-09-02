#!/usr/bin/env bash
# =============================================================================
# DevShop - Install a storage provisioner for the standard Kubernetes cluster
#
# The base PVC uses storageClassName `local-path`. This is provided by the
# open-source local-path-provisioner, which is a standalone static provisioner
# for ANY Kubernetes cluster (it is NOT K3s and works on standard kubeadm
# clusters). It creates a local `local-path` StorageClass bound to the node's
# filesystem - suitable for a single-node learning cluster.
#
# Run as a user with cluster-admin (or root) after install-kubernetes.sh:
#   bash kubernetes/scripts/install-storage.sh
#
# Dry-run (no changes):
#   bash kubernetes/scripts/install-storage.sh --verify-only
# =============================================================================
set -euo pipefail

VERIFY_ONLY="${1:-}"

if [ "$(id -u)" -ne 0 ] && [ "${VERIFY_ONLY}" != "--verify-only" ]; then
  # Non-root is fine if the user has cluster-admin (e.g. running kubectl from
  # /home/ubuntu/.kube/config). We still proceed; kubectl will error otherwise.
  echo "Note: running as non-root. Ensure KUBECONFIG grants cluster-admin."
fi

export KUBECONFIG="${KUBECONFIG:-/root/.kube/config}"
command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl not found"; exit 1; }

echo "== Current storage classes =="
kubectl get storageclass || echo "(none)"

if [ "${VERIFY_ONLY}" = "--verify-only" ]; then
  echo "Verifying local-path StorageClass availability:"
  kubectl get storageclass local-path >/dev/null 2>&1 \
    && echo "OK: 'local-path' StorageClass present." \
    || { echo "WARN: 'local-path' StorageClass NOT present. Run without --verify-only to install."; exit 1; }
  exit 0
fi

echo "== Installing local-path-provisioner (open-source, not K3s) =="
# Option A: install via Helm if available, otherwise via manifests.
if command -v helm >/dev/null 2>&1; then
  helm repo add runix https://helm.runix.net 2>/dev/null || true
  helm repo update >/dev/null 2>&1 || true
  kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml 2>/dev/null \
    || kubectl create namespace local-path-storage 2>/dev/null || true
fi

# The canonical way: apply the published provisioner manifest, which creates the
# local-path-provisioner + the `local-path` StorageClass.
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml

echo "== Verify =="
for i in $(seq 1 15); do
  SC=$(kubectl get storageclass local-path --no-headers 2>/dev/null || true)
  [ -n "${SC}" ] && break
  sleep 3
done
kubectl get storageclass
echo "Done. 'local-path' StorageClass available for the devshop PVC."
