#!/bin/bash
# Deploy Connector Health Endpoint Fix
# Date: 2025-10-21
# Commit: 8e2b1dc (Add /api/connectors/health endpoint)
#
# INSTRUCTIONS:
# 1. Copy this script to EC2: scp -i <key> deploy-connector-health-fix.sh ec2-user@13.201.179.44:~/
# 2. SSH to EC2: ssh -i <key> ec2-user@13.201.179.44
# 3. Run: chmod +x deploy-connector-health-fix.sh && ./deploy-connector-health-fix.sh

set -e  # Exit on error

echo "=========================================="
echo "Deploying Connector Health Endpoint Fix"
echo "Started: $(date)"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "=== Step 1: Navigate to Project Directory ==="
cd ~/ops-dashboard || { echo "❌ Project directory not found!"; exit 1; }
pwd

echo ""
echo "=== Step 2: Pull Latest Changes ==="
git fetch origin feat/ops-dashboard-exports
git pull origin feat/ops-dashboard-exports

CURRENT_COMMIT=$(git log -1 --oneline | awk '{print $1}')
echo "Current commit: $CURRENT_COMMIT"

# Verify the fix is present
if grep -q "/api/connectors/health" services/overview-api/index.js; then
  echo -e "${GREEN}✅ Connector health endpoint found in code${NC}"
else
  echo "❌ Endpoint not found! Check if correct branch is pulled."
  exit 1
fi

echo ""
echo "=== Step 3: Restart overview-api Service ==="
pm2 restart overview-api

echo "Waiting for service to start..."
sleep 3

echo -e "\nService status:"
pm2 list | grep overview-api

echo -e "\nRecent logs (last 10 lines):"
pm2 logs overview-api --lines 10 --nostream | tail -10

echo ""
echo "=== Step 4: Test Connector Health Endpoint ==="

# Test the new endpoint
echo "Testing GET /api/connectors/health..."
RESPONSE=$(curl -s http://localhost:5108/api/connectors/health)
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q "connectors"; then
  echo -e "${GREEN}✅ Connector health endpoint working!${NC}"
else
  echo "❌ Endpoint test failed"
  exit 1
fi

echo ""
echo "=== Step 5: Test Public Access ==="
echo "Testing from public IP..."
PUBLIC_RESPONSE=$(curl -s http://13.201.179.44:5108/api/connectors/health)
echo "$PUBLIC_RESPONSE" | jq . 2>/dev/null || echo "$PUBLIC_RESPONSE"

if echo "$PUBLIC_RESPONSE" | grep -q "connectors"; then
  echo -e "${GREEN}✅ Public access confirmed!${NC}"
else
  echo -e "${YELLOW}⚠️  Public access may have issues${NC}"
fi

echo ""
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✅ Code pulled (commit $CURRENT_COMMIT)"
echo "  ✅ overview-api restarted"
echo "  ✅ /api/connectors/health endpoint verified"
echo ""
echo "Public endpoint:"
echo "  http://13.201.179.44:5108/api/connectors/health"
echo ""
echo "Completed at: $(date)"
echo "=========================================="
