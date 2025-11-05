# Terraform Infrastructure for SettlePaisa

This directory contains Terraform configuration for managing AWS infrastructure for the SettlePaisa Ops Dashboard.

## Quick Start

### Prerequisites

1. **Terraform** v1.6.0 or higher
2. **AWS CLI** configured with credentials
3. **Access to AWS account** 152271395950

### Initial Setup (First Time Only)

```bash
# 1. Create Terraform backend (S3 + DynamoDB)
cd terraform/
terraform init
terraform apply

# 2. Initialize production environment
cd environments/production/
cp terraform.tfvars.example terraform.tfvars
vi terraform.tfvars  # Fill in actual passwords

terraform init
terraform plan
terraform apply
```

### Daily Usage

```bash
cd terraform/environments/production/

# View current infrastructure
terraform show

# Plan changes
terraform plan

# Apply changes
terraform apply

# View outputs
terraform output
```

---

## Directory Structure

```
terraform/
├── README.md                     # This file
├── backend-setup.tf              # Creates S3 bucket and DynamoDB table for state
├── environments/
│   ├── production/
│   │   ├── backend.tf            # S3 backend configuration
│   │   ├── main.tf               # Core infrastructure (EC2, RDS, IAM, SG)
│   │   ├── main-s3-alb.tf        # S3, ALB, CloudWatch, alarms
│   │   ├── variables.tf          # Variable definitions
│   │   ├── terraform.tfvars      # Actual values (GITIGNORED)
│   │   ├── terraform.tfvars.example  # Template
│   │   ├── outputs.tf            # Output values
│   │   └── user-data.sh          # EC2 initialization script
│   └── staging/
│       └── ... (same structure)
└── modules/                      # (Future) Reusable modules
```

---

## What Gets Created

### Production Environment

| Resource | Type | Configuration |
|----------|------|---------------|
| **EC2** | t3.medium | 50GB gp3, Elastic IP, Amazon Linux 2023 |
| **RDS** | db.t3.large | PostgreSQL 17.6, 100GB→500GB gp3, 7-day backups |
| **S3** | Standard | Static website hosting, versioning enabled |
| **ALB** | Application | Path-based routing, 8 target groups |
| **Secrets Manager** | 2 secrets | DB password, JWT secret |
| **CloudWatch** | 5 alarms | CPU, storage, connections, 5xx errors |
| **IAM** | 2 roles | EC2 instance profile, RDS monitoring |
| **Security Groups** | 3 groups | EC2, RDS, ALB |

**Estimated Cost**: $206-281/month

### Staging Environment

Same architecture, smaller instances:
- EC2: t3.micro
- RDS: db.t3.micro

**Estimated Cost**: $29-42/month

---

## Important Files

### `backend-setup.tf`

Creates S3 bucket and DynamoDB table for storing Terraform state. Run this **once** before initializing environments.

### `main.tf`

Core infrastructure:
- EC2 instance with user data script
- RDS PostgreSQL database
- Security groups
- IAM roles and policies
- Secrets Manager secrets

### `main-s3-alb.tf`

Additional infrastructure:
- S3 bucket for frontend hosting
- Application Load Balancer
- Target groups for 8 backend services
- CloudWatch log groups and alarms
- SNS topic for alarm notifications

### `variables.tf`

Defines all configurable parameters. Actual values in `terraform.tfvars` (gitignored).

### `terraform.tfvars`

**SENSITIVE**: Contains production passwords and secrets. Never commit to Git.

Copy from `terraform.tfvars.example` and fill in:
- `rds_master_password`: RDS database password
- `jwt_secret`: JWT secret for application authentication

### `outputs.tf`

Exports useful values after `terraform apply`:
- EC2 public IP
- RDS endpoint
- S3 website URL
- ALB DNS name
- Security group IDs

### `user-data.sh`

Bash script that runs on EC2 first boot:
- Installs Node.js 18, PM2, PostgreSQL client
- Configures CloudWatch Logs agent
- Fetches secrets from Secrets Manager
- Creates .env file
- Starts PM2 services

