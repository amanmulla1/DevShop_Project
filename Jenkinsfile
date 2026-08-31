// =============================================================================
// DevShop - Jenkins Declarative Pipeline (Phase 5 CI + Phase 6 GitOps CD)
//
// Original Phase 5 flow deployed to EC2 via Docker Compose over SSH.
// Phase 6 transitions deployment to GitOps:
//   GitHub -> checkout -> tests -> build -> Docker images -> Docker Hub
//     -> update the Kubernetes image tag in Git
//       -> Argo CD detects the Git change -> syncs -> Kubernetes rollout
//
// Jenkins does NOT run kubectl apply as the normal deploy path (Phase 6
// requirement). Argo CD performs the actual deployment from Git.
//
// Credential IDs referenced (create these in Jenkins Credentials; see
// jenkins/README.md):
//   * github-token           - GitHub PAT used to push the Kubernetes manifest /
//                              image-tag write-back to the repo (required).
//   * dockerhub-credentials  - Docker Hub username + ACCESS TOKEN (not password).
//   * devshop-ec2-ssh        - No longer used by this pipeline; kept for optional
//                              read-only cluster checks (see README).
//
// Configurable values (set in Jenkins, NOT hard-coded in app source):
//   * REGISTRY               - Docker Hub namespace (build parameter, default shown).
//   * BRANCH                 - Git branch to build/deploy (default main).
//
// GitOps loop prevention (requirement 27): the image-tag write-back commit is
// tagged "[ci skip]" and the pipeline's Skip Guard stage aborts when a commit
// only touches kubernetes/*. Configure the webhook to filter source paths too.
//
// Pipeline is gated to the `main` deployment branch for build/push/deploy; the
// test stages may run on other branches. No secrets are stored in this file.
// =============================================================================

