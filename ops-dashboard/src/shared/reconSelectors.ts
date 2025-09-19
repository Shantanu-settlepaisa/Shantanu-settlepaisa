// Shared selectors for reconciliation data consistency

export type ReconStatus = 'MATCHED' | 'UNMATCHED_PG' | 'UNMATCHED_BANK' | 'EXCEPTION';

export function toUiStatus(key: ReconStatus): string {
  const mapping: Record<ReconStatus, string> = {
    'MATCHED': 'Matched',
    'UNMATCHED_PG': 'Unmatched PG',
    'UNMATCHED_BANK': 'Unmatched Bank',
    'EXCEPTION': 'Exception'
  };
  return mapping[key] || key;
}

export function toStatusColor(key: ReconStatus): string {
  const mapping: Record<ReconStatus, string> = {
    'MATCHED': 'text-green-600',
    'UNMATCHED_PG': 'text-amber-600',
    'UNMATCHED_BANK': 'text-orange-600',
    'EXCEPTION': 'text-red-600'
  };
  return mapping[key] || 'text-gray-600';
}

export interface StatusBucket {
  count: number;
  amountPaise: string;
}

export interface ReconSummary {
  jobId: string;
  totals: StatusBucket;
  byStatus: {
    matched: StatusBucket;
    unmatchedPg: StatusBucket;
    unmatchedBank: StatusBucket;
    exceptions: StatusBucket;
  };
  byExceptionReason: Array<{
    reasonCode: string;
    reasonLabel: string;
    count: number;
  }>;
}

export function sumStatus(buckets: StatusBucket[]): StatusBucket {
  const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);
  const totalPaise = buckets.reduce((sum, b) => {
    const paise = BigInt(b.amountPaise || '0');
    return sum + paise;
  }, 0n);
  
  return {
    count: totalCount,
    amountPaise: totalPaise.toString()
  };
}

export function getTotalUnmatched(summary: ReconSummary): StatusBucket {
  return sumStatus([
    summary.byStatus.unmatchedPg,
    summary.byStatus.unmatchedBank
  ]);
}

// Format paise to INR for display
export function formatPaiseToINR(paise: string | number | bigint): string {
  try {
    const paiseValue = BigInt(paise);
    const rupees = Number(paiseValue) / 100;
    
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(rupees);
  } catch (error) {
    console.warn('Error formatting currency:', error);
    return '₹0';
  }
}