#!/bin/bash

# Deploy Reconciliation Fix to Staging-2
# Fixes: UTR extraction for AXIS (PRNNo) and BOB (Merchant Track ID) banks
# Date: Oct 29, 2025

set -e

echo "🚀 Deploying Reconciliation Fix to Staging-2"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# EC2 details
EC2_USER="ec2-user"
EC2_HOST="52.66.199.215"
REMOTE_DIR="/home/ec2-user/ops-dashboard"
BRANCH="feat/ops-dashboard-exports"

echo "📝 Summary of Changes:"
echo "   1. Updated runReconciliation.js - Added PRNNo, prnno, merchant_track_id to UTR fallback"
echo "   2. Updated jobRoutes.js - Added top-level matched/unmatched/exceptions fields"
echo ""

# Ask for confirmation
read -p "$(echo -e ${YELLOW}Do you want to proceed with deployment? [y/N]:${NC} )" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo -e "${RED}❌ Deployment cancelled${NC}"
    exit 1
fi

echo ""
echo "📤 Step 1: Pushing changes to GitHub..."
git add services/recon-api/jobs/runReconciliation.js services/recon-api/routes/jobRoutes.js
git commit -m "fix(recon): add UTR extraction support for AXIS (PRNNo) and BOB (Merchant Track ID) banks

- Add PRNNo, prnno, merchant_track_id to bank UTR fallback in runReconciliation.js:981
- Fix API response structure in jobRoutes.js to include top-level matched/unmatched/exceptions fields
- Resolves invariant violation: Total (70) != Sum (0)
- All 50 PG transactions should now match with 50 bank records (30 HDFC + 10 AXIS + 10 BOB)
- Tested with test-recon-fix-oct29.cjs: 50/50 matches confirmed"

git push origin $BRANCH

echo -e "${GREEN}✅ Pushed to GitHub${NC}"
echo ""

echo "🔄 Step 2: Deploying to EC2 (${EC2_HOST})..."
ssh ${EC2_USER}@${EC2_HOST} << 'EOF'
set -e

cd /home/ec2-user/ops-dashboard

echo "  📥 Pulling latest changes..."
git fetch origin
git checkout feat/ops-dashboard-exports
git pull origin feat/ops-dashboard-exports

echo "  🔄 Restarting Recon API..."
pm2 restart recon-api

echo "  ⏳ Waiting for service to stabilize..."
sleep 3

echo "  ✅ Checking PM2 status..."
pm2 list | grep recon-api

echo ""
echo "  ✅ Deployment complete!"
EOF

echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "🧪 Next Steps:"
echo "   1. Go to: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon"
echo "   2. Upload the same 4 CSV files:"
echo "      - test-files-comma-delimiter/pg_transactions.csv (50 records)"
echo "      - test-files-comma-delimiter/hdfc_bank_statements.csv (30 records)"
echo "      - test-files-comma-delimiter/axis_bank_statements.csv (10 records)"
echo "      - test-files-comma-delimiter/bob_bank_statements.csv (10 records)"
echo "   3. Click 'Run Reconciliation'"
echo "   4. Expected result: 50/50 matched (no unmatched_pg)"
echo "   5. No more '[INVARIANT VIOLATION]' errors in console"
echo ""
echo "📊 What Changed:"
echo "   - HDFC UTRs: MERCHANT_TRACKID (already worked)"
echo "   - AXIS UTRs: PRNNo (NOW WORKS - was broken)"
echo "   - BOB UTRs: Merchant Track ID (NOW WORKS - was broken)"
echo ""
