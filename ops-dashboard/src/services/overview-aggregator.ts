import type { OverviewSnapshot } from '../types/overview';
import type { OpsSnapshot } from '../types/opsSnapshot';

// Simple EventEmitter implementation for browser
class SimpleEventEmitter {
  private events: Map<string, Set<Function>> = new Map();

  on(event: string, handler: Function) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)?.add(handler);
  }

  off(event: string, handler: Function) {
    this.events.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]) {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }
}

export const overviewBus = new SimpleEventEmitter();

// In-memory storage for demo purposes (in production, use DB)
let reconResults = {
  matched: 12453,
  total: 14312,
  unmatchedAmount: 185900000000, // in paise (~1,859 Cr for 1,859 unmatched txns)
};

let exceptionsData = {
  total: 47,
  critical: 8,
  high: 12,
  medium: 15,
  low: 12,
};

// Settlement data should match credited transactions from progress
let settlementData = {
  settledTxns: 11234,
  settledAmount: 9823400000, // in paise (~98.23 Cr)
  batches: 156,
};

// Progress data represents stages of transaction lifecycle
// This is a TRUE FUNNEL view - each stage is a subset of the previous
// Flow: Captured → In Settlement → Sent to Bank → Credited
// Unsettled = Captured - Credited (these are NOT in the funnel)
let progressData = {
  captured: { count: 14312, amount: 1023450000000 }, // Total captured transactions
  inSettlement: { count: 13500, amount: 950000000000 }, // Transactions being processed (includes sent + credited)
  sentToBank: { count: 12000, amount: 850000000000 }, // Subset of in-settlement, awaiting bank confirmation
  credited: { count: 11234, amount: 982340000000 }, // Subset of sent-to-bank, successfully credited
  settledToBank: { count: 11234, amount: 982340000000 }, // Legacy - same as credited
  unsettled: { count: 3078, amount: 41110000000 }, // captured - credited = 14312 - 11234 (outside funnel)
};

// Track settlements amount separately
let settlementsToday = 9823400000; // in paise

export async function computeSnapshot(
  range: string = 'last7d',
  timezone: string = 'Asia/Kolkata',
  windowStart?: string,
  windowEnd?: string
): Promise<OverviewSnapshot> {
  // Parse the range to determine window bounds
  const now = new Date();
  let start: Date, end: Date;
  let compareStart: Date | undefined, compareEnd: Date | undefined;
  
  if (windowStart && windowEnd) {
    start = new Date(windowStart);
    end = new Date(windowEnd);
  } else {
    // Default window calculation based on range
    switch (range) {
      case 'today':
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
        compareStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
        compareEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'yesterday':
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        start = new Date(yesterday.setHours(0, 0, 0, 0));
        end = new Date(yesterday.setHours(23, 59, 59, 999));
        compareStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
        compareEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'last30d':
        end = new Date();
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        compareEnd = new Date(start.getTime() - 1);
        compareStart = new Date(compareEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'mtd':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date();
        // Previous month to date
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        compareStart = prevMonth;
        compareEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), now.getDate());
        break;
      case 'last7d':
      default:
        end = new Date();
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        compareEnd = new Date(start.getTime() - 1);
        compareStart = new Date(compareEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
    }
  }
  
  // Calculate multiplier based on window size for demo data
  const windowDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const multiplier = Math.max(1, windowDays / 7);
  
  // Simulate trend calculations
  const reconTrend = Math.random() > 0.5 ? 
    { value: Math.random() * 5, direction: 'up' as const } :
    { value: Math.random() * 3, direction: 'down' as const };
  
  const unmatchedTrend = Math.random() > 0.6 ?
    { value: Math.random() * 4, direction: 'down' as const } :
    { value: Math.random() * 2, direction: 'up' as const };
  
  const exceptionsTrend = { value: 2.1, direction: 'down' as const };
  const settlementTrend = { value: 5.3, direction: 'up' as const };
  
  const snapshot: OverviewSnapshot = {
    asOf: new Date().toISOString(),
    window: range === 'last7d' ? '7d' : range === 'last30d' ? '30d' : 'day',
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    compareWindow: compareStart && compareEnd ? {
      start: compareStart.toISOString(),
      end: compareEnd.toISOString()
    } : undefined,
    reconciliation: {
      matchedPct: parseFloat(((reconResults.matched / reconResults.total) * 100).toFixed(2)),
      matchedCount: Math.floor(reconResults.matched * multiplier),
      totalCount: Math.floor(reconResults.total * multiplier),
      trend: reconTrend
    },
    unmatched: {
      value: Math.floor(reconResults.unmatchedAmount * multiplier),
      count: Math.floor((reconResults.total - reconResults.matched) * multiplier),
      trend: unmatchedTrend
    },
    exceptions: {
      openCount: exceptionsData.total,
      critical: exceptionsData.critical,
      high: exceptionsData.high,
      medium: Math.floor(exceptionsData.total * 0.3),
      low: Math.floor(exceptionsData.total * 0.2),
      trend: exceptionsTrend
    },
    settlementValue: {
      amount: Math.floor(settlementsToday * multiplier),
      count: Math.floor(150 * multiplier),
      trend: settlementTrend
    },
    progress: {
      captured: {
        count: Math.floor(progressData.captured.count * multiplier),
        amount: Math.floor(progressData.captured.amount * multiplier),
      },
      inSettlement: {
        count: Math.floor(progressData.inSettlement.count * multiplier),
        amount: Math.floor(progressData.inSettlement.amount * multiplier),
      },
      settledToBank: {
        count: Math.floor(progressData.settledToBank.count * multiplier),
        amount: Math.floor(progressData.settledToBank.amount * multiplier),
      },
      unsettled: {
        count: Math.floor(progressData.unsettled.count * multiplier),
        amount: Math.floor(progressData.unsettled.amount * multiplier),
      },
    },
  };
  
  return snapshot;
}

