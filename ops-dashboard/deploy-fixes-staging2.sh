#!/bin/bash
set -e

echo "=========================================="
echo "Deploying Fixes to Staging 2"
echo "Date: $(date)"
echo "=========================================="
echo ""

# EC2 Details
EC2_HOST="ec2-user@52.66.199.215"
KEY_PATH="$HOME/.ssh/staging-2-key.pem"
REMOTE_DIR="/home/ec2-user/ops-dashboard"

echo "Step 1: Copy modified files to EC2..."
scp -i "$KEY_PATH" \
  services/recon-api/jobs/runReconciliation.js \
  "${EC2_HOST}:${REMOTE_DIR}/services/recon-api/jobs/runReconciliation.js"

scp -i "$KEY_PATH" \
  services/api/file-upload-v2.cjs \
  "${EC2_HOST}:${REMOTE_DIR}/services/api/file-upload-v2.cjs"

echo "✅ Files copied"
echo ""

echo "Step 2: Restart services on EC2..."
ssh -i "$KEY_PATH" "$EC2_HOST" << 'REMOTE_COMMANDS'
set -e
cd /home/ec2-user/ops-dashboard

echo "Restarting recon-api..."
pm2 restart recon-api

echo "Restarting upload-api..."
pm2 restart upload-api

echo ""
echo "Service status:"
pm2 list | grep -E "(recon-api|upload-api)"

echo ""
echo "✅ Services restarted"
REMOTE_COMMANDS

echo ""
echo "=========================================="
echo "✅ Deployment complete!"
echo "=========================================="
