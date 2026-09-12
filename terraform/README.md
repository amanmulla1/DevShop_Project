# DevShop - Terraform / AWS infrastructure

Provisions the AWS fleet the DevShop Kubernetes cluster runs on: VPC, subnet,
security groups, IAM, and the EC2 nodes (one Kubernetes control plane plus
workers).

> **Scope:** this provisions *infrastructure only*. Application deployment
> happens later in the stack (Ansible bootstraps the cluster, Argo CD syncs the
> app from Git). See the root `README.md` for the full flow.

---

## Architecture

```
Internet
   │
   ▼
AWS VPC  (10.0.0.0/16)
   │
   ├── Public Subnet (10.0.1.0/24)
   │       ├── EC2 control-plane node (Ubuntu 24.04, t3.micro)  [kubeadm control plane]
   │       ├── EC2 worker[0]            (t3.micro)              [app workloads]
   │       └── EC2 worker[1]            (t3.micro)              [monitoring]
   │             ├── Security Group (22 / 80 / 443 / 30000-32767 / 5173 / 5174 / 8080)
   │             ├── IAM instance profile (least privilege, no API policies)
   │             └── containerd + kubelet + kube-proxy + Calico
   ├── Internet Gateway (0.0.0.0/0 route)
   └── EC2 normal public IPv4 (the app is reached through the ingress, not the raw node)
```

Resources created: VPC, public subnet, Internet Gateway, public route table +
route + association, security group + rules, IAM role + instance profile, and
the control-plane + worker EC2 nodes. No Elastic IP is used — the nodes keep
their normal public IPv4s.

---

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5 (tested with 1.9.8)
- [AWS CLI](https://aws.amazon.com/cli/) installed and configured (used for the
  credential chain; Terraform itself does not require the CLI binary)
- An **AWS account** and an existing **EC2 key pair** in the target region
  (Terraform references it by name; it never uploads or generates your `.pem`).

---

## AWS authentication

Terraform uses the standard AWS credential chain — **no keys are stored in this
repository**. Set up one of:

```bash
# 1) Environment variables (temporary)
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # only if temporary/MFA

# 2) AWS CLI profile (recommended)
aws configure --profile devshop
export AWS_PROFILE=devshop
```

---

## Variables

| Variable                    | Default        | Description                                              |
|-----------------------------|----------------|----------------------------------------------------------|
| `aws_region`                | `ap-south-1`   | AWS region                                               |
| `project_name`              | `devshop`      | Used in resource names and tags                          |
| `environment`               | `dev`          | `dev` / `staging` / `prod` tag                           |
| `vpc_cidr`                  | `10.0.0.0/16`  | VPC CIDR                                                |
| `public_subnet_cidr`        | `10.0.1.0/24`  | Public subnet CIDR                                       |
| `availability_zone`         | `ap-south-1a`  | AZ for subnet + instances                                 |
| `instance_type`             | `t3.micro`     | EC2 type for every node (free tier; keep small)          |
| `control_plane_count`       | `1`            | Number of control-plane nodes (single, non-HA)           |
| `worker_count`              | `2`            | Number of worker nodes (app + monitoring placement)      |
| `root_volume_size_gb`       | `20`           | Root EBS size (GiB) per node                             |
| `key_pair_name`             | *(required)*   | Existing AWS key pair name                               |
| `ami_id`                    | `""`           | Leave empty to auto-select latest Ubuntu 24.04 LTS AMI   |
| `admin_cidr`                | *(required)*   | Your public IP `/32` for SSH                             |
| `customer_ingress_cidrs`    | `["0.0.0.0/0"]`| Port 5173 source (docker-compose fallback)               |
| `admin_ingress_cidrs`       | `["0.0.0.0/0"]`| Port 5174 source (docker-compose fallback)               |
| `backend_ingress_cidrs`     | `["0.0.0.0/0"]`| Port 8080 source (docker-compose fallback)               |
| `postgres_ingress_cidrs`    | `[]`           | Port 5432 source — closed by default                     |
| `enable_detailed_monitoring`| `false`        | 1-min CloudWatch monitoring (costs extra)                |

In normal operation only ports `22`, `80/443`, and the NodePort range
`30000-32767` need to be open (the NGINX ingress fronts the application). The
compose ports are extra latitude for the local fallback; restrict
`customer/admin/backend_ingress_cidrs` to your own IP if you want them locked
down.

Get your public IP: `curl -s ifconfig.me`

---

## tfvars

```bash
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with your values (region, key_pair_name, admin_cidr, ...)
```

`terraform.tfvars` is git-ignored. It may contain your public IP, but must never
contain AWS keys, secrets, or `.pem` files.

---

## Commands

```bash
cd terraform

terraform init                       # installs the AWS provider (network required)
terraform fmt -recursive             # format all files
terraform fmt -check -recursive      # verify formatting (CI-friendly)
terraform validate                   # syntax + semantic validation

terraform plan                       # dry-run; shows what will be created
terraform apply                      # provision (prompt for confirmation)
terraform apply -auto-approve        # skip the confirmation prompt (CI)

terraform output control_plane_public_ips  # the control-plane node(s)
terraform output worker_public_ips         # the worker nodes
terraform output instance_public_ip        # first control-plane node (alias)
terraform output ssh_command               # ready-to-run SSH command

terraform destroy                    # tear everything down (USE WITH CARE)
```

> Never run `terraform destroy` without explicit confirmation. It will terminate
> the EC2 instance **you** created with Terraform — it will not touch any server
> that was deployed manually outside of Terraform.

