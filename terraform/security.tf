# -----------------------------------------------------------------------------
# DevShop - security group for the Kubernetes nodes.
#
# The whole fleet shares one security group. What's opened:
#   - all traffic between nodes in this same SG (Kubernetes control-plane /
#     pod / NodePort traffic) - self-referencing rule, NOT exposed to the world
#   - 22                    SSH, restricted to var.admin_cidr. Never 0.0.0.0/0.
#   - 80/443, 30000-32767   public web -> NGINX Ingress controller NodePort
#   - 5173/5174/8080         docker-compose fallback path on the workers
#   - 5432                  PostgreSQL: NOT opened. Stays inside the cluster.
#
# Egress: all outbound (apt updates, image pulls, etc.).
# -----------------------------------------------------------------------------

resource "aws_security_group" "devshop" {
  name        = "${var.project_name}-sg"
  description = "DevShop Kubernetes nodes (control-plane + workers), NGINX ingress, and the devshop application."
  vpc_id      = aws_vpc.devshop.id

  tags = {
    Name = "${var.project_name}-sg"
  }
}

# --- Egress: allow all outbound ---------------------------------------------
resource "aws_security_group_rule" "egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.devshop.id
}

# --- Cluster-internal: all traffic between the nodes ------------------------
# kubeadm needs etcd (2379/2380), kubelet (10250), apiserver (6443) and the
# whole CNI pod range between nodes. A self-referencing SG rule is the standard
# safe way to allow this without exposing anything to the internet.
resource "aws_security_group_rule" "cluster_internal" {
  type              = "ingress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  self              = true
  security_group_id = aws_security_group.devshop.id
}

# --- Ingress: SSH (admin only) ----------------------------------------------
resource "aws_security_group_rule" "ssh" {
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = [var.admin_cidr]
  security_group_id = aws_security_group.devshop.id
}

# --- Ingress: web (NGINX Ingress via NodePort) ------------------------------
# The NGINX Ingress controller publishes NodePorts in the 30000-32767 range;
# open 80/443 too in case the controller is switched to hostNetwork.
resource "aws_security_group_rule" "web_80_443" {
  type              = "ingress"
  from_port         = 80
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = concat(var.customer_ingress_cidrs, var.admin_ingress_cidrs)
  security_group_id = aws_security_group.devshop.id
}

resource "aws_security_group_rule" "nodeports" {
  type              = "ingress"
  from_port         = 30000
  to_port           = 32767
  protocol          = "tcp"
  cidr_blocks       = concat(var.customer_ingress_cidrs, var.admin_ingress_cidrs)
  security_group_id = aws_security_group.devshop.id
}

# --- Ingress: docker-compose fallback path (5173/5174/8080) -----------------
resource "aws_security_group_rule" "customer_5173" {
  count             = length(var.customer_ingress_cidrs)
  type              = "ingress"
  from_port         = 5173
  to_port           = 5173
  protocol          = "tcp"
  cidr_blocks       = [var.customer_ingress_cidrs[count.index]]
  security_group_id = aws_security_group.devshop.id
}

resource "aws_security_group_rule" "admin_5174" {
  count             = length(var.admin_ingress_cidrs)
  type              = "ingress"
  from_port         = 5174
  to_port           = 5174
  protocol          = "tcp"
  cidr_blocks       = [var.admin_ingress_cidrs[count.index]]
  security_group_id = aws_security_group.devshop.id
}

resource "aws_security_group_rule" "backend_8080" {
  count             = length(var.backend_ingress_cidrs)
  type              = "ingress"
  from_port         = 8080
  to_port           = 8080
  protocol          = "tcp"
  cidr_blocks       = [var.backend_ingress_cidrs[count.index]]
  security_group_id = aws_security_group.devshop.id
}

# --- Ingress: PostgreSQL (5432, off by default) -----------------------------
resource "aws_security_group_rule" "postgres_5432" {
  count             = length(var.postgres_ingress_cidrs)
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = [var.postgres_ingress_cidrs[count.index]]
  security_group_id = aws_security_group.devshop.id
}