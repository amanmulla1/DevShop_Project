# DevShop — Phase 4: Terraform / AWS Infrastructure

Terraform that provisions the AWS infrastructure needed to run the existing
Dockerized DevShop application (customer frontend, admin frontend, Spring Boot
backend, PostgreSQL).

> **Scope:** This phase provisions *infrastructure only*. It does **not** deploy
> the application containers — that is still done with `git` + `docker compose`
> (see the root `README.md`). Kubernetes, Ansible, Jenkins, and
> Prometheus/Grafana are intentionally out of scope for this phase.

---

## Architecture

```
Internet
   │
   ▼
AWS VPC  (10.0.0.0/16)
   │
   ├── Public Subnet (10.0.1.0/24)
   │       └── EC2 Instance  (Ubuntu 24.04, t3.small default)
   │             ├── Security Group (22 / 5173 / 5174 / 8080; 5432 closed)
   │             ├── IAM instance profile (least privilege, no policies)
   │             └── Docker
   │                   ├── Customer Frontend (5173)
   │                   ├── Admin Frontend   (5174)
   │                   ├── Backend          (8080)
   │                   └── PostgreSQL       (5432, internal/Docker network)
   ├── Internet Gateway (0.0.0.0/0 route)
   └── EC2 normal public IPv4  (app address, e.g. http://<public-ipv4>:5173)
```

Resources created: VPC, public subnet, Internet Gateway, public route table +
route + association, security group + rules, IAM role + instance profile,
EC2 instance. (No Elastic IP — the EC2 uses its normal public IPv4.)

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
| `availability_zone`         | `ap-south-1a`  | AZ for subnet + instance                                 |
| `instance_type`             | `t3.small`     | EC2 type (keep small to control cost)                    |
| `root_volume_size_gb`       | `20`           | Root EBS size (GiB)                                      |
| `key_pair_name`             | *(required)*   | Existing AWS key pair name                               |
| `ami_id`                    | `""`           | Leave empty to auto-select latest Ubuntu 24.04 LTS AMI   |
| `admin_cidr`                | *(required)*   | Your public IP `/32` for SSH                             |
| `customer_ingress_cidrs`    | `["0.0.0.0/0"]`| Port 5173 source                                         |
| `admin_ingress_cidrs`       | `["0.0.0.0/0"]`| Port 5174 source                                         |
| `backend_ingress_cidrs`     | `["0.0.0.0/0"]`| Port 8080 source (see security note)                     |
| `postgres_ingress_cidrs`    | `[]`           | Port 5432 source — closed by default                     |
| `enable_detailed_monitoring`| `false`        | 1-min CloudWatch monitoring (costs extra)                |

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

terraform output instance_public_ip # the application address (normal public IPv4)
terraform output ssh_command         # ready-to-run SSH command

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

Use `instance_public_ip` as the application address:
`http://<instance_public_ip>:5173` (customer) and `http://<instance_public_ip>:5174`
(admin).

---

## SSH

```bash
ssh -i /path/to/<key_pair_name>.pem ubuntu@<instance_public_ip>
```

On the host, confirm Docker is ready (installed by `user_data` on first boot and
enabled at startup):

```bash
docker --version
docker compose version
```

---

## Instance public IPv4 and application configuration

This project intentionally uses the EC2 instance's **normal public IPv4** (no
Elastic IP, keeping it within AWS Free Tier / minimal-cost constraints). The
address is **never hard-coded** into source code. At deploy time, set the
runtime environment from the output, for example:

```
SERVER_IP=<instance_public_ip>                     # used for CORS in the backend
CORS_ALLOWED_ORIGINS=http://<instance_public_ip>:5173,http://<instance_public_ip>:5174
```

Because CORS is env-driven (`SERVER_IP`/`CORS_ALLOWED_ORIGINS` in `docker-compose.yml`),
and the frontends talk to the backend only through Nginx `/api` reverse proxy
(relative URLs), no IP appears in the React/Java/Docker sources.

> **Note:** a normal EC2 public IPv4 can change when the instance is stopped and
> started. When that happens, only the deployment/environment configuration
> (`SERVER_IP` / `CORS_ALLOWED_ORIGINS`) may need updating — the application
> source and container images do not change.

---

## Cost considerations (learning/portfolio)

- Single `t3.small` (2 vCPU / 2 GiB) On-Demand ≈ a few US$/month. Make it
  configurable; you can drop to `t3.micro` for lighter loads.
- Default root volume `20 GiB gp3`.
- **No** NAT Gateway, Load Balancer, RDS, or EKS are created in this phase.
- Elastic IP intentionally **not used** (the instance uses its normal public
  IPv4) to stay within Free Tier / minimal-cost constraints.
- Detailed CloudWatch monitoring is `false` by default to avoid the per-instance
  metric charge.

---

## Security considerations

- **SSH (22)** is restricted to `admin_cidr` (never `0.0.0.0/0`).
- **5173 / 5174** are public by default (they are the public web faces). Restrict
  via `customer_ingress_cidrs` / `admin_ingress_cidrs` if you only need admin access.
- **8080** defaults public for parity with the prior manual deployment, but the
  frontends reach the backend through the Nginx `/api` proxy — the recommended
  hardening is to restrict 8080 to the admin CIDR.
- **5432** is **closed** by default; PostgreSQL stays inside the EC2 Docker
  network. Open it only by setting `postgres_ingress_cidrs`.
- IAM uses **least privilege**: the instance role has no AWS API policies in this
  phase because the app makes no AWS calls. If you later need ECR/CloudWatch/SSM,
  attach the specific managed policy — never `AdministratorAccess`.
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
├── variables.tf            # inputs with validation
├── network.tf              # VPC, subnet, IGW, route table
├── security.tf             # security group + rules
├── iam.tf                  # EC2 role + instance profile (least privilege)
├── ec2.tf                  # AMI data source, instance, Elastic IP
├── outputs.tf              # outputs
├── user_data.sh.tpl        # host bootstrap (install Docker + compose)
├── terraform.tfvars.example# example values
├── .gitignore              # ignores tfstate, .terraform, tfvars, keys
└── README.md               # this file
```
