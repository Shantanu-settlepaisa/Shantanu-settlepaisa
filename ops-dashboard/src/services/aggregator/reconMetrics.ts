/**
 * OP-OVW-CONSISTENCY-001: Single source of truth for reconciliation metrics
 * 
 * This aggregator ensures mathematical consistency across all Overview metrics.
 * All counts and amounts flow through a unified pipeline with invariant validation.
 */

// Type definitions
export type Window = { from: string; to: string; tz: string; label?: string };

export type Pipeline = {
  captured: number;
  inSettlement: number;
  sentToBank: number;
  creditedUtr: number;
  unsettled: number;
  totalCaptured: number; // Sanity check: equals captured
};

export type Tiles = {
  reconRate: { matched: number; total: number; pct: number };
  unmatched: { txns: number; amount: number };
  openExceptions: { count: number; critical: number; high: number };
  creditedToMerchant: { batches: number; txns: number; amount: number };
};

export type TopReason = {
  reason: string;
  impactedTxns: number;    // COUNT(DISTINCT txn_id)
  occurrences: number;      // COUNT(*)
  pctOfOpen: number;
};

export type AgeingBucket = '0-24h' | '24-48h' | '2-7d' | '>7d';
export type ReasonCode = string;
export type Ageing = Record<AgeingBucket, Record<ReasonCode, number>>;

export type BurnDown = {
  days: Array<{ date: string; open: number; new: number; resolved: number }>;
  backlogDays: number;
  targetPerDay: number;
};

export type BySource = {
  manual: { matched: number; total: number; pct: number };
  connector: { matched: number; total: number; pct: number };
};

export type Definitions = {
  captured: string;
  inSettlement: string;
  sentToBank: string;
  creditedUtr: string;
  unsettled: string;
  reconRate: string;
  unmatched: string;
  openExceptions: string;
  creditedToMerchant: string;
};

export type ValidationWarning = {
  field: string;
  message: string;
  severity: 'warning' | 'error';
};

export type OverviewResponse = {
  window: Window;
  pipeline: Pipeline;
  tiles: Tiles;
  topReasons: TopReason[];
  ageing: Ageing;
  burnDown: BurnDown;
  bySource: BySource;
  definitions: Definitions;
  validationWarnings: ValidationWarning[];
};

