const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function checkNewJob() {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        job_id,
        date_from,
        total_pg_records,
        matched_records,
        unmatched_pg,
        exception_records,
        ROUND(total_amount_paise / 100.0, 2) as total_amount_rs,
        ROUND(reconciled_amount_paise / 100.0, 2) as reconciled_amount_rs,
        processing_start
      FROM sp_v2_reconciliation_jobs
      WHERE date_from = '2025-10-10'
      ORDER BY processing_start DESC
      LIMIT 2
    `);

    console.log('\n=== RECONCILIATION JOBS FOR 2025-10-10 ===\n');

    result.rows.forEach((row, index) => {
      console.log(`Job ${index + 1}:`);
      console.log(`  Job ID: ${row.job_id}`);
      console.log(`  Processing Start: ${row.processing_start}`);
      console.log(`  Total PG Records: ${row.total_pg_records}`);
      console.log(`  Matched: ${row.matched_records}`);
      console.log(`  Unmatched PG: ${row.unmatched_pg}`);
      console.log(`  Exceptions: ${row.exception_records}`);
      console.log(`  Sum (matched + unmatched_pg + exceptions): ${row.matched_records + row.unmatched_pg + row.exception_records}`);
      console.log(`  Total Amount: ₹${row.total_amount_rs}`);
      console.log(`  Reconciled Amount: ₹${row.reconciled_amount_rs}`);
      console.log('');
    });

    if (result.rows.length >= 2) {
      const newJob = result.rows[0];
      const oldJob = result.rows[1];

      console.log('=== COMPARISON ===');
      console.log(`Old job total_pg_records: ${oldJob.total_pg_records} (WRONG - missing exceptions)`);
      console.log(`New job total_pg_records: ${newJob.total_pg_records} (SHOULD BE CORRECT)`);
      console.log('');
      console.log('Expected: matched + unmatched_pg + exceptions with PG data');
      console.log(`New job calculation: ${newJob.matched_records} + ${newJob.unmatched_pg} + (exceptions) = ?`);
      console.log('');

      // Check if the fix worked
      const expectedTotal = newJob.matched_records + newJob.unmatched_pg + newJob.exception_records;
      if (newJob.total_pg_records === expectedTotal) {
        console.log('✅ FIX VERIFIED! total_pg_records matches the sum of all PG-related records.');
      } else {
        console.log(`⚠️ ISSUE: total_pg_records (${newJob.total_pg_records}) does not match expected (${expectedTotal})`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

checkNewJob();
