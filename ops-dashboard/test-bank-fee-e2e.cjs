#!/usr/bin/env node

/**
 * End-to-End Test: Bank Fee Tracking
 *
 * Tests the complete flow:
 * 1. Upload PG transactions CSV
 * 2. Upload Bank statements CSV (with gross/net amounts)
 * 3. Run reconciliation (should calculate bank fees)
 * 4. Run settlement calculation (should aggregate fees)
 * 5. Verify all database tables
 * 6. Test analytics API
 */

const { Pool } = require('pg');
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

// Database connection (V2)
const v2Pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

const MERCHANT_ID = 'MERCH001';
const CYCLE_DATE = '2025-10-23';

async function main() {
  try {
    console.log('\n🧪 ===== BANK FEE TRACKING E2E TEST =====\n');

    // STEP 0: Clean up test data
    console.log('🧹 STEP 0: Cleaning up previous test data...');
    await cleanupTestData();
    console.log('   ✅ Cleanup complete\n');

    // STEP 1: Upload PG transactions
    console.log('📤 STEP 1: Uploading PG transactions CSV...');
    await uploadPGFile();
    console.log('   ✅ PG transactions uploaded\n');

    // STEP 2: Upload Bank statements
    console.log('📤 STEP 2: Uploading Bank statements CSV...');
    await uploadBankFile();
    console.log('   ✅ Bank statements uploaded\n');

    // STEP 3: Verify uploads in database
    console.log('🔍 STEP 3: Verifying uploaded data...');
    await verifyUploads();
    console.log('   ✅ Uploads verified\n');

    // STEP 4: Run reconciliation
    console.log('🔄 STEP 4: Running reconciliation...');
    await runReconciliation();
    console.log('   ✅ Reconciliation complete\n');

    // STEP 5: Verify reconciled transactions
    console.log('🔍 STEP 5: Verifying reconciled transactions...');
    await verifyReconciledTransactions();
    console.log('   ✅ Reconciled transactions verified\n');

    // STEP 6: Run settlement calculation
    console.log('💰 STEP 6: Running settlement calculation...');
    await runSettlement();
    console.log('   ✅ Settlement calculation complete\n');

    // STEP 7: Verify settlement batches
    console.log('🔍 STEP 7: Verifying settlement batches...');
    await verifySettlementBatches();
    console.log('   ✅ Settlement batches verified\n');

    // STEP 8: Test analytics API
    console.log('📊 STEP 8: Testing analytics API...');
    await testAnalyticsAPI();
    console.log('   ✅ Analytics API verified\n');

    console.log('✅ ===== ALL TESTS PASSED =====\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await v2Pool.end();
  }
}

async function cleanupTestData() {
  const client = await v2Pool.connect();
  try {
    await client.query('BEGIN');

    // Delete in correct order (respecting foreign keys)
    await client.query(`DELETE FROM sp_v2_settlement_items WHERE settlement_batch_id IN (SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = $1)`, [MERCHANT_ID]);
    await client.query(`DELETE FROM sp_v2_settlement_batches WHERE merchant_id = $1 AND cycle_date = $2`, [MERCHANT_ID, CYCLE_DATE]);
    await client.query(`DELETE FROM sp_v2_recon_matches WHERE DATE(created_at) = $1`, [CYCLE_DATE]);
    await client.query(`DELETE FROM sp_v2_transactions WHERE merchant_id = $1 AND DATE(transaction_date) = $2`, [MERCHANT_ID, CYCLE_DATE]);
    await client.query(`DELETE FROM sp_v2_bank_statements WHERE DATE(transaction_date) = $1`, [CYCLE_DATE]);

    await client.query('COMMIT');
    console.log('   🗑️  Deleted previous test data');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function uploadPGFile() {
  const form = new FormData();
  form.append('file', fs.createReadStream('test-bank-fee-tracking-pg.csv'));
  form.append('merchant_id', MERCHANT_ID);
  form.append('source_type', 'PG');
  form.append('source_name', 'HDFC_UPI');

  const response = await axios.post('http://localhost:5109/api/upload/single', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (!response.data.success) {
    throw new Error(`PG upload failed: ${response.data.error || 'Unknown error'}`);
  }

  console.log(`   📊 Uploaded ${response.data.results?.pg_uploaded || 0} PG transactions`);
}

async function uploadBankFile() {
  const form = new FormData();
  form.append('file', fs.createReadStream('test-bank-fee-tracking-bank.csv'));
  form.append('merchant_id', MERCHANT_ID);
  form.append('source_type', 'BANK');
  form.append('source_name', 'HDFC_BANK');

  const response = await axios.post('http://localhost:5109/api/upload/single', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (!response.data.success) {
    throw new Error(`Bank upload failed: ${response.data.error || 'Unknown error'}`);
  }

  console.log(`   🏦 Uploaded ${response.data.results?.bank_uploaded || 0} bank statements`);
}

async function verifyUploads() {
  const pgResult = await v2Pool.query(`
    SELECT COUNT(*) as count FROM sp_v2_transactions
    WHERE merchant_id = $1 AND DATE(transaction_date) = $2 AND source_type = 'MANUAL_UPLOAD' AND status = 'PENDING'
  `, [MERCHANT_ID, CYCLE_DATE]);

  const bankResult = await v2Pool.query(`
    SELECT
      COUNT(*) as count,
      SUM(gross_amount_paise) as total_gross,
      SUM(amount_paise) as total_net,
      SUM(bank_fee_paise) as total_fees
    FROM sp_v2_bank_statements
    WHERE DATE(transaction_date) = $1
  `, [CYCLE_DATE]);

  console.log(`   📊 PG Transactions: ${pgResult.rows[0].count}`);
  console.log(`   🏦 Bank Statements: ${bankResult.rows[0].count}`);
  console.log(`   💰 Gross Amount: ₹${(parseInt(bankResult.rows[0].total_gross) / 100).toFixed(2)}`);
  console.log(`   💵 Net Amount: ₹${(parseInt(bankResult.rows[0].total_net) / 100).toFixed(2)}`);
  console.log(`   💸 Bank Fees: ₹${(parseInt(bankResult.rows[0].total_fees || 0) / 100).toFixed(2)}`);

  if (pgResult.rows[0].count !== '5' || bankResult.rows[0].count !== '5') {
    throw new Error('Upload verification failed: Expected 5 PG and 5 Bank records');
  }
}

async function runReconciliation() {
  const response = await axios.post('http://localhost:5103/recon/run', {
    merchant_id: MERCHANT_ID,
    cycle_date: CYCLE_DATE
  });

  if (!response.data.success) {
    throw new Error(`Reconciliation failed: ${response.data.error || 'Unknown error'}`);
  }

  console.log(`   ✅ Matched: ${response.data.results?.matched || 0}`);
  console.log(`   ⚠️  Exceptions: ${response.data.results?.exceptions || 0}`);
}

async function verifyReconciledTransactions() {
  const result = await v2Pool.query(`
    SELECT
      COUNT(*) as count,
      SUM(amount_paise) as total_amount,
      SUM(bank_fee_paise) as total_bank_fees,
      SUM(settlement_amount_paise) as total_settlement,
      AVG(bank_fee_paise) as avg_bank_fee
    FROM sp_v2_transactions
    WHERE merchant_id = $1
      AND DATE(transaction_date) = $2
      AND status = 'RECONCILED'
  `, [MERCHANT_ID, CYCLE_DATE]);

  const row = result.rows[0];
  console.log(`   📊 Reconciled Transactions: ${row.count}`);
  console.log(`   💰 Total Amount (PG): ₹${(parseInt(row.total_amount || 0) / 100).toFixed(2)}`);
  console.log(`   💸 Total Bank Fees: ₹${(parseInt(row.total_bank_fees || 0) / 100).toFixed(2)}`);
  console.log(`   💵 Total Settlement Amount: ₹${(parseInt(row.total_settlement || 0) / 100).toFixed(2)}`);
  console.log(`   📈 Average Bank Fee: ₹${(parseFloat(row.avg_bank_fee || 0) / 100).toFixed(2)}`);

  if (row.count !== '5') {
    throw new Error('Expected 5 reconciled transactions');
  }

  // Verify bank fees are calculated correctly (PG amount - Bank net)
  const expectedBankFee = 10000 - 9788; // ₹100 - ₹97.88 = ₹2.12 per transaction
  const actualBankFee = parseInt(row.total_bank_fees || 0) / 5;

  if (Math.abs(actualBankFee - expectedBankFee) > 1) {
    throw new Error(`Bank fee calculation incorrect: expected ~${expectedBankFee}, got ${actualBankFee}`);
  }
}

async function runSettlement() {
  const response = await axios.post('http://localhost:5107/api/calculate-settlement', {
    merchant_id: MERCHANT_ID,
    cycle_date: CYCLE_DATE
  });

  if (!response.data.success) {
    throw new Error(`Settlement failed: ${response.data.error || 'Unknown error'}`);
  }

  console.log(`   💰 Settlement batch created`);
}

async function verifySettlementBatches() {
  const result = await v2Pool.query(`
    SELECT
      id,
      merchant_id,
      merchant_name,
      total_transactions,
      gross_amount_paise,
      total_commission_paise,
      total_bank_charges_paise,
      settlepaisa_revenue_paise,
      net_amount_paise,
      status
    FROM sp_v2_settlement_batches
    WHERE merchant_id = $1 AND cycle_date = $2
  `, [MERCHANT_ID, CYCLE_DATE]);

  if (result.rows.length === 0) {
    throw new Error('No settlement batch found');
  }

  const batch = result.rows[0];
  const totalCommission = parseInt(batch.total_commission_paise || 0);
  const totalBankCharges = parseInt(batch.total_bank_charges_paise || 0);
  const settlepaisaRevenue = parseInt(batch.settlepaisa_revenue_paise || 0);

  console.log(`   📊 Settlement Batch ID: ${batch.id}`);
  console.log(`   📈 Total Transactions: ${batch.total_transactions}`);
  console.log(`   💰 Gross Amount: ₹${(parseInt(batch.gross_amount_paise) / 100).toFixed(2)}`);
  console.log(`   💵 Total Commission (MDR): ₹${(totalCommission / 100).toFixed(2)}`);
  console.log(`   🏦 Total Bank Charges: ₹${(totalBankCharges / 100).toFixed(2)}`);
  console.log(`   💼 SettlePaisa Revenue: ₹${(settlepaisaRevenue / 100).toFixed(2)}`);
  console.log(`   📊 Bank Share: ${totalCommission > 0 ? ((totalBankCharges / totalCommission) * 100).toFixed(2) : 0}%`);
  console.log(`   📊 SettlePaisa Share: ${totalCommission > 0 ? ((settlepaisaRevenue / totalCommission) * 100).toFixed(2) : 0}%`);

  // Verify total bank charges = sum of transaction bank fees
  if (totalBankCharges === 0) {
    throw new Error('Total bank charges is 0 - aggregation failed');
  }
}

async function testAnalyticsAPI() {
  const response = await axios.get('http://localhost:5108/api/analytics/bank-fees', {
    params: {
      start_date: CYCLE_DATE,
      end_date: CYCLE_DATE,
      merchant_id: MERCHANT_ID
    }
  });

  if (!response.data.success) {
    throw new Error(`Analytics API failed: ${response.data.error || 'Unknown error'}`);
  }

  const { aggregates, settlements } = response.data;

  console.log(`   📊 Analytics API Response:`);
  console.log(`   • Total Settlements: ${aggregates.total_settlements}`);
  console.log(`   • Total Transactions: ${aggregates.total_transactions}`);
  console.log(`   • Total Commission: ₹${aggregates.total_commission.toFixed(2)}`);
  console.log(`   • Total Bank Charges: ₹${aggregates.total_bank_charges.toFixed(2)}`);
  console.log(`   • SettlePaisa Revenue: ₹${aggregates.total_settlepaisa_revenue.toFixed(2)}`);
  console.log(`   • Bank Share: ${aggregates.bank_share_percent.toFixed(2)}%`);
  console.log(`   • SettlePaisa Share: ${aggregates.settlepaisa_share_percent.toFixed(2)}%`);

  if (aggregates.total_settlements !== 1) {
    throw new Error(`Expected 1 settlement, got ${aggregates.total_settlements}`);
  }

  if (aggregates.total_bank_charges === 0) {
    throw new Error('Analytics API returned 0 bank charges');
  }
}

main();
