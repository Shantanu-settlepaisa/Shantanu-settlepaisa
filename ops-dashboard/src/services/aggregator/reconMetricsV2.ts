/**
 * OP-OVW-CONSISTENCY-002: Enhanced aggregator with exclusive pipeline and validation
 */

// Raw pipeline data from database
export interface PipelineRaw {
  captured: number;
  inSettlement: number;
  sentToBank: number;
  creditedUtr: number;
}

// Mutually exclusive pipeline buckets
export interface PipelineExclusive {
  inSettlementOnly: number;  // In settlement but NOT sent to bank
  sentToBankOnly: number;     // Sent to bank but NOT credited
  credited: number;           // Credited (final state)
  unsettled: number;          // Not in any settlement process
  totalCaptured: number;      // Sum of all exclusive buckets
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface Pipeline {
  raw: PipelineRaw;
  exclusive: PipelineExclusive;
  warnings: ValidationWarning[];
}

export interface TopReason {
  reason: string;
  count: number;
  pct: number;
}

export interface TopReasons {
  mode: 'impacted' | 'occurrences';
  rows: TopReason[];
  total: number;
  remainder?: number;
}

export interface Tiles {
  reconRate: { 
    matched: number; 
    total: number; 
    pct: number;
  };
  unmatched: { 
    txns: number; 
    amount: number;
  };
  openExceptions: { 
    count: number; 
    critical: number; 
    high: number;
  };
  creditedToMerchant: { 
    amount: number;
    txCount: number;
    batches: number;
  };
}

export interface BySource {
  manual: { matched: number; total: number; pct: number };
  connector: { matched: number; total: number; pct: number };
}

export interface Window {
  from: string;
  to: string;
  tz: string;
  label?: string;
}

export interface Overview {
  window: Window;
  tiles: Tiles;
  pipeline: Pipeline;
  topReasons: TopReasons;
  bySource: BySource;
  ageing: Record<string, Record<string, number>>;
  burnDown: {
    days: Array<{ date: string; open: number; new: number; resolved: number }>;
    backlogDays: number;
    targetPerDay: number;
  };
  definitions: Record<string, string>;
}

// Configuration
const PRIMARY_REASON_MODE: 'priority' | 'first' = 'priority';

// Reason priority for primary reason selection
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

// Metric definitions
const DEFINITIONS: Record<string, string> = {
  captured: "Transactions with status='captured' within the selected time window",
  inSettlement: "Captured transactions in the settlement process but not yet sent to bank",
  sentToBank: "Transactions sent to bank for processing but not yet credited",
  creditedUtr: "Transactions confirmed credited with UTR received",
  unsettled: "Captured transactions not yet in any settlement process",
  reconRate: "Percentage of captured transactions successfully matched",
  unmatched: "Total value of captured transactions not matched",
  openExceptions: "Transactions with unresolved reconciliation issues",
  creditedToMerchant: "Transactions where funds have been credited to merchant account"
};

/**
 * Main aggregation function with exclusive pipeline calculation
 */
export async function getOverview(
  window: Window,
  filters?: { merchantIds?: string[]; sources?: ('manual' | 'connector')[] }
): Promise<Overview> {
  // Get raw counts from database
  const raw = await fetchRawPipeline(window, filters);
  
  // Calculate exclusive buckets with clamping
  const exclusive = calculateExclusivePipeline(raw);
  
  // Validate pipeline consistency
  const warnings = validatePipeline(raw, exclusive);
  
  // Get exception data
  const openExceptions = await fetchOpenExceptions(window, filters);
  
  // Calculate top reasons
  const topReasons = calculateTopReasons(openExceptions);
  
  // Validate top reasons consistency
  if (topReasons.mode === 'impacted' && topReasons.total !== openExceptions.length) {
    warnings.push({
      code: 'TOP_REASONS_MISMATCH',
      message: `Top reasons total (${topReasons.total}) doesn't match open exceptions (${openExceptions.length})`,
      severity: 'warning'
    });
  }
  
  // Calculate tiles
  const tiles = calculateTiles(raw, exclusive, openExceptions.length);
  
  // Get by source metrics
  const bySource = await fetchBySourceMetrics(window, filters);
  
  // Get ageing data
  const ageing = await fetchAgeingData(window, filters);
  
  // Get burndown data
  const burnDown = await fetchBurndownData(window, filters);
  
  return {
    window,
    tiles,
    pipeline: {
      raw,
      exclusive,
      warnings
    },
    topReasons,
    bySource,
    ageing,
    burnDown,
    definitions: DEFINITIONS
  };
}

/**
 * Calculate exclusive pipeline buckets with proper clamping
 */
function calculateExclusivePipeline(raw: PipelineRaw): PipelineExclusive {
  // Apply clamping to ensure logical consistency
  // credited cannot exceed sentToBank
  const creditedClamped = Math.min(raw.creditedUtr, raw.sentToBank);
  
  // sentToBank cannot exceed inSettlement
  const sentToBankClamped = Math.min(raw.sentToBank, raw.inSettlement);
  
  // Calculate mutually exclusive buckets
  // Each transaction is in exactly ONE state
  const credited = creditedClamped;
  const sentToBankOnly = sentToBankClamped - credited;
  const inSettlementOnly = raw.inSettlement - sentToBankClamped;
  const unsettled = raw.captured - raw.inSettlement;
  
  return {
    inSettlementOnly,
    sentToBankOnly,
    credited,
    unsettled,
    totalCaptured: raw.captured
  };
}

/**
 * Validate pipeline consistency
 */
function validatePipeline(raw: PipelineRaw, exclusive: PipelineExclusive): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  
  // Check if clamping was needed
  if (raw.creditedUtr > raw.sentToBank) {
    warnings.push({
      code: 'CREDITED_EXCEEDS_SENT',
      message: `Credited (${raw.creditedUtr}) exceeds sent to bank (${raw.sentToBank}). Data clamped.`,
      severity: 'warning'
    });
  }
  
