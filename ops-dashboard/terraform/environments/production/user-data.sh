#!/bin/bash
# ============================================================================
# EC2 User Data Script for SettlePaisa Ops Dashboard
# ============================================================================
# This script runs on EC2 instance first boot to:
#   - Install Node.js 18, PM2, PostgreSQL client
#   - Configure CloudWatch Logs agent
#   - Fetch secrets from AWS Secrets Manager
#   - Clone/pull application code
#   - Set up environment variables
#   - Start PM2 services
#
# Variables passed from Terraform:
#   - db_host: RDS endpoint
#   - db_port: RDS port
#   - db_name: Database name
#   - db_user: Database username
#   - db_password_secret: Secrets Manager secret name for DB password
#   - jwt_secret_secret: Secrets Manager secret name for JWT secret
#   - environment: Environment name (production, staging, development)
#   - project_name: Project name
# ============================================================================

set -e  # Exit on error
set -x  # Print commands (for debugging in /var/log/cloud-init-output.log)

# ============================================================================
# Configuration
# ============================================================================

export DB_HOST="${db_host}"
export DB_PORT="${db_port}"
export DB_NAME="${db_name}"
export DB_USER="${db_user}"
export DB_PASSWORD_SECRET="${db_password_secret}"
export JWT_SECRET_SECRET="${jwt_secret_secret}"
export ENVIRONMENT="${environment}"
export PROJECT_NAME="${project_name}"

export APP_DIR="/home/ec2-user/ops-dashboard"
export AWS_REGION="ap-south-1"

# ============================================================================
# System Updates
# ============================================================================

echo "========================================="
echo "Updating system packages..."
echo "========================================="

dnf update -y

# ============================================================================
# Install Node.js 18
# ============================================================================

echo "========================================="
echo "Installing Node.js 18..."
echo "========================================="

# Install Node.js 18 from NodeSource
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
dnf install -y nodejs

# Verify installation
node --version
npm --version

# ============================================================================
# Install PM2
# ============================================================================

echo "========================================="
echo "Installing PM2..."
echo "========================================="

npm install -g pm2

# Configure PM2 to start on boot
pm2 startup systemd -u ec2-user --hp /home/ec2-user
systemctl enable pm2-ec2-user

# ============================================================================
# Install PostgreSQL Client
# ============================================================================

echo "========================================="
echo "Installing PostgreSQL client..."
echo "========================================="

dnf install -y postgresql15

# Verify installation
psql --version

# ============================================================================
# Install AWS CLI (if not already installed)
# ============================================================================

echo "========================================="
echo "Installing AWS CLI..."
echo "========================================="

if ! command -v aws &> /dev/null; then
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
    unzip /tmp/awscliv2.zip -d /tmp
    /tmp/aws/install
    rm -rf /tmp/aws /tmp/awscliv2.zip
fi

# Verify installation
aws --version

# ============================================================================
# Install CloudWatch Logs Agent
# ============================================================================

echo "========================================="
echo "Installing CloudWatch Logs agent..."
echo "========================================="

# Install CloudWatch agent
dnf install -y amazon-cloudwatch-agent

# Create CloudWatch agent configuration
cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json <<EOL
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "$APP_DIR/logs/*.log",
            "log_group_name": "/aws/ec2/$PROJECT_NAME-$ENVIRONMENT",
            "log_stream_name": "{instance_id}/app",
            "timezone": "UTC"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "$PROJECT_NAME/$ENVIRONMENT",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {
            "name": "cpu_usage_idle",
            "rename": "CPU_IDLE",
            "unit": "Percent"
          }
        ],
        "totalcpu": false
      },
      "disk": {
        "measurement": [
          {
            "name": "used_percent",
            "rename": "DISK_USED",
            "unit": "Percent"
          }
        ],
        "resources": [
          "/"
        ]
      },
      "mem": {
        "measurement": [
          {
            "name": "mem_used_percent",
            "rename": "MEM_USED",
            "unit": "Percent"
          }
        ]
      }
    }
  }
}
EOL

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json

# ============================================================================
# Fetch Secrets from AWS Secrets Manager
# ============================================================================

echo "========================================="
echo "Fetching secrets from Secrets Manager..."
echo "========================================="

if [ -n "$DB_PASSWORD_SECRET" ]; then
    DB_PASSWORD=$(aws secretsmanager get-secret-value \
        --secret-id "$DB_PASSWORD_SECRET" \
        --region "$AWS_REGION" \
        --query 'SecretString' \
        --output text | jq -r '.password')
    export DB_PASSWORD
    echo "Database password fetched successfully"
