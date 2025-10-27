const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: false
});

async function cleanupOldTestData() {
  const client = await pool.connect();
  try {
    console.log('========================================');
    console.log('CLEANUP OLD TEST DATA - STAGING 2 RDS');
    console.log('Target: Keep only Oct 27, 2025 data');
    console.log('Delete: Oct 1, 22, 24, 26 data');
    console.log('========================================\n');

    // Step 1: Verify current data before deletion
    console.log('STEP 1: Verify Current Data');
    console.log('----------------------------');

    const currentData = await client.query(`
      SELECT
        DATE(transaction_date) as txn_date,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_transactions
      GROUP BY DATE(transaction_date)
      ORDER BY DATE(transaction_date) DESC
    `);

    console.log('\nCurrent Transactions by Date:');
    currentData.rows.forEach(row => {
      console.log(`  ${row.txn_date}: ${row.count} txns, ₹${(row.total_paise / 100).toFixed(2)}`);
    });

    const totalBefore = currentData.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    console.log(`\n  TOTAL: ${totalBefore} transactions\n`);

    // Step 2: Check bank statements
    const bankData = await client.query(`
      SELECT
        DATE(transaction_date) as txn_date,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
      GROUP BY DATE(transaction_date)
      ORDER BY DATE(transaction_date) DESC
    `);

    console.log('Current Bank Statements by Date:');
    bankData.rows.forEach(row => {
      console.log(`  ${row.txn_date}: ${row.count} records, ₹${(row.total_paise / 100).toFixed(2)}`);
    });
    console.log('');

    // Step 3: Check settlement batches
    const batchData = await client.query(`
      SELECT
        DATE(cycle_date) as cycle_date,
        COUNT(*) as count,
        SUM(gross_amount_paise) as total_paise
      FROM sp_v2_settlement_batches
      GROUP BY DATE(cycle_date)
      ORDER BY DATE(cycle_date) DESC
    `);

    console.log('Current Settlement Batches by Date:');
    batchData.rows.forEach(row => {
      console.log(`  ${row.cycle_date}: ${row.count} batches, ₹${(row.total_paise / 100).toFixed(2)}`);
    });
    console.log('\n');

    // Step 4: Begin cleanup transaction
    console.log('STEP 2: Begin Cleanup (within database transaction)');
    console.log('---------------------------------------------------');
    await client.query('BEGIN');

    const datesToDelete = ['2025-10-01', '2025-10-22', '2025-10-24', '2025-10-26'];

    // Step 1: Clear FK references in sp_v2_transactions (CRITICAL!)
    console.log('\n1. Clearing settlement_batch_id FK references in transactions...');
    const clearedFKs = await client.query(`
      UPDATE sp_v2_transactions
      SET settlement_batch_id = NULL
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches
        WHERE DATE(cycle_date) = ANY($1)
      )
      RETURNING transaction_id, settlement_batch_id
    `, [datesToDelete]);
    console.log(`   ✅ Cleared ${clearedFKs.rowCount} FK references`);
    if (clearedFKs.rowCount > 0) {
      clearedFKs.rows.slice(0, 3).forEach((row, i) => {
        console.log(`      ${i+1}. ${row.transaction_id} | was linked to batch ${row.settlement_batch_id}`);
      });
    }

    // Step 2: Delete settlement items (now safe)
    console.log('\n2. Deleting settlement items for old batches...');
    const deletedItems = await client.query(`
      DELETE FROM sp_v2_settlement_items
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches
        WHERE DATE(cycle_date) = ANY($1)
      )
    `, [datesToDelete]);
    console.log(`   ✅ Deleted ${deletedItems.rowCount} settlement items`);

    // Step 3: Delete settlement batches (now safe)
    console.log('\n3. Deleting settlement batches...');
    const deletedBatches = await client.query(`
      DELETE FROM sp_v2_settlement_batches
      WHERE DATE(cycle_date) = ANY($1)
      RETURNING id, cycle_date, merchant_id, gross_amount_paise
    `, [datesToDelete]);
    console.log(`   ✅ Deleted ${deletedBatches.rowCount} settlement batches`);
    if (deletedBatches.rowCount > 0) {
      deletedBatches.rows.slice(0, 3).forEach((row, i) => {
        console.log(`      ${i+1}. Batch ${row.id}: ${row.cycle_date} | ${row.merchant_id} | ₹${(row.gross_amount_paise / 100).toFixed(2)}`);
      });
    }

    // Step 4: Delete bank statements
    console.log('\n4. Deleting bank statements...');
    const deletedBank = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = ANY($1)
      AND source_type = 'MANUAL_UPLOAD'
      RETURNING id, bank_name, utr, amount_paise
    `, [datesToDelete]);
    console.log(`   ✅ Deleted ${deletedBank.rowCount} bank statements`);
    if (deletedBank.rowCount > 0) {
      deletedBank.rows.slice(0, 3).forEach((row, i) => {
        console.log(`      ${i+1}. ${row.bank_name} | UTR: ${row.utr} | ₹${(row.amount_paise / 100).toFixed(2)}`);
      });
    }

    // Step 5: Delete transactions
    console.log('\n5. Deleting transactions...');
    const deletedTxns = await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE DATE(transaction_date) = ANY($1)
      RETURNING transaction_id, status, amount_paise, transaction_date
    `, [datesToDelete]);
    console.log(`   ✅ Deleted ${deletedTxns.rowCount} transactions`);
    if (deletedTxns.rowCount > 0) {
      deletedTxns.rows.slice(0, 3).forEach((row, i) => {
        console.log(`      ${i+1}. ${row.transaction_id} | ${row.status} | ₹${(row.amount_paise / 100).toFixed(2)} | ${row.transaction_date}`);
      });
    }

    // Commit the transaction
    await client.query('COMMIT');
    console.log('\n   ✅ Database transaction COMMITTED successfully\n');

    // Step 5: Verify cleanup
    console.log('STEP 3: Verify Cleanup');
    console.log('----------------------');

    const afterData = await client.query(`
      SELECT
        DATE(transaction_date) as txn_date,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise,
        string_agg(DISTINCT status, ', ') as statuses
      FROM sp_v2_transactions
      GROUP BY DATE(transaction_date)
      ORDER BY DATE(transaction_date) DESC
    `);

    console.log('\nRemaining Transactions by Date:');
    afterData.rows.forEach(row => {
      console.log(`  ${row.txn_date}: ${row.count} txns, ₹${(row.total_paise / 100).toFixed(2)} (${row.statuses})`);
    });

    const totalAfter = afterData.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    console.log(`\n  TOTAL: ${totalAfter} transactions\n`);

    const afterBank = await client.query(`
      SELECT
        DATE(transaction_date) as txn_date,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
      GROUP BY DATE(transaction_date)
      ORDER BY DATE(transaction_date) DESC
    `);

    console.log('Remaining Bank Statements by Date:');
    afterBank.rows.forEach(row => {
      console.log(`  ${row.txn_date}: ${row.count} records, ₹${(row.total_paise / 100).toFixed(2)}`);
    });
    console.log('');

    const afterBatches = await client.query(`
      SELECT
        DATE(cycle_date) as cycle_date,
        COUNT(*) as count,
        SUM(gross_amount_paise) as total_paise
      FROM sp_v2_settlement_batches
      GROUP BY DATE(cycle_date)
      ORDER BY DATE(cycle_date) DESC
    `);

    console.log('Remaining Settlement Batches by Date:');
    afterBatches.rows.forEach(row => {
      console.log(`  ${row.cycle_date}: ${row.count} batches, ₹${(row.total_paise / 100).toFixed(2)}`);
    });
    console.log('');

    // Summary
    console.log('========================================');
    console.log('CLEANUP SUMMARY');
    console.log('========================================');
    console.log(`Transactions: ${totalBefore} → ${totalAfter} (deleted ${totalBefore - totalAfter})`);
    console.log(`Settlement Items: Deleted ${deletedItems.rowCount}`);
    console.log(`Settlement Batches: Deleted ${deletedBatches.rowCount}`);
    console.log(`Bank Statements: Deleted ${deletedBank.rowCount}`);
    console.log('');
    console.log('✅ CLEANUP COMPLETED SUCCESSFULLY');
    console.log('   Only Oct 27, 2025 data remains');
    console.log('========================================\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR - Transaction rolled back:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupOldTestData().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
