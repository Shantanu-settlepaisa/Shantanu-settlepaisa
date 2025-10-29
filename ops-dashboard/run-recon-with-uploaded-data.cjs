#!/usr/bin/env node

const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function runReconWithData() {
  const client = await pool.connect();

  try {
    console.log('📊 Fetching uploaded data from database...\n');

    // Fetch PG transactions
    const pgResult = await client.query(`
      SELECT
        transaction_id,
        merchant_id,
        amount_paise as amount,
        transaction_date,
        transaction_timestamp,
        payment_method as payment_mode,
        utr,
        rrn,
        status
      FROM sp_v2_transactions
      WHERE merchant_id = 'MERCH001'
        AND source_type = 'MANUAL_UPLOAD'
        AND transaction_id LIKE 'TXN20251010%'
      ORDER BY transaction_id
    `);

    console.log(`✓ Found ${pgResult.rows.length} PG transactions`);

    // Fetch Bank statements
    const bankResult = await client.query(`
      SELECT
        bank_ref as TRANSACTION_ID,
        amount_paise as AMOUNT,
        transaction_date as DATE,
        utr as UTR,
        rrn as RRN,
        bank_name as BANK,
        remarks as REMARKS
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
        AND bank_ref LIKE 'BANK20251010%'
      ORDER BY bank_ref
    `);

    console.log(`✓ Found ${bankResult.rows.length} Bank statements\n`);

    // Run reconciliation with data
    console.log('🔄 Running reconciliation...\n');

    const response = await axios.post('http://localhost:5103/recon/run', {
      date: '2025-10-10',
      pgTransactions: pgResult.rows,
      bankRecords: bankResult.rows,
      bankFilename: 'test-v1-bank-2025-10-10.csv'
    });

    console.log('✅ Reconciliation completed!');
    console.log('\n📊 Results:');
    console.log(`  Job ID: ${response.data.jobId}`);
    console.log(`  Status: ${response.data.status}`);
    console.log(`  Stage: ${response.data.stage}`);
    console.log('\n  Counters:');
    console.log(`    PG Fetched: ${response.data.counters.pgFetched}`);
    console.log(`    Bank Fetched: ${response.data.counters.bankFetched}`);
    console.log(`    Matched: ${response.data.counters.matched}`);
    console.log(`    Unmatched PG: ${response.data.counters.unmatchedPg}`);
    console.log(`    Unmatched Bank: ${response.data.counters.unmatchedBank}`);
    console.log(`    Exceptions: ${response.data.counters.exceptions}`);

    return response.data;

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runReconWithData();