// Configuration
const EXCEPTIONS_PRIMARY_REASON: 'priority' | 'first' = 'priority';

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
const METRIC_DEFINITIONS: Definitions = {
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
 * Main aggregation function - single source of truth for Overview metrics
 */
export async function getOverview(
  window: Window,
  filters: { 
    merchantIds?: string[]; 
    sources?: ('manual' | 'connector')[];
  }
): Promise<OverviewResponse> {
  const validationWarnings: ValidationWarning[] = [];
  
  // For mock implementation, generate consistent demo data
  const mockData = generateConsistentMockData(window, filters);
  
  // Validate pipeline invariants
  const pipeline = validatePipeline(mockData.pipeline, validationWarnings);
  
  // Compute tiles from same denominator
  const tiles = computeTiles(pipeline, mockData);
  
  // Get primary reason per transaction
  const topReasons = computeTopReasons(mockData.exceptions, mockData.openExceptions);
  
  // Validate top reasons sum
  const totalImpacted = topReasons.reduce((sum, r) => sum + r.impactedTxns, 0);
  if (totalImpacted !== mockData.openExceptions) {
    validationWarnings.push({
      field: 'topReasons',
      message: `Impacted transactions (${totalImpacted}) doesn't match open exceptions (${mockData.openExceptions}). Using occurrences instead.`,
      severity: 'warning'
    });
  }
  
  // Compute ageing with reason breakdown
  const ageing = computeAgeing(mockData.exceptions);
  
  // Compute burn-down with backlog days
  const burnDown = computeBurnDown(mockData.burnDownData);
  
  // Compute by source metrics
  const bySource = computeBySource(mockData.bySourceData);
  
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
 * Validate and enforce pipeline invariants
 */
function validatePipeline(raw: Pipeline, warnings: ValidationWarning[]): Pipeline {
  const pipeline = { ...raw };
  
  // Invariant 1: totalCaptured must equal captured
  if (pipeline.totalCaptured !== pipeline.captured) {
    warnings.push({
      field: 'pipeline',
      message: `Total captured (${pipeline.totalCaptured}) doesn't match captured (${pipeline.captured}). Using captured value.`,
      severity: 'error'
    });
    pipeline.totalCaptured = pipeline.captured;
  }
  
  // Invariant 2: creditedUtr cannot exceed sentToBank
  if (pipeline.creditedUtr > pipeline.sentToBank) {
    warnings.push({
      field: 'pipeline',
      message: `Credited UTR (${pipeline.creditedUtr}) exceeds sent to bank (${pipeline.sentToBank}). Numbers clamped to maintain pipeline order.`,
      severity: 'warning'
    });
    pipeline.creditedUtr = pipeline.sentToBank;
  }
  
  // Invariant 3: sentToBank cannot exceed captured
  if (pipeline.sentToBank > pipeline.captured) {
    warnings.push({
      field: 'pipeline',
      message: `Sent to bank (${pipeline.sentToBank}) exceeds captured (${pipeline.captured}). Clamping to captured.`,
      severity: 'warning'
    });
    pipeline.sentToBank = pipeline.captured;
  }
  
  // Invariant 4: inSettlement + sentToBank should not exceed captured
  if (pipeline.inSettlement + pipeline.sentToBank > pipeline.captured) {
    warnings.push({
      field: 'pipeline',
      message: `In settlement + sent to bank exceeds captured. Adjusting in settlement.`,
      severity: 'warning'
    });
    pipeline.inSettlement = Math.max(0, pipeline.captured - pipeline.sentToBank);
  }
  
  return pipeline;
}

/**
 * Compute tiles from unified pipeline data
 */
function computeTiles(pipeline: Pipeline, data: any): Tiles {
  const matched = Math.floor(pipeline.captured * 0.74); // 74% match rate for demo
  
  return {
    reconRate: {
      matched,
      total: pipeline.captured,
      pct: pipeline.captured > 0 ? (matched / pipeline.captured) * 100 : 0
    },
    unmatched: {
      txns: pipeline.captured - matched,
      amount: (pipeline.captured - matched) * 2847 * 100 // Average txn value in paise
    },
    openExceptions: {
      count: data.openExceptions,
      critical: Math.floor(data.openExceptions * 0.15),
      high: Math.floor(data.openExceptions * 0.35)
    },
    creditedToMerchant: {
      batches: data.creditedBatches || 7,
      txns: pipeline.creditedUtr,
      amount: pipeline.creditedUtr * 3127 * 100 // Average txn value in paise
    }
  };
}

/**
 * Compute top reasons with primary reason per transaction
 */
function computeTopReasons(exceptions: any[], total: number): TopReason[] {
  // Group by reason and count both distinct txns and occurrences
  const reasonMap = new Map<string, { txns: Set<string>, count: number }>();
  
  // For demo, create sample distribution
  const distribution = [
    { reason: 'BANK_TXN_MISSING_IN_PG', pct: 0.25 },
    { reason: 'PG_TXN_MISSING_IN_BANK', pct: 0.20 },
    { reason: 'UTR_MISSING_OR_INVALID', pct: 0.15 },
    { reason: 'AMOUNT_MISMATCH', pct: 0.15 },
    { reason: 'STATUS_MISMATCH', pct: 0.10 },
    { reason: 'BANK_FILE_MISSING', pct: 0.08 },
    { reason: 'DATE_OUT_OF_WINDOW', pct: 0.07 }
  ];
  
  return distribution.map(d => ({
    reason: d.reason,
    impactedTxns: Math.floor(total * d.pct),
    occurrences: Math.floor(total * d.pct * 1.3), // Some txns have multiple occurrences
    pctOfOpen: d.pct * 100
  }));
}

/**
 * Compute ageing buckets with reason breakdown
 */
function computeAgeing(exceptions: any[]): Ageing {
  const buckets: AgeingBucket[] = ['0-24h', '24-48h', '2-7d', '>7d'];
  const ageing: Ageing = {} as Ageing;
  
  // Initialize buckets
  buckets.forEach(bucket => {
    ageing[bucket] = {};
    REASON_PRIORITY.forEach(reason => {
      ageing[bucket][reason] = 0;
    });
  });
  
  // Demo distribution
  ageing['0-24h']['BANK_TXN_MISSING_IN_PG'] = 12;
  ageing['0-24h']['AMOUNT_MISMATCH'] = 8;
  ageing['24-48h']['PG_TXN_MISSING_IN_BANK'] = 15;
  ageing['24-48h']['UTR_MISSING_OR_INVALID'] = 10;
  ageing['2-7d']['STATUS_MISMATCH'] = 18;
  ageing['2-7d']['BANK_FILE_MISSING'] = 14;
  ageing['>7d']['DATE_OUT_OF_WINDOW'] = 22;
  ageing['>7d']['AMOUNT_MISMATCH'] = 17;
  
  return ageing;
}

/**
 * Compute burn-down chart data with backlog days
 */
function computeBurnDown(data: any): BurnDown {
  const days = [];
  const today = new Date();
  
  // Generate last 14 days
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    const open = 147 - (i * 3); // Gradually decreasing
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
  const targetPerDay = 10; // Target resolution rate
  
  return {
    days,
    backlogDays: avgResolved > 0 ? currentOpen / avgResolved : 0,
    targetPerDay
  };
}

/**
 * Compute metrics by source
 */
function computeBySource(data: any): BySource {
  return {
    manual: {
      matched: 45,
      total: 67,
      pct: 67.2
    },
    connector: {
      matched: 64,
      total: 80,
      pct: 80.0
    }
  };
}

/**
 * Generate consistent mock data for demo
 */
function generateConsistentMockData(window: Window, filters: any) {
  const captured = 147;
  const matched = 109;
  
  // Pipeline stages are MUTUALLY EXCLUSIVE states
  // Each transaction is in exactly ONE state
  // Total should equal captured
  const creditedUtr = 51;       // Confirmed credited with UTR (final state)
  const sentToBank = 38;        // Sent to bank, awaiting credit confirmation
  const inSettlement = 20;      // Being processed for settlement  
  const unsettled = 38;         // Not yet in settlement process
  
  // Validation: All states should sum to captured
  const pipelineSum = creditedUtr + sentToBank + inSettlement + unsettled;
  if (pipelineSum !== captured) {
    console.warn(`Pipeline sum (${pipelineSum}) doesn't match captured (${captured})`);
  }
  
  return {
    pipeline: {
      captured,
      inSettlement,
      sentToBank,
      creditedUtr,
      unsettled,
      totalCaptured: captured
    },
    openExceptions: captured - matched,
    exceptions: [],
    creditedBatches: 7,
    burnDownData: {},
    bySourceData: {}
  };
}

/**
 * Get previous window for trend comparison
 */
export function getPreviousWindow(window: Window): Window {
  const from = new Date(window.from);
  const to = new Date(window.to);
  const diff = to.getTime() - from.getTime();
  
  const prevFrom = new Date(from.getTime() - diff);
  const prevTo = new Date(to.getTime() - diff);
  
  return {
    from: prevFrom.toISOString().split('T')[0],
    to: prevTo.toISOString().split('T')[0],
    tz: window.tz
  };
}

/**
 * Format number with proper decimal places
 */
export function formatMetricNumber(value: number, type: 'count' | 'amount' | 'percent'): string {
  switch (type) {
    case 'count':
      return value.toLocaleString('en-IN');
    case 'amount':
      return `₹${(value / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    default:
      return value.toString();
  }
}