  if (raw.sentToBank > raw.inSettlement) {
    warnings.push({
      code: 'SENT_EXCEEDS_SETTLEMENT',
      message: `Sent to bank (${raw.sentToBank}) exceeds in settlement (${raw.inSettlement}). Data clamped.`,
      severity: 'warning'
    });
  }
  
  // Verify sum of exclusive buckets equals total
  const exclusiveSum = exclusive.inSettlementOnly + exclusive.sentToBankOnly + 
                      exclusive.credited + exclusive.unsettled;
  
  if (exclusiveSum !== exclusive.totalCaptured) {
    warnings.push({
      code: 'PIPELINE_SUM_MISMATCH',
      message: `Pipeline sum (${exclusiveSum}) doesn't match captured (${exclusive.totalCaptured})`,
      severity: 'error'
    });
  }
  
  return warnings;
}

/**
 * Calculate tiles from pipeline data
 */
function calculateTiles(raw: PipelineRaw, exclusive: PipelineExclusive, openExceptionCount: number): Tiles {
  const matched = Math.floor(raw.captured * 0.74); // 74% match rate for demo
  
  return {
    reconRate: {
      matched,
      total: raw.captured,
      pct: raw.captured > 0 ? (matched / raw.captured) * 100 : 0
    },
    unmatched: {
      txns: raw.captured - matched,
      amount: (raw.captured - matched) * 2847 * 100 // Average txn value in paise
    },
    openExceptions: {
      count: openExceptionCount,
      critical: Math.floor(openExceptionCount * 0.15),
      high: Math.floor(openExceptionCount * 0.35)
    },
    creditedToMerchant: {
      amount: exclusive.credited * 3127 * 100, // Average txn value in paise
      txCount: exclusive.credited, // Must match exclusive.credited
      batches: 7
    }
  };
}

/**
 * Calculate top reasons with primary reason logic
 */
