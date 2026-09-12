# DevShop - Kubernetes (K8s) + Argo CD (GitOps)

> **DevShop uses standard Kubernetes (K8s), NOT K3s.**
> No K3s, MicroK8s, Minikube, or Kind is used. Deployment is GitOps-driven with
> **Argo CD**.

This deploys the DevShop application (customer frontend, admin frontend, Spring
Boot backend, PostgreSQL) onto a **standard Kubernetes** cluster, with **Argo
CD** managing the desired state from Git.

---

## 1. Why standard Kubernetes was selected

- The project deliberately targets standard upstream Kubernetes with Argo CD
  for GitOps-based CD.
- K3s, MicroK8s, Minikube, and Kind are explicitly out of scope.
- For a low-cost learning environment the cluster is a **control plane + two
  workers** on small EC2 nodes (defaults in `terraform/variables.tf`) — see
  limitations below.

### Cluster topology (no false HA claims)
- **One control plane.** It stays tainted and runs none of the application
  workloads.
- **Workers** carry the actual load: worker[0] is the app node, worker[1] is
  the monitoring node. A single-worker cluster co-locates both.
- **No HA**: one control plane means a control-plane node loss takes the API
  server down. We do **not** claim production-grade HA for this setup.

---

## 2. EC2 requirements

Standard Kubernetes (kubeadm) on a `t3.micro` (1 vCPU / 1 GiB) is only
comfortable when the roles are split. That is why the Terraform stack defaults
to three `t3.micro` nodes: one control plane, one app worker, one monitoring
worker.

- Nodes: `t3.micro` (1 vCPU, 1 GiB) by default, one per role.
- Root volume: >= 20 GiB (default) to fit containerd images + local-path data.
- Ubuntu 24.04 LTS (validated by the install script; 22.04 also supported).
- SSH ingress restricted to your admin CIDR (Terraform already enforces this).

> The Kustomize overlay pins workloads to nodes with labels (`app-node`,
> `monitoring-node`), so unlabelled control-plane nodes never receive
> application or monitoring pods.

---

## 3. Kubernetes installation method

The cluster is bootstrapped by two scripts, run remotely by Ansible:

- `kubernetes/scripts/install-kubernetes.sh` — runs on the **control-plane**
  node.
- `kubernetes/scripts/join-worker.sh` — runs on each **worker**.

`install-kubernetes.sh` uses **upstream components** only:

1. **Host prep** — disables swap, loads `overlay` / `br_netfilter` modules, sets
   the required kubelet/CNI sysctls.
2. **containerd** (container runtime) — installed from Docker's apt repo and
   configured with the **systemd cgroup driver** (required by kubelet).
3. **kubeadm / kubelet / kubectl** — installed from the official Kubernetes apt
   repo (`pkgs.k8s.io`) and version-pinned (holds).
4. **`kubeadm init`** — single control plane; pod CIDR set to match Calico. The
   node stays **tainted** (the default `control-plane` taint is not removed), so
   application pods only land on labelled workers.
5. **kubectl** — kubeconfig installed for root and the `ubuntu` user.
6. **Join token/command** — a join command is written to
   `/etc/kubernetes/join/devshop-join-command.sh` (as a root-only file) so
   workers can join the cluster without any manual token handling.
7. **Calico CNI** — open-source networking; pod-to-pod + Service routing.
8. **Metrics Server** — enables `kubectl top` and the HPA.

Workers run `join-worker.sh`, which installs the same runtime/kubelet prereqs
and then executes the join command from the control plane (reusing a saved
`kubelet.conf` when present, so re-runs are idempotent).

The scripts verify OS support and refuse to run on unknown versions; both are
safe to re-run.

### Container runtime
- **containerd** is the Kubernetes container runtime (not Docker Engine).
- Docker remains installed and useful for **image building**, **Jenkins**, and
  local **Docker Compose** — but Kubernetes uses containerd.

### CNI
- **Calico** is installed as the open-source CNI. Verify healthy pods:
  `kubectl get pods -n kube-system` → Calico pods `Running/Ready`.
