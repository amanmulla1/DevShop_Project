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
├── docker-compose.yml
├── docker-compose.ci.yml   # Phase 5 — registry-image overlay for CI deployment
├── .env.example
├── Jenkinsfile             # Phase 5 — CI/CD pipeline (Jenkins)
├── application/
│   ├── backend/          # Spring Boot REST API
│   ├── frontend/         # Customer storefront
│   └── admin-frontend/   # Admin dashboard
├── scripts/               # Phase 5 — CI deploy / health check / rollback helpers
│                          # Phase 6 — K3s install + Kubernetes deploy helpers
├── jenkins/               # Phase 5 — Jenkins setup docs
├── kubernetes/            # Phase 6 — K3s manifests (namespace, config, secret,
│                          #            postgres, backend, frontends, ingress, HPA)
├── terraform/             # Phase 4 — AWS infrastructure (Terraform)
└── ansible/               # Phase 7 — EC2 config + app deployment (Ansible)
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

## Phase 6 — Kubernetes (K3s orchestration)

**Purpose:** run DevShop on a lightweight Kubernetes distribution, K3s, on the
Free-Tier-compatible EC2. K3s bundles its own Ingress controller (Traefik) and
storage class (`local-path`), so no EKS / NAT Gateway / RDS / managed load
balancer is introduced (all paid/managed services are out of scope).

Ownership model: **Terraform (Phase 4) owns the EC2 instance**, **Jenkins
(Phase 5) produces immutable Docker images**, and **Kubernetes (Phase 6) owns
application orchestration** on that instance.

```
K8s (single-node K3s on the EC2)
├── devshop namespace
│   ├── postgres (Stateful data via PersistentVolumeClaim / local-path)
│   ├── backend        (Spring Boot, amanmulla1/devshop-backend:<tag>)
│   ├── customer-frontend (Nginx, amanmulla1/devshop-frontend:<tag>)
│   ├── admin-frontend    (Nginx, amanmulla1/devshop-admin-frontend:<tag>)
│   ├── ConfigMap / Secret (env: DB, CORS, JWT, admin bootstrap)
│   └── Ingress (Traefik): devshop.local -> customer, devshop-admin.local -> admin
└── HPA (backend, optional - requires Metrics Server)
```

Key files:

- `scripts/install-k3s.sh` — idempotent K3s server install + kubeconfig + node check.
- `scripts/deploy-kubernetes.sh` — validate/dry-run, ensure Secret, `kubectl apply -k`,
  set immutable image tags, wait for rollouts, print status.
- `kubernetes/namespace.yaml`, `configmap.yaml`, `secret.example.yaml` — app config/secrets.
- `kubernetes/postgres/` — `pvc.yaml`, `deployment.yaml`, `service.yaml` (persistent data).
- `kubernetes/backend/`, `kubernetes/customer-frontend/`, `kubernetes/admin-frontend/` —
  deployments + ClusterIP services.
- `kubernetes/ingress.yaml`, `kubernetes/hpa.yaml`, `kubernetes/kustomization.yaml`.

Image tags stay **configurable** (passed by the deploy script, default `latest`
and overridable with `--tag <BUILD_NUMBER>`), so no single Jenkins build number
is hard-coded in any manifest.

Do **not** commit `kubernetes/secret.yaml` (git-ignored); create it from
`secret.example.yaml` and fill in the real base64 values.

See [`kubernetes/README.md`](kubernetes/README.md) for full install, deploy,
rollback, and troubleshooting.

## Phase 7 — Ansible (EC2 configuration & application deployment)

**Purpose:** after Terraform creates a fresh EC2, Ansible configures the host
and deploys DevShop with Docker Compose, with minimal manual intervention.

See [`ansible/README.md`](ansible/README.md) for full usage.

Workflow:

```bash
# Terraform provisions infrastructure (Phase 4)
cd terraform && terraform apply && terraform output -raw instance_public_ip

# Ansible configures + deploys (Phase 5)
cd ../ansible
ansible-vault create inventory/group_vars/all/vault.yml   # encrypted secrets
./scripts/deploy.sh                                        # generate inventory + run
./scripts/deploy.sh --deploy-only                          # re-deploy after IP change
```

Ansible:
- **common** — apt update, base packages, timezone
- **docker** — idempotent Docker Engine + Compose v2 install (conflict-safe), enable on boot
- **devshop** — clone/update `main`, **auto-detect the EC2 public IP**, render
  `/opt/devshop/.env` from the **Ansible Vault**, `docker compose up -d --build`, health checks

No IP is hard-coded: `SERVER_IP`/CORS are derived from the detected public IPv4
each deploy, so an EC2 stop/start (IP change) needs only a re-run of
`./scripts/deploy.sh --deploy-only` — never a source change. The compose stack
uses `restart: unless-stopped` plus the named `devshop-postgres-data` volume, so
PostgreSQL data survives redeploys and reboots.

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