function calculateTopReasons(exceptions: any[]): TopReasons {
  if (PRIMARY_REASON_MODE === 'priority') {
    // Map each exception to single primary reason
    const reasonCounts = new Map<string, number>();
    
    // Demo data - would come from actual exception records
    const distribution = [
      { reason: 'BANK_TXN_MISSING_IN_PG', count: 10 },
      { reason: 'PG_TXN_MISSING_IN_BANK', count: 8 },
      { reason: 'UTR_MISSING_OR_INVALID', count: 6 },
      { reason: 'AMOUNT_MISMATCH', count: 6 },
      { reason: 'STATUS_MISMATCH', count: 4 },
      { reason: 'BANK_FILE_MISSING', count: 3 },
      { reason: 'DATE_OUT_OF_WINDOW', count: 1 }
    ];
    
    const total = distribution.reduce((sum, d) => sum + d.count, 0);
    const openTotal = 38; // From our mock data
    
    const rows = distribution.map(d => ({
      reason: d.reason,
      count: d.count,
      pct: (d.count / openTotal) * 100
    }));
    
    // Check if we need remainder
    const remainder = openTotal - total;
    
    return {
      mode: 'impacted',
      rows,
      total,
      remainder: remainder > 0 ? remainder : undefined
    };
  } else {
    // Return occurrences mode
    return {
      mode: 'occurrences',
      rows: [],
      total: 0
    };
  }
}

/**
 * Fetch raw pipeline data from database
 */
async function fetchRawPipeline(window: Window, filters?: any): Promise<PipelineRaw> {
  // Mock implementation - replace with actual DB queries
  return {
    captured: 147,
    inSettlement: 110,  // More than sentToBank to test clamping
    sentToBank: 89,
    creditedUtr: 95      // Intentionally > sentToBank to test clamping
  };
}

/**
 * Fetch open exceptions
 */
async function fetchOpenExceptions(window: Window, filters?: any): Promise<any[]> {
  // Mock implementation
  return new Array(38); // 38 open exceptions
}

/**
 * Fetch by source metrics
 */
async function fetchBySourceMetrics(window: Window, filters?: any): Promise<BySource> {
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
 * Fetch ageing data
 */
async function fetchAgeingData(window: Window, filters?: any): Promise<Record<string, Record<string, number>>> {
  // Mock implementation - would come from DB
  const ageing: Record<string, Record<string, number>> = {
    '0-24h': {
      'BANK_TXN_MISSING_IN_PG': 5,
      'AMOUNT_MISMATCH': 3,
    },
    '24-48h': {
      'PG_TXN_MISSING_IN_BANK': 4,
      'UTR_MISSING_OR_INVALID': 2,
    },
    '2-7d': {
      'STATUS_MISMATCH': 3,
      'BANK_FILE_MISSING': 2,
    },
    '>7d': {
      'DATE_OUT_OF_WINDOW': 1,
      'AMOUNT_MISMATCH': 1,
    }
  };
  
  // Initialize all reasons with 0
  const buckets = ['0-24h', '24-48h', '2-7d', '>7d'];
  buckets.forEach(bucket => {
    if (!ageing[bucket]) ageing[bucket] = {};
    REASON_PRIORITY.forEach(reason => {
      if (!ageing[bucket][reason]) ageing[bucket][reason] = 0;
    });
  });
  
  return ageing;
}

/**
 * Fetch burndown data
 */
async function fetchBurndownData(window: Window, filters?: any): Promise<any> {
  const days = [];
  const today = new Date();
  
  // Generate last 14 days
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    const open = 38 - (i * 2); // Gradually decreasing
    const newCount = 5 + Math.floor(Math.random() * 3);
    const resolved = 6 + Math.floor(Math.random() * 2);
    
    days.push({
      date: date.toISOString().split('T')[0],
      open,
      new: newCount,
      resolved
    });
  }
  
  const avgResolved = days.slice(-7).reduce((sum, d) => sum + d.resolved, 0) / 7;
  const currentOpen = days[days.length - 1].open;
  const targetPerDay = 5; // Target resolution rate
  
  return {
    days,
    backlogDays: avgResolved > 0 ? Math.round(currentOpen / avgResolved) : 0,
    targetPerDay
  };
}

/**
 * Format number for display
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