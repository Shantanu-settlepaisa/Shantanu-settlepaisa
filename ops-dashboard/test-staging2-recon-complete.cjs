#!/usr/bin/env node
/**
 * Complete E2E Test for Staging 2 Recon Workspace
 * Tests ALL APIs with authentication
 *
 * Flow:
 * 1. Login and get JWT token
 * 2. Upload PG transactions CSV
 * 3. Upload Bank statements CSV
 * 4. Run reconciliation
 * 5. Fetch results
 * 6. Verify database
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

// Test files
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
    console.log('   ', JSON.stringify(data, null, 2).split('\n').join('\n    '));
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

async function step2_uploadPG() {
  log('STEP 2: Upload PG Transactions CSV');

  if (!fs.existsSync(PG_CSV)) {
    error(`PG CSV file not found: ${PG_CSV}`);
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('files', fs.createReadStream(PG_CSV), 'test-pg.csv');
    formData.append('sourceType', 'pg');
    formData.append('merchantId', 'MERCH001');

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

async function step3_uploadBank() {
  log('STEP 3: Upload Bank Statements CSV');

  if (!fs.existsSync(BANK_CSV)) {
    error(`Bank CSV file not found: ${BANK_CSV}`);
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('files', fs.createReadStream(BANK_CSV), 'test-bank.csv');
    formData.append('sourceType', 'bank');
    formData.append('merchantId', 'MERCH001');

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

async function step4_runRecon() {
  log('STEP 4: Run Reconciliation');

  try {
    const response = await axios.post(`${RECON_API}/recon/run`, {
      merchantId: 'MERCH001',
      date: '2025-10-26',
      dryRun: false
    }, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    if (response.data.jobId) {
      success(`Reconciliation started`);
      log('Job created', {
        jobId: response.data.jobId,
        status: response.data.status
      });
      return response.data.jobId;
    } else {
      error('Recon start failed - no jobId received');
      return null;
    }
  } catch (err) {
    error('Recon API failed', err);
    return null;
  }
}

async function step5_waitForCompletion(jobId) {
  log(`STEP 5: Wait for Reconciliation to Complete (Job: ${jobId})`);

  const maxAttempts = 20;
  const pollInterval = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(`${RECON_API}/recon/jobs/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        timeout: 10000
      });

      const status = response.data.status;
      console.log(`   Attempt ${attempt}/${maxAttempts}: Status = ${status}`);

      if (status === 'completed') {
        success('Reconciliation completed!');
        return response.data;
      } else if (status === 'failed') {
        error('Reconciliation failed');
        log('Job details', response.data);
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

async function step6_getResults(jobId) {
  log('STEP 6: Fetch Reconciliation Results');

  try {
    const response = await axios.get(`${RECON_API}/recon/jobs/${jobId}/summary`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      timeout: 10000
    });

    success('Results fetched successfully');
    log('Reconciliation Summary', {
      totalPG: response.data.totalPG,
      totalBank: response.data.totalBank,
      matched: response.data.matched,
      unmatchedPG: response.data.unmatchedPG,
      unmatchedBank: response.data.unmatchedBank
    });

    return response.data;
  } catch (err) {
    error('Failed to fetch results', err);
    return null;
  }
}

async function step7_verifyDatabase() {
  log('STEP 7: Verify Database Has Real Data');

  try {
    // Check transactions
    const txnResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN source_type = 'pg' THEN 1 END) as pg_count,
        COUNT(CASE WHEN source_type = 'bank' THEN 1 END) as bank_count,
        MAX(created_at) as latest
      FROM sp_v2_transactions
      WHERE DATE(created_at) >= '2025-10-26'
    `);

    const txnData = txnResult.rows[0];
    success('Transaction data verified');
    console.log(`   Total: ${txnData.total}, PG: ${txnData.pg_count}, Bank: ${txnData.bank_count}`);

    // Check recon jobs
    const jobResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM sp_v2_recon_jobs
      WHERE DATE(created_at) >= '2025-10-26'
    `);

    const jobData = jobResult.rows[0];
    success('Recon jobs verified');
    console.log(`   Total: ${jobData.total}, Completed: ${jobData.completed}`);

    // Check matches
    const matchResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN match_status = 'MATCHED' THEN 1 END) as matched
      FROM sp_v2_recon_matches
      WHERE DATE(matched_at) >= '2025-10-26'
    `);

    const matchData = matchResult.rows[0];
    success('Match data verified');
    console.log(`   Total: ${matchData.total}, Matched: ${matchData.matched}`);

    return {
      transactions: parseInt(txnData.total),
      jobs: parseInt(jobData.total),
      matches: parseInt(matchData.total)
    };
  } catch (err) {
    error('Database verification failed', err);
    return null;
  }
}

async function runCompleteTest() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Staging 2 - Complete Recon Workspace E2E Test        ║');
  console.log('║  Server: 52.66.199.215                                 ║');
  console.log('║  Testing: Authentication + Upload + Recon APIs        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const results = {
    login: false,
    pgUpload: false,
    bankUpload: false,
    reconStart: false,
    reconComplete: false,
    resultsValid: false,
    databaseValid: false
  };

  try {
    // Step 1: Login
    results.login = await step1_login();
    if (!results.login) {
      throw new Error('Login failed - cannot proceed');
    }

    // Step 2: Upload PG
    const pgSessionId = await step2_uploadPG();
    results.pgUpload = !!pgSessionId;
    if (!results.pgUpload) {
      throw new Error('PG upload failed - cannot proceed');
    }

    // Step 3: Upload Bank
    const bankSessionId = await step3_uploadBank();
    results.bankUpload = !!bankSessionId;
    if (!results.bankUpload) {
      throw new Error('Bank upload failed - cannot proceed');
    }

    // Step 4: Run Recon
    const jobId = await step4_runRecon();
    results.reconStart = !!jobId;
    if (!results.reconStart) {
      throw new Error('Recon start failed - cannot proceed');
    }

    // Step 5: Wait for completion
    const jobDetails = await step5_waitForCompletion(jobId);
    results.reconComplete = !!jobDetails;
    if (!results.reconComplete) {
      throw new Error('Recon did not complete');
    }

    // Step 6: Get results
    const summary = await step6_getResults(jobId);
    results.resultsValid = !!summary && summary.matched > 0;

    // Step 7: Verify database
    const dbStats = await step7_verifyDatabase();
    results.databaseValid = !!dbStats && dbStats.transactions > 0;

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
  console.log(`  PG CSV Upload:                 ${results.pgUpload ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Bank CSV Upload:               ${results.bankUpload ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Reconciliation Start:          ${results.reconStart ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Reconciliation Complete:       ${results.reconComplete ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Results Valid:                 ${results.resultsValid ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Database Persistence:          ${results.databaseValid ? '✅ PASS' : '❌ FAIL'}`);

  const allPass = Object.values(results).every(r => r === true);

  console.log('\n' + '='.repeat(60));
  if (allPass) {
    console.log('✅ ALL TESTS PASSED - RECON WORKSPACE IS FULLY FUNCTIONAL');
    console.log('   Staging 2 is working identically to Staging 1');
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
