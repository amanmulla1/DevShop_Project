#!/usr/bin/env bash
# =============================================================================
# DevShop - one-command deploy.
#
# Run from the repository root on a Linux shell (WSL recommended):
#
#     ./deploy.sh
#
# This performs the complete deployment automatically:
#
#    1. prerequisite checks
#    2. Terraform init / validate / apply     -> AWS fleet (t3.micro nodes)
#    3. generate the Ansible inventory         (control-plane + workers, no manual IPs)
#    4. generate/reuse secure secrets          (auto, persisted, never printed)
#    5. Ansible common on every node
#    6. Ansible control-plane bootstrap        (kubeadm init + Calico + Metrics)
#    7. Ansible worker join
#    8. Ansible configure                      (labels, storage, ingress, Argo CD,
#                                               secrets, GitOps sync, health checks)
#
# Idempotent: re-running only makes the changes still needed; secrets are
# generated once and reused.
#
# Destroy is a separate command (./destroy.sh) that requires explicit
# confirmation.
#
# Free-tier note: defaults to t3.micro nodes. Instance-hours add up across the
# fleet, so stop the instances when you are not using the cluster.
# =============================================================================
set -euo pipefail

# ---- Configuration (overridable via environment) ----------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$ROOT_DIR/terraform"
ANSIBLE_DIR="$ROOT_DIR/ansible"
STATE_DIR="$ROOT_DIR/.devshop"                     # control-node state (git-ignored)
SECRETS_FILE="$STATE_DIR/secrets.yml"             # generated secrets (0600)

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

# ---- 1. Terraform (AWS fleet) ------------------------------------------------
run_terraform() {
  log "Running Terraform (init)..." && "$TERRAFORM_BIN" -chdir="$TERRAFORM_DIR" init -input=false
  log "Running Terraform (validate)..." && "$TERRAFORM_BIN" -chdir="$TERRAFORM_DIR" validate
  log "Running Terraform (apply)..." && "$TERRAFORM_BIN" -chdir="$TERRAFORM_DIR" apply -auto-approve
}

# ---- 2. Collect outputs & generate the inventory -----------------------------
collect_and_inventory() {
  log "Collecting Terraform outputs and generating the Ansible inventory..."
  "$ANSIBLE_DIR/scripts/generate_inventory.sh"
}

# ---- 3. Control-node secret state -------------------------------------------
# Generate strong secrets ONCE on the control node, then REUSE them on every
# subsequent run (no rotation, no printing). Secrets live in a 0600 file that is
# git-ignored. The same values are persisted on the EC2 host by Ansible.
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
    GEN_GRAFANA="$(openssl rand -base64 18 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 20 || true)"
    [ -n "$GEN_DB" ] && [ -n "$GEN_JWT" ] && [ -n "$GEN_ADMIN" ] && [ -n "$GEN_GRAFANA" ] || die "Could not generate secrets (openssl missing?)."
    cat > "$SECRETS_FILE" <<EOF
db_password: $GEN_DB
jwt_secret: $GEN_JWT
admin_password: $GEN_ADMIN
admin_email: admin@devshop.com
admin_name: DevShop Admin
grafana_admin_user: admin
grafana_admin_password: $GEN_GRAFANA
EOF
    chmod 600 "$SECRETS_FILE"
    log "New secrets written (0600). Secrets are never printed or committed."
  fi
}

# ---- 4. Ansible (bootstrap + GitOps deploy) ---------------------------------
run_ansible() {
  log "Running Ansible (bootstrap + GitOps deploy)..."
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