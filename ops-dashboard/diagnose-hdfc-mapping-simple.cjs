/**
 * Simple HDFC Mapping Diagnostic
 */

const { Pool } = require('pg');

const DB_CONFIG = {
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024!'
};

async function diagnose() {
  const pool = new Pool(DB_CONFIG);

  try {
    console.log('🔍 CHECKING HDFC MAPPING IN STAGING 2 DATABASE\n');

    // 1. Check if table exists
    console.log('1. Checking if sp_v2_bank_column_mappings table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'sp_v2_bank_column_mappings'
      )
    `);
    console.log('   Table exists:', tableCheck.rows[0].exists);

    if (!tableCheck.rows[0].exists) {
      console.log('\n❌ TABLE DOES NOT EXIST! Migration 015 was not run.');
      await pool.end();
      return;
    }

    // 2. Check for HDFC mapping
    console.log('\n2. Checking for HDFC BANK mapping...');
    const hdfcCheck = await pool.query(`
      SELECT config_name, bank_name, v1_column_mappings, is_active
      FROM sp_v2_bank_column_mappings
      WHERE UPPER(bank_name) LIKE '%HDFC%'
    `);

    console.log('   HDFC mappings found:', hdfcCheck.rowCount);

    if (hdfcCheck.rowCount === 0) {
      console.log('\n❌ HDFC MAPPING DOES NOT EXIST!');
      console.log('   Need to insert HDFC mapping into database.');

      // Insert HDFC mapping
      console.log('\n3. Inserting HDFC mapping...');
      await pool.query(`
        INSERT INTO sp_v2_bank_column_mappings
        (config_name, bank_name, file_type, delimiter, v1_column_mappings, source, created_by, is_active)
        VALUES (
          'HDFC BANK',
          'HDFC BANK',
          'xlsx',
          NULL,
          '{"transaction_id": "MERCHANT_TRACKID", "paid_amount": "DOMESTIC AMT", "payee_amount": "Net Amount", "transaction_date_time": "TRANS DATE", "payment_date_time": "SETTLE DATE"}'::jsonb,
          'V1_MIGRATED',
          'fix_script',
          TRUE
        )
        ON CONFLICT (config_name, file_type) DO UPDATE
        SET v1_column_mappings = EXCLUDED.v1_column_mappings,
            is_active = TRUE
      `);
      console.log('   ✅ HDFC mapping inserted!');

    } else {
      console.log('\n✅ HDFC mapping exists:');
      hdfcCheck.rows.forEach(row => {
        console.log('   Config:', row.config_name);
        console.log('   Bank:', row.bank_name);
        console.log('   Active:', row.is_active);
        console.log('   Mappings:', JSON.stringify(row.v1_column_mappings, null, 2));
      });
    }

    // 4. Final verification
    console.log('\n4. Final verification...');
    const finalCheck = await pool.query(`
      SELECT config_name, bank_name, v1_column_mappings->'transaction_id' as txn_mapping
      FROM sp_v2_bank_column_mappings
      WHERE UPPER(bank_name) LIKE '%HDFC%'
    `);

    if (finalCheck.rowCount > 0) {
      const row = finalCheck.rows[0];
      console.log('   ✅ HDFC BANK config present');
      console.log('   ✅ MERCHANT_TRACKID mapping:', row.txn_mapping);

      if (row.txn_mapping === '"MERCHANT_TRACKID"') {
        console.log('\n✅ SUCCESS! HDFC mapping is correct.');
        console.log('\nNext step: Restart recon-api on staging 2');
        console.log('Command: ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 \'pm2 restart recon-api\'');
      }
    }

    // 5. Show all bank configs
    console.log('\n5. All bank configs in database:');
    const allBanks = await pool.query(`
      SELECT config_name, bank_name, is_active
      FROM sp_v2_bank_column_mappings
      ORDER BY bank_name
    `);
    console.log(`   Total: ${allBanks.rowCount} configs`);
    allBanks.rows.forEach(row => {
      console.log(`   - ${row.bank_name} (${row.config_name}) [${row.is_active ? 'Active' : 'Inactive'}]`);
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

diagnose().catch(console.error);
