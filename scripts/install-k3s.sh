#!/usr/bin/env bash
# =============================================================================
# DevShop - Install K3s on the target EC2 (single lightweight server node)
#
# Purpose: reproducible K3s install for the Terraform-provisioned EC2 instance
# (Phase 6). K3s is a CNCF lightweight distribution ideal for a small Free Tier
# EC2. It bundles its own Ingress controller (Traefik) and storage class
# (local-path), so NO EKS / NAT Gateway / RDS / paid LB is introduced.
#
# Run as root (or with sudo) ON THE EC2 HOST:
#   bash scripts/install-k3s.sh
#
# No EC2 IP or credentials are hard-coded. After install, kubectl is available
# on the node via /etc/rancher/k3s/k3s.yaml.
# =============================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run this script as root (e.g. sudo bash scripts/install-k3s.sh)"
  exit 1
fi

# --- 1. Verify OS ------------------------------------------------------------
if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemd not found - K3s expects a systemd-based Linux (Ubuntu/Debian)."
  exit 1
fi
. /etc/os-release
echo "Installing K3s on: ${PRETTY_NAME:-this host}"

# --- 2. Install K3s (single server node) --------------------------------------
if command -v k3s >/dev/null 2>&1; then
  echo "K3s already present; skipping install. Run: kubectl get nodes"
else
  echo "Installing K3s server ..."
  curl -sfL https://get.k3s.io | sh -
  systemctl enable k3s
  systemctl start k3s
fi

# --- 3. kubectl access --------------------------------------------------------
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
if [ ! -f /root/.kube/config ]; then
  install -d -o root -g root /root/.kube
  install -o root -g root -m 0600 /etc/rancher/k3s/k3s.yaml /root/.kube/config
fi
# Convenience for interactive use: set KUBECONFIG in the login shell
if ! grep -q '/etc/rancher/k3s/k3s.yaml' /root/.bashrc 2>/dev/null; then
  echo "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> /root/.bashrc
fi

# --- 4. Verify node + storage ------------------------------------------------
echo "== kubectl version --client =="; kubectl version --client 2>/dev/null || true
echo "== kubectl get nodes ==";        kubectl get nodes
echo "== kubectl get storageclass =="; kubectl get storageclass

echo
echo "K3s installed. Verify the node is Ready and that a storage class"
echo "(typically 'local-path') is listed above before applying manifests."
echo "Kubeconfig: /etc/rancher/k3s/k3s.yaml  (export KUBECONFIG to use kubectl)"
echo "Next: cp kubernetes/secret.example.yaml kubernetes/secret.yaml (fill secrets),"
echo "      then: bash scripts/deploy-kubernetes.sh"
