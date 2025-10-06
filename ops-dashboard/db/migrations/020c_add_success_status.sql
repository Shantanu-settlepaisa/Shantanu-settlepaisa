-- Migration 020c: Add SUCCESS status to sp_v2_transactions
-- Purpose: Allow webhook SUCCESS status (v1 uses SUCCESS, v2 uses RECONCILED)
-- Impact: Enables mapping v1 SUCCESS → v2 SUCCESS

-- Step 1: Drop old status constraint
ALTER TABLE sp_v2_transactions 
DROP CONSTRAINT IF EXISTS sp_v2_transactions_status_check;

-- Step 2: Add new constraint with SUCCESS included
ALTER TABLE sp_v2_transactions
ADD CONSTRAINT sp_v2_transactions_status_check
CHECK (status IN ('PENDING', 'RECONCILED', 'EXCEPTION', 'FAILED', 'UNMATCHED', 'SUCCESS'));

-- Verification
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sp_v2_transactions_status_check'
    AND pg_get_constraintdef(oid) LIKE '%SUCCESS%'
  ) THEN
    RAISE NOTICE '✅ SUCCESS status enabled in sp_v2_transactions';
  ELSE
    RAISE EXCEPTION 'Failed to add SUCCESS to status constraint';
  END IF;
END $$;

-- Note: This allows both status schemes:
-- - v1 webhook: SUCCESS/FAILED
-- - v2 recon: PENDING/RECONCILED/EXCEPTION/UNMATCHED
-- Settlement calculator can handle both
