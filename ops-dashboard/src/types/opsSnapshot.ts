export type OpsSnapshot = {
  windowStart: string;
  windowEnd: string;
  compareWindow: 'prev_period';
  recon: {
    totalTxns: number;
    matchedTxns: number;
    matchedPct: number;
    deltaPct: number;
  };
  unmatched: {
    txnCount: number;
    value: number;      // in paise
    deltaPct: number;
  };
  exceptions: {
    open: number;
    bySeverity: Record<string, number>;
    deltaPct: number;
  };
  settlement: {
    settledTxns: number;
    settledAmount: number; // in paise
    batches: number;
    deltaPct: number;
  };
  progress: {
    capturedTxns: number;
    inSettlementTxns: number;
    settledToBankTxns: number;
    unsettledTxns: number;
  };
};