---

## Outputs

`terraform output` exposes: `vpc_id`, `subnet_id`, `security_group_id`,
`instance_id`, `instance_private_ip`, `instance_public_ip`,
`iam_role_name`, and a ready `ssh_command`.

The application is reached through the NGINX ingress (NodePort), so the first
control-plane node's public IP is the entry address:
`http://<instance_public_ip>:<ingress-node-port>` for the internal ingress, or
`http://<public-ip>.nip.io` once Ansible has patched the Ingress hosts.

---

## SSH

```bash
ssh -i /path/to/<key_pair_name>.pem ubuntu@<instance_public_ip>
```

The `user_data` bootstrap installs containerd prerequisites on first boot; the
Kubernetes control plane itself is installed by Ansible (see
`../ansible/README.md`).

---

## Node public IPv4 and application configuration

The nodes use their **normal public IPv4s** (no Elastic IP, keeping it within
AWS Free Tier / minimal-cost constraints). Addresses are **never hard-coded**
into source. The deploy script reads them from `terraform output`, builds the
Ansible inventory, and Ansible derives the ingress hostnames from the detected
public IP. If an IP changes on stop/start, re-running `./deploy.sh` regenerates
everything.

Because CORS is env-driven and the frontends talk to the backend only through
their Nginx `/api` reverse proxy (relative URLs), no IP appears in the
React/Java/Docker sources.

> **Note:** a normal EC2 public IPv4 can change when the instance is stopped and
> started. When that happens, only the deployment/environment configuration
> (`SERVER_IP` / `CORS_ALLOWED_ORIGINS`) may need updating — the application
> source and container images do not change.

---

## Cost considerations (learning/portfolio)

- The fleet is three `t3.micro` (1 vCPU / 1 GiB) On-Demand nodes by default —
  free-tier eligible, but instance-hours add up across the fleet, so stop the
  nodes when the cluster is not in use.
- Default root volume `20 GiB gp3` per node.
- **No** NAT Gateway, Load Balancer, RDS, or EKS are created.
- Elastic IP intentionally **not used** (nodes use their normal public IPv4) to
  stay within Free Tier / minimal-cost constraints.
- Detailed CloudWatch monitoring is `false` by default to avoid the per-instance
  metric charge.

> **Why three small nodes instead of one bigger one?** A single `t3.micro` can
> barely boot a standard kubeadm control plane, let alone the app and
> monitoring. Splitting them — control plane, app worker, monitoring worker —
> keeps every node inside the free tier while still running everything on
> standard Kubernetes. With a single worker (set `worker_count=1`) the app and
> monitoring stack co-locate on that one node.

---

## Security considerations

- **SSH (22)** is restricted to `admin_cidr` (never `0.0.0.0/0`).
- **80/443 + 30000-32767** are the Kubernetes ingress path (NGINX Ingress
  Controller via NodePort).
- **5173 / 5174 / 8080** are open for the docker-compose fallback only. The
  normal flow never uses them; restrict their CIDRs if you want them closed.
- **5432** is **closed** — PostgreSQL lives inside the cluster and is never
  reachable from the internet.
- IAM uses **least privilege**: the instance role has no AWS API policies
  because the app makes no AWS calls. Never attach `AdministratorAccess`.
- No secrets (DB password, JWT secret, admin password, keys) are embedded in
  user_data or Terraform. AWS keys never appear in this repo.

---

## Remote state

This configuration uses **local** state for the first working version. For
team/automation use, switch to an S3 backend with DynamoDB locking (see the
commented block in `versions.tf`):

1. Create an S3 bucket (e.g. `devshop-terraform-state`, versioned + encrypted)
   and a DynamoDB table (e.g. `devshop-tf-locks`, key `LockID`).
2. Add the `backend "s3" { ... }` block in `versions.tf`.
3. Re-run `terraform init -migrate-state`.

---

## About the existing manually-deployed server

This Terraform (**Option A**) provisions a **new** EC2 instance and does **not**
destroy, import, or modify a server that was deployed manually before this
phase. Your working server remains untouched; the two environments are fully
separate.

If you instead want to bring an **existing** manually-created resource under
Terraform management (**Option B — Import**), you may import it by ID, for
example:

```bash
terraform import aws_vpc.devshop vpc-0123456789abcdef0
terraform import aws_subnet.public subnet-0123456789abcdef0
terraform import aws_security_group.devshop sg-0123456789abcdef0
terraform import aws_instance.devshop i-0123456789abcdef0
```

Because the existing VPC/subnet/sg/instance were not created with these exact
resources/attributes, the plan after import will likely show changes. Do **not**
blindly import every resource; review the plan and adjust attributes (naming,
tags, CIDRs) to match reality before applying. Documenting and performing an
import is a separate, manual exercise — it is optional for this phase.

---

## Files

```
terraform/
├── main.tf                 # entrypoint / overview
├── versions.tf             # required terraform + aws provider; remote-state note
├── providers.tf            # aws provider + default tags
├── variables.tf            # inputs (instance_type, counts, CIDRs) with validation
├── network.tf              # VPC, subnet, IGW, route table
├── security.tf             # security group + node rules (incl. NodePort range)
├── iam.tf                  # EC2 role + instance profile (least privilege)
├── ec2.tf                  # AMI data source, control-plane + worker instances
├── outputs.tf              # outputs (public/private IP lists, ssh command)
├── terraform.tfvars.example# example values
├── .gitignore              # ignores tfstate, .terraform, tfvars, keys
└── README.md               # this file
```
