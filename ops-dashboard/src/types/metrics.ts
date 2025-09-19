/**
 * OPS-OVR-CHARTS-001: Unified metrics types for consistent data contracts
 */

export type Window = { 
  from: string; 
  to: string; 
  label: string;
};

export type MetricMode = 'count' | 'amount';

export type OverviewResponse = {
  window: Window;
  recon: { 
    matchRatePct: number; 
    matchedCount: number; 
    totalCount: number;
  };
  unmatched: { 
    count: number; 
    amount: number;
  };
  openExceptions: { 
    count: number;
    amount: number;
  };
  creditedToMerchant: { 
    amount: number; 
    txnCount: number; 
    batchCount: number;
  };
  backlogDays: number | null;
};

export type AgeingBucket = "0-24h" | "24-48h" | "2-7d" | ">7d";

export type AgeingResponse = {
  openTotal: { 
    count: number; 
    amount: number;
  };
  buckets: Array<{
    bucket: AgeingBucket;
    total: { 
      count: number; 
      amount: number;
    };
    reasons: Array<{ 
      code: string; 
      label: string; 
      count: number; 
      amount: number; 
      percentOpen: number;
    }>;
  }>;
};

export type BurndownPoint = { 
  date: string; 
  open: number; 
  new: number; 
  resolved: number;
};

export type BurndownResponse = {
  series: BurndownPoint[];
  openTotal: number;
  resolved7dAvg: number;
  targetReductionRate: number;
};

export type TopReason = { 
  code: string; 
  label: string; 
  count: number; 
  amount: number; 
  percentOpen: number;
};

export type ExceptionStatus = 
  | 'open' 
  | 'assigned' 
  | 'investigating' 
  | 'escalated'
  | 'resolved'
  | 'closed'
  | 'canceled';

export const OPEN_EXCEPTION_STATUSES: ExceptionStatus[] = [
  'open', 
  'assigned', 
  'investigating', 
  'escalated'
];

export interface ExceptionFilters {
  from?: string;
  to?: string;
  reasonCode?: string;
  ageMinHours?: number;
  ageMaxHours?: number;
  createdDate?: string;
  resolvedDate?: string;
  openOnDate?: string;
  source?: 'manual' | 'connector';
  status?: ExceptionStatus | ExceptionStatus[];
}