---

## Common Commands

### View Infrastructure

```bash
# Show all resources
terraform show

# Show specific resource
terraform show aws_instance.main

# List all resources in state
terraform state list

# Show outputs
terraform output
terraform output ec2_public_ip
terraform output -json | jq
```

### Plan and Apply

```bash
# Preview changes (always do this first!)
terraform plan

# Apply changes
terraform apply

# Apply with auto-approve (use carefully!)
terraform apply -auto-approve

# Apply specific resource only
terraform apply -target=aws_instance.main
```

### Import Existing Resources

If resources already exist in AWS, import them before managing with Terraform:

```bash
# EC2
terraform import aws_instance.main i-0dad59ca52e189f8b

# RDS
terraform import aws_db_instance.main settlepaisa-production

# S3
terraform import aws_s3_bucket.frontend settlepaisa-ops-production

# Security Group (find ID in AWS Console)
terraform import aws_security_group.ec2 sg-00263a1d84106067e
```

After importing, run `terraform plan` - should show 0 changes.

### Validate Configuration

```bash
# Check syntax
terraform validate

# Format code
terraform fmt

# Format recursively
terraform fmt -recursive
```

### Refresh State

```bash
# Update state from real-world resources
terraform refresh

# Detect drift (changes made outside Terraform)
terraform plan -refresh-only
```

### Destroy Infrastructure

```bash
# ⚠️  DANGEROUS: Destroys all resources
terraform destroy

# Destroy specific resource only
terraform destroy -target=aws_instance.main
```

---

## Importing Existing Production Infrastructure

**Status**: Production infrastructure exists, needs to be imported into Terraform state.

### Step 1: Initialize Terraform

```bash
cd terraform/environments/production/
terraform init
```

### Step 2: Import Resources

```bash
# EC2 Instance
terraform import aws_instance.main i-0dad59ca52e189f8b

# RDS Instance
terraform import aws_db_instance.main settlepaisa-production

# S3 Bucket
terraform import aws_s3_bucket.frontend settlepaisa-ops-production

# Security Groups (find IDs in AWS Console first)
terraform import aws_security_group.ec2 sg-XXXXXXXXX
terraform import aws_security_group.rds sg-XXXXXXXXX
terraform import aws_security_group.alb sg-XXXXXXXXX

# ALB (find ARN in AWS Console)
terraform import aws_lb.main arn:aws:elasticloadbalancing:...

# Target Groups (one per service)
terraform import 'aws_lb_target_group.services["overview-api"]' arn:aws:...
terraform import 'aws_lb_target_group.services["recon-api"]' arn:aws:...
# ... (repeat for all 8 services)
```

### Step 3: Verify Import

```bash
terraform plan
# Should show 0 changes if import successful
# If changes shown, adjust Terraform code to match reality
```

### Import Script

A helper script will be created to automate this process. See `import-production.sh` (coming soon).

---

## Creating New Environments

To create a UAT or DR environment:

```bash
# Copy production configuration
cp -r terraform/environments/production terraform/environments/uat

# Edit configuration
cd terraform/environments/uat
vi terraform.tfvars
# Change:
#   - environment = "uat"
#   - s3_frontend_bucket_name = "settlepaisa-ops-uat"
#   - ec2_instance_type = "t3.micro" (smaller for testing)
#   - rds_instance_class = "db.t3.micro"

# Initialize and apply
terraform init
terraform plan
terraform apply
```

Terraform creates an identical environment in ~15 minutes!

---

## Secrets Management

### Current Approach

Secrets stored in `terraform.tfvars` (gitignored):
- RDS password
- JWT secret

### Future: AWS Secrets Manager

Terraform creates Secrets Manager secrets. EC2 fetches at runtime:

