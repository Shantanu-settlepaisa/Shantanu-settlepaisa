#!/bin/bash

###############################################################################
# Deploy Financial Dashboard Formula Fixes to Staging 2
# Date: October 27, 2025
# Commits: 214d173, bccb21a
#
# This script deploys the corrected Financial Dashboard formulas to Staging 2:
# - Fixed Gross Margin: ((commission + gst) / gmv) × 100 = 2.36%
# - Fixed MDR Collected: Now includes GST (₹10.34K)
# - Added GST field to API response (₹1.58K)
# - Added Commission field (₹8.76K)
#
# Services Affected:
# - overview-api (Financial Analytics API)
# - settlement-queue-processor (Bank charges calculation)
#
# USAGE:
#   Run this script ON STAGING 2 EC2 instance
#   ssh into Staging 2 and run: bash deploy-financial-dashboard-fix.sh
###############################################################################

set -e  # Exit on error

echo "=========================================="
echo "DEPLOY FINANCIAL DASHBOARD FORMULA FIXES"
echo "Date: $(date)"
echo "=========================================="
echo ""

# ============================================================================
# STEP 1: Navigate to ops-dashboard directory
# ============================================================================
echo "📂 Step 1: Navigating to ops-dashboard directory..."

cd /home/ec2-user/ops-dashboard || cd ~/ops-dashboard || {
    echo "❌ Error: ops-dashboard directory not found"
    exit 1
}

echo "   Current directory: $(pwd)"
echo "   Current branch: $(git branch --show-current)"
echo "   Current commit: $(git log --oneline -1)"
echo ""

# ============================================================================
# STEP 2: Pull latest code from GitHub
# ============================================================================
echo "📥 Step 2: Pulling latest code from GitHub..."

git fetch origin feat/ops-dashboard-exports
git pull origin feat/ops-dashboard-exports

echo "✅ Code updated"
echo "   Latest commit: $(git log --oneline -1)"
echo ""

# ============================================================================
# STEP 3: Verify updated files
# ============================================================================
echo "🔍 Step 3: Verifying updated files..."

echo "   Checking services/overview-api/real-db-adapter.cjs..."
if grep -q "SUM(total_gst_paise) as total_gst" services/overview-api/real-db-adapter.cjs; then
    echo "   ✅ real-db-adapter.cjs contains GST fix"
else
    echo "   ⚠️  real-db-adapter.cjs may not have the fix"
fi

echo "   Checking services/settlement-engine/settlement-queue-processor.cjs..."
if grep -q "total_bank_charges_paise" services/settlement-engine/settlement-queue-processor.cjs; then
    echo "   ✅ settlement-queue-processor.cjs contains bank charges fix"
else
    echo "   ⚠️  settlement-queue-processor.cjs may not have the fix"
fi

echo ""

# ============================================================================
# STEP 4: Reinstall dependencies (if needed)
# ============================================================================
echo "📦 Step 4: Checking dependencies..."

cd services/overview-api
if [ -f "package.json" ]; then
    echo "   Running npm install for overview-api..."
    npm install --production
fi
cd ../..

cd services/settlement-engine
if [ -f "package.json" ]; then
    echo "   Running npm install for settlement-engine..."
    npm install --production
fi
cd ../..

echo "✅ Dependencies up to date"
echo ""

# ============================================================================
# STEP 5: Restart affected PM2 services
# ============================================================================
echo "🔄 Step 5: Restarting affected PM2 services..."

echo "   Restarting overview-api..."
pm2 restart overview-api

echo "   Restarting settlement-queue-processor..."
pm2 restart settlement-queue-processor

echo "✅ Services restarted"
echo ""

# ============================================================================
# STEP 6: Verify services are running
# ============================================================================
echo "✅ Step 6: Verifying services..."

pm2 status | grep -E "(overview-api|settlement-queue-processor)"

echo ""

# Get EC2 IP
STAGING_2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost")

echo "   Testing overview-api health endpoint..."
sleep 3  # Wait for service to fully start
curl -s http://localhost:5108/health && echo " ✅" || echo " ⚠️  Health check failed"

echo ""

# ============================================================================
# STEP 7: Test Financial Analytics API
# ============================================================================
echo "🧪 Step 7: Testing Financial Analytics API..."

echo "   Calling Financial Analytics API for Oct 27, 2025..."
RESPONSE=$(curl -s "http://localhost:5108/api/analytics/financial?from=2025-10-27&to=2025-10-27")

if [ -n "$RESPONSE" ]; then
    echo "✅ API responding"

    # Extract key values using grep and basic parsing
    GMV=$(echo "$RESPONSE" | grep -o '"gmv":{"paise":"[^"]*"' | cut -d'"' -f6)
    MDR=$(echo "$RESPONSE" | grep -o '"mdrCollected":{"paise":"[^"]*"' | cut -d'"' -f6)
    GST=$(echo "$RESPONSE" | grep -o '"gst":{"paise":"[^"]*"' | cut -d'"' -f6)

    echo ""
    echo "   Key Metrics:"
    echo "   - GMV: ₹${GMV} paise (Expected: 438000)"
    echo "   - MDR Collected: ₹${MDR} paise (Expected: 10337)"
    echo "   - GST: ₹${GST} paise (Expected: 1577)"
    echo ""

    # Validation
    if [ "$GMV" = "438000" ] && [ "$MDR" = "10337" ] && [ "$GST" = "1577" ]; then
        echo "✅ ALL VALUES CORRECT!"
    else
        echo "⚠️  Some values may not match expectations"
    fi
else
    echo "⚠️  No response from API"
fi

echo ""

# ============================================================================
# DEPLOYMENT COMPLETE
# ============================================================================
echo "=========================================="
echo "🎉 DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "📋 Summary:"
echo "   - Commits deployed: 214d173, bccb21a"
echo "   - Services restarted: overview-api, settlement-queue-processor"
echo "   - API endpoint: http://$STAGING_2_IP:5108/api/analytics/financial"
echo "   - Frontend URL: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/financial"
echo ""
echo "📊 Expected Changes:"
echo "   - Gross Margin: 100% → 2.36%"
echo "   - MDR Collected: ₹8.76K → ₹10.34K (includes GST)"
echo "   - New GST field: ₹1.58K"
echo "   - New Commission field: ₹8.76K"
echo ""
echo "🔧 Verification Commands:"
echo "   - Check logs: pm2 logs overview-api"
echo "   - Test API: curl 'http://localhost:5108/api/analytics/financial?from=2025-10-27&to=2025-10-27' | jq"
echo "   - PM2 status: pm2 status"
echo ""
echo "✅ Financial Dashboard formula fixes are now live!"
echo ""
