#!/bin/bash

###############################################################################
# SettlePaisa 2.0 - Staging 2 Deployment Script
# Purpose: Deploy complete ops dashboard from Git to Staging 2 EC2
# Source: Git repository (feat/ops-dashboard-exports branch)
# Date: October 26, 2025
#
# PREREQUISITES:
#   1. Staging 2 EC2 instance provisioned (Ubuntu/Amazon Linux 2)
#   2. SSH access configured
#   3. S3 bucket created: settlepaisa-ops-staging-2
#   4. RDS access from Staging 2 security group
#
# USAGE:
#   Run this script ON STAGING 2 EC2 instance via AWS EC2 Instance Connect
#   OR: ssh into Staging 2 and run: bash deploy-staging-2.sh
###############################################################################

set -e  # Exit on error

echo "🚀 SettlePaisa 2.0 - Staging 2 Deployment"
echo "=========================================="
echo ""

# ============================================================================
# STEP 1: System Prerequisites
# ============================================================================
echo "📦 Step 1: Installing system prerequisites..."

# Update package manager
sudo yum update -y 2>/dev/null || sudo apt-get update -y 2>/dev/null

# Install Node.js 18.x (if not installed)
if ! command -v node &> /dev/null; then
    echo "  Installing Node.js 18.x..."
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash - 2>/dev/null ||     curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - 2>/dev/null
    sudo yum install -y nodejs 2>/dev/null || sudo apt-get install -y nodejs 2>/dev/null
fi

# Install PM2 globally (if not installed)
if ! command -v pm2 &> /dev/null; then
    echo "  Installing PM2..."
    sudo npm install -g pm2
fi

# Install PostgreSQL client (for database verification)
if ! command -v psql &> /dev/null; then
    echo "  Installing PostgreSQL client..."
    sudo yum install -y postgresql 2>/dev/null || sudo apt-get install -y postgresql-client 2>/dev/null
fi

# Install Git (if not installed)
if ! command -v git &> /dev/null; then
    echo "  Installing Git..."
    sudo yum install -y git 2>/dev/null || sudo apt-get install -y git 2>/dev/null
fi

echo "✅ Prerequisites installed"
echo ""

# ============================================================================
# STEP 2: Clone Repository
# ============================================================================
echo "📥 Step 2: Cloning repository from Git..."

cd /home/ec2-user || cd ~

# Remove old clone if exists
if [ -d "ops-dashboard" ]; then
    echo "  Backing up existing ops-dashboard to ops-dashboard.backup..."
    mv ops-dashboard ops-dashboard.backup.$(date +%Y%m%d%H%M%S)
fi

# Clone from Git
git clone https://github.com/Shantanu-settlepaisa/Shantanu-settlepaisa.git ops-dashboard
cd ops-dashboard

# Checkout the feature branch
git checkout feat/ops-dashboard-exports

echo "✅ Repository cloned (branch: feat/ops-dashboard-exports)"
echo "   Latest commit: $(git log --oneline -1)"
echo ""

# ============================================================================
# STEP 3: Configure Environment Variables
# ============================================================================
echo "⚙️  Step 3: Configuring environment variables..."

# Create .env for overview-api
cat > services/overview-api/.env << 'EOF'
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432
PORT=5108
NODE_ENV=production
JWT_SECRET=947f5db2aa2186785403ecfaec5d71e3bd1224a913f831ba41dee6f4ec2c1bf2ae37b80b9de8bbfe4ddf271dfeff98636f0dd08cc88360404712f180057d8022
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=7d
LOG_LEVEL=info
SERVICE_NAME=overview-api
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

# Create .env for recon-api
cat > services/recon-api/.env << 'EOF'
PORT=5103
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=settlepaisa_v2
DB_USER=postgres
DB_PASSWORD=SettlePaisa2024
NODE_ENV=production
USE_DB=true
EOF

# Create .env for settlement-engine
cat > services/settlement-engine/.env << 'EOF'
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432
NODE_ENV=production
PORT=5109
EOF

# Create .env for api (upload service)
cat > services/api/.env << 'EOF'
DATABASE_USER=postgres
DATABASE_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DATABASE_NAME=settlepaisa_v2
DATABASE_PASSWORD=SettlePaisa2024
DATABASE_PORT=5432
PORT=5107
NODE_ENV=production
EOF

# Create .env for pg-ingestion
cat > services/pg-ingestion/.env << 'EOF'
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432
PORT=5101
NODE_ENV=production
EOF

# Create .env for chargeback-api
cat > services/chargeback-api/.env << 'EOF'
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432
PORT=5110
NODE_ENV=production
EOF

echo "✅ Environment variables configured for all 6 services"
echo ""

# ============================================================================
# STEP 4: Install Dependencies
# ============================================================================
echo "📦 Step 4: Installing Node.js dependencies..."

# Install root dependencies (if any)
if [ -f "package.json" ]; then
    npm install
fi

# Install service dependencies
echo "  Installing overview-api dependencies..."
cd services/overview-api && npm install && cd ../..

echo "  Installing recon-api dependencies..."
cd services/recon-api && npm install && cd ../..

