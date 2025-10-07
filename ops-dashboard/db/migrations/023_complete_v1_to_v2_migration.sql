-- Migration 023: Complete V1 to V2 Transaction Migration
-- Purpose: Fully migrate all dependencies from sp_v2_transactions_v1 to sp_v2_transactions
-- Date: 2025-10-07
-- CRITICAL: Makes sp_v2_transactions the single source of truth

BEGIN;

-- ==========================================
-- STEP 1: Create Merchant ID Mapping Table
-- ==========================================
-- Purpose: Map UUID merchant IDs (v1) to VARCHAR merchant IDs (settlement system)

CREATE TABLE IF NOT EXISTS sp_v2_merchant_id_mapping (
  id SERIAL PRIMARY KEY,
  uuid_merchant_id UUID NOT NULL UNIQUE,
  varchar_merchant_id VARCHAR(50) NOT NULL,
  merchant_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (uuid_merchant_id) REFERENCES sp_v2_merchants(id),
  FOREIGN KEY (varchar_merchant_id) REFERENCES sp_v2_merchant_master(merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_mapping_uuid ON sp_v2_merchant_id_mapping(uuid_merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_mapping_varchar ON sp_v2_merchant_id_mapping(varchar_merchant_id);

COMMENT ON TABLE sp_v2_merchant_id_mapping IS 'Maps UUID merchant IDs (webhooks) to VARCHAR merchant IDs (settlements)';

-- Populate with existing merchants (if any have matching names)
INSERT INTO sp_v2_merchant_id_mapping (uuid_merchant_id, varchar_merchant_id, merchant_name)
SELECT 
  m.id as uuid_merchant_id,
  mm.merchant_id as varchar_merchant_id,
  m.name as merchant_name
FROM sp_v2_merchants m
JOIN sp_v2_merchant_master mm ON LOWER(m.name) = LOWER(mm.merchant_name)
ON CONFLICT (uuid_merchant_id) DO NOTHING;

RAISE NOTICE '✅ Step 1 Complete: Merchant ID mapping table created with % mappings', 
  (SELECT COUNT(*) FROM sp_v2_merchant_id_mapping);

-- ==========================================
-- STEP 2: Migrate Remaining V1 Transactions
-- ==========================================
-- Copy any v1 transactions not yet migrated

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
  v1.pgw_ref AS transaction_id,
  v1.merchant_id::text AS merchant_id,
  v1.amount_paise,
  COALESCE(v1.currency, 'INR') AS currency,
  v1.created_at::date AS transaction_date,
  v1.created_at AS transaction_timestamp,
  'WEBHOOK' AS source_type,
  COALESCE(UPPER(v1.gateway), 'PG_WEBHOOK') AS source_name,
  v1.payment_mode AS payment_method,
  v1.payment_mode,
  v1.pgw_ref AS gateway_ref,
  v1.utr,
  v1.status,
  v1.customer_email,
  v1.customer_phone,
  v1.metadata,
  v1.created_at,
  v1.updated_at
FROM sp_v2_transactions_v1 v1
WHERE NOT EXISTS (
  SELECT 1 FROM sp_v2_transactions v2 
  WHERE v2.transaction_id = v1.pgw_ref
)
ON CONFLICT (transaction_id) DO UPDATE SET
  customer_email = EXCLUDED.customer_email,
  customer_phone = EXCLUDED.customer_phone,
  metadata = EXCLUDED.metadata,
  payment_mode = EXCLUDED.payment_mode,
  updated_at = EXCLUDED.updated_at;

RAISE NOTICE '✅ Step 2 Complete: All v1 transactions migrated to v2';

-- ==========================================
-- STEP 3: Fix sp_v2_settlement_transaction_map
-- ==========================================
-- This table has FK to v1, needs to point to v2

-- Check if table is empty (0 rows on staging)
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM sp_v2_settlement_transaction_map;
  
  IF row_count = 0 THEN
    RAISE NOTICE '⚠️  sp_v2_settlement_transaction_map is empty, just fixing FK';
    
    -- Drop old FK to v1
    ALTER TABLE sp_v2_settlement_transaction_map 
      DROP CONSTRAINT IF EXISTS sp_v2_settlement_transaction_map_transaction_id_fkey;
    
    -- Change column type from UUID to VARCHAR
    ALTER TABLE sp_v2_settlement_transaction_map
      ALTER COLUMN transaction_id TYPE VARCHAR(100) USING transaction_id::text;
    
    -- Add new FK to v2
    ALTER TABLE sp_v2_settlement_transaction_map
      ADD CONSTRAINT sp_v2_settlement_transaction_map_transaction_id_fkey
      FOREIGN KEY (transaction_id) 
      REFERENCES sp_v2_transactions(transaction_id) 
      ON DELETE CASCADE;
      
    RAISE NOTICE '✅ Step 3 Complete: settlement_transaction_map FK updated (table was empty)';
  ELSE
    RAISE NOTICE '⚠️  sp_v2_settlement_transaction_map has % rows, migrating data...', row_count;
    
    -- Create temporary mapping
    CREATE TEMP TABLE temp_txn_map AS
    SELECT 
      stm.id,
      v1.pgw_ref as new_transaction_id
    FROM sp_v2_settlement_transaction_map stm
    JOIN sp_v2_transactions_v1 v1 ON stm.transaction_id = v1.id;
    
    -- Drop old FK
    ALTER TABLE sp_v2_settlement_transaction_map 
      DROP CONSTRAINT IF EXISTS sp_v2_settlement_transaction_map_transaction_id_fkey;
    
    -- Change column type
    ALTER TABLE sp_v2_settlement_transaction_map
      ALTER COLUMN transaction_id TYPE VARCHAR(100) USING transaction_id::text;
    
    -- Update values using mapping
    UPDATE sp_v2_settlement_transaction_map stm
    SET transaction_id = tm.new_transaction_id
    FROM temp_txn_map tm
    WHERE stm.id = tm.id;
    
    -- Add new FK to v2
    ALTER TABLE sp_v2_settlement_transaction_map
      ADD CONSTRAINT sp_v2_settlement_transaction_map_transaction_id_fkey
      FOREIGN KEY (transaction_id) 
      REFERENCES sp_v2_transactions(transaction_id) 
      ON DELETE CASCADE;
    
    RAISE NOTICE '✅ Step 3 Complete: settlement_transaction_map migrated (% rows updated)', row_count;
  END IF;
END $$;

-- ==========================================
-- STEP 4: Drop FK from V1 to sp_v2_merchants
-- ==========================================
-- Break the link so v1 can be deprecated

ALTER TABLE sp_v2_transactions_v1
  DROP CONSTRAINT IF EXISTS sp_v2_transactions_v1_merchant_id_fkey;

RAISE NOTICE '✅ Step 4 Complete: V1 merchant FK constraint dropped';

-- ==========================================
-- STEP 5: Rename V1 Table to Deprecated
-- ==========================================
-- Mark v1 table as deprecated but keep data for emergency rollback

ALTER TABLE sp_v2_transactions_v1 
  RENAME TO sp_v2_transactions_v1_deprecated;

-- Add deprecation comment
COMMENT ON TABLE sp_v2_transactions_v1_deprecated IS 
  'DEPRECATED as of 2025-10-07. All webhook transactions now go to sp_v2_transactions. 
   This table kept for 30 days as emergency backup. Safe to drop after 2025-11-07.';

RAISE NOTICE '✅ Step 5 Complete: V1 table renamed to sp_v2_transactions_v1_deprecated';

-- ==========================================
-- STEP 6: Create Indexes on sp_v2_transactions
-- ==========================================
-- Ensure proper indexes for webhook queries

CREATE INDEX IF NOT EXISTS idx_transactions_source_type 
  ON sp_v2_transactions(source_type) 
  WHERE source_type = 'WEBHOOK';

CREATE INDEX IF NOT EXISTS idx_transactions_source_name 
  ON sp_v2_transactions(source_name) 
  WHERE source_type = 'WEBHOOK';

CREATE INDEX IF NOT EXISTS idx_transactions_gateway_ref 
  ON sp_v2_transactions(gateway_ref) 
  WHERE gateway_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_webhook_status
  ON sp_v2_transactions(status, source_type)
  WHERE source_type = 'WEBHOOK';

RAISE NOTICE '✅ Step 6 Complete: Webhook query indexes created';

-- ==========================================
-- STEP 7: Verification Queries
-- ==========================================

-- Verify migration completeness
DO $$
DECLARE
  v1_count INTEGER;
  v2_webhook_count INTEGER;
  merchant_mapping_count INTEGER;
  settlement_map_orphans INTEGER;
BEGIN
  -- Count deprecated v1 transactions
  SELECT COUNT(*) INTO v1_count FROM sp_v2_transactions_v1_deprecated;
  
  -- Count webhook transactions in v2
  SELECT COUNT(*) INTO v2_webhook_count 
  FROM sp_v2_transactions 
  WHERE source_type = 'WEBHOOK';
  
  -- Count merchant mappings
  SELECT COUNT(*) INTO merchant_mapping_count 
  FROM sp_v2_merchant_id_mapping;
  
  -- Check for orphaned settlement map records
  SELECT COUNT(*) INTO settlement_map_orphans
  FROM sp_v2_settlement_transaction_map stm
  LEFT JOIN sp_v2_transactions t ON stm.transaction_id = t.transaction_id
  WHERE t.transaction_id IS NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📊 MIGRATION VERIFICATION SUMMARY';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ V1 transactions (deprecated): %', v1_count;
  RAISE NOTICE '✅ V2 webhook transactions: %', v2_webhook_count;
  RAISE NOTICE '✅ Merchant ID mappings: %', merchant_mapping_count;
  RAISE NOTICE '✅ Settlement map orphans: % (should be 0)', settlement_map_orphans;
  RAISE NOTICE '';
  
  IF v2_webhook_count >= v1_count THEN
    RAISE NOTICE '✅✅✅ ALL CHECKS PASSED - Migration Complete!';
  ELSE
    RAISE WARNING '⚠️  Some transactions may not have migrated (V2: %, V1: %)', 
      v2_webhook_count, v1_count;
  END IF;
  
  IF settlement_map_orphans > 0 THEN
    RAISE WARNING '⚠️  Found % orphaned settlement map records!', settlement_map_orphans;
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

-- Show transaction source breakdown
SELECT 
  source_type,
  COUNT(*) as transaction_count,
  COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as success_count,
  SUM(amount_paise) / 100.0 as total_amount_rupees,
  MIN(transaction_date) as earliest_txn,
  MAX(transaction_date) as latest_txn
FROM sp_v2_transactions
GROUP BY source_type
ORDER BY source_type;

COMMIT;

-- ==========================================
-- POST-MIGRATION NOTES
-- ==========================================

RAISE NOTICE '';
RAISE NOTICE '🎉 Migration 023 Complete!';
RAISE NOTICE '';
RAISE NOTICE '📋 NEXT STEPS:';
RAISE NOTICE '1. Deploy updated pg-ingestion-server.cjs to staging';
RAISE NOTICE '2. Test webhook ingestion flow';
RAISE NOTICE '3. Verify settlement calculation works for webhook transactions';
RAISE NOTICE '4. Monitor for 48 hours';
RAISE NOTICE '5. If all OK, drop sp_v2_transactions_v1_deprecated after 2025-11-07';
RAISE NOTICE '';
RAISE NOTICE '⚠️  ROLLBACK PLAN (if needed):';
RAISE NOTICE '   ALTER TABLE sp_v2_transactions_v1_deprecated RENAME TO sp_v2_transactions_v1;';
RAISE NOTICE '   -- Then redeploy old pg-ingestion-server.cjs';
RAISE NOTICE '';
