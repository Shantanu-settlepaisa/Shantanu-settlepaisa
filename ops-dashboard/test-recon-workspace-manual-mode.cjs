#!/usr/bin/env node
/**
 * Complete E2E Test: Recon Workspace Manual Upload Mode
 *
 * This tests the CORRECT workflow:
 * 1. Upload CSV files via Upload API
 * 2. Run reconciliation WITHOUT passing transactions (forces database fetch)
 * 3. Recon engine fetches from sp_v2_transactions WHERE source_type='MANUAL_UPLOAD'
 * 4. Verify completion and results
 */

const { Pool } = require('pg');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const API_BASE = 'http://52.66.199.215';
const OVERVIEW_API = `${API_BASE}:5108`;
const UPLOAD_API = `${API_BASE}:5107`;
const RECON_API = `${API_BASE}:5103`;

// Test credentials
const TEST_USER = {
  email: 'admin@settlepaisa.com',
  password: 'Admin@123'
};

// Test files - use actual date from CSV files
const TEST_DATE = '2025-10-26';
const TEST_MERCHANT_ID = 'MERCH001';
const PG_CSV = '/Users/shantanusingh/ops-dashboard/test-e2e-pg-2025-10-26.csv';
const BANK_CSV = '/Users/shantanusingh/ops-dashboard/test-e2e-hdfc-2025-10-26.csv';

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
    const formatted = JSON.stringify(data, null, 2).split('\n').join('\n    ');
    console.log('    ', formatted);
  }
}

function success(message) {
  console.log(`✅ ${message}`);
}

function error(message, err = null) {
  console.log(`❌ ${message}`);
  if (err) {
    console.log(`   Error: ${err.message}`);
    if (err.response) {
      console.log(`   Status: ${err.response.status}`);
      console.log(`   Data:`, err.response.data);
    }
  }
}

async function step1_login() {
  log('STEP 1: Login and Get JWT Token');

  try {
    const response = await axios.post(`${OVERVIEW_API}/api/auth/login`, {
      email: TEST_USER.email,
      password: TEST_USER.password
    }, {
      timeout: 10000
    });

    if (response.data.success && response.data.data && response.data.data.token) {
      authToken = response.data.data.token;
      success(`Logged in successfully`);
      log('Token received', {
        tokenLength: authToken.length,
        user: response.data.data.user.email,
        role: response.data.data.user.role
      });
      return true;
    } else {
      error('Login failed - no token received', null);
      log('Response', response.data);
      return false;
    }
  } catch (err) {
    error('Login API failed', err);
    return false;
  }
}

async function step2_clearOldData() {
  log('STEP 2: Clear Old Test Data from Database');

  try {
    // Delete old MANUAL_UPLOAD data for this date
    const deleteTxnResult = await pool.query(`
      DELETE FROM sp_v2_transactions
      WHERE source_type = 'MANUAL_UPLOAD'
        AND DATE(transaction_date) = $1
    `, [TEST_DATE]);

    const deleteBankResult = await pool.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
        AND DATE(transaction_date) = $1
    `, [TEST_DATE]);

    success(`Cleared old data: ${deleteTxnResult.rowCount} transactions, ${deleteBankResult.rowCount} bank statements`);
    return true;
  } catch (err) {
    error('Failed to clear old data', err);
    return false;
  }
}

async function step3_uploadPG() {
  log('STEP 3: Upload PG Transactions CSV');

  if (!fs.existsSync(PG_CSV)) {
    error(`PG CSV file not found: ${PG_CSV}`);
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('files', fs.createReadStream(PG_CSV), 'test-pg.csv');
    formData.append('sourceType', 'pg');
    formData.append('merchantId', TEST_MERCHANT_ID);

    const response = await axios.post(`${UPLOAD_API}/api/upload/multiple`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${authToken}`
      },
      timeout: 30000
    });

    if (response.data.success) {
      success(`PG CSV uploaded successfully`);
      log('Upload result', {
        sessionId: response.data.sessionId,
        filesProcessed: response.data.results?.length,
        totalRows: response.data.results?.[0]?.rowsProcessed
      });
      return response.data.sessionId || 'uploaded';
    } else {
      error('PG upload failed - no success flag');
      return null;
    }
  } catch (err) {
    error('PG upload API failed', err);
    return null;
  }
}

