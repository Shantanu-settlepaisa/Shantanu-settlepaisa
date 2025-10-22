/**
 * Test Settlement Calculator with Refunds and Chargebacks
 *
 * Test Scenarios:
 * 1. Simple case: No refunds/chargebacks
 * 2. Same-cycle refund (refund before settlement)
 * 3. Cross-cycle refund (refund after settlement)
 * 4. Chargeback deduction
 * 5. Negative settlement (debt tracking)
 * 6. Multiple deductions combined
 */

const { Pool } = require('pg');
const { calculateMerchantSettlement, completeSettlementProcessing } = require('./services/settlement-engine/settlement-calculator-with-deductions.cjs');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function setupTestData() {
  console.log('\n🔧 Setting up test data...\n');

  // Create test merchant
  const merchantId = 'TEST_MERCH_001';
  const cycleDate = '2025-10-21';

  // Clean up existing test data
  await pool.query(`DELETE FROM sp_v2_recon_matches WHERE pg_txn_id LIKE 'TEST_TXN_%'`);
  await pool.query(`DELETE FROM sp_v2_settlement_items WHERE transaction_id LIKE 'TEST_TXN_%'`);
  await pool.query(`DELETE FROM sp_v2_transactions WHERE transaction_id LIKE 'TEST_TXN_%'`);
  await pool.query(`DELETE FROM sp_v2_chargebacks WHERE txn_ref LIKE 'TEST_TXN_%'`);
  await pool.query(`DELETE FROM sp_v2_merchant_outstanding_debts WHERE merchant_id = $1`, [merchantId]);

  // Insert test transactions
  const transactions = [
    { id: 'TEST_TXN_001', amount: 1000000, date: cycleDate }, // ₹10,000
    { id: 'TEST_TXN_002', amount: 500000, date: cycleDate },  // ₹5,000
    { id: 'TEST_TXN_003', amount: 800000, date: cycleDate },  // ₹8,000
    { id: 'TEST_TXN_004', amount: 1200000, date: cycleDate }, // ₹12,000
  ];

  for (const txn of transactions) {
    await pool.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise, transaction_date,
        payment_method, status, source_type, created_at
      ) VALUES ($1, $2, $3, $4, 'UPI', 'SUCCESS', 'MANUAL_UPLOAD', NOW())
    `, [txn.id, merchantId, txn.amount, txn.date]);

    // Create reconciliation match
    await pool.query(`
      INSERT INTO sp_v2_recon_matches (
        job_id, pg_txn_id, bank_ref, status, created_at
      ) VALUES ('TEST_JOB_001', $1, $1, 'MATCHED', NOW())
    `, [txn.id]);
  }

  console.log(`✅ Created 4 test transactions (Total: ₹35,000)`);
  console.log(`   • TEST_TXN_001: ₹10,000`);
  console.log(`   • TEST_TXN_002: ₹5,000`);
  console.log(`   • TEST_TXN_003: ₹8,000`);
  console.log(`   • TEST_TXN_004: ₹12,000`);

  return { merchantId, cycleDate, transactions };
}

async function testScenario1_NoDeductions(merchantId, cycleDate) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 TEST SCENARIO 1: No Refunds/Chargebacks (Clean Settlement)');
  console.log('='.repeat(80));

  const result = await calculateMerchantSettlement(merchantId, cycleDate);

  console.log('\n📊 EXPECTED:');
  console.log('   Gross: ₹35,000');
  console.log('   Fees:  ₹1,225 (2% + 1.5%)');
  console.log('   Net:   ₹33,775');

  console.log('\n✅ ACTUAL:');
  console.log(`   Gross: ₹${(result.grossAmount / 100).toFixed(2)}`);
  console.log(`   Fees:  ₹${(result.fees.total / 100).toFixed(2)}`);
  console.log(`   Net:   ₹${(result.netAmount / 100).toFixed(2)}`);

  const passed = result.netAmount === 3377500; // ₹33,775
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Scenario 1`);

  return passed;
}

