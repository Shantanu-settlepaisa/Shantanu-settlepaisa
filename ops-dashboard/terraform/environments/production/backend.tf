# Terraform Backend Configuration for Production Environment
# This configures remote state storage in S3 with DynamoDB locking
#
# Prerequisites:
#   1. Run terraform/backend-setup.tf first to create S3 bucket and DynamoDB table
#   2. Ensure AWS credentials are configured (aws configure or environment variables)

terraform {
  backend "s3" {
    bucket         = "settlepaisa-terraform-state"
    key            = "environments/production/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "settlepaisa-terraform-lock"

    # Optional: Workspace-based state isolation
    # workspace_key_prefix = "workspaces"
  }
}
