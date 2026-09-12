# -----------------------------------------------------------------------------
# DevShop - Terraform outputs.
#
# Public IPv4s are the normal EC2 addresses (no Elastic IP, Free Tier). They
# can change on stop/start; the deploy scripts re-read these and regenerate the
# Ansible inventory, so nothing is hard-coded.
# -----------------------------------------------------------------------------

output "vpc_id" {
  description = "ID of the DevShop VPC."
  value       = aws_vpc.devshop.id
}

output "subnet_id" {
  description = "ID of the public subnet hosting the EC2 nodes."
  value       = aws_subnet.public.id
}

output "security_group_id" {
  description = "ID of the DevShop node security group."
  value       = aws_security_group.devshop.id
}

output "control_plane_ids" {
  description = "IDs of the Kubernetes control-plane instances."
  value       = aws_instance.control_plane[*].id
}

output "control_plane_private_ips" {
  description = "Private IPv4 addresses of the control-plane nodes (used for the kubeadm join endpoint)."
  value       = aws_instance.control_plane[*].private_ip
}

output "control_plane_public_ips" {
  description = "Public IPv4s of the control-plane nodes."
  value       = aws_instance.control_plane[*].public_ip
}

output "worker_ids" {
  description = "IDs of the worker instances."
  value       = aws_instance.worker[*].id
}

output "worker_private_ips" {
  description = "Private IPv4 addresses of the worker nodes."
  value       = aws_instance.worker[*].private_ip
}

output "worker_public_ips" {
  description = "Public IPv4s of the worker nodes."
  value       = aws_instance.worker[*].public_ip
}

# Backwards-compatible aliases (first control-plane node) so one-liners like
#   terraform output -raw instance_public_ip
# keep working.
output "instance_id" {
  value = aws_instance.control_plane[0].id
}

output "instance_public_ip" {
  value = aws_instance.control_plane[0].public_ip
}

output "instance_private_ip" {
  value = aws_instance.control_plane[0].private_ip
}

output "iam_role_name" {
  description = "Name of the shared EC2 instance role (no AWS API policies attached)."
  value       = aws_iam_role.devshop_ec2.name
}

output "ssh_command" {
  description = "Ready-to-run SSH command for the first control-plane node (requires your key pair)."
  value       = "ssh -i /path/to/${var.key_pair_name}.pem ubuntu@${aws_instance.control_plane[0].public_ip}"
}