#!/bin/bash

echo "=== PHASE 2: Upload PG Transaction File (Authenticated) ==="
echo ""

# Read JWT token
JWT_TOKEN=$(cat /tmp/staging2_jwt_token.txt)
echo "Using JWT token: ${JWT_TOKEN:0:50}..."
echo ""

# Upload PG transaction file
echo "Uploading PG file: test-pg-v1-staging2-oct27.csv"
echo "Target: http://52.66.199.215:5107/api/upload/single"
echo ""

curl -X POST "http://52.66.199.215:5107/api/upload/single" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@test-pg-v1-staging2-oct27.csv" \
  -F "fileType=transactions" \
  -F "merchantId=MERCH001" \
  -F "preview=false"

echo ""
echo ""
