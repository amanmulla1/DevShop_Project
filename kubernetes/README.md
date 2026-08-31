# DevShop — Kubernetes on K3s (Phase 6)

**Purpose:** run the DevShop full-stack application (Spring Boot backend,
PostgreSQL, customer + admin frontends) as **Kubernetes** resources on a single
lightweight **K3s** node on the Free-Tier EC2.

K3s is a CNCF-graduated, lightweight Kubernetes distribution. It bundles its own
Ingress controller (**Traefik**) and a storage class (**local-path**), so we
introduce **no** EKS, NAT Gateway, RDS, managed load balancer, or other
paid/managed Kubernetes services — consistent with the project's scope.

Ownership model:

| Concern            | Owner                      | Phase |
| ------------------ | -------------------------- | ----- |
| EC2 infrastructure | Terraform                  | 4     |
| CI/CD + images     | Jenkins (Docker Hub)       | 5     |
| App orchestration  | Kubernetes (K3s, this dir) | 6     |

---

## Architecture

Everything lives in the `devshop` namespace (see `namespace.yaml`):

```
K3s single node
└── devshop namespace
    ├── deployment/postgres   -> PVC (local-path, 5Gi) -> data persists past pods
    ├── deployment/backend    -> Service backend:8080 (env from ConfigMap + Secret)
    ├── deployment/customer-frontend -> Service customer-frontend:80
    ├── deployment/admin-frontend    -> Service admin-frontend:80
    ├── configmap/devshop-config     (non-secret env)
    ├── secret/devshop-secret        (DB/JWT/admin secrets; NOT in git)
    └── ingress/devshop-ingress (Traefik)
           devshop.local       -> customer-frontend
           devshop-admin.local -> admin-frontend
```

- Each frontend's Nginx reverse-proxies `/api/*` to the backend at the cluster
  DNS name `backend:8080` (same as the Phase 5 Nginx config), so requests stay
  same-origin and no separate `/api` Ingress rule is required.
- PostgreSQL uses **`postgres:16`** (matching Docker Compose) with a
  `PersistentVolumeClaim` backed by K3s `local-path`. Data survives pod
  restarts and redeploys.

---

## Image tagging (no hard-coded build number)

Jenkins (Phase 5) publishes immutable images to Docker Hub, tagged with the
build number (e.g. `amanmulla1/devshop-backend:42`). Kubernetes pulls those
prebuilt images — it does **not** build.

Deployment manifests use a placeholder image; the exact
`registry` + `tag` is passed at deploy time:

- default tag: `latest`
- override with `--tag <BUILD_NUMBER>` (e.g. the Jenkins build just pushed)

---

## 1. Install K3s (one-time, on the EC2 host)

Run as root on the Terraform-created EC2:

```bash
sudo bash scripts/install-k3s.sh
```

The script:

1. verifies the OS (systemd Linux),
2. installs the K3s server (`https://get.k3s.io`) and enables/starts the service,
3. installs the kubeconfig to `/root/.kube/config`,
4. verifies `kubectl get nodes` (expect `Ready`) and the storage class
   (expect `local-path`).

Hosts / DNS: `ingress.yaml` uses placeholder hosts `devshop.local` and
`devshop-admin.local` (no EC2 IP is hard-coded). For browser access you map them:

```bash
# On the machine running the browser, map the node's public IP to the hosts
# (adjust the IP to your EC2 public IP):
echo "<NODE_PUBLIC_IP> devshop.local devshop-admin.local" | sudo tee -a /etc/hosts
```

For a real domain, update `CORS_ALLOWED_ORIGINS` in `configmap.yaml` and the
Ingress hosts **exactly** to the origins the browsers will use (never wildcard).

---

## 2. Create the Secret

`devshop-secret` holds the sensitive values (`DB_USERNAME`, `DB_PASSWORD`,
`JWT_SECRET`, `ADMIN_PASSWORD`). **Never commit real values.**

