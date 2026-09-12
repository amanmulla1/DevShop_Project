#!/usr/bin/env bash
# =============================================================================
# DevShop - join a node to the DevShop Kubernetes cluster as a WORKER
#
# Runs the same host prep as the control-plane installer (containerd + kubeadm
# tools), then joins the cluster using the command written by the control-plane
# node at /etc/kubernetes/join/devshop-join-command.sh.
#
# Usage on the worker (as root):
#   sudo bash kubernetes/scripts/join-worker.sh [/path/to/join-command] 
#
# The path argument overrides the default file location - useful when the join
# command is copied over another channel (SSH, tmp, etc.).
#
# Idempotent: if this node is already part of the cluster (kubelet config
# exists) the join step is skipped.
# =============================================================================
set -euo pipefail

JOIN_CMD="${1:-/etc/kubernetes/join/devshop-join-command.sh}"
K8S_VERSION="${K8S_VERSION:-1.30}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run this script as root (e.g. sudo bash kubernetes/scripts/join-worker.sh)"
  exit 1
fi

# --- 1. Only support Ubuntu LTS we understand --------------------------------
# shellcheck disable=SC1091
. /etc/os-release
case "${VERSION_ID:-}" in
  24.04|22.04)
    echo "OK: Ubuntu ${VERSION_ID} (${VERSION_CODENAME}) - supported."
    ;;
  *)
    echo "ERROR: unsupported Ubuntu version '${VERSION_ID}'. Refusing to continue."
    exit 1
    ;;
esac

export DEBIAN_FRONTEND=noninteractive

echo "== 1. Preparing host (swap, kernel modules, networking) =="
swapoff -a 2>/dev/null || true
sed -i '/\s\+swap\s\+/s/^/#/' /etc/fstab || true

modprobe overlay 2>/dev/null || true
modprobe br_netfilter 2>/dev/null || true
cat > /etc/modules-load.d/k8s.conf <<'EOF'
overlay
br_netfilter
EOF

cat > /etc/sysctl.d/99-k8s.conf <<'EOF'
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system >/dev/null

echo "== 2. Installing containerd =="
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl gnupg apt-transport-https

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y --no-install-recommends containerd.io

mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml 2>/dev/null || true
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml || true
grep -q 'SystemdCgroup = true' /etc/containerd/config.toml || \
  sed -i '/^\[plugins\."io.containerd.grpc.v1.cri"\.containerd\.runtimes\.runc\.options\]/a \ \ SystemdCgroup = true' /etc/containerd/config.toml || true

systemctl daemon-reload
systemctl enable --now containerd

echo "== 3. Installing kubeadm, kubelet, kubectl (${K8S_VERSION}) =="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/Release.key" \
  | gpg --dearmor --yes -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/ /" > /etc/apt/sources.list.d/kubernetes.list
apt-get update -y
apt-get install -y --no-install-recommends kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl

echo "== 4. Joining the cluster =="
if [ -f /etc/kubernetes/kubelet.conf ]; then
  echo "This node is already part of a cluster; skipping join (idempotent)."
else
  if [ ! -s "$JOIN_CMD" ]; then
    echo "ERROR: join command file not found or empty: $JOIN_CMD" >&2
    echo "It is written by install-kubernetes.sh on the control-plane node at" >&2
    echo "/etc/kubernetes/join/devshop-join-command.sh. Copy it over, or pass the" >&2
    echo "path as the first argument." >&2
    exit 1
  fi
  echo "Using join command from $JOIN_CMD"
  JOIN_LINE="$(cat "$JOIN_CMD")"
  # Free-tier micros have 1 vCPU; append the NumCPU ignore-flag if the saved
  # join command does not already carry it.
  if ! printf '%s' "$JOIN_LINE" | grep -q -- "--ignore-preflight-errors=NumCPU"; then
    JOIN_LINE="$JOIN_LINE --ignore-preflight-errors=NumCPU"
  fi
  bash -c "$JOIN_LINE"

  echo "Worker join step finished. kubectl remains available on the control-plane node."
fi

echo "== 5. Verifying =="
systemctl status kubelet --no-pager -l 2>/dev/null | head -5 || true
echo
echo "================================================================"
echo "Worker join complete. Verify with (on the control-plane node):"
echo "   kubectl get nodes"
echo "================================================================"