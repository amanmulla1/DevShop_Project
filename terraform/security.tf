# -----------------------------------------------------------------------------
# DevShop — security group for the EC2 host.
#
# Ports / exposure decisions (documented):
#   - 22   SSH:      restricted to var.admin_cidr (your public IP). Never 0.0.0.0/0.
#   - 5173 customer: public by default  -> the storefront is the public web face.
#   - 5174 admin:    public by default  -> the dashboard is the public web face.
#   - 8080 backend:  public by default  -> kept open for parity with the prior
#                    manual deployment, but the /api reverse proxy through Nginx
#                    is the intended access path; restrict via
#                    backend_ingress_cidrs when possible.
#   - 5432 postgres: NOT opened by default. PostgreSQL lives inside the EC2
#                    Docker network and must stay off the public internet.
#
# Egress: all outbound allowed (required for Docker pulls, apt updates, etc.).
# -----------------------------------------------------------------------------

resource "aws_security_group" "devshop" {
  name        = "${var.project_name}-sg"
  description = "Security group for the DevShop EC2 host (frontends + backend + PostgreSQL containers)."
  vpc_id      = aws_vpc.devshop.id

  tags = {
    Name = "${var.project_name}-sg"
  }
}

# --- Egress: allow all outbound -------------------------------------------
resource "aws_security_group_rule" "egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.devshop.id
}

# --- Ingress: SSH (admin only) ---------------------------------------------
resource "aws_security_group_rule" "ssh" {
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = [var.admin_cidr]
  security_group_id = aws_security_group.devshop.id
}

# --- Ingress: customer storefront (5173) -----------------------------------
resource "aws_security_group_rule" "customer_5173" {
  count             = length(var.customer_ingress_cidrs)
  type              = "ingress"
  from_port         = 5173
  to_port           = 5173
  protocol          = "tcp"
  cidr_blocks       = [var.customer_ingress_cidrs[count.index]]
  security_group_id = aws_security_group.devshop.id
}

# --- Ingress: admin dashboard (5174) ---------------------------------------
resource "aws_security_group_rule" "admin_5174" {
  count             = length(var.admin_ingress_cidrs)
  type              = "ingress"
  from_port         = 5174
  to_port           = 5174
  protocol          = "tcp"
  cidr_blocks       = [var.admin_ingress_cidrs[count.index]]
  security_group_id = aws_security_group.devshop.id
}

# --- Ingress: backend /api (8080, optional direct access) ------------------
resource "aws_security_group_rule" "backend_8080" {
  count             = length(var.backend_ingress_cidrs)
  type              = "ingress"
  from_port         = 8080
  to_port           = 8080
  protocol          = "tcp"
  cidr_blocks       = [var.backend_ingress_cidrs[count.index]]
  security_group_id = aws_security_group.devshop.id
}

# --- Ingress: PostgreSQL (5432, off by default) ----------------------------
resource "aws_security_group_rule" "postgres_5432" {
  count             = length(var.postgres_ingress_cidrs)
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = [var.postgres_ingress_cidrs[count.index]]
  security_group_id = aws_security_group.devshop.id
}
