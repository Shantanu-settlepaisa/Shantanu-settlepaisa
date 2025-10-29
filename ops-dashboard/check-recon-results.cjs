const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

const jobId = '3fd37507-a83b-48d7-929f-37986826913c';

async function checkReconResults() {
  try {
    console.log('========== RECON RESULTS CHECK ==========\n');
    console.log(`Job ID: ${jobId}\n`);

    // Check reconciliation job
    const jobResult = await pool.query(`
      SELECT * FROM sp_v2_reconciliation_jobs
      WHERE job_id = $1
    `, [jobId]);

    if (jobResult.rows.length > 0) {
      const job = jobResult.rows[0];
      console.log('📊 Job Summary:');
      console.log(`   Total PG: ${job.total_pg_records}`);
      console.log(`   Total Bank: ${job.total_bank_records}`);
      console.log(`   Matched: ${job.matched_records}`);
      console.log(`   Unmatched PG: ${job.unmatched_pg}`);
      console.log(`   Unmatched Bank: ${job.unmatched_bank}`);
      console.log(`   Exceptions: ${job.exception_records}`);
      console.log(`   Status: ${job.status}`);
    } else {
      console.log('❌ Job not found in database');
    }

    // Check reconciliation results
    const resultsCount = await pool.query(`
      SELECT match_status, COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE job_id = $1
      GROUP BY match_status
    `, [jobId]);

    console.log('\n📋 Results Breakdown:');
    resultsCount.rows.forEach(row => {
      console.log(`   ${row.match_status}: ${row.count}`);
    });

    // Sample exceptions
    const exceptions = await pool.query(`
      SELECT pg_transaction_id, exception_reason_code, exception_message
      FROM sp_v2_reconciliation_results
      WHERE job_id = $1 AND match_status = 'EXCEPTION'
      LIMIT 5
    `, [jobId]);

    if (exceptions.rows.length > 0) {
      console.log('\n❌ Sample Exceptions:');
      exceptions.rows.forEach(row => {
        console.log(`   ${row.pg_transaction_id}: ${row.exception_reason_code} - ${row.exception_message}`);
      });
    }

    // Check transactions table
    const txnStatus = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM sp_v2_transactions
      WHERE transaction_id LIKE 'TXN_E2E%' OR transaction_id LIKE 'BANK%'
      GROUP BY status
    `);

    console.log('\n📊 Transaction Status:');
    if (txnStatus.rows.length > 0) {
      txnStatus.rows.forEach(row => {
        console.log(`   ${row.status}: ${row.count}`);
      });
    } else {
      console.log('   No E2E transactions found in database');
    }

    // Check settlement batches
    const settlements = await pool.query(`
      SELECT batch_id, merchant_id, total_transactions, net_amount_paise, status
      FROM sp_v2_settlement_batches
      WHERE created_at >= NOW() - INTERVAL '10 minutes'
    `);

    console.log('\n💰 Recent Settlement Batches:');
    if (settlements.rows.length > 0) {
      settlements.rows.forEach(row => {
        console.log(`   ${row.batch_id}`);
        console.log(`     Merchant: ${row.merchant_id}`);
        console.log(`     Transactions: ${row.total_transactions}`);
        console.log(`     Net Amount: ₹${(row.net_amount_paise / 100).toFixed(2)}`);
        console.log(`     Status: ${row.status}`);
      });
    } else {
      console.log('   No recent settlement batches found');
    }

    console.log('\n=========================================');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkReconResults();
