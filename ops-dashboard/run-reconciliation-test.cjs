#!/usr/bin/env node

const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024',
  port: 5432,
});

const STAGING_2_IP = '52.66.199.215';
const RECON_API_PORT = 5103;
const OVERVIEW_API_PORT = 5108;

async function authenticate() {
  console.log('🔐 Authenticating with Staging 2...');

  try {
    const response = await axios.post(
      `http://${STAGING_2_IP}:${OVERVIEW_API_PORT}/api/auth/login`,
      {
        email: 'admin@settlepaisa.com',
        password: 'Admin@123',
      },
      { timeout: 10000 }
    );

    const token = response.data.data?.token || response.data.token;
    console.log('✅ Authentication successful');
    return token;
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    return null;
  }
}

async function checkDataBeforeRecon() {
  console.log('\n📊 Pre-Reconciliation Data Check:');
  console.log('═══════════════════════════════════');

  // Check PG transactions
  const pgResult = await pool.query(`
    SELECT COUNT(*) as count, SUM(amount_paise) as total_amount
    FROM sp_v2_transactions
    WHERE merchant_id = 'MERCH001'
  `);

  console.log(`   PG Transactions: ${pgResult.rows[0].count}`);
  console.log(`   PG Total Amount: ${pgResult.rows[0].total_amount} paise (₹${(pgResult.rows[0].total_amount/100).toLocaleString('en-IN')})`);

  // Check bank statements
  const bankResult = await pool.query(`
    SELECT COUNT(*) as count, SUM(amount_paise) as total_amount
    FROM sp_v2_bank_statements
    WHERE bank_name = 'HDFC' AND source_type = 'MANUAL_UPLOAD'
  `);

  console.log(`   Bank Statements: ${bankResult.rows[0].count}`);
  console.log(`   Bank Total Amount: ${bankResult.rows[0].total_amount} paise (₹${(bankResult.rows[0].total_amount/100).toLocaleString('en-IN')})`);

  // Check for potential exact matches (same date + same amount)
  const matchesResult = await pool.query(`
    SELECT COUNT(*) as potential_matches
    FROM sp_v2_transactions t
    INNER JOIN sp_v2_bank_statements b
      ON t.transaction_date = b.transaction_date
      AND t.amount_paise = b.amount_paise
    WHERE t.merchant_id = 'MERCH001'
      AND b.bank_name = 'HDFC'
      AND b.source_type = 'MANUAL_UPLOAD'
  `);

  console.log(`   Potential Exact Matches: ${matchesResult.rows[0].potential_matches}`);

  return {
    pgCount: parseInt(pgResult.rows[0].count),
    bankCount: parseInt(bankResult.rows[0].count),
    potentialMatches: parseInt(matchesResult.rows[0].potential_matches)
  };
}

