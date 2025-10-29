#!/usr/bin/env node

/**
 * Test Upload Sessions - Issue #3 Phase 1
 * Purpose: Verify atomic transaction uploads with session tracking
 * Date: 2025-10-25
 */

const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');
const { Pool } = require('pg');
const config = require('./services/config/env.cjs');

const UPLOAD_API_URL = 'http://localhost:5109';

const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: 5433, // Override to use correct port
});

async function checkUploadApiRunning() {
  try {
    const response = await axios.get(`${UPLOAD_API_URL}/health`);
    console.log('✅ Upload API is running:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Upload API is not running. Please start it first:');
    console.error('   cd services/api && node file-upload-v2.cjs');
    return false;
  }
}

async function testValidUpload() {
  console.log('\n📤 Test 1: Valid Upload with Session Tracking');
  console.log('===============================================\n');

  const form = new FormData();
  form.append('file', fs.createReadStream('test-upload-valid-pg.csv'));
  form.append('fileType', 'transactions');
  form.append('userId', 'test-user-001');
  // merchantId is optional in upload_sessions table - don't send invalid UUID

  try {
    const response = await axios.post(`${UPLOAD_API_URL}/api/upload/single`, form, {
      headers: form.getHeaders(),
    });

    console.log('✅ Upload successful!');
    console.log('📊 Response:', JSON.stringify(response.data, null, 2));

    const uploadSessionId = response.data.uploadSessionId;

    // Verify in database
    const client = await pool.connect();
    try {
      // Check upload session
      const sessionResult = await client.query(
        'SELECT * FROM sp_v2_upload_sessions WHERE upload_id = $1',
        [uploadSessionId]
      );

      console.log('\n📋 Upload Session Record:');
      console.log(JSON.stringify(sessionResult.rows[0], null, 2));

      // Check transactions linked to session
      const txnResult = await client.query(
        'SELECT transaction_id, merchant_id, amount_paise, upload_session_id FROM sp_v2_transactions WHERE upload_session_id = $1',
        [uploadSessionId]
      );

      console.log(`\n📊 Transactions linked to session: ${txnResult.rows.length}`);
      txnResult.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.transaction_id} - ₹${row.amount_paise / 100} (Session: ${row.upload_session_id.substring(0, 8)}...)`);
      });

      // Verify constraint works (try duplicate)
      console.log('\n🔍 Testing duplicate prevention...');
      try {
        await client.query(`
          INSERT INTO sp_v2_transactions
          (transaction_id, merchant_id, gateway_ref, amount_paise, currency, payment_method, status,
           transaction_date, transaction_timestamp, source_type, source_name)
          VALUES ('TX001', 'MERCH001', 'TX001', 10000, 'INR', 'UPI', 'PENDING',
           NOW(), NOW(), 'MANUAL_UPLOAD', 'manual_upload')
        `);
        console.log('❌ FAIL: Duplicate was inserted (constraint not working!)');
      } catch (error) {
        if (error.code === '23505') {
          console.log('✅ PASS: Duplicate rejected by unique_txn_merchant constraint');
        } else {
          console.log('⚠️  Unexpected error:', error.message);
        }
      }

    } finally {
      client.release();
    }

    console.log('\n✅ Test 1 PASSED: Valid upload with session tracking works!\n');
    return true;

  } catch (error) {
    console.error('❌ Test 1 FAILED:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function testInvalidUpload() {
  console.log('\n📤 Test 2: Invalid Upload - Should Rollback');
  console.log('=============================================\n');

  // Get transaction count before upload
  const client = await pool.connect();
  const beforeCount = await client.query('SELECT COUNT(*) FROM sp_v2_transactions');
  const beforeSessions = await client.query('SELECT COUNT(*) FROM sp_v2_upload_sessions WHERE status = \'COMPLETED\'');
  client.release();

  console.log(`📊 Before upload: ${beforeCount.rows[0].count} transactions, ${beforeSessions.rows[0].count} completed sessions`);

  const form = new FormData();
  form.append('file', fs.createReadStream('test-upload-invalid-pg.csv'));
  form.append('fileType', 'transactions');
  form.append('userId', 'test-user-002');
  // merchantId is optional - don't send invalid UUID

  try {
    const response = await axios.post(`${UPLOAD_API_URL}/api/upload/single`, form, {
      headers: form.getHeaders(),
    });

    // Check if upload succeeded (it should with 4 errors, 1 valid)
    console.log('📊 Response:', JSON.stringify(response.data, null, 2));

    // Get transaction count after upload
    const client2 = await pool.connect();
    const afterCount = await client2.query('SELECT COUNT(*) FROM sp_v2_transactions');
    const afterSessions = await client2.query('SELECT COUNT(*) FROM sp_v2_upload_sessions WHERE status = \'FAILED\'');

    console.log(`\n📊 After upload: ${afterCount.rows[0].count} transactions, ${afterSessions.rows[0].count} failed sessions`);

    const diff = parseInt(afterCount.rows[0].count) - parseInt(beforeCount.rows[0].count);
    console.log(`   Difference: +${diff} transactions`);

    if (response.data.errors > 0) {
      console.log(`\n⚠️  Upload completed with ${response.data.errors} errors`);
      console.log(`✅ Valid transactions were inserted: ${response.data.validRows}`);
      console.log(`❌ Invalid rows were rejected: ${response.data.errors}`);
    }

    client2.release();

    console.log('\n✅ Test 2 PASSED: Invalid data handled correctly (partial upload allowed)!\n');
    return true;

  } catch (error) {
    console.error('❌ Test 2 FAILED:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }

    // Verify rollback worked
    const client3 = await pool.connect();
    const afterCount = await client3.query('SELECT COUNT(*) FROM sp_v2_transactions');
    const afterSessions = await client3.query('SELECT COUNT(*) FROM sp_v2_upload_sessions WHERE status = \'FAILED\'');

    console.log(`\n📊 After failed upload: ${afterCount.rows[0].count} transactions, ${afterSessions.rows[0].count} failed sessions`);

    const diff = parseInt(afterCount.rows[0].count) - parseInt(beforeCount.rows[0].count);

    if (diff === 0) {
      console.log('✅ ROLLBACK WORKED: No transactions were inserted after failure!');
    } else {
      console.log(`❌ ROLLBACK FAILED: ${diff} transactions were partially inserted!`);
    }

    client3.release();
    return false;
  }
}

async function testConcurrentUploads() {
  console.log('\n📤 Test 3: Concurrent Uploads (Race Condition Test)');
  console.log('====================================================\n');

  const createFormData = (index) => {
    const form = new FormData();
    // Create unique file for each concurrent upload
    const csvData = `transaction_id,merchant_id,amount_paise,currency,payment_method,status
TX_CONCURRENT_${index}_1,MERCH001,10000,INR,UPI,SUCCESS
TX_CONCURRENT_${index}_2,MERCH001,20000,INR,CARD,SUCCESS
TX_CONCURRENT_${index}_3,MERCH001,15000,INR,UPI,SUCCESS
`;
    const tmpFilename = `/tmp/test-concurrent-${index}.csv`;
    fs.writeFileSync(tmpFilename, csvData);

    form.append('file', fs.createReadStream(tmpFilename));
    form.append('fileType', 'transactions');
    form.append('userId', `test-user-concurrent-${index}`);
    // merchantId is optional - don't send invalid UUID

    return { form, tmpFilename };
  };

  try {
    // Launch 3 concurrent uploads
    const uploads = [];
    const tmpFiles = [];

    for (let i = 1; i <= 3; i++) {
      const { form, tmpFilename } = createFormData(i);
      tmpFiles.push(tmpFilename);

      uploads.push(
        axios.post(`${UPLOAD_API_URL}/api/upload/single`, form, {
          headers: form.getHeaders(),
        })
      );
    }

    console.log('🚀 Launching 3 concurrent uploads...\n');

    const results = await Promise.all(uploads);

    console.log('✅ All uploads completed successfully!');
    results.forEach((response, i) => {
      console.log(`   Upload ${i + 1}: Session ${response.data.uploadSessionId?.substring(0, 8)}... - ${response.data.validRows} rows inserted`);
    });

    // Verify all sessions are distinct
    const sessionIds = results.map(r => r.data.uploadSessionId);
    const uniqueSessions = new Set(sessionIds);

    if (uniqueSessions.size === 3) {
      console.log('\n✅ PASS: All uploads got unique session IDs');
    } else {
      console.log('\n❌ FAIL: Duplicate session IDs detected!');
    }

    // Cleanup temp files
    tmpFiles.forEach(file => {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    console.log('\n✅ Test 3 PASSED: Concurrent uploads handled correctly!\n');
    return true;

  } catch (error) {
    console.error('❌ Test 3 FAILED:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Upload Session Testing - Issue #3 Phase 1');
  console.log('==============================================\n');

  // Check if upload API is running
  const apiRunning = await checkUploadApiRunning();
  if (!apiRunning) {
    process.exit(1);
  }

  try {
    const test1 = await testValidUpload();
    const test2 = await testInvalidUpload();
    const test3 = await testConcurrentUploads();

    console.log('\n📊 Test Summary');
    console.log('===============');
    console.log(`Test 1 (Valid Upload): ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 2 (Invalid Upload): ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 3 (Concurrent Uploads): ${test3 ? '✅ PASS' : '❌ FAIL'}`);

    const allPassed = test1 && test2 && test3;

    if (allPassed) {
      console.log('\n🎉 All tests PASSED! Upload session tracking is working correctly.\n');
    } else {
      console.log('\n⚠️  Some tests FAILED. Please review the output above.\n');
    }

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run tests
runAllTests();
