#!/bin/bash

# Complete Authentication Verification for Staging 2
# This script tests the FULL authentication flow end-to-end

STAGING_HOST="52.66.199.215"
SSH_KEY="$HOME/.ssh/staging-2-key.pem"
LOGIN_API="http://localhost:5108/api/auth/login"
UPLOAD_API="http://localhost:5107/api/upload/stats"

echo "🔍 STAGING 2 AUTHENTICATION VERIFICATION"
echo "=========================================="
echo ""

echo "Step 1: Check PM2 Services Status"
echo "-----------------------------------"
ssh -i "$SSH_KEY" ec2-user@$STAGING_HOST 'pm2 status | grep -E "(upload-api|overview-api)"'
echo ""

echo "Step 2: Verify JWT_SECRET Match"
echo "--------------------------------"
ssh -i "$SSH_KEY" ec2-user@$STAGING_HOST 'cd /home/ec2-user/ops-dashboard/ops-dashboard/services && echo "Overview API:" && grep "^JWT_SECRET=" overview-api/.env | head -c 60 && echo "..." && echo "Upload API:" && grep "^JWT_SECRET=" api/.env | head -c 60 && echo "..."'
echo ""

echo "Step 3: Get Fresh Login Token"
echo "------------------------------"
TOKEN=$(ssh -i "$SSH_KEY" ec2-user@$STAGING_HOST "curl -s -X POST $LOGIN_API -H 'Content-Type: application/json' -d '{\"email\":\"admin@settlepaisa.com\",\"password\":\"Admin@123\"}'" 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to get token from login API"
    exit 1
fi

echo "✅ Token received (first 50 chars): ${TOKEN:0:50}..."
echo ""

echo "Step 4: Test Upload API with Token"
echo "-----------------------------------"
UPLOAD_RESPONSE=$(ssh -i "$SSH_KEY" ec2-user@$STAGING_HOST "curl -s -X POST $UPLOAD_API -H 'Authorization: Bearer $TOKEN'" 2>/dev/null)
echo "Response: $UPLOAD_RESPONSE"
echo ""

if echo "$UPLOAD_RESPONSE" | grep -q "Invalid token"; then
    echo "❌ FAILED: Upload API rejected the token"
    echo ""
    echo "🔍 Checking upload-api logs..."
    ssh -i "$SSH_KEY" ec2-user@$STAGING_HOST 'pm2 logs upload-api --lines 20 --nostream'
    exit 1
elif echo "$UPLOAD_RESPONSE" | grep -q "success"; then
    echo "✅ SUCCESS: Upload API accepted the token"
    echo ""
    echo "🎉 BACKEND AUTHENTICATION IS WORKING!"
    echo ""
    echo "If users still see 'Invalid token' in browser:"
    echo "1. They need to clear browser localStorage"
    echo "2. Or logout and login again to get fresh token"
    echo "3. Check browser console for errors"
    echo "4. Verify frontend is pointing to correct backend URLs"
else
    echo "⚠️  UNKNOWN RESPONSE from Upload API"
    echo "Response doesn't contain 'Invalid token' or 'success'"
    exit 1
fi