```bash
# Manual secret creation
aws secretsmanager create-secret \
  --name settlepaisa/production/database/master-password \
  --secret-string '{"username":"postgres","password":"vsF41bPJH77W6DPKoyQ1Mv8U"}'

# EC2 fetches on boot (user-data.sh handles this)
```

---

## Disaster Recovery

If production is destroyed:

### Option 1: Terraform Recreate (15-20 minutes)

```bash
cd terraform/environments/production/
terraform apply
# Recreates EC2, RDS, ALB, S3 from scratch
```

### Option 2: Database Restore

RDS creates final snapshot before deletion. Restore:

```bash
# List snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier settlepaisa-production

# Restore
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier settlepaisa-production-restored \
  --db-snapshot-identifier settlepaisa-production-final-snapshot-2025-11-05-1200

# Update Terraform to manage restored instance
terraform import aws_db_instance.main settlepaisa-production-restored
```

---

## Troubleshooting

### Error: "Backend initialization required"

**Solution**:
```bash
terraform init
```

### Error: "Resource already exists"

**Solution**: Import existing resource
```bash
terraform import <resource_type>.<name> <resource_id>
```

### Error: "State lock timeout"

**Solution**: Another user is running Terraform. Wait or force unlock:
```bash
terraform force-unlock <lock_id>
```

### Error: "Access Denied"

**Solution**: Check AWS credentials
```bash
aws sts get-caller-identity  # Verify you're authenticated
aws configure  # Reconfigure if needed
```

### Error: "Invalid credentials"

**Solution**: Refresh AWS credentials
```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...  # If using temporary credentials
```

### Drift Detected

If `terraform plan` shows changes but you didn't modify code:
1. **Manual changes**: Someone changed infrastructure in AWS Console
2. **Options**:
   - Revert: `terraform apply` (overwrites manual changes)
   - Accept: Update Terraform code to match reality
   - Import: `terraform import` to adopt manual changes

---

## Best Practices

### Before Every Apply

1. **Run terraform plan first**: Never apply blind
2. **Review changes carefully**: Understand what will change
3. **Check for deletions**: Red "-" lines are dangerous
4. **Backup state**: S3 versioning handles this automatically

### State Management

1. **Never edit state manually**: Use `terraform state` commands
2. **Never commit tfstate files**: They're in S3, not Git
3. **Use locking**: DynamoDB prevents concurrent modifications
4. **Backup regularly**: S3 versioning provides automatic backups

### Code Quality

1. **Format code**: `terraform fmt` before committing
2. **Validate syntax**: `terraform validate` catches errors early
3. **Use variables**: Never hardcode values in main.tf
4. **Document changes**: Add comments for complex logic

### Security

1. **Never commit terraform.tfvars**: Contains passwords
2. **Use Secrets Manager**: For runtime secrets
3. **Rotate secrets**: Every 90 days
4. **Least privilege**: IAM roles with minimal permissions

---

## CI/CD Integration (Future)

Terraform can be automated in GitHub Actions:

```yaml
name: Terraform Production

on:
  push:
    branches: [production]
    paths: ['terraform/**']

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.6.0

      - name: Terraform Init
        run: terraform init
        working-directory: terraform/environments/production

      - name: Terraform Plan
        run: terraform plan -no-color
        working-directory: terraform/environments/production
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Terraform Apply
        if: github.ref == 'refs/heads/production'
        run: terraform apply -auto-approve
        working-directory: terraform/environments/production
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## Resources

- **Terraform Docs**: https://www.terraform.io/docs
- **AWS Provider**: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- **Terraform Best Practices**: https://www.terraform-best-practices.com/
- **Terraform AWS Examples**: https://github.com/hashicorp/terraform-provider-aws/tree/main/examples

---

## Support

- **DevOps Team**: ops@sabpaisa.in
- **Infrastructure Issues**: Create GitHub issue with `[terraform]` tag
- **Emergency**: See PRODUCTION_CREDENTIALS.md

---

**Last Updated**: November 5, 2025
**Terraform Version**: 1.6.0+
**AWS Provider Version**: 5.0+
