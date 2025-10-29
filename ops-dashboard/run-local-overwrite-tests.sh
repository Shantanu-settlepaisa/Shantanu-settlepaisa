#!/bin/bash

echo "═══════════════════════════════════════════════════════════════════════════"
echo "LOCAL OVERWRITE PROTECTION TESTS"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

API_URL="http://localhost:5109/api/upload/single"

# Test 1: Overwrite PENDING transactions (Oct 27)
echo "TEST 1: Overwrite PENDING transactions (2025-10-27)"
echo "───────────────────────────────────────────────────────────────────────────"
echo "Expected: ✅ HTTP 200 Success"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL" \
  -F "file=@test-csv-oct27-pending.csv" \
  -F "fileType=transactions" \
  -F "overwrite=true" \
  -F "date=2025-10-27")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ TEST 1 PASSED: PENDING transactions overwritten successfully"
else
  echo "❌ TEST 1 FAILED: Expected 200, got $HTTP_STATUS"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Test 2: Overwrite SETTLED transactions (Oct 29)
echo "TEST 2: Overwrite SETTLED transactions (2025-10-29)"
echo "───────────────────────────────────────────────────────────────────────────"
echo "Expected: ❌ HTTP 400/500 Error (Protection should BLOCK)"
echo ""

RESPONSE2=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL" \
  -F "file=@test-csv-oct29-settled.csv" \
  -F "fileType=transactions" \
  -F "overwrite=true" \
  -F "date=2025-10-29")

HTTP_STATUS2=$(echo "$RESPONSE2" | grep "HTTP_STATUS" | cut -d: -f2)
BODY2=$(echo "$RESPONSE2" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS2"
echo "$BODY2" | jq '.' 2>/dev/null || echo "$BODY2"
echo ""

if [ "$HTTP_STATUS2" = "400" ] || [ "$HTTP_STATUS2" = "500" ]; then
  if echo "$BODY2" | grep -q "SETTLED\|settlement"; then
    echo "✅ TEST 2 PASSED: SETTLED transactions blocked with settlement error"
  else
    echo "⚠️  TEST 2 PARTIAL: Got error but not settlement-related"
  fi
else
  echo "❌ TEST 2 FAILED: Expected 400/500, got $HTTP_STATUS2"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "TEST SUMMARY"
echo "═══════════════════════════════════════════════════════════════════════════"
echo "TEST 1: Overwrite PENDING    → $([ "$HTTP_STATUS" = "200" ] && echo "✅ PASS" || echo "❌ FAIL")"
echo "TEST 2: Block SETTLED        → $([ "$HTTP_STATUS2" = "400" ] || [ "$HTTP_STATUS2" = "500" ] && echo "✅ PASS" || echo "❌ FAIL")"
echo ""
