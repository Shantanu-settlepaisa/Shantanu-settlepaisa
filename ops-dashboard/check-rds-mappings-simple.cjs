#!/usr/bin/env node

const { Pool } = require('pg');

// Use the same connection that services use
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  connectionTimeoutMillis: 10000
});

async function main() {
  let client;
  try {
    console.log('Connecting to RDS...');
    client = await pool.connect();
    console.log('✅ Connected to RDS');
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 RDS BANK COLUMN MAPPINGS');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    const result = await client.query(`
      SELECT
        bank_name,
        v1_column_mappings
      FROM sp_v2_bank_column_mappings
      WHERE bank_name IN ('HDFC BANK', 'AXIS BANK', 'BOB')
      ORDER BY bank_name
    `);

    result.rows.forEach(row => {
      console.log(`\n📊 ${row.bank_name}:`);
      console.log(JSON.stringify(row.v1_column_mappings, null, 2));

      // Check for UTR field
      if (row.v1_column_mappings.utr) {
        console.log(`  ✅ HAS UTR mapping: "${row.v1_column_mappings.utr}" → will map to utr field`);
      } else {
        console.log(`  ❌ MISSING UTR mapping! (will cause 0 matches)`);
      }

      if (row.v1_column_mappings.transaction_id) {
        console.log(`  ℹ️  HAS transaction_id mapping: "${row.v1_column_mappings.transaction_id}" → will map to bank_ref field`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 SUMMARY TABLE');
    console.log('═══════════════════════════════════════════════════════\n');

    const summary = result.rows.map(r => ({
      'Bank': r.bank_name,
      'Has UTR?': r.v1_column_mappings.utr ? '✅ YES' : '❌ NO',
      'UTR Column': r.v1_column_mappings.utr || 'N/A',
      'TxnID Column': r.v1_column_mappings.transaction_id || 'N/A'
    }));

    console.table(summary);

    // Check uploaded data
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🗄️  CHECKING UPLOADED DATA (Oct 28, 2025)');
    console.log('═══════════════════════════════════════════════════════\n');

    const dataCheck = await client.query(`
      SELECT
        bank_name,
        COUNT(*) as count,
        COUNT(utr) as utr_populated,
        COUNT(bank_ref) as bank_ref_populated
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-28'
      GROUP BY bank_name
      ORDER BY bank_name
    `);

    if (dataCheck.rows.length === 0) {
      console.log('⚠️  NO DATA FOUND FOR 2025-10-28');
    } else {
      console.table(dataCheck.rows);

      // Show sample records
      const samples = await client.query(`
        SELECT
          bank_name,
          utr,
          bank_ref,
          amount_paise / 100.0 as amount
        FROM sp_v2_bank_statements
        WHERE DATE(transaction_date) = '2025-10-28'
        ORDER BY bank_name, id
        LIMIT 5
      `);

      console.log('\n📋 SAMPLE RECORDS:\n');
      console.table(samples.rows);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
