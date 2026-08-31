// =============================================================================
// DevShop - Jenkins Declarative Pipeline (Phase 5: CI/CD)
//
// Flow: GitHub -> Checkout -> tests -> build -> Docker images -> Docker Hub
//       -> deploy to EC2 (Docker Compose) -> health checks
//
// Credential IDs referenced (create these in Jenkins Credentials; see
// jenkins/README.md):
//   * github-token           - (Optional) GitHub personal access token used for
//                              SCM checkout if the repo is/becomes private.
//   * dockerhub-credentials  - Docker Hub username + ACCESS TOKEN (not password).
//   * devshop-ec2-ssh        - SSH private key used to deploy to the EC2 host.
//
// Configurable values (set in Jenkins, NOT hard-coded in app source):
//   * REGISTRY               - Docker Hub namespace (build parameter, default shown).
//   * EC2_HOST               - Public IP / DNS of the EC2 target, set as a Jenkins
//                              global environment variable (no hard-coded IP here).
//   * EC2_USER               - SSH user for the EC2 host (defaults to ubuntu).
//   * DEVSHOP_APP_DIR        - Repository directory on the EC2 host (default /opt/devshop).
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
        EC2_HOST   = "${env.EC2_HOST ?: 'CHANGE_ME'}"  // provided by Jenkins global env
        EC2_USER   = "${env.EC2_USER ?: 'ubuntu'}"
        APP_DIR    = "${env.DEVSHOP_APP_DIR ?: '/opt/devshop'}"
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

        // ---- 8. Deploy to EC2 (Docker Compose) -------------------------------
        stage('Deploy to EC2') {
            when { expression { params.BRANCH == 'main' } }
            steps {
                sshagent(['devshop-ec2-ssh']) {
                    sh '''
                        set -e
                        ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
                            ${EC2_USER}@${EC2_HOST} \
                            'DEVSHOP_APP_DIR=${APP_DIR} bash ${APP_DIR}/scripts/ci-deploy.sh ${REGISTRY} ${IMAGE_TAG}'
                    '''
                }
            }
        }

        // ---- 9. Health check --------------------------------------------------
        stage('Health Check') {
            when { expression { params.BRANCH == 'main' } }
            steps {
                sshagent(['devshop-ec2-ssh']) {
                    sh '''
                        set -e
                        ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
                            ${EC2_USER}@${EC2_HOST} \
                            'DEVSHOP_APP_DIR=${APP_DIR} bash ${APP_DIR}/scripts/ci-health-check.sh'
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
            echo "Deployment:    EC2 (${EC2_HOST}) via Docker Compose"
            echo '--------------------------------------------------------------'
        }
        success {
            echo 'PIPELINE SUCCEEDED: tests, builds, images, push, deploy and ' +
                 'health checks all passed.'
        }
        failure {
            echo 'PIPELINE FAILED. See console above. Roll back if needed with:'
            echo "  ssh ${EC2_USER}@${EC2_HOST} " +
                 "'scripts/ci-rollback.sh ${REGISTRY} <PREVIOUS_TAG>'"
            currentBuild.result = 'FAILURE'
        }
    }
}
