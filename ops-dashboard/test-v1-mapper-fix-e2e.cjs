#!/usr/bin/env node

/**
 * E2E Test: V1-to-V2 Mapper Ambiguity Fix Verification
 *
 * Tests complete data flow:
 * 1. Upload PG CSV with V1 format (paid_amount, payee_amount)
 * 2. Upload Bank CSV with V1 format (paid_amount, payee_amount, bank_fee, bank_gst)
 * 3. Verify database has correct gross/net/fee separation
 * 4. Run reconciliation
 * 5. Verify reconciliation uses gross amounts for matching
 * 6. Verify bank fees calculated correctly
 */

const { Pool } = require('pg');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123'
});

const TEST_DATE = '2025-10-23';
const TEST_UTR_PREFIX = 'UTR20251023V1';

async function clearTestData() {
  console.log('\n🧹 Clearing previous test data...');

  await pool.query(`
    DELETE FROM sp_v2_transactions
    WHERE transaction_id LIKE 'TXN20251023V1%'
  `);

  await pool.query(`
    DELETE FROM sp_v2_bank_statements
    WHERE utr LIKE '${TEST_UTR_PREFIX}%'
  `);

  console.log('✅ Test data cleared');
}

async function uploadPGFile() {
  console.log('\n📤 STEP 1: Upload PG CSV (V1 format)...');

  const formData = new FormData();
  formData.append('file', fs.createReadStream('./test-v1-mapper-fix-pg.csv'));
  formData.append('type', 'pg_transactions');
  formData.append('merchantId', 'MERCH001');

  try {
    const response = await axios.post('http://localhost:5109/api/upload/single', formData, {
      headers: formData.getHeaders()
    });

    console.log(`✅ PG upload successful: ${response.data.recordsInserted} records`);
    return response.data;
  } catch (error) {
    console.error('❌ PG upload failed:', error.response?.data || error.message);
    throw error;
  }
}

async function uploadBankFile() {
  console.log('\n📤 STEP 2: Upload Bank CSV (V1 format)...');

  const formData = new FormData();
  formData.append('file', fs.createReadStream('./test-v1-mapper-fix-bank.csv'));
  formData.append('type', 'bank_statements');
  formData.append('merchantId', 'MERCH001');

  try {
    const response = await axios.post('http://localhost:5109/api/upload/single', formData, {
      headers: formData.getHeaders()
    });

    console.log(`✅ Bank upload successful: ${response.data.recordsInserted} records`);
    return response.data;
  } catch (error) {
    console.error('❌ Bank upload failed:', error.response?.data || error.message);
    throw error;
  }
}

async function verifyPGData() {
  console.log('\n🔍 STEP 3: Verify PG Transactions in Database...');

  const result = await pool.query(`
    SELECT
      transaction_id,
      amount_paise,
      gross_amount_paise,
      bank_fee_paise,
      utr
    FROM sp_v2_transactions
    WHERE transaction_id LIKE 'TXN20251023V1%'
    ORDER BY transaction_id
    LIMIT 3
  `);

  console.log(`\n📊 Found ${result.rows.length} PG transactions:`);

  let allCorrect = true;
  result.rows.forEach((row, idx) => {
    const netExpected = 9788;  // 97.88 * 100
    const grossExpected = 10000;  // 100.00 * 100
    const feeExpected = 212;  // 2.12 * 100

    const netCorrect = row.amount_paise === netExpected;
    const grossCorrect = row.gross_amount_paise === grossExpected;
    const feeCorrect = row.bank_fee_paise === feeExpected;

    console.log(`\n  ${idx + 1}. ${row.transaction_id}`);
    console.log(`     Net Amount (payee_amount):  ${row.amount_paise} paise ${netCorrect ? '✅' : '❌ Expected: ' + netExpected}`);
    console.log(`     Gross Amount (paid_amount): ${row.gross_amount_paise} paise ${grossCorrect ? '✅' : '❌ Expected: ' + grossExpected}`);
    console.log(`     Bank Fee:                   ${row.bank_fee_paise} paise ${feeCorrect ? '✅' : '❌ Expected: ' + feeExpected}`);
    console.log(`     UTR:                        ${row.utr}`);

    if (!netCorrect || !grossCorrect || !feeCorrect) {
      allCorrect = false;
    }
  });

  if (allCorrect) {
    console.log('\n✅ PG data verification PASSED - All amounts correct!');
  } else {
    console.log('\n❌ PG data verification FAILED - Some amounts incorrect!');
    throw new Error('PG data verification failed');
  }

  return allCorrect;
}

