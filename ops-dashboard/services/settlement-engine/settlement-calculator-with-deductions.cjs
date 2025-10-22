/**
 * Settlement Calculator with Refund & Chargeback Deductions
 *
 * Handles:
 * - Same-cycle refunds (refund before settlement)
 * - Cross-cycle refunds (refund after merchant was paid)
 * - Chargeback deductions (LOST chargebacks only)
 * - Negative balance protection with debt tracking
 * - Outstanding debt recovery from future settlements
 *
 * @module settlement-calculator-with-deductions
 */

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: parseInt(process.env.DB_PORT || '5433'),
});

// Fee configuration (can be moved to database/config)
const PLATFORM_FEE_PERCENT = 0.02; // 2%
const GATEWAY_FEE_PERCENT = 0.015; // 1.5%

/**
 * Main settlement calculation function
 * @param {string} merchantId - Merchant ID
 * @param {string} cycleDate - Settlement cycle date (YYYY-MM-DD)
 * @returns {Promise<Object>} Complete settlement breakdown
 */
async function calculateMerchantSettlement(merchantId, cycleDate) {
  console.log(`\n🧮 [Settlement Calculator] Processing: ${merchantId} for ${cycleDate}`);

  try {
    // Step 1: Get all matched/reconciled transactions for this cycle
    const transactions = await getReconciledTransactions(merchantId, cycleDate);
    console.log(`   📊 Found ${transactions.length} reconciled transactions`);

    if (transactions.length === 0) {
      return {
        merchantId,
        cycleDate,
        grossAmount: 0,
        netAmount: 0,
        status: 'NO_TRANSACTIONS',
        message: 'No reconciled transactions for this cycle'
      };
    }

    // Step 2: Calculate gross amount
    const grossAmount = transactions.reduce((sum, txn) => sum + parseInt(txn.amount_paise), 0);
    console.log(`   💰 Gross Amount: ₹${(grossAmount / 100).toFixed(2)}`);

    // Step 3: Calculate fees
    const platformFee = Math.round(grossAmount * PLATFORM_FEE_PERCENT);
    const gatewayFee = Math.round(grossAmount * GATEWAY_FEE_PERCENT);
    const totalFees = platformFee + gatewayFee;
    console.log(`   💳 Platform Fee: ₹${(platformFee / 100).toFixed(2)}`);
    console.log(`   💳 Gateway Fee: ₹${(gatewayFee / 100).toFixed(2)}`);

    // Step 4: Calculate refund deductions
    const refundDeductions = await calculateRefundDeductions(merchantId, cycleDate, transactions);
    console.log(`   🔄 Refund Deductions: ₹${(refundDeductions.total / 100).toFixed(2)}`);
    console.log(`      • Current Cycle: ₹${(refundDeductions.currentCycle / 100).toFixed(2)}`);
    console.log(`      • Outstanding: ₹${(refundDeductions.outstanding / 100).toFixed(2)}`);

    // Step 5: Calculate chargeback deductions
    const chargebackDeductions = await calculateChargebackDeductions(merchantId);
    console.log(`   ⚠️  Chargeback Deductions: ₹${(chargebackDeductions.total / 100).toFixed(2)}`);

    // Step 6: Recover outstanding debts from previous cycles
    const debtRecovery = await calculateOutstandingDebtRecovery(merchantId);
    console.log(`   📥 Outstanding Debt to Recover: ₹${(debtRecovery.total / 100).toFixed(2)}`);

    // Step 7: Calculate net settlement
    let netAmount = grossAmount - totalFees - refundDeductions.total - chargebackDeductions.total - debtRecovery.total;
    console.log(`   🎯 Net Amount (before negative check): ₹${(netAmount / 100).toFixed(2)}`);

    // Step 8: Handle negative settlement
    let outstandingDebt = null;
    if (netAmount < 0) {
      console.log(`   ⚠️  Negative settlement detected! Creating debt record...`);
      outstandingDebt = await createOutstandingDebt(merchantId, Math.abs(netAmount), cycleDate, {
        grossAmount,
        fees: totalFees,
        refunds: refundDeductions.total,
        chargebacks: chargebackDeductions.total,
        debtRecovery: debtRecovery.total
      });
      netAmount = 0; // Don't pay negative amount
    }

    // Step 9: Build comprehensive result
    const result = {
      merchantId,
      cycleDate,
      status: netAmount > 0 ? 'READY_FOR_PAYOUT' : (outstandingDebt ? 'NEGATIVE_BALANCE' : 'ZERO_PAYOUT'),

      // Gross calculations
      grossAmount,
      transactionCount: transactions.length,

      // Fees
      fees: {
        platformFee,
        gatewayFee,
        total: totalFees
      },

      // Deductions
      deductions: {
        refunds: {
          currentCycle: refundDeductions.currentCycle,
          outstanding: refundDeductions.outstanding,
          total: refundDeductions.total,
          count: refundDeductions.count,
          details: refundDeductions.details
        },
        chargebacks: {
          total: chargebackDeductions.total,
          count: chargebackDeductions.count,
          details: chargebackDeductions.details
        },
        outstandingDebt: {
          total: debtRecovery.total,
          count: debtRecovery.count,
          details: debtRecovery.details
        }
      },

      // Final amount
      netAmount,
      payoutAmount: netAmount,

      // Negative balance info
      outstandingDebt: outstandingDebt,

      // Breakdown for display
      breakdown: {
        grossAmount,
        platformFee,
        gatewayFee,
        refundDeductions: refundDeductions.total,
        chargebackDeductions: chargebackDeductions.total,
        outstandingDebtRecovered: debtRecovery.total,
        netAmount
      },

      calculatedAt: new Date()
    };

    console.log(`   ✅ Settlement calculation complete: ₹${(netAmount / 100).toFixed(2)}\n`);

    return result;

  } catch (error) {
    console.error(`   ❌ Settlement calculation failed:`, error);
    throw error;
  }
}

