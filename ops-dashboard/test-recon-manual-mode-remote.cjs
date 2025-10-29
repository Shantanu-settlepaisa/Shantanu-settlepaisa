#!/usr/bin/env node
/**
 * E2E Test: Recon Workspace Manual Mode (Runs on Staging 2 Server)
 *
 * This script should be copied to Staging 2 and run there
 * to avoid database connection issues
 */

const { Pool } = require('pg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://52.66.199.215';
const OVERVIEW_API = `${API_BASE}:5108`;
const RECON_API = `${API_BASE}:5103`;

const TEST_USER = {
  email: 'admin@settlepaisa.com',
  password: 'Admin@123'
};

const TEST_DATE = '2025-10-26';
const TEST_MERCHANT_ID = 'MERCH001';

// Database connection
const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024',
  port: 5432,
});

let authToken = null;

function log(message, data = null) {
  console.log(`\n📍 ${message}`);
  if (data) {
    console.log('   ', JSON.stringify(data, null, 2).replace(/\n/g, '\n    '));
  }
}

function success(message) {
  console.log(`✅ ${message}`);
}

function error(message, err = null) {
  console.log(`❌ ${message}`);
  if (err) {
    console.log(`   Error: ${err.message}`);
    if (err.response?.data) {
      console.log(`   Response:`, JSON.stringify(err.response.data, null, 2));
    }
  }
}

async function step1_login() {
  log('STEP 1: Login');
  try {
    const response = await axios.post(`${OVERVIEW_API}/api/auth/login`, TEST_USER, { timeout: 10000 });
    if (response.data.success && response.data.data.token) {
      authToken = response.data.data.token;
      success(`Logged in as ${response.data.data.user.email}`);
      return true;
    }
    return false;
  } catch (err) {
    error('Login failed', err);
    return false;
  }
}

async function step2_checkUploadedData() {
  log('STEP 2: Check Uploaded Data in Database');
  try {
    const result = await pool.query(`
      SELECT
        source_type,
        COUNT(*) as count,
        MIN(transaction_date) as earliest_date,
        MAX(transaction_date) as latest_date
      FROM sp_v2_transactions
      WHERE source_type = 'MANUAL_UPLOAD'
      GROUP BY source_type
    `);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      success(`Found ${row.count} MANUAL_UPLOAD transactions`);
      log('Date range', { earliest: row.earliest_date, latest: row.latest_date });
      return parseInt(row.count);
    } else {
      error('No MANUAL_UPLOAD transactions found');
      return 0;
    }
  } catch (err) {
    error('Database query failed', err);
    return 0;
  }
}

async function step3_runRecon() {
  log('STEP 3: Run Reconciliation in Manual Mode');
  log('Note: Not passing pgTransactions/bankRecords to force database fetch');

  try {
    const response = await axios.post(`${RECON_API}/recon/run`, {
      date: TEST_DATE,
      merchantId: TEST_MERCHANT_ID,
      dryRun: false
    }, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    if (response.data.jobId) {
      success(`Reconciliation job started: ${response.data.jobId}`);
      return response.data.jobId;
    }
    error('No jobId returned');
    return null;
  } catch (err) {
    error('Reconciliation start failed', err);
    return null;
  }
}

async function step4_pollJob(jobId) {
  log(`STEP 4: Wait for Job ${jobId} to Complete`);

  const maxAttempts = 40;
  const pollInterval = 3000;

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const response = await axios.get(`${RECON_API}/recon/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
        timeout: 10000
      });

      const job = response.data;
      console.log(`   [${i}/${maxAttempts}] Status: ${job.status}, Stage: ${job.stage || 'N/A'}`);

      if (job.status === 'completed') {
        success('Job completed successfully!');
        log('Final counters', job.counters);
        return job;
      } else if (job.status === 'failed') {
        error('Job failed');
        log('Error details', { error: job.error, stage: job.stage });
        return null;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (err) {
      console.log(`   [${i}/${maxAttempts}] Failed to poll: ${err.message}`);
    }
  }

  error('Job did not complete within timeout');
  return null;
}

async function step5_verifyResults(jobId) {
  log('STEP 5: Verify Results in Database');

  try {
    // Check transaction status updates
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM sp_v2_transactions
      WHERE source_type = 'MANUAL_UPLOAD'
      GROUP BY status
      ORDER BY status
    `);

    success('Transaction status distribution:');
    statusResult.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count}`);
    });

    // Check job record
    const jobResult = await pool.query(`
      SELECT * FROM sp_v2_reconciliation_jobs WHERE id = $1
    `, [jobId]);

    if (jobResult.rows.length > 0) {
      const job = jobResult.rows[0];
      success('Job record found in database');
      log('Job summary', {
        matched: job.matched_count,
        unmatchedPg: job.unmatched_pg_count,
        unmatchedBank: job.unmatched_bank_count,
        exceptions: job.exception_count
      });
      return true;
    } else {
      error('Job record not found in database');
      return false;
    }
  } catch (err) {
    error('Verification failed', err);
    return false;
  }
}

async function runTest() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Recon Workspace Manual Mode E2E Test                 ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const results = {
    login: false,
    dataExists: false,
    reconStarted: false,
    reconCompleted: false,
    resultsVerified: false
  };

  try {
    results.login = await step1_login();
    if (!results.login) throw new Error('Login failed');

    const dataCount = await step2_checkUploadedData();
    results.dataExists = dataCount > 0;
    if (!results.dataExists) throw new Error('No data to reconcile');

    const jobId = await step3_runRecon();
    results.reconStarted = !!jobId;
    if (!results.reconStarted) throw new Error('Recon did not start');

    const job = await step4_pollJob(jobId);
    results.reconCompleted = !!job;
    if (!results.reconCompleted) throw new Error('Recon did not complete');

    results.resultsVerified = await step5_verifyResults(jobId);
  } catch (err) {
    error('Test failed', err);
  } finally {
    await pool.end();
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                          ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`  Login:               ${results.login ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Data Exists:         ${results.dataExists ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Recon Started:       ${results.reconStarted ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Recon Completed:     ${results.reconCompleted ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Results Verified:    ${results.resultsVerified ? '✅ PASS' : '❌ FAIL'}`);

  const allPass = Object.values(results).every(r => r);
  console.log('\n' + '='.repeat(60));
  if (allPass) {
    console.log('✅✅✅ ALL TESTS PASSED - MANUAL MODE WORKS!');
  } else {
    console.log('❌ SOME TESTS FAILED');
  }
  console.log('='.repeat(60) + '\n');

  process.exit(allPass ? 0 : 1);
}

runTest().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  pool.end();
  process.exit(1);
});
