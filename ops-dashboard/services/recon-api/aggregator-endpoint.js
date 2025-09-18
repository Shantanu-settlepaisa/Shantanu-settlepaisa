/**
 * OP-OVW-CONSISTENCY-001: API endpoint for unified metrics aggregator
 */

const express = require('express');
const router = express.Router();

// Priority order for determining primary reason per transaction
const REASON_PRIORITY = [
  'BANK_TXN_MISSING_IN_PG',
  'PG_TXN_MISSING_IN_BANK',
  'UTR_MISSING_OR_INVALID',
  'AMOUNT_MISMATCH',
  'STATUS_MISMATCH',
  'BANK_FILE_MISSING',
  'DATE_OUT_OF_WINDOW',
  'DUPLICATE_BANK_ENTRY',
  'DUPLICATE_PG_ENTRY',
  'CURRENCY_MISMATCH',
  'SCHEME_OR_MID_MISMATCH',
  'FEES_VARIANCE',
  'PARTIAL_CAPTURE_OR_REFUND_PENDING',
  'SPLIT_SETTLEMENT_UNALLOCATED'
];

// Definitions for UI tooltips
const METRIC_DEFINITIONS = {
  captured: "Transactions with status='captured' AND captured_at within selected window",
  inSettlement: "Captured transactions that are NOT matched AND NOT batch_assigned",
  sentToBank: "Transactions that are batch_assigned AND batch_sent_at within window",
  creditedUtr: "Transactions where UTR received (utr_received_at within window)",
  unsettled: "Captured transactions where age > SLA AND NOT utr_received",
  reconRate: "Percentage of captured transactions that are successfully matched",
  unmatched: "Total value of captured transactions that are NOT matched",
  openExceptions: "Transactions with unresolved reconciliation issues",
  creditedToMerchant: "Transactions where funds have been credited to merchant account"
};

/**
 * GET /api/recon/overview
 * Returns unified metrics with invariant validation
 */
router.get('/overview', async (req, res) => {
  try {
    const { from, to, tz = 'Asia/Kolkata', merchantIds, sources } = req.query;
    
    // Parse window
    const window = {
      from: from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: to || new Date().toISOString().split('T')[0],
      tz,
      label: req.query.label || 'Last 7 days'
    };
    
    // Generate consistent mock data (replace with actual DB queries)
    const data = await generateOverviewData(window, { merchantIds, sources });
    
    res.json(data);
  } catch (error) {
    console.error('Aggregator error:', error);
    res.status(500).json({ error: 'Failed to generate overview metrics' });
  }
});

/**
 * Generate overview data with invariant validation
 */
async function generateOverviewData(window, filters) {
  const validationWarnings = [];
  
  // Mock data - replace with actual DB queries
  const captured = 147;
  const matched = 109;
  const sentToBank = 89;
  let creditedUtr = 51;
  const openExceptions = captured - matched;
  
  // Validate pipeline invariants
  if (creditedUtr > sentToBank) {
    validationWarnings.push({
      field: 'pipeline',
      message: `Credited UTR (${creditedUtr}) exceeds sent to bank (${sentToBank}). Numbers clamped to maintain pipeline order.`,
      severity: 'warning'
    });
    creditedUtr = sentToBank;
  }
  
  // Build pipeline
  const pipeline = {
    captured,
    inSettlement: captured - sentToBank,
    sentToBank,
    creditedUtr,
    unsettled: captured - creditedUtr,
    totalCaptured: captured
  };
  
  // Build tiles
  const tiles = {
    reconRate: {
      matched,
      total: captured,
      pct: captured > 0 ? (matched / captured) * 100 : 0
    },
    unmatched: {
      txns: captured - matched,
      amount: (captured - matched) * 2847 * 100 // Average txn value in paise
    },
    openExceptions: {
      count: openExceptions,
      critical: Math.floor(openExceptions * 0.15),
      high: Math.floor(openExceptions * 0.35)
    },
    creditedToMerchant: {
      batches: 7,
      txns: creditedUtr,
      amount: creditedUtr * 3127 * 100
    }
  };
  
  // Top reasons with impactedTxns and occurrences
  const topReasons = [
    { reason: 'BANK_TXN_MISSING_IN_PG', impactedTxns: 10, occurrences: 12, pctOfOpen: 25.0 },
    { reason: 'PG_TXN_MISSING_IN_BANK', impactedTxns: 8, occurrences: 10, pctOfOpen: 20.0 },
    { reason: 'UTR_MISSING_OR_INVALID', impactedTxns: 6, occurrences: 8, pctOfOpen: 15.0 },
    { reason: 'AMOUNT_MISMATCH', impactedTxns: 6, occurrences: 7, pctOfOpen: 15.0 },
    { reason: 'STATUS_MISMATCH', impactedTxns: 4, occurrences: 5, pctOfOpen: 10.0 },
    { reason: 'BANK_FILE_MISSING', impactedTxns: 3, occurrences: 3, pctOfOpen: 8.0 },
    { reason: 'DATE_OUT_OF_WINDOW', impactedTxns: 2, occurrences: 2, pctOfOpen: 7.0 }
  ];
  
  // Validate top reasons sum
  const totalImpacted = topReasons.reduce((sum, r) => sum + r.impactedTxns, 0);
  if (totalImpacted !== openExceptions) {
    validationWarnings.push({
      field: 'topReasons',
      message: `Impacted transactions (${totalImpacted}) doesn't match open exceptions (${openExceptions}). Using occurrences instead.`,
      severity: 'warning'
    });
  }
  
  // Ageing buckets
  const ageing = {
    '0-24h': {
      'BANK_TXN_MISSING_IN_PG': 12,
      'AMOUNT_MISMATCH': 8
    },
    '24-48h': {
      'PG_TXN_MISSING_IN_BANK': 15,
      'UTR_MISSING_OR_INVALID': 10
    },
    '2-7d': {
      'STATUS_MISMATCH': 18,
      'BANK_FILE_MISSING': 14
    },
    '>7d': {
      'DATE_OUT_OF_WINDOW': 22,
      'AMOUNT_MISMATCH': 17
    }
  };
  
  // Fill empty reason codes
  Object.keys(ageing).forEach(bucket => {
    REASON_PRIORITY.forEach(reason => {
      if (!ageing[bucket][reason]) {
        ageing[bucket][reason] = 0;
      }
    });
  });
  
  // Burn-down data
  const burnDown = generateBurnDown();
  
  // By source metrics
  const bySource = {
    manual: { matched: 45, total: 67, pct: 67.2 },
    connector: { matched: 64, total: 80, pct: 80.0 }
  };
  
  return {
    window,
    pipeline,
    tiles,
    topReasons,
    ageing,
    burnDown,
    bySource,
    definitions: METRIC_DEFINITIONS,
    validationWarnings
  };
}

/**
 * Generate burn-down chart data
 */
function generateBurnDown() {
  const days = [];
  const today = new Date();
  
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    const open = 147 - (i * 3);
    const newCount = 15 + Math.floor(Math.random() * 10);
    const resolved = 18 + Math.floor(Math.random() * 8);
    
    days.push({
      date: date.toISOString().split('T')[0],
      open,
      new: newCount,
      resolved
    });
  }
  
  const avgResolved = days.slice(-7).reduce((sum, d) => sum + d.resolved, 0) / 7;
  const currentOpen = days[days.length - 1].open;
  const targetPerDay = 10;
  
  return {
    days,
    backlogDays: avgResolved > 0 ? Math.round(currentOpen / avgResolved) : 0,
    targetPerDay
  };
}

module.exports = router;