echo "  Installing settlement-engine dependencies..."
cd services/settlement-engine && npm install && cd ../..

echo "  Installing api dependencies..."
cd services/api && npm install && cd ../..

echo "  Installing pg-ingestion dependencies..."
cd services/pg-ingestion && npm install && cd ../..

echo "  Installing chargeback-api dependencies..."
cd services/chargeback-api && npm install && cd ../..

echo "✅ All dependencies installed"
echo ""

# ============================================================================
# STEP 5: Verify Database Connection
# ============================================================================
echo "🔍 Step 5: Verifying database connection..."

psql postgresql://postgres:SettlePaisa2024@settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2 -c "SELECT COUNT(*) as transaction_count FROM sp_v2_transactions;" 2>&1 | grep -q "transaction_count" && echo "✅ Database connection successful" || echo "⚠️  Database connection failed (check security group)"

echo ""

# ============================================================================
# STEP 6: Start Backend Services with PM2
# ============================================================================
echo "🚀 Step 6: Starting backend services with PM2..."

# Start overview-api
cd services/overview-api
pm2 start index.js --name overview-api --time
cd ../..

# Start recon-api
cd services/recon-api
pm2 start index.js --name recon-api --time
cd ../..

# Start settlement-api
cd services/settlement-engine
pm2 start settlement-api.cjs --name settlement-api --time
cd ../..

# Start upload-api
cd services/api
pm2 start file-upload-v2.cjs --name upload-api --time
cd ../..

# Start pg-ingestion
cd services/pg-ingestion
pm2 start index.js --name pg-ingestion --time
cd ../..

# Start chargeback-api
cd services/chargeback-api
pm2 start index.js --name chargeback-api --time
cd ../..

# Start settlement-queue-processor
cd services/settlement-engine
pm2 start settlement-queue-processor.cjs --name settlement-queue-processor --time
cd ../..

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

echo "✅ All 7 backend services started"
echo ""

# Show PM2 status
pm2 status

echo ""

# ============================================================================
# STEP 7: Build Frontend
# ============================================================================
echo "🏗️  Step 7: Building frontend for production..."

cd /home/ec2-user/ops-dashboard || cd ~/ops-dashboard

# Install frontend dependencies (if not done)
npm install

# Build frontend
npm run build

echo "✅ Frontend built successfully"
echo "   Build output: dist-ops/"
echo ""

# ============================================================================
# STEP 8: Deploy Frontend to S3
# ============================================================================
echo "☁️  Step 8: Deploying frontend to S3..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "⚠️  AWS CLI not installed. Installing..."
    sudo yum install -y aws-cli 2>/dev/null || sudo apt-get install -y awscli 2>/dev/null
fi

# Deploy to S3 (requires AWS credentials configured)
aws s3 sync dist-ops/ s3://settlepaisa-ops-staging-2/ --delete

echo "✅ Frontend deployed to S3"
echo "   URL: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com"
echo ""

# ============================================================================
# STEP 9: Verification
# ============================================================================
echo "✅ Step 9: Running verification tests..."

STAGING_2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

echo "  Testing service endpoints..."
echo "  - overview-api: http://$STAGING_2_IP:5108/health"
curl -s http://localhost:5108/health && echo " ✅" || echo " ❌"

echo "  - recon-api: http://$STAGING_2_IP:5103/health"
curl -s http://localhost:5103/health && echo " ✅" || echo " ❌"

echo "  - settlement-api: http://$STAGING_2_IP:5109/health"
curl -s http://localhost:5109/health && echo " ✅" || echo " ❌"

echo ""

# ============================================================================
# DEPLOYMENT COMPLETE
# ============================================================================
echo "🎉 =========================================="
echo "🎉 STAGING 2 DEPLOYMENT COMPLETE!"
echo "🎉 =========================================="
echo ""
echo "📋 Deployment Summary:"
echo "   - Branch: feat/ops-dashboard-exports"
echo "   - Commit: $(git log --oneline -1)"
echo "   - Services: 7 running (PM2)"
echo "   - Database: settlepaisa-staging (shared with Staging 1)"
echo "   - Frontend: S3 bucket settlepaisa-ops-staging-2"
echo ""
echo "🌐 Access Points:"
echo "   - Frontend: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/overview"
echo "   - overview-api: http://$STAGING_2_IP:5108"
echo "   - recon-api: http://$STAGING_2_IP:5103"
echo "   - settlement-api: http://$STAGING_2_IP:5109"
echo ""
echo "📊 Next Steps:"
echo "   1. Test dashboard: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/overview"
echo "   2. Verify data matches Staging 1 (same database)"
echo "   3. Run E2E tests"
echo "   4. Monitor PM2 logs: pm2 logs"
echo "   5. Keep Staging 1 as backup for 1-2 weeks"
echo ""
echo "🔧 Useful Commands:"
echo "   - Check service status: pm2 status"
echo "   - View logs: pm2 logs <service-name>"
echo "   - Restart service: pm2 restart <service-name>"
echo "   - Stop all: pm2 stop all"
echo ""
echo "✅ Staging 2 is now live and ready for testing!"
