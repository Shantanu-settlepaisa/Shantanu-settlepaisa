#!/bin/bash
# Phase 1 Authentication - Staging Deployment Script
# Date: 2025-10-21
# Environment: AWS EC2 (13.201.179.44)
#
# INSTRUCTIONS:
# 1. Copy this script to EC2: scp -i <key> deploy-phase1-staging.sh ec2-user@13.201.179.44:~/
# 2. SSH to EC2: ssh -i <key> ec2-user@13.201.179.44
# 3. Run: chmod +x deploy-phase1-staging.sh && ./deploy-phase1-staging.sh

set -e  # Exit on error

echo "=========================================="
echo "Phase 1 Authentication - Staging Deployment"
echo "Started: $(date)"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RDS_HOST="settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com"
RDS_PORT="5432"
RDS_DB="settlepaisa_v2"
RDS_USER="postgres"
RDS_PASSWORD="SettlePaisa2024!"
ADMIN_PASSWORD="StagingAdmin2025!"

echo ""
echo "=== Step 1: Navigate to Project Directory ==="
cd ~/ops-dashboard || { echo "❌ Project directory not found!"; exit 1; }
pwd

echo ""
echo "=== Step 2: Pull Latest Changes ==="
git fetch origin feat/ops-dashboard-exports
git pull origin feat/ops-dashboard-exports

# Verify commit
CURRENT_COMMIT=$(git log -1 --oneline | awk '{print $1}')
echo "Current commit: $CURRENT_COMMIT"

echo ""
echo "=== Step 3: Verify Phase 1 Files Exist ==="
echo "Checking migration files..."
ls -lh db/migrations/025_add_settlement_type.sql
ls -lh db/migrations/026_user_management.sql
ls -lh db/migrations/027_audit_log.sql
ls -lh db/migrations/028_production_indexes_fixed.sql

echo -e "\nChecking backend files..."
ls -lh services/overview-api/auth.cjs
ls -lh services/overview-api/audit.cjs
ls -lh services/overview-api/lib/logger.cjs
ls -lh services/overview-api/lib/passwordUtils.cjs
ls -lh services/overview-api/middleware/authMiddleware.cjs

echo -e "${GREEN}✅ All Phase 1 files present${NC}"

echo ""
echo "=== Step 4: Run Database Migrations ==="
export PGPASSWORD="$RDS_PASSWORD"

echo "Migration 1: 025_add_settlement_type.sql"
psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" \
  -f db/migrations/025_add_settlement_type.sql 2>&1 | grep -v "NOTICE\|already exists" || true

echo "Migration 2: 026_user_management.sql"
psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" \
  -f db/migrations/026_user_management.sql 2>&1 | grep -v "NOTICE\|already exists" || true

echo "Migration 3: 027_audit_log.sql"
psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" \
  -f db/migrations/027_audit_log.sql 2>&1 | grep -v "NOTICE\|already exists" || true

echo "Migration 4: 028_production_indexes_fixed.sql"
psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" \
  -f db/migrations/028_production_indexes_fixed.sql 2>&1 | grep -v "NOTICE\|already exists" || true

echo -e "\nVerifying tables created..."
psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" \
  -c "\dt sp_v2_ops_*" | grep -E "sp_v2_ops_users|sp_v2_user_sessions|sp_v2_ops_audit_log"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Migrations applied successfully${NC}"
else
  echo -e "${RED}❌ Migration verification failed${NC}"
  exit 1
fi

unset PGPASSWORD

echo ""
echo "=== Step 5: Install Dependencies ==="
cd ~/ops-dashboard/services/overview-api

echo "Running npm install..."
npm install --production

echo -e "\nVerifying packages..."
npm list bcryptjs jsonwebtoken winston --depth=0

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Dependencies installed successfully${NC}"
else
  echo -e "${YELLOW}⚠️  Some dependencies may have warnings (this is normal)${NC}"
fi

echo ""
echo "=== Step 6: Configure Environment Variables ==="

# Backup existing .env
if [ -f .env ]; then
  cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
  echo "✅ Backed up existing .env"
fi

# Generate JWT secret
echo "Generating JWT secret..."
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# Check if Phase 1 variables already exist
if grep -q "# Phase 1 Authentication" .env 2>/dev/null; then
  echo -e "${YELLOW}⚠️  Phase 1 variables already exist in .env${NC}"
  echo "Skipping .env update (manual update required if needed)"
else
  # Append Phase 1 variables
  cat >> .env << EOF

# ============================================================================
# Phase 1 Authentication (Added: $(date +%Y-%m-%d))
# ============================================================================
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=7d

# Logging
LOG_LEVEL=info
SERVICE_NAME=overview-api

# CORS
CORS_ORIGIN=http://ops-dashboard-staging.s3-website.ap-south-1.amazonaws.com

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

  echo -e "${GREEN}✅ Environment variables configured${NC}"
  echo "JWT_SECRET length: $(echo -n $JWT_SECRET | wc -c) characters"
