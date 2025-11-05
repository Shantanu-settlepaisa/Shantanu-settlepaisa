# Infrastructure as Code Documentation

## Overview

This document describes the infrastructure configuration for the SettlePaisa Ops Dashboard. All infrastructure is managed as code using **Terraform 1.6+**, enabling reproducible deployments, disaster recovery, and environment parity.

---

## Infrastructure as Code (IaC)

### Tool

**Terraform** v1.6.0 or higher

### Why Terraform?

- **Declarative**: Describe desired state, Terraform handles the how
- **Version Controlled**: Infrastructure changes tracked in Git
- **Reproducible**: Create identical environments instantly
- **Cloud-Agnostic**: Works with AWS, Azure, GCP, and 100+ providers
- **State Management**: Tracks real-world resources vs desired state
- **Plan Before Apply**: Preview changes before execution

---

## Architecture

### Environments

| Environment | Purpose | AWS Account | Region |
|-------------|---------|-------------|--------|
| **Production** | Live customer traffic | 152271395950 | ap-south-1 (Mumbai) |
| **Staging** | Pre-production testing | 152271395950 | ap-south-1 (Mumbai) |
| **Development** | Local development | N/A (Docker) | N/A |

### Infrastructure Components

```
┌─────────────────────────────────────────────────────────────────┐
│                          Internet                                │
└───────────────────┬──────────────────┬──────────────────────────┘
                    │                  │
            ┌───────▼────────┐ ┌──────▼────────┐
            │   CloudFront   │ │      ALB      │
            │   (Frontend)   │ │   (Backend)   │
            └───────┬────────┘ └──────┬────────┘
                    │                  │
         ┌──────────▼──────────┐       │
         │   S3 Static Website  │       │
         │  (React SPA Hosting) │       │
         └─────────────────────┘       │
                                        │
                    ┌───────────────────┴───────────────────┐
                    │         Path-Based Routing             │
                    │  /api/overview → overview-api:5108    │
                    │  /api/recon    → recon-api:5103       │
                    │  /api/upload   → upload-api:5107      │
                    │  ... (8 services total)                │
                    └───────────────────┬───────────────────┘
                                        │
                            ┌───────────▼──────────┐
                            │    EC2 Instance       │
                            │  (t3.medium)         │
                            │                      │
                            │  ┌────────────────┐  │
                            │  │  PM2 Process   │  │
                            │  │  Manager       │  │
                            │  │                │  │
                            │  │  8 Node.js     │  │
                            │  │  Services      │  │
                            │  └────────────────┘  │
                            └───────────┬──────────┘
                                        │
                            ┌───────────▼──────────┐
                            │  RDS PostgreSQL      │
                            │  (db.t3.large)       │
                            │  Multi-AZ (optional) │
                            │  100GB → 500GB       │
                            └──────────────────────┘
```

---

## Terraform Structure

```
terraform/
├── backend-setup.tf              # S3 + DynamoDB for state storage
├── environments/
│   ├── production/
│   │   ├── backend.tf            # Backend configuration
│   │   ├── main.tf               # Core infrastructure (EC2, RDS, IAM)
│   │   ├── main-s3-alb.tf        # S3, ALB, CloudWatch
│   │   ├── variables.tf          # Variable definitions
│   │   ├── terraform.tfvars      # Actual values (gitignored)
│   │   ├── terraform.tfvars.example  # Template
│   │   ├── outputs.tf            # Output values
│   │   └── user-data.sh          # EC2 initialization script
│   └── staging/
│       └── ... (same structure)
└── modules/                      # (Optional) Reusable modules
    ├── vpc/
    ├── ec2/
    ├── rds/
    └── alb/
```

---

## Resources Managed by Terraform

### Compute

- **EC2 Instance**: t3.medium (production), t3.micro (staging)
- **AMI**: Amazon Linux 2023 (latest)
- **Elastic IP**: Stable public IP address
- **IAM Instance Profile**: Secrets Manager access, CloudWatch Logs

### Database

- **RDS PostgreSQL**: Version 17.6
- **Instance Class**: db.t3.large (production), db.t3.micro (staging)
- **Storage**: 100GB gp3, auto-scaling to 500GB
- **Backups**: Daily at 03:00 UTC, 7-day retention
- **Multi-AZ**: Configurable (false for cost, true for HA)
- **Encryption**: At rest and in transit

### Storage

- **S3 Bucket**: Static website hosting for React SPA
- **Versioning**: Enabled (rollback capability)
- **Lifecycle Policy**: Delete old versions after 30 days

### Networking

