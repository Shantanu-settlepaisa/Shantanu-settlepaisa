#!/usr/bin/env node

/**
 * Clean Test Data from Staging 2 Database
 *
 * This script removes all test data uploaded for reconciliation testing
 * to allow fresh test runs without old data interfering.
 *
 * Usage on EC2:
 *   node clean-test-data-oct30.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST_STAGING_2 || process.env.DB_HOST,
  port: process.env.DB_PORT_STAGING_2 || process.env.DB_PORT || 5432,
  database: process.env.DB_NAME_STAGING_2 || process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER_STAGING_2 || process.env.DB_USER,
  password: process.env.DB_PASSWORD_STAGING_2 || process.env.DB_PASSWORD
});

async function cleanDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔍 Checking current data...\n');

    // Check current counts
    const txnCount = await client.query('SELECT COUNT(*) FROM sp_v2_transactions WHERE source_type = $1', ['pg_upload']);
    const bankCount = await client.query('SELECT COUNT(*) FROM sp_v2_bank_statements');
    const jobCount = await client.query('SELECT COUNT(*) FROM sp_v2_reconciliation_jobs');
    const resultCount = await client.query('SELECT COUNT(*) FROM sp_v2_reconciliation_results');
    const exceptionCount = await client.query('SELECT COUNT(*) FROM sp_v2_exception_workflow');

    console.log('Current Data:');
    console.log(`  - PG Transactions (manual uploads): ${txnCount.rows[0].count}`);
    console.log(`  - Bank Statements: ${bankCount.rows[0].count}`);
    console.log(`  - Recon Jobs: ${jobCount.rows[0].count}`);
    console.log(`  - Recon Results: ${resultCount.rows[0].count}`);
    console.log(`  - Exceptions: ${exceptionCount.rows[0].count}`);
    console.log('');

    if (parseInt(txnCount.rows[0].count) === 0 && parseInt(bankCount.rows[0].count) === 0) {
      console.log('✅ Database is already clean. No data to delete.');
      return;
    }

    console.log('🗑️  Cleaning database...\n');

    await client.query('BEGIN');

    // Delete in correct order due to foreign key constraints
    const del1 = await client.query('DELETE FROM sp_v2_reconciliation_results');
    console.log(`  ✓ Deleted ${del1.rowCount} recon results`);

    const del2 = await client.query('DELETE FROM sp_v2_exception_workflow');
    console.log(`  ✓ Deleted ${del2.rowCount} exceptions`);

    const del3 = await client.query('DELETE FROM sp_v2_reconciliation_jobs');
    console.log(`  ✓ Deleted ${del3.rowCount} recon jobs`);

    const del4 = await client.query('DELETE FROM sp_v2_bank_statements');
    console.log(`  ✓ Deleted ${del4.rowCount} bank statements`);

    const del5 = await client.query("DELETE FROM sp_v2_transactions WHERE source_type = 'pg_upload'");
    console.log(`  ✓ Deleted ${del5.rowCount} PG transactions (manual uploads)`);

    await client.query('COMMIT');

    console.log('\n✅ Database cleaned successfully!');
    console.log('\n📊 You can now upload fresh test files for reconciliation.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error cleaning database:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run cleanup
cleanDatabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
