-- Migration 035: Add acquirer_code column to sp_v2_transactions
-- Date: November 3, 2025
-- Purpose: Fix Settlement Transactions report 500 errors
--
-- Context:
-- - Staging 2 has this column and Settlement Transactions API works
-- - Production missing this column causes SQL error: "column t.acquirer_code does not exist"
-- - V1 to V2 mapping: pg_pay_mode → acquirer_code
-- - Values: HDFC, AXIS, ICICI, SBI, etc.

-- Add acquirer_code column
ALTER TABLE sp_v2_transactions
ADD COLUMN IF NOT EXISTS acquirer_code VARCHAR(50);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_acquirer_code
ON sp_v2_transactions(acquirer_code)
WHERE acquirer_code IS NOT NULL;

-- Add documentation
COMMENT ON COLUMN sp_v2_transactions.acquirer_code IS
'Bank/acquirer code (HDFC/AXIS/ICICI/SBI/etc) - mapped from V1 pg_pay_mode field. Used for commission rate lookups and reporting.';

-- Verify column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sp_v2_transactions'
    AND column_name = 'acquirer_code'
  ) THEN
    RAISE NOTICE '✅ Column acquirer_code added successfully to sp_v2_transactions';
  ELSE
    RAISE EXCEPTION '❌ Failed to add acquirer_code column';
  END IF;
END $$;
