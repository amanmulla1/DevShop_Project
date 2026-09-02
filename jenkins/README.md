# DevShop — Jenkins CI/CD (Phase 5)

This document explains how to set up and run the DevShop CI/CD pipeline with
Jenkins. It covers the architecture, installation, credentials, GitHub/Docker
Hub integration, deployment, rollback, and troubleshooting.

## Pipeline overview

```
Developer -> git push -> GitHub -> Jenkins -> checkout -> tests -> build
  -> Docker images -> Docker Hub -> deploy to AWS EC2 (Docker Compose)
  -> health checks -> deployment successful
```

The pipeline is defined in the repository-root [`Jenkinsfile`](../Jenkinsfile)
(Declarative Pipeline) and is CI/CD-only. It **does not** manage infrastructure:
Terraform stays the owner of AWS infrastructure, and Docker Compose remains the
runtime on the EC2 host.

## Pipeline stages

1. **Checkout** — `checkout scm` of `main`.
2. **Backend Tests** — `mvn clean test` in `application/backend`.
3. **Customer Frontend Tests** — `npm ci` + `npm test -- --run` in `application/frontend`.
4. **Admin Frontend Tests** — `npm ci` + `npm test -- --run` in `application/admin-frontend`.
5. **Backend Build** — `mvn -DskipTests package` (tests already ran in stage 2).
6. **Frontend Build** — `npm run build` for both frontends (parallel).
7. **Docker Build** — build the three images, tagged `:${BUILD_NUMBER}` and `:latest`.
8. **Docker Push** — push all three images (immutable tag + `latest`) to Docker Hub.
9. **Deploy to EC2** — SSH to the EC2 host, pull the images, `docker compose up -d`.
10. **Health Check** — verify backend health, products API, and both frontends.

Stages 5–10 are gated to the **`main`** branch (`when { branch 'main' }`). Test
stages may run on any branch.

### Image names and tags

| Service | Image | Immutable tag | Convenience tag |
|---------|-------|---------------|-----------------|
| Backend | `${REGISTRY}/devshop-backend` | `${BUILD_NUMBER}` | `latest` |
| Customer frontend | `${REGISTRY}/devshop-frontend` | `${BUILD_NUMBER}` | `latest` |
| Admin frontend | `${REGISTRY}/devshop-admin-frontend` | `${BUILD_NUMBER}` | `latest` |

`BUILD_NUMBER` is a monotonically increasing, traceable version. The deployment
always uses the exact immutable tag just built (e.g. `devshop-backend:42`), so an
older `latest` is never accidentally deployed.

## Cost-conscious Jenkins placement

The pipeline uses `agent any` and builds/runs tests on the Jenkins host. Two
Free-Tier-friendly options:

- **On the same EC2 as the app** — cheapest (no extra build server). Only
  sensible if the instance has enough CPU/RAM: Ubuntu 24.04, ~2 vCPU / 4 GB is
  workable for this small stack, but Maven + three Node builds concurrently can
  be slow. Prefer a `t3.small`/`t3.medium` if running on the app box.
- **On a separate small EC2** (recommended for CI mainline work) — e.g. a single
  `t2.micro`/`t3.small` running only Jenkins. This is a modest extra Free-Tier
  cost but keeps build load off the production app host and avoids OOM on the
  app box.

For this project, a **separate small EC2** dedicated to Jenkins is recommended.
No EKS, NAT Gateway, RDS, or Load Balancer is introduced.

## Prerequisites on the Jenkins host

- A supported **Jenkins LTS** (see below) running on **Java 21** (or the LTS's
  supported JDK — current Jenkins LTS supports Java 21).
- **Java 21** (JDK) for the Maven build.
- **Maven 3.9+**.
- **Node.js 22 + npm** for the frontends.
- **Docker** with access for the Jenkins user (`sudo usermod -aG docker jenkins`).
- **git**, **curl**, and an SSH client (for deployment).

The tools must be on the agent's `PATH`. (The `Jenkinsfile` uses `agent any` and
does not declare Jenkins "Tools"; install the binaries on the agent directly.)

## Jenkins installation (manual, reproducible)

The workflow below installs the latest LTS. Do **not** bake credentials into
these scripts.

