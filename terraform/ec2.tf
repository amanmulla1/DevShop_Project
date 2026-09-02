# -----------------------------------------------------------------------------
# DevShop — EC2 host.
#
# This provisioner creates a NEW EC2 instance (Option A in the README). It does
# NOT touch or destroy any previously-manually-deployed server; those resources
# are outside of Terraform's state and are left untouched.
#
# The instance uses its NORMAL public IPv4 address (assign via the public
# subnet's map_public_ip_on_launch + associate_public_ip_address). No Elastic
# IP is used, keeping this within AWS Free Tier / minimal-cost constraints for a
# learning/portfolio project. NOTE: a normal public IPv4 can change on stop/
# start, so only the deployment/environment configuration (SERVER_IP / CORS)
# may need updating when it does — never the application source.
#
# user_data only bootstraps the host (installs/enables Docker) — it contains NO
# application secrets and does NOT clone private repos. Application deployment
# (docker compose) remains a separate, manual step for this phase.
# -----------------------------------------------------------------------------

# Latest official Ubuntu 24.04 LTS AMI for the configured region (Canonical).
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

locals {
  ami = var.ami_id != "" ? var.ami_id : data.aws_ami.ubuntu.id
}

resource "aws_instance" "devshop" {
  ami                         = local.ami
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.devshop.id]
  key_name                    = var.key_pair_name
  iam_instance_profile        = aws_iam_instance_profile.devshop.name
  associate_public_ip_address = true
  monitoring                  = var.enable_detailed_monitoring

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_size_gb
    tags = {
      Name = "${var.project_name}-root"
    }
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    project_name = var.project_name
  })

  # Do not force a replacement of this instance for cosmetic/tag-only changes
  # or when the Ubuntu AMI's build date refreshes. This avoids needless and
  # potentially destructive recreation of a working server.
  lifecycle {
    create_before_destroy = false
    ignore_changes        = [ami]
  }

  tags = {
    Name = "${var.project_name}-ec2"
  }
}
