#!/bin/bash

# Deploy Upload API Database Fix to Staging 2
# This script deploys the critical fix that forces upload API to use RDS database

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Deploying Upload API Database Fix"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: SSH to EC2 and deploy
echo "🔧 Deploying to EC2 (52.66.199.215)..."
echo ""

ssh ec2-user@52.66.199.215 << 'EOF'
  cd /home/ec2-user/ops-dashboard

  echo "📥 Pulling latest code..."
  git fetch origin feat/ops-dashboard-exports
  git reset --hard origin/feat/ops-dashboard-exports

  echo ""
  echo "🔄 Restarting upload-api..."
  pm2 delete upload-api 2>/dev/null || true
  pm2 start services/api/ecosystem.config.upload-api.js

  echo ""
  echo "⏳ Waiting 3 seconds for service to start..."
  sleep 3

  echo ""
  echo "📊 Checking upload-api status..."
  pm2 status | grep upload-api

  echo ""
  echo "📋 Checking upload-api logs (last 20 lines)..."
  pm2 logs upload-api --lines 20 --nostream

  echo ""
  echo "✅ Deployment complete!"
  echo ""
  echo "🔍 IMPORTANT: Check the logs above for this line:"
  echo "   [Upload API] Database config: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2"
  echo ""
  echo "   If you see 'localhost' instead, the fix didn't work."
  echo ""
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment script complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Verify the log shows RDS hostname (not localhost)"
echo "   2. Clear test data from database"
echo "   3. Re-upload all 4 CSV files"
echo "   4. Run reconciliation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
