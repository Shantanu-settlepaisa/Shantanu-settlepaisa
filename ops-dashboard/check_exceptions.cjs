const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function checkExceptions() {
  const client = await pool.connect();

  try {
    const newJobId = '8464574c-9fe9-43d5-b57e-25d0e4427fd5';

    console.log('\n=== EXCEPTION ANALYSIS ===\n');

    // Get all exceptions for the new job
    const exceptions = await client.query(`
      SELECT
        id,
        pg_transaction_id,
        bank_statement_id,
        match_status,
        exception_reason_code,
        exception_message
      FROM sp_v2_reconciliation_results
      WHERE job_id = $1
        AND match_status = 'EXCEPTION'
      ORDER BY id
    `, [newJobId]);

    console.log(`Total exceptions: ${exceptions.rows.length}\n`);

    let exceptionsWithPg = 0;
    let exceptionsWithoutPg = 0;

    exceptions.rows.forEach((row, index) => {
      console.log(`Exception ${index + 1}:`);
      console.log(`  PG Transaction ID: ${row.pg_transaction_id || 'NULL'}`);
      console.log(`  Bank Statement ID: ${row.bank_statement_id || 'NULL'}`);
      console.log(`  Exception Code: ${row.exception_reason_code}`);
      console.log(`  Exception Message: ${row.exception_message}`);

      if (row.pg_transaction_id) {
        exceptionsWithPg++;
      } else {
        exceptionsWithoutPg++;
      }
      console.log('');
    });

    console.log('=== SUMMARY ===');
    console.log(`Exceptions with PG data: ${exceptionsWithPg}`);
    console.log(`Exceptions without PG data (bank-only): ${exceptionsWithoutPg}`);
    console.log('');
    console.log('=== CALCULATION VERIFICATION ===');

    const job = await client.query(`
      SELECT
        matched_records,
        unmatched_pg,
        exception_records,
        total_pg_records
      FROM sp_v2_reconciliation_jobs
      WHERE job_id = $1
    `, [newJobId]);

    const matched = job.rows[0].matched_records;
    const unmatchedPg = job.rows[0].unmatched_pg;
    const totalExceptions = job.rows[0].exception_records;
    const totalPgRecords = job.rows[0].total_pg_records;

    const expectedTotal = matched + unmatchedPg + exceptionsWithPg;

    console.log(`Matched: ${matched}`);
    console.log(`Unmatched PG: ${unmatchedPg}`);
    console.log(`Total Exceptions: ${totalExceptions}`);
    console.log(`Exceptions with PG: ${exceptionsWithPg}`);
    console.log('');
    console.log(`Expected total_pg_records: ${matched} + ${unmatchedPg} + ${exceptionsWithPg} = ${expectedTotal}`);
    console.log(`Actual total_pg_records: ${totalPgRecords}`);
    console.log('');

    if (totalPgRecords === expectedTotal) {
      console.log('✅ FIX VERIFIED! total_pg_records correctly includes only exceptions with PG data.');
    } else {
      console.log(`⚠️ ISSUE: total_pg_records (${totalPgRecords}) != expected (${expectedTotal})`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

checkExceptions();
