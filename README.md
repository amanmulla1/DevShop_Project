# DevShop

A full-stack e-commerce platform with customer storefront, admin dashboard, and a REST API backend.

![Stack](https://img.shields.io/badge/Backend-Spring%20Boot%203-grey?logo=spring)
![Stack](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-blue)
![Stack](https://img.shields.io/badge/Database-PostgreSQL-336791)

## Overview

DevShop is composed of three independently deployable applications:

| Service | Technology | Default Port |
|---------|-----------|--------------|
| **Customer Frontend** | React 18 + TypeScript + Vite | `5173` |
| **Admin Frontend** | React 18 + TypeScript + Vite | `5174` |
| **Backend API** | Spring Boot 3 (Java 21) + JWT auth | `8080` |
| **Database** | PostgreSQL 16 | `5432` |

## Repository layout

```
devshop/
├── README.md
├── deploy.sh               # Phase 7 — ONE-COMMAND deploy (Terraform→Ansible→K8s→Argo CD)
├── destroy.sh              # Phase 7 — separate, confirm-gated teardown
├── docker-compose.yml
├── docker-compose.ci.yml   # Phase 5 — registry-image overlay for CI deployment
├── .env.example
├── Jenkinsfile             # Phase 5 — CI/CD pipeline (Jenkins)
├── application/
│   ├── backend/          # Spring Boot REST API
│   ├── frontend/         # Customer storefront
│   └── admin-frontend/   # Admin dashboard
├── scripts/               # Phase 5 — CI deploy / health check / rollback helpers
├── jenkins/               # Phase 5 — Jenkins setup docs
├── kubernetes/            # Phase 6 — standard Kubernetes manifests + Argo CD (GitOps)
├── terraform/             # Phase 4 — AWS infrastructure (Terraform)
└── ansible/               # Phase 7 — EC2/K8s/Argo CD bootstrap + deploy orchestration
```

## Quick start with Docker (recommended)

The easiest way to run the entire stack is with Docker Compose. It builds and
starts PostgreSQL, the backend, and both frontends with a single command.

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) with Docker Compose

### 1. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set the required values:

- `DB_USERNAME` — PostgreSQL username
- `DB_PASSWORD` — PostgreSQL password
- `JWT_SECRET` — a secret at least 32 characters long used to sign JWTs
- `ADMIN_PASSWORD` — initial administrator account password

`.env` is gitignored and contains your real secrets — never commit it.

### 2. Build and start

```bash
docker compose up -d --build
```

### 3. Access the applications

| Application | URL |
|-------------|-----|
| Customer storefront | http://localhost:5173 |
| Admin dashboard | http://localhost:5174 |
| Backend API (internal / debug) | http://localhost:8080 |
| Backend health check | http://localhost:8080/actuator/health |

The admin account is created automatically on first backend startup using the
values in `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).

### Frontend → backend communication (no hard-coded IPs)

The browser calls relative `/api/**` URLs on the **same origin**:

```
Browser (:5173 / :5174)
    │  /api/*
    ▼
Frontend Nginx (reverse proxy)
    │  backend:8080   (Docker internal network)
    ▼
Backend :8080
    ▼
PostgreSQL :5432
```

The frontend bundles contain **no backend hostname or IP**. Each frontend's
Nginx proxies `/api/*` to the backend service over the Docker network
(`backend:8080`). This means the same image works on `localhost`, any EC2 IP,
or a domain — changing the server IP never requires a frontend rebuild.

For local development (`npm run dev`), the Vite dev server proxies `/api` to
`http://localhost:8080` (see each `vite.config.ts`).

### 4. Stop the stack

```bash
docker compose down
```

> Note: `docker compose down` keeps your PostgreSQL data in the persistent
> `devshop-postgres-data` volume. Use `docker compose down -v` **only** if you
> explicitly want to delete the database data.

### Container images

The `docker-compose.yml` builds each service from its own `Dockerfile`:

- `application/backend/Dockerfile` — multi-stage Maven build (Java 21)
- `application/frontend/Dockerfile` — Node build served by Nginx
- `application/admin-frontend/Dockerfile` — Node build served by Nginx

## Phase 4 — Terraform (AWS infrastructure)

**Purpose:** provision the AWS infrastructure required to run the Dockerized
DevShop stack. Terraform creates the infrastructure only; application
deployment remains a separate `git` + `docker compose` step.

Terraform provisions:
- **VPC** + public **subnet**
- **Internet Gateway** + public **route table** (0.0.0.0/0 → IGW)
- **Security group** (SSH 22 from your IP; 5173/5174/8080; PostgreSQL 5432 closed)
- **EC2 instance** (Ubuntu 24.04, installs Docker + Compose via user data)
- **IAM** instance role/profile (least privilege, no AWS API policies yet)

The EC2 uses its **normal public IPv4** (Free Tier / minimal cost — no Elastic IP,
NAT Gateway, Load Balancer, RDS, or EKS).

See [`terraform/README.md`](terraform/README.md) for full usage.

### Terraform commands

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # set region, key_pair_name, admin_cidr
terraform init
terraform fmt -recursive
terraform validate
terraform plan
terraform apply
terraform output instance_public_ip            # the app address (normal public IPv4)
```

### Public IPv4 and runtime configuration

The instance's public IPv4 is an infrastructure **output**, never hard-coded into
source. At deploy time you set the runtime env from it:

```
SERVER_IP=<instance_public_ip>
CORS_ALLOWED_ORIGINS=http://<instance_public_ip>:5173,http://<instance_public_ip>:5174
```

Because CORS is env-driven and the frontends call the backend only through the
Nginx `/api` reverse proxy with relative URLs, no IP appears in any source file.
If the public IPv4 changes (on stop/start), only this deployment/environment
config needs updating — never the application.

> **Important:** Terraform provisions a **new** EC2 instance and will not
> destroy the existing manually-deployed server. See `terraform/README.md`
> ("About the existing manually-deployed server") for import guidance.

## Phase 5 — Jenkins (CI/CD pipeline)

**Purpose:** a real Jenkins Declarative Pipeline that, on a push to `main`,
checks out the repo, runs all tests, builds the applications, builds the Docker
images, pushes them to Docker Hub, deploys to the Terraform-created EC2 via
Docker Compose, and runs health checks.

```
Developer -> git push -> GitHub -> Jenkins -> checkout -> tests -> build
  -> Docker images -> Docker Hub -> deploy to AWS EC2 (Docker Compose)
  -> health checks -> deployment successful
```

Key files:

- `Jenkinsfile` — the Declarative Pipeline (test → build → Docker → push → deploy → health).
- `scripts/ci-deploy.sh` — reproduce the deploy on the EC2 host (pull images, `compose up -d`).
- `scripts/ci-health-check.sh` — verify backend/products/frontends after deploy.
- `scripts/ci-rollback.sh` — roll back to a previous immutable image tag.
- `docker-compose.ci.yml` — registry-image overlay used by CI (local dev is unchanged).
- `jenkins/README.md` — full Jenkins setup, credentials, webhook, and troubleshooting.

Traceability: each build is tagged with the Jenkins `BUILD_NUMBER` (e.g.
`amanmulla1/devshop-backend:42`) and reported with the Git commit. Deployment
always uses the exact immutable tag just built. Rolls back to any prior tag
without touching the PostgreSQL volume.

See [`jenkins/README.md`](jenkins/README.md) for setup, credentials, webhook
configuration, description of the flow, and rollback details.

## Phase 6 — Kubernetes + Argo CD (standard K8s, GitOps)

**Purpose:** run DevShop on a **standard Kubernetes (K8s)** cluster — not K3s —
with **Argo CD** managing the desired state from Git.

Standard single-node cluster on the Terraform EC2 (`t3.small`):

- **Runtime:** containerd; **Control plane:** kubeadm/kubelet/kubectl;
  **CNI:** Calico; **Ingress:** NGINX Ingress Controller.
- **Storage:** local-path-provisioner (`local-path` StorageClass) for the
  PostgreSQL PVC.
- **Namespaces:** `devshop` (application) and `argocd` (GitOps controller).
- **Application:** backend, customer-frontend, admin-frontend, postgres —
  Deployments + Services + ConfigMap + Secret + probes + resource limits.

GitOps flow (Jenkins no longer `kubectl apply`s for normal deploys):

```
Developer -> git push -> GitHub -> Jenkins (tests, build, Docker push to Docker Hub)
  -> update image tag in kubernetes/overlays/aws/kustomization.yaml -> Git
    -> Argo CD detects change -> syncs -> Kubernetes rolls out -> health checks
```

Rollback is Git-based (point the Kustomize `newTag` back to an older immutable
image and push; Argo CD syncs). An `[ci skip]` + Skip-Guard/write-back
protection avoids the GitOps loop. Secrets are kept out of Git (applied outside
Argo CD) and no EC2 IP is hard-coded (configurable Ingress hosts).

> **Standard Kubernetes (K8s), not K3s.** Single-node control-plane limitations
> (no HA, shared control plane/worker, node failure ⇒ cluster down) are
> documented — no production-HA claims.

See [`kubernetes/README.md`](kubernetes/README.md) for install, verification,
GitOps, self-heal/drift, rollback, and troubleshooting.

## Phase 7 — ONE-COMMAND deployment (Terraform → Ansible → Kubernetes → Argo CD)

**Final goal:** from the repository root, run **ONE command** and the entire
environment is provisioned, configured, deployed, verified, and ready to use. No
manual EC2 config, no manual `.env`, no manual Kubernetes/Argo CD install.

```bash
./deploy.sh
```

When it finishes successfully you get the application URLs. Rerunning the same
command is safe and idempotent. Destroying is a **separate, confirm-gated**
command: `./destroy.sh`.

### One-command flow

```
./deploy.sh
  1. prerequisite checks        (terraform, ansible, ssh key, aws creds)
  2. generate secure secrets    (once; reused, never printed/committed)
  3. Terraform init/validate/apply      → AWS infrastructure
  4. collect Terraform outputs          → EC2 public/private IP
  5. generate the Ansible inventory     (automatic — nothing copied by hand)
  6. Ansible bootstrap the EC2 host
  7. Ansible install STANDARD Kubernetes (containerd, kubeadm, kubelet, kubectl,
                                        Calico CNI, Metrics Server)
  8. Ansible install Argo CD (GitOps)
  9. apply DevShop Secret/ConfigMap     (outside Argo CD)
 10. wait for Argo CD to sync the DevShop app (GitHub → Argo CD → Kubernetes)
 11. wait for health checks
 12. print final URLs and summary
```

### Once-only prerequisites (before the FIRST deploy)

These are the only manual setup steps, done once:

1. **AWS credentials** configured (e.g. `aws configure` or env vars).
2. **Terraform variables**: copy `terraform/terraform.tfvars.example` →
   `terraform/terraform.tfvars` and set `key_pair_name` and `admin_cidr`
   (your public IP). Optionally an existing EC2 key pair.
3. **SSH private key** for that key pair. Either set `DEVSHOP_SSH_KEY=~/.ssh/xxx.pem`
   or place a `*.pem` in `~/.ssh` (the script auto-detects it).
4. **GitHub / Docker Hub credentials** already exist for your CI (Phase 5);
   the Argo CD repo is public so no repo credentials are needed.

After that: **`./deploy.sh`** is all you run.

> Runs from a Linux shell / WSL. Mac/Linux also work. No manual `.env` is needed —
> secrets are generated and persisted by the automation.

### How the pieces stay separate

| Component     | Responsibility                                                  |
|---------------|-----------------------------------------------------------------|
| Terraform     | AWS infrastructure                                              |
| Ansible       | EC2/server + standard Kubernetes + Argo CD bootstrap            |
| Kubernetes    | application runtime/orchestration                               |
| Argo CD       | GitOps / continuous delivery (GitHub → K8s)                     |
| Jenkins       | CI (Phase 5, unchanged)                                        |
| Docker        | application images                                              |
| PostgreSQL    | database (persistent inside Kubernetes)                        |

### Secrets & IP handling (automatic, safe)

- `./deploy.sh` generates strong secrets **once** into a git-ignored
  `.devshop/secrets.yml` (mode 0600) and **reuses** them on later runs (no
  rotation). They are persisted on the EC2 host too and never printed or
  committed.
- **No hard-coded EC2 IP**: the script reads the IP from `terraform output`,
  generates the Ansible inventory, and Ansible derives
  `SERVER_IP` / CORS / ingress hostnames automatically. EC2 stop/start (IP
  change) needs only a re-run of `./deploy.sh`.
- **No wildcard CORS** — explicit origins derived from the detected IP.

### Operator control

- `./deploy.sh` **stops on the first critical failure** (Terraform, SSH, K8s,
  CNI, Argo CD, or health). A partial deploy resumes by re-running the same
  command (idempotent, non-destructive).
- `./destroy.sh` tears down the AWS infrastructure **only with explicit
  confirmation**; it never runs as part of deploy.

See [`ansible/README.md`](ansible/README.md) and
[`kubernetes/README.md`](kubernetes/README.md) for details.

## Running locally without Docker

### Backend

```bash
cd application/backend
export DB_USERNAME=devshop
export DB_PASSWORD=devshop
mvn spring-boot:run
```

### Customer frontend

```bash
cd application/frontend
npm install
npm run dev      # http://localhost:5173
```

### Admin frontend

```bash
cd application/admin-frontend
npm install
npm run dev      # http://localhost:5174
```

## Configuration

Each component reads its configuration from environment variables — see the
backend's `application.properties` and the per-project `.env.example` files
for the full set of options.

- **Backend** — `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`,
  `JWT_SECRET`, `CORS_ALLOWED_ORIGINS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.
- **Frontends** — none required. The browser uses relative `/api` URLs on the
  same origin; Nginx (production) / Vite (dev) forwards to the backend.

## Testing

```bash
# Backend (Maven + JUnit)
cd application/backend && mvn clean test

# Frontends (Vitest + React Testing Library)
cd application/frontend && npm test
cd application/admin-frontend && npm test
```

## License

TODO: add your project license here.
