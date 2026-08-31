#!/usr/bin/env bash
# =============================================================================
# DevShop — ONE-COMMAND deployment (Phase 7)
#
# Run from the repository root on a Linux shell (WSL recommended):
#
#     ./deploy.sh
#
# This performs the COMPLETE deployment automatically:
#
#    1.  prerequisite checks
#    2.  Terraform init / validate / apply   -> AWS infrastructure
#    3.  collect Terraform outputs            -> EC2 public/private IP
#    4.  generate the Ansible inventory        (no manual IP copying)
#    5.  generate/provision secure secrets     (auto, persisted, never printed)
#    6.  Ansible bootstrap                     -> EC2 prep
#    7.  Ansible install STANDARD Kubernetes   (containerd, kubeadm, kubelet,
#                                               kubectl, Calico CNI, Metrics)
#    8.  Ansible install Argo CD               (GitOps controller)
#    9.  Ansible apply DevShop secret/config   (outside Argo CD)
#   10.  wait for Argo CD to sync DevShop app
#   11.  health checks
#   12.  print final URLs and summary
#
# Idempotent: running it again only makes the changes that are still needed.
# Secrets are generated once and REUSED on subsequent runs.
#
# On failure this script STOPS at the first critical failure. Rerunning the
# same command resumes from where it left off (no need to destroy everything).
#
# Destroy is intentionally a SEPARATE command (./destroy.sh) that requires
# explicit confirmation.
# =============================================================================
set -euo pipefail

# ---- Configuration (overridable via environment) ----------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$ROOT_DIR/terraform"
ANSIBLE_DIR="$ROOT_DIR/ansible"
STATE_DIR="$ROOT_DIR/.devshop"                     # control-node state (git-ignored)
SECRETS_FILE="$STATE_DIR/secrets.yml"             # generated secrets (0600)
VENV_PROMPT=""                                     # (placeholder)

# Binary overrides (point at your Windows installs if not on PATH).
TERRAFORM_BIN="${TERRAFORM_BIN:-terraform}"
ANSIBLE_PLAYBOOK_BIN="${ANSIBLE_PLAYBOOK_BIN:-ansible-playbook}"
ANSIBLE_BIN="${ANSIBLE_BIN:-ansible}"

# SSH key for connecting to EC2 (one-time prerequisite; provide path).
DEVSHOP_SSH_KEY="${DEVSHOP_SSH_KEY:-}"

# If set, use this file for the Ansible Vault password instead of prompting.
DEVSHOP_VAULT_FILE="${DEVSHOP_VAULT_FILE:-}"