// New function to compute OpsSnapshot format
export async function computeOpsSnapshot(
  rangeStart: string,
  rangeEnd: string,
  timezone: string = 'Asia/Kolkata'
): Promise<OpsSnapshot> {
  // Calculate window duration for comparison
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  const durationMs = end.getTime() - start.getTime();
  
  // For demo, simulate different values based on window size
  const windowDays = Math.ceil(durationMs / (24 * 60 * 60 * 1000));
  // Use a more reasonable multiplier - don't scale too much
  const multiplier = windowDays <= 1 ? 0.3 : windowDays <= 7 ? 1 : windowDays <= 30 ? 2.5 : 4;
  
  // Ensure matched never exceeds total
  const totalTxns = Math.floor(reconResults.total * multiplier);
  const matchedTxns = Math.min(
    Math.floor(reconResults.matched * multiplier),
    totalTxns
  );
  const matchedPct = totalTxns > 0 ? (matchedTxns / totalTxns) * 100 : 0;
  
  // Calculate realistic deltas for comparison
  const reconDelta = 5.2; // Improvement from previous period
  const unmatchedDelta = -15.2; // Unmatched decreased by 15.2%
  const exceptionsDelta = -8.5; // Exceptions decreased by 8.5%
  const settlementDelta = 12.3; // Settlement increased by 12.3%
  
  const snapshot: OpsSnapshot = {
    windowStart: rangeStart,
    windowEnd: rangeEnd,
    compareWindow: 'prev_period',
    recon: {
      totalTxns: totalTxns,
      matchedTxns: matchedTxns,
      matchedPct: parseFloat(matchedPct.toFixed(2)),
      deltaPct: reconDelta
    },
    unmatched: {
      txnCount: Math.max(0, totalTxns - matchedTxns),
      value: Math.floor(reconResults.unmatchedAmount * multiplier),
      deltaPct: unmatchedDelta
    },
    exceptions: {
      open: Math.floor(exceptionsData.total * Math.min(multiplier, 2)), // Don't scale exceptions too much
      bySeverity: {
        critical: exceptionsData.critical,
        high: exceptionsData.high,
        medium: exceptionsData.medium,
        low: exceptionsData.low
      },
      deltaPct: exceptionsDelta
    },
    settlement: {
      settledTxns: Math.floor(settlementData.settledTxns * multiplier),
      settledAmount: Math.floor(settlementData.settledAmount * multiplier),
      batches: Math.floor(settlementData.batches * multiplier),
      deltaPct: settlementDelta
    },
    progress: {
      capturedTxns: Math.floor(progressData.captured.count * multiplier),
      inSettlementTxns: Math.floor(progressData.inSettlement.count * multiplier),
      settledToBankTxns: Math.floor(progressData.settledToBank.count * multiplier),
      unsettledTxns: Math.floor(progressData.unsettled.count * multiplier)
    }
  };
  
  return snapshot;
}

