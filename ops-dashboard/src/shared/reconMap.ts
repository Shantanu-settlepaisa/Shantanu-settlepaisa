// Shared reconciliation mapping utilities to prevent drift between Overview and Workspace

export type UiStatus = 'matched' | 'unmatched_pg' | 'unmatched_bank' | 'exception';

export function toUiStatus(db: string): UiStatus {
  const mapping: Record<string, UiStatus> = {
    'MATCHED': 'matched',
    'UNMATCHED_PG': 'unmatched_pg', 
    'UNMATCHED_BANK': 'unmatched_bank',
    'EXCEPTION': 'exception'
  };
  return mapping[db.toUpperCase()] || 'exception';
}

export function toDbStatus(uiStatus: UiStatus): string {
  const mapping: Record<UiStatus, string> = {
    'matched': 'MATCHED',
    'unmatched_pg': 'UNMATCHED_PG',
    'unmatched_bank': 'UNMATCHED_BANK',
    'exception': 'EXCEPTION'
  };
  return mapping[uiStatus];
}

export function getStatusLabel(status: UiStatus): string {
  const labels: Record<UiStatus, string> = {
    'matched': 'Matched',
    'unmatched_pg': 'Unmatched PG',
    'unmatched_bank': 'Unmatched Bank',
    'exception': 'Exception'
  };
  return labels[status];
}

export function getStatusColor(status: UiStatus): string {
  const colors: Record<UiStatus, string> = {
    'matched': 'text-green-600',
    'unmatched_pg': 'text-amber-600',
    'unmatched_bank': 'text-orange-600',
    'exception': 'text-red-600'
  };
  return colors[status];
}

export function sumCounts(...xs: { count?: number }[]): number {
  return xs.reduce((a, x) => a + (x?.count || 0), 0);
}

export function sumAmounts(a?: { amountPaise: string }, b?: { amountPaise: string }): string {
  const amountA = BigInt(a?.amountPaise || '0');
  const amountB = BigInt(b?.amountPaise || '0');
  return (amountA + amountB).toString();
}

export function formatINR(paise: string | number | bigint): string {
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

// Job Summary Types
export interface JobSummary {
  jobId: string;
  sourceType: 'manual' | 'connector';
  totals: { count: number; amountPaise: string };
  breakdown: {
    matched: { count: number; amountPaise: string };
    unmatchedPg: { count: number; amountPaise: string };
    unmatchedBank: { count: number; amountPaise: string };
    exceptions: { count: number; amountPaise: string };
  };
  byExceptionReason: Array<{
    reasonCode: string;
    reasonLabel: string;
    count: number;
  }>;
  finalized: boolean;
}

export interface JobResult {
  id: string;
  jobId: string;
  txnId: string;
  utr: string;
  rrn?: string;
  pgAmountPaise: string;
  bankAmountPaise?: string;
  deltaPaise?: string;
  pgDate: string;
  bankDate?: string;
  status: DbStatus;
  reasonCode?: string;
  reasonLabel?: string;
}

export interface SourceSummary {
  sourceType: 'connector' | 'manual';
  totals: { count: number; amountPaise: string };
  breakdown: {
    matched: { count: number; amountPaise: string };
    unmatchedPg: { count: number; amountPaise: string };
    unmatchedBank: { count: number; amountPaise: string };
    exceptions: { count: number; amountPaise: string };
  };
}