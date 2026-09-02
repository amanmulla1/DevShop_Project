# DevShop Demo — Standalone Dockerfiles

> Build, push, and run DevShop on **any** sandbox/EC2 host. Everything is
> driven by env vars so you don't edit files between sandboxes.

4 standalone Dockerfiles to build and run the DevShop application **without
docker-compose**:

| Image to push                         | Dockerfile                   | Build context              | Port |
|---------------------------------------|------------------------------|----------------------------|------|
| `<NS>/devshop-backend:latest`         | `backend.Dockerfile`         | `application/backend`      | 8080 |
| `<NS>/devshop-frontend:latest`        | `customer-frontend.Dockerfile` | `application/frontend`   | 80  |
| `<NS>/devshop-admin-frontend:latest`  | `admin-frontend.Dockerfile`  | `application/admin-frontend`| 80  |
| `<NS>/devshop-postgres:16`            | `postgres.Dockerfile`        | `Demo/dockerfiles`         | 5432 |

`postgres-init.sql` is the init script baked into the postgres image.

## Push to Docker Hub

From the repository root:

```bash
docker login                                  # authenticate to Docker Hub
NAMESPACE=amanmulla1 bash Demo/dockerfiles/build-and-push.sh
```

(override `NAMESPACE`, `TAG`, `PG_TAG` via env as needed.)

That script does the equivalent of these 4 manual commands:

```bash
docker build -f Demo/dockerfiles/backend.Dockerfile \
    -t amanmulla1/devshop-backend:latest application/backend
docker push amanmulla1/devshop-backend:latest

docker build -f Demo/dockerfiles/customer-frontend.Dockerfile \
    -t amanmulla1/devshop-frontend:latest application/frontend
docker push amanmulla1/devshop-frontend:latest

docker build -f Demo/dockerfiles/admin-frontend.Dockerfile \
    -t amanmulla1/devshop-admin-frontend:latest application/admin-frontend
docker push amanmulla1/devshop-admin-frontend:latest

docker build -f Demo/dockerfiles/postgres.Dockerfile \
    -t amanmulla1/devshop-postgres:16 Demo/dockerfiles
docker push amanmulla1/devshop-postgres:16
```

> These image names/`latest` tags match the ones the Demo k8s manifests already
> reference (`<NS>/devshop-{backend,frontend,admin-frontend}:latest`), so
> after pushing you can point the cluster at them without manifest changes.

## Sandbox / fresh EC2 workflow (repeatable)

This flow was validated on a fresh Ubuntu sandbox (no Docker, no repo). Run it
again on a new host with just two answers: your **Docker Hub user** and your
**host's public IP/domain**.

```bash
# 1. (locally) SSH to the host and log the host's PUBLIC IP or DNS.
#    The browser reaches the app through that address, and the backend must
#    trust it for CORS.
HOST_IP="<PUBLIC_IP_OR_DNS>"

# 2. (on host) Install Docker (Ubuntu + docker.io package), add your user:
sudo apt-get update && sudo apt-get install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker $(whoami)   # re-login / use `newgrp docker` after

# 3. (from repo root) copy sources to the host (skip build artifacts):
#    tar --exclude=node_modules --exclude=dist -czf src.tgz \
#        application/backend application/frontend application/admin-frontend \
#        Demo/dockerfiles
scp -i <your-key.pem> src.tgz ubuntu@<HOST_IP>:/tmp/
#    ...extract to /opt/devshop on host

# 4. (on host) authenticate to Docker Hub:
docker login -u <DOCKER_USER>

# 5. (on host) build + push the 4 images:
NAMESPACE=<DOCKER_USER> bash /opt/devshop/Demo/dockerfiles/build-and-push.sh

# 6. (on host) run the stack (see next section) — remember to pass
#    CORS_ALLOWED_ORIGINS with the real host origin!
```

## Run without docker-compose

Because the frontends proxy `/api` → `backend:8080` inside a Docker network,
create a user-defined network and run the 4 containers:

```bash
docker network create devshop

# BASE_IMG = your Docker Hub image prefix (e.g. mrbean1815/devshop-)
BASE_IMG=mrbean1815

# HOST_ORIGIN = the origin the BROWSER uses to reach the app, e.g.
#   http://<PUBLIC_IP>, http://<PUBLIC_IP>:81 (storefront/admin)
# If you reach it via localhost, use: http://localhost,http://localhost:81
HOST_ORIGIN="http://<PUBLIC_IP>:80,http://<PUBLIC_IP>:81"

ADMIN_EMAIL=admin@devshop.com
ADMIN_PASSWORD=KeepMeSafe#123!

docker run -d --name postgres --network devshop \
  -e POSTGRES_DB=devshop -e POSTGRES_USER=devshop -e POSTGRES_PASSWORD=devshop \
  ${BASE_IMG}/devshop-postgres:16

# IMPORTANT: CORS_ALLOWED_ORIGINS must include the exact origin the browser
# uses. Without it the backend returns "403 Invalid CORS request" and login
# fails in the browser even though curl (which sends no Origin header) works.
docker run -d --name backend --network devshop \
  -e SERVER_PORT=8080 -e DB_HOST=postgres -e DB_PORT=5432 -e DB_NAME=devshop \
  -e DB_USERNAME=devshop -e DB_PASSWORD=devshop \
  -e JWT_SECRET=$(head -c32 /dev/urandom | base64) \
  -e JPA_DDL_AUTO=update -e ADMIN_EMAIL=$ADMIN_EMAIL -e ADMIN_PASSWORD=$ADMIN_PASSWORD \
  -e CORS_ALLOWED_ORIGINS="$HOST_ORIGIN" \
  ${BASE_IMG}/devshop-backend:latest

docker run -d --name customer-frontend --network devshop -p 80:80 \
  ${BASE_IMG}/devshop-frontend:latest

docker run -d --name admin-frontend --network devshop -p 81:80 \
  ${BASE_IMG}/devshop-admin-frontend:latest
```

The app is reachable at `http://localhost` (storefront) and
`http://localhost:81/admin` (admin):

- Storefront: `http://<PUBLIC_IP>/` (port 80)
- Admin login: `http://<PUBLIC_IP>:81/admin`
- Admin credentials: `admin@devshop.com` password defined by `ADMIN_PASSWORD`

> **Gotcha (CORS):** the browser sends an `Origin` header on `POST /api/auth/*`.
> The backend only trusts origins listed in `CORS_ALLOWED_ORIGINS`. Set it to
> the real host origin (not `localhost` alone) or browser login will 403 while
> curl works. This is the most common reason "admin login fails".
