#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function checkData() {
  const client = await pool.connect();

  try {
    console.log('📊 Checking uploaded data...\n');

    // Check PG transactions
    console.log('=== PG Transactions (MERCH001, 2025-10-10) ===');
    const pgResult = await client.query(`
      SELECT transaction_id, merchant_id, amount_paise, utr, status, source_type, transaction_date
      FROM sp_v2_transactions
      WHERE merchant_id = 'MERCH001'
        AND transaction_date = '2025-10-10'
      ORDER BY transaction_id
      LIMIT 5
    `);

    pgResult.rows.forEach(row => {
      console.log(`  ${row.transaction_id}: ₹${(row.amount_paise / 100).toFixed(2)}, UTR: ${row.utr}, Status: ${row.status}`);
    });
    console.log(`  Total: ${pgResult.rows.length} transactions\n`);

    // Check Bank statements
    console.log('=== Bank Statements (2025-10-10) ===');
    const bankResult = await client.query(`
      SELECT bank_ref, amount_paise, utr, transaction_date, processed
      FROM sp_v2_bank_statements
      WHERE transaction_date = '2025-10-10'
      ORDER BY bank_ref
      LIMIT 5
    `);

    bankResult.rows.forEach(row => {
      console.log(`  ${row.bank_ref}: ₹${(row.amount_paise / 100).toFixed(2)}, UTR: ${row.utr}, Processed: ${row.processed}`);
    });
    console.log(`  Total: ${bankResult.rows.length} statements\n`);

    // Check recon results
    console.log('=== Reconciliation Results ===');
    const reconResult = await client.query(`
      SELECT match_status, COUNT(*) as count
      FROM sp_v2_reconciliation_results
      GROUP BY match_status
      ORDER BY match_status
    `);

    reconResult.rows.forEach(row => {
      console.log(`  ${row.match_status}: ${row.count}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkData();
