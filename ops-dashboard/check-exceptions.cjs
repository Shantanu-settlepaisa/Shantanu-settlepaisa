#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function checkExceptions() {
  const client = await pool.connect();

  try {
    console.log('🔍 Checking reconciliation exceptions...\n');

    const result = await client.query(`
      SELECT
        pg_transaction_id,
        bank_statement_id,
        match_status,
        exception_reason_code,
        exception_severity,
        exception_message,
        pg_amount_paise,
        bank_amount_paise,
        variance_paise,
        created_at
      FROM sp_v2_reconciliation_results
      WHERE match_status = 'EXCEPTION'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`Found ${result.rows.length} exceptions:\n`);

    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. Exception:`);
      console.log(`   PG Txn: ${row.pg_transaction_id || 'NULL'}`);
      console.log(`   Bank Statement ID: ${row.bank_statement_id || 'NULL'}`);
      console.log(`   Reason Code: ${row.exception_reason_code || 'NULL'}`);
      console.log(`   Severity: ${row.exception_severity || 'NULL'}`);
      console.log(`   Message: ${row.exception_message || 'NULL'}`);
      console.log(`   PG Amount: ₹${row.pg_amount_paise ? (row.pg_amount_paise/100).toFixed(2) : 'NULL'}`);
      console.log(`   Bank Amount: ₹${row.bank_amount_paise ? (row.bank_amount_paise/100).toFixed(2) : 'NULL'}`);
      console.log(`   Variance: ₹${row.variance_paise ? (row.variance_paise/100).toFixed(2) : 'NULL'}`);
      console.log(`   Created: ${row.created_at}\n`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkExceptions();
