-- Migration 024: Add Verification Wiring and Settlement Automation
-- Date: 2025-10-07
-- Purpose: Fix all gaps identified in GAPS_AND_IMPROVEMENTS.md
--   1. Add payout verification fields
--   2. Create settlement queue for auto-settlement
--   3. Add triggers for automatic status transitions
--   4. Create reserve ledger and commission audit tables
--   5. Add bank statement reconciliation tables

BEGIN;

-- ============================================================================
-- PART 1: ENHANCE BANK TRANSFERS TABLE WITH VERIFICATION FIELDS
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 1: Enhancing sp_v2_settlement_bank_transfers...';
END $$;

-- Add verification columns
ALTER TABLE sp_v2_settlement_bank_transfers
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS verification_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS webhook_confirmed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS webhook_confirmation_data JSONB,
  ADD COLUMN IF NOT EXISTS bank_statement_matched BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_statement_matched_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS bank_statement_entry_id UUID,
  ADD COLUMN IF NOT EXISTS status_polled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS status_poll_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_confirmed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS merchant_confirmed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS merchant_confirmation_proof TEXT;

-- Add timing columns
ALTER TABLE sp_v2_settlement_bank_transfers
  ADD COLUMN IF NOT EXISTS initiated_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP;

-- Add error handling columns
ALTER TABLE sp_v2_settlement_bank_transfers
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS failure_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Create indexes for verification queries
CREATE INDEX IF NOT EXISTS idx_bank_transfers_verification 
  ON sp_v2_settlement_bank_transfers(verification_status) 
  WHERE verification_status != 'FULLY_VERIFIED';

CREATE INDEX IF NOT EXISTS idx_bank_transfers_utr 
  ON sp_v2_settlement_bank_transfers(utr_number) 
  WHERE utr_number IS NOT NULL;

DO $$ 
BEGIN
  RAISE NOTICE '✅ Enhanced bank transfers table with verification fields';
END $$;

-- ============================================================================
-- PART 2: ENHANCE BANK TRANSFER QUEUE
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 2: Enhancing sp_v2_bank_transfer_queue...';
END $$;

ALTER TABLE sp_v2_bank_transfer_queue
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS processor_instance_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_transfer_id UUID,
  ADD COLUMN IF NOT EXISTS utr_number TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Add FK constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_queue_bank_transfer'
  ) THEN
    ALTER TABLE sp_v2_bank_transfer_queue
      ADD CONSTRAINT fk_queue_bank_transfer 
      FOREIGN KEY (bank_transfer_id) 
      REFERENCES sp_v2_settlement_bank_transfers(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_queue_processing 
  ON sp_v2_bank_transfer_queue(processing_started_at) 
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_queue_retry 
  ON sp_v2_bank_transfer_queue(next_retry_at) 
  WHERE status = 'retry_scheduled';

DO $$ 
BEGIN
  RAISE NOTICE '✅ Enhanced bank transfer queue';
END $$;

-- ============================================================================
-- PART 3: CREATE BANK STATEMENT ENTRIES TABLE
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 3: Creating sp_v2_bank_statement_entries...';
END $$;

CREATE TABLE IF NOT EXISTS sp_v2_bank_statement_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Bank account
  bank_account_number VARCHAR(50) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  
  -- Statement details
  statement_date DATE NOT NULL,
  value_date DATE NOT NULL,
  transaction_date DATE NOT NULL,
  
  -- Transaction details
  transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('DEBIT', 'CREDIT')),
  amount_paise BIGINT NOT NULL,
  balance_after_paise BIGINT,
  
  -- Bank references
  utr TEXT,
  bank_reference TEXT,
  cheque_number TEXT,
  
  -- Description
  description TEXT,
  remarks TEXT,
  
  -- Reconciliation
  reconciled BOOLEAN DEFAULT false,
  reconciled_at TIMESTAMP,
  reconciled_with_transfer_id UUID REFERENCES sp_v2_settlement_bank_transfers(id),
  reconciliation_method VARCHAR(30),
  
  -- Import tracking
  imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  import_source VARCHAR(50),
  import_batch_id UUID,
  
  -- Raw data
  raw_statement_data JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_utr 
  ON sp_v2_bank_statement_entries(utr) 
  WHERE utr IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_statement_date 
  ON sp_v2_bank_statement_entries(statement_date DESC);

