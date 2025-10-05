-- ============================================
-- IMPROVE sp_v2_transactions SCHEMA
-- ============================================
-- This script applies 5 critical improvements to the transactions table

BEGIN;

-- ============================================
-- IMPROVEMENT 1: Add card_network field
-- ============================================
ALTER TABLE sp_v2_transactions 
ADD COLUMN IF NOT EXISTS card_network VARCHAR(20);

-- Add constraint for card network values
ALTER TABLE sp_v2_transactions 
DROP CONSTRAINT IF EXISTS sp_v2_transactions_card_network_check;

ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_card_network_check 
CHECK (
  card_network IS NULL OR 
  card_network IN ('VISA', 'MASTERCARD', 'RUPAY', 'AMEX', 'DINERS', 'DISCOVER', 'UPI')
);

-- Populate card_network based on payment_method
UPDATE sp_v2_transactions 
SET card_network = 'UPI' 
WHERE payment_method = 'UPI' 
  AND card_network IS NULL;

COMMENT ON COLUMN sp_v2_transactions.card_network IS 
'Card network or payment rail (VISA, MASTERCARD, RUPAY, UPI, etc.)';

-- ============================================
-- IMPROVEMENT 2: Add FK to merchant_master
-- ============================================
-- Note: Only add FK if merchant_master table exists and all merchant_ids are valid
DO $$ 
BEGIN
  -- Check if sp_v2_merchant_master exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'sp_v2_merchant_master') THEN
    -- Add FK constraint (will fail if orphan merchant_ids exist)
    ALTER TABLE sp_v2_transactions 
    DROP CONSTRAINT IF EXISTS sp_v2_transactions_merchant_id_fkey;
    
    -- This will succeed only if all merchant_ids are valid
    ALTER TABLE sp_v2_transactions 
    ADD CONSTRAINT sp_v2_transactions_merchant_id_fkey 
    FOREIGN KEY (merchant_id) 
    REFERENCES sp_v2_merchant_master(merchant_id)
    ON DELETE RESTRICT;
    
    RAISE NOTICE 'Added FK constraint to merchant_master';
  ELSE
    RAISE NOTICE 'Skipped merchant FK - sp_v2_merchant_master table not found';
  END IF;
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'Skipped merchant FK - orphan merchant_ids exist. Clean data first.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipped merchant FK - error: %', SQLERRM;
END $$;

-- ============================================
-- IMPROVEMENT 3: Add acquirer_code validation
-- ============================================
ALTER TABLE sp_v2_transactions 
DROP CONSTRAINT IF EXISTS sp_v2_transactions_acquirer_code_check;

ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_acquirer_code_check 
CHECK (
  acquirer_code IS NULL OR 
  acquirer_code IN (
    'HDFC', 'ICICI', 'AXIS', 'SBI', 'YES_BANK', 'KOTAK', 
    'INDUSIND', 'BOB', 'PNB', 'CANARA', 'UNION', 'IDBI',
    'PAYTM', 'PHONEPE', 'RAZORPAY', 'CASHFREE', 'JUSPAY',
    'UNKNOWN', 'OTHER'
  )
);

COMMENT ON COLUMN sp_v2_transactions.acquirer_code IS 
'Acquiring bank or payment processor that handled the transaction';

-- ============================================
-- IMPROVEMENT 4: Add amount validation constraints
-- ============================================
ALTER TABLE sp_v2_transactions 
DROP CONSTRAINT IF EXISTS sp_v2_transactions_amount_paise_check;

ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_amount_paise_check 
CHECK (amount_paise > 0);

ALTER TABLE sp_v2_transactions 
DROP CONSTRAINT IF EXISTS sp_v2_transactions_bank_fee_paise_check;

ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_bank_fee_paise_check 
CHECK (bank_fee_paise >= 0);

ALTER TABLE sp_v2_transactions 
DROP CONSTRAINT IF EXISTS sp_v2_transactions_settlement_amount_paise_check;

ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_settlement_amount_paise_check 
CHECK (settlement_amount_paise >= 0);

