# DevShop - SonarQube (code quality analysis)

The Jenkins pipeline runs a **SonarQube Analysis** stage for code quality
checking. This folder contains everything needed to self-host a SonarQube
server with Docker and connect the CI pipeline to it.

SonarQube is free for community use and runs fine on the same EC2 as Jenkins.
It keeps an embedded H2 database, so no extra runtime is needed.

## Run the server (managed Docker Compose)

```bash
cd jenkins/sonarqube
docker compose up -d
```

- UI: `http://<jenkins-host>:9000`
- First logon: `admin` / `admin` (you are forced to set a new password).
- Persisted data: named volumes (`sonarqube_data`, `_extensions`, `_logs`).
- Allow port `9000` in the EC2 security group if Jenkins is remote.

> SonarQube is a **mandatory** gate: the pipeline fails fast at the
> analysis stage if `SONAR_HOST_URL` is unset. It will NOT be skipped. Set
> the server up before running the pipeline (the instructions below).

## Prepare the pipeline credentials

1. **Generate a token** in SonarQube: *My Account → Security → Tokens*
   (scope: `Global analysis` / `Manage system admin` is not required — a
   plain analysis token on the analysing project is enough).
2. In **Jenkins → Manage Jenkins → Credentials**, add the token as a
   **Secret text** credential with ID exactly: **`sonarqube-token`**.
3. In **Manage Jenkins → System → Global properties → Environment
   variables**, set:
   - `SONAR_HOST_URL=http://<jenkins-host>:9000`

## What the stage does

1. **Backend** (Java 21 / Maven): runs
   `mvn -Pdevsecops verify sonar:sonar` with `application/backend/sonar-project.properties`
   → SonarQube project **`devshop-backend`**.
2. **Frontends** (React / TypeScript): runs the `sonarsource/sonar-scanner-cli`
   container against the repo root using `sonar-project.properties` → SonarQube
   project **`devshop-frontends`**.

Both runs set `sonar.qualitygate.wait=true`, so the build **fails when the
server-side Quality Gate is red**. Create/adjust the Quality Gate on the
server (e.g. *Quality Gates → Built-in*) if you want custom rules.

## Local (non-CI) runs

```bash
# Backend — needs target/classes (i.e. a prior build in application/backend)
cd application/backend
mvn -Pdevsecops verify sonar:sonar -Dsonar.host.url=http://<host>:9000 -Dsonar.token=<token>

# Frontends — from the repo root
cd /path/to/devshop
docker run --rm \
  -e SONAR_HOST_URL="http://<host>:9000" \
  -e SONAR_TOKEN="<token>" \
  -v "$PWD:/usr/src" \
  sonarsource/sonar-scanner-cli:latest \
  -Dsonar.projectBaseDir=/usr/src
```

## Troubleshooting

- **`Cannot connect to the SonarQube server`** — confirm `SONAR_HOST_URL` is
  reachable from the Jenkins agent (*curl* the URL) and the token is valid.
- **Quality Gate check times out** — raise `sonar.qualitygate.timeout` in the
  `sonar-project.properties` files (default 300 s).
- **Very slow / OOM on small EC2** — SonarQube needs ~2 GB heap. Use at least
  `t3.small`/`t3.medium` if Jenkins + SonarQube share one host, and set the
  `SONAR_SEARCH_JAVAADDITIONALOPTS` already included in the compose file.