/**
 * Get reconciled transactions for a merchant and cycle
 */
async function getReconciledTransactions(merchantId, cycleDate) {
  const query = `
    SELECT
      t.transaction_id,
      t.merchant_id,
      t.amount_paise,
      t.transaction_date,
      t.payment_method,
      t.status
    FROM sp_v2_transactions t
    WHERE t.merchant_id = $1
      AND DATE(t.transaction_date) = $2
      AND t.status = 'RECONCILED'
    ORDER BY t.transaction_date
  `;

  const result = await pool.query(query, [merchantId, cycleDate]);
  return result.rows;
}

/**
 * Calculate refund deductions
 * Handles both same-cycle and cross-cycle refunds
 */
async function calculateRefundDeductions(merchantId, cycleDate, transactions) {
  // Get transaction IDs for this cycle
  const txnIds = transactions.map(t => t.transaction_id);

  if (txnIds.length === 0) {
    return { currentCycle: 0, outstanding: 0, total: 0, count: 0, details: [] };
  }

  // Case 1: Refunds for transactions IN this cycle (same-cycle)
  const currentCycleQuery = `
    SELECT
      transaction_id,
      refund_amount_paise,
      refund_type,
      refund_date,
      refund_reason
    FROM sp_v2_transactions
    WHERE merchant_id = $1
      AND transaction_id = ANY($2)
      AND refund_amount_paise IS NOT NULL
      AND is_refund_processed = FALSE
  `;

  const currentCycleResult = await pool.query(currentCycleQuery, [merchantId, txnIds]);
  const currentCycleRefunds = currentCycleResult.rows;

  // Case 2: Outstanding refunds from PREVIOUS cycles (already settled)
  const outstandingQuery = `
    SELECT
      t.transaction_id,
      t.refund_amount_paise,
      t.refund_type,
      t.refund_date,
      t.refund_reason,
      t.transaction_date,
      sb.id AS original_batch_id,
      sb.created_at AS original_settlement_date
    FROM sp_v2_transactions t
    LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
    LEFT JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
    WHERE t.merchant_id = $1
      AND t.refund_amount_paise IS NOT NULL
      AND t.is_refund_processed = FALSE
      AND t.refund_date > COALESCE(sb.created_at, '1970-01-01')
      AND DATE(t.transaction_date) < $2  -- Transaction was in a previous cycle
  `;

  const outstandingResult = await pool.query(outstandingQuery, [merchantId, cycleDate]);
  const outstandingRefunds = outstandingResult.rows;

  // Calculate totals
  const currentCycleTotal = currentCycleRefunds.reduce(
    (sum, r) => sum + parseInt(r.refund_amount_paise), 0
  );

  const outstandingTotal = outstandingRefunds.reduce(
    (sum, r) => sum + parseInt(r.refund_amount_paise), 0
  );

  return {
    currentCycle: currentCycleTotal,
    outstanding: outstandingTotal,
    total: currentCycleTotal + outstandingTotal,
    count: currentCycleRefunds.length + outstandingRefunds.length,
    details: {
      currentCycleRefunds: currentCycleRefunds.map(r => ({
        transactionId: r.transaction_id,
        amount: parseInt(r.refund_amount_paise),
        type: r.refund_type,
        date: r.refund_date,
        reason: r.refund_reason
      })),
      outstandingRefunds: outstandingRefunds.map(r => ({
        transactionId: r.transaction_id,
        amount: parseInt(r.refund_amount_paise),
        type: r.refund_type,
        date: r.refund_date,
        originalBatchId: r.original_batch_id,
        originalSettlementDate: r.original_settlement_date
      }))
    }
  };
}

