# -----------------------------------------------------------------------------
# DevShop — Terraform input variables.
# -----------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region where the DevShop infrastructure is provisioned."
  type        = string
  default     = "ap-south-1"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "aws_region must be in the form 'xx-xxxx-N', e.g. ap-south-1."
  }
}

variable "project_name" {
  description = "Short project name used in resource naming and tags."
  type        = string
  default     = "devshop"

  validation {
    condition     = can(regex("^[a-z0-9-]{1,24}$", var.project_name))
    error_message = "project_name must be lowercase alphanumerics and hyphens, max 24 chars."
  }
}

variable "environment" {
  description = "Deployment environment tag (dev/staging/prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of dev, staging, prod."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the DevShop VPC."
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid CIDR block, e.g. 10.0.0.0/16."
  }
}

variable "public_subnet_cidr" {
  description = "CIDR block for the single public subnet that hosts the EC2 instance."
  type        = string
  default     = "10.0.1.0/24"

  validation {
    condition     = can(cidrhost(var.public_subnet_cidr, 0))
    error_message = "public_subnet_cidr must be a valid CIDR block, e.g. 10.0.1.0/24."
  }
}

variable "availability_zone" {
  description = "Availability zone for the public subnet and EC2 instance."
  type        = string
  default     = "ap-south-1a"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+[a-z]$", var.availability_zone))
    error_message = "availability_zone must be in the form 'xx-xxxx-Nx', e.g. ap-south-1a."
  }
}

variable "instance_type" {
  description = "EC2 instance type for the DevShop host. Configurable so you can keep costs low."
  type        = string
  default     = "t3.small"

  validation {
    condition     = can(regex("^[a-z][0-9][a-z]?(\\.[a-z0-9]+)?$", var.instance_type))
    error_message = "instance_type must be a valid EC2 type, e.g. t3.small."
  }
}

variable "root_volume_size_gb" {
  description = "Size (GiB) of the EC2 root EBS volume."
  type        = number
  default     = 20

  validation {
    condition     = var.root_volume_size_gb >= 8 && var.root_volume_size_gb <= 1000
    error_message = "root_volume_size_gb must be between 8 and 1000 GiB."
  }
}

variable "key_pair_name" {
  description = "Name of an AWS key pair that ALREADY exists in the target region. Terraform never creates or uploads your private key (.pem)."
  type        = string

  validation {
    condition     = can(regex("^[\\w+=,.@-]{1,255}$", var.key_pair_name))
    error_message = "key_pair_name must be a valid AWS key pair name."
  }
}

variable "ami_id" {
  description = "Optional explicit AMI id. If left empty, the latest Ubuntu 24.04 LTS AMI for the configured region is selected automatically via a data source."
  type        = string
  default     = ""

  validation {
    condition     = var.ami_id == "" || can(regex("^ami-[0-9a-f]{8,17}$", var.ami_id))
    error_message = "ami_id must be empty or a valid AMI id, e.g. ami-0abc1234def567890."
  }
}

variable "admin_cidr" {
  description = "CIDR (typically YOUR_PUBLIC_IP/32) allowed to SSH into the EC2 instance. Hardening: never use 0.0.0.0/0 here."
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_cidr, 0))
    error_message = "admin_cidr must be a valid CIDR block, e.g. 203.0.113.5/32."
  }
}

variable "customer_ingress_cidrs" {
  description = "List of CIDRs allowed to reach the customer storefront (port 5173). Defaults to the public internet; restrict if desired."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "admin_ingress_cidrs" {
  description = "List of CIDRs allowed to reach the admin dashboard (port 5174). Defaults to the public internet; restrict if desired."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "backend_ingress_cidrs" {
  description = "List of CIDRs allowed to reach the Spring Boot backend directly (port 8080). Prefer reaching it via the Nginx /api proxy. Defaults to public for parity with prior manual deployment; strongly consider restricting to the admin CIDR."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "postgres_ingress_cidrs" {
  description = "List of CIDRs allowed to reach PostgreSQL directly (port 5432). This is NOT opened by default — PostgreSQL lives inside the Docker network on the EC2 host. Set to your admin CIDR only if you specifically need to connect from your machine."
  type        = list(string)
  default     = []
}

variable "enable_detailed_monitoring" {
  description = "Enable EC2 detailed (1-minute) CloudWatch monitoring. Costs extra; leave false to keep cost low."
  type        = bool
  default     = false
}
