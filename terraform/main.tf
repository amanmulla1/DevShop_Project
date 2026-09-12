# -----------------------------------------------------------------------------
# DevShop — Terraform entry point.
#
# This phase is split into focused files:
#   network.tf   - VPC, public subnet, Internet Gateway, route table
#   security.tf  - security group + ingress/egress rules
#   iam.tf       - EC2 instance role/profile (least privilege)
#   ec2.tf       - EC2 host (uses its normal public IPv4)
#   outputs.tf   - useful values after apply
#   variables.tf / versions.tf / providers.tf
#
# Terraform provisions infrastructure only. The Dockerized application is
# deployed separately (git + docker compose) — see terraform/README.md.
# -----------------------------------------------------------------------------
