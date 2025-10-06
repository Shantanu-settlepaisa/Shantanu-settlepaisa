-- Migration 021: Migrate Webhook Transactions from v1 to v2
-- Purpose: Copy 376 webhook transactions to unified settlement pipeline
-- Impact: Enables settlement of webhook transactions, unified reporting

-- Step 1: Backup check - ensure v1 data exists
DO $$
DECLARE
  v1_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v1_count FROM sp_v2_transactions_v1;
  
  IF v1_count = 0 THEN
    RAISE EXCEPTION 'No data in sp_v2_transactions_v1. Migration not needed.';
  END IF;
  
  RAISE NOTICE 'Found % transactions in v1 to migrate', v1_count;
END $$;

-- Step 2: Migrate webhook transactions (lossless)
INSERT INTO sp_v2_transactions (
  transaction_id,
  merchant_id,
  amount_paise,
  currency,
  transaction_date,
  transaction_timestamp,
  source_type,
  source_name,
  payment_method,
  payment_mode,
  gateway_ref,
  utr,
  status,
  customer_email,
  customer_phone,
  metadata,
  created_at,
  updated_at
)
SELECT 
  v1.pgw_ref AS transaction_id,              -- Gateway ref becomes transaction_id
  v1.merchant_id::text AS merchant_id,       -- UUID → VARCHAR cast
  v1.amount_paise,
  COALESCE(v1.currency, 'I') AS currency,    -- Default to INR if NULL
  v1.created_at::date AS transaction_date,   -- Extract date
  v1.created_at AS transaction_timestamp,
  'WEBHOOK' AS source_type,                  -- Mark as webhook
  'PG_API' AS source_name,                   -- Generic webhook source
  v1.payment_mode AS payment_method,         -- Copy to payment_method
  v1.payment_mode,                           -- Also keep in payment_mode
  v1.pgw_ref AS gateway_ref,                 -- Preserve gateway reference
  v1.utr,
  v1.status,
  v1.customer_email,
  v1.customer_phone,
  v1.metadata,
  v1.created_at,
  v1.updated_at
FROM sp_v2_transactions_v1 v1
ON CONFLICT (transaction_id) DO UPDATE SET
  -- Update if exists (idempotent migration)
  customer_email = EXCLUDED.customer_email,
  customer_phone = EXCLUDED.customer_phone,
  metadata = EXCLUDED.metadata,
  payment_mode = EXCLUDED.payment_mode,
  updated_at = EXCLUDED.updated_at;

-- Step 3: Verification
DO $$
DECLARE
  v1_count INTEGER;
  v2_webhook_count INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v1_count FROM sp_v2_transactions_v1;
  SELECT COUNT(*) INTO v2_webhook_count 
  FROM sp_v2_transactions 
  WHERE source_type = 'WEBHOOK';
  
  migrated_count := v2_webhook_count;
  
  RAISE NOTICE '📊 Migration Summary:';
  RAISE NOTICE '   - Transactions in v1: %', v1_count;
  RAISE NOTICE '   - Webhook transactions in v2: %', v2_webhook_count;
  RAISE NOTICE '   - Migration ratio: %/%', v2_webhook_count, v1_count;
  
  IF v2_webhook_count >= v1_count THEN
    RAISE NOTICE '✅ All webhook transactions migrated successfully';
  ELSE
    RAISE WARNING '⚠️ Some transactions may have failed due to conflicts';
  END IF;
END $$;

-- Step 4: Data integrity check
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  -- Check for webhook transactions without settlement capability
  SELECT COUNT(*) INTO orphan_count
  FROM sp_v2_transactions
  WHERE source_type = 'WEBHOOK' 
    AND status = 'SUCCESS'
    AND settlement_batch_id IS NULL;
  
  RAISE NOTICE '📈 Settlement Status:';
  RAISE NOTICE '   - Webhook SUCCESS transactions ready for settlement: %', orphan_count;
END $$;

-- Step 5: Update existing settlement items to link properly (if any exist with webhook data)
-- This handles edge case where settlement_items might have been created before migration
UPDATE sp_v2_settlement_items si
SET transaction_id = v1.pgw_ref
FROM sp_v2_transactions_v1 v1
WHERE si.transaction_id = v1.id::text
  AND EXISTS (
    SELECT 1 FROM sp_v2_transactions t2 
    WHERE t2.transaction_id = v1.pgw_ref
  );

-- Migration complete
COMMENT ON TABLE sp_v2_transactions IS 'Unified transaction table: Manual uploads + Webhooks (migrated from v1)';

-- Summary report
SELECT 
  source_type,
  COUNT(*) as transaction_count,
  COUNT(CASE WHEN status = 'RECONCILED' THEN 1 END) as reconciled_count,
  COUNT(CASE WHEN settlement_batch_id IS NOT NULL THEN 1 END) as settled_count,
  SUM(amount_paise) / 100.0 as total_amount_rupees
FROM sp_v2_transactions
GROUP BY source_type
ORDER BY source_type;
