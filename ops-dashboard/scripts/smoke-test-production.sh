#!/bin/bash
# Production Smoke Test Script for SettlePaisa Ops Dashboard
# Tests critical endpoints after deployment

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="https://settlepaisaopsapi.sabpaisa.in"
CLOUDFRONT_URL="https://settlepaisaops.sabpaisa.in"
TIMEOUT=10

echo "=================================="
echo "Production Smoke Tests"
echo "=================================="
echo ""
echo "Base URL: $BASE_URL"
echo "Frontend: $CLOUDFRONT_URL"
echo ""

# Counter for failures
FAILURES=0

# Function to test endpoint
test_endpoint() {
  local endpoint=$1
  local expected_status=$2
  local description=$3

  echo -n "Testing $description... "

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m $TIMEOUT "$BASE_URL$endpoint" 2>&1 || echo "000")

  if [ "$STATUS" = "$expected_status" ]; then
    echo -e "${GREEN}✅ PASS${NC} (HTTP $STATUS)"
  else
    echo -e "${RED}❌ FAIL${NC} (Expected $expected_status, got $STATUS)"
    FAILURES=$((FAILURES + 1))
  fi
}

# Function to test frontend file
test_frontend_file() {
  local file=$1
  local description=$2

  echo -n "Testing $description... "

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m $TIMEOUT "$CLOUDFRONT_URL/$file" 2>&1 || echo "000")

  if [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
  else
    echo -e "${RED}❌ FAIL${NC} (HTTP $STATUS)"
    FAILURES=$((FAILURES + 1))
  fi
}

# Function to check for specific content
test_content() {
  local url=$1
  local search_string=$2
  local description=$3

  echo -n "Checking $description... "

  CONTENT=$(curl -s -m $TIMEOUT "$url" 2>&1 || echo "")

  if echo "$CONTENT" | grep -q "$search_string"; then
    echo -e "${GREEN}✅ PASS${NC}"
  else
    echo -e "${RED}❌ FAIL${NC} (Content not found)"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "🔧 Backend API Tests"
echo "-----------------------------------"
echo ""

# Test backend endpoints
# Note: Many require authentication, so we expect 401/403, not 404
test_endpoint "/api/overview" "401" "Overview API"
test_endpoint "/api/upload/health" "404" "Upload API (health endpoint may not exist)"
test_endpoint "/api/recon/health" "404" "Recon API (health endpoint may not exist)"
test_endpoint "/api/settlement" "401" "Settlement API"
test_endpoint "/api/auth/health" "404" "Auth API"

echo ""
echo "🌐 Frontend Tests"
echo "-----------------------------------"
echo ""

# Test frontend files
test_frontend_file "" "Frontend index.html"
test_content "$CLOUDFRONT_URL" "SettlePaisa - Operations Dashboard" "Frontend title"
test_content "$CLOUDFRONT_URL" "settlepaisaopsapi.sabpaisa.in" "Frontend has correct API URL"

echo ""
echo "🔍 URL Validation Tests"
echo "-----------------------------------"
echo ""

# Check for common URL issues in deployed frontend
echo -n "Checking for localhost URLs in frontend... "
LOCALHOST_CHECK=$(curl -s "$CLOUDFRONT_URL" 2>&1 | grep -o "http://localhost" | wc -l | tr -d ' ')
if [ "$LOCALHOST_CHECK" -eq 0 ]; then
  echo -e "${GREEN}✅ PASS${NC}"
else
  echo -e "${RED}❌ FAIL${NC} (Found $LOCALHOST_CHECK localhost references)"
  FAILURES=$((FAILURES + 1))
fi

echo -n "Checking for staging URLs in frontend... "
STAGING_CHECK=$(curl -s "$CLOUDFRONT_URL" 2>&1 | grep -o "52.66.199.215" | wc -l | tr -d ' ')
if [ "$STAGING_CHECK" -eq 0 ]; then
  echo -e "${GREEN}✅ PASS${NC}"
else
  echo -e "${RED}❌ FAIL${NC} (Found $STAGING_CHECK staging references)"
  FAILURES=$((FAILURES + 1))
fi

echo ""
echo "📦 CloudFront Cache Tests"
echo "-----------------------------------"
echo ""

# Check CloudFront headers
echo -n "Checking CloudFront cache status... "
CACHE_STATUS=$(curl -s -I "$CLOUDFRONT_URL" | grep -i "x-cache:" | awk '{print $2}' | tr -d '\r\n')
if [ -n "$CACHE_STATUS" ]; then
  if [[ "$CACHE_STATUS" == *"Hit"* ]]; then
    echo -e "${GREEN}✅ PASS${NC} (Cache: $CACHE_STATUS - serving cached content)"
  elif [[ "$CACHE_STATUS" == *"Miss"* ]]; then
    echo -e "${YELLOW}⚠️  WARN${NC} (Cache: $CACHE_STATUS - not cached yet, will be cached soon)"
  else
    echo -e "${GREEN}✅ INFO${NC} (Cache: $CACHE_STATUS)"
  fi
else
  echo -e "${YELLOW}⚠️  WARN${NC} (No CloudFront cache header found)"
fi

echo -n "Checking CloudFront age... "
AGE=$(curl -s -I "$CLOUDFRONT_URL" | grep -i "age:" | awk '{print $2}' | tr -d '\r\n')
if [ -n "$AGE" ]; then
  if [ "$AGE" -lt 300 ]; then
    echo -e "${GREEN}✅ PASS${NC} (Age: ${AGE}s - recently updated)"
  else
    echo -e "${YELLOW}⚠️  WARN${NC} (Age: ${AGE}s - may be serving old content)"
    echo "   Consider invalidating CloudFront cache:"
    echo "   aws cloudfront create-invalidation --distribution-id E2HM34NGEJZOL6 --paths \"/*\""
  fi
else
  echo -e "${YELLOW}⚠️  WARN${NC} (No age header - cache may be bypassed)"
fi

echo ""
echo "=================================="
echo "Test Summary"
echo "=================================="
echo ""

if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  echo ""
  echo "Production deployment appears healthy!"
  echo ""
  echo "Next steps:"
  echo "  1. Test manual workflows in the UI"
  echo "  2. Try uploading files and running reconciliation"
  echo "  3. Monitor logs: ssh production 'pm2 logs'"
  exit 0
else
  echo -e "${RED}❌ $FAILURES TEST(S) FAILED${NC}"
  echo ""
  echo "Some tests failed. Common issues:"
  echo ""
  echo "1. If backend APIs show 404 instead of 401:"
  echo "   - Check Nginx routing: ssh production 'sudo cat /etc/nginx/conf.d/settlepaisa-ops-api.conf'"
  echo "   - Verify PM2 services running: ssh production 'pm2 status'"
  echo ""
  echo "2. If frontend has localhost/staging URLs:"
  echo "   - Rebuild with correct .env: npm run build:production-ops"
  echo "   - Redeploy to S3 and invalidate CloudFront"
  echo ""
  echo "3. If CloudFront age is high:"
  echo "   - Invalidate cache: aws cloudfront create-invalidation --distribution-id E2HM34NGEJZOL6 --paths \"/*\""
  echo ""
  echo "See docs/API_URL_STANDARDS.md for more details"
  exit 1
fi
