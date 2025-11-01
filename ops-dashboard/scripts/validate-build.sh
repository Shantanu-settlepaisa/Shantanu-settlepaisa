#!/bin/bash
# Build Validation Script for SettlePaisa Ops Dashboard
# Validates that dist-ops/ has correct URLs and no common errors

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================="
echo "Build Validation Script"
echo "=================================="
echo ""

# Check if dist-ops exists
if [ ! -d "dist-ops" ]; then
  echo -e "${RED}❌ ERROR: dist-ops/ directory not found${NC}"
  echo "   Run 'npm run build:production-ops' first"
  exit 1
fi

echo "📂 Checking dist-ops/ directory..."

# Counter for errors
ERRORS=0

# Check 1: No localhost URLs (excluding safe fallbacks in ternary operators)
echo ""
echo "1️⃣  Checking for localhost URLs..."
# Look for hardcoded localhost URLs, excluding || fallback patterns
HARDCODED_LOCALHOST=$(grep -r "http://localhost" dist-ops/ 2>/dev/null | grep -v "||.*http://localhost" | grep -v "env.*http://localhost" || true)
if [ -n "$HARDCODED_LOCALHOST" ]; then
  echo -e "${RED}❌ FAIL: Found hardcoded localhost URLs in build${NC}"
  echo "   These files contain localhost:"
  echo "$HARDCODED_LOCALHOST" | head -5
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ PASS: No hardcoded localhost URLs found${NC}"
  echo "   (Environment variable fallbacks are OK)"
fi

# Check 2: No staging URLs
echo ""
echo "2️⃣  Checking for staging URLs (52.66.199.215)..."
if grep -r "52\.66\.199\.215" dist-ops/ >/dev/null 2>&1; then
  echo -e "${RED}❌ FAIL: Found staging URLs in build${NC}"
  echo "   These files contain staging URLs:"
  grep -r "52\.66\.199\.215" dist-ops/ | head -5
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ PASS: No staging URLs found${NC}"
fi

# Check 3: Production domain present
echo ""
echo "3️⃣  Checking for production domain..."
if grep -r "settlepaisaopsapi.sabpaisa.in" dist-ops/ >/dev/null 2>&1; then
  echo -e "${GREEN}✅ PASS: Production domain found in build${NC}"
else
  echo -e "${RED}❌ FAIL: Production domain NOT found${NC}"
  echo "   Build may not be using production environment"
  ERRORS=$((ERRORS + 1))
fi

# Check 4: No duplicate /api/upload paths
echo ""
echo "4️⃣  Checking for duplicate /api/upload paths..."
if grep -r "/api/upload/api/upload" dist-ops/ >/dev/null 2>&1; then
  echo -e "${RED}❌ FAIL: Found duplicate /api/upload paths${NC}"
  echo "   This indicates .env has path prefixes (should be domain only)"
  grep -r "/api/upload/api/upload" dist-ops/ | head -3
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ PASS: No duplicate /api/upload paths${NC}"
fi

# Check 5: No duplicate /api/recon paths
echo ""
echo "5️⃣  Checking for duplicate /api/recon paths..."
if grep -r "/api/recon/api/recon" dist-ops/ >/dev/null 2>&1; then
  echo -e "${RED}❌ FAIL: Found duplicate /api/recon paths${NC}"
  echo "   This indicates .env has path prefixes (should be domain only)"
  grep -r "/api/recon/api/recon" dist-ops/ | head -3
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ PASS: No duplicate /api/recon paths${NC}"
fi

# Check 6: No duplicate /api/overview paths
echo ""
echo "6️⃣  Checking for duplicate /api/overview paths..."
if grep -r "/api/overview/api/overview" dist-ops/ >/dev/null 2>&1; then
  echo -e "${RED}❌ FAIL: Found duplicate /api/overview paths${NC}"
  echo "   This indicates .env has path prefixes (should be domain only)"
  grep -r "/api/overview/api/overview" dist-ops/ | head -3
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ PASS: No duplicate /api/overview paths${NC}"
fi

# Check 7: index.html exists
echo ""
echo "7️⃣  Checking for index.html..."
if [ -f "dist-ops/index.html" ]; then
  echo -e "${GREEN}✅ PASS: index.html found${NC}"
else
  echo -e "${RED}❌ FAIL: index.html not found${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Check 8: Assets directory exists and has files
echo ""
echo "8️⃣  Checking assets directory..."
if [ -d "dist-ops/assets" ]; then
  ASSET_COUNT=$(find dist-ops/assets -type f | wc -l | tr -d ' ')
  if [ "$ASSET_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS: Found $ASSET_COUNT assets${NC}"
  else
    echo -e "${RED}❌ FAIL: Assets directory is empty${NC}"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo -e "${RED}❌ FAIL: Assets directory not found${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Check 9: JavaScript files have correct recon timeout
echo ""
echo "9️⃣  Checking recon service timeout (should be 300000ms)..."
if grep -r "timeout.*3e5" dist-ops/assets/recon-service-*.js >/dev/null 2>&1; then
  echo -e "${GREEN}✅ PASS: Recon timeout set to 300000ms (5 minutes)${NC}"
elif grep -r "timeout.*30000" dist-ops/assets/recon-service-*.js >/dev/null 2>&1; then
  echo -e "${RED}❌ FAIL: Recon timeout still at 30000ms (30 seconds)${NC}"
  echo "   Should be 300000ms to match Nginx timeout"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${YELLOW}⚠️  WARN: Could not verify recon timeout${NC}"
fi

# Summary
echo ""
echo "=================================="
echo "Validation Summary"
echo "=================================="

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
  echo ""
  echo "Build is ready for deployment to production:"
  echo "  aws s3 sync dist-ops/ s3://settlepaisa-ops-production/ --delete"
  echo "  aws cloudfront create-invalidation --distribution-id E2HM34NGEJZOL6 --paths \"/*\""
  exit 0
else
  echo -e "${RED}❌ $ERRORS CHECK(S) FAILED${NC}"
  echo ""
  echo "Please fix the issues above before deploying."
  echo ""
  echo "Common fixes:"
  echo "  1. Check .env.production-ops - should have ONLY base domain URLs"
  echo "  2. Rebuild: rm -rf dist-ops && npm run build:production-ops"
  echo "  3. Check src/services/recon-service.ts - timeout should be 300000"
  echo ""
  echo "See docs/API_URL_STANDARDS.md for details"
  exit 1
fi
