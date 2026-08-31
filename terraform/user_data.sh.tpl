#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# DevShop EC2 host bootstrap (executed once on first launch).
#
# Installs and starts Docker Engine + Docker Compose v2 plugin.
# NO application secrets here. No private repo cloning. Application deployment
# (docker compose) is a separate manual step — see terraform/README.md.
# -----------------------------------------------------------------------------
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg

# Register Docker's official apt repository.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y --no-install-recommends \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

# Let the default 'ubuntu' user run Docker without sudo.
usermod -aG docker ubuntu || true

systemctl enable --now docker

echo "DevShop host bootstrap complete (${project_name})."
docker --version
docker compose version
exit 0
