# Variable Definitions for Production Environment
# Actual values are set in terraform.tfvars (gitignored)

# ============================================================================
# General Configuration
# ============================================================================

variable "environment" {
  description = "Environment name (production, staging, development)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
  default     = "settlepaisa"
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-1"
}

# ============================================================================
# Networking Configuration
# ============================================================================

variable "vpc_cidr" {
  description = "CIDR block for VPC (if creating new VPC)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "availability_zones" {
  description = "Availability zones for subnet distribution"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

# ============================================================================
# EC2 Configuration
# ============================================================================

variable "ec2_instance_type" {
  description = "EC2 instance type for application server"
  type        = string
  default     = "t3.medium"
}

variable "ec2_ami_id" {
  description = "AMI ID for EC2 instance (Amazon Linux 2023)"
  type        = string
  default     = ""  # Will use latest Amazon Linux 2023 if not specified
}

variable "ec2_key_name" {
  description = "Name of SSH key pair for EC2 access"
  type        = string
  default     = "settlepaisa-production-key"
}

variable "ec2_root_volume_size" {
  description = "Size of root EBS volume in GB"
  type        = number
  default     = 50
}

variable "enable_elastic_ip" {
  description = "Whether to attach Elastic IP to EC2 instance"
  type        = bool
  default     = true
}

# ============================================================================
# RDS Configuration
# ============================================================================

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.large"
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "17.6"
}

variable "rds_allocated_storage" {
  description = "Initial storage allocation in GB"
  type        = number
  default     = 100
}

variable "rds_max_allocated_storage" {
  description = "Maximum storage for autoscaling in GB"
  type        = number
  default     = 500
}

variable "rds_storage_type" {
  description = "Storage type (gp2, gp3, io1)"
  type        = string
  default     = "gp3"
}

variable "rds_database_name" {
  description = "Name of the PostgreSQL database"
  type        = string
  default     = "settlepaisa_v2"
}

variable "rds_master_username" {
  description = "Master username for RDS"
  type        = string
  default     = "postgres"
}

variable "rds_master_password" {
  description = "Master password for RDS (store in terraform.tfvars, NOT in version control)"
  type        = string
  sensitive   = true
}

variable "rds_backup_retention_period" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}

variable "rds_backup_window" {
  description = "Preferred backup window (UTC)"
  type        = string
  default     = "03:00-04:00"
}

variable "rds_maintenance_window" {
  description = "Preferred maintenance window (UTC)"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for high availability"
  type        = bool
  default     = false  # Set to true for production HA
}

variable "rds_publicly_accessible" {
  description = "Whether RDS should be publicly accessible"
  type        = bool
  default     = false  # Should always be false for security
}

# ============================================================================
# S3 Configuration
# ============================================================================

variable "s3_frontend_bucket_name" {
  description = "S3 bucket name for frontend static website hosting"
  type        = string
  default     = "settlepaisa-ops-production"
}

variable "s3_enable_versioning" {
  description = "Enable S3 versioning for rollback capability"
  type        = bool
  default     = true
}

# ============================================================================
# Application Load Balancer Configuration
# ============================================================================

variable "alb_name" {
  description = "Name for Application Load Balancer"
  type        = string
  default     = "settlepaisa-ops-api-alb"
}

variable "alb_enable_https" {
  description = "Enable HTTPS listener on ALB"
  type        = bool
  default     = true
}

variable "alb_certificate_domain" {
  description = "Domain name for ACM certificate"
  type        = string
  default     = "api.settlepaisaops.sabpaisa.in"
}

variable "alb_ssl_policy" {
  description = "SSL policy for HTTPS listener"
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

# ============================================================================
# Backend Services Configuration
# ============================================================================

variable "backend_services" {
  description = "Map of backend services with their ports and health check paths"
  type = map(object({
    port        = number
    path_pattern = string
    priority    = number
    health_check_path = string
  }))
  default = {
    "overview-api" = {
      port              = 5108
      path_pattern      = "/api/overview*"
      priority          = 1
      health_check_path = "/api/overview/health"
    }
    "recon-api" = {
      port              = 5103
      path_pattern      = "/api/recon*"
      priority          = 2
      health_check_path = "/api/recon/health"
    }
    "upload-api" = {
      port              = 5107
      path_pattern      = "/api/upload*"
      priority          = 3
      health_check_path = "/api/upload/health"
    }
    "settlement-api" = {
      port              = 5110
      path_pattern      = "/api/settlement*"
      priority          = 4
      health_check_path = "/api/settlement/health"
    }
    "pg-ingestion" = {
      port              = 5111
      path_pattern      = "/api/pg*"
      priority          = 5
      health_check_path = "/api/pg/health"
    }
    "chargeback-api" = {
      port              = 5112
      path_pattern      = "/api/chargeback*"
      priority          = 6
      health_check_path = "/api/chargeback/health"
    }
    "exports-api" = {
      port              = 5113
      path_pattern      = "/api/exports*"
      priority          = 7
      health_check_path = "/api/exports/health"
    }
    "auth-api" = {
      port              = 5108  # Auth is served by overview-api
      path_pattern      = "/api/auth*"
      priority          = 8
      health_check_path = "/api/auth/health"
    }
  }
}

# ============================================================================
# Secrets and Security
# ============================================================================

variable "jwt_secret" {
  description = "JWT secret for application authentication"
  type        = string
  sensitive   = true
}

variable "enable_secrets_manager" {
  description = "Whether to create AWS Secrets Manager secrets"
  type        = bool
  default     = true
}

# ============================================================================
# Monitoring and Logging
# ============================================================================

variable "enable_cloudwatch_alarms" {
  description = "Whether to create CloudWatch alarms"
  type        = bool
  default     = true
}

variable "ec2_cpu_alarm_threshold" {
  description = "EC2 CPU utilization threshold for alarm (percentage)"
  type        = number
  default     = 80
}

variable "rds_cpu_alarm_threshold" {
  description = "RDS CPU utilization threshold for alarm (percentage)"
  type        = number
  default     = 80
}

variable "rds_storage_alarm_threshold" {
  description = "RDS free storage threshold for alarm (GB)"
  type        = number
  default     = 10
}

variable "alarm_email" {
  description = "Email address for CloudWatch alarm notifications"
  type        = string
  default     = "ops@sabpaisa.in"
}

# ============================================================================
# Tags
# ============================================================================

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project    = "SettlePaisa"
    ManagedBy  = "Terraform"
    Repository = "ops-dashboard"
  }
}
