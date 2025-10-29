#!/bin/bash
set -e

echo "=========================================="
echo "Deploying Reports API Fix to Staging 2"
echo "Date: $(date)"
echo "=========================================="
echo ""

# EC2 Details
EC2_HOST="ec2-user@52.66.199.215"
KEY_PATH="$HOME/.ssh/staging-2-key.pem"
REMOTE_DIR="/home/ec2-user/ops-dashboard"

echo "Fix: Recon Outcome JOIN condition"
echo "  File: services/overview-api/index.js"
echo "  Line 275: t.id::TEXT → t.transaction_id"
echo ""

echo "Step 1: Copy fixed overview-api to EC2..."
scp -i "$KEY_PATH" \
  services/overview-api/index.js \
  "${EC2_HOST}:${REMOTE_DIR}/services/overview-api/index.js"

echo "✅ File copied"
echo ""

echo "Step 2: Restart overview-api service on EC2..."
ssh -i "$KEY_PATH" "$EC2_HOST" << 'REMOTE_COMMANDS'
set -e
cd /home/ec2-user/ops-dashboard

echo "Restarting overview-api..."
pm2 restart overview-api || pm2 start services/overview-api/index.js --name overview-api

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
echo "📝 Next Steps:"
echo "1. Test Recon Outcome tab at:"
echo "   http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/reports"
echo ""
echo "2. Filter by Cycle Date: 28/10/2025"
echo "   Expected: 10 records with status 'MATCHED'"
echo ""
echo "3. Test Bank MIS tab:"
echo "   Filter by Cycle Date: 28/10/2025"
echo "   Expected: 20 bank statements"
echo ""
