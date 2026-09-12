# -----------------------------------------------------------------------------
# DevShop - EC2 nodes.
#
# Two node kinds are created from the same base:
#   control_plane - runs kubeadm control-plane components (etcd, apiserver,
#                   scheduler, controller-manager) plus Argo CD.
#   worker        - runs the application (frontends, backend, PostgreSQL) and
#                   the monitoring stack. Worker[0] is the app node, workers
#                   [1..] are monitoring / extra capacity.
#
# All nodes use their NORMAL public IPv4 (no Elastic IP) so costs stay within
# the AWS Free Tier. A normal public IPv4 can change on stop/start - the deploy
# scripts regenerate the Ansible inventory automatically, so nothing is
# hard-coded.
#
# user_data only installs Docker (used by the docker-compose path and as a
# containerd source for kubeadm nodes). No secrets, no private repo clones.
# -----------------------------------------------------------------------------

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

resource "aws_instance" "control_plane" {
  count                       = var.control_plane_count
  ami                         = local.ami
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.devshop.id]
  key_name                    = var.key_pair_name
  iam_instance_profile        = aws_iam_instance_profile.devshop.name
  associate_public_ip_address = true
  monitoring                  = var.enable_detailed_monitoring
  private_dns_name_options {
    enable_resource_name_dns_a_record = true
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_size_gb
    tags = {
      Name = "${var.project_name}-${count.index == 0 ? "control-plane" : "control-plane-${count.index}"}-root"
    }
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    project_name = var.project_name
  })

  # Keep a working node when tags or the AMI refresh; don't force replacement.
  lifecycle {
    create_before_destroy = false
    ignore_changes        = [ami]
  }

  tags = {
    Name         = "${var.project_name}-control-plane"
    devshop-role = "control-plane"
  }
}

resource "aws_instance" "worker" {
  count                       = var.worker_count
  ami                         = local.ami
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.devshop.id]
  key_name                    = var.key_pair_name
  iam_instance_profile        = aws_iam_instance_profile.devshop.name
  associate_public_ip_address = true
  monitoring                  = var.enable_detailed_monitoring
  private_dns_name_options {
    enable_resource_name_dns_a_record = true
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_size_gb
    tags = {
      Name = "${var.project_name}-worker-${count.index}-root"
    }
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    project_name = var.project_name
  })

  lifecycle {
    create_before_destroy = false
    ignore_changes        = [ami]
  }

  tags = {
    Name         = "${var.project_name}-worker-${count.index}"
    devshop-role = "worker"
  }
}