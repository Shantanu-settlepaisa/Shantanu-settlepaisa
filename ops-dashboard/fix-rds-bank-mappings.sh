#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════"
echo "🔧 Fixing RDS Bank Column Mappings via EC2"
echo "═══════════════════════════════════════════════════════"
echo ""

EC2_HOST="ec2-user@52.66.199.215"
KEY_PATH="$HOME/.ssh/staging-2-key.pem"

echo "Step 1: Checking current RDS mappings..."
echo ""

ssh -i "$KEY_PATH" "$EC2_HOST" << 'REMOTE_SCRIPT'
#!/bin/bash
set -e

# Create a temporary Node.js script to check and update RDS
cat > /tmp/fix-bank-mappings.cjs << 'EOF'
const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function main() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('STEP 1: CURRENT RDS BANK MAPPINGS');
    console.log('═══════════════════════════════════════════════════════\n');

    const beforeResult = await client.query(`
      SELECT bank_name, v1_column_mappings
      FROM sp_v2_bank_column_mappings
      WHERE bank_name IN ('HDFC BANK', 'AXIS BANK', 'BOB')
      ORDER BY bank_name
    `);

    beforeResult.rows.forEach(row => {
      console.log(`📊 ${row.bank_name}:`);
      console.log(JSON.stringify(row.v1_column_mappings, null, 2));
      if (row.v1_column_mappings.utr) {
        console.log(`  ✅ HAS UTR: ${row.v1_column_mappings.utr}`);
      } else {
        console.log(`  ❌ MISSING UTR - WILL FIX`);
      }
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════');
    console.log('STEP 2: APPLYING FIX');
    console.log('═══════════════════════════════════════════════════════\n');

    // Fix AXIS BANK - Add UTR mapping
    console.log('Fixing AXIS BANK...');
    await client.query(`
      UPDATE sp_v2_bank_column_mappings
      SET v1_column_mappings = jsonb_set(
        v1_column_mappings,
        '{utr}',
        '"PRNNo"'
      ),
      updated_at = NOW()
      WHERE bank_name = 'AXIS BANK'
    `);
    console.log('✅ AXIS BANK updated: PRNNo → utr\n');

    // Fix BOB - Add UTR mapping
    console.log('Fixing BOB...');
    await client.query(`
      UPDATE sp_v2_bank_column_mappings
      SET v1_column_mappings = jsonb_set(
        v1_column_mappings,
        '{utr}',
        '"Merchant Track ID"'
      ),
      updated_at = NOW()
      WHERE bank_name = 'BOB'
    `);
    console.log('✅ BOB updated: Merchant Track ID → utr\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('STEP 3: VERIFY UPDATED MAPPINGS');
    console.log('═══════════════════════════════════════════════════════\n');

    const afterResult = await client.query(`
      SELECT bank_name, v1_column_mappings
      FROM sp_v2_bank_column_mappings
      WHERE bank_name IN ('HDFC BANK', 'AXIS BANK', 'BOB')
      ORDER BY bank_name
    `);

    afterResult.rows.forEach(row => {
      console.log(`📊 ${row.bank_name}:`);
      console.log(JSON.stringify(row.v1_column_mappings, null, 2));
      if (row.v1_column_mappings.utr) {
        console.log(`  ✅ HAS UTR: ${row.v1_column_mappings.utr}`);
      } else {
        console.log(`  ❌ STILL MISSING UTR!`);
      }
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ FIX COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('Next steps:');
    console.log('1. Clear existing test data for 2025-10-28');
    console.log('2. Re-upload the same CSV files');
    console.log('3. Run reconciliation');
    console.log('4. Expected: 50/50 matches!');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
EOF

echo "Running fix script on EC2..."
cd /home/ec2-user/ops-dashboard

# Copy script to ops-dashboard directory where node_modules exists
cp /tmp/fix-bank-mappings.cjs ./fix-bank-mappings-temp.cjs
node ./fix-bank-mappings-temp.cjs
rm ./fix-bank-mappings-temp.cjs

echo ""
echo "Cleaning up temporary script..."
rm /tmp/fix-bank-mappings.cjs

REMOTE_SCRIPT

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ RDS Database Mappings Updated!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "📝 What Changed:"
echo "  • AXIS BANK: Added utr → PRNNo mapping"
echo "  • BOB: Added utr → Merchant Track ID mapping"
echo ""
echo "🔄 Next Steps:"
echo "  1. Clear existing data: DELETE FROM sp_v2_bank_statements WHERE DATE(transaction_date) = '2025-10-28'"
echo "  2. Re-upload the same CSV files (no changes needed!)"
echo "  3. Run reconciliation"
echo "  4. Expected: 50/50 matches ✅"
echo ""
