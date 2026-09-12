#!/usr/bin/env bash
# =============================================================================
# DevShop - bootstrap a Kubernetes CONTROL-PLANE node (kubeadm, upstream only)
#
#   - containerd            (container runtime)
#   - kubeadm/kubelet/kubectl
#   - Calico                (open-source CNI)
#   - Kubernetes Metrics Server
#
# No K3s / MicroK8s / Minikube / Kind / managed services.
#
# Run as root on the control-plane EC2 host (Ubuntu 24.04):
#   sudo bash kubernetes/scripts/install-kubernetes.sh
#
# Worker nodes use kubernetes/scripts/join-worker.sh with the join command this
# script writes to /etc/kubernetes/join/devshop-join-command.sh.
#
# Notes
#   - The control-plane stays TAINTED (default kubeadm behaviour), so user
#     workloads land on the workers.
#   - Free-tier t3.micro nodes have 1 vCPU; the NumCPU preflight check is
#     deliberately ignored so a micro can still initialize.
#   - Re-runnable: skips kubeadm init once admin.conf exists. The join token is
#     regenerated each run (24h lifetime), workers joining again are no-ops.
# =============================================================================
set -euo pipefail

K8S_VERSION="${K8S_VERSION:-1.30}"
CNI_POD_CIDR="${CNI_POD_CIDR:-10.244.0.0/16}"   # must match the Calico manifest
JOIN_COMMAND_FILE="/etc/kubernetes/join/devshop-join-command.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run this script as root (e.g. sudo bash kubernetes/scripts/install-kubernetes.sh)"
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

# systemd cgroup driver is required by kubelet.
mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml 2>/dev/null || true
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml || true
grep -q 'SystemdCgroup = true' /etc/containerd/config.toml || \
  sed -i '/^\[plugins\."io.containerd.grpc.v1.cri"\.containerd\.runtimes\.runc\.options\]/a \ \ SystemdCgroup = true' /etc/containerd/config.toml || true

systemctl daemon-reload
systemctl enable --now containerd
echo "containerd: $(containerd --version 2>/dev/null || echo installed)"

echo "== 3. Installing kubeadm, kubelet, kubectl (${K8S_VERSION}) =="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/Release.key" \
  | gpg --dearmor --yes -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/ /" > /etc/apt/sources.list.d/kubernetes.list
apt-get update -y
apt-get install -y --no-install-recommends kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl
echo "kubelet: $(kubelet --version 2>/dev/null || echo installed)"

echo "== 4. Initializing the control plane =="
if [ ! -f /etc/kubernetes/admin.conf ]; then
  # --ignore-preflight-errors=NumCPU : free-tier micros have 1 vCPU.
  kubeadm init \
    --pod-network-cidr="${CNI_POD_CIDR}" \
    --ignore-preflight-errors=NumCPU
else
  echo "Control plane already initialized; skipping kubeadm init."
fi

echo "== 5. Configuring kubectl =="
export KUBECONFIG=/etc/kubernetes/admin.conf
mkdir -p /root/.kube
cp -f /etc/kubernetes/admin.conf /root/.kube/config
chmod 600 /root/.kube/config
if id ubuntu >/dev/null 2>&1; then
  mkdir -p /home/ubuntu/.kube
  cp -f /etc/kubernetes/admin.conf /home/ubuntu/.kube/config
  chown -R ubuntu:ubuntu /home/ubuntu/.kube
  grep -q KUBECONFIG /home/ubuntu/.bashrc 2>/dev/null || \
    echo 'export KUBECONFIG=/home/ubuntu/.kube/config' >> /home/ubuntu/.bashrc
fi
grep -q KUBECONFIG /root/.bashrc 2>/dev/null || \
  echo 'export KUBECONFIG=/root/.kube/config' >> /root/.bashrc

# The control plane keeps its default taint. Do NOT untaint it -- app pods and
# monitoring are pinned to the workers. For a single-box cluster you can remove
# the taint manually:
#   kubectl taint nodes --all node-role.kubernetes.io/control-plane-

echo "== 6. Writing the worker join command =="
mkdir -p "$(dirname "$JOIN_COMMAND_FILE")"
kubeadm token create --print-join-command > "$JOIN_COMMAND_FILE" 2>/dev/null || true
# Append the flag-free-form of the join so workers with 1 vCPU also pass.
if [ -s "$JOIN_COMMAND_FILE" ]; then
  chmod 600 "$JOIN_COMMAND_FILE"
  echo "Join command written to $JOIN_COMMAND_FILE"
else
  echo "WARN: could not create a fresh join token (cluster maybe not ready yet)."
fi

echo "== 7. Installing Calico CNI =="
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/calico.yaml || \
  kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/master/manifests/calico.yaml

echo "== 8. Installing Kubernetes Metrics Server =="
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

echo "== 9. Waiting for control-plane + CNI to become healthy =="
for i in $(seq 1 30); do
  READY=$(kubectl get pods -A --no-headers 2>/dev/null | awk '{s+=$4} END {print s+0}')
  TOTAL=$(kubectl get pods -A --no-headers 2>/dev/null | wc -l)
  if [ "${TOTAL:-0}" -gt 0 ] && [ "${READY:-0}" -eq "${TOTAL}" ]; then
    echo "All ${TOTAL} pods healthy."; break
  fi
  sleep 5
done
kubectl get pods -A

echo
echo "================================================================"
echo "Control-plane node ready. Next:"
echo "  1) Run join-worker.sh on every worker (uses the join command above)"
echo "  2) Then install storage / ingress / Argo CD:"
echo "       bash kubernetes/scripts/install-storage.sh"
echo "       bash kubernetes/scripts/install-ingress.sh"
echo "       bash kubernetes/scripts/install-argocd.sh"
echo "================================================================"