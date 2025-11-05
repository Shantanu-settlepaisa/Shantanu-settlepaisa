# Terraform Backend Setup
# This file creates the S3 bucket and DynamoDB table for storing Terraform state
# Run this ONCE before initializing your main Terraform configuration
#
# Usage:
#   terraform init
#   terraform apply
#
# After creation, configure your main Terraform to use this backend

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"

  default_tags {
    tags = {
      Project     = "SettlePaisa"
      ManagedBy   = "Terraform"
      Environment = "shared"
    }
  }
}

# S3 Bucket for Terraform State Storage
resource "aws_s3_bucket" "terraform_state" {
  bucket = "settlepaisa-terraform-state"

  tags = {
    Name        = "Terraform State Storage"
    Description = "Stores Terraform state files for all environments"
  }

  lifecycle {
    prevent_destroy = true  # Critical: Never accidentally delete state!
  }
}

# Enable versioning for state file rollback capability
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enable encryption at rest
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access (security best practice)
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle policy to manage old state versions
resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "delete-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90  # Keep old versions for 90 days
    }
  }
}

# DynamoDB Table for State Locking
# Prevents multiple users from modifying state simultaneously
resource "aws_dynamodb_table" "terraform_lock" {
  name         = "settlepaisa-terraform-lock"
  billing_mode = "PAY_PER_REQUEST"  # Cost-effective for low usage
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name        = "Terraform State Lock"
    Description = "Prevents concurrent Terraform operations"
  }

  lifecycle {
    prevent_destroy = true  # Critical: Never accidentally delete lock table!
  }
}

# Outputs for reference
output "s3_bucket_name" {
  description = "Name of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.id
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB table for state locking"
  value       = aws_dynamodb_table.terraform_lock.name
}

output "backend_configuration" {
  description = "Copy this configuration to your main Terraform backend.tf"
  value = <<-EOT
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.terraform_state.id}"
        key            = "environments/<environment>/terraform.tfstate"
        region         = "ap-south-1"
        encrypt        = true
        dynamodb_table = "${aws_dynamodb_table.terraform_lock.name}"
      }
    }
  EOT
}
