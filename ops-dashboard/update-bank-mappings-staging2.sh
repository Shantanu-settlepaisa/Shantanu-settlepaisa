#!/bin/bash

# Update AXIS and BOB bank mappings in staging-2 database
# This fixes the UTR mapping issue at the database level

set -e

echo "🔧 Updating Bank Mappings in Staging-2 Database"
echo "================================================"
echo ""

# SSH to staging-2 and run SQL updates
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 << 'ENDSSH'

# Load DB credentials from .env
cd /home/ec2-user/ops-dashboard
export $(grep -v '^#' services/shared/.env 2>/dev/null || grep -v '^#' services/recon-api/.env | xargs)

echo "📋 Current AXIS BANK mapping:"
echo "SELECT bank_name, v1_column_mappings->>'prnno' FROM sp_v2_bank_column_mappings WHERE bank_name = 'AXIS BANK';" | \
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME

echo ""
echo "📋 Current BOB mapping:"
echo "SELECT bank_name, v1_column_mappings->>'merchant_track_id' FROM sp_v2_bank_column_mappings WHERE bank_name = 'BOB';" | \
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME

echo ""
echo "🔧 Updating AXIS BANK: prnno → utr..."
cat << 'SQL' | PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME
UPDATE sp_v2_bank_column_mappings
SET v1_column_mappings = jsonb_set(v1_column_mappings, '{prnno}', '"utr"'::jsonb),
    updated_at = NOW()
WHERE bank_name = 'AXIS BANK' AND is_active = true;
SQL

echo ""
echo "🔧 Updating BOB: merchant_track_id → utr..."
cat << 'SQL' | PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME
UPDATE sp_v2_bank_column_mappings
SET v1_column_mappings = jsonb_set(v1_column_mappings, '{merchant_track_id}', '"utr"'::jsonb),
    updated_at = NOW()
WHERE bank_name = 'BOB' AND is_active = true;
SQL

echo ""
echo "✅ Verifying updates:"
echo "SELECT bank_name, v1_column_mappings->>'prnno' as axis_mapping FROM sp_v2_bank_column_mappings WHERE bank_name = 'AXIS BANK';" | \
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME

echo "SELECT bank_name, v1_column_mappings->>'merchant_track_id' as bob_mapping FROM sp_v2_bank_column_mappings WHERE bank_name = 'BOB';" | \
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME

echo ""
echo "🔄 Restarting Upload API to clear cache..."
pm2 restart upload-api

sleep 3

echo ""
echo "✅ Done! Now test by re-uploading the files."

ENDSSH

echo ""
echo "✅ Database mappings updated successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Go to: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon"
echo "   2. Upload all 4 CSV files again"
echo "   3. Run Reconciliation"
echo "   4. Expected: 50/50 matched! 🎉"
