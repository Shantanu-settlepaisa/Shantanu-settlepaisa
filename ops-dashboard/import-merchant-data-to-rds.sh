#!/bin/bash
# Import merchant data directly to RDS from local machine
# This script connects to RDS from your local machine (no EC2 access needed)

set -e

echo "=== Merchant Dashboard Data Import ==="
echo ""

# Check if merchant data file exists
if [ ! -f "/tmp/merchant_master_data.sql" ]; then
  echo "Error: /tmp/merchant_master_data.sql not found"
  echo "Run the fix script first to export the data"
  exit 1
fi

echo "Step 1: Importing sp_v2_merchant_master to RDS..."
echo "RDS: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432"
echo ""

# Use Docker's psql to import to RDS
docker exec -i settlepaisa_v2_db psql \
  "postgresql://postgres:SettlePaisa2024@settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2" \
  < /tmp/merchant_master_data.sql

echo ""
echo "Step 2: Verifying import..."

# Verify count
docker exec settlepaisa_v2_db psql \
  "postgresql://postgres:SettlePaisa2024@settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2" \
  -c "SELECT COUNT(*) as total_merchants FROM sp_v2_merchant_master;"

echo ""
echo "Step 3: Checking MERCH001 exists..."

docker exec settlepaisa_v2_db psql \
  "postgresql://postgres:SettlePaisa2024@settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2" \
  -c "SELECT merchant_id, merchant_name, is_active FROM sp_v2_merchant_master WHERE merchant_id IN ('MERCH001', 'MERCH002', 'MERCH003') ORDER BY merchant_id;"

echo ""
echo "Step 4: Verifying transaction counts by merchant..."

docker exec settlepaisa_v2_db psql \
  "postgresql://postgres:SettlePaisa2024@settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2" \
  -c "SELECT merchant_id, COUNT(*) as txn_count FROM sp_v2_transactions WHERE merchant_id IN ('MERCH001', 'MERCH002', 'MERCH003') GROUP BY merchant_id ORDER BY merchant_id;"

echo ""
echo "✓ Merchant data imported successfully!"
echo ""
echo "Next steps:"
echo "1. You still need to SSH to EC2 to update DEFAULT_MERCHANT_ID"
echo "2. Or provide AWS credentials to update via AWS Systems Manager"
echo ""
echo "See MERCHANT_DASHBOARD_FIX_GUIDE.md for complete instructions"
