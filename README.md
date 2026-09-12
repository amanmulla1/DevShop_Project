# DevShop

A full-stack e-commerce platform: customer storefront, admin dashboard, and a
REST API backend, deployed with Terraform + Ansible + Kubernetes (Argo CD
GitOps) on AWS, with DevSecOps gates (OWASP Dependency-Check, SonarQube,
Trivy) built into CI.

![Stack](https://img.shields.io/badge/Backend-Spring%20Boot%203-grey?logo=spring)
![Stack](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-blue)
![Stack](https://img.shields.io/badge/Database-PostgreSQL-336791)

## Stack

| Service | Technology | Default port |
|---------|-----------|--------------|
| Customer frontend | React 18 + TypeScript + Vite | `5173` |
| Admin frontend | React 18 + TypeScript + Vite | `5174` |
| Backend API | Spring Boot 3 (Java 21) + JWT auth | `8080` |
| Database | PostgreSQL 16 | `5432` |

Both frontends are served by Nginx, which reverse-proxies `/api/**` to the
backend. The browser only ever talks to its own origin on the same host, so
**no backend IP or hostname is baked into the bundles** — the same images run on
`localhost`, any EC2 IP, or a real domain without a rebuild.

## Architecture

```
Developer -> git push
                |
                v
             GitHub
                |
    +-----------+-----------+
    |                       |
    v                       v
  Jenkins (CI)        Argo CD (CD, in-cluster)
    test + build           polls the repo, syncs
    |                      |
    v                      v
Docker Hub    ->    Kubernetes cluster (EC2, t3.micro)
                           |
                     +------+--------+
                     |               |
              app worker      monitoring worker
              +----------+     prometheus, grafana,
              | postgres  |     alertmanager, exporters
              | backend   |
              | frontends |
              +----------+          control plane (tainted)
                                    kubeadm + Calico + Argo CD

                             NGINX Ingress (NodePort)
                                      |
                                      v
                             Browser -> http://<public-ip>.nip.io
```

- **One control plane** (kubeadm, stays tainted) runs Calico, Metrics Server,
  and Argo CD.
- **Worker 0** carries the application (PostgreSQL + backend + both frontends)
  and binds its local-path volume.
- **Worker 1 (or worker 0 in a single-worker cluster)** carries Prometheus,
  Grafana, Alertmanager, and the exporters.
- All traffic enters through the **NGINX Ingress** (NodePort, no load
  balancer).

## Repository layout

```
devshop/
├── deploy.sh               # one-command AWS deploy (Terraform -> Ansible -> K8s -> Argo CD)
├── destroy.sh              # confirm-gated teardown of the AWS stack
├── docker-compose.yml      # local dev stack
├── docker-compose.ci.yml   # registry-image overlay used by Jenkins
├── .env.example
├── Jenkinsfile
├── application/
│   ├── backend/            # Spring Boot REST API (/actuator/prometheus)
│   ├── frontend/           # customer storefront
│   └── admin-frontend/     # admin dashboard
├── sonar-project.properties  # SonarQube config for both frontends
├── scripts/                # CI deploy / health check / rollback + DevSecOps helpers
├── jenkins/                # Jenkins setup notes, sonarqube/ compose server
├── kubernetes/             # K8s manifests, Argo CD apps, monitoring stack
├── terraform/              # AWS infrastructure
└── ansible/                # node bootstrap + cluster configuration
```

## Running locally with Docker

```bash
cp .env.example .env        # set DB_PASSWORD, JWT_SECRET (>=32 chars), ADMIN_PASSWORD
docker compose up -d --build
```

- Customer storefront: http://localhost:5173
- Admin dashboard: http://localhost:5174
- Backend health: http://localhost:8080/actuator/health

The admin account is created on first backend startup from `ADMIN_EMAIL` /
`ADMIN_PASSWORD`. `.env` is gitignored — keep it that way.

Stop with `docker compose down` (data survives in the `devshop-postgres-data`
volume; use `down -v` only to wipe the database).

### Environment variables (.env)

| Variable | Purpose |
|----------|---------|
| `SERVER_IP` | Public address used to build the CORS origins (`localhost` locally, EC2 IP/domain on AWS) |
| `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | PostgreSQL database credentials |
| `JWT_SECRET` | JWT signing secret, **must be >= 32 characters** |
| `CORS_ALLOWED_ORIGINS` | Override the origins derived from `SERVER_IP` if needed |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Initial admin account created on first boot |

## Deploying to AWS (one command)

`./deploy.sh` provisions everything: the EC2 fleet, a standard kubeadm
Kubernetes cluster, Argo CD, and the full app with monitoring — then prints the
URLs when the health checks pass.

```bash
./deploy.sh
```

What it does, in order:

1. **prerequisite checks** — terraform/ansible on PATH, SSH key present, repo dirs exist
2. **generate secure secrets** once into `.devshop/secrets.yml` (0600, git-ignored);
   reused on every later run, never printed
3. **Terraform** — VPC, subnet, Internet Gateway, security groups, IAM, and the
   EC2 nodes (`terraform init / validate / apply`)
4. **generate the Ansible inventory** from the Terraform outputs
   (`ansible/scripts/generate_inventory.sh`) — no manual IP copying
5. **Ansible bootstrap** (`ansible/playbooks/site.yml`), four plays:
   - `common`: apt update, base packages, timezone — every node
   - `kubernetes_controlplane`: clone the repo, `install-kubernetes.sh`
     (containerd, kubeadm, Calico, Metrics), write the join command
   - `kubernetes_worker`: copy the join command from the control plane and run
     `join-worker.sh` on each worker
   - `kubernetes_configure`: node labels, local-path storage, NGINX ingress,
     Argo CD, secrets (outside GitOps), ingress host patch, sync waits, health
     checks
6. **wait for Argo CD** to sync both Applications (`devshop`, `monitoring`) to
   `Synced` + `Healthy`
7. **health checks** — pod readiness, backend `/actuator/health`, both
   storefronts through the ingress, Prometheus scraping
8. **print the summary** with the customer/admin URLs

Re-running it only makes the changes still needed — there is nothing to destroy
and start over. Teardown is explicit:

```bash
./destroy.sh            # prompts for confirmation
./destroy.sh --yes      # non-interactive (automation)
```

`./deploy.sh` configuration is also overridable via environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `TERRAFORM_BIN` | `terraform` | Terraform binary (useful on WSL with a Windows install) |
| `ANSIBLE_BIN` | `ansible` | Ansible binary |
| `ANSIBLE_PLAYBOOK_BIN` | `ansible-playbook` | Ansible playbook binary |
| `DEVSHOP_SSH_KEY` | auto-find `~/.ssh/*.pem` | SSH private key for EC2 |
| `DEVSHOP_VAULT_FILE` | *(unset)* | Use an ansible-vault password file instead of `--extra-vars` |

### Free-tier setup

The fleet defaults to `t3.micro` nodes: one dedicated control plane and two
workers, where one worker runs the application and the other runs the
monitoring stack (with a single worker, both co-locate). Everything is EC2
inside a simple VPC — **no ELB, NAT, RDS, or EKS** to push it over budget. The
trade-off is that instance-hours add up across the fleet, so stop the nodes
when you are not using the cluster.

### One-time prerequisites

1. **Tools** on your PATH: terraform (>= 1.5), ansible (2.9+), plus `openssl`,
   `git`, `python3`, `ssh`. On Windows, run from WSL.
2. **AWS credentials** configured (`aws configure` or `AWS_ACCESS_KEY_ID` /
   `AWS_SECRET_ACCESS_KEY` env vars).
3. **`terraform/terraform.tfvars`** copied from `terraform.tfvars.example` with
   your `key_pair_name` and `admin_cidr` (your public IP/32) set. Never commit
   this file.
4. **SSH private key** for that key pair on your machine: set
   `DEVSHOP_SSH_KEY=/path/to.pem` or place a `*.pem` in `~/.ssh` (auto-detected).
5. **Docker Hub + GitHub (PAT) credentials** configured as Jenkins credentials
   (see `jenkins/README.md`) for the CI pipeline.

### How secrets and public IPs are handled

- Secrets (DB password, JWT secret, admin password, Grafana password) are
  generated **once** on your machine into the git-ignored `.devshop/secrets.yml`
  (mode 0600) and **reused** on every run — no rotation, no printing. Ansible
  renders the in-cluster `devshop-secret` and the monitoring secrets from these
  values **outside** Argo CD (so they are never committed and never pruned),
  with `no_log` on every sensitive task.
- The nodes use normal public IPv4s (no Elastic IP). Addresses are read from
  `terraform output`, so nothing is hard-coded. The ingress hostnames are
  derived at apply time from the detected IP (`http://<ip>.nip.io`). If an IP
  changes after stop/start, re-running `./deploy.sh` regenerates the inventory
  and re-patches the ingress — no source changes.

## Kubernetes details

The cluster is standard Kubernetes (kubeadm, containerd, Calico), not K3s.

- **Control plane** stays tainted and single-node (no HA); workers take the
  actual workload.
- **Storage:** local-path provisioner for the PostgreSQL + Prometheus PVCs
  (`local-path` StorageClass).
- **Ingress:** NGINX Ingress Controller via NodePort — no load balancer.
- **Namespaces:** `devshop` (app), `monitoring` (observability), `argocd`
  (GitOps controller).
- **App workloads:** postgres, backend, customer-frontend, admin-frontend —
  Deployments, Services, ConfigMap, readiness/liveness probes, and an HPA on
  the backend.
- **Placement:** the Kustomize AWS overlay pins the application to the app node
  (`app-node=yes`); the monitoring overlay pins Prometheus/Grafana/Alertmanager
  to the monitoring node (`monitoring-node=yes`).

### GitOps flow

Jenkins tests and builds the code, pushes immutable images to Docker Hub
(`:BUILD_NUMBER`), and updates the image tag in
`kubernetes/overlays/aws/kustomization.yaml`. Argo CD watches the repo, syncs
the change, and rolls out the new revision:

```
git push -> Jenkins (tests, build, push) -> image tag updated in Git
  -> Argo CD detects -> syncs -> K8s rollout -> health checks
```

Rollback is Git-based too: point the tag back to an older image and push. The
write-back commit is tagged `[ci skip]`, which the GitHub → Jenkins trigger
honours and prevents the GitOps loop. The Argo CD repo is public, so no repo
credentials are required.

## CI/CD (Jenkins)

`Jenkinsfile` runs declaratively on every push to `main`:

1. Checkout
2. Monitoring config validation (read-only: parses YAML, dashboard JSON, and
   Prometheus rule files)
3. Backend tests (Maven + JUnit)
4. Frontend tests (Vitest + React Testing Library, customer + admin)
5. **OWASP Dependency-Check** (SCA) — scans `pom.xml` + `package-lock.json`;
   CVSS ≥ 7 fails the build
6. Backend build
7. Frontend builds (customer + admin)
8. **SonarQube** (quality gate) — backend + frontends; fails on a red Quality
   Gate (only when a server is configured via `SONAR_HOST_URL`)
9. Docker image build + **Trivy image scan** — HIGH/CRITICAL unfixed
   vulnerabilities in a freshly built image block the push
10. Docker push to Docker Hub (immutable `:<BUILD_NUMBER>` tags)
11. Image-tag write-back to `kubernetes/overlays/aws/kustomization.yaml`

Jenkins does **not** run `kubectl apply` for normal deploys — Argo CD is the CD
authority. See `jenkins/README.md` for the full setup, credentials, and the
`Scripts`/rollback helpers in `scripts/`.

## DevSecOps (quality & security gates)

Three automated gates run inside the CI pipeline (see
[`jenkins/README.md`](jenkins/README.md) and
[`jenkins/sonarqube/README.md`](jenkins/sonarqube/README.md) for setup):

| Gate | Tool | Scope | Blocks when |
|------|------|-------|-------------|
| Software composition analysis | **OWASP Dependency-Check** (`owasp/dependency-check` container) | backend `pom.xml` + both frontends `package-lock.json` | any vulnerable component ≥ CVSS 7 |
| Code quality | **SonarQube** (`sonar-maven-plugin` + `sonarsource/sonar-scanner-cli`) | backend Java + frontend TypeScript sources | server Quality Gate is red, or server not configured (fail-fast) |
| Container image scan | **Trivy** (`aquasec/trivy` container) | the three freshly-built images | HIGH/CRITICAL vulnerabilities (unfixed) |

- Trivy runs **between** Docker build and push, so a vulnerable image is never
  shipped to Docker Hub and never reaches the cluster.
- **All three gates are mandatory.** A failed gate aborts the pipeline — the
  build only goes ahead when every gate passes. OWASP and SonarQube run on
  every push (all branches); Trivy scans the images this run produced on the
  `main` release flow (images are only built there).
- SonarQube is **not optional**: if `SONAR_HOST_URL`/`sonarqube-token` are not
  configured on the Jenkins host the pipeline fails fast at the analysis stage
  with setup instructions. `jenkins/sonarqube/docker-compose.yml` provides a
  self-contained server (LTS + embedded H2).
- Reports land in `reports/` (git-ignored). Run any gate locally:
  `bash scripts/ci-owasp-dependency-check.sh`,
  `bash scripts/ci-trivy-scan.sh <image>:<tag>`, or the Maven/sonar commands
  in `jenkins/sonarqube/README.md`.

## Observability

Prometheus, Grafana, Alertmanager, node-exporter, kube-state-metrics, and
postgres-exporter ship in the same deploy, managed by a second Argo CD
Application (`monitoring`). Seven Grafana dashboards are auto-provisioned (no
manual import): Executive Overview, K8s Cluster, EC2/Node, App/API, PostgreSQL,
Workloads, and CI/CD. Prometheus ships with alert + recording rules
(`critical`/`warning`/`info`) and 15-day retention on a PVC.

Dashboards and Prometheus are **ClusterIP-only**; reach them with
port-forwarding:

```bash
kubectl -n monitoring port-forward svc/grafana 3000:3000     # http://localhost:3000
kubectl -n monitoring port-forward svc/prometheus 9090:9090   # http://localhost:9090
```

Grafana creds live in `.devshop/secrets.yml` (`grafana_admin_user` /
`grafana_admin_password`), rendered as a Secret by Ansible outside Argo CD so
they are never committed or pruned. Details in
`kubernetes/monitoring/README.md`.

## Security

| Port | Exposed | Use |
|------|---------|-----|
| `22` | your CIDR only | SSH |
| `80/443`, `30000-32767` | yes | NGINX ingress + NodePort range |
| `5173/5174/8080` | yes (compose fallback) | storefronts/backend via docker-compose path |
| `5432` | **closed** | PostgreSQL stays inside the cluster |

- The Argo CD and Grafana/Prometheus UIs are intentionally **not public** —
  reach them via `kubectl port-forward`.
- IAM uses least privilege (no AWS API policies on the instance role); no
  secrets in user_data or Terraform.
- No secrets, keys, or EC2 public IPs are committed to Git; every sensitive
  value is generated at deploy time.

## Day-to-day operations

**Cluster access** — SSH to the control-plane node (the only place with kubectl):

```bash
# from terraform output ssh_command, or:
ssh -i ~/.ssh/devshop.pem ubuntu@<control-plane-public-ip>
sudo kubectl get nodes --show-labels
sudo kubectl -n devshop get pods
```

**Deploy an app change** — just push to `main`: Jenkins builds it, Argo CD rolls
it out. Or manually update the tag in `kubernetes/overlays/aws/kustomization.yaml`
and push.

**Rollback** — point `newTag` back to a previous build number in
`kubernetes/overlays/aws/kustomization.yaml` and push; Argo CD syncs.

**Re-deploy after an IP change / resync** — run `./deploy.sh` again (idempotent),
or only the cluster-config part:

```bash
cd ansible && ./scripts/deploy.sh --deploy-only
```

**See the app/pod logs**:

```bash
sudo kubectl -n devshop logs deployment/backend --tail=100
sudo kubectl -n devshop logs -l app=customer-frontend --tail=100
```

**Scale** — the backend autoscales on CPU via HPA; resize a Deployment manually
with `kubectl -n devshop scale deployment/backend --replicas=2` if you ever want
more on a bigger node (thread carefully on `t3.micro`).

**Stop / restart** — the nodes have no Elastic IP, so an IP change after a stop
just needs a `./deploy.sh` re-run (it re-patches the ingress hosts). To truly
end the stack: `./destroy.sh`. PostgreSQL data lives on the node's local-path
volume, so a terminate loses it — back it up if you care (it is a single-node
learning setup, not HA).

## Troubleshooting

| Symptom | Check / fix |
|---------|-------------|
| Deploy hangs on "Wait for nodes Ready" | `ssh` to the control plane; `sudo kubectl get nodes` — make sure workers joined; see `/var/log/syslog` and `journalctl -u kubelet` on a worker |
| Ingress 404 | Host not mapped: after an IP change re-run `./deploy.sh`, or map `<ip>.nip.io` / your domain via `kubectl -n devshop get ingress` |
| PVC `Pending` | Storage class missing: run `install-storage.sh` or re-run the configure play |
| HPA never scales | `sudo kubectl top nodes` — Metrics Server must be reporting |
| Argo CD not syncing | Repo path/targetRevision wrong, or the `[ci skip]` write-back looped — enable the webhook path filter to `application/**` |
| Node `NotReady` / Pods evicted | The `t3.micro` is small — check memory with `sudo kubectl top nodes`; `docker`-free runs only on workers, keep replicas at 1 |

## Running locally without Docker

```bash
# backend (Java 21)
cd application/backend
export DB_USERNAME=devshop DB_PASSWORD=devshop
mvn spring-boot:run

# customer frontend
cd application/frontend && npm install && npm run dev   # :5173

# admin frontend
cd application/admin-frontend && npm install && npm run dev   # :5174
```

In dev the Vite servers proxy `/api` to `http://localhost:8080` (see each
`vite.config.ts`).

## Testing

```bash
cd application/backend && mvn clean test                    # JUnit
cd application/frontend && npm test                         # Vitest + RTL
cd application/admin-frontend && npm test
```

## Documentation

- `terraform/README.md` — infrastructure
- `ansible/README.md` — node bootstrap and cluster roles
- `kubernetes/README.md` — manifests, GitOps, rollback, troubleshooting
- `kubernetes/monitoring/README.md` — dashboards, alerts, verification
- `jenkins/README.md` — pipeline setup, DevSecOps gates, credentials
- `jenkins/sonarqube/README.md` — self-hosted SonarQube server

## License

TODO: add your project license here.