#!/usr/bin/env node

/**
 * Check what column names are actually stored in the database on staging-2
 * This will help us understand what keys the recon engine receives
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: '52.66.199.215',
  port: 5432,
  user: 'settlepaisa_admin',
  password: 'your-password', // Update this
  database: 'settlepaisa_v2'
});

async function checkBankData() {
  try {
    console.log('🔍 Checking bank data in staging-2 database...\n');

    // Get the most recent bank statement records
    const result = await pool.query(`
      SELECT
        id,
        source_type,
        bank_name,
        bank_ref,
        utr,
        amount_paise,
        transaction_date,
        created_at,
        -- Get all columns as JSON to see what fields exist
        row_to_json(sp_v2_bank_statements.*) as full_record
      FROM sp_v2_bank_statements
      WHERE source_type IN ('AXIS BANK', 'BOB', 'HDFC BANK', 'MANUAL_UPLOAD')
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log(`Found ${result.rows.length} recent bank records:\n`);

    result.rows.forEach((row, idx) => {
      console.log(`\n📄 Record ${idx + 1}:`);
      console.log(`   Bank: ${row.bank_name}`);
      console.log(`   Source Type: ${row.source_type}`);
      console.log(`   Bank Ref: ${row.bank_ref}`);
      console.log(`   UTR: ${row.utr || '(empty)'}`);
      console.log(`   Amount: ₹${(row.amount_paise / 100).toFixed(2)}`);
      console.log(`   Date: ${row.transaction_date}`);
      console.log(`\n   All columns in this record:`);
      console.log(`   ${JSON.stringify(row.full_record, null, 4)}`);
    });

    // Check table schema
    console.log('\n\n📋 Table Schema (sp_v2_bank_statements):');
    const schemaResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_bank_statements'
      ORDER BY ordinal_position
    `);

    schemaResult.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkBankData();
