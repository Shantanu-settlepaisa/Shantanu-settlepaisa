#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════"
echo "🔧 Fixing RDS Bank Column Mappings via EC2 (using psql)"
echo "═══════════════════════════════════════════════════════"
echo ""

EC2_HOST="ec2-user@52.66.199.215"
KEY_PATH="$HOME/.ssh/staging-2-key.pem"

ssh -i "$KEY_PATH" "$EC2_HOST" << 'ENDSSH'
#!/bin/bash
set -e

export PGPASSWORD='SettlePaisa2024'
RDS_HOST='settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com'
DB_NAME='settlepaisa_v2'
DB_USER='postgres'

echo "═══════════════════════════════════════════════════════"
echo "STEP 1: CHECK CURRENT MAPPINGS"
echo "═══════════════════════════════════════════════════════"
echo ""

psql -h "$RDS_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT
  bank_name,
  v1_column_mappings
FROM sp_v2_bank_column_mappings
WHERE bank_name IN ('HDFC BANK', 'AXIS BANK', 'BOB')
ORDER BY bank_name;
"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "STEP 2: APPLY FIX - ADD UTR MAPPINGS"
echo "═══════════════════════════════════════════════════════"
echo ""

echo "Fixing AXIS BANK..."
psql -h "$RDS_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
UPDATE sp_v2_bank_column_mappings
SET v1_column_mappings = jsonb_set(
  v1_column_mappings,
  '{utr}',
  '\"PRNNo\"'
),
updated_at = NOW()
WHERE bank_name = 'AXIS BANK';
"
echo "✅ AXIS BANK updated"
echo ""

echo "Fixing BOB..."
psql -h "$RDS_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
UPDATE sp_v2_bank_column_mappings
SET v1_column_mappings = jsonb_set(
  v1_column_mappings,
  '{utr}',
  '\"Merchant Track ID\"'
),
updated_at = NOW()
WHERE bank_name = 'BOB';
"
echo "✅ BOB updated"
echo ""

echo "═══════════════════════════════════════════════════════"
echo "STEP 3: VERIFY UPDATED MAPPINGS"
echo "═══════════════════════════════════════════════════════"
echo ""

psql -h "$RDS_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT
  bank_name,
  v1_column_mappings
FROM sp_v2_bank_column_mappings
WHERE bank_name IN ('HDFC BANK', 'AXIS BANK', 'BOB')
ORDER BY bank_name;
"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ FIX COMPLETE"
echo "═══════════════════════════════════════════════════════"
echo ""

ENDSSH

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ RDS Database Mappings Updated Successfully!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "📝 What Changed:"
echo "  • AXIS BANK: Added utr → PRNNo mapping"
echo "  • BOB: Added utr → Merchant Track ID mapping"
echo ""
echo "🔄 Next Steps:"
echo "  1. Clear existing data for 2025-10-28"
echo "  2. Re-upload the same CSV files"
echo "  3. Run reconciliation"
echo "  4. Expected: 50/50 matches ✅"
echo ""
