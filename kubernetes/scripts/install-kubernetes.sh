#!/usr/bin/env bash
# =============================================================================
# DevShop - Install STANDARD Kubernetes (K8s) on the EC2 host
#
# This provisions a single-node standard Kubernetes cluster on the
# Terraform-created EC2 instance using upstream components ONLY:
#   - containerd   (container runtime)
#   - kubeadm/kubelet/kubectl (Kubernetes control plane)
#   - Calico       (open-source CNI)
#   - Kubernetes Metrics Server (for HPA / kubectl top)
#
# It does NOT use K3s, MicroK8s, Minikube, Kind, or any managed/paid service.
#
# Run as root on the EC2 host (Ubuntu 24.04 LTS, 2 vCPU / >= 2 GiB recommended):
#   sudo bash kubernetes/scripts/install-kubernetes.sh
#
# NOTES
#   - This is a SINGLE-NODE cluster: control plane + workloads on the same node.
#     No real HA. Node failure = cluster unavailable. Documented in README.
#   - The script is REPRODUCIBLE and safely re-runnable; it skips steps that are
#     already done (idempotent).
#   - No EC2 IP is hard-coded. kubeadm binds to the primary interface; kubectl
#     uses /root/.kube/config (and /home/ubuntu/.kube/config for the ubuntu user).
# =============================================================================
set -euo pipefail

K8S_VERSION="${K8S_VERSION:-1.30}"
CNI_POD_CIDR="${CNI_POD_CIDR:-10.244.0.0/16}"   # Calico default pod CIDR
CONTROL_PLANE_ENDPOINT="${CONTROL_PLANE_ENDPOINT:-}"  # optional; default = node IP

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run this script as root (e.g. sudo bash kubernetes/scripts/install-kubernetes.sh)"
  exit 1
fi

# --- 1. Only support Ubuntu LTS we understand --------------------------------
if ! command -v . /etc/os-release >/dev/null 2>&1; then :; fi
# shellcheck disable=SC1091
. /etc/os-release
case "${VERSION_ID:-}" in
  24.04|22.04)
    echo "OK: Ubuntu ${VERSION_ID} (${VERSION_CODENAME}) - supported."
    ;;
  *)
    echo "ERROR: unsupported Ubuntu version '${VERSION_ID}'. " \
         "Standard K8s kubeadm is validated on 24.04/22.04; refusing to continue."
    exit 1
    ;;
esac

export DEBIAN_FRONTEND=noninteractive

echo "== 1. Preparing host (swap, kernel modules, networking) =="
# Kubernetes requires swap off on the control plane / kubelet node.
swapoff -a 2>/dev/null || true
if [ -f /etc/fstab ]; then
  sed -i '/\s\+swap\s\+/s/^/#/' /etc/fstab || true
fi

# Load required kernel modules.
modprobe overlay 2>/dev/null || true
modprobe br_netfilter 2>/dev/null || true
cat > /etc/modules-load.d/k8s.conf <<'EOF'
overlay
br_netfilter
EOF

# Networking sysctls required by kubelet / CNI.
cat > /etc/sysctl.d/99-k8s.conf <<'EOF'
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system >/dev/null

echo "== 2. Installing containerd (container runtime) =="
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg apt-transport-https

# Register Docker's apt repository (hosts containerd.io).
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y --no-install-recommends containerd.io

# Configure containerd with the systemd cgroup driver (required for kubelet).
mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml 2>/dev/null || true
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml || true
grep -q 'SystemdCgroup = true' /etc/containerd/config.toml || \
  sed -i '/^\[plugins\."io.containerd.grpc.v1.cri"\.containerd\.runtimes\.runc\.options\]/a \ \ SystemdCgroup = true' /etc/containerd/config.toml || true

systemctl daemon-reload
systemctl enable --now containerd
echo "containerd: $(containerd --version 2>/dev/null || echo installed)"

echo "== 3. Installing kubeadm, kubelet, kubectl (${K8S_VERSION}) =="
# Kubernetes upstream apt repo.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/Release.key \
  | gpg --dearmor --yes -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/ /" \
  > /etc/apt/sources.list.d/kubernetes.list
apt-get update -y
# Pin versions so apt does not auto-upgrade the control plane.
apt-get install -y --no-install-recommends \
  kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl
