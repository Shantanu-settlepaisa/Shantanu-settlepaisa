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
const config = require('../config/env.cjs');

const isRDS = config.db.host && (config.db.host.includes('rds.amazonaws.com') || config.db.host.includes('amazonaws.com'));

const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
  ssl: isRDS ? { rejectUnauthorized: false } : false,
});

/**
 * Main deductions calculation function
 * NOTE: This calculator ONLY handles deductions (refunds, chargebacks, debt).
 * Commission, GST, and reserve are calculated by SettlementCalculatorV3.
 *
 * @param {string} merchantId - Merchant ID
 * @param {string} cycleDate - Settlement cycle date (YYYY-MM-DD)
 * @param {number} baseNetAmount - Net amount from V3 calculator (after commission/GST/reserve)
 * @returns {Promise<Object>} Deductions breakdown
 */
async function calculateMerchantSettlement(merchantId, cycleDate, baseNetAmount = null) {
  console.log(`\n🧮 [Deductions Calculator] Processing: ${merchantId} for ${cycleDate}`);

  try {
    // Step 1: Get all matched/reconciled transactions for this cycle
    const transactions = await getReconciledTransactions(merchantId, cycleDate);
    console.log(`   📊 Found ${transactions.length} reconciled transactions`);

    if (transactions.length === 0) {
      return {
        merchantId,
        cycleDate,
        grossAmount: 0,
        netAmount: baseNetAmount || 0,
        status: 'NO_TRANSACTIONS',
        message: 'No reconciled transactions for this cycle',
        deductions: {
          refunds: { currentCycle: 0, outstanding: 0, total: 0, count: 0, details: { currentCycleRefunds: [], outstandingRefunds: [] } },
          chargebacks: { total: 0, count: 0, details: [] },
          outstandingDebt: { total: 0, count: 0, details: [] }
        }
      };
    }

    // Step 2: Calculate gross amount (for reference only)
    const grossAmount = transactions.reduce((sum, txn) => sum + parseInt(txn.amount_paise), 0);
    console.log(`   💰 Gross Amount: ₹${(grossAmount / 100).toFixed(2)}`);

    // Step 3: Calculate refund deductions
    const refundDeductions = await calculateRefundDeductions(merchantId, cycleDate, transactions);
    console.log(`   🔄 Refund Deductions: ₹${(refundDeductions.total / 100).toFixed(2)}`);
    console.log(`      • Current Cycle: ₹${(refundDeductions.currentCycle / 100).toFixed(2)}`);
    console.log(`      • Outstanding: ₹${(refundDeductions.outstanding / 100).toFixed(2)}`);

    // Step 4: Calculate chargeback deductions
    const chargebackDeductions = await calculateChargebackDeductions(merchantId);
    console.log(`   ⚠️  Chargeback Deductions: ₹${(chargebackDeductions.total / 100).toFixed(2)}`);

    // Step 5: Recover outstanding debts from previous cycles
    const debtRecovery = await calculateOutstandingDebtRecovery(merchantId);
    console.log(`   📥 Outstanding Debt to Recover: ₹${(debtRecovery.total / 100).toFixed(2)}`);

    // Step 6: Calculate final net amount (if baseNetAmount provided, use it; otherwise return deductions only)
    const totalDeductions = refundDeductions.total + chargebackDeductions.total + debtRecovery.total;
    let netAmount = baseNetAmount !== null ? baseNetAmount - totalDeductions : -totalDeductions;
    console.log(`   🎯 Net Amount (after deductions): ₹${(netAmount / 100).toFixed(2)}`);

    // Step 7: Handle negative settlement
    let outstandingDebt = null;
    if (netAmount < 0) {
      console.log(`   ⚠️  Negative settlement detected! Creating debt record...`);
      outstandingDebt = await createOutstandingDebt(merchantId, Math.abs(netAmount), cycleDate, {
        grossAmount,
        baseNetAmount: baseNetAmount || 0,
        refunds: refundDeductions.total,
        chargebacks: chargebackDeductions.total,
        debtRecovery: debtRecovery.total
      });
      netAmount = 0; // Don't pay negative amount
    }

    // Step 8: Build deductions result
    const result = {
      merchantId,
      cycleDate,
      status: netAmount > 0 ? 'READY_FOR_PAYOUT' : (outstandingDebt ? 'NEGATIVE_BALANCE' : 'ZERO_PAYOUT'),

      // Gross calculations (for reference)
      grossAmount,
      transactionCount: transactions.length,

      // Deductions (this is what this calculator is responsible for)
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
        },
        total: totalDeductions
      },

      // Final amount (after applying deductions to baseNetAmount)
      netAmount,
      payoutAmount: netAmount,

      // Negative balance info
      outstandingDebt: outstandingDebt,

      calculatedAt: new Date()
    };

    console.log(`   ✅ Deductions calculation complete: ₹${(netAmount / 100).toFixed(2)}\n`);

    return result;

  } catch (error) {
    console.error(`   ❌ Deductions calculation failed:`, error);
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
  // FIXME: Disabled for now due to table schema mismatch between sp_v2_transactions (VARCHAR IDs)
  // and sp_v2_settlement_items (UUID FK to sp_v2_transactions_v1). Will need proper migration.
  // const outstandingQuery = `
  //   SELECT
  //     t.transaction_id,
  //     t.refund_amount_paise,
  //     t.refund_type,
  //     t.refund_date,
  //     t.refund_reason,
  //     t.transaction_date,
  //     sb.id AS original_batch_id,
  //     sb.created_at AS original_settlement_date
  //   FROM sp_v2_transactions t
  //   LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.txn_id
  //   LEFT JOIN sp_v2_settlement_batches sb ON si.batch_id = sb.id
  //   WHERE t.merchant_id = $1
  //     AND t.refund_amount_paise IS NOT NULL
  //     AND t.is_refund_processed = FALSE
  //     AND t.refund_date > COALESCE(sb.created_at, '1970-01-01')
  //     AND DATE(t.transaction_date) < $2  -- Transaction was in a previous cycle
  // `;
  //
  // const outstandingResult = await pool.query(outstandingQuery, [merchantId, cycleDate]);
  // const outstandingRefunds = outstandingResult.rows;

  const outstandingRefunds = []; // Temporarily disabled

  // Calculate totals with null-safety
  const safeParseInt = (value) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const currentCycleTotal = currentCycleRefunds.reduce(
    (sum, r) => sum + safeParseInt(r.refund_amount_paise), 0
  );

  const outstandingTotal = outstandingRefunds.reduce(
    (sum, r) => sum + safeParseInt(r.refund_amount_paise), 0
  );

  return {
    currentCycle: currentCycleTotal,
    outstanding: outstandingTotal,
    total: currentCycleTotal + outstandingTotal,
    count: currentCycleRefunds.length + outstandingRefunds.length,
    details: {
      currentCycleRefunds: currentCycleRefunds.map(r => ({
        transactionId: r.transaction_id,
        amount: safeParseInt(r.refund_amount_paise),
        type: r.refund_type,
        date: r.refund_date,
        reason: r.refund_reason
      })),
      outstandingRefunds: outstandingRefunds.map(r => ({
        transactionId: r.transaction_id,
        amount: safeParseInt(r.refund_amount_paise),
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
 * FIXME: Disabled for now due to table schema mismatch
 */
async function calculateChargebackDeductions(merchantId) {
  // Temporarily disabled - chargebacks table schema incompatible
  const chargebacks = [];

  /*
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
  */

  // Null-safe parseInt helper
  const safeParseInt = (value) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const total = chargebacks.reduce(
    (sum, cb) => sum + safeParseInt(cb.chargeback_paise), 0
  );

  return {
    total,
    count: chargebacks.length,
    details: chargebacks.map(cb => ({
      transactionId: cb.txn_ref,
      amount: safeParseInt(cb.chargeback_paise),
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

  // Null-safe parseInt helper
  const safeParseInt = (value) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const total = debts.reduce(
    (sum, debt) => sum + safeParseInt(debt.debt_amount_paise), 0
  );

  return {
    total,
    count: debts.length,
    details: debts.map(debt => ({
      id: debt.id,
      amount: safeParseInt(debt.debt_amount_paise),
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
  // Sanitize inputs to prevent "null" string or NaN errors
  const sanitizedDebtAmount = (debtAmount && !isNaN(debtAmount))
    ? parseInt(debtAmount)
    : 0;

  const sanitizedCycleDate = cycleDate && cycleDate !== 'null'
    ? cycleDate
    : new Date().toISOString().split('T')[0];

  const sanitizedMerchantId = merchantId && merchantId !== 'null'
    ? merchantId
    : 'UNKNOWN';

  if (sanitizedDebtAmount === 0) {
    console.warn('[Debt] Skipping debt creation: amount is zero or invalid');
    return null;
  }

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

  const reason = `Negative settlement for cycle ${sanitizedCycleDate}. Refunds and chargebacks exceeded new sales.`;

  const details = JSON.stringify({
    cycleDate: sanitizedCycleDate,
    breakdown: breakdown || {},
    netBalance: -sanitizedDebtAmount,
    timestamp: new Date()
  });

  const result = await pool.query(query, [
    sanitizedMerchantId,
    sanitizedDebtAmount,
    sanitizedCycleDate,
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
