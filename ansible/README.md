# DevShop — Phase 7+8: Ansible (EC2 + Kubernetes + Argo CD + Observability bootstrap)

> **Recommended entry point is the root ONE-COMMAND orchestration** — `./deploy.sh`
> (see the root `README.md`). It chains Terraform → Ansible → Kubernetes → Argo CD
> → **monitoring** → health checks → final URLs. This page documents the Ansible layer.

Ansible configures the Terraform-provisioned EC2 host, installs **standard
Kubernetes** (containerd/kubeadm/kubelet/kubectl/Calico/Metrics), installs
**Argo CD**, applies the DevShop Secret/ConfigMap, waits for Argo CD to sync
the DevShop application, and (Phase 8) bootstraps the **observability stack**
(Prometheus + Grafana + exporters) via Argo CD.

```
./deploy.sh
  1. prerequisite checks
  2. generate persistent secrets   (once; reused, never printed/committed)
  3. Terraform init/validate/apply         → AWS infrastructure
  4. terraform output -raw instance_public_ip
  5. generate Ansible inventory     (automatic — nothing copied by hand)
  6. ansible-playbook site.yml
       (common -> kubernetes)
       ├─ common     : base packages + timezone
       └─ kubernetes : install standard K8s + Argo CD,
                       apply devshop-secret (outside Argo CD),
                       patch ingress/CORS to detected IP,
                       wait for Argo CD Synced+Healthy, health checks, URLs,
                       Phase 8: apply monitoring secrets (outside Argo CD),
                       register the monitoring Argo CD Application,
                       wait Prometheus/Grafana Healthy, verify targets
```

> **Scope:** Ansible configures the host and bootstraps Kubernetes + Argo CD.
> It does **not** provision AWS infrastructure (that stays with Terraform) and it
> is **not** the permanent CD engine — **Argo CD** drives the application
> deployment (GitHub → Argo CD → Kubernetes). Jenkins remains CI (Phase 5).

---

## Prerequisites

- Linux shell / **WSL** with `terraform` and `ansible` installed, and an SSH
  private key (`*.pem`) for the EC2 `ubuntu` user.
- AWS credentials configured and `terraform/terraform.tfvars` set (key pair name,
  admin CIDR). Ansible itself needs only the **public IP** of the instance —
  the root `./deploy.sh` generates the inventory automatically from
  `terraform output`.

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

`./deploy.sh` also writes `inventory/hosts.ini` automatically (step 5). The
committed `inventory/hosts.ini.example` documents the expected format.
Connection defaults live in `inventory/group_vars/all/main.yml`.

---

## Secrets — how they are supplied

The root `./deploy.sh` generates strong secrets **once** into a git-ignored
`.devshop/secrets.yml` (mode 0600) on the control node and passes them to Ansible
with `--extra-vars @<file>` — nothing appears on the command line. The secrets
are also persisted on the EC2 host at `/etc/devshop/state/` (0600) for reuse
across reruns. They are never printed or committed.

> An alternative (optional) encrypted-vault path is still supported: see
> `inventory/group_vars/all/vault.yml.example`. If you set
> `DEVSHOP_VAULT_FILE`, `deploy.sh` uses `--vault-password-file` instead.

---

## Commands (Ansible layer only)

```bash
cd ansible

# Validate
ansible-playbook -i inventory/hosts.ini --syntax-check playbooks/site.yml

# Full bootstrap (K8s + Argo CD + DevShop sync)
./scripts/deploy.sh

# Re-run Kubernetes/Argo CD + sync only (idempotent redeploy after IP/new commit)
./scripts/deploy.sh --deploy-only
```

> Prefer the root `./deploy.sh` — it does Terraform + inventory + Ansible in one.

---

## What each role does

| Role     | Responsibility |
|----------|----------------|
| `common` | apt update, base packages (curl, git, ca-certificates, ...), timezone |
| `kubernetes` | Detect public IP, clone `main`, install **standard Kubernetes** (containerd/kubeadm/kubelet/kubectl + Calico CNI + Metrics Server), install **Argo CD**, apply `devshop-secret` (outside Argo CD), patch ingress/CORS to detected IP, wait for Argo CD `Synced`+`Healthy`, verify nodes/pods, health-check the app, print URLs. **Phase 8:** apply `grafana-admin-secret` + `postgres-exporter-secret` (outside Argo CD), register the `monitoring` Argo CD Application, wait Prometheus/Grafana Healthy, verify scrape targets + `/actuator/prometheus`, print Grafana/Prometheus port-forward access |
| `docker`, `devshop` | *Optional / legacy* Phase 5 roles retained for Docker Compose deploys — not used by the Phase 7 one-command path |