CREATE INDEX IF NOT EXISTS idx_bank_statement_reconciled 
  ON sp_v2_bank_statement_entries(reconciled) 
  WHERE reconciled = false;

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statement_unique 
  ON sp_v2_bank_statement_entries(bank_account_number, transaction_date, utr, amount_paise) 
  WHERE utr IS NOT NULL;

DO $$ 
BEGIN
  RAISE NOTICE '✅ Created bank statement entries table';
END $$;

-- ============================================================================
-- PART 4: CREATE PAYOUT VERIFICATION LOG
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 4: Creating sp_v2_payout_verification_log...';
END $$;

CREATE TABLE IF NOT EXISTS sp_v2_payout_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  bank_transfer_id UUID NOT NULL REFERENCES sp_v2_settlement_bank_transfers(id),
  utr_number TEXT NOT NULL,
  
  -- Verification attempt
  verification_method VARCHAR(50) NOT NULL,
  verification_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Result
  verification_result VARCHAR(20) NOT NULL,
  
  -- Details
  expected_amount_paise BIGINT,
  actual_amount_paise BIGINT,
  amount_mismatch BOOLEAN,
  
  expected_account VARCHAR(50),
  actual_account VARCHAR(50),
  account_mismatch BOOLEAN,
  
  -- Source data
  source_data JSONB,
  
  -- Notes
  notes TEXT,
  verified_by VARCHAR(100),
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_log_transfer 
  ON sp_v2_payout_verification_log(bank_transfer_id);

CREATE INDEX IF NOT EXISTS idx_verification_log_timestamp 
  ON sp_v2_payout_verification_log(verification_timestamp DESC);

DO $$ 
BEGIN
  RAISE NOTICE '✅ Created payout verification log';
END $$;

-- ============================================================================
-- PART 5: CREATE SETTLEMENT QUEUE TABLE
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 5: Creating sp_v2_settlement_queue...';
END $$;

