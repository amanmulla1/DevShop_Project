# DevShop — Simple kubeadm Demo

Deploys the **existing DevShop application** (customer storefront, admin
dashboard, Spring Boot backend, PostgreSQL) to a **standard kubeadm
Kubernetes cluster** using only basic resources:

`Namespace` · `ConfigMap` · `Secret` · `PersistentVolumeClaim` · `Deployment` · `Service` (NodePort)

No Ingress, no Helm, no Argo CD, no operators — nothing fancy. The frontends'
built-in Nginx reverse-proxies `/api/*` to the backend, so you only need the
frontend NodePorts.

## What gets deployed

| Component     | Image                                   | Container port | Service type   | Port (NodePort) |
|---------------|-----------------------------------------|----------------|----------------|-----------------|
| PostgreSQL    | `postgres:16`                           | 5432           | ClusterIP      | — (internal)    |
| Backend       | `amanmulla1/devshop-backend`            | 8080           | ClusterIP      | — (internal)    |
| Storefront    | `amanmulla1/devshop-frontend`           | 80             | **NodePort**   | **30080**       |
| Admin         | `amanmulla1/devshop-admin-frontend`     | 80             | **NodePort**   | **30081**       |

- **Customer storefront:** `http://<node-ip>:30080`
- **Admin dashboard:** `http://<node-ip>:30081`

Both frontends talk to the backend through their own Nginx as **same-origin
`/api`** → `backend:8080` (Kubernetes Service DNS). Nothing is hardcoded to
`localhost`, and no Ingress controller is required.

On first start the backend automatically:
- creates the schema (JPA `ddl-auto: update`), and
- seeds 16 demo products, 5 demo customers, demo orders, and a **bootstrap
  admin** account.

### Default admin login
- **Login:** `admin@devshop.com`
- **Password:** printed by `deploy.sh` (randomly generated; also retrievable from
  the `devshop-secret` Secret).

## Prerequisites

- A working **kubeadm Kubernetes cluster** (`kubectl` able to reach it —
  `kubectl cluster-info` must succeed). Minikube/K3s also work, but the target
  is a normal kubeadm cluster.
- `kubectl` on your PATH.
- Bash + `openssl` (for generating the random secrets).
- **Docker Hub reachable** from the cluster to pull images. If the cluster
  cannot reach Docker Hub, use `--build` (requires Docker + `ctr`/`nerdctl` on
  the node — see "Image availability" below).
- A default `StorageClass` in the cluster for PostgreSQL persistence
  (`kubectl get storageclass`). Without one, Postgres still runs but the PVC
  stays `Pending`.

## How to deploy

```bash
cd Demo
chmod +x deploy.sh
./deploy.sh
```

That's it — the script creates the namespace/config, generates a random Secret,
applies every manifest, then waits for all Deployments to become Ready and
prints the access URLs.

### Options

```bash
./deploy.sh            # deploy using Docker Hub images (default)
./deploy.sh --build    # build the images from ../application and load them locally
./deploy.sh status     # show current pods/services/urls
./deploy.sh --delete   # remove the demo deployment
./deploy.sh help       # show usage
```

> `deploy.sh` is idempotent: rerunning it only makes the changes still needed,
> and it reuses the same generated Secret so credentials don't rotate.

## Image availability on a kubeadm cluster

The manifests use `imagePullPolicy: IfNotPresent` with the DevShop Docker Hub
images. If your cluster has internet access, images pull automatically.

If the cluster cannot reach Docker Hub (air-gapped / restricted), build locally
and load them into containerd:

```bash
./deploy.sh --build
```

This uses Docker to build `backend`, `frontend` and `admin-frontend` from
`../application`, then loads each image into the cluster's containerd `k8s.io`
namespace (via `ctr` or `nerdctl`). Requires Docker and containerd CLI on the node.

## How to check pods / services

```bash
kubectl -n devshop-demo get pods -o wide
kubectl -n devshop-demo get svc
kubectl -n devshop-demo get pvc
kubectl -n devshop-demo rollout status deployment/backend
kubectl -n devshop-demo logs deployment/backend -f
```

## How to access the frontend through NodePort

From **any machine that can reach the cluster nodes**, open:

- Storefront: `http://<node-ip>:30080`
- Admin:     `http://<node-ip>:30081`

`<node-ip>` is any node's IP (`kubectl get nodes -o wide`). `deploy.sh` prints
these automatically at the end.

## How to remove the demo deployment

```bash
cd Demo
./deploy.sh --delete
```

This deletes the whole `devshop-demo` namespace (including the PostgreSQL PVC,
so data is removed). To also remove the local generated-secrets file:

```bash
rm Demo/.demo-secret-state
```
