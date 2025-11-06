#!/usr/bin/env node

/**
 * Fix AXIS BANK Configuration to Accept CSV Files with Tilde Delimiter
 *
 * Changes:
 * - file_type: 'txt' → 'csv'
 * - delimiter: '~' (kept the same)
 *
 * This allows .csv files with tilde delimiters to be parsed correctly
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

async function fixAxisConfig() {
  const client = await pool.connect();

  try {
    console.log('Connecting to production database...');

    // Check current configuration
    const currentResult = await client.query(`
      SELECT bank_name, file_type, delimiter
      FROM sp_v2_bank_column_mappings
      WHERE bank_name = 'AXIS BANK'
    `);

    if (currentResult.rows.length === 0) {
      console.error('❌ AXIS BANK configuration not found');
      process.exit(1);
    }

    console.log('\n📋 Current AXIS BANK Configuration:');
    console.log(JSON.stringify(currentResult.rows[0], null, 2));

    // Update file_type to 'csv' while keeping delimiter as '~'
    console.log('\n🔄 Updating file_type from "txt" to "csv" (keeping delimiter as "~")...');

    const updateResult = await client.query(`
      UPDATE sp_v2_bank_column_mappings
      SET file_type = 'csv',
          updated_at = NOW()
      WHERE bank_name = 'AXIS BANK'
      RETURNING bank_name, file_type, delimiter, updated_at
    `);

    console.log('\n✅ AXIS BANK configuration updated successfully:');
    console.log(JSON.stringify(updateResult.rows[0], null, 2));

    console.log('\n✅ AXIS bank can now accept .csv files with tilde (~) delimiters');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixAxisConfig();