- Pod CIDR default `10.244.0.0/16` matches Calico; override with `CNI_POD_CIDR`.

### Verify
```bash
kubectl get nodes          # control plane Ready + workers Ready
kubectl get nodes --show-labels   # app-node / monitoring-node on the workers
kubectl get pods -A        # kube-system + CNI pods healthy
kubectl get storageclass   # present after install-storage.sh
```

---

## 4. kubectl

Installed with kubeadm. Configured in `/root/.kube/config` and
`/home/ubuntu/.kube/config`. Remote access is fine via the same kubeconfig.

```bash
kubectl version
kubectl get nodes
```

---

## 5. Namespaces

- **`devshop`** — application namespace (`kubernetes/base/namespace.yaml`).
- **`argocd`** — Argo CD namespace (`kubernetes/argocd/namespace.yaml`).

Argo CD is installed and isolated from the application.

---

## 6. Application resources (Kustomize base)

`kubernetes/base/` holds the application manifests. Structure:

```
kubernetes/
├── namespace.yaml
├── base/
│   ├── kustomization.yaml
│   ├── configmap.yaml
│   ├── secret.example.yaml          (committed template; never real values)
│   ├── backend/         deployment.yaml + service.yaml
│   ├── customer-frontend/ deployment.yaml + service.yaml
│   ├── admin-frontend/   deployment.yaml + service.yaml
│   └── postgres/         pvc.yaml + deployment.yaml + service.yaml
├── overlays/
│   └── aws/
│       ├── kustomization.yaml       (image tags, resources)
│       ├── ingress.yaml             (NGINX Ingress)
│       ├── hpa.yaml                 (backend autoscaler)
│       └── secret.example.yaml      (template; real secret.git-ignored)
├── argocd/
│   ├── namespace.yaml
│   └── application.yaml             (Argo CD Application)
└── scripts/
    ├── install-kubernetes.sh
    ├── install-storage.sh
    ├── install-ingress.sh
    ├── install-argocd.sh
    └── deploy.sh
```

### Deployments
| Workload | Image | Notes |
| -------- | ----- | ----- |
| `backend` | `amanmulla1/devshop-backend:<tag>` | Spring Boot, port 8080 |
| `customer-frontend` | `amanmulla1/devshop-frontend:<tag>` | Nginx static + /api proxy |
| `admin-frontend` | `amanmulla1/devshop-admin-frontend:<tag>` | Nginx static + /api proxy |
| `postgres` | `postgres:16` | single instance, PVC-backed |

All application Deployments use **RollingUpdate** (`maxUnavailable: 0`,
`maxSurge: 1`). PostgreSQL uses **Recreate** (single-instance DB: one pod at a
time). We do not claim zero downtime unless tested.

### Services
- `backend:8080` — ClusterIP.
- `customer-frontend:80`, `admin-frontend:80` — ClusterIP.
- `postgres:5432` — ClusterIP.

Frontends are internal; the Ingress exposes them externally.

### ConfigMap (`devshop-config`)
Non-secret environment for the backend: `SERVER_PORT`, `DB_HOST=postgres`,
`DB_PORT=5432`, `DB_NAME`, `TZ`, `JPA_DDL_AUTO`, `JWT_EXPIRATION_MS`,
`CORS_ALLOWED_ORIGINS`, `ADMIN_EMAIL`, `ADMIN_NAME`.

### Secret (`devshop-secret`)
Sensitive values: `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`.

**The Secret is NOT managed by Argo CD / NOT in Git.** It is created outside the
Kustomize/Argo CD path (`kubectl apply`), so real values are never committed and
Argo CD can neither overwrite nor prune it. A committed template is at
`overlays/aws/secret.example.yaml`.

### Probes
- Backend readiness + liveness: `GET /actuator/health`.
- PostgreSQL readiness + liveness: `pg_isready`.
- Frontends: `GET /` HTTP probes.
- Timings are not aggressive (30s/60s delays, 10–15s periods).

