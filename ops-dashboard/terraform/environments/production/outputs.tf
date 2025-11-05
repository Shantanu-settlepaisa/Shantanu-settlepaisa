# Terraform Outputs for Production Environment
# These values can be used by CI/CD pipelines and other automation

# ============================================================================
# EC2 Outputs
# ============================================================================

output "ec2_instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.main.id
}

output "ec2_public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_instance.main.public_ip
}

output "ec2_elastic_ip" {
  description = "Elastic IP address (if enabled)"
  value       = var.enable_elastic_ip ? aws_eip.ec2[0].public_ip : null
}

output "ec2_private_ip" {
  description = "Private IP address of the EC2 instance"
  value       = aws_instance.main.private_ip
}

# ============================================================================
# RDS Outputs
# ============================================================================

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_address" {
  description = "RDS instance address (hostname)"
  value       = aws_db_instance.main.address
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "rds_database_name" {
  description = "Name of the database"
  value       = aws_db_instance.main.db_name
}

output "rds_master_username" {
  description = "Master username for RDS"
  value       = aws_db_instance.main.username
  sensitive   = true
}

# ============================================================================
# S3 Outputs
# ============================================================================

output "s3_frontend_bucket_name" {
  description = "Name of the S3 bucket for frontend"
  value       = aws_s3_bucket.frontend.id
}

output "s3_frontend_website_endpoint" {
  description = "Website endpoint for S3 bucket"
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

output "s3_frontend_website_url" {
  description = "Full URL for S3 static website"
  value       = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
}

# ============================================================================
# ALB Outputs
# ============================================================================

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "alb_zone_id" {
  description = "Zone ID of the ALB (for Route53 alias records)"
  value       = aws_lb.main.zone_id
}

output "alb_url" {
  description = "Full URL for ALB"
  value       = "http://${aws_lb.main.dns_name}"
}

# ============================================================================
# Target Group Outputs
# ============================================================================

output "target_group_arns" {
  description = "ARNs of all target groups"
  value       = { for k, tg in aws_lb_target_group.services : k => tg.arn }
}

# ============================================================================
# Secrets Manager Outputs
# ============================================================================

output "db_password_secret_arn" {
  description = "ARN of the database password secret in Secrets Manager"
  value       = var.enable_secrets_manager ? aws_secretsmanager_secret.db_password[0].arn : null
}

output "jwt_secret_arn" {
  description = "ARN of the JWT secret in Secrets Manager"
  value       = var.enable_secrets_manager ? aws_secretsmanager_secret.jwt_secret[0].arn : null
}

# ============================================================================
# CloudWatch Outputs
# ============================================================================

output "cloudwatch_log_group_app" {
  description = "CloudWatch log group for application logs"
  value       = aws_cloudwatch_log_group.app.name
}

output "cloudwatch_log_group_rds" {
  description = "CloudWatch log group for RDS logs"
  value       = aws_cloudwatch_log_group.rds.name
}

output "sns_alarm_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms"
  value       = var.enable_cloudwatch_alarms ? aws_sns_topic.alarms[0].arn : null
}

# ============================================================================
# Security Group Outputs
# ============================================================================

output "ec2_security_group_id" {
  description = "ID of the EC2 security group"
  value       = aws_security_group.ec2.id
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

# ============================================================================
# Connection Strings (for convenience)
# ============================================================================

output "database_connection_string" {
  description = "PostgreSQL connection string (without password)"
  value       = "postgresql://${aws_db_instance.main.username}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
  sensitive   = true
}

output "backend_service_urls" {
  description = "URLs for all backend services via EC2"
  value = {
    for service, config in var.backend_services :
    service => "http://${aws_instance.main.public_ip}:${config.port}"
  }
}

# ============================================================================
# Deployment Information
# ============================================================================

output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "project_name" {
  description = "Project name"
  value       = var.project_name
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

# ============================================================================
# Summary Output (for quick reference)
# ============================================================================

output "deployment_summary" {
  description = "Summary of all important endpoints"
  value = {
    frontend_url  = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
    alb_url       = "http://${aws_lb.main.dns_name}"
    ec2_ssh       = "ssh -i ~/.ssh/${var.ec2_key_name}.pem ec2-user@${var.enable_elastic_ip ? aws_eip.ec2[0].public_ip : aws_instance.main.public_ip}"
    database_host = aws_db_instance.main.address
    environment   = var.environment
  }
}
