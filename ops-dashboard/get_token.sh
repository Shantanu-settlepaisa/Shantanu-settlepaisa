#!/bin/bash
curl -s -X POST http://52.66.199.215:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@settlepaisa.com\",\"password\":\"Admin@123\"}" \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4 > /tmp/staging2_jwt_token.txt

cat /tmp/staging2_jwt_token.txt
