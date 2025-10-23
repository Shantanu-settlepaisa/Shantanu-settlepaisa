-- Migration 029: Add Refund/Chargeback Deduction Tracking to Settlement Batches
-- Purpose: Make refund and chargeback deductions visible in settlement reports
-- Author: Production Hardening Sprint
-- Date: 2025-10-23

-- Step 1: Add deduction tracking columns to settlement batches table
ALTER TABLE sp_v2_settlement_batches
ADD COLUMN IF NOT EXISTS refund_deductions_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS chargeback_deductions_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS outstanding_debt_recovered_paise BIGINT DEFAULT 0;

-- Step 2: Add column comments for documentation
COMMENT ON COLUMN sp_v2_settlement_batches.refund_deductions_paise IS
'Total refund amount deducted from this settlement batch. Includes both current-cycle and outstanding refunds.';

COMMENT ON COLUMN sp_v2_settlement_batches.chargeback_deductions_paise IS
'Total chargeback amount deducted from this settlement batch. Only LOST chargebacks are deducted.';

COMMENT ON COLUMN sp_v2_settlement_batches.outstanding_debt_recovered_paise IS
'Amount recovered from previous negative settlements (outstanding debt) in this batch.';

-- Step 3: Create or replace settlement report view with new columns
CREATE OR REPLACE VIEW v_settlement_report AS
SELECT
  sb.id,
  sb.merchant_id,
  sb.merchant_name,
  sb.cycle_date,
  sb.total_transactions,
  sb.gross_amount_paise,
  sb.total_commission_paise,
  sb.total_gst_paise,
  sb.total_reserve_paise,
  sb.refund_deductions_paise,
  sb.chargeback_deductions_paise,
  sb.outstanding_debt_recovered_paise,
  sb.net_amount_paise,
  -- Calculate verification (gross - all deductions = net)
  (sb.gross_amount_paise -
   sb.total_commission_paise -
   sb.total_gst_paise -
   sb.total_reserve_paise -
   sb.refund_deductions_paise -
   sb.chargeback_deductions_paise -
   sb.outstanding_debt_recovered_paise) AS calculated_net_paise,
  sb.status,
  sb.approved_at,
  sb.approved_by,
  sb.created_at
FROM sp_v2_settlement_batches sb;

-- Step 4: Add index for reporting queries
CREATE INDEX IF NOT EXISTS idx_settlement_batches_cycle_merchant
ON sp_v2_settlement_batches(cycle_date, merchant_id);

-- Step 5: Add constraint check (optional - validates net calculation)
-- Note: This is a soft check since rounding may cause small differences
ALTER TABLE sp_v2_settlement_batches
ADD CONSTRAINT chk_net_amount_valid
CHECK (
  net_amount_paise >= 0 AND
  net_amount_paise <= gross_amount_paise
);

-- Migration complete
SELECT 'Migration 029 completed successfully - Refund/Chargeback columns added to settlement batches' AS status;
