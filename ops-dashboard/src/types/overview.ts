export type OverviewSnapshot = {
  asOf: string;              // ISO timestamp
  window: 'day' | '7d' | '30d';
  windowStart: string;       // ISO timestamp for window start
  windowEnd: string;         // ISO timestamp for window end
  compareWindow?: {          // Previous comparable window for trends
    start: string;
    end: string;
  };
  reconciliation: {
    matchedPct: number;      // matched / total * 100
    matchedCount: number;
    totalCount: number;
    trend?: { value: number; direction: 'up' | 'down' | 'neutral' };
  };
  unmatched: {
    value: number;           // in smallest currency unit (paise)
    count: number;
    trend?: { value: number; direction: 'up' | 'down' | 'neutral' };
  };
  exceptions: {
    openCount: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    trend?: { value: number; direction: 'up' | 'down' | 'neutral' };
  };
  settlementValue: {
    amount: number;          // in paise
    count: number;
    trend?: { value: number; direction: 'up' | 'down' | 'neutral' };
  };
  progress: {                // counts + amounts for progress bar
    captured: { count: number; amount: number };
    inSettlement: { count: number; amount: number };
    settledToBank: { count: number; amount: number };
    unsettled: { count: number; amount: number };
  };
};

export type LiveEvent =
  | { type: 'metrics.updated'; payload: OverviewSnapshot }
  | { type: 'exceptions.updated'; payload: { total: number; critical: number; high: number } }
  | { type: 'heartbeat'; payload: { asOf: string } };