async function verifyBankData() {
  console.log('\n🔍 STEP 4: Verify Bank Statements in Database...');

  const result = await pool.query(`
    SELECT
      utr,
      amount_paise,
      gross_amount_paise,
      bank_fee_paise,
      bank_gst_paise,
      bank_ref
    FROM sp_v2_bank_statements
    WHERE utr LIKE '${TEST_UTR_PREFIX}%'
    ORDER BY utr
    LIMIT 3
  `);

  console.log(`\n📊 Found ${result.rows.length} Bank statements:`);

  let allCorrect = true;
  result.rows.forEach((row, idx) => {
    const netExpected = 9788;  // 97.88 * 100 (payee_amount)
    const grossExpected = 10000;  // 100.00 * 100 (paid_amount)
    const feeExpected = 200;  // 2.00 * 100
    const gstExpected = 12;  // 0.12 * 100

    const netCorrect = row.amount_paise === netExpected;
    const grossCorrect = row.gross_amount_paise === grossExpected;
    const feeCorrect = row.bank_fee_paise === feeExpected;
    const gstCorrect = row.bank_gst_paise === gstExpected;

    console.log(`\n  ${idx + 1}. ${row.utr}`);
    console.log(`     Net Amount (payee_amount):  ${row.amount_paise} paise ${netCorrect ? '✅' : '❌ Expected: ' + netExpected}`);
    console.log(`     Gross Amount (paid_amount): ${row.gross_amount_paise} paise ${grossCorrect ? '✅' : '❌ Expected: ' + grossExpected}`);
    console.log(`     Bank Fee:                   ${row.bank_fee_paise} paise ${feeCorrect ? '✅' : '❌ Expected: ' + feeExpected}`);
    console.log(`     Bank GST:                   ${row.bank_gst_paise} paise ${gstCorrect ? '✅' : '❌ Expected: ' + gstExpected}`);
    console.log(`     Bank Ref:                   ${row.bank_ref}`);

    if (!netCorrect || !grossCorrect || !feeCorrect || !gstCorrect) {
      allCorrect = false;
    }
  });

  if (allCorrect) {
    console.log('\n✅ Bank data verification PASSED - All amounts correct!');
  } else {
    console.log('\n❌ Bank data verification FAILED - Some amounts incorrect!');
    throw new Error('Bank data verification failed');
  }

  return allCorrect;
}

async function runReconciliation() {
  console.log('\n🔄 STEP 5: Run Reconciliation...');

  try {
    const response = await axios.post('http://localhost:5103/recon/run', {
      date: TEST_DATE,
      merchantId: 'MERCH001',
      test: false
    });

    const jobId = response.data.jobId;
    console.log(`✅ Reconciliation started: Job ${jobId}`);

    // Wait for completion
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await axios.get(`http://localhost:5103/recon/jobs/${jobId}`);
      const job = statusResponse.data;

      if (job.status === 'COMPLETED') {
        console.log(`\n✅ Reconciliation completed:`);
        console.log(`   Matched: ${job.counters.matched}`);
        console.log(`   Unmatched PG: ${job.counters.unmatchedPg}`);
        console.log(`   Unmatched Bank: ${job.counters.unmatchedBank}`);
        console.log(`   Exceptions: ${job.counters.exceptions}`);

        return job;
      } else if (job.status === 'FAILED') {
        console.error(`❌ Reconciliation failed: ${job.error}`);
        throw new Error(`Reconciliation failed: ${job.error}`);
      }

      attempts++;
    }

    throw new Error('Reconciliation timeout');
  } catch (error) {
    console.error('❌ Reconciliation error:', error.response?.data || error.message);
    throw error;
  }
}

