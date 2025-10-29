/**
 * Check and Fix HDFC Mapping in Staging 2 Database
 *
 * This script will:
 * 1. Check if sp_v2_bank_column_mappings table exists
 * 2. Check if HDFC BANK mapping exists
 * 3. If missing, insert the HDFC mapping
 * 4. Verify the fix
 */

const { Pool } = require('pg');

// Staging 2 RDS Database Configuration
const DB_CONFIG = {
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024!'
};

async function checkAndFix() {
  console.log('🔍 CHECKING STAGING 2 DATABASE - HDFC MAPPING\n');
  console.log('='.repeat(80));

  const pool = new Pool(DB_CONFIG);

  try {
    // Step 1: Check if table exists
    console.log('\n📊 STEP 1: Check if sp_v2_bank_column_mappings table exists');
    console.log('-'.repeat(80));

    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_bank_column_mappings'
      ) as table_exists
    `);

    const tableExists = tableCheck.rows[0].table_exists;
    console.log(`Table exists: ${tableExists ? '✅ YES' : '❌ NO'}`);

    if (!tableExists) {
      console.log('\n❌ CRITICAL: Table sp_v2_bank_column_mappings does not exist!');
      console.log('   Migration 015 was not run on this database.');
      console.log('   Need to run: db/migrations/015_create_bank_column_mappings.sql');
      await pool.end();
      return;
    }

    // Step 2: Check if HDFC mapping exists
    console.log('\n🏦 STEP 2: Check if HDFC BANK mapping exists');
    console.log('-'.repeat(80));

    const hdfcCheck = await pool.query(`
      SELECT
        config_name,
        bank_name,
        file_type,
        v1_column_mappings,
        is_active,
        created_at
      FROM sp_v2_bank_column_mappings
      WHERE UPPER(bank_name) LIKE '%HDFC%'
      ORDER BY created_at DESC
    `);

    console.log(`HDFC mappings found: ${hdfcCheck.rowCount}`);

    if (hdfcCheck.rowCount > 0) {
      console.log('\n✅ HDFC BANK mapping exists:');
      hdfcCheck.rows.forEach(row => {
        console.log(`   Config: ${row.config_name}`);
        console.log(`   Bank: ${row.bank_name}`);
        console.log(`   Active: ${row.is_active}`);
        console.log(`   Mappings:`, JSON.stringify(row.v1_column_mappings, null, 2));
        console.log(`   Created: ${row.created_at}`);
      });

      // Check if MERCHANT_TRACKID mapping is present
      const hasTrackId = hdfcCheck.rows.some(row =>
        row.v1_column_mappings &&
        row.v1_column_mappings.transaction_id === 'MERCHANT_TRACKID'
      );

      if (hasTrackId) {
        console.log('\n✅ MERCHANT_TRACKID → transaction_id mapping is present');
        console.log('\n🤔 Mapping exists in DB but still failing. Checking code logic...');

        // Let's check what the actual mapping structure is
        console.log('\n📋 Full mapping structure:');
        hdfcCheck.rows.forEach(row => {
          console.log(JSON.stringify(row.v1_column_mappings, null, 2));
        });

      } else {
        console.log('\n⚠️ HDFC mapping exists but missing MERCHANT_TRACKID → transaction_id');
        console.log('   Updating mapping...');

        await pool.query(`
          UPDATE sp_v2_bank_column_mappings
          SET v1_column_mappings = jsonb_set(
            v1_column_mappings,
            '{transaction_id}',
            '"MERCHANT_TRACKID"'
          )
          WHERE UPPER(bank_name) LIKE '%HDFC%'
        `);

        console.log('✅ Updated HDFC mapping with MERCHANT_TRACKID');
      }
    } else {
      console.log('\n❌ HDFC BANK mapping NOT FOUND in database!');
      console.log('   Inserting HDFC mapping...');

      // Insert HDFC mapping from migration 015
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
          'manual_fix_script',
          TRUE
        )
        ON CONFLICT (config_name, file_type) DO UPDATE
        SET v1_column_mappings = EXCLUDED.v1_column_mappings,
            is_active = TRUE,
            updated_at = NOW()
      `);

      console.log('✅ HDFC BANK mapping inserted successfully');
    }

    // Step 3: Verify the fix
    console.log('\n✅ STEP 3: Verify final state');
    console.log('-'.repeat(80));

    const finalCheck = await pool.query(`
      SELECT
        config_name,
        bank_name,
        v1_column_mappings,
        is_active
      FROM sp_v2_bank_column_mappings
      WHERE UPPER(bank_name) LIKE '%HDFC%'
    `);

    if (finalCheck.rowCount > 0) {
      console.log('✅ HDFC mapping verified:');
      finalCheck.rows.forEach(row => {
        console.log(`   Config: ${row.config_name}`);
        console.log(`   Bank: ${row.bank_name}`);
        console.log(`   Active: ${row.is_active}`);
        console.log(`   Mappings:`, JSON.stringify(row.v1_column_mappings, null, 2));

        // Verify specific mapping
        if (row.v1_column_mappings.transaction_id === 'MERCHANT_TRACKID') {
          console.log('\n   ✅ MERCHANT_TRACKID → transaction_id: CORRECT');
        } else {
          console.log('\n   ❌ MERCHANT_TRACKID mapping: MISSING OR INCORRECT');
          console.log(`      Found: ${row.v1_column_mappings.transaction_id || 'NONE'}`);
        }
      });
    }

    // Step 4: Check all bank mappings
    console.log('\n📋 STEP 4: All bank mappings in database');
    console.log('-'.repeat(80));

    const allBanks = await pool.query(`
      SELECT config_name, bank_name, is_active
      FROM sp_v2_bank_column_mappings
      ORDER BY bank_name
    `);

    console.log(`Total bank configs: ${allBanks.rowCount}`);
    allBanks.rows.forEach((row, idx) => {
      const status = row.is_active ? '✅' : '❌';
      console.log(`  ${idx + 1}. ${status} ${row.bank_name} (${row.config_name})`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ DATABASE CHECK AND FIX COMPLETE');
    console.log('='.repeat(80));
    console.log('\nNext steps:');
    console.log('1. Restart recon-api on staging 2: ssh ec2-user@52.66.199.215 \'pm2 restart recon-api\'');
    console.log('2. Re-upload test files in the dashboard');
    console.log('3. Verify 100% match rate');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the check and fix
checkAndFix().catch(console.error);
