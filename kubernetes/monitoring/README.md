# DevShop — Observability (Phase 8: Prometheus + Grafana + exporters)

This directory is the **GitOps-managed source of truth** for the DevShop
open-source observability stack. Argo CD runs the whole stack from this
directory via the `monitoring` Application (see
`../argocd/application-monitoring.yaml`). Deploying `./deploy.sh` after Phase 8
provisions the stack automatically and verifies it end to end.

Everything is open source and self-hosted — no CloudWatch dependency, no
paid tools (no Datadog / New Relic / Dynatrace), no logging stack (no
ELK / Loki / OpenSearch) by design.

---

## 1. Scope and design decisions

- **Custom raw Prometheus manifests** (not kube-prometheus-stack / Helm) for
  full control over the DevShop-specific dashboards and explicit resource
  limits tuned to a small single-node EC2 instance.
- **Dedicated `monitoring` namespace.** Argo CD's `monitoring` Application is
  scoped to this namespace only and never touches `devshop`, `argocd`, or
  `ingress-nginx`.
- **Not exposed publicly.** Prometheus, Grafana, and Alertmanager are
  ClusterIP-only. Access is via `kubectl port-forward` on the node. Grafana
  requires authentication.
- **Metrics only** for this phase: Prometheus is the sole telemetry store.
  Logging (Loki/ELK) is explicitly out of scope.

### Components

| Component | Image | Notes |
|-----------|-------|-------|
| Prometheus | `prom/prometheus:v2.54.1` | 15-day retention, PVC-backed, alert+recording rules |
| Grafana | `grafana/grafana:11.1.0` | auth required, auto-provisioned datasource + 7 dashboards, PVC-backed |
| Alertmanager | `prom/alertmanager:v0.27.0` | null receiver (no external pager) |
| node-exporter | `prom/node-exporter:v1.8.2` | DaemonSet (host PID/network) |
| kube-state-metrics | `registry.k8s.io/kube-state-metrics:v2.13.0` | cluster object state |
| postgres-exporter | `prometheuscommunity/postgres-exporter:v0.15.0` | PostgreSQL metrics |

### The two secrets live OUTSIDE Argo CD / Git

- `grafana-admin-secret` — Grafana HTTPS admin credentials.
- `postgres-exporter-secret` — the PostgreSQL DSN (contains the DB password).

These are rendered by the Ansible bootstrap (from the git-ignored
`.devshop/secrets.yml` store) directly into the cluster before Argo CD syncs,
and they are **not** part of the Kustomize output. This mirrors the existing
`devshop-secret` pattern: Git remains the source of truth for non-secret
config, `admin/admin` is never used, and the rendered `secret.yaml` files are
git-ignored (`kubernetes/monitoring/{grafana,postgres-exporter}/secret.yaml`).

Argo CD therefore never manages or prunes these Secrets — it only manages the
authoritative resources committed here.

---

## 2. Scrape targets (in `prometheus/configmap-prometheus.yaml`)

All targets use **Kubernetes service discovery** (no hard-coded pod IPs), so
they survive image tag rollouts and pod restarts. Discovery is authentication
to the Kubernetes API / kubelet proxy via service account bearer token.

| job | metrics path | role | source |
|-----|--------------|------|--------|
| `devshop-backend` | `/actuator/prometheus` | endpoints | DevShop Micrometer (same namespace) |
| `kubernetes-apiserver` | `/metrics` | endpoints | kube-apiserver |
| `kubernetes-kubelet` | `/metrics` | node | kubelet proxy |
| `kubernetes-cadvisor` | `/metrics/cadvisor` | node | cAdvisor via kubelet proxy |
| `kube-state-metrics` | `/metrics` | endpoints | kube-state-metrics |
| `node-exporter` | `/metrics` | node (port 9100) | host metrics |
| `postgres-exporter` | `/metrics` | endpoints | PostgreSQL |

