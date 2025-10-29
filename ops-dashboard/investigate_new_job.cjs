const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function investigate() {
  const client = await pool.connect();

  try {
    const newJobId = '7ee4caa4-3933-4a01-bb37-f8ce0f1ffd7a';

    console.log('\n=== INVESTIGATION OF NEW JOB ===\n');

    // Get all reconciliation results
    const allResults = await client.query(`
      SELECT
        match_status,
        COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE job_id = $1
      GROUP BY match_status
    `, [newJobId]);

    console.log('Results by match_status:');
    allResults.rows.forEach(row => {
      console.log(`  ${row.match_status}: ${row.count}`);
    });

    // Get exception breakdown
    const exceptions = await client.query(`
      SELECT
        pg_transaction_id,
        exception_reason_code
      FROM sp_v2_reconciliation_results
      WHERE job_id = $1
        AND match_status = 'EXCEPTION'
      ORDER BY pg_transaction_id
    `, [newJobId]);

    console.log(`\n=== EXCEPTIONS (${exceptions.rows.length}) ===`);
    exceptions.rows.forEach(row => {
      console.log(`  ${row.pg_transaction_id}: ${row.exception_reason_code}`);
    });

    // Check job summary
    const job = await client.query(`
      SELECT
        matched_records,
        unmatched_pg,
        exception_records,
        total_pg_records
      FROM sp_v2_reconciliation_jobs
      WHERE job_id = $1
    `, [newJobId]);

    console.log('\n=== JOB SUMMARY ===');
    console.log(`  Matched: ${job.rows[0].matched_records}`);
    console.log(`  Unmatched PG: ${job.rows[0].unmatched_pg}`);
    console.log(`  Exceptions: ${job.rows[0].exception_records}`);
    console.log(`  Total PG Records: ${job.rows[0].total_pg_records}`);

    console.log('\n=== MISMATCH DETECTED ===');
    console.log(`  Job summary says: ${job.rows[0].exception_records} exceptions`);
    console.log(`  But results table has: ${exceptions.rows.length} EXCEPTION records`);
    console.log(`  Difference: ${exceptions.rows.length - job.rows[0].exception_records}`);

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

investigate();
