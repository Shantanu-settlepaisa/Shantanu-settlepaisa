#!/bin/bash
cd /Users/shantanusingh/ops-dashboard/services/recon-api
export DB_HOST=localhost
export DB_PORT=5433
export DB_NAME=settlepaisa_v2
export DB_USER=postgres
export DB_PASSWORD=settlepaisa123
node index.js
