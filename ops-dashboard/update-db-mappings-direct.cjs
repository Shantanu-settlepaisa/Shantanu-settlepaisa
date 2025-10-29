#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: 'SettlePaisa2024',
  database: 'settlepaisa_v2'
});

async function updateMappings() {
  try {
    console.log('🔧 Updating Bank Mappings in Database\n');

    // Check current mappings
    console.log('📋 Current mappings:');
    const current = await pool.query(`
      SELECT bank_name, config_name, v1_column_mappings
      FROM sp_v2_bank_column_mappings
      WHERE bank_name IN ('AXIS BANK', 'BOB', 'HDFC BANK') AND is_active = true
    `);
    current.rows.forEach(row => {
      console.log(`\n${row.bank_name} (${row.config_name}):`);
      console.log(JSON.stringify(row.v1_column_mappings, null, 2));
    });

    // Update AXIS BANK
    console.log('\n\n🔧 Updating AXIS BANK: PRNNo → utr...');
    const axisResult = await pool.query(`
      UPDATE sp_v2_bank_column_mappings
      SET v1_column_mappings = jsonb_set(v1_column_mappings, '{PRNNo}', '"utr"'::jsonb),
          updated_at = NOW()
      WHERE bank_name = 'AXIS BANK' AND is_active = true
      RETURNING bank_name, v1_column_mappings
    `);
    if (axisResult.rows.length > 0) {
      console.log('✅ AXIS BANK updated:');
      console.log(JSON.stringify(axisResult.rows[0].v1_column_mappings, null, 2));
    } else {
      console.log('⚠️  No AXIS BANK mapping found in database!');
    }

    // Update BOB
    console.log('\n🔧 Updating BOB: Merchant Track ID → utr...');
    const bobResult = await pool.query(`
      UPDATE sp_v2_bank_column_mappings
      SET v1_column_mappings = jsonb_set(v1_column_mappings, '{Merchant Track ID}', '"utr"'::jsonb),
          updated_at = NOW()
      WHERE bank_name = 'BOB' AND is_active = true
      RETURNING bank_name, v1_column_mappings
    `);
    if (bobResult.rows.length > 0) {
      console.log('✅ BOB updated:');
      console.log(JSON.stringify(bobResult.rows[0].v1_column_mappings, null, 2));
    } else {
      console.log('⚠️  No BOB mapping found in database!');
    }

    console.log('\n✅ Database mappings updated successfully!');
    console.log('\n📝 Next: Restart upload-api on EC2 to clear cache');
    console.log('   ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 "pm2 restart upload-api"');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateMappings();