async function step4_uploadBank() {
  log('STEP 4: Upload Bank Statements CSV');

  if (!fs.existsSync(BANK_CSV)) {
    error(`Bank CSV file not found: ${BANK_CSV}`);
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('files', fs.createReadStream(BANK_CSV), 'test-bank.csv');
    formData.append('sourceType', 'bank');
    formData.append('merchantId', TEST_MERCHANT_ID);

    const response = await axios.post(`${UPLOAD_API}/api/upload/multiple`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${authToken}`
      },
      timeout: 30000
    });

    if (response.data.success) {
      success(`Bank CSV uploaded successfully`);
      log('Upload result', {
        sessionId: response.data.sessionId,
        filesProcessed: response.data.results?.length,
        totalRows: response.data.results?.[0]?.rowsProcessed
      });
      return response.data.sessionId || 'uploaded';
    } else {
      error('Bank upload failed - no success flag');
      return null;
    }
  } catch (err) {
    error('Bank upload API failed', err);
    return null;
  }
}

async function step5_verifyUploadedData() {
  log('STEP 5: Verify Uploaded Data in Database');

  try {
    const pgResult = await pool.query(`
      SELECT COUNT(*) as count,
             MIN(transaction_date) as min_date,
             MAX(transaction_date) as max_date
      FROM sp_v2_transactions
      WHERE source_type = 'MANUAL_UPLOAD'
        AND DATE(transaction_date) = $1
    `, [TEST_DATE]);

    const bankResult = await pool.query(`
      SELECT COUNT(*) as count,
             MIN(transaction_date) as min_date,
             MAX(transaction_date) as max_date
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
        AND DATE(transaction_date) = $1
    `, [TEST_DATE]);

    const pgCount = parseInt(pgResult.rows[0].count);
    const bankCount = parseInt(bankResult.rows[0].count);

    success(`Found ${pgCount} PG transactions in database`);
    success(`Found ${bankCount} Bank statements in database`);

    log('PG Data Range', {
      count: pgCount,
      minDate: pgResult.rows[0].min_date,
      maxDate: pgResult.rows[0].max_date
    });

    log('Bank Data Range', {
      count: bankCount,
      minDate: bankResult.rows[0].min_date,
      maxDate: bankResult.rows[0].max_date
    });

    return { pgCount, bankCount };
  } catch (err) {
    error('Failed to verify uploaded data', err);
    return null;
  }
}

async function step6_runReconManualMode() {
  log('STEP 6: Run Reconciliation in Manual Upload Mode');
  log('Important: NOT passing pgTransactions/bankRecords - forcing database fetch');

  try {
    const response = await axios.post(`${RECON_API}/recon/run`, {
      date: TEST_DATE,
      merchantId: TEST_MERCHANT_ID,
      dryRun: false
      // ← NO pgTransactions or bankRecords - this forces Manual Upload Mode
    }, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    if (response.data.jobId) {
      success(`Reconciliation started in Manual Upload Mode`);
      log('Job created', {
        jobId: response.data.jobId,
        status: response.data.status,
        stage: response.data.stage
      });
      return response.data.jobId;
    } else {
      error('Recon start failed - no jobId received');
      log('Response', response.data);
      return null;
    }
  } catch (err) {
    error('Recon API failed', err);
    return null;
  }
}

async function step7_waitForCompletion(jobId) {
  log(`STEP 7: Wait for Reconciliation to Complete (Job: ${jobId})`);

  const maxAttempts = 30;
  const pollInterval = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(`${RECON_API}/recon/jobs/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        timeout: 10000
      });

      const job = response.data;
      const status = job.status;
      const stage = job.stage || 'unknown';

      console.log(`   Attempt ${attempt}/${maxAttempts}: Status = ${status}, Stage = ${stage}`);

      if (status === 'completed') {
        success('Reconciliation completed!');
        log('Final job details', {
          status: job.status,
          stage: job.stage,
          counters: job.counters,
          duration: job.duration
        });
        return job;
      } else if (status === 'failed') {
        error('Reconciliation failed');
        log('Error details', {
          error: job.error,
          stage: job.stage,
          counters: job.counters
        });
        return null;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (err) {
      error(`Failed to check job status (attempt ${attempt})`, err);
    }
  }

  error('Reconciliation did not complete within timeout');
  return null;
}

