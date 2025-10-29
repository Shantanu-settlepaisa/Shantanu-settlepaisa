#!/usr/bin/env node

/**
 * Clear old test data from staging-2 database
 * Run this before re-uploading files to test the UTR mapping fix
 */

const { Pool } = require('pg');
require('dotenv').config({ path: './services/recon-api/.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

async function clearTestData() {
  try {
    console.log('🗑️  Clearing old test data from staging-2...\n');

    // Count records before deletion
    const countBefore = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sp_v2_bank_statements WHERE source_type IN ('AXIS BANK', 'BOB', 'HDFC BANK', 'MANUAL_UPLOAD')) as bank_count,
        (SELECT COUNT(*) FROM sp_v2_transactions WHERE source_type = 'PG') as pg_count,
        (SELECT COUNT(*) FROM sp_v2_reconciliation_results WHERE created_at > NOW() - INTERVAL '1 day') as recon_count
    `);

    console.log('📊 Records to be deleted:');
    console.log(`   Bank statements: ${countBefore.rows[0].bank_count}`);
    console.log(`   PG transactions: ${countBefore.rows[0].pg_count}`);
    console.log(`   Recon results (last 24h): ${countBefore.rows[0].recon_count}`);
    console.log('');

    // Delete bank statements
    console.log('🗑️  Deleting bank statements...');
    const deletedBank = await pool.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE source_type IN ('AXIS BANK', 'BOB', 'HDFC BANK', 'MANUAL_UPLOAD')
      RETURNING id
    `);
    console.log(`   ✅ Deleted ${deletedBank.rowCount} bank statements`);

    // Delete PG transactions
    console.log('🗑️  Deleting PG transactions...');
    const deletedPG = await pool.query(`
      DELETE FROM sp_v2_transactions
      WHERE source_type = 'PG'
      RETURNING id
    `);
    console.log(`   ✅ Deleted ${deletedPG.rowCount} PG transactions`);

    // Delete recent reconciliation results
    console.log('🗑️  Deleting recent reconciliation results...');
    const deletedRecon = await pool.query(`
      DELETE FROM sp_v2_reconciliation_results
      WHERE created_at > NOW() - INTERVAL '1 day'
      RETURNING id
    `);
    console.log(`   ✅ Deleted ${deletedRecon.rowCount} reconciliation results`);

    console.log('\n✅ All old test data cleared!');
    console.log('\n📝 Next steps:');
    console.log('   1. Go to: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon');
    console.log('   2. Upload all 4 CSV files fresh:');
    console.log('      - pg_transactions.csv');
    console.log('      - hdfc_bank_statements.csv');
    console.log('      - axis_bank_statements.csv');
    console.log('      - bob_bank_statements.csv');
    console.log('   3. Run Reconciliation');
    console.log('   4. Expected: 50/50 matched! 🎉');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

clearTestData();