- **VPC**: Default VPC (existing)
- **Subnets**: Public (EC2, ALB) and Private (RDS)
- **Security Groups**:
  - EC2: SSH (22), Backend ports (5103-5113), HTTP/HTTPS
  - RDS: PostgreSQL (5432) from EC2 only
  - ALB: HTTP (80), HTTPS (443)
- **Application Load Balancer**: Path-based routing to 8 backend services
- **Target Groups**: One per service, health checks enabled

### Security

- **Secrets Manager**:
  - Database password
  - JWT secret
- **IAM Roles**:
  - EC2 instance role (Secrets Manager, CloudWatch)
  - RDS monitoring role (Enhanced Monitoring)

### Monitoring

- **CloudWatch Log Groups**:
  - `/aws/ec2/settlepaisa-production`
  - `/aws/rds/settlepaisa-production`
- **CloudWatch Alarms**:
  - EC2 CPU > 80%
  - RDS CPU > 80%
  - RDS Storage < 10GB
  - RDS Connections > 80
  - ALB 5xx errors > 10/min
- **SNS Topic**: Email notifications for alarms

---

## Terraform State Management

### Backend Configuration

**State Storage**: S3 bucket `settlepaisa-terraform-state`
**State Locking**: DynamoDB table `settlepaisa-terraform-lock`
**Encryption**: AES256
**Versioning**: Enabled (rollback capability)

### State File Location

- **Production**: `s3://settlepaisa-terraform-state/environments/production/terraform.tfstate`
- **Staging**: `s3://settlepaisa-terraform-state/environments/staging/terraform.tfstate`

### Concurrency Protection

DynamoDB table prevents multiple users from modifying infrastructure simultaneously.

---

## Usage

### Prerequisites

1. **Install Terraform**:
   ```bash
   # macOS
   brew install terraform

   # Linux
   wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
   unzip terraform_1.6.0_linux_amd64.zip
   sudo mv terraform /usr/local/bin/
   ```

2. **Configure AWS Credentials**:
   ```bash
   aws configure
   # Or export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
   ```

3. **Verify Access**:
   ```bash
   aws sts get-caller-identity
   terraform version
   ```

### First-Time Setup

#### Step 1: Create Terraform Backend

```bash
cd terraform/
terraform init
terraform apply  # Creates S3 bucket and DynamoDB table
```

#### Step 2: Initialize Production Environment

```bash
cd terraform/environments/production/

# Copy and edit variables
cp terraform.tfvars.example terraform.tfvars
vi terraform.tfvars  # Fill in actual passwords, secrets

# Initialize Terraform
terraform init

# Review planned changes
terraform plan

# Apply infrastructure
terraform apply
```

### Daily Operations

#### View Current Infrastructure

```bash
cd terraform/environments/production/
terraform show
```

#### Plan Changes Before Applying

```bash
terraform plan
# Review output carefully before proceeding
```

#### Apply Infrastructure Changes

```bash
terraform apply
# Type 'yes' to confirm
```

#### View Outputs

```bash
terraform output
terraform output -json | jq
```

#### Destroy Infrastructure (DANGEROUS)

```bash
terraform destroy  # Only for non-production!
```

---

## Importing Existing Resources

When adopting Terraform for existing infrastructure, import resources before making changes:

```bash
# EC2 Instance
terraform import aws_instance.main i-0dad59ca52e189f8b

# RDS Instance
terraform import aws_db_instance.main settlepaisa-production

# S3 Bucket
terraform import aws_s3_bucket.frontend settlepaisa-ops-production

# Security Groups (find IDs in AWS Console)
terraform import aws_security_group.ec2 sg-00263a1d84106067e
terraform import aws_security_group.rds sg-XXXXXXXXX
terraform import aws_security_group.alb sg-XXXXXXXXX

# ALB
terraform import aws_lb.main arn:aws:elasticloadbalancing:ap-south-1:152271395950:loadbalancer/app/settlepaisa-ops-api-alb-1284702859/...
```

After importing, run `terraform plan` to ensure 0 changes (state matches reality).

---

## Creating New Environments

To create a new environment (e.g., UAT, DR):

```bash
# Copy production configuration
cp -r terraform/environments/production terraform/environments/uat

# Edit variables
cd terraform/environments/uat
vi terraform.tfvars  # Change instance sizes, bucket names, etc.

# Apply
terraform init
terraform plan
terraform apply
```

Terraform creates an identical environment with different resource names!

---

## Disaster Recovery

If production infrastructure is destroyed:

