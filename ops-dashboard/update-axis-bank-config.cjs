#!/usr/bin/env node

/**
 * Update AXIS BANK V1 Configuration
 *
 * Changes the AXIS BANK v1_column_mappings to use separate columns:
 * - paid_amount: "GrossAmount" (total amount customer paid)
 * - payee_amount: "NetAmount" (settled amount after bank fee)
 *
 * This allows proper bank fee calculation: bank_fee = gross_amount_paise - amount_paise
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-production.ccfgqux3aopk.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'vsF41bPJH77W6DPKoyQ1Mv8U',
  ssl: {
    rejectUnauthorized: false
  }
});

async function updateAxisConfig() {
  const client = await pool.connect();

  try {
    console.log('Connecting to production database...');

    // First, check current AXIS configuration
    const currentResult = await client.query(`
      SELECT bank_name, v1_column_mappings
      FROM sp_v2_bank_column_mappings
      WHERE bank_name = 'AXIS BANK'
    `);

    if (currentResult.rows.length === 0) {
      console.error('❌ AXIS BANK configuration not found in database');
      process.exit(1);
    }

    console.log('\n📋 Current AXIS BANK Configuration:');
    console.log(JSON.stringify(currentResult.rows[0], null, 2));

    // Update the configuration
    const newV1Mappings = {
      paid_amount: "GrossAmount",
      payee_amount: "NetAmount",
      utr: "PRNNo",
      transaction_date: "Date"
    };

    console.log('\n🔄 Updating to new configuration:');
    console.log(JSON.stringify({ v1_column_mappings: newV1Mappings }, null, 2));

    const updateResult = await client.query(`
      UPDATE sp_v2_bank_column_mappings
      SET v1_column_mappings = $1,
          updated_at = NOW()
      WHERE bank_name = 'AXIS BANK'
      RETURNING bank_name, v1_column_mappings, updated_at
    `, [JSON.stringify(newV1Mappings)]);

    console.log('\n✅ AXIS BANK configuration updated successfully:');
    console.log(JSON.stringify(updateResult.rows[0], null, 2));

    // Verify the update
    const verifyResult = await client.query(`
      SELECT bank_name, v1_column_mappings
      FROM sp_v2_bank_column_mappings
      WHERE bank_name = 'AXIS BANK'
    `);

    console.log('\n✓ Verification - Updated Configuration:');
    console.log(JSON.stringify(verifyResult.rows[0], null, 2));

  } catch (error) {
    console.error('❌ Error updating AXIS configuration:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

updateAxisConfig();
