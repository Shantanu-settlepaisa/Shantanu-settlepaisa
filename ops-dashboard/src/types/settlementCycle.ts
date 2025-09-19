export type ISODate = string; // '2025-09-14'
export type ISODateTime = string; // '2025-09-14T14:00:00Z'

export interface CycleWindow {
  label: 'previous' | 'current' | 'next';
  captureStart: ISODateTime;   // start of capture window (UTC)
  captureEnd: ISODateTime;     // end/cutoff (UTC) for auto-settlement
  cutoffLocal: string;         // '02:00 PM IST'
  tz: string;                  // 'Asia/Kolkata'
  nettingRule: 'T+0' | 'T+1' | 'T+2' | 'WEEKLY' | 'CUSTOM';
  autoSettlementAt: ISODateTime; // usually same as captureEnd; explicit
  payoutLagDays: number;       // days from auto settlement to payout file
  bankCreditETA: ISODateTime;  // expected bank credit ETA (UTC)
}

export interface SettlementCycle {
  merchantId: string;
  acquirer?: string; // optional scoping
  windows: {
    previous: CycleWindow;
    current: CycleWindow;
    next: CycleWindow;
  };
  slaHours: number; // ops SLA for recon/credit
  definition: string; // free text, e.g. 'T+1; 2pm IST cutoff; credit next biz day'
}