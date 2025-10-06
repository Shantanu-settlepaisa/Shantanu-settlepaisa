-- Migration 020b: Add WEBHOOK to source_type constraint
-- Purpose: Allow webhook transactions in sp_v2_transactions
-- Impact: Removes constraint blocking webhook migration

-- Step 1: Drop old constraint
ALTER TABLE sp_v2_transactions 
DROP CONSTRAINT IF EXISTS sp_v2_transactions_source_type_check;

-- Step 2: Add new constraint with WEBHOOK included
ALTER TABLE sp_v2_transactions
ADD CONSTRAINT sp_v2_transactions_source_type_check
CHECK (source_type IN ('MANUAL_UPLOAD', 'CONNECTOR', 'API_SYNC', 'WEBHOOK'));

-- Verification
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sp_v2_transactions_source_type_check'
    AND pg_get_constraintdef(oid) LIKE '%WEBHOOK%'
  ) THEN
    RAISE NOTICE '✅ WEBHOOK source_type enabled';
  ELSE
    RAISE EXCEPTION 'Failed to add WEBHOOK to source_type constraint';
  END IF;
END $$;