log()  { printf '\n\033[1;36m[devshop]\033[0m %s\n' "$*"; }
err()  { printf '\n\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# ---- 0. Prerequisite checks -------------------------------------------------
prereq_checks() {
  log "Checking prerequisites..."
  for bin in "$TERRAFORM_BIN" "$ANSIBLE_BIN" "$ANSIBLE_PLAYBOOK_BIN"; do
    command -v "$bin" >/dev/null 2>&1 || die "Missing required tool: $bin (see README prerequisites)"
  done
  [ -d "$TERRAFORM_DIR" ]  || die "Terraform directory not found at $TERRAFORM_DIR"
  [ -d "$ANSIBLE_DIR" ]    || die "Ansible directory not found at $ANSIBLE_DIR"
  if [ -z "$(ssh_key_path)" ]; then
    err "No SSH private key found for EC2."
    err "Set DEVSHOP_SSH_KEY=/path/to/your-key.pem (or place a *.pem in ~/.ssh)."
    die "Ansible cannot connect to EC2 without an SSH private key."
  fi
  return 0
}

# Locate the SSH private key file (explicit var, else auto-find a *.pem).
ssh_key_path() {
  if [ -n "${DEVSHOP_SSH_KEY:-}" ]; then
    printf '%s' "$DEVSHOP_SSH_KEY"
  else
    find "$HOME/.ssh" -maxdepth 1 -name '*.pem' -print -quit 2>/dev/null || true
  fi
}

# ---- 1. Terraform (AWS infrastructure) --------------------------------------
run_terraform() {
  log "Running Terraform (init)..." && "$TERRAFORM_BIN" -chdir="$TERRAFORM_DIR" init -input=false
  log "Running Terraform (validate)..." && "$TERRAFORM_BIN" -chdir="$TERRAFORM_DIR" validate
  log "Running Terraform (apply)..." && "$TERRAFORM_BIN" -chdir="$TERRAFORM_DIR" apply -auto-approve
}

# ---- 2. Collect outputs & generate inventory --------------------------------
collect_and_inventory() {
  log "Collecting Terraform outputs and generating inventory..."
  PUBLIC_IP="$("$TERRAFORM_BIN" -chdir="$TERRAFORM_DIR" output -raw instance_public_ip)"
  PRIVATE_IP="$("$TERRAFORM_BIN" -chdir="$TERRAFORM_DIR" output -raw instance_private_ip)"
  [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "null" ] || die "Could not read instance_public_ip from Terraform."
  log "Detected EC2 public IPv4: $PUBLIC_IP"

  mkdir -p "$ANSIBLE_DIR/inventory"
  cat > "$ANSIBLE_DIR/inventory/hosts.ini" <<EOF
# --- Generated automatically by deploy.sh (do not edit) ---
[devshop]
devshop ansible_host=$PUBLIC_IP
EOF
}

# ---- 3. Control-node secret state -------------------------------------------
# Generate strong secrets ONCE on the control node, then REUSE them on every
# subsequent run (no rotation, no printing). Secrets live in a 0600 file that is
# git-ignored. The same values are also persisted on the EC2 host by Ansible.
ensure_secrets() {
  log "Ensuring secure secrets state ($STATE_DIR)..."
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  if [ -s "$SECRETS_FILE" ]; then
    log "Reusing existing secrets (no rotation)."
  else
    log "Generating new secrets for first deployment..."
    GEN_DB="$(openssl rand -base64 24 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 20 || true)"
    GEN_JWT="$(openssl rand -base64 48 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 48 || true)"
    GEN_ADMIN="$(openssl rand -base64 18 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 16 || true)"
    [ -n "$GEN_DB" ] && [ -n "$GEN_JWT" ] && [ -n "$GEN_ADMIN" ] || die "Could not generate secrets (openssl missing?)."
    cat > "$SECRETS_FILE" <<EOF
db_password: $GEN_DB
jwt_secret: $GEN_JWT
admin_password: $GEN_ADMIN
admin_email: admin@devshop.com
admin_name: DevShop Admin
EOF
    chmod 600 "$SECRETS_FILE"
    log "New secrets written (0600). Secrets are never printed or committed."
  fi
}

# ---- 4. Ansible (EC2 + Kubernetes + Argo CD + app deployment) ---------------
run_ansible() {
  log "Running Ansible to bootstrap EC2, Kubernetes, and Argo CD..."
  local ssh_key
  ssh_key="$(ssh_key_path)"
  local args=( -i "$ANSIBLE_DIR/inventory/hosts.ini" )
  [ -n "$ssh_key" ] && args+=( --private-key "$ssh_key" )
  # Secrets are supplied automatically from the control-node store (no vault
  # prompting required for the normal one-command flow).
  args+=( --extra-vars "@$SECRETS_FILE" )
  # Only involve an encrypted vault if the caller explicitly opts in.
  if [ -n "${DEVSHOP_VAULT_FILE:-}" ]; then
    args+=( --vault-password-file "$DEVSHOP_VAULT_FILE" )
  fi
  args+=( "$ANSIBLE_DIR/playbooks/site.yml" )
  "$ANSIBLE_PLAYBOOK_BIN" "${args[@]}"
}

# ---- Main -------------------------------------------------------------------
main() {
  prereq_checks
  ensure_secrets
  run_terraform
  collect_and_inventory
  run_ansible
  log "Deployment orchestration completed successfully."
}

main "$@"