### Resources
Requests/limits tuned for a small AWS instance (no memory overallocation):
- Backend: 250m/1000m CPU, 512Mi/1Gi memory.
- Frontends: 50m/250m CPU, 64Mi/256Mi memory.
- PostgreSQL: 100m/1000m CPU, 256Mi/1Gi memory.

---

## 7. Ingress

`overlays/aws/ingress.yaml` uses the **NGINX Ingress Controller** (open source,
no paid AWS load balancer).

- `devshop.local` → `customer-frontend`
- `devshop-admin.local` → `admin-frontend`

**`/api` routing:** each frontend's Nginx reverse-proxies `/api/*` to
`backend:8080` inside the cluster. The browser only ever talks to a single
external origin via relative `/api` URLs, so **no separate `/api` Ingress rule**
is needed. The browser never calls `http://backend:8080` (it cannot resolve
Kubernetes service names).

### Hosts are configurable (no hard-coded EC2 IP)
The manifest uses placeholder hosts. For real access set the hosts to your
domain(s) and add DNS records (A/CNAME) to the node's public IP, or use
`/etc/hosts` for local testing:

```bash
sudo sh -c 'echo "<NODE_PUBLIC_IP> devshop.local devshop-admin.local" >> /etc/hosts'
```

**CORS:** with the shared external origin the API is same-origin. Keep explicit
origins (no wildcard `*`) — set `CORS_ALLOWED_ORIGINS` in the ConfigMap to the
exact browser-facing origins and keep them aligned with the Ingress hosts.

---

## 8. PostgreSQL storage

- `postgres-pvc` (5 Gi, `local-path` StorageClass) keeps data on persistent
  storage — data survives pod recreation and redeploys.
- **Never** run `docker compose down -v` / delete the PVC during normal
  deployments/rollbacks.
- Storage class is provided by the open-source **local-path-provisioner**
  (independent of K3s) installed by `install-storage.sh`. **Verify** with
  `kubectl get storageclass` first; the PVC's `storageClassName` is configurable
  for other clusters.

---

## 9. HPA

`overlays/aws/hpa.yaml` scales the backend (**min 1, max 3, CPU 70%**). It only
works after Metrics Server is installed and reporting. Verify before claiming
HPA works:

```bash
kubectl top nodes
kubectl top pods -n devshop
kubectl -n devshop get hpa   # utilization populated
```

---

## 10. Argo CD (GitOps)

### Install
`kubernetes/scripts/install-argocd.sh` applies the official Argo CD manifests
and registers the DevShop Application. Verify:

```bash
kubectl get pods -n argocd                    # Running/Ready
kubectl -n argocd get applications            # devshop
kubectl -n argocd get application devshop -o jsonpath='{.status.sync.status} {.status.health.status}'
# Expected: Synced Healthy
```

### Application source
Definition: `kubernetes/argocd/application.yaml`.
- **repoURL:** `https://github.com/amanmulla1/DevShop_Project.git`
- **path:** `kubernetes/overlays/aws`
- **targetRevision:** `main`
- **destination:** `https://kubernetes.default.svc`, namespace `devshop`

The repo is **public**, so no repository credentials are required. If it becomes
**private**, add a repository credential in Argo CD (never commit credentials).

### Auto-sync / self-heal / prune
- `automated.prune: true`, `automated.selfHeal: true`.
- **Prune safety:** the `devshop-secret` is not managed by Argo CD, so prune
  cannot remove it. PostgreSQL persistence (the PVC) is only pruned if removed
  from Git. Terraform infrastructure and Argo CD itself live outside the app's
  scope and are never touched. `PruneLast=true` avoids deleting a DB before new
  state is ready.

### Argo CD UI (security)
The admin UI is **not exposed publicly**. Use:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
# open https://localhost:8080  (admin)
```

Retrieve and rotate the initial admin password (see `install-argocd.sh`).

---

## 11. GitOps workflow

```
Developer
  → git push to GitHub (application source)
    → Jenkins (CI)
        → tests
        → build
        → Docker images → Docker Hub (immutable tag :<BUILD_NUMBER>)
        → update kubernetes/overlays/aws/kustomization.yaml image tag in Git
            → GitHub
              → Argo CD detects the change, syncs
                → Kubernetes rolls out the new image
                  → health checks