CREATE TABLE IF NOT EXISTS sp_v2_settlement_queue (
  id BIGSERIAL PRIMARY KEY,
  transaction_id VARCHAR(100) UNIQUE NOT NULL,
  merchant_id VARCHAR(50) NOT NULL,
  amount_paise BIGINT NOT NULL,
  queued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  priority VARCHAR(20) DEFAULT 'NORMAL',
  status VARCHAR(20) DEFAULT 'PENDING',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_queue_status 
  ON sp_v2_settlement_queue(status, queued_at);

CREATE INDEX IF NOT EXISTS idx_settlement_queue_merchant 
  ON sp_v2_settlement_queue(merchant_id, status);

DO $$ 
BEGIN
  RAISE NOTICE '✅ Created settlement queue table';
END $$;

-- ============================================================================
-- PART 6: CREATE RESERVE LEDGER TABLE
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 6: Creating sp_v2_merchant_reserve_ledger...';
END $$;

CREATE TABLE IF NOT EXISTS sp_v2_merchant_reserve_ledger (
  id BIGSERIAL PRIMARY KEY,
  merchant_id VARCHAR(50) NOT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('HOLD', 'RELEASE', 'ADJUSTMENT')),
  amount_paise BIGINT NOT NULL,
  balance_paise BIGINT NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reserve_ledger_merchant 
  ON sp_v2_merchant_reserve_ledger(merchant_id, created_at DESC);

-- Create view for current reserve balance
CREATE OR REPLACE VIEW v_merchant_reserve_balance AS
SELECT 
  merchant_id,
  SUM(CASE WHEN transaction_type = 'HOLD' THEN amount_paise ELSE -amount_paise END) as reserve_balance_paise,
  MAX(created_at) as last_updated
FROM sp_v2_merchant_reserve_ledger
GROUP BY merchant_id;

DO $$ 
BEGIN
  RAISE NOTICE '✅ Created reserve ledger table and view';
END $$;

-- ============================================================================
-- PART 7: CREATE COMMISSION AUDIT TABLE
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 7: Creating sp_v2_commission_audit...';
END $$;

CREATE TABLE IF NOT EXISTS sp_v2_commission_audit (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  merchant_id VARCHAR(50) NOT NULL,
  commission_tier VARCHAR(50) NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL,
  volume_30_days_paise BIGINT NOT NULL,
  calculation_date DATE NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_audit_batch 
  ON sp_v2_commission_audit(batch_id);

CREATE INDEX IF NOT EXISTS idx_commission_audit_merchant 
  ON sp_v2_commission_audit(merchant_id, calculation_date);

DO $$ 
BEGIN
  RAISE NOTICE '✅ Created commission audit table';
END $$;

-- ============================================================================
-- PART 8: UPDATE TRANSACTION STATUS ENUM
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 8: Updating transaction status enum...';
END $$;

-- Drop old constraint
ALTER TABLE sp_v2_transactions 
  DROP CONSTRAINT IF EXISTS sp_v2_transactions_status_check;

-- Add new constraint with SETTLED and PAID (includes existing SUCCESS status)
ALTER TABLE sp_v2_transactions
  ADD CONSTRAINT sp_v2_transactions_status_check
  CHECK (status IN (
    'PENDING',
    'SUCCESS',
    'RECONCILED',
    'SETTLED',
    'PAID',
    'EXCEPTION',
    'FAILED',
    'UNMATCHED',
    'REVERSED',
    'CANCELLED'
  ));

DO $$ 
BEGIN
  RAISE NOTICE '✅ Updated transaction status enum';
END $$;

-- ============================================================================
-- PART 9: CREATE TRIGGER FOR AUTO-SETTLEMENT QUEUEING
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 9: Creating auto-settlement trigger...';
END $$;

-- Trigger function
CREATE OR REPLACE FUNCTION fn_transaction_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If newly reconciled, queue for settlement
  IF NEW.status = 'RECONCILED' AND (OLD.status IS NULL OR OLD.status != 'RECONCILED') THEN
    INSERT INTO sp_v2_settlement_queue (
      transaction_id,
      merchant_id,
      amount_paise,
      queued_at,
      priority,
      status
    ) VALUES (
      NEW.transaction_id,
      NEW.merchant_id,
      NEW.amount_paise,
      NOW(),
      'NORMAL',
      'PENDING'
    )
    ON CONFLICT (transaction_id) DO NOTHING;
    
    -- Notify settlement service via pg_notify
    PERFORM pg_notify('settlement_queue', 
      json_build_object(
        'transaction_id', NEW.transaction_id,
        'merchant_id', NEW.merchant_id,
        'amount_paise', NEW.amount_paise
      )::text
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trg_transaction_status_change ON sp_v2_transactions;

-- Create trigger
CREATE TRIGGER trg_transaction_status_change
  AFTER UPDATE OF status ON sp_v2_transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_transaction_status_change();

DO $$ 
BEGIN
  RAISE NOTICE '✅ Created auto-settlement trigger';
END $$;

-- ============================================================================
-- PART 10: CREATE TRIGGER TO UPDATE SETTLEMENT WHEN TRANSFER COMPLETES
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 10: Creating bank transfer completion trigger...';
END $$;

-- Trigger function
CREATE OR REPLACE FUNCTION fn_update_settlement_on_transfer_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
    
    -- Update settlement batch
    UPDATE sp_v2_settlement_batches
    SET 
      status = 'PAID',
      bank_reference_number = NEW.utr_number,
      settled_at = NEW.completed_at,
      updated_at = NOW()
    WHERE id = NEW.settlement_batch_id;
    
    -- Also update queue
    UPDATE sp_v2_bank_transfer_queue
    SET 
      status = 'completed',
      processed_at = NOW(),
      utr_number = NEW.utr_number,
      bank_transfer_id = NEW.id
    WHERE batch_id = NEW.settlement_batch_id;
    
    -- Update transaction status to PAID
    UPDATE sp_v2_transactions
    SET 
      status = 'PAID',
      updated_at = NOW()
    WHERE settlement_batch_id = NEW.settlement_batch_id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trg_update_settlement_on_transfer ON sp_v2_settlement_bank_transfers;

-- Create trigger
CREATE TRIGGER trg_update_settlement_on_transfer
  AFTER UPDATE ON sp_v2_settlement_bank_transfers
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_settlement_on_transfer_complete();

DO $$ 
BEGIN
  RAISE NOTICE '✅ Created bank transfer completion trigger';
END $$;

-- ============================================================================
-- PART 11: CREATE TRIGGER FOR AUTO-MATCHING BANK STATEMENTS
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 11: Creating bank statement auto-match trigger...';
END $$;

-- Trigger function
CREATE OR REPLACE FUNCTION fn_auto_match_bank_statement()
RETURNS TRIGGER AS $$
DECLARE
  matched_transfer_id UUID;
BEGIN
  -- Only match DEBIT entries (money going out)
  IF NEW.transaction_type = 'DEBIT' AND NEW.utr IS NOT NULL THEN
    
    -- Find matching transfer by UTR
    SELECT id INTO matched_transfer_id
    FROM sp_v2_settlement_bank_transfers
    WHERE utr_number = NEW.utr
      AND status = 'COMPLETED'
      AND bank_statement_matched = false
    LIMIT 1;
    
    IF matched_transfer_id IS NOT NULL THEN
      
      -- Update transfer record
      UPDATE sp_v2_settlement_bank_transfers
      SET 
        bank_statement_matched = true,
        bank_statement_matched_at = NOW(),
        bank_statement_entry_id = NEW.id,
        verification_status = 'FULLY_VERIFIED',
        verification_method = 'BANK_STATEMENT'
      WHERE id = matched_transfer_id;
      
      -- Update statement entry
      NEW.reconciled := true;
      NEW.reconciled_at := NOW();
      NEW.reconciled_with_transfer_id := matched_transfer_id;
      NEW.reconciliation_method := 'AUTOMATIC_UTR_MATCH';
      
      -- Log verification
      INSERT INTO sp_v2_payout_verification_log (
        bank_transfer_id,
        utr_number,
        verification_method,
        verification_result,
        expected_amount_paise,
        actual_amount_paise,
        amount_mismatch,
        source_data,
        verified_by
      )
      SELECT 
        matched_transfer_id,
        NEW.utr,
        'BANK_STATEMENT',
        CASE WHEN sbt.amount_paise = NEW.amount_paise THEN 'SUCCESS' ELSE 'MISMATCH' END,
        sbt.amount_paise,
        NEW.amount_paise,
        sbt.amount_paise != NEW.amount_paise,
        NEW.raw_statement_data,
        'SYSTEM'
      FROM sp_v2_settlement_bank_transfers sbt
      WHERE sbt.id = matched_transfer_id;
      
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trg_auto_match_bank_statement ON sp_v2_bank_statement_entries;

-- Create trigger
CREATE TRIGGER trg_auto_match_bank_statement
  BEFORE INSERT ON sp_v2_bank_statement_entries
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_match_bank_statement();

DO $$ 
BEGIN
  RAISE NOTICE '✅ Created bank statement auto-match trigger';
END $$;

-- ============================================================================
-- PART 12: CREATE VIEWS FOR MONITORING
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 12: Creating monitoring views...';
END $$;

-- View: Payout verification status
CREATE OR REPLACE VIEW vw_payout_verification_status AS
SELECT 
  sbt.id as transfer_id,
  sbt.settlement_batch_id,
  sb.merchant_id,
  sbt.amount_paise,
  sbt.utr_number,
  sbt.status as transfer_status,
  sbt.verification_status,
  sbt.verification_method,
  
  -- Verification flags
  sbt.webhook_confirmed_at IS NOT NULL as webhook_confirmed,
  sbt.bank_statement_matched as statement_matched,
  sbt.merchant_confirmed as merchant_confirmed,
  
  -- Timing
  sbt.initiated_at,
  sbt.completed_at,
  sbt.webhook_confirmed_at,
  sbt.bank_statement_matched_at,
  
  -- Time to verify (in minutes)
  EXTRACT(EPOCH FROM (sbt.webhook_confirmed_at - sbt.completed_at)) / 60 as webhook_confirm_minutes,
  EXTRACT(EPOCH FROM (sbt.bank_statement_matched_at - sbt.completed_at)) / 60 as statement_match_minutes,
  
  -- Bank statement link
  bse.id as bank_statement_entry_id,
  bse.statement_date,
  bse.amount_paise as statement_amount,
  
  -- Mismatch detection
  CASE 
    WHEN bse.amount_paise != sbt.amount_paise THEN true 
    ELSE false 
  END as amount_mismatch,
  
  sbt.created_at
FROM sp_v2_settlement_bank_transfers sbt
JOIN sp_v2_settlement_batches sb ON sbt.settlement_batch_id = sb.id
LEFT JOIN sp_v2_bank_statement_entries bse ON sbt.bank_statement_entry_id = bse.id
ORDER BY sbt.created_at DESC;

-- View: Unverified payouts (alerts)
CREATE OR REPLACE VIEW vw_unverified_payouts AS
SELECT 
  sbt.id,
  sbt.utr_number,
  sb.merchant_id,
  sbt.amount_paise,
  sbt.completed_at,
  NOW() - sbt.completed_at as time_since_completion,
  sbt.verification_status,
  
  -- Alert level
  CASE 
    WHEN NOW() - sbt.completed_at > INTERVAL '24 hours' THEN 'CRITICAL'
    WHEN NOW() - sbt.completed_at > INTERVAL '6 hours' THEN 'HIGH'
    WHEN NOW() - sbt.completed_at > INTERVAL '2 hours' THEN 'MEDIUM'
    ELSE 'LOW'
  END as alert_level,
  
  -- Reasons
  ARRAY_REMOVE(ARRAY[
    CASE WHEN sbt.webhook_confirmed_at IS NULL THEN 'NO_WEBHOOK' END,
    CASE WHEN sbt.bank_statement_matched = false THEN 'NO_STATEMENT_MATCH' END,
    CASE WHEN bse.amount_paise != sbt.amount_paise THEN 'AMOUNT_MISMATCH' END
  ], NULL) as verification_issues
  
FROM sp_v2_settlement_bank_transfers sbt
JOIN sp_v2_settlement_batches sb ON sbt.settlement_batch_id = sb.id
LEFT JOIN sp_v2_bank_statement_entries bse ON sbt.bank_statement_entry_id = bse.id
WHERE sbt.status = 'COMPLETED'
  AND sbt.verification_status != 'FULLY_VERIFIED'
  AND sbt.completed_at < NOW() - INTERVAL '1 hour'
ORDER BY sbt.completed_at ASC;

-- View: Daily reconciliation summary
CREATE OR REPLACE VIEW vw_daily_reconciliation_summary AS
SELECT 
  DATE(sbt.completed_at) as payout_date,
  COUNT(*) as total_payouts,
  SUM(sbt.amount_paise) as total_amount_paise,
  
  -- Verification breakdown
  COUNT(*) FILTER (WHERE sbt.verification_status = 'FULLY_VERIFIED') as fully_verified_count,
  COUNT(*) FILTER (WHERE sbt.webhook_confirmed_at IS NOT NULL) as webhook_confirmed_count,
  COUNT(*) FILTER (WHERE sbt.bank_statement_matched = true) as statement_matched_count,
  
  -- Unverified
  COUNT(*) FILTER (WHERE sbt.verification_status = 'UNVERIFIED') as unverified_count,
  SUM(sbt.amount_paise) FILTER (WHERE sbt.verification_status = 'UNVERIFIED') as unverified_amount_paise,
  
  -- Mismatches
  COUNT(*) FILTER (WHERE bse.amount_paise != sbt.amount_paise) as amount_mismatch_count,
  
  -- Avg verification time
  AVG(EXTRACT(EPOCH FROM (sbt.bank_statement_matched_at - sbt.completed_at)) / 60) as avg_verify_minutes
  
FROM sp_v2_settlement_bank_transfers sbt
LEFT JOIN sp_v2_bank_statement_entries bse ON sbt.bank_statement_entry_id = bse.id
WHERE sbt.status = 'COMPLETED'
GROUP BY DATE(sbt.completed_at)
ORDER BY payout_date DESC;

-- View: Settlement queue status
CREATE OR REPLACE VIEW vw_settlement_queue_status AS
SELECT 
  status,
  COUNT(*) as queue_count,
  SUM(amount_paise) as total_amount_paise,
  MIN(queued_at) as oldest_queued,
  MAX(queued_at) as newest_queued,
  AVG(EXTRACT(EPOCH FROM (COALESCE(processed_at, NOW()) - queued_at)) / 60) as avg_wait_minutes
FROM sp_v2_settlement_queue
GROUP BY status
ORDER BY 
  CASE status
    WHEN 'PENDING' THEN 1
    WHEN 'PROCESSING' THEN 2
    WHEN 'PROCESSED' THEN 3
    WHEN 'FAILED' THEN 4
  END;

DO $$ 
BEGIN
  RAISE NOTICE '✅ Created monitoring views';
END $$;

-- ============================================================================
-- PART 13: BACKFILL DATA
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '🔧 Part 13: Backfilling existing data...';
END $$;

-- Backfill bank transfers
UPDATE sp_v2_settlement_bank_transfers
SET 
  verification_status = 'UNVERIFIED',
  initiated_at = created_at,
  completed_at = CASE WHEN status = 'COMPLETED' THEN updated_at END
WHERE verification_status IS NULL;

-- Backfill queue idempotency keys
UPDATE sp_v2_bank_transfer_queue
SET idempotency_key = 'BATCH_' || batch_id::text
WHERE idempotency_key IS NULL;

DO $$ 
BEGIN
  RAISE NOTICE '✅ Backfilled existing data';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration 024 completed successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  ✓ Enhanced bank transfers with verification fields';
  RAISE NOTICE '  ✓ Enhanced bank transfer queue';
  RAISE NOTICE '  ✓ Created bank statement entries table';
  RAISE NOTICE '  ✓ Created payout verification log';
  RAISE NOTICE '  ✓ Created settlement queue table';
  RAISE NOTICE '  ✓ Created reserve ledger table';
  RAISE NOTICE '  ✓ Created commission audit table';
  RAISE NOTICE '  ✓ Updated transaction status enum (added SETTLED, PAID)';
  RAISE NOTICE '  ✓ Created auto-settlement trigger';
  RAISE NOTICE '  ✓ Created bank transfer completion trigger';
  RAISE NOTICE '  ✓ Created bank statement auto-match trigger';
  RAISE NOTICE '  ✓ Created 4 monitoring views';
  RAISE NOTICE '  ✓ Backfilled existing data';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Deploy settlement-queue-processor service';
  RAISE NOTICE '  2. Deploy payout-processor service';
  RAISE NOTICE '  3. Test end-to-end flow';
  RAISE NOTICE '';
END $$;

COMMIT;
