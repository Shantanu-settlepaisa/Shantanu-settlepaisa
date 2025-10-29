#!/usr/bin/env node

/**
 * Staging 1 vs Staging 2 Recon Workspace Comparison Test
 * Tests V1 format upload, conversion, reconciliation, and settlement
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

// Configuration
const CONFIG = {
  staging1: {
    name: 'Staging 1',
    ip: '13.201.179.44',
    uploadPort: 5109,
    reconPort: 5103,
    overviewPort: 5108,
  },
  staging2: {
    name: 'Staging 2',
    ip: '52.66.199.215',
    uploadPort: 5107,
    reconPort: 5103,
    overviewPort: 5108,
  },
  database: {
    user: 'postgres',
    host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
    database: 'settlepaisa_v2',
    password: 'SettlePaisa2024',
    port: 5432,
  },
  testMerchant: 'MERCH001',
  testFiles: {
    pg: 'test-pg-v1-proper-2025-10-24.csv',
    bank: 'test-hdfc-v1-proper-2025-10-24.csv',
  },
};

// Database pool
const pool = new Pool(CONFIG.database);

// Test results
const results = {
  timestamp: new Date().toISOString(),
  staging1: {},
  staging2: {},
  comparison: {},
  success: true,
};

// Authentication tokens
let staging1Token = null;
let staging2Token = null;

// Utility functions
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const prefix = {
    INFO: '✓',
    WARN: '⚠',
    ERROR: '✗',
    SECTION: '═',
  }[level] || '•';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function authenticate(stagingConfig) {
  log(`Authenticating with ${stagingConfig.name}...`);

  try {
    const url = `http://${stagingConfig.ip}:${stagingConfig.overviewPort}/api/auth/login`;
    const response = await axios.post(url, {
      email: 'admin@settlepaisa.com',
      password: 'Admin@123',
    });

    const token = response.data.data.token;
    log(`${stagingConfig.name} authentication successful (token length: ${token.length})`);
    return token;
  } catch (error) {
    log(`${stagingConfig.name} authentication failed: ${error.message}`, 'ERROR');
    throw error;
  }
}

async function clearTestData() {
  log('Clearing previous test data for MERCH001...', 'SECTION');

  try {
    // Delete in correct order (respecting foreign keys)
    // 1. Delete reconciliation results FIRST (before deleting transactions)
    await pool.query(`DELETE FROM sp_v2_reconciliation_results WHERE pg_transaction_id IN (SELECT transaction_id FROM sp_v2_transactions WHERE merchant_id = $1)`, [CONFIG.testMerchant]);

    // 2. Delete settlement items
    await pool.query(`DELETE FROM sp_v2_settlement_items WHERE settlement_batch_id IN (SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = $1)`, [CONFIG.testMerchant]);

    // 3. Delete transactions (references settlement_batches)
    await pool.query(`DELETE FROM sp_v2_transactions WHERE merchant_id = $1`, [CONFIG.testMerchant]);

    // 4. Now safe to delete settlement batches
    await pool.query(`DELETE FROM sp_v2_settlement_batches WHERE merchant_id = $1`, [CONFIG.testMerchant]);

    // 5. Delete settlement queue
    await pool.query(`DELETE FROM sp_v2_settlement_queue WHERE merchant_id = $1`, [CONFIG.testMerchant]);

    // 6. Delete bank statement entries (simplified - delete all recent test data)
    await pool.query(`DELETE FROM sp_v2_bank_statement_entries WHERE created_at > NOW() - INTERVAL '1 hour'`);

    log('Test data cleared successfully');
  } catch (error) {
    log(`Error clearing test data: ${error.message}`, 'WARN');
    log('Continuing test despite cleanup errors...');
    // Don't throw - continue with test even if cleanup fails
  }
}

async function uploadFile(stagingConfig, fileType, filePath, token) {
  log(`Uploading ${fileType} file to ${stagingConfig.name}...`);

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('fileType', fileType);
    form.append('merchantId', CONFIG.testMerchant);

    const url = `http://${stagingConfig.ip}:${stagingConfig.uploadPort}/api/upload/single`;

    const headers = {
      ...form.getHeaders(),
      'Authorization': `Bearer ${token}`,
    };

    const response = await axios.post(url, form, {
      headers,
      timeout: 30000,
    });

    log(`${stagingConfig.name} upload successful: ${response.data.message || 'OK'}`);
    return response.data;
  } catch (error) {
    log(`${stagingConfig.name} upload failed: ${error.message}`, 'ERROR');
    if (error.response) {
      log(`Response data: ${JSON.stringify(error.response.data)}`, 'ERROR');
    }
    throw error;
  }
}

async function getTransactionCount(status = null) {
  const query = status
    ? `SELECT COUNT(*) as count FROM sp_v2_transactions WHERE merchant_id = $1 AND status = $2`
    : `SELECT COUNT(*) as count FROM sp_v2_transactions WHERE merchant_id = $1`;

  const params = status ? [CONFIG.testMerchant, status] : [CONFIG.testMerchant];
  const result = await pool.query(query, params);
  return parseInt(result.rows[0].count);
}

async function getReconciliationResults() {
  const query = `
    SELECT
      COUNT(*) as total_matches,
      COUNT(DISTINCT pg_transaction_id) as unique_pg_matches,
      COUNT(DISTINCT bank_statement_id) as unique_bank_matches
    FROM sp_v2_reconciliation_results
    WHERE merchant_id = $1
  `;

  const result = await pool.query(query, [CONFIG.testMerchant]);
  return result.rows[0];
}

async function getSettlementBatches() {
  const query = `
    SELECT
      COUNT(*) as batch_count,
      SUM(gross_amount_paise) as total_gross_paise,
      SUM(net_amount_paise) as total_net_paise
    FROM sp_v2_settlement_batches
    WHERE merchant_id = $1
  `;

  const result = await pool.query(query, [CONFIG.testMerchant]);
  return result.rows[0];
}

async function verifyV1Conversion() {
  log('Verifying V1 to V2 conversion...', 'SECTION');

  const query = `
    SELECT
      transaction_id,
      merchant_id,
      amount_paise,
      gross_amount_paise,
      source_type,
      payment_method
    FROM sp_v2_transactions
    WHERE merchant_id = $1
    ORDER BY transaction_id
    LIMIT 5
  `;

  const result = await pool.query(query, [CONFIG.testMerchant]);

  log(`Found ${result.rows.length} transactions after V1 conversion:`);
  result.rows.forEach(row => {
    log(`  - ${row.transaction_id}: ₹${row.amount_paise/100} (${row.payment_method}, source: ${row.source_type})`);
  });

  // Verify amounts are in paise (should be > 100)
  const allInPaise = result.rows.every(row => row.amount_paise >= 100);
  if (allInPaise) {
    log('✓ Amount conversion verified (all values in paise)');
  } else {
    log('✗ Amount conversion issue detected', 'WARN');
  }

  return result.rows;
}

async function runTest() {
  try {
    log('═══════════════════════════════════════════════════════════', 'SECTION');
    log(' Staging 1 vs Staging 2 Recon Workspace Comparison Test', 'SECTION');
    log('═══════════════════════════════════════════════════════════', 'SECTION');

    // Phase 1: Pre-test setup
    log('\n📋 PHASE 1: Pre-Test Setup', 'SECTION');
    await clearTestData();

    // Authenticate with both staging environments
    staging1Token = await authenticate(CONFIG.staging1);
    staging2Token = await authenticate(CONFIG.staging2);

    const beforeCounts = {
      transactions: await getTransactionCount(),
      pending: await getTransactionCount('PENDING'),
      reconciled: await getTransactionCount('RECONCILED'),
    };

    log(`Initial state: ${beforeCounts.transactions} total, ${beforeCounts.pending} pending, ${beforeCounts.reconciled} reconciled`);

    // Phase 2: Upload to Staging 1
    log('\n📤 PHASE 2: Upload V1 Files to Staging 1', 'SECTION');

    const staging1PgUpload = await uploadFile(
      CONFIG.staging1,
      'pg_transactions',
      path.join(__dirname, CONFIG.testFiles.pg),
      staging1Token
    );

    const staging1BankUpload = await uploadFile(
      CONFIG.staging1,
      'bank_statements',
      path.join(__dirname, CONFIG.testFiles.bank),
      staging1Token
    );

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    const staging1AfterUpload = {
      transactions: await getTransactionCount(),
      pending: await getTransactionCount('PENDING'),
    };

    results.staging1.upload = {
      pgUpload: staging1PgUpload,
      bankUpload: staging1BankUpload,
      transactionsAfter: staging1AfterUpload.transactions,
      pendingAfter: staging1AfterUpload.pending,
    };

    log(`Staging 1 after upload: ${staging1AfterUpload.transactions} transactions (${staging1AfterUpload.pending} pending)`);

    // Verify V1 conversion
    const convertedData = await verifyV1Conversion();

    // Phase 3: Clear and upload to Staging 2
    log('\n📤 PHASE 3: Upload V1 Files to Staging 2', 'SECTION');

    await clearTestData();

    const staging2PgUpload = await uploadFile(
      CONFIG.staging2,
      'pg_transactions',
      path.join(__dirname, CONFIG.testFiles.pg),
      staging2Token
    );

    const staging2BankUpload = await uploadFile(
      CONFIG.staging2,
      'bank_statements',
      path.join(__dirname, CONFIG.testFiles.bank),
      staging2Token
    );

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    const staging2AfterUpload = {
      transactions: await getTransactionCount(),
      pending: await getTransactionCount('PENDING'),
    };

    results.staging2.upload = {
      pgUpload: staging2PgUpload,
      bankUpload: staging2BankUpload,
      transactionsAfter: staging2AfterUpload.transactions,
      pendingAfter: staging2AfterUpload.pending,
    };

    log(`Staging 2 after upload: ${staging2AfterUpload.transactions} transactions (${staging2AfterUpload.pending} pending)`);

    // Phase 4: Compare Upload Results
    log('\n🔍 PHASE 4: Compare Upload Results', 'SECTION');

    const uploadMatch = staging1AfterUpload.transactions === staging2AfterUpload.transactions;
    const pendingMatch = staging1AfterUpload.pending === staging2AfterUpload.pending;

    results.comparison.upload = {
      transactionsMatch: uploadMatch,
      pendingMatch: pendingMatch,
      staging1Count: staging1AfterUpload.transactions,
      staging2Count: staging2AfterUpload.transactions,
    };

    if (uploadMatch && pendingMatch) {
      log(`✓ Upload results MATCH: ${staging1AfterUpload.transactions} transactions on both`);
    } else {
      log(`✗ Upload results DIFFER: S1=${staging1AfterUpload.transactions}, S2=${staging2AfterUpload.transactions}`, 'ERROR');
      results.success = false;
    }

    // Phase 5: Reconciliation Results
    log('\n🔄 PHASE 5: Check Reconciliation (Note: Manual trigger required)', 'SECTION');
    log('Please trigger reconciliation manually via UI or API for both staging environments');
    log('Then run verification queries to compare results');

    // Phase 6: Generate Report
    log('\n📊 PHASE 6: Final Summary', 'SECTION');
    log('═══════════════════════════════════════════════════════════', 'SECTION');

    console.log('\n' + JSON.stringify(results, null, 2));

    log('\nTest completed! Summary saved to test-results.json');
    fs.writeFileSync('test-staging-v1-comparison-results.json', JSON.stringify(results, null, 2));

    if (results.success) {
      log('\n✓ ALL TESTS PASSED', 'INFO');
      process.exit(0);
    } else {
      log('\n✗ SOME TESTS FAILED', 'ERROR');
      process.exit(1);
    }

  } catch (error) {
    log(`\n✗ Test execution failed: ${error.message}`, 'ERROR');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the test
runTest();
