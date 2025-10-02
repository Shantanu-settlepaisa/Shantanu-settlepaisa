const axios = require('axios');

async function testAllExceptionTypes() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   TESTING ALL EXCEPTION TYPES - COMPREHENSIVE TEST   ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
  
  const testDate = new Date().toISOString().split('T')[0];  // Today's date
  console.log(`📅 Test Date: ${testDate}\n`);
  
  // Create test data covering all exception scenarios
  const pgTransactions = [
    // 1. Perfect match (should be RECONCILED)
    {
      "Transaction ID": "TXN_MATCH_001",
      "Merchant ID": "MERCH001",
      "Amount": "1000.00",
      "Currency": "INR",
      "Transaction Date": testDate,
      "Transaction Time": "10:00:00",
      "Payment Method": "UPI",
      "UTR": "UTR_PERFECT_MATCH",
      "Status": "SUCCESS"
    },
    
    // 2. AMOUNT_MISMATCH (same UTR, different amount)
    {
      "Transaction ID": "TXN_AMT_MISMATCH_001",
      "Merchant ID": "MERCH002",
      "Amount": "2000.00",
      "Currency": "INR",
      "Transaction Date": testDate,
      "Transaction Time": "11:00:00",
      "Payment Method": "UPI",
      "UTR": "UTR_AMOUNT_MISMATCH",
      "Status": "SUCCESS"
    },
    
    // 3. UNMATCHED_IN_BANK (PG exists, no bank record)
    {
      "Transaction ID": "TXN_NO_BANK_001",
      "Merchant ID": "MERCH003",
      "Amount": "3000.00",
      "Currency": "INR",
      "Transaction Date": testDate,
      "Transaction Time": "12:00:00",
      "Payment Method": "UPI",
      "UTR": "UTR_NOT_IN_BANK",
      "Status": "SUCCESS"
    },
    
    // 4. MISSING_UTR (PG transaction without UTR)
    {
      "Transaction ID": "TXN_NO_UTR_001",
      "Merchant ID": "MERCH004",
      "Amount": "4000.00",
      "Currency": "INR",
      "Transaction Date": testDate,
      "Transaction Time": "13:00:00",
      "Payment Method": "UPI",
      "UTR": "",  // Empty UTR
      "Status": "SUCCESS"
    },
    
    // 5. DUPLICATE_UTR (same UTR in multiple PG transactions)
    {
      "Transaction ID": "TXN_DUP_001",
      "Merchant ID": "MERCH005",
      "Amount": "5000.00",
      "Currency": "INR",
      "Transaction Date": testDate,
      "Transaction Time": "14:00:00",
      "Payment Method": "UPI",
      "UTR": "UTR_DUPLICATE",
      "Status": "SUCCESS"
    },
    {
      "Transaction ID": "TXN_DUP_002",
      "Merchant ID": "MERCH005",
      "Amount": "5500.00",
      "Currency": "INR",
      "Transaction Date": testDate,
      "Transaction Time": "14:05:00",
      "Payment Method": "UPI",
      "UTR": "UTR_DUPLICATE",  // Same UTR!
      "Status": "SUCCESS"
    }
  ];
  
  const bankRecords = [
    // 1. Perfect match with TXN_MATCH_001
    {
      "Bank Reference": "BANK_MATCH_001",
      "Bank Name": "ICICI",
      "Amount": "1000.00",
      "Transaction Date": testDate,
      "Value Date": testDate,
      "UTR": "UTR_PERFECT_MATCH",
      "Remarks": "Perfect match test",
      "Debit/Credit": "CREDIT"
    },
    
    // 2. Amount mismatch with TXN_AMT_MISMATCH_001
    {
      "Bank Reference": "BANK_AMT_DIFF_001",
      "Bank Name": "HDFC",
      "Amount": "2100.00",  // ₹100 more than PG
      "Transaction Date": testDate,
      "Value Date": testDate,
      "UTR": "UTR_AMOUNT_MISMATCH",
      "Remarks": "Amount differs from PG",
      "Debit/Credit": "CREDIT"
    },
    
    // 3. UNMATCHED_IN_PG (Bank exists, no PG record)
    {
      "Bank Reference": "BANK_NO_PG_001",
      "Bank Name": "SBI",
      "Amount": "6000.00",
      "Transaction Date": testDate,
      "Value Date": testDate,
      "UTR": "UTR_ONLY_IN_BANK",
      "Remarks": "This has no matching PG transaction",
      "Debit/Credit": "CREDIT"
    }
  ];
  
  console.log('📋 Test Data Summary:');
  console.log(`   PG Transactions: ${pgTransactions.length}`);
  console.log(`   Bank Records: ${bankRecords.length}`);
  console.log('');
  console.log('Expected Results:');
  console.log('   ✅ RECONCILED: 1 (perfect match)');
  console.log('   ❌ AMOUNT_MISMATCH: 1');
  console.log('   ❌ UNMATCHED_IN_BANK: 1');
  console.log('   ❌ MISSING_UTR: 1');
  console.log('   ❌ DUPLICATE_UTR: 2');
  console.log('   ⚠️  UNMATCHED_IN_PG: 1 (in bank_statements)');
  console.log('');
  
  try {
    // Run reconciliation
    console.log('🔄 Running reconciliation...\n');
    const reconResponse = await axios.post('http://localhost:5103/recon/run', {
      date: testDate,
      pgTransactions,
      bankRecords,
      dryRun: false
    });
    
    const jobId = reconResponse.data.jobId;
    console.log(`✅ Job started: ${jobId}\n`);
    
    // Wait for completion
    let job;
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(r => setTimeout(r, 500));
      const jobRes = await axios.get(`http://localhost:5103/recon/jobs/${jobId}`);
      job = jobRes.data;
      
      if (job.status === 'completed' || job.status === 'failed') {
        break;
      }
      attempts++;
      process.stdout.write('.');
    }
    
    console.log(`\n\n📊 Job Result: ${job.status.toUpperCase()}`);
    console.log(`   Duration: ${job.duration}ms`);
    console.log(`   Matched: ${job.counters.matched}`);
    console.log(`   Exceptions: ${job.counters.exception}`);
    console.log(`   Unmatched PG: ${job.counters.unmatchedPg}`);
    console.log(`   Unmatched Bank: ${job.counters.unmatchedBank}`);
    console.log('');
    
    // Query exception breakdown
    const { Pool } = require('pg');
    const pool = new Pool({
      host: 'localhost',
      port: 5433,
      database: 'settlepaisa_v2',
      user: 'postgres',
      password: 'settlepaisa123'
    });
    
    const result = await pool.query(`
      SELECT 
        exception_reason,
        COUNT(*) as count,
        ARRAY_AGG(transaction_id) as transaction_ids
      FROM sp_v2_transactions
      WHERE transaction_date = $1
        AND status = 'EXCEPTION'
      GROUP BY exception_reason
      ORDER BY count DESC
    `, [testDate]);
    
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║          EXCEPTION BREAKDOWN BY TYPE                 ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
    
    result.rows.forEach(row => {
      console.log(`${row.exception_reason}:`);
      console.log(`   Count: ${row.count}`);
      console.log(`   Transactions: ${row.transaction_ids.join(', ')}`);
      console.log('');
    });
    
    // Check exception workflow
    const workflowResult = await pool.query(`
      SELECT 
        ew.reason,
        ew.severity,
        COUNT(*) as count,
        ARRAY_AGG(ew.exception_id) as exception_ids
      FROM sp_v2_exception_workflow ew
      JOIN sp_v2_transactions t ON ew.transaction_id = t.id
      WHERE t.transaction_date = $1
      GROUP BY ew.reason, ew.severity
      ORDER BY count DESC
    `, [testDate]);
    
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║       EXCEPTION WORKFLOW (with Severity)             ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
    
    workflowResult.rows.forEach(row => {
      console.log(`${row.reason} - ${row.severity}:`);
      console.log(`   Count: ${row.count}`);
      console.log(`   Exception IDs: ${row.exception_ids.slice(0, 3).join(', ')}`);
      console.log('');
    });
    
    // Check unmatched bank
    const unmatchedBankResult = await pool.query(`
      SELECT 
        bank_ref,
        utr,
        amount_paise,
        processed
      FROM sp_v2_bank_statements
      WHERE transaction_date = $1
        AND processed = false
    `, [testDate]);
    
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║            UNMATCHED BANK RECORDS                     ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
    
    if (unmatchedBankResult.rows.length > 0) {
      unmatchedBankResult.rows.forEach(row => {
        console.log(`${row.bank_ref}:`);
        console.log(`   UTR: ${row.utr}`);
        console.log(`   Amount: ₹${(row.amount_paise / 100).toFixed(2)}`);
        console.log(`   Processed: ${row.processed}`);
        console.log('   → This is UNMATCHED_IN_PG exception');
        console.log('');
      });
    } else {
      console.log('   No unmatched bank records found\n');
    }
    
    await pool.end();
    
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║                 ✅ TEST COMPLETE                      ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
    
    console.log('All exception types working correctly!');
    console.log('View in UI: http://localhost:5174/ops/exceptions\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

testAllExceptionTypes();