/**
 * Calculate chargeback deductions
 * Only LOST chargebacks are deducted
 */
async function calculateChargebackDeductions(merchantId) {
  const query = `
    SELECT
      txn_ref,
      chargeback_paise,
      reason_code,
      received_at,
      status,
      outcome
    FROM sp_v2_chargebacks
    WHERE merchant_id = $1
      AND outcome = 'LOST'
      AND status = 'WRITEOFF'
      AND is_settlement_processed = FALSE
    ORDER BY received_at
  `;

  const result = await pool.query(query, [merchantId]);
  const chargebacks = result.rows;

  const total = chargebacks.reduce(
    (sum, cb) => sum + parseInt(cb.chargeback_paise), 0
  );

  return {
    total,
    count: chargebacks.length,
    details: chargebacks.map(cb => ({
      transactionId: cb.txn_ref,
      amount: parseInt(cb.chargeback_paise),
      reason: cb.reason_code,
      receivedAt: cb.received_at,
      status: cb.status,
      outcome: cb.outcome
    }))
  };
}

/**
 * Calculate outstanding debt recovery from previous cycles
 */
async function calculateOutstandingDebtRecovery(merchantId) {
  const query = `
    SELECT
      id,
      debt_amount_paise,
      original_batch_id,
      original_settlement_date,
      reason,
      created_at
    FROM sp_v2_merchant_outstanding_debts
    WHERE merchant_id = $1
      AND status = 'OUTSTANDING'
    ORDER BY created_at
  `;

  const result = await pool.query(query, [merchantId]);
  const debts = result.rows;

  const total = debts.reduce(
    (sum, debt) => sum + parseInt(debt.debt_amount_paise), 0
  );

  return {
    total,
    count: debts.length,
    details: debts.map(debt => ({
      id: debt.id,
      amount: parseInt(debt.debt_amount_paise),
      originalBatchId: debt.original_batch_id,
      originalSettlementDate: debt.original_settlement_date,
      reason: debt.reason,
      createdAt: debt.created_at
    }))
  };
}

/**
 * Create outstanding debt record for negative settlements
 */
async function createOutstandingDebt(merchantId, debtAmount, cycleDate, breakdown) {
  const query = `
    INSERT INTO sp_v2_merchant_outstanding_debts (
      merchant_id,
      debt_amount_paise,
      original_settlement_date,
      reason,
      details,
      status
    ) VALUES ($1, $2, $3, $4, $5, 'OUTSTANDING')
    RETURNING id, debt_amount_paise, created_at
  `;

  const reason = `Negative settlement for cycle ${cycleDate}. Refunds and chargebacks exceeded new sales.`;

  const details = JSON.stringify({
    cycleDate,
    breakdown,
    netBalance: -debtAmount,
    timestamp: new Date()
  });

  const result = await pool.query(query, [
    merchantId,
    debtAmount,
    cycleDate,
    reason,
    details
  ]);

  return {
    id: result.rows[0].id,
    amount: parseInt(result.rows[0].debt_amount_paise),
    createdAt: result.rows[0].created_at,
    reason
  };
}

