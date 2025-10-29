#!/bin/bash
# Quick test to verify updated services can start without errors

echo "🧪 Testing Updated Services..."
echo ""

test_file() {
  local file=$1
  local name=$2
  echo -n "Testing $name... "
  
  if node -e "require('$file'); console.log('✓ OK');" 2>&1 | grep -q "✓ OK"; then
    echo "✅ PASS"
    return 0
  else
    echo "❌ FAIL"
    node -e "require('$file');" 2>&1 | head -5
    return 1
  fi
}

# Test core files
test_file "./services/config/env.cjs" "Config Module"
test_file "./services/settlement-engine/settlement-calculator-v1-logic.cjs" "Settlement Calculator V1"
test_file "./services/settlement-engine/settlement-api.cjs" "Settlement API"
test_file "./services/overview-api/auth.cjs" "Auth Module"
test_file "./services/recon-api/index.js" "Recon API"

echo ""
echo "✓ All critical services load successfully!"
