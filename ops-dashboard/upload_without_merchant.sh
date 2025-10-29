#!/bin/bash
JWT_TOKEN=$(cat /tmp/staging2_jwt_token.txt)
curl -X POST "http://52.66.199.215:5107/api/upload/single" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@test-pg-v1-staging2-oct27.csv;type=text/csv" \
  -F "fileType=transactions" \
  -F "preview=false"