The DevShop backend already exposes Micrometer metrics at
`/actuator/prometheus` (metric names `http_server_requests_seconds_*`,
`jvm_*`, `hikaricp_*`, `process_*`, …), so no backend change is required for
Phase 8.

---

## 3. Storage, retention, and resources

- Prometheus data: PVC `prometheus-data` (10 GiB, local-path), retention
  `--storage.tsdb.retention.time=15d`.
- Grafana: PVC `grafana-data` (2 GiB) for dashboards/state; dashboards and
  datasource are also provisioned declaratively from ConfigMaps.
- Resources are explicitly limited to fit a small EC2 node
  (`requests`/`limits` on every Deployment/containers — see each manifest),
  e.g. Prometheus ~500m/1Gi, Grafana ~300m/512Mi. This keeps the single node
  from being overloaded by the observability stack itself.

---

## 4. Grafana provisioning (no manual steps)

Everything is wired at boot via Grafana provisioning configs:

- `configmap-datasource.yaml` — the Prometheus datasource (uid `prometheus`)
  pointing at `http://prometheus.monitoring:9090`, **auto-provisioned**.
- `configmap-dashboard-provider.yaml` — file providers that load the 7
  dashboards into folders. **No manual import.**
- `configmap-dashboards.yaml` — assembled ConfigMap containing all 7
  dashboards (generated from `grafana/dashboards/*.json`).
- `configmap-grafana.yaml` — `grafana.ini` (auth required, anonymous disabled;
  admin from the Secret env vars; default home = the Executive Overview).

### The 7 dashboards

| Dashboard (folder) | Audience | What it answers | Healthy state | Failure indicators | Drill from |
|---|---|---|---|---|---|
| **Executive Overview** (`DevShop/Overview`) | Ops / team leads | Is the whole app healthy? | Backend + PostgreSQL UP, nodes Ready, 0 unavailable replicas | Any “down”, red CPU/mem, error % or P95 spikes | KPI panels → the dedicated dashboards below |
| **Kubernetes Cluster Overview** (`DevShop/Kubernetes`) | Platform | Cluster capacity, pod/workload health | Nodes Ready, no Pending/Failed pods | NotReady nodes, unavailable replicas, capacity ceilings | Namespace / table rows → Pod faces |
| **EC2 / Node Infrastructure** (`DevShop/Infrastructure`) | Ops | Host CPU, memory, disk, net I/O | Normal utilisation, disk free | High CPU, low disk, net errors | Node → cAdvisor panel |
| **App / API** (`DevShop/Application`) | Dev / SRE | Traffic, latency, errors, JVM/HikariCP | Low 5xx, healthy pool, normal heap/GC | 5xx spikes, GC pauses, connection pressure | Endpoint panel → backend pod logs |
| **PostgreSQL** (`DevShop/PostgreSQL`) | DBA / Dev | DB up, connections, cache hit, size | UP, cache hit high, connection utilisation low | PostgreSQLDown, high connections, deadlocks, low cache hit | Connection panel → postgres logs |
| **Kubernetes Workloads** (`DevShop/Workloads`) | Dev / SRE | Container CPU/mem/restarts/net per workload | Stable restart count, sane container usage | Restart spikes, OOMKilled, container limits hit | Container panels → resource alerts |
| **CI/CD & Deployment Health** (`DevShop/CI-CD`) | Dev / Release | Deployment availability, image, rollout stability | Available=desired, image matches Git tag | Unavailable replicas, image drift, restart-on-rollout | Rollout panel → Argo CD app view |

Every panel targets the Provisioned datasource by **uid** (`prometheus`), not
by name, so it never breaks if the datasource is renamed.

---

## 5. Recording rules (`prometheus/configmap-rules.yaml` → `recording.yml`)

Recording rules keep dashboards fast and reusable (the same series is used by
dashboards *and* alerts):

