#!/bin/bash
set -e

echo "=========================================="
echo "Deploying Financial API Fix to Staging 2"
echo "Date: $(date)"
echo "=========================================="
echo ""

# EC2 Details
EC2_HOST="ec2-user@52.66.199.215"
KEY_PATH="$HOME/.ssh/staging-2-key.pem"
REMOTE_DIR="/home/ec2-user/ops-dashboard"

echo "Fix: Add transaction_date filtering support to Financial API"
echo "  Files:"
echo "    - services/overview-api/real-db-adapter.cjs (getFinancialAnalytics function)"
echo "    - services/overview-api/index.js (API endpoint)"
echo ""

echo "Step 1: Copy fixed files to EC2..."
scp -i "$KEY_PATH" \
  services/overview-api/real-db-adapter.cjs \
  "${EC2_HOST}:${REMOTE_DIR}/services/overview-api/real-db-adapter.cjs"

scp -i "$KEY_PATH" \
  services/overview-api/index.js \
  "${EC2_HOST}:${REMOTE_DIR}/services/overview-api/index.js"

echo "✅ Files copied"
echo ""

echo "Step 2: Restart overview-api service on EC2..."
ssh -i "$KEY_PATH" "$EC2_HOST" << 'REMOTE_COMMANDS'
set -e
cd /home/ec2-user/ops-dashboard

echo "Restarting overview-api..."
pm2 restart overview-api

echo ""
echo "Service status:"
pm2 list | grep overview-api

echo ""
echo "Checking logs for startup..."
pm2 logs overview-api --lines 10 --nostream

echo ""
echo "✅ overview-api restarted"
REMOTE_COMMANDS

echo ""
echo "=========================================="
echo "✅ Deployment complete!"
echo "=========================================="
echo ""
echo "📝 Test the new functionality:"
echo ""
echo "1. Test cycle_date filtering (default, existing behavior):"
echo "   curl \"http://52.66.199.215:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28\""
echo ""
echo "2. Test transaction_date filtering (new feature):"
echo "   curl \"http://52.66.199.215:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28&transactionFrom=2025-10-28&transactionTo=2025-10-28\""
echo ""
echo "Expected: Both should return GMV ≈ ₹2.2L (same data, different filter approaches)"
echo ""
