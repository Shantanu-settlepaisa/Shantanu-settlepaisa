-- Migration 028: Add settlement tracking columns and outstanding debt table
-- Purpose: Track which refunds/chargebacks have been processed in settlements
-- Author: Settlement Calculator Integration
-- Date: 2025-10-22

-- Step 1: Add settlement tracking to chargebacks table
ALTER TABLE sp_v2_chargebacks
ADD COLUMN IF NOT EXISTS is_settlement_processed BOOLEAN DEFAULT FALSE;

-- Step 2: Create index for efficient querying of unprocessed chargebacks
CREATE INDEX IF NOT EXISTS idx_chargebacks_settlement_processing
ON sp_v2_chargebacks(merchant_id, is_settlement_processed, outcome)
WHERE is_settlement_processed = FALSE AND outcome = 'LOST';

-- Step 3: Create outstanding debts tracking table
CREATE TABLE IF NOT EXISTS sp_v2_merchant_outstanding_debts (
  id BIGSERIAL PRIMARY KEY,
  merchant_id VARCHAR(255) NOT NULL,
  debt_amount_paise BIGINT NOT NULL,
  original_batch_id VARCHAR(255),
  original_settlement_date TIMESTAMPTZ,
  reason TEXT,
  details JSONB, -- Store breakdown of what caused the debt
  created_at TIMESTAMPTZ DEFAULT NOW(),
  recovered_at TIMESTAMPTZ,
  recovery_batch_id VARCHAR(255),
  recovery_amount_paise BIGINT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'OUTSTANDING' -- OUTSTANDING, PARTIALLY_RECOVERED, FULLY_RECOVERED
);

-- Step 4: Create index for outstanding debts
CREATE INDEX IF NOT EXISTS idx_outstanding_debts_merchant
ON sp_v2_merchant_outstanding_debts(merchant_id, status)
WHERE status = 'OUTSTANDING';

-- Step 5: Add comments for documentation
COMMENT ON COLUMN sp_v2_chargebacks.is_settlement_processed IS
'Flag indicating if this chargeback has been deducted from a merchant settlement';

COMMENT ON TABLE sp_v2_merchant_outstanding_debts IS
'Tracks negative balances when refunds/chargebacks exceed settlement amount.
Debt is automatically recovered from future settlements.';

COMMENT ON COLUMN sp_v2_merchant_outstanding_debts.details IS
'JSON structure: {
  "refunds": [{"txn_id": "TXN123", "amount": 10000}],
  "chargebacks": [{"txn_id": "TXN456", "amount": 5000}],
  "cycle_sales": 3000
}';

-- Step 6: Add settlement tracking metadata to settlements table
ALTER TABLE sp_v2_settlements
ADD COLUMN IF NOT EXISTS refund_deductions_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS chargeback_deductions_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS outstanding_debt_recovered_paise BIGINT DEFAULT 0;

COMMENT ON COLUMN sp_v2_settlements.refund_deductions_paise IS
'Total refund amount deducted from this settlement batch';

COMMENT ON COLUMN sp_v2_settlements.chargeback_deductions_paise IS
'Total chargeback amount deducted from this settlement batch';

COMMENT ON COLUMN sp_v2_settlements.outstanding_debt_recovered_paise IS
'Amount recovered from previous outstanding debts in this settlement';

-- Migration complete
SELECT 'Migration 028 completed successfully' AS status;