| Rule | Group | What it pre-computes |
|------|-------|----------------------|
| `devshop:http_requests:rate5m` | devshop-http | request rate (req/s) by status over 5m |
| `devshop:http_errors_5xx:rate5m` | devshop-http | 5xx error rate over 5m |
| `devshop:http_request_duration_seconds:p50/p95/p99` | devshop-http | latency percentiles from the histogram |
| `node:cluster:cpu_utilization:percent` | kubernetes-utilization | node CPU utilisation % |
| `node:cluster:memory_utilization:percent` | kubernetes-utilization | node memory utilisation % |
| `devshop:postgres:connection_utilization:percent` | devshop-postgres | DB connection utilisation % |
| `devshop:postgres:cache_hit_ratio:percent` | devshop-postgres | DB cache-hit ratio % |

---

## 6. Alerting rules (`alerts.yml`)

Alerts are evaluated by Prometheus and viewable in the Prometheus **Alerts**
UI, the Grafana **Alerting** UI (when the Prometheus data source is selected),
and as red thresholds on the dashboards. **Alertmanager** is included with a
`null` receiver — no external pager is configured, by design. To add real
routing, extend `alertmanager/configmap-alertmanager.yaml`.

### Infrastructure (node-exporter)

| Alert | Condition | For | Severity | Meaning | Action |
|-------|-----------|-----|----------|---------|--------|
| `NodeDown` | `up{job="node-exporter"} == 0` | 5m | critical | node-exporter / node unreachable | SSH, instance state, exporter pod |
| `HighNodeCPU` | `node:cluster:cpu_utilization:percent > 95` | 15m | warning | sustained CPU pressure on the single node | noisy neighbours, scale/HPA, pod limits |
| `LowDiskSpace` | root fs free `< 15%` | 15m | critical | root volume nearly full | purge images/logs, expand volume, shorten retention |

### Kubernetes (kube-state-metrics / cAdvisor)

| Alert | Condition | For | Severity | Meaning | Action |
|-------|-----------|-----|----------|---------|--------|
| `NodeNotReady` | `kube_node_status_condition{condition="Ready",status="true"} == 0` | 10m | critical | cluster node not Ready | kubelet/containerd health on the node |
| `PodFailed` | `kube_pod_status_phase{phase="Failed"} > 0` | 10m | critical | a pod is in Failed phase | describe pod, logs, init containers |
| `DeploymentUnavailable` | available `<` desired (desired>0) | 5m | critical | desired replicas not available | rollout status/pod logs; roll back image tag |
| `KubePodCrashLooping` | `increase(...restarts[10m]) > 3` | 10m | warning | container crash-looping | logs `--previous`, OOM/exceptions |
| `OOMKilled` | last terminated reason = OOMKilled | 0m | warning | container OOM-killed | raise memory limits/requests, investigate leak |

### Application (DevShop Micrometer)

| Alert | Condition | For | Severity | Meaning | Action |
|-------|-----------|-----|----------|---------|--------|
| `DevShopBackendDown` | `up{job="devshop-backend"} == 0` | 5m | critical | backend cannot be scraped | backend pod/readiness, `/actuator/prometheus` |
| `DevShopHighErrorRate` | `sum(devshop:http_errors_5xx:rate5m) > 0.5` | 10m | warning | 5xx response rate elevated | backend logs, Application dashboard, failing endpoints |

### PostgreSQL (postgres-exporter)

| Alert | Condition | For | Severity | Meaning | Action |
|-------|-----------|-----|----------|---------|--------|
| `PostgreSQLDown` | `up{job="postgres-exporter"} == 0` | 5m | critical | exporter/DB unreachable | exporter pod + postgres deployment |
| `PostgreSQLHighConnections` | `devshop:postgres:connection_utilization:percent > 85` | 10m | warning | DB connection pressure | HikariCP sizing, leaks, stalled queries |

