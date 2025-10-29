#!/bin/bash
# DEPLOYMENT EXECUTION SCRIPT FOR STAGING
# Run this script on your LOCAL machine - it will SSH to EC2 and execute deployment
#
# PREREQUISITES:
# 1. You have the SSH key file (settlepaisa-backend-key.pem)
# 2. The key has correct permissions (chmod 400)
# 3. You can SSH to EC2: ssh -i <key> ec2-user@13.201.179.44
#
# USAGE:
#   ./DEPLOY_TO_STAGING_NOW.sh /path/to/settlepaisa-backend-key.pem

set -e

if [ -z "$1" ]; then
  echo "❌ Error: SSH key path required"
  echo ""
  echo "Usage: $0 /path/to/settlepaisa-backend-key.pem"
  echo ""
  echo "Example:"
  echo "  $0 ~/.ssh/settlepaisa-backend-key.pem"
  exit 1
fi

SSH_KEY="$1"
EC2_HOST="ec2-user@13.201.179.44"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "Phase 1 Deployment to AWS Staging"
echo "=========================================="
echo ""
echo "SSH Key: $SSH_KEY"
echo "EC2 Host: $EC2_HOST"
echo ""

# Verify SSH key exists
if [ ! -f "$SSH_KEY" ]; then
  echo "❌ SSH key not found: $SSH_KEY"
  exit 1
fi

# Verify SSH key permissions
KEY_PERMS=$(stat -f "%A" "$SSH_KEY" 2>/dev/null || stat -c "%a" "$SSH_KEY" 2>/dev/null)
if [ "$KEY_PERMS" != "400" ] && [ "$KEY_PERMS" != "600" ]; then
  echo "⚠️  SSH key has incorrect permissions: $KEY_PERMS"
  echo "Fixing permissions..."
  chmod 400 "$SSH_KEY"
fi

echo "✅ SSH key verified"
echo ""

# Step 1: Copy deployment script to EC2
echo "=== Step 1: Copy deployment script to EC2 ==="
scp -i "$SSH_KEY" deploy-phase1-staging.sh "$EC2_HOST":~/

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Deployment script copied${NC}"
else
  echo "❌ Failed to copy script"
  exit 1
fi

echo ""
echo "=== Step 2: Execute deployment on EC2 ==="
echo "This will take 5-10 minutes..."
echo ""

# Step 2: SSH to EC2 and run deployment script
ssh -i "$SSH_KEY" "$EC2_HOST" << 'ENDSSH'
chmod +x ~/deploy-phase1-staging.sh
~/deploy-phase1-staging.sh
ENDSSH

if [ $? -eq 0 ]; then
  echo ""
  echo "=========================================="
  echo -e "${GREEN}✅ DEPLOYMENT COMPLETED SUCCESSFULLY!${NC}"
  echo "=========================================="
  echo ""
  echo "Next Steps:"
  echo "1. Test from public internet:"
  echo "   curl http://13.201.179.44:5108/health"
  echo ""
  echo "2. Test login:"
  echo "   curl -X POST http://13.201.179.44:5108/api/auth/login \\"
  echo "     -H \"Content-Type: application/json\" \\"
  echo "     -d '{\"email\":\"admin@settlepaisa.com\",\"password\":\"StagingAdmin2025!\"}'"
  echo ""
  echo "3. Monitor logs:"
  echo "   ssh -i $SSH_KEY $EC2_HOST"
  echo "   pm2 logs overview-api"
  echo ""
else
  echo ""
  echo "=========================================="
  echo "❌ DEPLOYMENT FAILED"
  echo "=========================================="
  echo ""
  echo "Troubleshooting:"
  echo "1. SSH to EC2 and check logs:"
  echo "   ssh -i $SSH_KEY $EC2_HOST"
  echo "   pm2 logs overview-api --lines 50"
  echo ""
  echo "2. Check deployment script output above for errors"
  echo ""
  echo "3. Refer to PHASE1_DEPLOYMENT_INSTRUCTIONS.md"
  echo ""
  exit 1
fi