COMMENT ON COLUMN sp_v2_transactions.amount_paise IS 
'Transaction amount in paise (1 Rupee = 100 paise). Must be > 0.';

COMMENT ON COLUMN sp_v2_transactions.bank_fee_paise IS 
'Bank/gateway processing fees in paise. Must be >= 0.';

COMMENT ON COLUMN sp_v2_transactions.settlement_amount_paise IS 
'Net settlement amount after fees in paise. Must be >= 0.';

-- ============================================
-- IMPROVEMENT 5: Add performance indexes
-- ============================================

-- Index for UTR-based matching (most common reconciliation query)
CREATE INDEX IF NOT EXISTS idx_transactions_utr 
ON sp_v2_transactions(utr) 
WHERE utr IS NOT NULL;

-- Index for RRN-based matching (card transactions)
CREATE INDEX IF NOT EXISTS idx_transactions_rrn 
ON sp_v2_transactions(rrn) 
WHERE rrn IS NOT NULL;

-- Index for merchant analysis queries
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_date 
ON sp_v2_transactions(merchant_id, transaction_date DESC);

-- Index for settlement queries
CREATE INDEX IF NOT EXISTS idx_transactions_settlement_batch 
ON sp_v2_transactions(settlement_batch_id) 
WHERE settlement_batch_id IS NOT NULL;

-- Index for acquirer analysis
CREATE INDEX IF NOT EXISTS idx_transactions_acquirer_date 
ON sp_v2_transactions(acquirer_code, transaction_date DESC)
WHERE acquirer_code IS NOT NULL;

-- Index for payment method analysis
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method 
ON sp_v2_transactions(payment_method, transaction_date DESC)
WHERE payment_method IS NOT NULL;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check applied constraints
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'sp_v2_transactions'::regclass
  AND contype = 'c'  -- Check constraints
ORDER BY conname;

-- Check applied indexes
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'sp_v2_transactions'
ORDER BY indexname;

-- Data validation checks
SELECT 
  'Total transactions' as metric,
  COUNT(*) as count
FROM sp_v2_transactions
UNION ALL
SELECT 
  'Has UTR' as metric,
  COUNT(*) FILTER (WHERE utr IS NOT NULL) as count
FROM sp_v2_transactions
UNION ALL
SELECT 
  'Has RRN' as metric,
  COUNT(*) FILTER (WHERE rrn IS NOT NULL) as count
FROM sp_v2_transactions
UNION ALL
SELECT 
  'Has acquirer_code' as metric,
  COUNT(*) FILTER (WHERE acquirer_code IS NOT NULL) as count
FROM sp_v2_transactions
UNION ALL
SELECT 
  'Has card_network' as metric,
  COUNT(*) FILTER (WHERE card_network IS NOT NULL) as count
FROM sp_v2_transactions
UNION ALL
SELECT 
  'Amount > 0' as metric,
  COUNT(*) FILTER (WHERE amount_paise > 0) as count
FROM sp_v2_transactions;

-- Show distinct values for new/updated fields
SELECT 'acquirer_code' as field, acquirer_code as value, COUNT(*) as count
FROM sp_v2_transactions 
WHERE acquirer_code IS NOT NULL
GROUP BY acquirer_code
UNION ALL
SELECT 'card_network' as field, card_network as value, COUNT(*) as count
FROM sp_v2_transactions 
WHERE card_network IS NOT NULL
GROUP BY card_network
ORDER BY field, count DESC;

COMMIT;

-- ============================================
-- POST-DEPLOYMENT RECOMMENDATIONS
-- ============================================

-- Run ANALYZE to update query planner statistics
ANALYZE sp_v2_transactions;

-- Optional: Run VACUUM to reclaim space (run outside transaction)
-- VACUUM ANALYZE sp_v2_transactions;

SELECT '✅ Schema improvements applied successfully!' as status;