**Severity policy:** `critical` = service/impact now (node down, backend down,
DB down, replicas unavailable); `warning` = degraded/sustained risk (high CPU,
crash-loop, error rate, connection pressure); `info` — reserved for purely
informational conditions (none triggered today; the label vocabulary already
supports it so rules stay consistent).

---

## 7. GitOps (Argo CD) and CI integration

- **Argo CD** governs everything in this directory via the `monitoring`
  Application: `syncPolicy.automated` with `prune: true`, `selfHeal: true`,
  `PruneLast`, `CreateNamespace=true`. Any drift or manual edit is reverted to
  Git.
- **Ansible** (Phase 8 bootstrap, `ansible/roles/kubernetes/tasks/main.yml`)
  only: creates the `monitoring` namespace, renders + applies the two Secrets
  **outside** Argo CD, registers the `monitoring` Application, waits for
  Synced + Healthy, verifies Prometheus/Grafana are Ready, checks the backend
  `/actuator/prometheus` is producing metrics, and prints the Grafana/Prometheus
  port-forward access in the deploy summary.
- **Jenkins** (Phase 8 stage, root `Jenkinsfile`) runs a read-only
  **“Monitoring Config Validation”** stage on every build: it parses the
  monitoring YAML, validates the dashboard JSON (top-level `panels` +
  `schemaVersion`), and validates the embedded Prometheus rule files (every rule
  has an `expr`, and every alert has a meaningful `critical/warning/info`
  severity). Jenkins does **not** deploy or manage monitoring — Argo CD remains
  the CD authority; the stage only fail-fast on malformed config.

---

## 8. Verification

1. **Argo CD app**: `kubectl -n argocd get application monitoring` →
   `Synced` / `Healthy`.
2. **Deployments**: `kubectl get deploy -n monitoring` → prometheus, grafana,
   alertmanager, kube-state-metrics, postgres-exporter all `1/1 Ready`.
3. **Targets**: `kubectl -n monitoring port-forward svc/prometheus 9090:9090`,
   open `http://localhost:9090/targets` → the 7 targets are `UP`.
4. **Rules**: `http://localhost:9090/rules` → recording + alert groups present.
5. **Grafana**: `kubectl -n monitoring port-forward svc/grafana 3000:3000`,
   open `http://localhost:3000`, log in with the Grafana admin credentials
   (from `.devshop/secrets.yml`), confirm the Prometheus datasource is green and
   the 7 dashboards exist under their folders with live data.
6. **Backend metrics**: `kubectl -n monitoring port-forward svc/prometheus
   9090:9090`, query `up{job="devshop-backend"}` → `1`.

## 9. Failure / recovery (Git-based)

- **Bad manifest / rule commit**: revert in Git; Argo CD `selfHeal` + `prune`
  restores the previous healthy state automatically.
- **Prometheus/Grafana pod broken**: it is managed by its Deployment → Kubernetes
  recreates it; PVCs (`prometheus-data`, `grafana-data`) preserve data/dashboards.
- **Secrets lost / rotated**: re-run `./deploy.sh` (reuses `.devshop/secrets.yml`
  if present, so credentials stay stable); Ansible re-applies the two Secrets
  outside Argo CD.
- **Full monitoring removal**: `kubectl -n argocd delete application monitoring`
  (cleanup), or simply stop Argo CD from syncing the path.

## 10. Remaining limitations

- **Run-verified on a live cluster only**: the manifests are statically valid,
  but targets UP / datasource connected / dashboards showing live data / alert
  firing / self-heal-rollback require `./deploy.sh` against a real EC2 env.
- **Single node / single replica**: no HA for Prometheus/Grafana or the
  exporters; acceptable for the small dev/shop footprint.
- **kubelet / cAdvisor bearer scrape** and the exact metric names can only be
  confirmed on the real cluster (config is validated, not executed here).
- **No external alert routing** (Alertmanager `null` receiver) and **no logging
  stack** — both are deliberate scope decisions for this phase.
