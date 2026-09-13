#!/usr/bin/env bash
# =============================================================================
# DevShop - install the Istio service mesh control plane
#
# Installs the upstream Istio CONTROL PLANE (istiod) and the ingressgateway
# (edge proxy) into the istio-system namespace, configures lean resources for
# the small Free-Tier nodes, enables the tracing pipeline to Jaeger, and labels
# the devshop namespace for automatic Envoy sidecar injection.
#
# The devshop app-level Istio resources (Gateway, VirtualServices,
# DestinationRules, PeerAuthentication) live in Git and are applied by the
# normal Argo CD flow - NOT here. Kiali + Jaeger add-ons are applied by the
# Ansible bootstrap (kubernetes/istio/addons) so the Kiali admin secret can be
# rendered outside Git first - same pattern as the Grafana secret.
#
# Prerequisites:
#   - cluster Ready (install-kubernetes.sh) and kubectl on the control-plane
#   - control-plane host is amd64 (t3.micro = x86_64)
#
# Run as root on the control-plane EC2 host (Ubuntu 24.04):
#   bash kubernetes/scripts/install-istio.sh
#
# Istio 1.23.x is pinned because it officially supports Kubernetes 1.27 - 1.30
# (this cluster is kubeadm 1.30). Do not "upgrade" blindly: newer minors drop
# 1.30 support.
# =============================================================================
set -euo pipefail

ISTIO_VERSION="${ISTIO_VERSION:-1.23.6}"
ISTIO_NS="istio-system"
DEVSHOP_NS="${DEVSHOP_NS:-devshop}"
TMP_DIR="${TMP_DIR:-/tmp/istio-install}"

export KUBECONFIG="${KUBECONFIG:-/root/.kube/config}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run this script as root (e.g. sudo bash kubernetes/scripts/install-istio.sh)"
  exit 1
fi

command -v curl >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl not found"; exit 1; }

echo "== 1. Downloading istioctl ${ISTIO_VERSION} =="
mkdir -p "${TMP_DIR}"
ISTIOCTL="${TMP_DIR}/istio-${ISTIO_VERSION}/bin/istioctl"
if [ ! -x "${ISTIOCTL}" ]; then
  curl -fsSL "https://github.com/istio/istio/releases/download/${ISTIO_VERSION}/istio-${ISTIO_VERSION}-linux-amd64.tar.gz" \
    -o "${TMP_DIR}/istio.tar.gz"
  tar -xzf "${TMP_DIR}/istio.tar.gz" -C "${TMP_DIR}"
  chmod +x "${ISTIOCTL}"
fi
"${ISTIOCTL}" version --remote=false | sed -n '1,3p'

echo "== 2. Creating the istio-system namespace =="
kubectl create namespace "${ISTIO_NS}" 2>/dev/null || true

echo "== 3. Installing the Istio control plane + ingress gateway (profile default) =="
"${ISTIOCTL}" install -y --set profile=default \
  --set values.gateways.istio-ingressgateway.type=NodePort \
  --set meshConfig.defaultConfig.holdApplicationUntilProxyStarts=true \
  --set meshConfig.defaultConfig.tracing.zipkin.address="zipkin.istio-system:9411" \
  --set 'meshConfig.defaultConfig.proxy.resources.requests.cpu=20m' \
  --set 'meshConfig.defaultConfig.proxy.resources.requests.memory=96Mi' \
  --set 'meshConfig.defaultConfig.proxy.resources.limits.cpu=250m' \
  --set 'meshConfig.defaultConfig.proxy.resources.limits.memory=256Mi' \
  --set 'meshConfig.defaultConfig.proxy.accessLogFile=/dev/stdout' \
  --set 'values.pilot.resources.requests.cpu=100m' \
  --set 'values.pilot.resources.requests.memory=256Mi' \
  --set 'values.pilot.resources.limits.cpu=500m' \
  --set 'values.pilot.resources.limits.memory=768Mi' \
  --set 'values.global.proxy.autoInject=enabled'

echo "== 4. Labeling namespaces for sidecar injection =="
# devshop: every app workload joins the mesh (frontends, backend, postgres).
# The namespace is created here if missing (first bootstrap); Argo CD later
# fills it with the app workloads (CreateNamespace + install-argocd.sh).
kubectl create namespace "${DEVSHOP_NS}" 2>/dev/null || true
kubectl label namespace "${DEVSHOP_NS}" istio-injection=enabled --overwrite >/dev/null
# monitoring: ONLY Prometheus and postgres-exporter use sidecars (targeted via
# sidecar.istio.io/inject annotations); every other monitoring workload opts
# out explicitly so the small monitoring node stays lean. The label keeps the
# injector webhook working for the opted-in pods. The namespace is created here
# (it does not exist yet during the first bootstrap) and later populated by the
# Argo CD monitoring Application.
kubectl create namespace monitoring 2>/dev/null || true
kubectl label namespace monitoring istio-injection=enabled --overwrite >/dev/null

echo "== 5. Waiting for istiod + ingressgateway to become Ready =="
kubectl -n "${ISTIO_NS}" rollout status deployment/istiod --timeout=240s 2>/dev/null || true
for i in $(seq 1 30); do
  ISTIOD=$(kubectl -n "${ISTIO_NS}" get deploy istiod -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)
  GW=$(kubectl -n "${ISTIO_NS}" get deploy istio-ingressgateway -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)
  if [ "${ISTIOD:-0}" = "1" ] && [ "${GW:-0}" = "1" ]; then
    echo "OK: istiod and istio-ingressgateway are Ready."
    break
  fi
  sleep 10
done
kubectl -n "${ISTIO_NS}" get pods

echo "== 6. Verification =="
kubectl -n "${ISTIO_NS}" get svc istio-ingressgateway \
  -o jsonpath='{range .spec.ports[*]}{.name}{" nodePort="}{.nodePort}{"\n"}{end}' || true

echo
echo "================================================================"
echo "Istio control plane installed."
echo "  NS labels: $(kubectl get ns "${DEVSHOP_NS}" -o jsonpath='{.metadata.labels.istio-injection}') (${DEVSHOP_NS})"
echo "  istiod:       kubectl -n ${ISTIO_NS} get po -l app=istiod"
echo "  ingress gw:   kubectl -n ${ISTIO_NS} get po -l app=istio-ingressgateway"
echo
echo "Next steps:"
echo "  1) The Argo CD GitOps flow applies the app Gateway/VirtualServices"
echo "     (kubernetes/istio) once the DevShop Application syncs."
echo "  2) The Ansible bootstrap applies the Kiali + Jaeger add-ons and the"
echo "     Kiali admin secret from kubernetes/istio/addons."
echo "  3) Frontend verification now goes through the INGRESSGATEWAY node port"
echo "     (above), not an NGINX ingress."
echo "================================================================"