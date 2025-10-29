#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function clearMerchant() {
  const client = await pool.connect();

  try {
    console.log('🧹 Clearing MERCH001 data (direct approach)...\n');

    // Just delete transactions and bank statements directly (they'll be fresh anyway)
    const txnResult = await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE merchant_id = 'MERCH001' AND source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`✓ Deleted ${txnResult.rowCount} transactions`);

    const bankResult = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`✓ Deleted ${bankResult.rowCount} bank statements`);

    // Delete recon results for test transactions
    const reconResult = await client.query(`
      DELETE FROM sp_v2_reconciliation_results
      WHERE pg_transaction_id LIKE 'TXN2025%' OR pg_transaction_id LIKE 'BANK_%'
    `);
    console.log(`✓ Deleted ${reconResult.rowCount} recon results`);

    // Show current counts
    console.log('\n📊 Current table counts:');
    const counts = await client.query(`
      SELECT 'transactions (MERCH001)' as table_name,
             COUNT(*) as count
      FROM sp_v2_transactions
      WHERE merchant_id = 'MERCH001'
      UNION ALL
      SELECT 'bank_statements (MANUAL)', COUNT(*)
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
      UNION ALL
      SELECT 'settlement_batches (MERCH001)', COUNT(*)
      FROM sp_v2_settlement_batches
      WHERE merchant_id = 'MERCH001'
      ORDER BY table_name
    `);

    counts.rows.forEach(row => {
      console.log(`  ${row.table_name}: ${row.count}`);
    });

    console.log('\n✅ Cleanup done! Ready for fresh test.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

clearMerchant();