```bash
# From the repo root:
cp kubernetes/secret.example.yaml kubernetes/secret.yaml
# Edit kubernetes/secret.yaml and replace the BASE64 PLACEHOLDERS with REAL values:
#   echo -n 'your-real-value' | base64
```

`kubernetes/secret.yaml` is **git-ignored** (rule in root `.gitignore`).

---

## 3. Deploy / update the application

Run from a machine with `kubectl` access (the K3s node, or a workstation with a
`KUBECONFIG` pointing at the cluster):

```bash
bash scripts/deploy-kubernetes.sh                # deploy latest tag
bash scripts/deploy-kubernetes.sh --tag 42       # deploy Jenkins build #42
bash scripts/deploy-kubernetes.sh --tag 42 --registry amanmulla1
```

The script:

1. verifies the cluster and storage class,
2. creates `secret.yaml` from the example template if missing (and warns),
3. dry-run-validates the full Kustomize bundle,
4. `kubectl apply -k kubernetes` (namespace → config → postgres → backend →
   frontends → ingress → HPA),
5. sets each Deployment to the requested immutable image tag,
6. waits for rollouts and prints cluster status.

---

## 4. Verify

```bash
kubectl -n devshop get pods,svc,deploy,pvc,ingress,hpa
kubectl -n devshop exec deploy/backend -- wget -qO- http://localhost:8080/actuator/health
```

- Backend is `Ready` when `/actuator/health` returns `UP` (readiness probe).
- In the browser, open `http://devshop.local` (customer) and
  `http://devshop-admin.local` (admin) after mapping hosts.

---

## 5. Rollback

Each deployment is a separate, immutable image tag, so rollback is just
pointing each Deployment back at an earlier tag:

```bash
bash scripts/deploy-kubernetes.sh --tag 37    # re-apply with the previous build
```

PostgreSQL data is unaffected (it lives in the PVC), so rollback never loses
data.

---

## 6. Scaling / HPA (optional)

- Scale manually: `kubectl -n devshop scale deploy/backend --replicas=2`
- `hpa.yaml` defines an HPA (min 1, max 3, target 70% CPU) for the backend.
  The HPA requires the **Metrics Server**, which K3s does **not** install by
  default. Install it if you want autoscaling:

  ```bash
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  kubectl -n devshop get hpa    # confirm STATUS is Active and target is met
  ```

  On a small Free-Tier node keep `backend` at 1 replica unless measured demand
  requires more.

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| Node not `Ready` | K3s still starting; wait, or check `journalctl -u k3s -n 100` |
| Pod `ImagePullBackOff` | image/tag not on Docker Hub; confirm tag with `--tag` |
| Backend `CrashLoopBackOff` | check logs `kubectl -n devshop logs deploy/backend`; often DB env or secret |
| Secret not found | run `cp secret.example.yaml secret.yaml` + fill values before apply |
| 404 / wrong app | host-based routing — confirm /etc/hosts mapping & CORS origins |
| `local-path` PVC `Pending` | storage class present? `kubectl get storageclass` after K3s install |
| HPA never scales | Metrics Server not installed (see §6) |

---

## Key files

| File | Purpose |
| ---- | ------- |
| `namespace.yaml` | `devshop` namespace + labels |
| `configmap.yaml` | non-secret env (`SERVER_PORT`, `DB_*`, `CORS_ALLOWED_ORIGINS`, admin bootstrap) |
| `secret.example.yaml` | **template** for the real (git-ignored) `secret.yaml` |
| `postgres/` | `pvc.yaml` + `deployment.yaml` + `service.yaml` (persistent data) |
| `backend/` | deployment (probes, resources) + ClusterIP service |
| `customer-frontend/`, `admin-frontend/` | Nginx deployments + ClusterIP services |
| `ingress.yaml` | Traefik host-based routing |
| `hpa.yaml` | optional backend autoscaling (needs Metrics Server) |
| `kustomization.yaml` | bundle + configurable images |
| `../scripts/install-k3s.sh` | idempotent K3s install |
| `../scripts/deploy-kubernetes.sh` | validate → apply → tag → rollout → status |
