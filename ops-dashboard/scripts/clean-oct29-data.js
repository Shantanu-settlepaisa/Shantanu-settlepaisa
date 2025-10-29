#!/usr/bin/env node

/**
 * Clean Oct 29, 2025 reconciliation data for fresh testing
 *
 * This script removes:
 * 1. All manual upload transactions for Oct 29
 * 2. All manual upload bank statements for Oct 29
 * 3. All reconciliation jobs for Oct 29
 * 4. All reconciliation results for Oct 29
 *
 * Usage:
 *   node clean-oct29-data.js [--date YYYY-MM-DD]
 *
 * Example:
 *   node clean-oct29-data.js
 *   node clean-oct29-data.js --date 2025-10-28
 */

const { Pool } = require('pg');

// Parse command line arguments
const args = process.argv.slice(2);
let targetDate = '2025-10-29';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    targetDate = args[i + 1];
    i++;
  }
}

const pool = new Pool({
  host: process.env.DB_HOST || 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'SettlePaisa2024',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  port: parseInt(process.env.DB_PORT || '5432')
});

async function cleanData() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(60));
    console.log(`🧹 Cleaning Reconciliation Data for ${targetDate}`);
    console.log('='.repeat(60));
    console.log();

    // Start transaction
    await client.query('BEGIN');

    // 1. Check what will be deleted
    console.log('📊 Current data counts:');
    console.log('-'.repeat(60));

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM sp_v2_transactions
         WHERE DATE(transaction_date) = $1 AND source_type = 'MANUAL_UPLOAD') as pg_count,
        (SELECT COUNT(*) FROM sp_v2_bank_statements
         WHERE DATE(transaction_date) = $1 AND source_type = 'MANUAL_UPLOAD') as bank_count,
        (SELECT COUNT(*) FROM sp_v2_reconciliation_jobs
         WHERE DATE(date_from) = $1) as jobs_count,
        (SELECT COUNT(*) FROM sp_v2_reconciliation_results
         WHERE DATE(created_at) = $1) as results_count
    `, [targetDate]);

    const { pg_count, bank_count, jobs_count, results_count } = counts.rows[0];

    console.log(`  PG Transactions:        ${pg_count}`);
    console.log(`  Bank Statements:        ${bank_count}`);
    console.log(`  Reconciliation Jobs:    ${jobs_count}`);
    console.log(`  Reconciliation Results: ${results_count}`);
    console.log();

    if (pg_count === '0' && bank_count === '0' && jobs_count === '0' && results_count === '0') {
      console.log('✅ No data found for this date. Nothing to clean.');
      await client.query('ROLLBACK');
      return;
    }

    // Show sample data before deletion
    console.log('📋 Sample data to be deleted:');
    console.log('-'.repeat(60));

    if (parseInt(pg_count) > 0) {
      const pgSample = await client.query(`
        SELECT transaction_id, utr, amount_paise, status
        FROM sp_v2_transactions
        WHERE DATE(transaction_date) = $1 AND source_type = 'MANUAL_UPLOAD'
        LIMIT 3
      `, [targetDate]);

      console.log('  PG Transactions:');
      pgSample.rows.forEach(r => {
        console.log(`    ${r.transaction_id}: UTR=${r.utr}, Amount=${r.amount_paise}, Status=${r.status}`);
      });
    }

    if (parseInt(bank_count) > 0) {
      const bankSample = await client.query(`
        SELECT id, bank_ref, amount_paise, processed
        FROM sp_v2_bank_statements
        WHERE DATE(transaction_date) = $1 AND source_type = 'MANUAL_UPLOAD'
        LIMIT 3
      `, [targetDate]);

      console.log('  Bank Statements:');
      bankSample.rows.forEach(r => {
        console.log(`    ID ${r.id}: Ref=${r.bank_ref}, Amount=${r.amount_paise}, Processed=${r.processed}`);
      });
    }
    console.log();

    // 2. Delete data (in correct order to respect foreign keys)
    console.log('🗑️  Deleting data...');
    console.log('-'.repeat(60));

    // Delete reconciliation results first (has FK to jobs)
    const deleteResults = await client.query(`
      DELETE FROM sp_v2_reconciliation_results
      WHERE DATE(created_at) = $1
    `, [targetDate]);
    console.log(`  ✓ Deleted ${deleteResults.rowCount} reconciliation results`);

    // Delete reconciliation jobs
    const deleteJobs = await client.query(`
      DELETE FROM sp_v2_reconciliation_jobs
      WHERE DATE(date_from) = $1
    `, [targetDate]);
    console.log(`  ✓ Deleted ${deleteJobs.rowCount} reconciliation jobs`);

    // Delete bank statements
    const deleteBank = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = $1 AND source_type = 'MANUAL_UPLOAD'
    `, [targetDate]);
    console.log(`  ✓ Deleted ${deleteBank.rowCount} bank statements`);

    // Delete PG transactions
    const deletePg = await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE DATE(transaction_date) = $1 AND source_type = 'MANUAL_UPLOAD'
    `, [targetDate]);
    console.log(`  ✓ Deleted ${deletePg.rowCount} PG transactions`);

    console.log();

    // Commit transaction
    await client.query('COMMIT');

    console.log('='.repeat(60));
    console.log('✅ Cleanup completed successfully!');
    console.log('='.repeat(60));
    console.log();
    console.log('📌 Summary:');
    console.log(`   Date cleaned: ${targetDate}`);
    console.log(`   PG transactions deleted: ${deletePg.rowCount}`);
    console.log(`   Bank statements deleted: ${deleteBank.rowCount}`);
    console.log(`   Reconciliation jobs deleted: ${deleteJobs.rowCount}`);
    console.log(`   Reconciliation results deleted: ${deleteResults.rowCount}`);
    console.log();
    console.log('🚀 You can now upload fresh files and run reconciliation.');
    console.log();

  } catch (err) {
    await client.query('ROLLBACK');
    console.error();
    console.error('❌ Error during cleanup:');
    console.error('   ', err.message);
    console.error();
    console.error('Stack trace:');
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Run cleanup
(async () => {
  try {
    await cleanData();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
})();
