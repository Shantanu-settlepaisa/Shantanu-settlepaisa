#!/bin/bash

echo "=========================================================================="
echo "Testing Overwrite Protection via API"
echo "=========================================================================="
echo ""

API_URL="http://13.201.179.44:5109/api/upload/single"

# Test 1: Try to overwrite Oct 26 data (has SETTLED transactions)
echo "TEST 1: Attempt to overwrite Oct 26 (should BLOCK)"
echo "----------------------------------------------------------------------"

# Create a small test CSV
cat > /tmp/test-overwrite.csv << 'EOF'
transaction_id,client_code,payee_amount,paid_amount,payment_mode,trans_complete_date,status,utr,pg_name
TEST_NEW_001,MERCH001,10000.00,10200.00,UPI,2025-10-26 09:00:00,SUCCESS,UTR_NEW_001,RAZORPAY
EOF

echo "Uploading test file with overwrite=true for date=2025-10-26..."
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL" \
  -F "file=@/tmp/test-overwrite.csv" \
  -F "fileType=transactions" \
  -F "overwrite=true" \
  -F "date=2025-10-26")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS"
echo "Response Body:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "500" ]; then
  if echo "$BODY" | grep -q "SETTLED\|settlement batch"; then
    echo "✅ TEST 1 PASSED: Overwrite blocked for SETTLED transactions"
  else
    echo "❌ TEST 1 FAILED: Got error but not settlement-related"
  fi
else
  echo "⚠️  TEST 1 UNEXPECTED: Expected 400/500 error, got $HTTP_STATUS"
fi

echo ""
echo "=========================================================================="
echo ""

# Test 2: Try to overwrite a future date (should WORK)
echo "TEST 2: Attempt to overwrite future date with PENDING data (should WORK)"
echo "----------------------------------------------------------------------"

# Create test data for Nov 1
cat > /tmp/test-nov1.csv << 'EOF'
transaction_id,client_code,payee_amount,paid_amount,payment_mode,trans_complete_date,status,utr,pg_name
TEST_NOV_001,MERCH001,5000.00,5100.00,UPI,2025-11-01 09:00:00,SUCCESS,UTR_NOV_001,RAZORPAY
TEST_NOV_002,MERCH001,6000.00,6120.00,CARD,2025-11-01 10:00:00,SUCCESS,UTR_NOV_002,PAYU
EOF

echo "First upload (no overwrite)..."
curl -s -X POST "$API_URL" \
  -F "file=@/tmp/test-nov1.csv" \
  -F "fileType=transactions" > /dev/null

sleep 2

echo "Second upload (with overwrite=true for date=2025-11-01)..."
echo ""

RESPONSE2=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL" \
  -F "file=@/tmp/test-nov1.csv" \
  -F "fileType=transactions" \
  -F "overwrite=true" \
  -F "date=2025-11-01")

HTTP_STATUS2=$(echo "$RESPONSE2" | grep "HTTP_STATUS" | cut -d: -f2)
BODY2=$(echo "$RESPONSE2" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS2"
echo "Response Body:"
echo "$BODY2" | jq '.' 2>/dev/null || echo "$BODY2"
echo ""

if [ "$HTTP_STATUS2" = "200" ]; then
  if echo "$BODY2" | grep -q "success.*true"; then
    echo "✅ TEST 2 PASSED: Overwrite allowed for PENDING transactions"
  else
    echo "⚠️  TEST 2 PARTIAL: Got 200 but unexpected response format"
  fi
else
  echo "❌ TEST 2 FAILED: Expected 200 success, got $HTTP_STATUS2"
fi

echo ""
echo "=========================================================================="
echo "Test Summary"
echo "=========================================================================="
echo ""
echo "TEST 1: Block SETTLED transactions → Check result above"
echo "TEST 2: Allow PENDING transactions → Check result above"
echo ""
echo "Cleanup: /tmp/test-overwrite.csv, /tmp/test-nov1.csv"

# Cleanup
rm -f /tmp/test-overwrite.csv /tmp/test-nov1.csv

echo ""
echo "=========================================================================="
