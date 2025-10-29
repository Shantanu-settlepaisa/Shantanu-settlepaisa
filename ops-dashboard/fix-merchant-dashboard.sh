#!/bin/bash
# Fix Merchant Dashboard - Import sp_v2_merchant_master and update DEFAULT_MERCHANT_ID

set -e

echo "Step 1: Export sp_v2_merchant_master from local database..."
docker exec settlepaisa_v2_db pg_dump -U postgres -d settlepaisa_v2 \
  --data-only \
  -t sp_v2_merchant_master \
  > /tmp/merchant_master_data.sql

echo "✓ Exported sp_v2_merchant_master ($(wc -l < /tmp/merchant_master_data.sql) lines)"

echo ""
echo "Step 2: Upload to EC2..."
echo "Run this command manually:"
echo "scp -i <your-key-file> /tmp/merchant_master_data.sql ec2-user@13.201.179.44:~/"

echo ""
echo "Step 3: SSH to EC2 and run these commands:"
echo "-----------------------------------------------"
cat << 'EOF'
# Import merchant_master data to RDS
PGPASSWORD='SettlePaisa2024' psql \
  -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f ~/merchant_master_data.sql

# Verify data imported
PGPASSWORD='SettlePaisa2024' psql \
  -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT COUNT(*) FROM sp_v2_merchant_master;"

# Check MERCH001 exists
PGPASSWORD='SettlePaisa2024' psql \
  -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT merchant_id, merchant_name, is_active FROM sp_v2_merchant_master WHERE merchant_id = 'MERCH001';"

# Update ecosystem.config.js to use MERCH001
sed -i "s/DEFAULT_MERCHANT_ID: '11111111-1111-1111-1111-111111111111'/DEFAULT_MERCHANT_ID: 'MERCH001'/g" ~/ecosystem.config.js

# Update all service .env files
for dir in ~/services/*/; do
  if [ -f "${dir}.env" ]; then
    sed -i 's/DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111/DEFAULT_MERCHANT_ID=MERCH001/g' "${dir}.env"
    echo "Updated ${dir}.env"
  fi
done

# Restart all PM2 services to pick up new merchant ID
pm2 delete all
pm2 start ~/ecosystem.config.js
pm2 save

# Check services are running
pm2 status

echo ""
echo "✓ Done! Merchant dashboard should now show data for MERCH001"
EOF
echo "-----------------------------------------------"
