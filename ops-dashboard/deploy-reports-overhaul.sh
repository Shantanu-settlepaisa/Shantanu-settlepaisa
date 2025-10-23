#!/bin/bash
# Reports Overhaul Deployment Script
set -e

STAGING_EC2="ec2-user@13.201.179.44"
S3_BUCKET="s3://shantanu-settlepaisa-ops-staging/"

echo "════════════════════════════════════════════════════════════════"
echo "  Reports Overhaul Deployment to Staging"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# STEP 1: Deploy Backend (Overview API)
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Deploy Backend (Overview API)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Creating backend tarball..."
cd services/overview-api
tar czf overview-api-updated.tar.gz index.js package.json
cd ../..

echo "Uploading backend to EC2..."
scp services/overview-api/overview-api-updated.tar.gz ${STAGING_EC2}:~/

echo "Deploying and restarting backend service..."
ssh ${STAGING_EC2} << 'ENDSSH'
cd ~/overview-api
tar xzf ~/overview-api-updated.tar.gz
pm2 restart overview-api
pm2 logs overview-api --lines 20
ENDSSH

echo "✅ Step 1 Complete: Backend deployed"
echo ""

# ============================================================================
# STEP 2: Build and Deploy Frontend
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Build and Deploy Frontend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Building frontend..."
npm run build:ops

echo "Deploying frontend to S3..."
aws s3 sync dist-ops/ ${S3_BUCKET} --delete --region ap-south-1

echo "✅ Step 2 Complete: Frontend deployed"
echo ""

# ============================================================================
# STEP 3: Test Reports
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3: Test Reports"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Testing Bank MIS endpoint..."
curl -s "http://13.201.179.44:5108/api/reports/bank-mis?from_date=2025-10-09&to_date=2025-10-14" | jq '{success: .success, count: .count}'

echo ""
echo "Testing Recon Outcome endpoint..."
curl -s "http://13.201.179.44:5108/api/reports/recon-outcome?from_date=2025-10-09&to_date=2025-10-14" | jq '{success: .success, count: .count}'

echo ""
echo "Testing Settlement Transactions endpoint..."
curl -s "http://13.201.179.44:5108/api/reports/settlement-transactions?from_date=2025-10-09&to_date=2025-10-14" | jq '{success: .success, count: .count}'

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Deployment Complete!"
echo ""
echo "Access Dashboard: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com"
echo "════════════════════════════════════════════════════════════════"
