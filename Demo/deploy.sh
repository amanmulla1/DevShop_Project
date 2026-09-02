#!/usr/bin/env bash
# =============================================================================
# DevShop Demo - Simple kubeadm Kubernetes deployment (Demo/deploy.sh)
#
# Deploys the EXISTING DevShop application (frontend + admin + backend +
# PostgreSQL) to a STANDARD kubeadm Kubernetes cluster using only basic
# resources: Namespace, ConfigMap, Secret, PVC, Deployment, Service (NodePort).
#
#   cd Demo
#   ./deploy.sh          # deploy using the Docker Hub images
#   ./deploy.sh --build  # build the images from application/ and load locally
#   ./deploy.sh --delete # remove the demo deployment
#   ./deploy.sh status   # print current status of the demo
#
# NodePort exposure:
#   Customer storefront (frontend):  http://<node-ip>:30080
#   Admin dashboard (admin-frontend): http://<node-ip>:30081
#   (Backend is ClusterIP-only; the frontends' nginx reverse-proxies /api to it.)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/application"
MANIFESTS_DIR="$SCRIPT_DIR/manifests"

NAMESPACE="devshop-demo"
SECRET_NAME="devshop-secret"
CONFIG_NAME="devshop-config"

BACKEND_IMAGE="${BACKEND_IMAGE:-amanmulla1/devshop-backend:latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-amanmulla1/devshop-frontend:latest}"
ADMIN_IMAGE="${ADMIN_IMAGE:-amanmulla1/devshop-admin-frontend:latest}"

CUSTOMER_NODE_PORT="${CUSTOMER_NODE_PORT:-30080}"
ADMIN_NODE_PORT="${ADMIN_NODE_PORT:-30081}"
PGBACKEND_APP_PORT=80   # frontend nginx container port
BACKEND_PORT=8080
POSTGRES_PORT=5432

# ---- helpers ----------------------------------------------------------------
log()  { printf '\033[1;36m[devshop-demo]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[devshop-demo:ERROR]\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

ensure_kubectl() {
  have kubectl || die "kubectl not found on PATH (see README prerequisites)."
  kubectl cluster-info >/dev/null 2>&1 \
    || die "Cannot reach a Kubernetes cluster. Is 'kubectl' configured for a kubeadm cluster?"
}

# Generate/refresh the Secret with random credentials (never committed).
apply_secret() {
  local state_file="$SCRIPT_DIR/.demo-secret-state"
  local db_user="devshop"
  local db_pass jwt admin_pass

  if [ -s "$state_file" ]; then
    # Reuse previously generated secrets so a redeploy does not rotate them.
    # shellcheck disable=SC1090
    source "$state_file"
    log "Reusing previously generated secrets (from $state_file)."
  else
    log "Generating random secrets..."
    db_pass="$(openssl rand -base64 24 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 20 || true)"
    jwt="$(openssl rand -base64 48 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 48 || true)"
    admin_pass="$(openssl rand -base64 18 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 16 || true)"
    [ -n "$db_pass" ] && [ -n "$jwt" ] && [ -n "$admin_pass" ] \
      || die "Failed to generate random secrets (openssl present?)."
    cat > "$state_file" <<EOF
db_user=$db_user
db_pass=$db_pass
jwt=$jwt
admin_pass=$admin_pass
EOF
    chmod 600 "$state_file"
    log "Wrote new secrets to $state_file (mode 600, git-ignored)."
  fi

  # Delete then recreate so --from-literal values are always authoritative.
  kubectl -n "$NAMESPACE" delete secret "$SECRET_NAME" --ignore-not-found=true >/dev/null 2>&1
  kubectl -n "$NAMESPACE" create secret generic "$SECRET_NAME" \
    --from-literal=DB_USERNAME="$db_user" \
    --from-literal=DB_PASSWORD="$db_pass" \
    --from-literal=JWT_SECRET="$jwt" \
    --from-literal=ADMIN_PASSWORD="$admin_pass"
  log "Secret '$SECRET_NAME' applied."
}

# ---- image availability ----------------------------------------------------
# cluster-runtime-images:
#   Returns non-zero if the node's container runtime can pull from Docker Hub
#   (checks the images are reachable). We simply *try* to pull via the image
#   importer below; if that fails we fall back to building locally.
detect_runtime() {
  # kubeadm uses containerd. Determine the import tool available on the control-plane node.
  if have nerdctl; then echo "nerdctl";
  elif have ctr; then echo "ctr";
  else echo "none"; fi
}

load_image() { # $1=image:$tag
  local image="$1" rt tar
  rt="$(detect_runtime)"
  tar="/tmp/$(basename "$image").tar"
  log "Saving '$image' with Docker..."
  docker save "$image" -o "$tar" || return 1
  case "$rt" in
    nerdctl)
      log "Loading '$image' into containerd (k8s.io) with nerdctl..."
      nerdctl --namespace k8s.io image import "$tar" || return 1
      ;;
    ctr)
      log "Loading '$image' into containerd (k8s.io) with ctr..."
      sudo ctr -n k8s.io images import "$tar" || return 1
      ;;
    *)
      rm -f "$tar"
      return 1
      ;;
  esac
  rm -f "$tar"
}