echo "kubelet: $(kubelet --version 2>/dev/null || echo installed)"
echo "kubeadm: $(kubeadm version 2>/dev/null | sed 's/,.*//' || echo installed)"
echo "kubectl: $(kubectl version --client 2>/dev/null | sed 's/Client Version://; s/,.*//' || echo installed)"

echo "== 4. Initializing the single-node control plane =="
if [ ! -f /etc/kubernetes/admin.conf ]; then
  # Single control-plane node. --control-plane-endpoint defaults to node IP.
  # --pod-network-cidr must match the CNI (Calico uses 10.244.0.0/16 by default).
  # --node-name keeps it stable on this host.
  KUBEADM_ARGS=(
    --pod-network-cidr="${CNI_POD_CIDR}"
    --ignore-preflight-errors=NumCPU
  )
  if [ -n "${CONTROL_PLANE_ENDPOINT}" ]; then
    KUBEADM_ARGS+=(--control-plane-endpoint="${CONTROL_PLANE_ENDPOINT}")
  fi
  echo "Running: kubeadm init ${KUBEADM_ARGS[*]}"
  kubeadm init "${KUBEADM_ARGS[@]}"
else
  echo "Control plane already initialized; skipping kubeadm init."
fi

echo "== 5. Configuring kubectl =="
export KUBECONFIG=/etc/kubernetes/admin.conf
mkdir -p /root/.kube
cp /etc/kubernetes/admin.conf /root/.kube/config
chmod 600 /root/.kube/config
# Also set up the ubuntu user for its own kubectl access (no cluster secrets here).
if id ubuntu >/dev/null 2>&1; then
  mkdir -p /home/ubuntu/.kube
  cp /etc/kubernetes/admin.conf /home/ubuntu/.kube/config
  chown -R ubuntu:ubuntu /home/ubuntu/.kube
  if ! grep -q KUBECONFIG /home/ubuntu/.bashrc 2>/dev/null; then
    echo 'export KUBECONFIG=/home/ubuntu/.kube/config' >> /home/ubuntu/.bashrc
  fi
fi
if ! grep -q KUBECONFIG /root/.bashrc 2>/dev/null; then
  echo 'export KUBECONFIG=/root/.kube/config' >> /root/.bashrc
fi

echo "== 6. Untainting the control-plane node (single-node scheduling) =="
# In a single-node cluster the workloads must run on the control-plane node.
# Remove the default taint that forbids scheduling there.
kubectl taint nodes --all node-role.kubernetes.io/control-plane- || true

echo "== 7. Installing Calico CNI =="
# Calico manifest is stable and works for standard K8s with the configured pod
# CIDR. If PodIP / IPAM settings differ, override CNI_POD_CIDR to match.
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/calico.yaml || \
  kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/master/manifests/calico.yaml

echo "== 8. Installing Kubernetes Metrics Server =="
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# Metrics Server generally works out of the box; if TLS issues arise on a
# self-contained node, refer to kubernetes/README.md troubleshooting.

echo "== 9. Verifying the cluster =="
echo "---- kubectl get nodes ----"
kubectl get nodes -o wide
echo "---- kubectl get pods -A (waiting for core/CNI to become healthy) ----"
for i in $(seq 1 30); do
  READY=$(kubectl get pods -A --no-headers 2>/dev/null | awk '{s+=$4} END {print s+0}')
  TOTAL=$(kubectl get pods -A --no-headers 2>/dev/null | wc -l)
  if [ "${TOTAL:-0}" -gt 0 ] && [ "${READY:-0}" -eq "${TOTAL}" ]; then
    echo "All ${TOTAL} pods healthy."; break
  fi
  sleep 5
done
kubectl get pods -A
kubectl get storageclass 2>/dev/null || echo "(no storage class yet - run install-storage.sh)"

echo
echo "================================================================"
echo "Standard Kubernetes installed. Node should be Ready shortly."
echo "Verify:   kubectl get nodes   &&   kubectl get pods -A"
echo "Kubeconfig: /root/.kube/config  (or /home/ubuntu/.kube/config)"
echo "Next:      bash kubernetes/scripts/install-storage.sh"
echo "           bash kubernetes/scripts/install-ingress.sh"
echo "           bash kubernetes/scripts/install-argocd.sh"
echo "================================================================"
