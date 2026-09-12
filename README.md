# DevShop

A full-stack e-commerce platform: customer storefront, admin dashboard, and a
REST API backend, deployed with Terraform + Ansible + Kubernetes (Argo CD
GitOps) on AWS.

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
backend. The browser only ever talks to its own origin, so no backend IP or
hostname is baked into the bundles — the same image runs on `localhost`, an EC2
IP, or a real domain without a rebuild.

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
├── scripts/                # CI deploy / health check / rollback helpers
├── jenkins/                # Jenkins setup notes
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

## Deploying to AWS (one command)

`./deploy.sh` provisions everything: the EC2 fleet, a standard kubeadm
Kubernetes cluster, Argo CD, and the full app with monitoring — then prints the
URLs when the health checks pass.

```bash
./deploy.sh
```

What it does, in order:

1. checks prerequisites (terraform, ansible, ssh key, AWS credentials)
2. generates secure secrets once (reused on later runs, never printed/committed)
3. Terraform: VPC, subnet, gateway, security groups, and the EC2 nodes
4. generates the Ansible inventory from the Terraform outputs (no manual IPs)
5. bootstraps every node (containerd, kubeadm, kubelet, kubectl, Calico CNI)
6. inits the control plane and joins the workers
7. labels nodes for workload placement (app / monitoring)
8. installs local-path storage, NGINX ingress, and Argo CD
9. applies the DevShop and monitoring secrets outside Argo CD
10. waits for Argo CD to sync both Applications (Synced + Healthy)
11. runs health checks and prints the final summary

Re-running it only makes the changes still needed — there is nothing to destroy
and start over. The cluster is torn down explicitly:

```bash
./destroy.sh
```

### Free-tier setup

The fleet defaults to `t3.micro` nodes: one dedicated control plane and two
workers, where one worker runs the application and the other runs the
monitoring stack (with a single worker, both run on it). Everything is EC2
inside the default VPC — no ELB, NAT, RDS, or EKS to push it over budget. The
trade-off is that instance-hours add up across the fleet, so stop the nodes
when you are not using the cluster.

### One-time prerequisites

1. AWS credentials configured (`aws configure` or env vars).
2. `terraform/terraform.tfvars` copied from the example, with your
   `key_pair_name` and `admin_cidr` set.
3. The SSH private key for that key pair: set `DEVSHOP_SSH_KEY=/path/to.pem` or
   drop a `*.pem` in `~/.ssh` (auto-detected).
4. Docker Hub + GitHub credentials for the Jenkins pipeline.

### How secrets and IPs are handled

Everything sensitive is generated on your machine once, into a gitignored
`.devshop/secrets.yml` (mode 0600), and reused on every run. The same values are
persisted on the control-plane node by Ansible, with `no_log` on every
sensitive task. Nothing is printed, committed, or passed on the command line.

The public IPv4 is read from Terraform outputs, not hard-coded anywhere. The
ingress hostnames are derived at apply time from the detected IP (e.g.
`http://<ip>.nip.io`), so an IP change after stop/start only needs a `./deploy.sh`
re-run.

## Kubernetes details

The cluster is standard Kubernetes (kubeadm, containerd, Calico), not K3s.

- **Control plane** stays tainted and single-node (no HA); workers take the
  actual workload.
- **Storage:** local-path provisioner for the PostgreSQL PVC
  (`local-path` StorageClass).
- **Ingress:** NGINX Ingress Controller via NodePort — no load balancer.
- **Namespaces:** `devshop` (app), `monitoring` (observability), `argocd`
  (GitOps).
- **App:** backend, customer-frontend, admin-frontend, postgres — Deployments,
  Services, ConfigMap, probes, HPA (backend).
- **Placement:** the Kustomize AWS overlay pin-workloads to the app node; the
  monitoring overlay pins Prometheus/Grafana/Alertmanager to the monitoring
  node.

### GitOps flow

Jenkins tests and builds the code, pushes images to Docker Hub, and updates the
immutable image tag in `kubernetes/overlays/aws/kustomization.yaml`. Argo CD
watches the repo, syncs the change, and rolls out the new revision:

```
git push -> Jenkins (tests, build, push) -> image tag updated in Git
  -> Argo CD detects -> syncs -> K8s rollout -> health checks
```

Rollback is Git-based too: point the tag back to an older image and push. A
`[ci skip]` convention in the pipeline avoids the GitOps loop. The Argo CD repo
is public, so no repo credentials are required.

## CI/CD

`Jenkinsfile` runs on every push to `main`: tests, builds, Docker push, image
tag update, and health checks. See `jenkins/README.md` for the full setup and
`scripts/` for the deploy/health/rollback helpers.

## Observability

Prometheus, Grafana, Alertmanager, node-exporter, kube-state-metrics, and
postgres-exporter ship in the same deploy, managed by a second Argo CD
Application. Seven Grafana dashboards are auto-provisioned (no manual import),
and Prometheus ships with alert + recording rules.

Grafana and Prometheus are ClusterIP-only; access them with port-forwarding:

```bash
kubectl -n monitoring port-forward svc/grafana 3000:3000
```

Grafana creds live in `.devshop/secrets.yml` (`grafana_admin_user` /
`grafana_admin_password`), rendered as a Secret by Ansible outside Argo CD so
they are never committed or pruned. Details in
`kubernetes/monitoring/README.md`.

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
- `jenkins/README.md` — pipeline setup

## License

TODO: add your project license here.