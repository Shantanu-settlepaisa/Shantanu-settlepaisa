const axios = require('axios');
const fs = require('fs');

async function testExceptionReasons() {
  console.log('='.repeat(80));
  console.log('TESTING EXCEPTION REASONS FEATURE');
  console.log('='.repeat(80));
  console.log('');
  
  try {
    // Step 1: Prepare test data with different exception scenarios
    console.log('1. PREPARING TEST DATA');
    console.log('-'.repeat(80));
    
    const pgTransactions = [
      // Perfect match - no exception
      {
        "Transaction ID": "TXN_TEST_001",
        "Merchant ID": "MERCH001",
        "Amount": "1000.00",
        "Currency": "INR",
        "Transaction Date": "2025-10-02",
        "Transaction Time": "10:00:00",
        "Payment Method": "UPI",
        "UTR": "UTR_MATCH_001",
        "RRN": "2025100200001",
        "Status": "SUCCESS"
      },
      // Amount mismatch exception
      {
        "Transaction ID": "TXN_TEST_002",
        "Merchant ID": "MERCH002",
        "Amount": "2000.00",
        "Currency": "INR",
        "Transaction Date": "2025-10-02",
        "Transaction Time": "11:00:00",
        "Payment Method": "UPI",
        "UTR": "UTR_MISMATCH_001",
        "RRN": "2025100200002",
        "Status": "SUCCESS"
      }
    ];
    
    const bankRecords = [
      // Matching bank record
      {
        "Bank Reference": "BANK_TEST_001",
        "Bank Name": "ICICI",
        "Amount": "1000.00",
        "Transaction Date": "2025-10-02",
        "Value Date": "2025-10-02",
        "UTR": "UTR_MATCH_001",
        "Remarks": "Test match",
        "Debit/Credit": "CREDIT"
      },
      // Mismatched amount
      {
        "Bank Reference": "BANK_TEST_002",
        "Bank Name": "HDFC",
        "Amount": "2100.00",
        "Transaction Date": "2025-10-02",
        "Value Date": "2025-10-02",
        "UTR": "UTR_MISMATCH_001",
        "Remarks": "Test mismatch",
        "Debit/Credit": "CREDIT"
      }
    ];
    
    console.log(`Created ${pgTransactions.length} PG transactions`);
    console.log(`Created ${bankRecords.length} bank records`);
    console.log('Expected: 1 match, 1 AMOUNT_MISMATCH exception');
    console.log('');
    
    // Step 2: Trigger reconciliation
    console.log('2. RUNNING RECONCILIATION');
    console.log('-'.repeat(80));
    
    const reconResponse = await axios.post('http://localhost:5103/recon/run', {
      date: '2025-10-02',
      // test: true,  // Don't use test mode - we want real execution
      dryRun: false,
      pgTransactions,
      bankRecords
    });
    
    const jobId = reconResponse.data.jobId;
    console.log(`✅ Reconciliation started: ${jobId}`);
    console.log('');
    
    // Step 3: Wait for completion
    console.log('3. WAITING FOR COMPLETION');
    console.log('-'.repeat(80));
    
    let job;
    let attempts = 0;
    const maxAttempts = 20;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const jobResponse = await axios.get(`http://localhost:5103/recon/jobs/${jobId}`);
      job = jobResponse.data;
      
      if (job.status === 'completed' || job.status === 'failed') {
        break;
      }
      attempts++;
      process.stdout.write('.');
    }
    
    console.log('');
    console.log(`Job status: ${job.status}`);
    console.log(`Duration: ${job.duration}ms`);
    console.log('');
    
    if (job.status !== 'completed') {
      console.error('❌ Job did not complete successfully');
      console.error('Error:', job.error);
      process.exit(1);
    }
    
    // Step 4: Verify exception reasons in database
    console.log('4. VERIFYING EXCEPTION REASONS IN DATABASE');
    console.log('-'.repeat(80));
    
    const { Pool } = require('pg');
    const pool = new Pool({
      host: 'localhost',
      port: 5433,
      database: 'settlepaisa_v2',
      user: 'postgres',
      password: 'settlepaisa123'
    });
    
    const client = await pool.connect();
    
    try {
      // Check sp_v2_transactions
      const txnResult = await client.query(`
        SELECT 
          transaction_id,
          status,
          exception_reason,
          amount_paise
        FROM sp_v2_transactions
        WHERE transaction_id LIKE 'TXN_TEST_%'
        ORDER BY transaction_id
      `);
      
      console.log('Transactions in sp_v2_transactions:');
      txnResult.rows.forEach(row => {
        console.log(`  ${row.transaction_id}:`);
        console.log(`    - status: ${row.status}`);
        console.log(`    - exception_reason: ${row.exception_reason || 'NULL'}`);
        console.log(`    - amount: ₹${(row.amount_paise / 100).toFixed(2)}`);
      });
      console.log('');
      
      // Check sp_v2_exception_workflow
      const workflowResult = await client.query(`
        SELECT 
          ew.exception_id,
          t.transaction_id,
          ew.reason,
          ew.severity,
          ew.status,
          ew.pg_amount_paise,
          ew.bank_amount_paise,
          ew.amount_delta_paise
        FROM sp_v2_exception_workflow ew
        JOIN sp_v2_transactions t ON ew.transaction_id = t.id
        WHERE t.transaction_id LIKE 'TXN_TEST_%'
        ORDER BY t.transaction_id
      `);
      
      console.log('Exceptions in sp_v2_exception_workflow:');
      workflowResult.rows.forEach(row => {
        console.log(`  ${row.exception_id}:`);
        console.log(`    - transaction: ${row.transaction_id}`);
        console.log(`    - reason: ${row.reason}`);
        console.log(`    - severity: ${row.severity}`);
        console.log(`    - status: ${row.status}`);
        console.log(`    - PG amount: ₹${(row.pg_amount_paise / 100).toFixed(2)}`);
        console.log(`    - Bank amount: ₹${(row.bank_amount_paise / 100).toFixed(2)}`);
        console.log(`    - Delta: ₹${(row.amount_delta_paise / 100).toFixed(2)}`);
      });
      console.log('');
      
      // Step 5: Verify via API
      console.log('5. VERIFYING VIA EXCEPTIONS API');
      console.log('-'.repeat(80));
      
      const apiResponse = await axios.get('http://localhost:5103/exceptions-v2?limit=200');
      const testExceptions = apiResponse.data.items.filter(exc => 
        exc.pgTransactionId && exc.pgTransactionId.startsWith('TXN_TEST_')
      );
      
      console.log(`Found ${testExceptions.length} test exceptions via API`);
      testExceptions.forEach(exc => {
        console.log(`  ${exc.exceptionCode}:`);
        console.log(`    - transaction: ${exc.pgTransactionId}`);
        console.log(`    - reason: ${exc.reason}`);
        console.log(`    - severity: ${exc.severity}`);
        console.log(`    - PG: ₹${(exc.pgAmount / 100).toFixed(2)}`);
        console.log(`    - Bank: ₹${(exc.bankAmount / 100).toFixed(2)}`);
      });
      console.log('');
      
      // Step 6: Verify results
      console.log('6. VERIFICATION RESULTS');
      console.log('-'.repeat(80));
      
      let allPassed = true;
      
      // Check 1: TXN_TEST_001 should be RECONCILED (no exception)
      const txn001 = txnResult.rows.find(r => r.transaction_id === 'TXN_TEST_001');
      if (txn001 && txn001.status === 'RECONCILED') {
        console.log('✅ TXN_TEST_001: Correctly RECONCILED (no exception)');
      } else {
        console.log('❌ TXN_TEST_001: Expected RECONCILED, got', txn001?.status);
        allPassed = false;
      }
      
      // Check 2: TXN_TEST_002 should be EXCEPTION with reason AMOUNT_MISMATCH
      const txn002 = txnResult.rows.find(r => r.transaction_id === 'TXN_TEST_002');
      if (txn002 && txn002.status === 'EXCEPTION' && txn002.exception_reason === 'AMOUNT_MISMATCH') {
        console.log('✅ TXN_TEST_002: Correctly marked as EXCEPTION with reason AMOUNT_MISMATCH');
      } else {
        console.log('❌ TXN_TEST_002: Expected EXCEPTION with reason AMOUNT_MISMATCH');
        console.log(`   Got status: ${txn002?.status}, reason: ${txn002?.exception_reason}`);
        allPassed = false;
      }
      
      // Check 3: Exception workflow should have correct reason
      const exc002 = workflowResult.rows.find(r => r.transaction_id === 'TXN_TEST_002');
      if (exc002 && exc002.reason === 'AMOUNT_MISMATCH') {
        console.log('✅ Exception workflow: Correctly shows reason AMOUNT_MISMATCH');
        console.log(`   Severity: ${exc002.severity} (expected HIGH or MEDIUM)`);
      } else {
        console.log('❌ Exception workflow: Expected reason AMOUNT_MISMATCH, got', exc002?.reason);
        allPassed = false;
      }
      
      // Check 4: API should return correct reason
      const apiExc002 = testExceptions.find(e => e.pgTransactionId === 'TXN_TEST_002');
      if (apiExc002 && apiExc002.reason === 'AMOUNT_MISMATCH') {
        console.log('✅ API response: Correctly returns reason AMOUNT_MISMATCH');
      } else {
        console.log('❌ API response: Expected reason AMOUNT_MISMATCH, got', apiExc002?.reason);
        allPassed = false;
      }
      
      console.log('');
      console.log('='.repeat(80));
      if (allPassed) {
        console.log('✅ ALL TESTS PASSED - Exception reasons working correctly!');
      } else {
        console.log('❌ SOME TESTS FAILED - See details above');
      }
      console.log('='.repeat(80));
      console.log('');
      
      // Cleanup test data
      console.log('7. CLEANUP');
      console.log('-'.repeat(80));
      await client.query(`DELETE FROM sp_v2_exception_workflow WHERE transaction_id IN (
        SELECT id FROM sp_v2_transactions WHERE transaction_id LIKE 'TXN_TEST_%'
      )`);
      await client.query(`DELETE FROM sp_v2_transactions WHERE transaction_id LIKE 'TXN_TEST_%'`);
      await client.query(`DELETE FROM sp_v2_bank_statements WHERE bank_ref LIKE 'BANK_TEST_%'`);
      console.log('✅ Test data cleaned up');
      console.log('');
      
      process.exit(allPassed ? 0 : 1);
      
    } finally {
      client.release();
      await pool.end();
    }
    
  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testExceptionReasons();
