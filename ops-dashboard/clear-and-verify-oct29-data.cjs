#!/usr/bin/env node

/**
 * Clear Oct 29 test data and verify database is ready for fresh upload test
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: 'SettlePaisa2024',
  database: 'settlepaisa_v2'
});

async function clearAndVerify() {
  const client = await pool.connect();

  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧹 Clearing Oct 29 Test Data');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await client.query('BEGIN');

    // 1. Check what's there before deletion
    console.log('📊 BEFORE DELETION:\n');

    const pgBefore = await client.query(`
      SELECT
        source_type,
        COUNT(*) as count,
        MIN(transaction_date) as min_date,
        MAX(transaction_date) as max_date
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-29'
      GROUP BY source_type
    `);

    console.log('PG Transactions (Oct 29):');
    pgBefore.rows.forEach(row => {
      console.log(`  ${row.source_type}: ${row.count} records`);
    });

    const bankBefore = await client.query(`
      SELECT
        bank_name,
        source_type,
        COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-29'
      GROUP BY bank_name, source_type
    `);

    console.log('\nBank Statements (Oct 29):');
    bankBefore.rows.forEach(row => {
      console.log(`  ${row.bank_name} (${row.source_type}): ${row.count} records`);
    });

    const reconBefore = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_recon_jobs
      WHERE DATE(created_at) >= '2025-10-29'
    `);
    console.log(`\nRecon Jobs (Oct 29+): ${reconBefore.rows[0].count} jobs`);

    // 2. Delete test data
    console.log('\n\n🗑️  DELETING TEST DATA:\n');

    // Delete recon results first (foreign keys)
    const reconResults = await client.query(`
      DELETE FROM sp_v2_recon_results
      WHERE job_id IN (
        SELECT id FROM sp_v2_recon_jobs
        WHERE DATE(created_at) >= '2025-10-29'
      )
      RETURNING id
    `);
    console.log(`✅ Deleted ${reconResults.rowCount} recon results`);

    // Delete recon matches
    const reconMatches = await client.query(`
      DELETE FROM sp_v2_recon_matches
      WHERE job_id IN (
        SELECT id FROM sp_v2_recon_jobs
        WHERE DATE(created_at) >= '2025-10-29'
      )
      RETURNING id
    `);
    console.log(`✅ Deleted ${reconMatches.rowCount} recon matches`);

    // Delete recon jobs
    const reconJobs = await client.query(`
      DELETE FROM sp_v2_recon_jobs
      WHERE DATE(created_at) >= '2025-10-29'
      RETURNING id
    `);
    console.log(`✅ Deleted ${reconJobs.rowCount} recon jobs`);

    // Delete PG transactions (manual uploads only)
    const pgDeleted = await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
      RETURNING transaction_id
    `);
    console.log(`✅ Deleted ${pgDeleted.rowCount} PG transactions`);

    // Delete bank statements (manual uploads only)
    const bankDeleted = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
      RETURNING id
    `);
    console.log(`✅ Deleted ${bankDeleted.rowCount} bank statements`);

    await client.query('COMMIT');

    // 3. Verify clean state
    console.log('\n\n✅ AFTER DELETION:\n');

    const pgAfter = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`PG Transactions (Oct 29): ${pgAfter.rows[0].count} records`);

    const bankAfter = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`Bank Statements (Oct 29): ${bankAfter.rows[0].count} records`);

    const reconAfter = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_recon_jobs
      WHERE DATE(created_at) >= '2025-10-29'
    `);
    console.log(`Recon Jobs (Oct 29+): ${reconAfter.rows[0].count} jobs`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Database is clean and ready for fresh upload test');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearAndVerify();
