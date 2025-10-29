#!/usr/bin/env node

const { Pool } = require('pg');
const { SettlementCalculatorV1Logic } = require('./services/settlement-engine/settlement-calculator-v1-logic.cjs');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function testSettlementTrigger() {
  const client = await pool.connect();

  try {
    console.log('🔍 Step 1: Fetching matched transactions from database...\n');

    // Fetch matched transactions
    const matchedResult = await client.query(`
      SELECT
        t.transaction_id,
        t.merchant_id,
        t.amount_paise,
        t.payment_method,
        t.utr,
        t.status
      FROM sp_v2_transactions t
      JOIN sp_v2_reconciliation_results r ON t.transaction_id = r.pg_transaction_id
      WHERE t.transaction_id LIKE 'TXN_UP_%'
        AND r.match_status = 'MATCHED'
      ORDER BY t.transaction_id
    `);

    console.log(`✓ Found ${matchedResult.rows.length} matched transactions\n`);

    if (matchedResult.rows.length === 0) {
      console.log('❌ No matched transactions found. Cannot proceed.');
      return;
    }

    // Show sample
    console.log('📊 Sample transactions:');
    matchedResult.rows.slice(0, 3).forEach(t => {
      console.log(`  ${t.transaction_id}: ₹${(t.amount_paise/100).toFixed(2)}, ${t.payment_method}, ${t.status}`);
    });

    console.log('\n🔄 Step 2: Transforming to settlement calculator format...\n');

    // Transform to settlement calculator format (amounts in rupees!)
    const transactions = matchedResult.rows.map(t => ({
      transaction_id: t.transaction_id,
      paid_amount: t.amount_paise / 100,  // Convert paise to rupees
      payee_amount: t.amount_paise / 100,
      payment_mode: t.payment_method || 'UPI',
      paymode_id: null  // Will be derived from payment_mode
    }));

    console.log('✓ Transformed transactions:');
    transactions.slice(0, 2).forEach(t => {
      console.log(`  ${t.transaction_id}: paid_amount=₹${t.paid_amount}, payment_mode=${t.payment_mode}`);
    });

    console.log('\n🧮 Step 3: Calling settlement calculator...\n');

    const calculator = new SettlementCalculatorV1Logic();
    const merchantId = matchedResult.rows[0].merchant_id;
    const cycleDate = '2025-10-10';

    console.log(`  Merchant: ${merchantId}`);
    console.log(`  Cycle Date: ${cycleDate}`);
    console.log(`  Transactions: ${transactions.length}\n`);

    try {
      const settlementBatch = await calculator.calculateSettlement(
        merchantId,
        transactions,
        cycleDate
      );

      console.log('✅ Settlement calculation SUCCESS!\n');
      console.log('📊 Settlement Batch Summary:');
      console.log(`  Merchant: ${settlementBatch.merchant_id}`);
      console.log(`  Total Transactions: ${settlementBatch.total_transactions}`);
      console.log(`  Gross Amount: ₹${(settlementBatch.gross_amount / 100).toFixed(2)}`);
      console.log(`  Total Conv Charges: ₹${(settlementBatch.total_convcharges / 100).toFixed(2)}`);
      console.log(`  Total EP Charges: ₹${(settlementBatch.total_ep_charges / 100).toFixed(2)}`);
      console.log(`  Total GST: ₹${(settlementBatch.total_gst / 100).toFixed(2)}`);
      console.log(`  Total PG Charge: ₹${(settlementBatch.total_pg_charge / 100).toFixed(2)}`);
      console.log(`  Net Settlement: ₹${(settlementBatch.net_settlement_amount / 100).toFixed(2)}`);
      console.log(`  Status: ${settlementBatch.status}\n`);

      console.log('💾 Step 4: Persisting settlement batch...\n');

      const batchId = await calculator.persistSettlement(settlementBatch);

      console.log(`✅ Settlement batch persisted successfully!`);
      console.log(`  Batch ID: ${batchId}\n`);

      // Verify
      console.log('🔍 Step 5: Verifying database...\n');

      const batchCheck = await client.query(
        'SELECT id, merchant_id, status, total_transactions, gross_amount_paise, net_amount_paise FROM sp_v2_settlement_batches WHERE id = $1',
        [batchId]
      );

      if (batchCheck.rows.length > 0) {
        const batch = batchCheck.rows[0];
        console.log('✓ Settlement Batch in database:');
        console.log(`  ID: ${batch.id}`);
        console.log(`  Merchant: ${batch.merchant_id}`);
        console.log(`  Status: ${batch.status}`);
        console.log(`  Transactions: ${batch.total_transactions}`);
        console.log(`  Gross: ₹${(batch.gross_amount_paise/100).toFixed(2)}`);
        console.log(`  Net: ₹${(batch.net_amount_paise/100).toFixed(2)}\n`);
      }

      const itemsCheck = await client.query(
        'SELECT COUNT(*) as count FROM sp_v2_settlement_items WHERE settlement_batch_id = $1',
        [batchId]
      );

      console.log(`✓ Settlement Items: ${itemsCheck.rows[0].count} items created\n`);

      const txnCheck = await client.query(
        'SELECT COUNT(*) as count FROM sp_v2_transactions WHERE transaction_id LIKE $1 AND settlement_batch_id = $2',
        ['TXN_UP_%', batchId]
      );

      console.log(`✓ Transactions linked: ${txnCheck.rows[0].count} transactions have settlement_batch_id\n`);

      console.log('🎉 SUCCESS! All 8 steps of E2E test completed!\n');

      await calculator.close();

    } catch (calcError) {
      console.error('❌ Settlement calculation FAILED:\n');
      console.error(`  Error: ${calcError.message}`);
      console.error(`\n  Stack trace:`);
      console.error(calcError.stack);

      await calculator.close();
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

console.log('========================================');
console.log('Settlement Trigger Test Script');
console.log('========================================\n');

testSettlementTrigger();
