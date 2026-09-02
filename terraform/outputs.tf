# -----------------------------------------------------------------------------
# DevShop — Terraform outputs.
# -----------------------------------------------------------------------------

output "vpc_id" {
  description = "ID of the DevShop VPC."
  value       = aws_vpc.devshop.id
}

output "subnet_id" {
  description = "ID of the public subnet hosting the EC2 instance."
  value       = aws_subnet.public.id
}

output "security_group_id" {
  description = "ID of the DevShop EC2 security group."
  value       = aws_security_group.devshop.id
}

output "instance_id" {
  description = "ID of the DevShop EC2 instance."
  value       = aws_instance.devshop.id
}

output "instance_private_ip" {
  description = "Private IP of the DevShop EC2 instance."
  value       = aws_instance.devshop.private_ip
}

output "instance_public_ip" {
  description = "Public IPv4 of the DevShop EC2 instance — the application address (e.g. http://<instance_public_ip>:5173). This is the normal EC2 public IPv4 (Free Tier; no Elastic IP). It can change on instance stop/start, so only deployment/environment config (SERVER_IP / CORS) may need updating — never the application source."
  value       = aws_instance.devshop.public_ip
}

output "iam_role_name" {
  description = "Name of the DevShop EC2 instance role (no AWS API policies attached in this phase)."
  value       = aws_iam_role.devshop_ec2.name
}

output "ssh_command" {
  description = "Ready-to-run SSH command using the instance public IPv4 (requires your key pair)."
  value       = "ssh -i /path/to/${var.key_pair_name}.pem ubuntu@${aws_instance.devshop.public_ip}"
}