```bash
cd terraform/environments/production/

# Re-apply infrastructure (10-15 minutes)
terraform apply

# Restore database from latest snapshot
# (Terraform creates final snapshot before destruction)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier settlepaisa-production-new \
  --db-snapshot-identifier settlepaisa-production-final-snapshot-YYYY-MM-DD-hhmm

# Update Terraform state to point to restored DB
terraform import aws_db_instance.main settlepaisa-production-new

# Deploy application code
ssh ec2-user@$(terraform output -raw ec2_public_ip)
cd /home/ec2-user/ops-dashboard
git pull origin production
pm2 restart all
```

**Recovery Time Objective (RTO)**: < 30 minutes
**Recovery Point Objective (RPO)**: Last automated backup (max 24 hours)

---

## Security Best Practices

### Secrets Management

1. **Never commit `terraform.tfvars` to Git** (gitignored)
2. **Use AWS Secrets Manager** for passwords, JWT secrets
3. **Rotate secrets regularly** (90 days)
4. **Use IAM roles** instead of long-lived credentials

### State File Security

1. **S3 encryption enabled** (AES256)
2. **Versioning enabled** (rollback capability)
3. **Block public access** (private bucket)
4. **State locking** (DynamoDB prevents conflicts)

### Infrastructure Security

1. **RDS not publicly accessible** (EC2-only access)
2. **Security groups restrict inbound** (principle of least privilege)
3. **Encryption at rest** (EBS, RDS, S3)
4. **Deletion protection** (RDS, ALB)

---

## Maintenance

### Regular Tasks

- **Weekly**: Review CloudWatch alarms, check for drift
- **Monthly**: Review and optimize costs, update AMIs
- **Quarterly**: Rotate secrets, update Terraform version
- **Annually**: Review architecture, plan capacity upgrades

### Drift Detection

Check if infrastructure changed outside Terraform:

```bash
terraform plan
# Should show 0 changes if no drift
```

If drift detected:
1. **Option A**: Revert manual changes (`terraform apply`)
2. **Option B**: Import manual changes into Terraform state

---

## Cost Estimation

### Production Environment

| Service | Type | Monthly Cost (USD) |
|---------|------|-------------------|
| EC2 | t3.medium | $30-40 |
| RDS | db.t3.large | $120-140 |
| EBS | 50GB gp3 | $5 |
| S3 | Standard + requests | $5-10 |
| ALB | Load balancer | $20-25 |
| Data Transfer | Outbound | $20-50 |
| CloudWatch | Logs + alarms | $5-10 |
| Secrets Manager | 2 secrets | $1 |
| **Total** | | **$206-281** |

### Cost Optimization

- **Staging**: Use t3.micro instances ($8/mo instead of $30/mo)
- **Reserved Instances**: Save 30-60% for 1-3 year commitments
- **Spot Instances**: Save 70-90% for non-critical workloads
- **Auto Scaling**: Scale down during low-traffic hours

---

## Troubleshooting

### Common Issues

#### Error: "Resource already exists"
**Solution**: Import existing resource into Terraform state

#### Error: "Access Denied"
**Solution**: Check AWS credentials, IAM permissions

#### Error: "State lock timeout"
**Solution**: Another user is running Terraform, wait or force unlock

#### Error: "No changes, infrastructure up-to-date"
**Solution**: Good! Terraform state matches reality

### Getting Help

1. **Terraform Docs**: https://www.terraform.io/docs
2. **AWS Provider Docs**: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
3. **Debugging**: Set `TF_LOG=DEBUG` for verbose output

---

## CI/CD Integration (Future)

Terraform can be integrated into CI/CD pipelines:

```yaml
# .github/workflows/terraform.yml
name: Terraform

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
      - run: terraform init
      - run: terraform plan
      - run: terraform apply -auto-approve
```

**Benefits**:
- Automatic infrastructure updates on code merge
- Plan preview in pull requests
- State locking prevents conflicts
- Audit trail in Git history

---

## Related Documentation

- **[SECURITY.md](./SECURITY.md)** - Security features and policies
- **[TESTING.md](./TESTING.md)** - Testing infrastructure
- **[README.md](./README.md)** - Project overview
- **[terraform/README.md](./terraform/README.md)** - Terraform usage guide (to be created)

---

## Contact

- **DevOps Team**: ops@sabpaisa.in
- **Infrastructure Issues**: Create GitHub issue with `[infrastructure]` tag
- **Emergency**: See PRODUCTION_CREDENTIALS.md (internal only)

---

**Last Updated**: November 5, 2025
**Managed By**: DevOps Team
**Terraform Version**: 1.6.0
**AWS Provider Version**: 5.0