async function verifyReconciliation() {
  console.log('\n🔍 STEP 6: Verify Reconciliation Results...');

  const result = await pool.query(`
    SELECT
      transaction_id,
      status,
      amount_paise,
      gross_amount_paise,
      bank_fee_paise,
      settlement_amount_paise,
      fee_variance_paise
    FROM sp_v2_transactions
    WHERE transaction_id LIKE 'TXN20251023V1%'
    ORDER BY transaction_id
  `);

  console.log(`\n📊 Reconciliation Results:`);

  let reconciledCount = 0;
  let correctFeeCount = 0;

  result.rows.forEach((row, idx) => {
    const isReconciled = row.status === 'RECONCILED';
    const bankFeeCalculated = row.gross_amount_paise - row.settlement_amount_paise;
    const feeCorrect = bankFeeCalculated === 212;  // 100.00 - 97.88 = 2.12

    if (isReconciled) reconciledCount++;
    if (feeCorrect) correctFeeCount++;

    console.log(`\n  ${idx + 1}. ${row.transaction_id}`);
    console.log(`     Status: ${row.status} ${isReconciled ? '✅' : '❌'}`);
    console.log(`     Gross: ${row.gross_amount_paise} paise (₹${(row.gross_amount_paise / 100).toFixed(2)})`);
    console.log(`     Settlement: ${row.settlement_amount_paise} paise (₹${(row.settlement_amount_paise / 100).toFixed(2)})`);
    console.log(`     Bank Fee Calculated: ${bankFeeCalculated} paise ${feeCorrect ? '✅' : '❌ Expected: 212'}`);
  });

  console.log(`\n📈 Summary:`);
  console.log(`   Total Transactions: ${result.rows.length}`);
  console.log(`   Reconciled: ${reconciledCount} ${reconciledCount === result.rows.length ? '✅' : '❌'}`);
  console.log(`   Correct Fees: ${correctFeeCount} ${correctFeeCount === result.rows.length ? '✅' : '❌'}`);

  const totalBankFees = result.rows.reduce((sum, row) => {
    const fee = row.gross_amount_paise - row.settlement_amount_paise;
    return sum + fee;
  }, 0);

  console.log(`   Total Bank Fees: ₹${(totalBankFees / 100).toFixed(2)} (${totalBankFees} paise)`);

  if (reconciledCount === result.rows.length && correctFeeCount === result.rows.length) {
    console.log('\n✅ Reconciliation verification PASSED!');
    return true;
  } else {
    console.log('\n❌ Reconciliation verification FAILED!');
    throw new Error('Reconciliation verification failed');
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  V1-to-V2 Mapper Ambiguity Fix - E2E Test');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    // Setup
    await clearTestData();

    // Upload files
    await uploadPGFile();
    await uploadBankFile();

    // Verify uploads preserved gross/net/fee correctly
    await verifyPGData();
    await verifyBankData();

    // Run reconciliation
    await runReconciliation();

    // Verify reconciliation used gross amounts correctly
    await verifyReconciliation();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ ALL TESTS PASSED!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n🎉 V1-to-V2 mapper ambiguity is FULLY RESOLVED!');
    console.log('   - PG: paid_amount → gross_amount_paise ✅');
    console.log('   - PG: payee_amount → amount_paise ✅');
    console.log('   - Bank: paid_amount → gross_amount_paise ✅');
    console.log('   - Bank: payee_amount → amount_paise ✅');
    console.log('   - Bank: bank_fee → bank_fee_paise ✅');
    console.log('   - Bank: bank_gst → bank_gst_paise ✅');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('\n═══════════════════════════════════════════════════════════');
    console.error('  ❌ TEST FAILED');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('\nError:', error.message);
    console.error('\n');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