async function triggerReconciliation(token) {
  console.log('\n🚀 Triggering Reconciliation Job...');
  console.log('═══════════════════════════════════');

  const jobPayload = {
    date: '2025-10-24',
    merchantId: 'MERCH001',
    dryRun: false,
    test: false
  };

  console.log('   Job Parameters:');
  console.log(`     Date: ${jobPayload.date}`);
  console.log(`     Merchant: ${jobPayload.merchantId}`);
  console.log(`     Dry Run: ${jobPayload.dryRun}`);

  try {
    const response = await axios.post(
      `http://${STAGING_2_IP}:${RECON_API_PORT}/recon/run`,
      jobPayload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const jobId = response.data.data?.jobId || response.data.jobId || response.data.job?.jobId;
    console.log(`\n✅ Reconciliation job started: ${jobId}`);
    console.log(`   Response:`, JSON.stringify(response.data, null, 2));
    return jobId;
  } catch (error) {
    console.error('❌ Failed to trigger reconciliation:', error.message);
    if (error.response) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

async function monitorJobProgress(jobId) {
  console.log('\n⏳ Monitoring Job Progress...');
  console.log('═══════════════════════════════════');

  const maxAttempts = 30; // 30 attempts * 5 seconds = 2.5 minutes
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    const result = await pool.query(`
      SELECT
        job_id,
        job_name,
        status,
        total_pg_records,
        total_bank_records,
        matched_records,
        unmatched_pg,
        unmatched_bank,
        exception_records,
        reconciled_amount_paise,
        variance_amount_paise,
        processing_start,
        processing_end
      FROM sp_v2_reconciliation_jobs
      WHERE job_id = $1
    `, [jobId]);

    if (result.rows.length === 0) {
      console.log(`   Attempt ${attempt}: Job not found in database yet...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }

    const job = result.rows[0];
    console.log(`\n   [Attempt ${attempt}] Status: ${job.status}`);
    console.log(`     PG Records: ${job.total_pg_records}`);
    console.log(`     Bank Records: ${job.total_bank_records}`);
    console.log(`     Matched: ${job.matched_records}`);
    console.log(`     Unmatched PG: ${job.unmatched_pg}`);
    console.log(`     Unmatched Bank: ${job.unmatched_bank}`);
    console.log(`     Exceptions: ${job.exception_records}`);

    if (job.status === 'COMPLETED') {
      console.log('\n✅ Reconciliation completed successfully!');
      return job;
    }

    if (job.status === 'FAILED') {
      console.log('\n❌ Reconciliation failed!');
      return job;
    }

    // Still running, wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log('\n⚠️ Timeout waiting for reconciliation to complete');
  return null;
}

async function analyzeResults(jobId) {
  console.log('\n📈 Analyzing Reconciliation Results:');
  console.log('═══════════════════════════════════');

  // Get job summary
  const jobResult = await pool.query(`
    SELECT * FROM sp_v2_reconciliation_jobs WHERE job_id = $1
  `, [jobId]);

  if (jobResult.rows.length === 0) {
    console.log('❌ Job not found');
    return;
  }

  const job = jobResult.rows[0];

  console.log('\n📊 Job Summary:');
  console.log(`   Job Name: ${job.job_name}`);
  console.log(`   Status: ${job.status}`);
  console.log(`   Date Range: ${job.date_from} to ${job.date_to}`);
  console.log(`   Processing Time: ${job.processing_end ? ((new Date(job.processing_end) - new Date(job.processing_start)) / 1000).toFixed(2) + 's' : 'N/A'}`);

  console.log('\n📋 Record Counts:');
  console.log(`   Total PG Records: ${job.total_pg_records}`);
  console.log(`   Total Bank Records: ${job.total_bank_records}`);
  console.log(`   Matched Records: ${job.matched_records}`);
  console.log(`   Unmatched PG: ${job.unmatched_pg}`);
  console.log(`   Unmatched Bank: ${job.unmatched_bank}`);
  console.log(`   Exception Records: ${job.exception_records}`);

  if (job.total_pg_records > 0) {
    const matchRate = (job.matched_records / job.total_pg_records * 100).toFixed(2);
    console.log(`   Match Rate: ${matchRate}%`);
  }

  console.log('\n💰 Amount Summary:');
  console.log(`   Total Amount: ₹${(job.total_amount_paise / 100).toLocaleString('en-IN')}`);
  console.log(`   Reconciled Amount: ₹${(job.reconciled_amount_paise / 100).toLocaleString('en-IN')}`);
  console.log(`   Variance: ₹${(job.variance_amount_paise / 100).toLocaleString('en-IN')}`);

  // Get detailed match results
  const matchesResult = await pool.query(`
    SELECT
      match_status,
      COUNT(*) as count,
      SUM(pg_amount_paise) as total_pg_amount,
      SUM(bank_amount_paise) as total_bank_amount
    FROM sp_v2_reconciliation_results
    WHERE job_id = $1
    GROUP BY match_status
    ORDER BY match_status
  `, [jobId]);

  if (matchesResult.rows.length > 0) {
    console.log('\n🔍 Match Status Breakdown:');
    matchesResult.rows.forEach(row => {
      console.log(`   ${row.match_status}: ${row.count} records`);
      if (row.total_pg_amount) {
        console.log(`     PG Amount: ₹${(row.total_pg_amount / 100).toLocaleString('en-IN')}`);
      }
      if (row.total_bank_amount) {
        console.log(`     Bank Amount: ₹${(row.total_bank_amount / 100).toLocaleString('en-IN')}`);
      }
    });
  }

  // Check if any exceptions
  if (job.exception_records > 0) {
    const exceptionsResult = await pool.query(`
      SELECT
        exception_reason_code,
        exception_severity,
        COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE job_id = $1 AND match_status = 'EXCEPTION'
      GROUP BY exception_reason_code, exception_severity
      ORDER BY count DESC
    `, [jobId]);

    console.log('\n⚠️ Exception Breakdown:');
    exceptionsResult.rows.forEach(row => {
      console.log(`   ${row.exception_reason_code} (${row.exception_severity}): ${row.count} records`);
    });
  }

  // Check transaction status updates
  const statusResult = await pool.query(`
    SELECT
      status,
      COUNT(*) as count
    FROM sp_v2_transactions
    WHERE merchant_id = 'MERCH001'
    GROUP BY status
  `);

  console.log('\n🔄 Transaction Status After Recon:');
  statusResult.rows.forEach(row => {
    console.log(`   ${row.status}: ${row.count} transactions`);
  });

  return job;
}

async function checkSettlementQueue() {
  console.log('\n💳 Settlement Queue Status:');
  console.log('═══════════════════════════════════');

  // Check settlement queue
  const queueResult = await pool.query(`
    SELECT COUNT(*) as count, SUM(amount_paise) as total_amount
    FROM sp_v2_settlement_queue
    WHERE merchant_id = 'MERCH001'
  `);

  console.log(`   Items in Queue: ${queueResult.rows[0].count}`);
  if (queueResult.rows[0].total_amount) {
    console.log(`   Total Queued Amount: ₹${(queueResult.rows[0].total_amount / 100).toLocaleString('en-IN')}`);
  }

  // Check if settlement batches were created
  const batchesResult = await pool.query(`
    SELECT COUNT(*) as count, SUM(gross_amount_paise) as total_amount
    FROM sp_v2_settlement_batches
    WHERE merchant_id = 'MERCH001'
  `);

  console.log(`   Settlement Batches: ${batchesResult.rows[0].count}`);
  if (batchesResult.rows[0].total_amount) {
    console.log(`   Total Batch Amount: ₹${(batchesResult.rows[0].total_amount / 100).toLocaleString('en-IN')}`);
  }
}

async function main() {
  try {
    console.log('🧪 RECONCILIATION TEST - Staging 2');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Test Date: October 27, 2025');
    console.log('Environment: Staging 2 (52.66.199.215)');
    console.log('Test Data: MERCH001 (50 PG + 30 Bank)');
    console.log('');

    // Step 1: Check data before reconciliation
    const preData = await checkDataBeforeRecon();

    // Step 2: Authenticate
    const token = await authenticate();
    if (!token) {
      console.log('\n❌ Cannot proceed without authentication token');
      console.log('   Attempting direct reconciliation via database...');

      // Try direct reconciliation without API
      console.log('\n⚠️ API authentication failed. The reconciliation API might have auth issues.');
      console.log('   Please trigger reconciliation manually via the UI or check API logs.');
      await pool.end();
      return;
    }

    // Step 3: Trigger reconciliation
    const jobId = await triggerReconciliation(token);
    if (!jobId) {
      console.log('\n❌ Failed to trigger reconciliation job');
      await pool.end();
      return;
    }

    // Step 4: Monitor progress
    const completedJob = await monitorJobProgress(jobId);

    // Step 5: Analyze results
    if (completedJob) {
      await analyzeResults(jobId);
    }

    // Step 6: Check settlement queue
    await checkSettlementQueue();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Reconciliation test complete!');
    console.log('');

    await pool.end();
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
