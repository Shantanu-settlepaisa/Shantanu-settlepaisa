#!/bin/bash
# Fix Recon API database connection on Staging 2
# Date: October 27, 2025
# Issue: Recon API connects to localhost instead of RDS

set -e

echo "================================"
echo "Fixing Recon API DB Connection"
echo "Staging 2: 52.66.199.215"
echo "================================"
echo ""

# Server details
SERVER="52.66.199.215"
USER="ec2-user"
SSH_KEY="$HOME/.ssh/staging-2-key.pem"
ENV_FILE="/home/ec2-user/ops-dashboard/ops-dashboard/services/overview-api/.env"

echo "Step 1: Backing up current .env file..."
ssh -i ${SSH_KEY} ${USER}@${SERVER} "cp ${ENV_FILE} ${ENV_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
echo "✅ Backup created"
echo ""

echo "Step 2: Updating DB_HOST in .env file..."
ssh -i ${SSH_KEY} ${USER}@${SERVER} "cat > ${ENV_FILE}" << 'EOF'
# Overview API Environment Variables
# Updated: October 27, 2025
# Environment: Staging 2 (EC2 52.66.199.215)

# Server Configuration
PORT=5108
NODE_ENV=production

# Database Configuration - RDS PostgreSQL
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=settlepaisa_v2
DB_USER=postgres
DB_PASSWORD=settlepaisa123

# JWT Authentication
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=7d

# Logging
LOG_LEVEL=info
SERVICE_NAME=overview-api
LOG_DIR=/var/log/ops-dashboard

# CORS - Allow both S3 frontends
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

echo "✅ .env file updated with RDS endpoint"
echo ""

echo "Step 3: Verifying .env file content..."
ssh -i ${SSH_KEY} ${USER}@${SERVER} "grep -E '(DB_HOST|DB_NAME|NODE_ENV)' ${ENV_FILE}"
echo ""

echo "Step 4: Restarting Recon API..."
ssh -i ${SSH_KEY} ${USER}@${SERVER} "pm2 restart recon-api"
echo "✅ Recon API restarted"
echo ""

echo "Step 5: Waiting for service to stabilize (5 seconds)..."
sleep 5
echo ""

echo "Step 6: Checking PM2 logs for DB connection..."
echo "Looking for RDS endpoint in logs..."
ssh -i ${SSH_KEY} ${USER}@${SERVER} "pm2 logs recon-api --lines 20 --nostream" | grep -A 5 "Config.*Environment loaded" || true
echo ""

echo "Step 7: Verifying service status..."
ssh -i ${SSH_KEY} ${USER}@${SERVER} "pm2 list | grep recon-api"
echo ""

echo "================================"
echo "Fix Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Check logs above for 'dbHost: settlepaisa-staging...'"
echo "2. Test file upload via Recon Workspace"
echo "3. Run reconciliation and verify results"
echo ""
echo "To view live logs:"
echo "  ssh ${USER}@${SERVER} 'pm2 logs recon-api'"