image_present_locally() { # $1=image:$tag  (best-effort)
  local image="$1" rt
  rt="$(detect_runtime)"
  case "$rt" in
    nerdctl) nerdctl --namespace k8s.io image inspect "$image" >/dev/null 2>&1 ;;
    ctr)     sudo ctr -n k8s.io images check "$image" >/dev/null 2>&1 ;;
    *)       return 1 ;;
  esac
}

build_and_load() {
  log "== Building images from '$APP_DIR' and loading into the cluster runtime =="
  have docker || die "--build requires Docker (to build + save the images)."

  local rt
  rt="$(detect_runtime)"
  [ "$rt" != "none" ] || die "No containerd importer found (need 'ctr' or 'nerdctl' on PATH)."

  local components=(backend frontend admin-frontend)
  local images=( "$BACKEND_IMAGE" "$FRONTEND_IMAGE" "$ADMIN_IMAGE" )
  for i in "${!components[@]}"; do
    local comp="${components[$i]}" img="${images[$i]}"
    log "Building image '$img' from application/$comp ..."
    ( cd "$APP_DIR/$comp" && docker build -t "$img" . ) || die "Docker build failed for $comp."
  done

  for img in "${images[@]}"; do
    log "Present: $(image_present_locally "$img" && echo yes || echo no)"
    if ! image_present_locally "$img"; then
      load_image "$img" || die "Failed to load '$img' into the cluster runtime."
      log "Loaded '$img' into the runtime."
    else
      log "Image '$img' already present in runtime; skipping load."
    fi
  done
}

ensure_images() { # $1 = "hub" | "build"
  case "$1" in
    build)
      build_and_load
      ;;
    *)
      # Default: let containerd pull from Docker Hub (imagePullPolicy: IfNotPresent).
      log "Using Docker Hub images (imagePullPolicy: IfNotPresent)."
      log "   If the cluster cannot reach Docker Hub, rerun with:  ./deploy.sh --build"
      ;;
  esac
}

# ---- main actions -----------------------------------------------------------
deploy() {
  ensure_kubectl

  log "Deploying DevShop demo to namespace '$NAMESPACE' on a kubeadm cluster."

  # 1. Namespace + config (non-secret).
  kubectl apply -f "$MANIFESTS_DIR/namespace.yaml"
  kubectl apply -f "$MANIFESTS_DIR/configmap.yaml"

  # 2. Secret (with generated credentials).
  apply_secret

  # 3. PostgreSQL (PVC + Deployment + Service).
  kubectl apply -f "$MANIFESTS_DIR/postgres-pvc.yaml"
  kubectl apply -f "$MANIFESTS_DIR/postgres-deployment.yaml"
  kubectl apply -f "$MANIFESTS_DIR/postgres-service.yaml"

  # 4. Backend (Deployment + ClusterIP Service). Requires postgres to be up.
  kubectl apply -f "$MANIFESTS_DIR/backend-deployment.yaml"
  kubectl apply -f "$MANIFESTS_DIR/backend-service.yaml"

  # 5. Frontends (Deployment + NodePort Services).
  kubectl apply -f "$MANIFESTS_DIR/customer-frontend-deployment.yaml"
  kubectl apply -f "$MANIFESTS_DIR/customer-frontend-service.yaml"
  kubectl apply -f "$MANIFESTS_DIR/admin-frontend-deployment.yaml"
  kubectl apply -f "$MANIFESTS_DIR/admin-frontend-service.yaml"

  # 6. Wait for every Deployment to become Ready.
  log "Waiting for Deployments to become ready (this can take a few minutes)..."
  local deps=(postgres backend customer-frontend admin-frontend)
  local ok=0
  for dep in "${deps[@]}"; do
    printf '   - %-18s' "$dep"
    if kubectl -n "$NAMESPACE" rollout status deployment/"$dep" --timeout=300s >/dev/null 2>&1; then
      printf ' Ready\n'; ok=$((ok+1))
    else
      printf ' FAILED\n'
      kubectl -n "$NAMESPACE" describe deployment/"$dep" 2>/dev/null | sed 's/^/       /' | tail -15
    fi
  done

  # 7. Print access information.
  print_access
  if [ "$ok" -lt "${#deps[@]}" ]; then
    printf '\n\033[1;33m[devshop-demo] Some Deployments are NOT ready.\033[0m\n'
    printf '   Run:  kubectl -n %s get pods  \n   to inspect, or ./deploy.sh status\n' "$NAMESPACE"
    exit 1
  fi
  log "Deployment complete."
}

