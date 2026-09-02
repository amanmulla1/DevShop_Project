#!/usr/bin/env bash
# =============================================================================
# DevShop - Install the NGINX Ingress Controller (open source)
#
# Standard Kubernetes uses an Ingress Controller to route HTTP(S) to Services.
# This installs the official open-source NGINX Ingress Controller (no paid AWS
# load balancer). On this single-node cluster it is exposed via NodePort (the
# controller Service maps to node ports; optionally hostNetwork).
#
# Run after install-kubernetes.sh (cluster Ready):
#   bash kubernetes/scripts/install-ingress.sh
#
# After install, the devshop Ingress (overlays/aws/ingress.yaml) with
# ingressClassName: nginx routes to the frontends.
# =============================================================================
set -euo pipefail

export KUBECONFIG="${KUBECONFIG:-/root/.kube/config}"
command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl not found"; exit 1; }

echo "== Installing NGINX Ingress Controller (ingress-nginx) =="

# Preferred: Helm (cleanest for NGINX ingress). Fallback: official manifests.
if command -v helm >/dev/null 2>&1; then
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
  helm repo update >/dev/null 2>&1 || true
  helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx --create-namespace \
    --set controller.service.type=NodePort \
    --set controller.hostNetwork=false
else
  # Official bare-metal deployment (NodePort).
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.2/deploy/static/provider/baremetal/deploy.yaml
fi

echo "== Wait for the controller to be Ready =="
kubectl wait --namespace ingress-nginx \
  --for=condition=Ready pod \
  --selector=app.kubernetes.io/component=controller --timeout=180s 2>/dev/null || true

kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx ingress-nginx-controller

echo
echo "NGINX Ingress Controller installed."
echo "Node ports: $(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.ports[?(@.name=="http")].nodePort}') (http)"
echo "Map your Ingress host (e.g. devshop.local) in /etc/hosts to the node's public IP,"
echo "then apply the app:  bash kubernetes/scripts/deploy.sh"
