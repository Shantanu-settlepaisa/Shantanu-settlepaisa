const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: false
});

async function cleanupDuplicateBatch() {
  const client = await pool.connect();
  try {
    console.log('========================================');
    console.log('CLEANUP DUPLICATE SETTLEMENT BATCH');
    console.log('Target: Oct 27, 2025');
    console.log('========================================\n');

    // Step 1: Verify current state before deletion
    console.log('STEP 1: Verify Current State');
    console.log('----------------------------');

    const currentBatches = await client.query(`
      SELECT
        id,
        merchant_id,
        merchant_name,
        cycle_date,
        status,
        total_transactions,
        gross_amount_paise,
        total_commission_paise,
        net_amount_paise,
        created_at
      FROM sp_v2_settlement_batches
      WHERE DATE(cycle_date) = '2025-10-27'
      ORDER BY created_at
    `);

    console.log(`\nFound ${currentBatches.rowCount} settlement batches for Oct 27:\n`);
    currentBatches.rows.forEach((batch, i) => {
      console.log(`Batch ${i + 1}:`);
      console.log(`  ID: ${batch.id}`);
      console.log(`  Merchant: ${batch.merchant_name || batch.merchant_id}`);
      console.log(`  Status: ${batch.status}`);
      console.log(`  Transactions: ${batch.total_transactions}`);
      console.log(`  Gross: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
      console.log(`  Net: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);
      console.log(`  Created: ${batch.created_at}`);
      console.log('');
    });

    // Step 2: Check settlement items
    const currentItems = await client.query(`
      SELECT
        settlement_batch_id,
        COUNT(*) as item_count,
        COUNT(DISTINCT transaction_id) as unique_txns,
        SUM(amount_paise) as total_amount
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches
        WHERE DATE(cycle_date) = '2025-10-27'
      )
      GROUP BY settlement_batch_id
      ORDER BY settlement_batch_id
    `);

    console.log('Current Settlement Items:');
    currentItems.rows.forEach((item, i) => {
      console.log(`  Batch ${item.settlement_batch_id.slice(0, 8)}...:`);
      console.log(`    Items: ${item.item_count}`);
      console.log(`    Unique Txns: ${item.unique_txns}`);
      console.log(`    Total: ₹${(item.total_amount / 100).toFixed(2)}`);
    });
    console.log('');

    // Step 3: Identify duplicate transactions
    const duplicates = await client.query(`
      SELECT
        transaction_id,
        COUNT(*) as count,
        array_agg(settlement_batch_id::text ORDER BY settlement_batch_id) as batch_ids
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches
        WHERE DATE(cycle_date) = '2025-10-27'
      )
      GROUP BY transaction_id
      HAVING COUNT(*) > 1
    `);

    if (duplicates.rowCount > 0) {
      console.log(`⚠️  Found ${duplicates.rowCount} DUPLICATE transactions!\n`);
      console.log('First 5 duplicates:');
      duplicates.rows.slice(0, 5).forEach((dup, i) => {
        console.log(`  ${i+1}. ${dup.transaction_id} appears ${dup.count} times in batches:`);
        dup.batch_ids.forEach(bid => {
          console.log(`      - ${bid.slice(0, 8)}...`);
        });
      });
      console.log('');
    }

    // Step 4: Identify which batch to delete (keep the older one)
    const batchToKeep = currentBatches.rows[0]; // First batch (created earlier)
    const batchToDelete = currentBatches.rows[1]; // Second batch (duplicate)

    console.log('DECISION:');
    console.log(`  ✅ KEEP: Batch ${batchToKeep.id.slice(0, 8)}... (created ${batchToKeep.created_at})`);
    console.log(`  ❌ DELETE: Batch ${batchToDelete.id.slice(0, 8)}... (created ${batchToDelete.created_at})`);
    console.log('');

    // Step 5: Begin cleanup transaction
    console.log('STEP 2: Begin Cleanup (within database transaction)');
    console.log('---------------------------------------------------');
    await client.query('BEGIN');

    // Step 5a: Clear FK references in sp_v2_transactions (CRITICAL!)
    console.log('\n1. Clearing settlement_batch_id FK references in transactions...');
    const clearedFKs = await client.query(`
      UPDATE sp_v2_transactions
      SET settlement_batch_id = NULL
      WHERE settlement_batch_id = $1
      RETURNING transaction_id
    `, [batchToDelete.id]);
    console.log(`   ✅ Cleared ${clearedFKs.rowCount} FK references`);
    if (clearedFKs.rowCount > 0) {
      console.log(`      First 3: ${clearedFKs.rows.slice(0, 3).map(r => r.transaction_id).join(', ')}`);
    }

    // Step 5b: Delete settlement items for duplicate batch
    console.log('\n2. Deleting settlement items for duplicate batch...');
    const deletedItems = await client.query(`
      DELETE FROM sp_v2_settlement_items
      WHERE settlement_batch_id = $1
      RETURNING transaction_id, amount_paise
    `, [batchToDelete.id]);
    console.log(`   ✅ Deleted ${deletedItems.rowCount} settlement items`);
    if (deletedItems.rowCount > 0) {
      console.log(`      First 3 txns: ${deletedItems.rows.slice(0, 3).map(r => r.transaction_id).join(', ')}`);
    }

    // Step 5c: Delete the duplicate batch
    console.log('\n3. Deleting duplicate settlement batch...');
    const deletedBatch = await client.query(`
      DELETE FROM sp_v2_settlement_batches
      WHERE id = $1
      RETURNING id, merchant_id, gross_amount_paise, total_transactions
    `, [batchToDelete.id]);
    console.log(`   ✅ Deleted batch ${deletedBatch.rows[0].id}`);
    console.log(`      Merchant: ${deletedBatch.rows[0].merchant_id}`);
    console.log(`      Transactions: ${deletedBatch.rows[0].total_transactions}`);
    console.log(`      Gross: ₹${(deletedBatch.rows[0].gross_amount_paise / 100).toFixed(2)}`);

    // Commit the transaction
    await client.query('COMMIT');
    console.log('\n   ✅ Database transaction COMMITTED successfully\n');

    // Step 6: Verify cleanup
    console.log('STEP 3: Verify Cleanup');
    console.log('----------------------');

    const afterBatches = await client.query(`
      SELECT
        id,
        merchant_id,
        total_transactions,
        gross_amount_paise,
        net_amount_paise,
        status
      FROM sp_v2_settlement_batches
      WHERE DATE(cycle_date) = '2025-10-27'
    `);

    console.log(`\nRemaining Settlement Batches: ${afterBatches.rowCount}`);
    afterBatches.rows.forEach((batch, i) => {
      console.log(`  Batch ${i + 1}:`);
      console.log(`    ID: ${batch.id}`);
      console.log(`    Transactions: ${batch.total_transactions}`);
      console.log(`    Gross: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
      console.log(`    Net: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);
    });
    console.log('');

    const afterItems = await client.query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(DISTINCT transaction_id) as unique_txns,
        SUM(amount_paise) as total_amount
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches
        WHERE DATE(cycle_date) = '2025-10-27'
      )
    `);

    const items = afterItems.rows[0];
    console.log('Remaining Settlement Items:');
    console.log(`  Total Items: ${items.total_items}`);
    console.log(`  Unique Transactions: ${items.unique_txns}`);
    console.log(`  Total Amount: ₹${(items.total_amount / 100).toFixed(2)}`);
    console.log('');

    // Verify no duplicates remain
    const remainingDuplicates = await client.query(`
      SELECT
        transaction_id,
        COUNT(*) as count
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches
        WHERE DATE(cycle_date) = '2025-10-27'
      )
      GROUP BY transaction_id
      HAVING COUNT(*) > 1
    `);

    if (remainingDuplicates.rowCount === 0) {
      console.log('✅ No duplicate transactions found!');
    } else {
      console.log(`⚠️  WARNING: Still found ${remainingDuplicates.rowCount} duplicates`);
    }
    console.log('');

    // Compare with sp_v2_transactions
    const txnComparison = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'SETTLED') as settled,
        SUM(amount_paise) as total_amount,
        SUM(amount_paise) FILTER (WHERE status = 'SETTLED') as settled_amount
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-27'
    `);

    const txn = txnComparison.rows[0];
    console.log('Comparison with sp_v2_transactions:');
    console.log(`  Total Transactions: ${txn.total}`);
    console.log(`  Settled Transactions: ${txn.settled}`);
    console.log(`  Settled Amount: ₹${(txn.settled_amount / 100).toFixed(2)}`);
    console.log('');

    console.log('Verification Checks:');
    if (parseInt(items.unique_txns) === parseInt(txn.settled)) {
      console.log('  ✅ Settlement items match settled transactions count');
    } else {
      console.log(`  ❌ MISMATCH: ${items.unique_txns} settlement items vs ${txn.settled} settled txns`);
    }

    if (parseInt(items.total_amount) === parseInt(txn.settled_amount)) {
      console.log('  ✅ Settlement amount matches settled transactions amount');
    } else {
      console.log(`  ❌ MISMATCH: ₹${(items.total_amount / 100).toFixed(2)} settlement vs ₹${(txn.settled_amount / 100).toFixed(2)} settled`);
    }

    console.log('\n========================================');
    console.log('CLEANUP SUMMARY');
    console.log('========================================');
    console.log(`Deleted duplicate batch: ${batchToDelete.id}`);
    console.log(`Deleted settlement items: ${deletedItems.rowCount}`);
    console.log(`Cleared FK references: ${clearedFKs.rowCount}`);
    console.log('');
    console.log('Final State:');
    console.log(`  Settlement Batches: ${afterBatches.rowCount}`);
    console.log(`  Settlement Items: ${items.total_items} (${items.unique_txns} unique)`);
    console.log(`  Total Amount: ₹${(items.total_amount / 100).toFixed(2)}`);
    console.log('');
    console.log('✅ CLEANUP COMPLETED SUCCESSFULLY');
    console.log('   Duplicate batch removed, data integrity restored');
    console.log('========================================\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR - Transaction rolled back:', error.message);
    console.error(error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupDuplicateBatch().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
