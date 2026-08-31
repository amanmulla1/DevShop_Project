# -----------------------------------------------------------------------------
# DevShop — Phase 4 : Terraform / AWS Infrastructure
# Required Terraform + provider versions.
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # -------------------------------------------------------------------------
  # LOCAL STATE (initial Phase 4 implementation).
  #
  # This config intentionally uses the default local state backend so the first
  # working version is simple and has no external dependencies.
  #
  # For team/automated usage you should migrate to a remote backend with
  # locking. See terraform/README.md ("Remote state") for the recommended
  # S3 + DynamoDB-lock configuration. Enable it like this when you are ready:
  #
  #   backend "s3" {
  #     bucket         = "devshop-terraform-state"
  #     key            = "devshop/terraform.tfstate"
  #     region         = "ap-south-1"
  #     encrypt        = true
  #     dynamodb_table = "devshop-tf-locks"
  #   }
  #
  # DO NOT uncomment the above until the S3 bucket and DynamoDB table exist.
  # -------------------------------------------------------------------------
}
