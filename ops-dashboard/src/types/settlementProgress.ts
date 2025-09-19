export interface SettlementProgressData {
  captured_count: number;
  in_settlement_count: number;
  sent_to_bank_count: number;
  credited_count: number;
  unsettled_count: number;
  window?: {
    from: string;
    to: string;
  };
  // Legacy keys for backward compatibility
  capturedTxns?: number;
  inSettlementTxns?: number;
  settledToBankTxns?: number;
  unsettledTxns?: number;
}

export interface SettlementProgressSegment {
  label: string;
  value: number;
  color: string;
  tooltip?: string;
}

export type MerchantSettlementStatus = 'Processing' | 'Settled' | 'Failed';

export type InternalSettlementStatus = 
  | 'initiated'
  | 'processing' 
  | 'processed'
  | 'sent_to_bank'
  | 'credited'
  | 'failed'
  | 'rejected'
  | 'cancelled';