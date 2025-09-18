export type ReconRule = {
  id: string;
  name: string;
  scope: { merchantId?: string; acquirer?: string; mode?: string } | null; // null = global
  match_chain: string[]; // e.g. ["UTR","TXNID_AMOUNT_±100","RRN_DATE_±1d"]
  tolerances?: { 
    amount_paise?: number; 
    amount_pct?: number; 
    date_days?: number;
  };
  exceptions?: Array<{ 
    when: string; 
    reason: string; 
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  }>;
  dedupe?: { 
    key: "UTR" | "RRN" | "TXNID"; 
    window_hours: number; 
    strategy: "first-write-wins" | "latest";
  };
  auto_actions?: Array<{ 
    when: string; 
    action: "AUTO_CLOSE" | "TAG" | "ROUTE_QUEUE";
  }>;
  status: "draft" | "canary" | "live" | "archived";
  version: number;
  updatedAt: string;
  updatedBy?: string;
};

export type SimulationResult = {
  window: { from: string; to: string };
  baseline: {
    matched: number;
    unmatched: number;
    exceptions: number;
    reconciledPaise: string;
  };
  proposed: {
    matched: number;
    unmatched: number;
    exceptions: number;
    reconciledPaise: string;
  };
  delta: {
    matched: number;
    unmatched: number;
    exceptions: number;
    reconciledPaise: string;
  };
};