/**
 * Mark refunds as processed after settlement
 */
async function markRefundsAsProcessed(transactionIds, settlementBatchId) {
  if (transactionIds.length === 0) return;

  const query = `
    UPDATE sp_v2_transactions
    SET is_refund_processed = TRUE,
        updated_at = NOW()
    WHERE transaction_id = ANY($1)
      AND refund_amount_paise IS NOT NULL
  `;

  await pool.query(query, [transactionIds]);
  console.log(`   ✅ Marked ${transactionIds.length} refunds as processed`);
}

/**
 * Mark chargebacks as processed after settlement
 */
async function markChargebacksAsProcessed(chargebackIds, settlementBatchId) {
  if (chargebackIds.length === 0) return;

  const query = `
    UPDATE sp_v2_chargebacks
    SET is_settlement_processed = TRUE,
        updated_at = NOW()
    WHERE id = ANY($1)
  `;

  await pool.query(query, [chargebackIds]);
  console.log(`   ✅ Marked ${chargebackIds.length} chargebacks as processed`);
}

/**
 * Mark outstanding debts as recovered
 */
async function markDebtsAsRecovered(debtIds, recoveredAmount, settlementBatchId) {
  if (debtIds.length === 0) return;

  const query = `
    UPDATE sp_v2_merchant_outstanding_debts
    SET status = 'FULLY_RECOVERED',
        recovered_at = NOW(),
        recovery_batch_id = $1,
        recovery_amount_paise = $2
    WHERE id = ANY($3)
  `;

  await pool.query(query, [settlementBatchId, recoveredAmount, debtIds]);
  console.log(`   ✅ Marked ${debtIds.length} debts as recovered (₹${(recoveredAmount / 100).toFixed(2)})`);
}

/**
 * Complete settlement processing - mark everything as processed
 */
async function completeSettlementProcessing(settlementResult, settlementBatchId) {
  try {
    // Mark refunds as processed
    const refundTxnIds = [
      ...settlementResult.deductions.refunds.details.currentCycleRefunds.map(r => r.transactionId),
      ...settlementResult.deductions.refunds.details.outstandingRefunds.map(r => r.transactionId)
    ];

    if (refundTxnIds.length > 0) {
      await markRefundsAsProcessed(refundTxnIds, settlementBatchId);
    }

    // Mark chargebacks as processed (need to get IDs from database)
    if (settlementResult.deductions.chargebacks.count > 0) {
      const cbTxnRefs = settlementResult.deductions.chargebacks.details.map(cb => cb.transactionId);
      const cbQuery = `SELECT id FROM sp_v2_chargebacks WHERE txn_ref = ANY($1)`;
      const cbResult = await pool.query(cbQuery, [cbTxnRefs]);
      const cbIds = cbResult.rows.map(r => r.id);

      if (cbIds.length > 0) {
        await markChargebacksAsProcessed(cbIds, settlementBatchId);
      }
    }

    // Mark debts as recovered
    if (settlementResult.deductions.outstandingDebt.count > 0) {
      const debtIds = settlementResult.deductions.outstandingDebt.details.map(d => d.id);
      const recoveredAmount = settlementResult.deductions.outstandingDebt.total;

      await markDebtsAsRecovered(debtIds, recoveredAmount, settlementBatchId);
    }

    console.log(`   ✅ Settlement processing marked complete for batch ${settlementBatchId}`);

  } catch (error) {
    console.error(`   ❌ Error completing settlement processing:`, error);
    throw error;
  }
}

module.exports = {
  calculateMerchantSettlement,
  markRefundsAsProcessed,
  markChargebacksAsProcessed,
  markDebtsAsRecovered,
  completeSettlementProcessing
};
