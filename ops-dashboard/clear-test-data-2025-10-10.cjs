#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function clearTestData() {
  const client = await pool.connect();

  try {
    console.log('🧹 Clearing test data...\n');

    // Delete settlement items first (FK constraint)
    const itemsResult = await client.query(`
      DELETE FROM sp_v2_settlement_items
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
      )
    `);
    console.log(`✓ Deleted ${itemsResult.rowCount} settlement items`);

    // Delete bank transfers (FK to settlement_batches)
    const transfersResult = await client.query(`
      DELETE FROM sp_v2_settlement_bank_transfers
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
      )
    `);
    console.log(`✓ Deleted ${transfersResult.rowCount} bank transfers`);

    // Unlink transactions from settlement batches (FK constraint)
    const unlinkResult = await client.query(`
      UPDATE sp_v2_transactions
      SET settlement_batch_id = NULL
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
      )
    `);
    console.log(`✓ Unlinked ${unlinkResult.rowCount} transactions from batches`);

    // Delete rolling reserve ledger entries (FK to settlement_batches)
    const reserveResult = await client.query(`
      DELETE FROM sp_v2_rolling_reserve_ledger
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
      )
    `);
    console.log(`✓ Deleted ${reserveResult.rowCount} rolling reserve entries`);

    // Delete bank transfer queue entries (FK to settlement_batches)
    const queueResult = await client.query(`
      DELETE FROM sp_v2_bank_transfer_queue
      WHERE batch_id IN (
        SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
      )
    `);
    console.log(`✓ Deleted ${queueResult.rowCount} bank transfer queue entries`);

    // Delete payout files first (FK to payout)
    const payoutFileResult = await client.query(`
      DELETE FROM sp_v2_payout_file
      WHERE payout_id IN (
        SELECT id FROM sp_v2_payout WHERE batch_id IN (
          SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
        )
      )
    `);
    console.log(`✓ Deleted ${payoutFileResult.rowCount} payout file entries`);

    // Delete payout entries (FK to settlement_batches)
    const payoutResult = await client.query(`
      DELETE FROM sp_v2_payout
      WHERE batch_id IN (
        SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
      )
    `);
    console.log(`✓ Deleted ${payoutResult.rowCount} payout entries`);

    // Delete settlement timeline events (FK to settlement_batches)
    const timelineResult = await client.query(`
      DELETE FROM sp_v2_settlement_timeline_events
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
      )
    `);
    console.log(`✓ Deleted ${timelineResult.rowCount} timeline events`);

    // Delete settlement approvals (FK to settlement_batches)
    const approvalsResult = await client.query(`
      DELETE FROM sp_v2_settlement_approvals
      WHERE batch_id IN (
        SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
      )
    `);
    console.log(`✓ Deleted ${approvalsResult.rowCount} approval records`);

    // Delete settlement batches
    const batchesResult = await client.query(`
      DELETE FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
    `);
    console.log(`✓ Deleted ${batchesResult.rowCount} settlement batches`);

    // Delete reconciliation results
    const reconResult = await client.query(`
      DELETE FROM sp_v2_reconciliation_results WHERE pg_transaction_id LIKE 'TXN2025%'
    `);
    console.log(`✓ Deleted ${reconResult.rowCount} reconciliation results`);

    // Delete transactions
    const txnResult = await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE source_type = 'MANUAL_UPLOAD' AND merchant_id = 'MERCH001'
    `);
    console.log(`✓ Deleted ${txnResult.rowCount} transactions`);

    // Delete bank statements
    const bankResult = await client.query(`
      DELETE FROM sp_v2_bank_statements WHERE source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`✓ Deleted ${bankResult.rowCount} bank statements`);

    // Show current counts
    console.log('\n📊 Current table counts:');
    const counts = await client.query(`
      SELECT 'transactions' as table_name, COUNT(*) as count FROM sp_v2_transactions
      UNION ALL
      SELECT 'bank_statements', COUNT(*) FROM sp_v2_bank_statements
      UNION ALL
      SELECT 'settlement_batches', COUNT(*) FROM sp_v2_settlement_batches
      UNION ALL
      SELECT 'settlement_items', COUNT(*) FROM sp_v2_settlement_items
      ORDER BY table_name
    `);

    counts.rows.forEach(row => {
      console.log(`  ${row.table_name}: ${row.count}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

clearTestData();
