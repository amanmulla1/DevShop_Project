# DevShop — Phase 5: Ansible (EC2 configuration & application deployment)

Ansible configures the Terraform-provisioned EC2 host and deploys the DevShop
application with Docker Compose.

```
Terraform apply
      ↓  (provisions VPC/subnet/IGW/SG/EC2 — infrastructure only)
terraform output -raw instance_public_ip
      ↓
generate Ansible inventory
      ↓
ansible-playbook site.yml
      ↓  (common -> docker -> devshop)
Docker installed + enabled → repo cloned → .env rendered → compose up → health checks
```

> **Scope:** host configuration + application deployment only. Ansible does not
> provision AWS infrastructure (that stays with Terraform). No Kubernetes,
> Jenkins, or Prometheus/Grafana in this phase.

---

## Prerequisites

- **Ansible** (>= 2.15; `ansible-core` + the built-in collections suffice — no
  third-party collections are required)
- The **Terraform stack from Phase 4 applied**, producing an EC2 instance
- An **SSH private key** (the `.pem`) for the instance's `ubuntu` user
- The EC2 **public IPv4** (from `terraform output -raw instance_public_ip`)

Install Ansible (a few options):

```bash
# Debian/Ubuntu host
sudo apt update && sudo apt install -y ansible

# Python (any version computer)
python3 -m pip install --user ansible-core
```

### Windows / WSL

Run everything from inside WSL where `terraform` and your `.pem` are accessible.
Place the key on the Linux filesystem (`~/.ssh/devshop.pem`) with

```bash
chmod 600 ~/.ssh/devshop.pem
```

---

## Inventory setup

The EC2 instance intentionally has **no Elastic IP**, so its public IPv4 can
change on stop/start. The inventory is therefore **generated, not hard-coded**:

```bash
# From ansible/
./scripts/generate_inventory.sh
```

This writes `inventory/hosts.ini` using `terraform output -raw instance_public_ip`.
The committed `inventory/hosts.ini.example` documents the expected format.

Connection defaults live in `inventory/group_vars/all/main.yml`
(`ansible_user: ubuntu`, SSH key path, Python interpreter, repo URL/branch, etc.).

---

## Vault setup

Sensitive values (`DB_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`, ...) are
stored in the **encrypted** `inventory/group_vars/all/vault.yml`. See
`vault/README.md` for the exact keys and create-command.

```bash
cd ansible
ansible-vault create inventory/group_vars/all/vault.yml --vault-id devshop@prompt
```

The real `vault.yml` is git-ignored. Only the `*.example` (placeholders) is
committed — **no plaintext secrets** are ever in Git.

---

## Commands

```bash
cd ansible

# 1) Validate before deploying
ansible-playbook -i inventory/hosts.ini --ask-vault-pass --syntax-check playbooks/site.yml
ansible-lint playbooks/site.yml            # if ansible-lint is installed

# 2) Dry run (check mode) — best-effort on a fresh host
ansible-playbook -i inventory/hosts.ini --ask-vault-pass --check playbooks/site.yml

# 3) Full provision + deploy
./scripts/deploy.sh                         # or manually:
ansible-playbook -i inventory/hosts.ini --ask-vault-pass \
    --private-key ~/.ssh/devshop.pem playbooks/site.yml

# 4) Re-deploy only (after an IP change or a new commit) without host changes
./scripts/deploy.sh --deploy-only
#    i.e. ansible-playbook -i inventory/hosts.ini --ask-vault-pass playbooks/deploy.yml
```

Non-interactive vault password:

```bash
DEVSHOP_VAULT_FILE=~/.secrets/devshop.vault-pass DEVSHOP_SSH_KEY=~/.ssh/devshop.pem ./scripts/deploy.sh
```

---

## Example end-to-end workflow

```bash
# 1. Provision infrastructure
cd terraform
terraform init
terraform validate
terraform plan
terraform apply
terraform output -raw instance_public_ip   # -> the EC2 public IPv4

# 2. Deploy the application
cd ../ansible
ansible-vault create inventory/group_vars/all/vault.yml
./scripts/deploy.sh

# 3. Verify
curl http://<public-ip>:5173/               # customer
curl http://<public-ip>:5174/               # admin
curl http://<public-ip>:5174/api/products   # products via Nginx /api
```

---

## What each role does

| Role     | Responsibility |
|----------|----------------|
| `common` | apt update, base packages (curl, git, ca-certificates, ...), timezone |
| `docker` | Idempotent Docker Engine + Compose v2 install (conflict-safe), enable on boot, docker group |
| `devshop`| Clone/update repo, auto-detect public IP, render `.env` (vault), `docker compose up -d --build`, health checks |

### Compose v2 conflict handling
The docker role detects whether `docker compose` already works and only installs
Compose when needed, choosing the method that matches the engine (Docker repo
plugin for `docker-ce`, `docker-compose-v2` for Ubuntu `docker.io`) — avoiding the
earlier dpkg file-conflict. Idempotent: a second run makes no changes.

### Server public IP detection
`devshop` auto-detects the EC2 public IPv4 (`https://api.ipify.org`) unless
`server_public_ip` is pinned via `--extra-vars`. The value is templated into
`/opt/devshop/.env` as `SERVER_IP`; CORS origins are derived from it by
`docker-compose.yml`. No IP is hard-coded in React/Java/Docker sources.

### Persistence
The compose file uses `restart: unless-stopped` and a named volume
(`devshop-postgres-data`). Redeploys/reboots never destroy PostgreSQL data; the
playbook never runs `docker compose down -v`.

---

## Configuration references

- `ansible/inventory/group_vars/all/main.yml` — repo URL/branch, deployment dir
  (default `/opt/devshop`), SSH user/key, timezone, common packages.
- `ansible/roles/devshop/defaults/main.yml` — `server_public_ip` (empty =
  auto-detect), IP-detection endpoints.
- `ansible/roles/devshop/vars/main.yml` — health-check poll settings.

---

## Security considerations

- SSH key is never committed; supplied via inventory var or `--private-key`.
- No AWS keys, DB password, JWT secret, or admin password in any file — only in
  the encrypted vault.
- `.env` on the server is written with `no_log: true` and `chmod 600`.
- The Terraform security group remains the authoritative network boundary; Ansible
  does not enable UFW blindly (could lock out SSH) and does not open ports.
- Host-key checking is disabled for this learning environment (see tradeoff in
  `ansible.cfg`); production should pin host keys.

## Cost considerations

Reuses the single `t3.small` (configurable) Free Tier–conscious stack from Phase
4. No additional AWS resources are introduced by Ansible.

## Known limitations

- **Real deploy/reboot/idempotency tests must be run against an EC2 with your
  credentials** (this project has no SSH access to AWS); the playbooks are
  validated statically and are designed to be idempotent.
- The EC2 public IPv4 can change on stop/start (no Elastic IP); re-run
  `./scripts/deploy.sh --deploy-only` after such a change and only the runtime
  `.env`/CORS need updating.