```bash
# Debian/Ubuntu — Jenkins LTS
sudo apt update
sudo apt install -y openjdk-21-jdk maven nodejs npm git curl docker.io

# Node 22 (LTS) if the distro npm is old
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

sudo usermod -aG docker jenkins   # allow Jenkins to run docker

# Jenkins LTS repo + install
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key \
  | sudo tee /etc/apt/keyrings/jenkins-keyring.asc > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/" \
  | sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt update
sudo apt install -y jenkins

sudo systemctl enable --now jenkins
sudo systemctl status jenkins
```

Open `http://<jenkins-host>:8080`, unlock with the initial admin password
(`sudo cat /var/lib/jenkins/secrets/initialAdminPassword`), install the
**suggested plugins**, and create an admin user. Install these extra plugins:

- **Pipeline**
- **Git**
- **Docker Pipeline** / **Docker** (optional, for docker steps in Jenkins)
- **SSH Agent** (for `sshagent`)
- **Credentials Binding** (for `withCredentials` — usually included)

### Webhook/trigger

For the GitHub → Jenkins trigger:

1. In the job config, set **Build Triggers → GitHub hook trigger for GITScm polling**.
2. Install and enable the **GitHub Integration plugin**.
3. In GitHub: repo **Settings → Webhooks → Add webhook**:
   - Payload URL: `http://<jenkins-host>:8080/github-webhook/`
   - Content type: `application/json`
   - Events: **Just the push event**.

The webhook has no secret by default; if you set one, add it as a credential and
reference it in the SCM/GitHub config — never in the `Jenkinsfile`. A public
webhook is not required to press **Build Now** manually.

## Jenkins credentials to create

In **Jenkins → Manage Jenkins → Credentials**, create the following credential
**IDs** (name them exactly as referenced by the `Jenkinsfile`):

| Credential ID | Type | Value |
|---------------|------|-------|
| `github-token` | Username with password | GitHub personal access token (fine-grained, `Contents: read`). Used for SCM checkout if the repo becomes private. The repo is public, so this is optional. |
| `dockerhub-credentials` | Username with password | Docker Hub **username** + an **access token** (preferred over the account password). |
| `devshop-ec2-ssh` | SSH key (username + private key) | The EC2 host's SSH username (e.g. `ubuntu`) and the **private key** `.pem` contents. |

Do **not** place any of these values in the `Jenkinsfile`, in Git, in a
`.env`, or in a Docker image.

## Configurable environment (no hard-coded values)

The `Jenkinsfile` reads these from the Jenkins environment / build parameters —
no secrets and **no EC2 IP** are hard-coded in source:

- **`REGISTRY`** — build parameter; the Docker Hub namespace (default `amanmulla1`).
  Must match the account that owns `dockerhub-credentials`.
- **`EC2_HOST`** — Jenkins **global environment variable** set to the EC2 public
  IPv4/DNS (e.g. from `terraform output instance_public_ip`). Because there is no
  Elastic IP, set this when the public IP changes; nothing in source changes.
- **`EC2_USER`** — SSH user (default `ubuntu`).
- **`DEVSHOP_APP_DIR`** — repo directory on the EC2 host (default `/opt/devshop`).

Set `EC2_HOST` (and optionally `EC2_USER`/`DEVSHOP_APP_DIR`) under
**Manage Jenkins → System → Global properties → Environment variables**.

## Docker Hub integration

- Images are built with the **existing `Dockerfile`s** (no PostgreSQL app image —
  the official `postgres` image from `docker-compose.yml` is used).
- Images are pushed to Docker Hub under `${REGISTRY}/<devshop-*>:<tag>` using the
  `dockerhub-credentials` access token (`docker login --password-stdin`).
- Login and secret values are injected at runtime via `withCredentials`, which
  masks them in the console log.

## EC2 deployment method (SSH + Docker Compose)

Deployment targets the Terraform-created EC2 over SSH, using Docker Compose
exactly as in the running model — **not** Kubernetes:

```
Jenkins -> SSH -> EC2 -> docker compose (postgres, backend, customer-frontend, admin-frontend)
```

It runs the committed, reproducible helper scripts found in
[`scripts/`](../scripts):

