#!/usr/bin/env node

/**
 * FEES_VARIANCE Exception Type Test (V2.10.0)
 * 
 * Tests the new FEES_VARIANCE detection logic with explicit bank fee data.
 * 
 * Test Scenarios:
 * 1. PG Fee Calculation Mismatch: Amount - Fee ≠ Settlement Amount
 * 2. Bank Credit Mismatch: Bank credited amount doesn't match expected settlement
 * 3. Bank Fee Mismatch: Recorded fee ≠ Calculated fee (based on bank credit)
 * 4. Perfect Match: All fee validations pass
 */

const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'postgres',
  port: 5433,
});

async function testFeesVariance() {
  console.log('🧪 Testing FEES_VARIANCE Detection (V2.10.0)\n');
  console.log('=' .repeat(80));
  
  const testDate = '2025-10-02';
  
  // Scenario 1: PG Fee Calculation Mismatch
  // Customer paid: ₹10,000
  // Recorded bank fee: ₹300
  // Recorded settlement: ₹9,500 (WRONG! Should be ₹9,700)
  // Bank credited: ₹9,700
  const scenario1 = {
    "Transaction ID": "TXN_FEE_CALC_MISMATCH",
    "Merchant ID": "MERCH001",
    "Amount": "10000.00",
    "Bank Fee": "300.00",
    "Settlement Amount": "9500.00",  // WRONG: Should be 10000 - 300 = 9700
    "Currency": "INR",
    "Transaction Date": testDate,
    "Transaction Time": "10:00:00",
    "Payment Method": "UPI",
    "UTR": "UTR_FEE_CALC_001",
    "Status": "SUCCESS"
  };
  
  // Scenario 2: Bank Credit Mismatch
  // Customer paid: ₹15,000
  // Recorded bank fee: ₹400
  // Expected settlement: ₹14,600
  // Bank credited: ₹14,200 (WRONG! Bank overcharged)
  const scenario2 = {
    "Transaction ID": "TXN_BANK_CREDIT_MISMATCH",
    "Merchant ID": "MERCH002",
    "Amount": "15000.00",
    "Bank Fee": "400.00",
    "Settlement Amount": "14600.00",
    "Currency": "INR",
    "Transaction Date": testDate,
    "Transaction Time": "11:00:00",
    "Payment Method": "CARD",
    "UTR": "UTR_BANK_CREDIT_002",
    "Status": "SUCCESS"
  };
  
  // Scenario 3: Bank Fee Mismatch
  // Customer paid: ₹20,000
  // Recorded bank fee: ₹500
  // Bank credited: ₹19,000 (implies actual fee was ₹1,000)
  // Calculated fee: ₹1,000 ≠ ₹500 (WRONG recorded fee!)
  const scenario3 = {
    "Transaction ID": "TXN_BANK_FEE_MISMATCH",
    "Merchant ID": "MERCH003",
    "Amount": "20000.00",
    "Bank Fee": "500.00",  // WRONG: Actual fee was ₹1,000
    "Settlement Amount": "19500.00",
    "Currency": "INR",
    "Transaction Date": testDate,
    "Transaction Time": "12:00:00",
    "Payment Method": "NETBANKING",
    "UTR": "UTR_FEE_MISMATCH_003",
    "Status": "SUCCESS"
  };
  
  // Scenario 4: Perfect Match
  // Customer paid: ₹25,000
  // Bank fee: ₹600
  // Settlement: ₹24,400
  // Bank credited: ₹24,400 ✅
  const scenario4 = {
    "Transaction ID": "TXN_PERFECT_FEES",
    "Merchant ID": "MERCH004",
    "Amount": "25000.00",
    "Bank Fee": "600.00",
    "Settlement Amount": "24400.00",
    "Currency": "INR",
    "Transaction Date": testDate,
    "Transaction Time": "13:00:00",
    "Payment Method": "UPI",
    "UTR": "UTR_PERFECT_004",
    "Status": "SUCCESS"
  };
  
  // Scenario 5: No explicit fees (fallback to heuristic)
  // Customer paid: ₹5,000
  // Bank credited: ₹4,997 (₹3 difference - should trigger FEE_MISMATCH, not FEES_VARIANCE)
  const scenario5 = {
    "Transaction ID": "TXN_NO_EXPLICIT_FEE",
    "Merchant ID": "MERCH005",
    "Amount": "5000.00",
    "Currency": "INR",
    "Transaction Date": testDate,
    "Transaction Time": "14:00:00",
    "Payment Method": "UPI",
    "UTR": "UTR_HEURISTIC_005",
    "Status": "SUCCESS"
  };
  
  const pgTransactions = [scenario1, scenario2, scenario3, scenario4, scenario5];
  
  // Bank records (matching UTRs with actual credited amounts)
  const bankRecords = [
    {
      "UTR": "UTR_FEE_CALC_001",
      "Amount": "9700.00",  // Correct credit amount
      "Transaction Date": testDate,
      "Bank Name": "HDFC Bank"
    },
    {
      "UTR": "UTR_BANK_CREDIT_002",
      "Amount": "14200.00",  // Bank overcharged (credited less)
      "Transaction Date": testDate,
      "Bank Name": "ICICI Bank"
    },
    {
      "UTR": "UTR_FEE_MISMATCH_003",
      "Amount": "19000.00",  // Bank charged ₹1,000 instead of ₹500
      "Transaction Date": testDate,
      "Bank Name": "Axis Bank"
    },
    {
      "UTR": "UTR_PERFECT_004",
      "Amount": "24400.00",  // Perfect match
      "Transaction Date": testDate,
      "Bank Name": "HDFC Bank"
    },
    {
      "UTR": "UTR_HEURISTIC_005",
      "Amount": "4997.00",  // ₹3 difference (heuristic detection)
      "Transaction Date": testDate,
      "Bank Name": "SBI"
    }
  ];
  
  try {
    // Step 1: Clean up test data
    console.log('\n📋 Step 1: Cleaning up previous test data...');
    await pool.query(`DELETE FROM sp_v2_transactions WHERE transaction_date = $1`, [testDate]);
    await pool.query(`DELETE FROM sp_v2_bank_statements WHERE transaction_date = $1`, [testDate]);
    await pool.query(`DELETE FROM sp_v2_exception_workflow WHERE created_at::date = $1`, [testDate]);
    console.log('✅ Cleanup complete');
    
    // Step 2: Run reconciliation via API
    console.log('\n🔄 Step 2: Running reconciliation with fee data...');
    const reconResponse = await axios.post('http://localhost:5103/recon/run', {
      date: testDate,
      pgTransactions,
      bankRecords
    });
    
    console.log('✅ Reconciliation job started:', reconResponse.data.jobId);
    
    // Step 3: Wait for job completion
    console.log('\n⏳ Step 3: Waiting for job completion...');
    let jobCompleted = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!jobCompleted && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const jobStatus = await axios.get(`http://localhost:5103/recon/jobs/${reconResponse.data.jobId}`);
      
      if (jobStatus.data.status === 'completed') {
        jobCompleted = true;
        console.log('✅ Job completed:', jobStatus.data.counters);
      } else if (jobStatus.data.status === 'failed') {
        throw new Error(`Job failed: ${jobStatus.data.error}`);
      }
      attempts++;
    }
    
    if (!jobCompleted) {
      throw new Error('Job did not complete in time');
    }
    
    // Step 4: Query results
    console.log('\n📊 Step 4: Analyzing results...\n');
    console.log('=' .repeat(80));
    
    // Get exception breakdown
    const exceptionBreakdown = await pool.query(`
      SELECT 
        exception_reason,
        COUNT(*) as count,
        ARRAY_AGG(transaction_id ORDER BY transaction_id) as transaction_ids,
        ARRAY_AGG(
          CONCAT(
            'Amt: ₹', ROUND(amount_paise::numeric / 100, 2),
            ', Fee: ₹', ROUND(COALESCE(bank_fee_paise, 0)::numeric / 100, 2),
            ', Settlement: ₹', ROUND(COALESCE(settlement_amount_paise, 0)::numeric / 100, 2),
            ', Variance: ₹', ROUND(COALESCE(fee_variance_paise, 0)::numeric / 100, 2),
            ' (', ROUND(COALESCE(fee_variance_percentage, 0)::numeric, 2), '%)'
          ) ORDER BY transaction_id
        ) as details
      FROM sp_v2_transactions
      WHERE transaction_date = $1 AND status = 'EXCEPTION'
      GROUP BY exception_reason
      ORDER BY CASE exception_reason
        WHEN 'FEES_VARIANCE' THEN 1
        WHEN 'FEE_MISMATCH' THEN 2
        ELSE 3
      END
    `, [testDate]);
    
    console.log('📋 Exception Breakdown:\n');
    exceptionBreakdown.rows.forEach(row => {
      console.log(`\n🔸 ${row.exception_reason} (${row.count} transactions)`);
      console.log(`   Transactions: ${row.transaction_ids.join(', ')}`);
      row.details.forEach((detail, idx) => {
        console.log(`   [${idx + 1}] ${detail}`);
      });
    });
    
    // Get matched transactions
    const matchedCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE transaction_date = $1 AND status = 'RECONCILED'
    `, [testDate]);
    
    console.log(`\n\n✅ Matched Transactions: ${matchedCount.rows[0].count}`);
    
    // Get exception workflow entries
    const workflowCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_exception_workflow
      WHERE created_at::date = $1
    `, [testDate]);
    
    console.log(`📝 Exception Workflow Entries: ${workflowCount.rows[0].count}`);
    
    // Detailed FEES_VARIANCE analysis
    console.log('\n\n📈 FEES_VARIANCE Detailed Analysis:\n');
    console.log('=' .repeat(80));
    
    const feesVarianceDetails = await pool.query(`
      SELECT 
        transaction_id,
        amount_paise / 100.0 as amount,
        bank_fee_paise / 100.0 as bank_fee,
        settlement_amount_paise / 100.0 as settlement_amount,
        fee_variance_paise / 100.0 as fee_variance,
        fee_variance_percentage,
        exception_reason
      FROM sp_v2_transactions
      WHERE transaction_date = $1 AND exception_reason = 'FEES_VARIANCE'
      ORDER BY transaction_id
    `, [testDate]);
    
    feesVarianceDetails.rows.forEach(row => {
      console.log(`\n🔸 ${row.transaction_id}`);
      console.log(`   Amount: ₹${row.amount}`);
      console.log(`   Bank Fee: ₹${row.bank_fee}`);
      console.log(`   Settlement: ₹${row.settlement_amount}`);
      console.log(`   Fee Variance: ₹${row.fee_variance} (${row.fee_variance_percentage?.toFixed(2)}%)`);
      
      // Determine which check failed
      const expectedSettlement = row.amount - row.bank_fee;
      if (Math.abs(expectedSettlement - row.settlement_amount) > 1) {
        console.log(`   ❌ Internal consistency check failed: ₹${row.amount} - ₹${row.bank_fee} ≠ ₹${row.settlement_amount}`);
      }
    });
    
    // Verification
    console.log('\n\n🔍 Verification:\n');
    console.log('=' .repeat(80));
    
    const expectedResults = {
      'FEES_VARIANCE': 3,  // Scenarios 1, 2, 3
      'FEE_MISMATCH': 1,   // Scenario 5 (no explicit fees)
      'RECONCILED': 1      // Scenario 4
    };
    
    let allPassed = true;
    
    for (const [reason, expectedCount] of Object.entries(expectedResults)) {
      let actualCount;
      if (reason === 'RECONCILED') {
        actualCount = parseInt(matchedCount.rows[0].count);
      } else {
        const exRow = exceptionBreakdown.rows.find(r => r.exception_reason === reason);
        actualCount = exRow ? parseInt(exRow.count) : 0;
      }
      
      const status = actualCount === expectedCount ? '✅' : '❌';
      console.log(`${status} ${reason}: Expected ${expectedCount}, Got ${actualCount}`);
      
      if (actualCount !== expectedCount) {
        allPassed = false;
      }
    }
    
    console.log('\n' + '=' .repeat(80));
    if (allPassed) {
      console.log('🎉 ALL TESTS PASSED! FEES_VARIANCE detection working correctly.');
    } else {
      console.log('❌ SOME TESTS FAILED! Check the results above.');
    }
    
    console.log('\n📋 Test Summary:');
    console.log('   - Scenario 1 (Fee Calc Mismatch): Should be FEES_VARIANCE ✅');
    console.log('   - Scenario 2 (Bank Credit Mismatch): Should be FEES_VARIANCE ✅');
    console.log('   - Scenario 3 (Bank Fee Mismatch): Should be FEES_VARIANCE ✅');
    console.log('   - Scenario 4 (Perfect Match): Should be RECONCILED ✅');
    console.log('   - Scenario 5 (No Explicit Fees): Should be FEE_MISMATCH (heuristic) ✅');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testFeesVariance();