### Kubernetes bootstrap
Installs upstream software via the existing `kubernetes/scripts/*` installers
(`install-kubernetes.sh`, `install-storage.sh`, `install-ingress.sh`,
`install-argocd.sh`), which are idempotent. Standard Kubernetes only — no
K3s/MicroK8s/Minikube/Kind.

### IP detection & CORS
`kubernetes` auto-detects the EC2 public IPv4 (`api.ipify.org` / `ifconfig.me`)
unless `server_public_ip` is set via `--extra-vars`. It derives
`<IP>.nip.io` customer/admin hosts and explicit CORS origins (no wildcard, no
hard-coded IP). An EC2 stop/start (IP change) needs only a re-run.

### GitOps
Argo CD (namespace `argocd`) watches the DevShop repo
(`kubernetes/overlays/aws`, branch `main`) with auto-sync
(`prune`+`selfHeal`, PruneLast). The Secret is applied **outside** Argo CD so it
is never pruned. After bootstrap, application changes flow GitHub → Argo CD →
Kubernetes.

### Observability bootstrap (Phase 8)
The monitoring stack (Prometheus, Grafana, Alertmanager, node-exporter,
kube-state-metrics, postgres-exporter) is itself **GitOps-managed** by a second
Argo CD Application (`monitoring` → `kubernetes/monitoring`, namespace
`monitoring`). This role only:

1. renders + applies the two monitoring Secrets **outside** Argo CD —
   `grafana-admin-secret` (admin creds) and `postgres-exporter-secret` (the
   PostgreSQL DSN) — from the git-ignored `.devshop/secrets.yml` store;
2. applies `kubernetes/argocd/application-monitoring.yaml` (auto-sync,
   self-heal, prune) so Argo CD deploys the whole stack from Git;
3. waits for the `monitoring` Application `Synced`+`Healthy` and verifies
   Prometheus/Grafana are Ready and the backend `/actuator/prometheus` is
   producing metrics.

Grafana/Prometheus are ClusterIP-only (port-forward access), so the secrets and
the UI never need to be public. See
[`../kubernetes/monitoring/README.md`](../kubernetes/monitoring/README.md).

---

## Configuration references

- `ansible/inventory/group_vars/all/main.yml` — repo URL/branch, SSH user/key,
  timezone, db name/user.
- `ansible/roles/kubernetes/defaults/main.yml` — namespaces, IP-detection
  endpoints, ingress suffix (nip.io), k8s version, CNI pod CIDR, Argo CD
  version, health poll settings, monitoring namespace.
- `ansible/roles/kubernetes/templates/secret.yaml.j2` — the in-cluster Secret.
- `ansible/roles/kubernetes/templates/grafana-admin-secret.j2`,
  `postgres-exporter-secret.j2` — the two monitoring Secrets rendered **outside**
  Argo CD (git-ignored after render).

---

## Security considerations

- SSH key never committed; supplied via `--private-key` or inventory var.
- Secrets generated/persisted with `no_log` + `chmod 600`; never written to
  Git (`.devshop/` is git-ignored), never printed, never on the command line.
  The Grafana admin + postgres-exporter secrets follow the same pattern.
- The Terraform security group is the network boundary; Ansible does not enable
  UFW blindly (could lock out SSH).
- Host-key checking is disabled for this learning environment (see `ansible.cfg`).

## Cost considerations

Reuses the single `t3.small` (configurable) Free Tier–conscious stack from Phase
4 — a single-node kubeadm cluster runs on the same instance; no extra EC2/RDS/LB.

## Known limitations

- **Real deploy/reboot/idempotency tests must be run against an EC2 with your
  credentials** (this project has no SSH access to AWS; validated statically).
- The EC2 public IPv4 can change on stop/start (no Elastic IP); re-run
  `./deploy.sh` after such a change and only the runtime `.env`/CORS/ingress hosts
  need updating.