else
    echo "WARNING: DB_PASSWORD_SECRET not set, skipping..."
fi

if [ -n "$JWT_SECRET_SECRET" ]; then
    JWT_SECRET=$(aws secretsmanager get-secret-value \
        --secret-id "$JWT_SECRET_SECRET" \
        --region "$AWS_REGION" \
        --query 'SecretString' \
        --output text)
    export JWT_SECRET
    echo "JWT secret fetched successfully"
else
    echo "WARNING: JWT_SECRET_SECRET not set, skipping..."
fi

# ============================================================================
# Clone Application Code
# ============================================================================

echo "========================================="
echo "Setting up application code..."
echo "========================================="

# Create app directory
mkdir -p "$APP_DIR"
chown ec2-user:ec2-user "$APP_DIR"

# Clone repository (or pull if already exists)
# NOTE: This requires SSH key or Git credentials configured
# For now, we'll assume code is deployed via other means (tarball, CodeDeploy, etc.)

# Switch to ec2-user for remaining operations
su - ec2-user <<'EOSU'

APP_DIR="/home/ec2-user/ops-dashboard"
cd "$APP_DIR" || exit 1

# If git repo exists, pull latest
if [ -d ".git" ]; then
    echo "Git repository exists, pulling latest..."
    git pull origin production
else
    echo "Git repository not found. Code must be deployed separately."
    echo "Expected directory structure:"
    echo "  $APP_DIR/services/"
    echo "  $APP_DIR/package.json"
    echo "  $APP_DIR/ecosystem.config.cjs"
fi

EOSU

# ============================================================================
# Create Environment File
# ============================================================================

echo "========================================="
echo "Creating environment configuration..."
echo "========================================="

# Create .env file for each service
cat > "$APP_DIR/.env" <<EOL
# Database Configuration
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# JWT Configuration
JWT_SECRET=$JWT_SECRET

# Environment
NODE_ENV=$ENVIRONMENT

# CORS Configuration
CORS_ORIGIN=http://settlepaisa-ops-$ENVIRONMENT.s3-website.ap-south-1.amazonaws.com

# API URLs (inter-service communication on localhost)
OVERVIEW_API_URL=http://localhost:5108
RECON_API_URL=http://localhost:5103
UPLOAD_API_URL=http://localhost:5107
SETTLEMENT_API_URL=http://localhost:5110
PG_API_URL=http://localhost:5111
BANK_API_URL=http://localhost:5102
CHARGEBACK_API_URL=http://localhost:5112
EXPORTS_API_URL=http://localhost:5113
EOL

chown ec2-user:ec2-user "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"  # Protect secrets

# ============================================================================
# Install Dependencies and Start Services
# ============================================================================

echo "========================================="
echo "Installing dependencies and starting services..."
echo "========================================="

# Switch to ec2-user for npm install and PM2
su - ec2-user <<'EOSU'

APP_DIR="/home/ec2-user/ops-dashboard"
cd "$APP_DIR" || exit 1

# Install npm dependencies (if package.json exists)
if [ -f "package.json" ]; then
    echo "Installing npm dependencies..."
    npm install --production
else
    echo "WARNING: package.json not found, skipping npm install"
fi

# Start PM2 services (if ecosystem.config.cjs exists)
if [ -f "ecosystem.config.cjs" ]; then
    echo "Starting PM2 services..."
    pm2 start ecosystem.config.cjs --env $ENVIRONMENT
    pm2 save
else
    echo "WARNING: ecosystem.config.cjs not found, services not started"
    echo "Services must be started manually after code deployment"
fi

# Show PM2 status
pm2 status

EOSU

# ============================================================================
# Verify Database Connection
# ============================================================================

echo "========================================="
echo "Verifying database connection..."
echo "========================================="

PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "SELECT version();" || echo "WARNING: Database connection failed"

# ============================================================================
# Final Status
# ============================================================================

echo "========================================="
echo "User data script completed!"
echo "========================================="
echo "Environment: $ENVIRONMENT"
echo "Project: $PROJECT_NAME"
echo "App Directory: $APP_DIR"
echo "Database: $DB_HOST:$DB_PORT/$DB_NAME"
echo "========================================="
echo "Check logs:"
echo "  - Cloud-init: /var/log/cloud-init-output.log"
echo "  - PM2: pm2 logs"
echo "  - CloudWatch: /aws/ec2/$PROJECT_NAME-$ENVIRONMENT"
echo "========================================="
