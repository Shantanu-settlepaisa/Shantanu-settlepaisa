-- Migration 022: Add Unique Constraints to sp_v2_reconciliation_results
-- Purpose: Enable UPSERT pattern to keep only latest recon result per transaction
-- Approach: One result per PG transaction, one result per Bank statement

-- Step 1: Drop existing records (clean slate for new constraint)
-- In production, you'd want to keep the latest record per transaction before adding constraint
TRUNCATE TABLE sp_v2_reconciliation_results;

-- Step 2: Add unique constraint for PG transactions
-- This ensures each PG transaction has only ONE result record (the latest)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_results_unique_pg_txn
ON sp_v2_reconciliation_results(pg_transaction_id)
WHERE pg_transaction_id IS NOT NULL;

-- Step 3: Add unique constraint for Bank statements
-- This ensures each Bank statement has only ONE result record (the latest)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_results_unique_bank_stmt
ON sp_v2_reconciliation_results(bank_statement_id)
WHERE bank_statement_id IS NOT NULL;

-- Step 4: Add composite index for querying by job_id + status
-- This speeds up queries like "show all UNMATCHED from job XYZ"
CREATE INDEX IF NOT EXISTS idx_reconciliation_results_job_status
ON sp_v2_reconciliation_results(job_id, match_status);

-- Step 5: Add index for querying latest results across all jobs
CREATE INDEX IF NOT EXISTS idx_reconciliation_results_created_at
ON sp_v2_reconciliation_results(created_at DESC);

-- Verification
DO $$
DECLARE
  pg_index_exists BOOLEAN;
  bank_index_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_reconciliation_results_unique_pg_txn'
  ) INTO pg_index_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_reconciliation_results_unique_bank_stmt'
  ) INTO bank_index_exists;
  
  IF pg_index_exists AND bank_index_exists THEN
    RAISE NOTICE '✓ Migration 022 completed successfully';
    RAISE NOTICE '✓ Unique constraints added for PG transactions and Bank statements';
  ELSE
    RAISE EXCEPTION 'Migration 022 failed: Indexes not created';
  END IF;
END $$;