- **`scripts/ci-deploy.sh REGISTRY IMAGE_TAG`** — ensures the repo is present on
  the host (`git clone` or non-destructive `git pull --ff-only main`), pulls the
  three prebuilt registry images, and runs:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.ci.yml pull backend customer-frontend admin-frontend
  docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d
  ```
- **`scripts/ci-health-check.sh`** — verifies from the host loopback:
  - `http://127.0.0.1:8080/actuator/health`
  - `http://127.0.0.1:8080/api/products`
  - `http://127.0.0.1:5173/` (customer frontend)
  - `http://127.0.0.1:5174/` (admin frontend)

The Jenkins `Deploy to EC2` stage uses `sshagent(['devshop-ec2-ssh'])` to run
`ci-deploy.sh`, and the `Health Check` stage runs `ci-health-check.sh`. Host key
checking is disabled (`StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`)
because the EC2 public IP can change (no Elastic IP); accept this documented
trade-off for the ephemeral host.

### How registry images are selected (docker-compose.ci.yml)

Local development is unchanged: `docker compose up -d --build` builds and runs
the locally-tagged `devshop-*` images from `docker-compose.yml`.

CI/deployment overlays the registry images via `docker-compose.ci.yml`, which
overrides the three app services' `image:` with `${REGISTRY}/<devshop-*>:${IMAGE_TAG}`.
`docker compose pull` fetches those exact immutable tags (it does not build), and
`up -d` recreates the containers. PostgreSQL is left untouched.

## Environment / secrets on the server

- The EC2 host keeps its own `/opt/devshop/.env` (git-ignored) containing
  `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`, `SERVER_IP`,
  `CORS_ALLOWED_ORIGINS`, etc.
- The pipeline deploys **application images**, not environment overrides. It does
  **not** overwrite production secrets with values from Git, does **not** print
  `.env`, and never echoes secrets in the console.
- The `git pull` in `ci-deploy.sh` updates tracked code/compose files only; the
  untracked `.env` remains in place.

## Rollback

Rollback is a simple, documented, non-destructive operation. Because every build
pushes an immutable `:${BUILD_NUMBER}` tag that is never deleted, you can re-point
the compose overlay at a previous tag and redeploy. PostgreSQL keeps its
data — no `down -v`, no database reset.

On the EC2 host (or via Jenkins `sshagent`):

```bash
DEVSHOP_APP_DIR=/opt/devshop bash /opt/devshop/scripts/ci-rollback.sh amanmulla1 41
```

`scripts/ci-rollback.sh` simply delegates to `scripts/ci-deploy.sh` with the
previous tag, so it pulls `devshop-*:41` and recreates containers. Roll back to
any previously pushed tag.

## Traceability

Each run logs (in the `post`/`always` block and console):

```
Commit:   39ba4c0...
Build:    #42
Images:   amanmulla1/devshop-backend:42 / amanmulla1/devshop-frontend:42 / amanmulla1/devshop-admin-frontend:42
Deployment: EC2 (…)
```

## Failure behavior

The pipeline stops (fails) on: any Maven/frontend test failure, build failure,
Docker build/push failure, deploy failure, or health-check failure. The
`post { failure }` block prints rollback guidance and marks the build failed.

## Troubleshooting

- **`npm ci` fails on the Jenkins agent** — not expected on a clean agent. If a
  dev server holds `node_modules`, stop it first. On CI use a fresh workspace.
- **Checkout fails** — confirm `github-token` exists and the SCM points at
  `https://github.com/amanmulla1/DevShop_Project.git`; the repo is public so the
  token is only needed if private.
- **Docker push: denied** — the `REGISTRY` parameter must equal the account that
  owns `dockerhub-credentials`, and the token needs `Read/Write` on the repo.
- **Deploy timeout / cannot connect** — confirm `EC2_HOST` reflects the current
  public IPv4 (`terraform output instance_public_ip`) and the security group
  allows port 22 from the Jenkins host, and that `devshop-ec2-ssh` matches the
  AMI's user (Ubuntu → `ubuntu`).
- **Health check fails after deploy** — run `ci-health-check.sh` on the host and
  `docker compose ps`; check `/opt/devshop/.env` (e.g. CORS `SERVER_IP`) and the
  backend logs: `docker compose logs backend`.
- **`postgres` container recreated unnecessarily** — the pipeline never runs
  `docker compose down -v`; the named `devshop-postgres-data` volume preserves
  all data across deploys and reboots.
