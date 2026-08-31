#!/usr/bin/env bash
# =============================================================================
# DevShop — one-command Terraform->Ansible deploy orchestration.
#
#   1. Reads the EC2 public IPv4 from Terraform outputs.
#   2. Writes ansible/inventory/hosts.ini.
#   3. Runs the full site.yml playbook (common -> docker -> devshop).
#
# All config/secrets come from group_vars + the encrypted vault, so there are
# no hard-coded IPs or secrets here.
#
# Usage:
#   export DEVSHOP_SSH_KEY=~/.ssh/devshop.pem
#   ./scripts/deploy.sh            # prompts for the Ansible Vault password
#   DEVSHOP_VAULT_FILE=~/.vault-pass ./scripts/deploy.sh   # non-interactive
#
# To re-deploy only (no host package changes): ./scripts/deploy.sh --deploy-only
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANSIBLE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="site"
if [ "${1:-}" = "--deploy-only" ]; then
  MODE="deploy"
fi

# 1) Generate the inventory from Terraform outputs.
"$SCRIPT_DIR/generate_inventory.sh"

# 2) Assemble the ansible-playbook invocation.
cd "$ANSIBLE_DIR"

PLAYBOOK="playbooks/site.yml"
[ "$MODE" = "deploy" ] && PLAYBOOK="playbooks/deploy.yml"

ARGS=(-i inventory/hosts.ini "$PLAYBOOK")

if [ -n "${DEVSHOP_SSH_KEY:-}" ]; then
  ARGS+=(--private-key "$DEVSHOP_SSH_KEY")
fi

# Phase 7: prefer the auto-generated secrets store written by the root ./deploy.sh
# (git-ignored, 0600). Falls back to a pre-encrypted vault if it is absent.
SECRETS_FILE="$ANSIBLE_DIR/../.devshop/secrets.yml"
if [ -s "$SECRETS_FILE" ]; then
  ARGS+=(--extra-vars "@$SECRETS_FILE")
elif [ -n "${DEVSHOP_VAULT_FILE:-}" ]; then
  ARGS+=(--vault-password-file "$DEVSHOP_VAULT_FILE")
else
  ARGS+=(--ask-vault-pass)
fi

echo "Running: ansible-playbook ${ARGS[*]}"
exec ansible-playbook "${ARGS[@]}"