```

Jenkins does **not** run `kubectl apply` for normal deploys. Argo CD is the CD
mechanism. Docker Compose + `scripts/ci-*.sh` remain available for local dev as
a fallback path, but they are not the cluster deploy path.

### Image versioning
- Jenkins tags images immutably: `:42`, `:43`, … (+ `:latest`).
- The desired tag lives in `overlays/aws/kustomization.yaml` (`images.newTag`).
- No single build number is hard-coded in the base manifests.

### Rollback (Git-based)
Update the desired tag in Git and push; Argo CD syncs back:

```bash
# current backend:42 -> roll back to 41
# edit kubernetes/overlays/aws/kustomization.yaml newTag: 41
git add kubernetes/overlays/aws/kustomization.yaml
git commit -m "rollback(kubernetes): backend to :41 [ci skip]"
git push
# Argo CD syncs -> Kubernetes runs :41
```

### Avoiding the GitOps loop
1. The image-tag write-back commit includes **`[ci skip]`**.
2. The Jenkinsfile **Skip Guard** stage aborts when a commit only touches
   `kubernetes/*`.
3. Configure the GitHub webhook to **path-filter** to application source (e.g.
   `application/**`) so manifest write-backs never trigger Jenkins.

---

## 12. Verification & tests

Standard Kubernetes verification:

```bash
kubectl get nodes
kubectl get namespaces
kubectl get pods -n devshop
kubectl get svc -n devshop
kubectl get ingress -n devshop
kubectl get pvc -n devshop
```

Argo CD verification:

```bash
kubectl get pods -n argocd
kubectl -n argocd get applications
```

- **Drift / self-heal test:** `kubectl edit deployment/backend -n devshop`,
  change an image or a value, then watch Argo CD detect `OutOfSync` and restore
  it (`kubectl -n argocd get application devshop -w`).
- **Persistence test:** add data, `kubectl delete pod/<postgres-pod> -n devshop`,
  wait for recreation, verify data remains. Do not delete the PVC.
- **End-to-end GitOps test:** make a small app change → push → Jenkins builds/
  pushes → updates tag in Git → Argo CD syncs → Kubernetes rolls out → app
  healthy.

Application checks: customer (home, products, categories, login, registration,
cart, checkout, Pay on Delivery, order history) and admin (login, dashboard,
products, customers, orders) all continue to work through the Ingress.

---

## 13. Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| Node not `Ready` | K8s still starting; `journalctl -u kubelet -n 100`; check containerd running |
| CNI pods not Running | Calico not applied / pod CIDR mismatch; `kubectl get pods -n kube-system` |
| `ImagePullBackOff` | tag not on Docker Hub; confirm tag in kustomization/newTag |
| Backend `CrashLoopBackOff` | `kubectl -n devshop logs deploy/backend`; often DB env/secret |
| Secret not found | create `devshop-secret` from `secret.example.yaml` (outside Argo CD) |
| Ingress 404 | host not mapped to node IP; ingress controller not installed; check `kubectl -n ingress-nginx get pods` |
| PVC `Pending` | storage class missing; run `install-storage.sh`; `kubectl get storageclass` |
| HPA never scales | Metrics Server not reporting; `kubectl top nodes` |
| Argo CD not syncing | repo path/`targetRevision` wrong; or manifest write-back missing `[ci skip]` (loop) |

---

## 14. AWS considerations / responsibilities

| Concern | Owner |
| ------- | ----- |
| VPC, subnet, security group, EC2 fleet | **Terraform** |
| CI/CD + image publishing | **Jenkins** |
| CD / GitOps | **Argo CD** |
| Runtime / orchestration | **Kubernetes** |
| Cluster/server automation | **Ansible** (`ansible/roles/kubernetes_*`) |
| Observability | **Prometheus + Grafana** (`kubernetes/monitoring/`) |

No EKS, RDS, NAT Gateway, or managed Load Balancer is added. No secrets or EC2
public IPs are committed to Git.
