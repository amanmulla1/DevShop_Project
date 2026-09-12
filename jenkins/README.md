# DevShop - Jenkins CI/CD pipeline

This document explains how to set up and run the DevShop CI/CD pipeline with
Jenkins. It covers the architecture, installation, credentials, GitHub/Docker
Hub integration, deployment, rollback, and troubleshooting.

## Pipeline overview

```
Developer -> git push -> GitHub -> Jenkins -> checkout -> tests -> DevSecOps gates
  -> build -> Docker images -> Trivy scan -> Docker Hub
    -> update the Kubernetes image tag in Git
      -> Argo CD detects the Git change -> syncs -> Kubernetes rollout
```

The pipeline is defined in the repository-root [`Jenkinsfile`](../Jenkinsfile)
(Declarative Pipeline) and is CI/CD-only. It **does not** manage infrastructure:
Terraform stays the owner of AWS infrastructure, and Argo CD (GitOps) is the CD
authority that deploys to Kubernetes — Jenkins only writes the desired image tag
back into Git.

## Pipeline stages

1. **Checkout** — `checkout scm` of `main`.
2. **Backend Tests** — `mvn clean test` in `application/backend`.
3. **Customer Frontend Tests** — `npm ci` + `npm test -- --run` in `application/frontend`.
4. **Admin Frontend Tests** — `npm ci` + `npm test -- --run` in `application/admin-frontend`.
5. **OWASP Dependency Check (SCA)** — scans `pom.xml` + both `package-lock.json`
   files for vulnerable components; CVSS ≥ 7 fails the build.
6. **Backend Build** — `mvn -DskipTests package` (tests already ran in stage 2).
7. **Frontend Build** — `npm run build` for both frontends (parallel).
8. **SonarQube Analysis** — code-quality/smell analysis for the backend (Maven
   sonar plugin) and both frontends (sonar-scanner-cli). Red Quality Gate fails
   the build. **Mandatory** — the pipeline fails fast if `SONAR_HOST_URL` is unset.
9. **Docker Build** — build the three images, tagged `:${BUILD_NUMBER}` and `:latest`.
10. **Trivy Image Scan** — scans the three freshly-built images; HIGH/CRITICAL
    unfixed findings fail the build **before** the push.
11. **Docker Push** — push all three images (immutable tag + `latest`) to Docker Hub.
12. **Update Image Tag in Git (GitOps)** — write the immutable `:${BUILD_NUMBER}`
    tag into `kubernetes/overlays/aws/kustomization.yaml` and push with `[ci skip]`
    so Argo CD rolls out.

**All DevSecOps gates are mandatory.** A failed gate aborts the pipeline — the
build only goes ahead when every gate passes. OWASP and SonarQube run on
**every** pipeline invocation (all branches); Trivy runs on the `main` release
flow (it scans the images this run produced, which are only built on `main`) and
sits between Docker Build and Docker Push so a vulnerable push is impossible.
Test, build, push, and the GitOps write-back are gated to `main` as before.

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
| `github-token` | Username with password | GitHub personal access token (fine-grained, `Contents: read+write` for the image-tag write-back to `main`). |
| `dockerhub-credentials` | Username with password | Docker Hub **username** + an **access token** (preferred over the account password). |
| `sonarqube-token` | Secret text | SonarQube analysis token (see [sonarqube/README.md](sonarqube/README.md)). Only needed if you run the SonarQube gate. |
| `devshop-ec2-ssh` | SSH key (username + private key) | Legacy EC2 host key from the Docker-Compose deploy era; not used by the GitOps pipeline — kept for optional read-only cluster checks. |

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

## DevSecOps gates

Three security/quality gates run in the pipeline **and all are mandatory** — a
failed gate aborts the pipeline and the build does not go ahead:

| Stage | Tool | What it scans | Fails when | How |
|-------|------|---------------|------------|-----|
| OWASP Dependency Check | `owasp/dependency-check` | Backend `pom.xml`, both frontends `package-lock.json` | any vulnerable component with CVSS ≥ 7 | `scripts/ci-owasp-dependency-check.sh` |
| SonarQube Analysis | `sonar-maven-plugin` + `sonarsource/sonar-scanner-cli` | Backend Java source / Frontend TS+React source | server Quality Gate (red) **or** no server configured (fail-fast) | `application/backend/sonar-project.properties` + root `sonar-project.properties` |
| Trivy Image Scan | `aquasec/trivy` | the 3 freshly-built images | HIGH/CRITICAL **unfixed** vulnerabilities | `scripts/ci-trivy-scan.sh` |

Run order: OWASP → (build) → SonarQube → Docker Build → **Trivy scans the
built images** → Docker Push → Git tag write-back. Trivy sits *between* Build
and Push on purpose: a vulnerable image is never pushed to Docker Hub and
never reaches Argo CD.

### Required setup

- **Docker images** — all three tools run as one-off containers (`docker run`),
  pulled on demand from Docker Hub. No plugin installation needed beyond the
  ones already listed. The Jenkins user needs docker access (see
  [Prerequisites](#prerequisites-on-the-jenkins-host)).
- **`NVD_API_KEY` (optional)** — for OWASP, the NVD 2.0 API key (free from
  NVD) removes rate-limit throttling. Set it as a Jenkins *global* environment
  variable; the scan works without it.
- **SonarQube server + `sonarqube-token` (REQUIRED**) — follow
  [`jenkins/sonarqube/README.md`](sonarqube/README.md) to self-host SonarQube,
  generate a token, and set `SONAR_HOST_URL` (Jenkins global env). SonarQube is
  a **mandatory** gate: without these the pipeline fails fast at the analysis
  stage instead of skipping it.

### Local runs

```bash
# Dependency check (SCA) — from the repo root
bash scripts/ci-owasp-dependency-check.sh

# Trivy image scan — build first, then scan the images
docker build -t amanmulla1/devshop-backend:local application/backend
bash scripts/ci-trivy-scan.sh amanmulla1/devshop-backend:local

# SonarQube (server must be up) — backend via Maven, frontends via scanner
cd application/backend && mvn -Pdevsecops -DskipTests verify sonar:sonar \
  -Dsonar.host.url=http://<sonar-host>:9000 -Dsonar.token=<token> && cd ../..
docker run --rm -e SONAR_HOST_URL=http://<sonar-host>:9000 -e SONAR_TOKEN=<token> \
  -v "$PWD:/usr/src" sonarsource/sonar-scanner-cli:latest -Dsonar.projectBaseDir=/usr/src
```

Scan reports (HTML/JSON) are written to `reports/` (git-ignored) for inspection.

### Known trade-offs

- Trivy/Dependency-check need internet access from the Jenkins host to update
  their vulnerability feeds (Trivy DB, NVD). The NVD feed is large; the first
  OWASP run is slow (10+ min) — subsequent runs use the cached feed under
  `~/.cache/dependency-check`.
- `npm ci` runs as root in the frontend test stage; `reports/` and cache dirs
  are written by containers as root — clean up with `sudo rm -rf reports`
  if needed.

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
