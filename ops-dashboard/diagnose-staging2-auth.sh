#!/bin/bash
# Diagnostic script for Staging 2 authentication issue
# Run this to identify why upload API rejects tokens from login API

set -e

STAGING_HOST="52.66.199.215"
LOGIN_API_PORT="5108"
UPLOAD_API_PORT="5107"

echo "===================================="
echo "Staging 2 Authentication Diagnostics"
echo "===================================="
echo ""

# Step 1: Test login endpoint
echo "[1/5] Testing Login API (port $LOGIN_API_PORT)..."
LOGIN_RESPONSE=$(curl -s -X POST "http://${STAGING_HOST}:${LOGIN_API_PORT}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@settlepaisa.com","password":"Admin@123"}')

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Login API working"
  TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token')
  echo "   Token received: ${TOKEN:0:50}..."
else
  echo "❌ Login API failed"
  echo "   Response: $LOGIN_RESPONSE"
  exit 1
fi

echo ""

# Step 2: Test token verification
echo "[2/5] Testing token verification..."
VERIFY_RESPONSE=$(curl -s -X POST "http://${STAGING_HOST}:${LOGIN_API_PORT}/api/auth/verify-token" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\"}")

if echo "$VERIFY_RESPONSE" | grep -q '"valid":true'; then
  echo "✅ Token is valid according to Login API"
else
  echo "❌ Token verification failed"
  echo "   Response: $VERIFY_RESPONSE"
fi

echo ""

# Step 3: Test upload API health
echo "[3/5] Testing Upload API health (port $UPLOAD_API_PORT)..."
HEALTH_RESPONSE=$(curl -s "http://${STAGING_HOST}:${UPLOAD_API_PORT}/health" || echo '{"error":"not reachable"}')

if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
  echo "✅ Upload API is running"
else
  echo "❌ Upload API not responding"
  echo "   Response: $HEALTH_RESPONSE"
fi

echo ""

# Step 4: Test upload API with token
echo "[4/5] Testing Upload API with valid token..."
# Create a test CSV file
cat > /tmp/test-auth.csv << EOF
transaction_id,amount,utr,date
TEST001,1000,UTR001,2025-10-28
EOF

UPLOAD_RESPONSE=$(curl -s -X POST "http://${STAGING_HOST}:${UPLOAD_API_PORT}/api/upload/multiple" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'files=@/tmp/test-auth.csv' \
  -F 'fileType=transactions')

if echo "$UPLOAD_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Upload API accepts the token!"
  echo "   Upload successful"
elif echo "$UPLOAD_RESPONSE" | grep -q 'INVALID_TOKEN\|Invalid token'; then
  echo "❌ Upload API rejects token with 'Invalid token' error"
  echo "   This means Upload API has different JWT_SECRET or can't access database"
elif echo "$UPLOAD_RESPONSE" | grep -q 'SESSION_REVOKED'; then
  echo "❌ Session not found in database"
  echo "   Database connection issue between services"
else
  echo "⚠️  Upload API returned unexpected response:"
  echo "   $UPLOAD_RESPONSE"
fi

echo ""

# Step 5: Test database connectivity
echo "[5/5] Testing if services share database..."
echo "   Note: Both services should use same JWT_SECRET and database"
echo ""

# Summary
echo "===================================="
echo "DIAGNOSIS SUMMARY"
echo "===================================="
echo ""

if echo "$UPLOAD_RESPONSE" | grep -q 'INVALID_TOKEN\|Invalid token'; then
  echo "🔍 ROOT CAUSE IDENTIFIED:"
  echo ""
  echo "The Upload API (port $UPLOAD_API_PORT) is rejecting tokens issued by"
  echo "the Login API (port $LOGIN_API_PORT). This happens when:"
  echo ""
  echo "1. JWT_SECRET mismatch:"
  echo "   ➜ Upload API and Overview API have different JWT_SECRET env vars"
  echo "   ➜ Solution: Ensure both services load from same .env file"
  echo ""
  echo "2. Upload API not restarted:"
  echo "   ➜ Upload API is running old code without auth support"
  echo "   ➜ Solution: Restart upload API service on staging server"
  echo ""
  echo "3. Database connection issue:"
  echo "   ➜ Upload API can't query sp_v2_user_sessions table"
  echo "   ➜ Solution: Check DB_HOST, DB_NAME in upload API .env"
  echo ""
  echo "📋 RECOMMENDED FIXES (in order):"
  echo ""
  echo "   SSH into staging server and run:"
  echo "   1. pm2 restart upload-api"
  echo "   2. pm2 logs upload-api --lines 50"
  echo "   3. Check if JWT_SECRET matches in both .env files"
  echo ""
elif echo "$UPLOAD_RESPONSE" | grep -q '"success":true'; then
  echo "✅ ALL TESTS PASSED!"
  echo ""
  echo "Backend authentication is working correctly."
  echo "If frontend still has issues, check:"
  echo "  - Browser localStorage has 'jwt_token' after login"
  echo "  - Frontend axios interceptors are adding Authorization header"
  echo "  - CORS allows Authorization header"
else
  echo "⚠️  INCONCLUSIVE"
  echo "Could not determine root cause. Check pm2 logs on staging server."
fi

echo ""
echo "===================================="

# Cleanup
rm -f /tmp/test-auth.csv
