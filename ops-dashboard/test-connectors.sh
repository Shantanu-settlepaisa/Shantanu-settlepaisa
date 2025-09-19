#!/bin/bash

echo "🔍 Testing SettlePaisa 2.0 Connector Automation"
echo "=============================================="

# Check services
echo -e "\n✅ Checking services..."
echo "SFTP Service:"
docker ps | grep sftp || echo "❌ SFTP not running"
echo "Mock PG API:"
curl -s http://localhost:5101/health | jq '.' || echo "❌ PG API not responding"
echo "Mock Bank API:"
curl -s http://localhost:5102/health | jq '.' || echo "❌ Bank API not responding"

# Test PG data
echo -e "\n✅ Testing PG API data..."
CYCLE=$(date +%Y-%m-%d)
echo "Fetching transactions for cycle: $CYCLE"
curl -s "http://localhost:5101/api/pg/transactions?cycle=$CYCLE" | jq '.count'

# Test Bank data
echo -e "\n✅ Testing Bank API data..."
echo "AXIS Bank records:"
curl -s "http://localhost:5102/api/bank/axis/recon?cycle=$CYCLE" | jq '.count'
echo "HDFC Bank records:"
curl -s "http://localhost:5102/api/bank/hdfc/recon?cycle=$CYCLE" | jq '.count'
echo "ICICI Bank records:"
curl -s "http://localhost:5102/api/bank/icici/recon?cycle=$CYCLE" | jq '.count'

# Check SFTP files
echo -e "\n✅ Checking SFTP files..."
ls -la ./demo/sftp/incoming/*.csv 2>/dev/null || echo "No CSV files in SFTP incoming directory"

echo -e "\n✅ Testing complete!"
echo "=============================================="
echo "Navigate to http://localhost:5174/ops/recon and click 'Connectors' tab to see the UI"