// Update functions to be called when recon jobs complete
export function updateReconResults(matched: number, total: number, unmatchedAmount: number) {
  reconResults = { matched, total, unmatchedAmount };
  overviewBus.emit('metrics.updated');
  // Also emit a custom event for ops snapshot refresh
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ops:snapshot:refresh'));
  }
}

export function updateExceptions(total: number, critical: number, high: number) {
  exceptionsData = { 
    total, 
    critical, 
    high,
    medium: Math.floor(total * 0.3),
    low: Math.floor(total * 0.2)
  };
  overviewBus.emit('exceptions.updated', exceptionsData);
  // Also trigger snapshot refresh
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ops:snapshot:refresh'));
  }
}

export function updateSettlements(settledTxns: number, settledAmount: number, batches: number) {
  settlementData = { settledTxns, settledAmount, batches };
  overviewBus.emit('metrics.updated');
  // Also trigger snapshot refresh
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ops:snapshot:refresh'));
  }
}

export function updateProgress(data: typeof progressData) {
  // Ensure funnel integrity and unsettled calculation
  const correctedData = {
    ...data,
    // Ensure funnel: inSettlement >= sentToBank >= credited
    inSettlement: {
      count: Math.max(data.inSettlement.count, data.sentToBank.count),
      amount: Math.max(data.inSettlement.amount, data.sentToBank.amount)
    },
    sentToBank: {
      count: Math.max(data.sentToBank.count, data.credited.count),
      amount: Math.max(data.sentToBank.amount, data.credited.amount)
    },
    // Unsettled is always captured - credited
    unsettled: {
      count: Math.max(0, data.captured.count - data.credited.count),
      amount: Math.max(0, data.captured.amount - data.credited.amount)
    }
  };
  progressData = correctedData;
  overviewBus.emit('metrics.updated');
}

// Function to compute settlement progress with 5 segments
export async function computeSettlementProgress(
  rangeStart: string,
  rangeEnd: string
): Promise<import('../types/settlementProgress').SettlementProgressData> {
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  const windowDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  // Use same multiplier logic as computeOpsSnapshot for consistency
  const multiplier = windowDays <= 1 ? 0.3 : windowDays <= 7 ? 1 : windowDays <= 30 ? 2.5 : 4;
  
  // Calculate counts ensuring they make sense (each stage is subset of previous)
  const captured = Math.floor(progressData.captured.count * multiplier);
  const inSettlement = Math.floor(progressData.inSettlement.count * multiplier);
  const sentToBank = Math.floor(progressData.sentToBank.count * multiplier);
  const credited = Math.floor(progressData.credited.count * multiplier);
  const unsettled = Math.max(0, captured - credited); // Never negative
  
  return {
    captured_count: captured,
    in_settlement_count: inSettlement,
    sent_to_bank_count: sentToBank,
    credited_count: credited,
    unsettled_count: unsettled,
    window: {
      from: rangeStart,
      to: rangeEnd
    },
    // Legacy keys for backward compatibility
    capturedTxns: captured,
    inSettlementTxns: inSettlement,
    settledToBankTxns: credited,
    unsettledTxns: unsettled
  };
}

// Demo mode: simulate small changes every 45 seconds
if (import.meta.env.MODE !== 'production') {
  setInterval(() => {
    // Simulate small random changes
    const matchedChange = Math.floor(Math.random() * 10) - 5;
    const totalChange = Math.floor(Math.random() * 5);
    
    // Update total first
    reconResults.total = Math.max(1, reconResults.total + totalChange);
    
    // Update matched, ensuring it never exceeds total
    reconResults.matched = Math.max(0, Math.min(
      reconResults.total,
      reconResults.matched + matchedChange
    ));
    
    exceptionsData.total = Math.max(0, exceptionsData.total + Math.floor(Math.random() * 3) - 1);
    exceptionsData.critical = Math.max(0, exceptionsData.critical + Math.floor(Math.random() * 2) - 1);
    settlementsToday = Math.max(0, settlementsToday + Math.floor(Math.random() * 100000000) - 50000000);
    
    overviewBus.emit('metrics.updated');
  }, 45000);
  
  // Heartbeat every 20 seconds
  setInterval(() => {
    overviewBus.emit('heartbeat', { asOf: new Date().toISOString() });
  }, 20000);
}