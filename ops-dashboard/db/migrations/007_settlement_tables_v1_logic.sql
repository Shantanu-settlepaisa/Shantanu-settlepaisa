-- Settlement tables for V2 with V1 logic compatibility
-- Generated: 2025-10-01

-- Settlement batches table
CREATE TABLE IF NOT EXISTS sp_v2_settlement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL,
  merchant_name VARCHAR(200),
  cycle_date DATE NOT NULL,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  gross_amount_paise BIGINT NOT NULL DEFAULT 0,
  total_commission_paise BIGINT NOT NULL DEFAULT 0,
  total_gst_paise BIGINT NOT NULL DEFAULT 0,
  total_reserve_paise BIGINT NOT NULL DEFAULT 0,
  net_amount_paise BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) DEFAULT 'PENDING_APPROVAL',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  approved_by VARCHAR(100),
  settlement_completed_at TIMESTAMP,
  bank_reference_number VARCHAR(100),
  remarks TEXT
);

-- Settlement items table (individual transaction breakdowns)
CREATE TABLE IF NOT EXISTS sp_v2_settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_batch_id UUID NOT NULL REFERENCES sp_v2_settlement_batches(id) ON DELETE CASCADE,
  transaction_id VARCHAR(100) NOT NULL,
  amount_paise BIGINT NOT NULL,
  commission_paise BIGINT DEFAULT 0,
  gst_paise BIGINT DEFAULT 0,
  reserve_paise BIGINT DEFAULT 0,
  net_paise BIGINT NOT NULL,
  payment_mode VARCHAR(50),
  fee_bearer VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_settlement_batches_merchant ON sp_v2_settlement_batches(merchant_id);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_cycle_date ON sp_v2_settlement_batches(cycle_date);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON sp_v2_settlement_batches(status);
CREATE INDEX IF NOT EXISTS idx_settlement_items_batch ON sp_v2_settlement_items(settlement_batch_id);
CREATE INDEX IF NOT EXISTS idx_settlement_items_transaction ON sp_v2_settlement_items(transaction_id);

-- Commission tiers table (for future volume-based pricing)
CREATE TABLE IF NOT EXISTS sp_v2_commission_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name VARCHAR(50) NOT NULL,
  min_volume_paise BIGINT NOT NULL,
  max_volume_paise BIGINT,
  commission_percentage DECIMAL(5,3) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Rolling reserve ledger (track reserve hold and release)
CREATE TABLE IF NOT EXISTS sp_v2_rolling_reserve_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  merchant_id VARCHAR(50) NOT NULL,
  reserve_amount_paise BIGINT NOT NULL,
  hold_date DATE NOT NULL,
  release_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'HELD',
  released_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rolling_reserve_merchant ON sp_v2_rolling_reserve_ledger(merchant_id);
CREATE INDEX IF NOT EXISTS idx_rolling_reserve_release_date ON sp_v2_rolling_reserve_ledger(release_date, status);

-- Settlement bank transfers table (track actual payouts)
CREATE TABLE IF NOT EXISTS sp_v2_settlement_bank_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_batch_id UUID NOT NULL REFERENCES sp_v2_settlement_batches(id),
  merchant_id VARCHAR(50) NOT NULL,
  amount_paise BIGINT NOT NULL,
  bank_account_number VARCHAR(30),
  ifsc_code VARCHAR(11),
  transfer_mode VARCHAR(20),
  utr_number VARCHAR(50),
  transfer_date DATE,
  status VARCHAR(20) DEFAULT 'PENDING',
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_transfers_batch ON sp_v2_settlement_bank_transfers(settlement_batch_id);
CREATE INDEX IF NOT EXISTS idx_bank_transfers_merchant ON sp_v2_settlement_bank_transfers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_bank_transfers_status ON sp_v2_settlement_bank_transfers(status);

COMMENT ON TABLE sp_v2_settlement_batches IS 'Settlement batches calculated using V1 logic';
COMMENT ON TABLE sp_v2_settlement_items IS 'Individual transaction-level settlement breakdowns';
COMMENT ON TABLE sp_v2_rolling_reserve_ledger IS 'Rolling reserve hold and release tracking';
COMMENT ON TABLE sp_v2_settlement_bank_transfers IS 'Actual bank transfer/payout records';