pipeline {
    agent any

    parameters {
        string(name: 'REGISTRY', defaultValue: 'amanmulla1',
               description: 'Docker Hub namespace / owner of the devshop-* images. ' +
                            'Must match the account owning the dockerhub-credentials.')
        string(name: 'BRANCH', defaultValue: 'main',
               description: 'Git branch to build and deploy.')
    }

    environment {
        IMAGE_TAG  = "${BUILD_NUMBER}"                 // immutable, traceable version tag
        LATEST_TAG = 'latest'
        REGISTRY   = "${params.REGISTRY}"
        BRANCH     = "${params.BRANCH}"

        // Image names built/pushed and expected by docker-compose.ci.yml.
        BACKEND_IMAGE       = "${params.REGISTRY}/devshop-backend"
        FRONTEND_IMAGE      = "${params.REGISTRY}/devshop-frontend"
        ADMIN_FRONTEND_IMAGE = "${params.REGISTRY}/devshop-admin-frontend"
    }

    options {
        timestamps()
        disableResume()
        // Keeps completed runs' workspace for inspection; not deleted automatically.
    }

    stages {

        // ---- 0. Skip guard: avoid the GitOps / infinite-loop -----------------
        // This pipeline writes the desired image tag back into Git
        // (kubernetes/overlays/aws/kustomization.yaml) so Argo CD can deploy.
        // That write-back commit must NOT re-trigger this pipeline. We guard two
        // ways:
        //   * the write-back commit message contains "[ci skip]"; and
        //   * if the HEAD commit only changes paths under kubernetes/, we SKIP
        //     the entire build (path-based trigger exclusion).
        // Configure the GitHub webhook to additionally filter to application
        // source paths only (see kubernetes/README.md) for belt and braces.
        stage('Skip Guard (GitOps loop prevention)') {
            when { expression { params.BRANCH == params.BRANCH } } // always run
            steps {
                script {
                    def changed = sh(
                        script: "git diff --name-only HEAD~1 HEAD 2>/dev/null || true",
                        returnStdout: true).tokenize('\n').collect { it.trim() }.findAll { it != '' }
                    def onlyK8s = !changed.isEmpty() && changed.every { it.startsWith('kubernetes/') }
                    if (onlyK8s) {
                        echo "Commit touches only kubernetes/* - this is a GitOps manifest " +
                             "write-back. Skipping CI to prevent an infinite loop."
                        currentBuild.result = 'SUCCESS'
                        error('Skipping build for GitOps-only manifest change.')
                    } else {
                        echo "Proceeding: relevant source changes detected."
                    }
                }
            }
        }

        // ---- 1. Checkout --------------------------------------------------
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    def gitCommit = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    echo "Commit: ${gitCommit}"
                    echo "Build:  #${BUILD_NUMBER}"
                    echo "Branch: ${env.BRANCH}"
                }
            }
        }

        // ---- 1b. Monitoring config validation (Phase 8) ---------------------
        // Statically validates the observability configuration that Argo CD will
        // deploy from Git (kubernetes/monitoring). Jenkins does NOT deploy or
        // manage monitoring: Argo CD remains the CD authority. We only fail-fast
        // on malformed YAML/JSON/rule files so a bad commit never reaches the
        // cluster. Runs on every branch (cheap, read-only).
        stage('Monitoring Config Validation') {
            steps {
                sh '''
                    set -e
                    echo "== Monitoring YAML validation =="
                    python3 - <<'PY'
                    import glob, sys, yaml
                    files = glob.glob('kubernetes/monitoring/**/*.yaml', recursive=True)
                    files += glob.glob('kubernetes/monitoring/**/*.yml', recursive=True)
                    # Secret files are rendered by Ansible on the host, not committed;
                    # ignore them if present in a local workspace.
                    skip = ('grafana/secret.yaml', 'postgres-exporter/secret.yaml')
                    errs = 0
                    for f in sorted(set(files)):
                        if f.endswith(skip):
                            continue
                        try:
                            list(yaml.safe_load_all(open(f)))
                            print('OK   ', f)
                        except Exception as e:
                            errs += 1
                            print('FAIL ', f, '--', e)
                    if errs:
                        sys.exit('ERROR: %d monitoring YAML file(s) invalid' % errs)
                    PY

                    echo "== Grafana dashboard JSON validation =="
                    python3 - <<'PY'
                    import glob, json, sys
                    files = glob.glob('kubernetes/monitoring/grafana/dashboards/*.json')
                    errs = 0
                    for f in sorted(files):
                        try:
                            d = json.load(open(f))
                            assert 'panels' in d, 'missing top-level "panels"'
                            assert d.get('schemaVersion'), 'missing schemaVersion'
                            print('OK   ', f)
                        except Exception as e:
                            errs += 1
                            print('FAIL ', f, '--', e)
                    if errs:
                        sys.exit('ERROR: %d dashboard(s) invalid' % errs)
                    PY

                    echo "== Prometheus rule file validation =="
                    python3 - <<'PY'
                    import yaml, sys
                    path = 'kubernetes/monitoring/prometheus/configmap-rules.yaml'
                    groups = []
                    for doc in yaml.safe_load_all(open(path)):
                        # The ConfigMap embeds one YAML rule file per `data` key
                        # (recording.yml, alerts.yml).
                        for s in doc.get('data', {}).values():
                            inner = yaml.safe_load(s) or {}
                            for g in inner.get('groups', []):
                                for r in g.get('rules', []):
                                    assert r.get('expr'), 'rule missing expr: %s' % r.get('alert')
                                    if r.get('alert'):
                                        sev = r.get('labels', {}).get('severity')
                                        assert sev in ('critical', 'warning', 'info'), \
                                            'severity must be critical/warning/info: %s' % r.get('alert')
                                groups.append(g.get('name'))
                    print('OK   rules groups:', ', '.join(sorted(set(groups))))
                    PY
                '''
            }
        }

        // ---- 2. Backend tests ---------------------------------------------
        stage('Backend Tests') {
            steps {
                dir('application/backend') {
                    sh 'mvn clean test'
                }
            }
        }

        // ---- 3. Customer + Admin frontend tests ----------------------------
        stage('Frontend Tests') {
            parallel {
                stage('Customer Frontend Tests') {
                    steps {
                        dir('application/frontend') {
                            sh 'npm ci'
                            sh 'npm test -- --run'
                        }
                    }
                }
                stage('Admin Frontend Tests') {
                    steps {
                        dir('application/admin-frontend') {
                            sh 'npm ci'
                            sh 'npm test -- --run'
                        }
                    }
                }
            }
        }

        // ---- 4. Backend build ---------------------------------------------
        stage('Backend Build') {
            when { expression { params.BRANCH == 'main' } }
            steps {
                dir('application/backend') {
                    // Tests already executed and passed in the Tests stage.
                    sh 'mvn -DskipTests package'
                }
            }
        }

        // ---- 5. Customer + Admin frontend build -----------------------------
        stage('Frontend Build') {
            when { expression { params.BRANCH == 'main' } }
            parallel {
                stage('Customer Frontend Build') {
                    steps {
                        dir('application/frontend') {
                            sh 'npm run build'
                        }
                    }
                }
                stage('Admin Frontend Build') {
                    steps {
                        dir('application/admin-frontend') {
                            sh 'npm run build'
                        }
                    }
                }
            }
        }

        // ---- 6. Docker build ------------------------------------------------
        stage('Docker Build') {
            when { expression { params.BRANCH == 'main' } }
            steps {
                sh 'docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} -t ${BACKEND_IMAGE}:${LATEST_TAG} application/backend'
                sh 'docker build -t ${FRONTEND_IMAGE}:${IMAGE_TAG} -t ${FRONTEND_IMAGE}:${LATEST_TAG} application/frontend'
                sh 'docker build -t ${ADMIN_FRONTEND_IMAGE}:${IMAGE_TAG} -t ${ADMIN_FRONTEND_IMAGE}:${LATEST_TAG} application/admin-frontend'
            }
        }

        // ---- 7. Docker push (immutable tag + latest) -------------------------
        stage('Docker Push') {
            when { expression { params.BRANCH == 'main' } }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKERHUB_USERNAME',
                    passwordVariable: 'DOCKERHUB_TOKEN'
                )]) {
                    sh 'echo "${DOCKERHUB_TOKEN}" | docker login -u "${DOCKERHUB_USERNAME}" --password-stdin'
                    sh 'docker push ${BACKEND_IMAGE}:${IMAGE_TAG}'
                    sh 'docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}'
                    sh 'docker push ${ADMIN_FRONTEND_IMAGE}:${IMAGE_TAG}'
                    sh 'docker push ${BACKEND_IMAGE}:${LATEST_TAG}'
                    sh 'docker push ${FRONTEND_IMAGE}:${LATEST_TAG}'
                    sh 'docker push ${ADMIN_FRONTEND_IMAGE}:${LATEST_TAG}'
                }
            }
        }

        // ---- 8. Update the Kubernetes desired image tag in Git (GitOps) -------
        // Phase 6: Jenkins does NOT kubectl apply. It publishes the images and
        // then writes the immutable BUILD_NUMBER tag into the Kustomize overlay
        // in Git. Argo CD (Phase 6) detects the Git change, syncs, and rolls out
        // to Kubernetes. Manual kubectl is only for one-off/bootstrap, never the
        // normal deploy path.
        stage('Update Image Tag in Git (GitOps)') {
            when { expression { params.BRANCH == 'main' } }
            steps {
                withCredentials([gitUsernamePassword(
                    credentialsId: 'github-token',
                    usernameVariable: 'GIT_USER',
                    passwordVariable: 'GIT_PASS'
                )]) {
                    sh '''
                        set -e
                        FILE="kubernetes/overlays/aws/kustomization.yaml"
                        # The overlay uses the Kustomize `images` block where `name:` and
                        # `newTag:` are on separate lines. Point each image's newTag at the
                        # immutable build for this pipeline run.
                        for IMG in devshop-backend devshop-frontend devshop-admin-frontend; do
                            awk -v img="amanmulla1/${IMG}" -v tag="${IMAGE_TAG}" '
                                $0 ~ "name: " img "$" { want=1; print; next }
                                want && /newTag:/ { sub(/newTag:.*/, "newTag: " tag); want=0 }
                                { print }
                            ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
                        done

                        git add "$FILE"
                        # "[ci skip]" + the Skip Guard stage + webhook path filter
                        # together prevent the GitOps write-back from re-triggering
                        # this pipeline (no infinite loop).
                        git -c user.name="devshop-ci" -c user.email="ci@devshop.local" \
                            commit -m "deploy(kubernetes): point DevShop images to tag ${IMAGE_TAG} [ci skip]"

                        PUSH_URL="https://${GIT_USER}:${GIT_PASS}@$(echo "${GIT_URL}" | sed -E 's#https?://[^@]*@?##')"
                        git push "${PUSH_URL}" HEAD:${BRANCH}
                        echo "Pushed desired image tag ${IMAGE_TAG} to Git for Argo CD."
                    '''
                }
            }
        }
    }

    post {
        always {
            echo '--------------------------------------------------------------'
            echo "Commit:        ${env.GIT_COMMIT?.take(7)}"
            echo "Build:         #${BUILD_NUMBER}"
            echo "Images:        ${BACKEND_IMAGE}:${IMAGE_TAG} / " +
                 "${FRONTEND_IMAGE}:${IMAGE_TAG} / ${ADMIN_FRONTEND_IMAGE}:${IMAGE_TAG}"
            echo "Deployment:    GitOps -> Argo CD -> Kubernetes (devshop namespace)"
            echo '--------------------------------------------------------------'
        }
        success {
            echo 'PIPELINE SUCCEEDED: tests, builds, images, push, and Git image-tag ' +
                 'update done. Argo CD will now sync Kubernetes from Git.'
        }
        failure {
            echo 'PIPELINE FAILED. See console above.'
            echo 'Roll back by updating the image tag in Git (Git-based rollback):'
            echo '  edit kubernetes/overlays/aws/kustomization.yaml to an older tag, push;'
            echo '  Argo CD syncs / self-heals back to the older image.'
            currentBuild.result = 'FAILURE'
        }
    }
}