print_access() {
  local node_ips
  node_ips="$(kubectl get nodes -o jsonpath='{range .items[*]}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}' 2>/dev/null || true)"

  printf '\n'
  printf '%s\n' "================================================================"
  printf '%s\n' " DevShop demo is deployed in namespace '$NAMESPACE'"
  printf '%s\n' "================================================================"

  if [ -z "$node_ips" ]; then
    printf ' Node IPs: could not auto-detect (run: kubectl get nodes -o wide)\n'
    local host="${HOSTNAME:-<node-ip>}"
    printf ' Customer storefront : http://%s:%s\n' "$host" "$CUSTOMER_NODE_PORT"
    printf ' Admin dashboard     : http://%s:%s\n' "$host" "$ADMIN_NODE_PORT"
  else
    while IFS= read -r ip; do
      [ -n "$ip" ] || continue
      printf ' Customer storefront : http://%s:%s     (customer Frontend NodePort)\n' "$ip" "$CUSTOMER_NODE_PORT"
      printf ' Admin dashboard     : http://%s:%s     (admin Frontend NodePort)\n' "$ip" "$ADMIN_NODE_PORT"
    done <<< "$node_ips"
  fi

  local pword
  pword="$(kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" -o jsonpath='{.data.ADMIN_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null || true)"
  printf '\n Bootstrap admin login (auto-created by the backend on first start):\n'
  printf '   Login:  admin@devshop.com\n'
  printf '   Password: %s\n' "${pword:-<see: kubectl -n devshop-demo get secret devshop-secret -o jsonpath={.data.ADMIN_PASSWORD} | base64 -d >}"

  printf '\n Useful commands:\n'
  printf '   kubectl -n %s get pods\n' "$NAMESPACE"
  printf '   kubectl -n %s get svc\n' "$NAMESPACE"
  printf '   kubectl -n %s rollout status deployment/backend\n' "$NAMESPACE"
  printf '   kubectl -n %s logs deployment/backend -f\n' "$NAMESPACE"
  printf '   kubectl -n %s get pvc\n' "$NAMESPACE"
  printf '\n Health check (from inside the cluster, e.g. kubectl exec):\n'
  printf '   curl http://backend:8080/actuator/health\n'
  printf '\n Remove the demo with:  cd Demo && ./deploy.sh --delete\n'
}

do_status() {
  ensure_kubectl
  printf '%s\n' "== Namespace ==";         kubectl -n "$NAMESPACE" get namespace "$NAMESPACE" 2>/dev/null || echo "(namespace not found - nothing deployed)"
  printf '%s\n' "== Deployments ==";        kubectl -n "$NAMESPACE" get deploy -o wide 2>/dev/null || true
  printf '%s\n' "== Pods ==";               kubectl -n "$NAMESPACE" get pods -o wide 2>/dev/null || true
  printf '%s\n' "== Services ==";           kubectl -n "$NAMESPACE" get svc 2>/dev/null || true
  printf '%s\n' "== PVC ==";                kubectl -n "$NAMESPACE" get pvc 2>/dev/null || true
  print_access
}

do_delete() {
  ensure_kubectl
  log "Removing DevShop demo namespace '$NAMESPACE' (this deletes all demo resources + PVC data)..."
  printf '   Deleting namespace %s ... ' "$NAMESPACE"
  kubectl delete namespace "$NAMESPACE" --wait=true >/dev/null 2>&1 && echo "done." || echo "(already gone?)"
  log "Demo removed. Local generated secrets file kept; delete it with: rm Demo/.demo-secret-state"
}

# ---- CLI --------------------------------------------------------------------
case "${1:-deploy}" in
  deploy)
    ensure_images "hub"
    deploy
    ;;
  build|--build)
    ensure_images "build"
    deploy
    ;;
  status)
    do_status
    ;;
  delete|--delete|destroy)
    do_delete
    ;;
  -h|--help|help)
    sed -n '2,16p' "$0"
    printf '\nValid actions:\n'
    printf '  deploy           Deploy using the Docker Hub images (default)\n'
    printf '  --build          Build the images from application/ and load them locally\n'
    printf '  status           Print current demo status\n'
    printf '  --delete         Remove the demo\n'
    ;;
  *)
    err "Unknown action: '$1' (use deploy | --build | status | --delete | help)"
    exit 2
    ;;
esac