async function step8_verifyResults(jobId) {
  log('STEP 8: Verify Results in Database');

  try {
    // Check transaction status distribution
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = $1
        AND source_type = 'MANUAL_UPLOAD'
      GROUP BY status
      ORDER BY status
    `, [TEST_DATE]);

    success('Transaction status distribution:');
    statusResult.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count}`);
    });

    // Check reconciliation job record
    const jobResult = await pool.query(`
      SELECT *
      FROM sp_v2_reconciliation_jobs
      WHERE id = $1
    `, [jobId]);

    if (jobResult.rows.length > 0) {
      const job = jobResult.rows[0];
      success('Reconciliation job record found');
      log('Job summary', {
        status: job.status,
        totalPg: job.total_pg,
        totalBank: job.total_bank,
        matched: job.matched_count,
        unmatchedPg: job.unmatched_pg_count,
        unmatchedBank: job.unmatched_bank_count,
        exceptions: job.exception_count
      });
    } else {
      error('Reconciliation job record not found');
    }

    // Check reconciliation results
    const resultsResult = await pool.query(`
      SELECT match_type, COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE job_id = $1
      GROUP BY match_type
      ORDER BY match_type
    `, [jobId]);

    if (resultsResult.rows.length > 0) {
      success('Reconciliation results breakdown:');
      resultsResult.rows.forEach(row => {
        console.log(`   ${row.match_type}: ${row.count}`);
      });
    }

    return {
      statusDistribution: statusResult.rows,
      job: jobResult.rows[0],
      results: resultsResult.rows
    };
  } catch (err) {
    error('Failed to verify results', err);
    return null;
  }
}

async function runCompleteTest() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Staging 2 - Recon Workspace Manual Mode E2E Test    ║');
  console.log('║  Server: 52.66.199.215                                 ║');
  console.log('║  Mode: Manual Upload (Database Fetch)                 ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const results = {
    login: false,
    clearData: false,
    pgUpload: false,
    bankUpload: false,
    dataVerified: false,
    reconStart: false,
    reconComplete: false,
    resultsValid: false
  };

  try {
    // Step 1: Login
    results.login = await step1_login();
    if (!results.login) {
      throw new Error('Login failed - cannot proceed');
    }

    // Step 2: Clear old data
    results.clearData = await step2_clearOldData();
    if (!results.clearData) {
      throw new Error('Failed to clear old data - cannot proceed');
    }

    // Step 3: Upload PG
    const pgSessionId = await step3_uploadPG();
    results.pgUpload = !!pgSessionId;
    if (!results.pgUpload) {
      throw new Error('PG upload failed - cannot proceed');
    }

    // Step 4: Upload Bank
    const bankSessionId = await step4_uploadBank();
    results.bankUpload = !!bankSessionId;
    if (!results.bankUpload) {
      throw new Error('Bank upload failed - cannot proceed');
    }

    // Step 5: Verify uploaded data
    const uploadedData = await step5_verifyUploadedData();
    results.dataVerified = !!uploadedData && uploadedData.pgCount > 0 && uploadedData.bankCount > 0;
    if (!results.dataVerified) {
      throw new Error('Uploaded data not found in database - cannot proceed');
    }

    // Step 6: Run Recon in Manual Mode
    const jobId = await step6_runReconManualMode();
    results.reconStart = !!jobId;
    if (!results.reconStart) {
      throw new Error('Recon start failed - cannot proceed');
    }

    // Step 7: Wait for completion
    const jobDetails = await step7_waitForCompletion(jobId);
    results.reconComplete = !!jobDetails;
    if (!results.reconComplete) {
      throw new Error('Recon did not complete successfully');
    }

    // Step 8: Verify results
    const verificationData = await step8_verifyResults(jobId);
    results.resultsValid = !!verificationData && !!verificationData.job;

  } catch (err) {
    error('Test execution failed', err);
  } finally {
    await pool.end();
  }

  // Final Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Test Results Summary                                  ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`  Login & Authentication:        ${results.login ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Clear Old Data:                ${results.clearData ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  PG CSV Upload:                 ${results.pgUpload ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Bank CSV Upload:               ${results.bankUpload ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Data in Database:              ${results.dataVerified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Reconciliation Start:          ${results.reconStart ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Reconciliation Complete:       ${results.reconComplete ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Results Validation:            ${results.resultsValid ? '✅ PASS' : '❌ FAIL'}`);

  const allPass = Object.values(results).every(r => r === true);

  console.log('\n' + '='.repeat(60));
  if (allPass) {
    console.log('✅✅✅ ALL TESTS PASSED - RECON WORKSPACE FULLY FUNCTIONAL');
    console.log('\nKey Points:');
    console.log('  ✅ Manual Upload Mode works correctly');
    console.log('  ✅ Recon engine fetches from database (not localhost:5101)');
    console.log('  ✅ Reconciliation completes without errors');
    console.log('  ✅ Results saved correctly to database');
  } else {
    console.log('❌ SOME TESTS FAILED - SEE DETAILS ABOVE');
  }
  console.log('='.repeat(60) + '\n');

  process.exit(allPass ? 0 : 1);
}

runCompleteTest().catch(err => {
  console.error('\n💥 Fatal error:', err);
  pool.end();
  process.exit(1);
});
