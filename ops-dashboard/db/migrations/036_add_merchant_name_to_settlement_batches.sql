-- Migration 036: Add merchant_name column to sp_v2_settlement_batches
-- Date: November 3, 2025
-- Purpose: Fix Settlement Transactions report - second missing column
--
-- Context:
-- - After adding acquirer_code to transactions, discovered merchant_name missing
-- - Staging 2 has this column and Settlement Transactions API returns merchant_name
-- - Production only has merchant_id, not merchant_name

-- Add merchant_name column
ALTER TABLE sp_v2_settlement_batches
ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(255);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_settlement_batches_merchant_name
ON sp_v2_settlement_batches(merchant_name)
WHERE merchant_name IS NOT NULL;

-- Add documentation
COMMENT ON COLUMN sp_v2_settlement_batches.merchant_name IS
'Merchant business name - denormalized from merchant_id for reporting performance';

-- Verify column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sp_v2_settlement_batches'
    AND column_name = 'merchant_name'
  ) THEN
    RAISE NOTICE '✅ Column merchant_name added successfully to sp_v2_settlement_batches';
  ELSE
    RAISE EXCEPTION '❌ Failed to add merchant_name column';
  END IF;
END $$;