async function testScenario2_SameCycleRefund(merchantId, cycleDate) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 TEST SCENARIO 2: Same-Cycle Refund (Refund Before Settlement)');
  console.log('='.repeat(80));

  // Add refund to TEST_TXN_002 (₹5,000)
  await pool.query(`
    UPDATE sp_v2_transactions
    SET refund_amount_paise = 500000,
        refund_type = 'refund',
        refund_date = NOW(),
        is_refund_processed = FALSE
    WHERE transaction_id = 'TEST_TXN_002'
  `);

  console.log('🔄 Added refund: TEST_TXN_002 → ₹5,000');

  const result = await calculateMerchantSettlement(merchantId, cycleDate);

  console.log('\n📊 EXPECTED:');
  console.log('   Gross: ₹35,000');
  console.log('   Fees:  ₹1,225');
  console.log('   Refund: ₹5,000 (same cycle)');
  console.log('   Net:   ₹28,775');

  console.log('\n✅ ACTUAL:');
  console.log(`   Gross: ₹${(result.grossAmount / 100).toFixed(2)}`);
  console.log(`   Fees:  ₹${(result.fees.total / 100).toFixed(2)}`);
  console.log(`   Refund: ₹${(result.deductions.refunds.total / 100).toFixed(2)}`);
  console.log(`   Net:   ₹${(result.netAmount / 100).toFixed(2)}`);

  const passed = result.netAmount === 2877500 && result.deductions.refunds.currentCycle === 500000;
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Scenario 2`);

  // Clean up
  await pool.query(`
    UPDATE sp_v2_transactions
    SET refund_amount_paise = NULL,
        refund_type = NULL,
        refund_date = NULL,
        is_refund_processed = FALSE
    WHERE transaction_id = 'TEST_TXN_002'
  `);

  return passed;
}

async function testScenario3_CrossCycleRefund(merchantId, cycleDate) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 TEST SCENARIO 3: Cross-Cycle Refund (Refund After Settlement)');
  console.log('='.repeat(80));

  // Create a settlement record for previous cycle
  const prevSettlementId = 'TEST_BATCH_001';
  await pool.query(`
    INSERT INTO sp_v2_settlements (batch_id, merchant_id, settlement_date, net_amount_paise, status)
    VALUES ($1, $2, '2025-10-14', 1000000, 'COMPLETED')
    ON CONFLICT (batch_id) DO NOTHING
  `, [prevSettlementId, merchantId]);

  await pool.query(`
    INSERT INTO sp_v2_settlement_items (
      settlement_batch_id, transaction_id, amount_paise, status
    ) VALUES ($1, 'TEST_TXN_001', 1000000, 'CREDITED')
    ON CONFLICT DO NOTHING
  `, [prevSettlementId]);

  // Add refund to TEST_TXN_001 AFTER it was settled
  await pool.query(`
    UPDATE sp_v2_transactions
    SET refund_amount_paise = 1000000,
        refund_type = 'refund',
        refund_date = '2025-10-20',
        is_refund_processed = FALSE
    WHERE transaction_id = 'TEST_TXN_001'
  `);

  console.log('🔄 Added cross-cycle refund: TEST_TXN_001 → ₹10,000');
  console.log('   (Transaction was in previous cycle, refund is now)');

  const result = await calculateMerchantSettlement(merchantId, cycleDate);

  console.log('\n📊 EXPECTED:');
  console.log('   Gross: ₹35,000');
  console.log('   Fees:  ₹1,225');
  console.log('   Refund (outstanding): ₹10,000 (from previous cycle)');
  console.log('   Net:   ₹23,775');

  console.log('\n✅ ACTUAL:');
  console.log(`   Gross: ₹${(result.grossAmount / 100).toFixed(2)}`);
  console.log(`   Refund (current): ₹${(result.deductions.refunds.currentCycle / 100).toFixed(2)}`);
  console.log(`   Refund (outstanding): ₹${(result.deductions.refunds.outstanding / 100).toFixed(2)}`);
  console.log(`   Net:   ₹${(result.netAmount / 100).toFixed(2)}`);

  const passed = result.netAmount === 2377500 && result.deductions.refunds.outstanding === 1000000;
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Scenario 3`);

  // Clean up
  await pool.query(`UPDATE sp_v2_transactions SET refund_amount_paise = NULL WHERE transaction_id = 'TEST_TXN_001'`);

  return passed;
}

