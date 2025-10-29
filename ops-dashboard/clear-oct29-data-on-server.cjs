#!/usr/bin/env node
/**
 * Clear Oct 29 test data - RUN ON EC2 SERVER
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: 'SettlePaisa2024',
  database: 'settlepaisa_v2'
});

async function clearData() {
  const client = await pool.connect();
  try {
    console.log('🧹 Clearing Oct 29 test data...\n');

    // Delete recon data (skip if tables don't exist)
    try {
      const reconResults = await client.query(`DELETE FROM sp_v2_recon_results WHERE job_id IN (SELECT id FROM sp_v2_recon_jobs WHERE DATE(created_at) >= '2025-10-29')`);
      console.log(`✅ Deleted ${reconResults.rowCount} recon results`);
    } catch (e) {
      console.log('⏭️  Skipped recon_results (table not found)');
    }

    try {
      const reconMatches = await client.query(`DELETE FROM sp_v2_recon_matches WHERE job_id IN (SELECT id FROM sp_v2_recon_jobs WHERE DATE(created_at) >= '2025-10-29')`);
      console.log(`✅ Deleted ${reconMatches.rowCount} recon matches`);
    } catch (e) {
      console.log('⏭️  Skipped recon_matches (table not found)');
    }

    try {
      const reconJobs = await client.query(`DELETE FROM sp_v2_recon_jobs WHERE DATE(created_at) >= '2025-10-29'`);
      console.log(`✅ Deleted ${reconJobs.rowCount} recon jobs`);
    } catch (e) {
      console.log('⏭️  Skipped recon_jobs (table not found)');
    }

    // Delete transactions
    const pgDeleted = await client.query(`DELETE FROM sp_v2_transactions WHERE DATE(transaction_date) = '2025-10-29' AND source_type = 'MANUAL_UPLOAD'`);
    console.log(`✅ Deleted ${pgDeleted.rowCount} PG transactions`);

    // Delete bank statements
    const bankDeleted = await client.query(`DELETE FROM sp_v2_bank_statements WHERE DATE(transaction_date) = '2025-10-29' AND source_type = 'MANUAL_UPLOAD'`);
    console.log(`✅ Deleted ${bankDeleted.rowCount} bank statements`);

    console.log('\n✅ Database is clean!\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearData();
