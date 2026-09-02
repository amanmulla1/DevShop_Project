#!/usr/bin/env bash
# =============================================================================
# DevShop — DESTROY (Phase 7)
#
# Intentionally SEPARATE from ./deploy.sh. This destroys the AWS infrastructure
# (EC2 / VPC / subnet / security groups, etc.) created by Terraform.
#
# It REQUIRES explicit confirmation and will not run non-interactively unless
# --yes is supplied (used for automation only).
#
# Usage:
#     ./destroy.sh          # prompts for confirmation
#     ./destroy.sh --yes    # skip the prompt (automation)
#
# WARNING: This terminates the EC2 instance created by Terraform. Any data on
# the instance (including the Kubernetes local-path PostgreSQL data) is lost.
# Terraform state and the .devshop/ secret state on THIS machine are preserved.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$ROOT_DIR/terraform"
TERRAFORM_BIN="${TERRAFORM_BIN:-terraform}"

command -v "$TERRAFORM_BIN" >/dev/null 2>&1 || { echo "ERROR: terraform not found" >&2; exit 1; }
[ -d "$TERRAFORM_DIR" ] || { echo "ERROR: terraform/ directory not found" >&2; exit 1; }

if [ "${1:-}" != "--yes" ]; then
  echo "============================================================"
  echo "DevShop DESTROY"
  echo "============================================================"
  echo "This will DESTROY the AWS infrastructure created by Terraform:"
  echo "  - EC2 instance (terminated)"
  echo "  - VPC / subnet / internet gateway / route table"
  echo "  - security groups and IAM role/profile"
  echo
  echo "Any data on the instance (incl. Kubernetes PostgreSQL) is LOST."
  echo "============================================================"
  read -r -p "Type 'destroy' to confirm: " answer
  if [ "$answer" != "destroy" ]; then
    echo "Aborted. Nothing was destroyed."
    exit 0
  fi
fi

echo "Running: terraform -chdir=$TERRAFORM_DIR destroy"
"$TERRAFORM_BIN" -chdir="$TERRAFORM_DIR" destroy -auto-approve

echo
echo "DevShop infrastructure destroyed."
echo "Note: local state (terraform/ + deploy.sh secrets) is preserved on this machine."
