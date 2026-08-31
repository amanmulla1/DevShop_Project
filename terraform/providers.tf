# -----------------------------------------------------------------------------
# AWS provider — region is configurable via the aws_region variable.
# Authentication is NOT configured here: Terraform uses the standard AWS
# credential chain (environment variables, ~/.aws/credentials, instance role).
# Never hard-code access keys / secret keys in this repository.
# -----------------------------------------------------------------------------

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "DevShop"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
