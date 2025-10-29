#!/bin/bash
# Date Filter Fix Deployment - Paste these commands into EC2 Instance Connect terminal
# Date: 2025-10-12
# Instance: i-08ac67ac776d4ab23 (13.201.179.44)

echo "=== Step 1: Navigate to project directory ==="
cd ~/ops-dashboard
pwd

echo -e "\n=== Step 2: Check current git status ==="
git status
git branch --show-current

echo -e "\n=== Step 3: Fetch latest changes ==="
git fetch origin feat/ops-dashboard-exports

echo -e "\n=== Step 4: Pull date filter fix (commit aed5d91) ==="
git pull origin feat/ops-dashboard-exports

echo -e "\n=== Step 5: Verify new file exists ==="
ls -lh services/overview-api/real-db-adapter.cjs

echo -e "\n=== Step 6: Check PM2 services ==="
pm2 list

echo -e "\n=== Step 7: Restart Overview API ==="
pm2 restart overview-api

echo -e "\n=== Step 8: Check logs (wait 3 seconds for startup) ==="
sleep 3
pm2 logs overview-api --lines 30 --nostream

echo -e "\n=== Step 9: Test API - Today filter ==="
curl -s "http://localhost:5108/api/ops/overview?from=2025-10-12&to=2025-10-12" | jq '.pipeline.totalCaptured, .bySource.manual.total, .bySource.connector.total'

echo -e "\n=== Step 10: Test API - Last 7 Days ==="
curl -s "http://localhost:5108/api/ops/overview?from=2025-10-05&to=2025-10-12" | jq '.pipeline.totalCaptured, .bySource.connector.total'

echo -e "\n✅ Deployment Complete!"
echo "Expected Results:"
echo "  - Today: totalCaptured = 12, manual = 2, connector = 10"
echo "  - Last 7 Days: totalCaptured = 50, connector = 45"