async function testScenario4_ChargebackDeduction(merchantId, cycleDate) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 TEST SCENARIO 4: Chargeback Deduction (LOST Chargeback)');
  console.log('='.repeat(80));

  // Add a LOST chargeback
  await pool.query(`
    INSERT INTO sp_v2_chargebacks (
      merchant_id, acquirer, network_case_id, txn_ref,
      original_gross_paise, chargeback_paise, currency,
      reason_code, stage, outcome, status,
      received_at, closed_at, is_settlement_processed
    ) VALUES (
      $1, 'VISA', 'CB_TEST_001', 'TEST_TXN_003',
      800000, 800000, 'INR',
      'FRAUD', 'CLOSED', 'LOST', 'WRITEOFF',
      NOW(), NOW(), FALSE
    )
  `, [merchantId]);

  console.log('⚠️  Added chargeback: TEST_TXN_003 → ₹8,000 (LOST)');

  const result = await calculateMerchantSettlement(merchantId, cycleDate);

  console.log('\n📊 EXPECTED:');
  console.log('   Gross: ₹35,000');
  console.log('   Fees:  ₹1,225');
  console.log('   Chargeback: ₹8,000');
  console.log('   Net:   ₹25,775');

  console.log('\n✅ ACTUAL:');
  console.log(`   Gross: ₹${(result.grossAmount / 100).toFixed(2)}`);
  console.log(`   Chargeback: ₹${(result.deductions.chargebacks.total / 100).toFixed(2)}`);
  console.log(`   Net:   ₹${(result.netAmount / 100).toFixed(2)}`);

  const passed = result.netAmount === 2577500 && result.deductions.chargebacks.total === 800000;
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Scenario 4`);

  // Clean up
  await pool.query(`DELETE FROM sp_v2_chargebacks WHERE network_case_id = 'CB_TEST_001'`);

  return passed;
}

async function testScenario5_NegativeSettlement(merchantId) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 TEST SCENARIO 5: Negative Settlement (Debt Tracking)');
  console.log('='.repeat(80));

  // Create a small transaction cycle
  const smallCycleDate = '2025-10-22';

  await pool.query(`
    INSERT INTO sp_v2_transactions (
      transaction_id, merchant_id, amount_paise, transaction_date,
      payment_method, status, source_type
    ) VALUES ('TEST_TXN_005', $1, 300000, $2, 'UPI', 'SUCCESS', 'MANUAL_UPLOAD')
  `, [merchantId, smallCycleDate]);

  await pool.query(`
    INSERT INTO sp_v2_recon_matches (job_id, pg_txn_id, bank_ref, status)
    VALUES ('TEST_JOB_002', 'TEST_TXN_005', 'TEST_TXN_005', 'MATCHED')
  `);

  // Add large refund that exceeds new sales
  await pool.query(`
    UPDATE sp_v2_transactions
    SET refund_amount_paise = 1000000, refund_type = 'refund', refund_date = NOW()
    WHERE transaction_id = 'TEST_TXN_001'
  `);

  console.log('📉 Small cycle with large refund:');
  console.log('   New sales: ₹3,000');
  console.log('   Old refund: ₹10,000');
  console.log('   Expected: Negative balance → Create debt');

  const result = await calculateMerchantSettlement(merchantId, smallCycleDate);

  console.log('\n✅ ACTUAL:');
  console.log(`   Gross: ₹${(result.grossAmount / 100).toFixed(2)}`);
  console.log(`   Refunds: ₹${(result.deductions.refunds.total / 100).toFixed(2)}`);
  console.log(`   Net (before protection): ₹${((result.grossAmount - result.fees.total - result.deductions.refunds.total) / 100).toFixed(2)}`);
  console.log(`   Payout: ₹${(result.netAmount / 100).toFixed(2)}`);

  if (result.outstandingDebt) {
    console.log(`   💳 Outstanding Debt Created: ₹${(result.outstandingDebt.amount / 100).toFixed(2)}`);
  }

  const passed = result.netAmount === 0 && result.outstandingDebt !== null;
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Scenario 5 - Negative balance protected`);

  // Clean up
  await pool.query(`DELETE FROM sp_v2_transactions WHERE transaction_id = 'TEST_TXN_005'`);
  await pool.query(`UPDATE sp_v2_transactions SET refund_amount_paise = NULL WHERE transaction_id = 'TEST_TXN_001'`);

  return passed;
}

async function runAllTests() {
  console.log('\n' + '█'.repeat(80));
  console.log('🧪 SETTLEMENT CALCULATOR TEST SUITE');
  console.log('█'.repeat(80));

  try {
    // Setup
    const testData = await setupTestData();

    // Run tests
    const results = [];
    results.push(await testScenario1_NoDeductions(testData.merchantId, testData.cycleDate));
    results.push(await testScenario2_SameCycleRefund(testData.merchantId, testData.cycleDate));
    results.push(await testScenario3_CrossCycleRefund(testData.merchantId, testData.cycleDate));
    results.push(await testScenario4_ChargebackDeduction(testData.merchantId, testData.cycleDate));
    results.push(await testScenario5_NegativeSettlement(testData.merchantId));

    // Summary
    const passedCount = results.filter(r => r).length;
    const totalCount = results.length;

    console.log('\n' + '█'.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('█'.repeat(80));
    console.log(`\n✅ Passed: ${passedCount}/${totalCount}`);
    console.log(`${passedCount === totalCount ? '🎉' : '⚠️'}  ${passedCount === totalCount ? 'All tests passed!' : 'Some tests failed'}\n`);

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
  } finally {
    await pool.end();
  }
}

runAllTests();