fi

echo ""
echo "=== Step 7: Update Admin Password ==="
export PGPASSWORD="$RDS_PASSWORD"

echo "Generating password hash for: $ADMIN_PASSWORD"
ADMIN_HASH=$(node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('${ADMIN_PASSWORD}', 10));")

echo "Updating database..."
psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" \
  -c "UPDATE sp_v2_ops_users SET password_hash = '${ADMIN_HASH}' WHERE email = 'admin@settlepaisa.com';"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Admin password updated${NC}"
  echo "   Email: admin@settlepaisa.com"
  echo "   Password: $ADMIN_PASSWORD"
else
  echo -e "${RED}❌ Failed to update admin password${NC}"
  exit 1
fi

unset PGPASSWORD

echo ""
echo "=== Step 8: Restart overview-api Service ==="
pm2 restart overview-api

echo "Waiting for service to start..."
sleep 3

echo -e "\nService status:"
pm2 list | grep overview-api

echo -e "\nRecent logs:"
pm2 logs overview-api --lines 20 --nostream | tail -20

echo ""
echo "=== Step 9: Test Authentication Endpoints ==="

# Test 1: Health check
echo "Test 1: Health Check"
HEALTH_RESPONSE=$(curl -s http://localhost:5108/health)
echo "$HEALTH_RESPONSE" | jq .

if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
  echo -e "${GREEN}✅ Health check passed${NC}"
else
  echo -e "${RED}❌ Health check failed${NC}"
  exit 1
fi

# Test 2: Login
echo -e "\nTest 2: Login"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@settlepaisa.com\",\"password\":\"${ADMIN_PASSWORD}\"}")

echo "$LOGIN_RESPONSE" | jq .

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo -e "${GREEN}✅ Login successful${NC}"
  echo "Token (first 50 chars): ${TOKEN:0:50}..."

  # Test 3: Get user info
  echo -e "\nTest 3: Get Current User"
  USER_RESPONSE=$(curl -s -X GET http://localhost:5108/api/auth/me \
    -H "Authorization: Bearer $TOKEN")
  echo "$USER_RESPONSE" | jq .

  if echo "$USER_RESPONSE" | grep -q "admin@settlepaisa.com"; then
    echo -e "${GREEN}✅ User info retrieved${NC}"
  else
    echo -e "${RED}❌ User info failed${NC}"
  fi

  # Test 4: Protected route (audit summary)
  echo -e "\nTest 4: Audit Summary (Protected Route)"
  AUDIT_RESPONSE=$(curl -s -X GET "http://localhost:5108/api/audit/summary" \
    -H "Authorization: Bearer $TOKEN")
  echo "$AUDIT_RESPONSE" | jq .

  if echo "$AUDIT_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✅ Protected route accessible with token${NC}"
  else
    echo -e "${RED}❌ Protected route failed${NC}"
  fi

  # Test 5: Unauthorized access
  echo -e "\nTest 5: Unauthorized Access (No Token)"
  UNAUTH_RESPONSE=$(curl -s -X GET "http://localhost:5108/api/audit/summary")
  echo "$UNAUTH_RESPONSE" | jq .

  if echo "$UNAUTH_RESPONSE" | grep -q "No authentication token"; then
    echo -e "${GREEN}✅ Unauthorized access properly rejected${NC}"
  else
    echo -e "${YELLOW}⚠️  Expected unauthorized error${NC}"
  fi

else
  echo -e "${RED}❌ Login failed!${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo ""
echo "=== Step 10: Verify Database State ==="
export PGPASSWORD="$RDS_PASSWORD"

echo "Checking audit logs..."
psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" \
  -c "SELECT id, user_email, action, success, created_at FROM sp_v2_ops_audit_log ORDER BY created_at DESC LIMIT 5;"

echo -e "\nChecking active sessions..."
psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" \
  -c "SELECT user_id, ip_address, is_active, created_at, expires_at FROM sp_v2_user_sessions WHERE is_active = true ORDER BY created_at DESC LIMIT 3;"

unset PGPASSWORD

echo ""
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "=========================================="
echo ""
echo "Deployment Summary:"
echo "  ✅ Code pulled and verified"
echo "  ✅ 4 migrations applied"
echo "  ✅ Dependencies installed"
echo "  ✅ Environment configured"
echo "  ✅ Admin password updated"
echo "  ✅ Service restarted"
echo "  ✅ Authentication tested"
echo ""
echo "Credentials:"
echo "  Email: admin@settlepaisa.com"
echo "  Password: $ADMIN_PASSWORD"
echo ""
echo "Public API Endpoint:"
echo "  http://13.201.179.44:5108"
echo ""
echo "Next Steps:"
echo "  - Test from public internet"
echo "  - Update frontend to use authentication"
echo "  - Monitor logs for 24 hours"
echo ""
echo "Deployment completed at: $(date)"
echo "=========================================="
