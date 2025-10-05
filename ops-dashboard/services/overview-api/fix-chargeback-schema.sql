-- ============================================
-- FIX CHARGEBACK SCHEMA: Acquirer vs Card Network
-- ============================================
-- Problem: 'acquirer' field stores card networks (VISA/MASTERCARD) 
-- instead of acquiring banks (HDFC/AXIS/ICICI)
-- Solution: Add card_network field and fix acquirer constraints

-- Step 1: Add card_network column
ALTER TABLE sp_v2_chargebacks 
ADD COLUMN IF NOT EXISTS card_network TEXT;

-- Step 2: Migrate existing acquirer data to card_network
UPDATE sp_v2_chargebacks 
SET card_network = acquirer 
WHERE acquirer IN ('VISA', 'MASTERCARD', 'RUPAY');

-- Step 3: Add card_network constraint
ALTER TABLE sp_v2_chargebacks 
DROP CONSTRAINT IF EXISTS sp_v2_chargebacks_card_network_check;

ALTER TABLE sp_v2_chargebacks 
ADD CONSTRAINT sp_v2_chargebacks_card_network_check 
CHECK (card_network IS NULL OR card_network = ANY (ARRAY[
  'VISA', 'MASTERCARD', 'RUPAY', 'AMEX', 'DINERS', 'DISCOVER', 'UPI'
]));

-- Step 4: Update acquirer constraint to use actual banks
ALTER TABLE sp_v2_chargebacks 
DROP CONSTRAINT IF EXISTS sp_v2_chargebacks_acquirer_check;

ALTER TABLE sp_v2_chargebacks 
ADD CONSTRAINT sp_v2_chargebacks_acquirer_check 
CHECK (acquirer = ANY (ARRAY[
  'HDFC', 'ICICI', 'AXIS', 'SBI', 'YES_BANK', 'KOTAK', 
  'INDUSIND', 'BOB', 'PNB', 'CANARA', 'PAYTM', 'PHONEPE', 
  'RAZORPAY', 'CASHFREE', 'JUSPAY', 'UNKNOWN', 'OTHER'
]));

-- Step 5: For UPI acquirers (PHONEPE, PAYTM), set card_network to 'UPI'
UPDATE sp_v2_chargebacks 
SET card_network = 'UPI' 
WHERE acquirer IN ('PHONEPE', 'PAYTM', 'RAZORPAY', 'CASHFREE');

-- Step 6: Add transaction_id foreign key column
ALTER TABLE sp_v2_chargebacks 
ADD COLUMN IF NOT EXISTS sp_transaction_id BIGINT;

-- Step 7: Create index for transaction linking
CREATE INDEX IF NOT EXISTS idx_sp_v2_chargebacks_transaction 
ON sp_v2_chargebacks(sp_transaction_id) 
WHERE sp_transaction_id IS NOT NULL;

-- Step 8: Add foreign key constraint (soft reference, nullable)
ALTER TABLE sp_v2_chargebacks 
DROP CONSTRAINT IF EXISTS sp_v2_chargebacks_sp_transaction_id_fkey;

ALTER TABLE sp_v2_chargebacks 
ADD CONSTRAINT sp_v2_chargebacks_sp_transaction_id_fkey 
FOREIGN KEY (sp_transaction_id) 
REFERENCES sp_v2_transactions(id) 
ON DELETE SET NULL;

-- Step 9: Try to auto-link chargebacks to transactions via txn_ref
UPDATE sp_v2_chargebacks cb
SET sp_transaction_id = t.id
FROM sp_v2_transactions t
WHERE cb.txn_ref = t.transaction_id
AND cb.sp_transaction_id IS NULL;

-- Step 10: Try to auto-link via UTR (for UPI transactions)
UPDATE sp_v2_chargebacks cb
SET sp_transaction_id = t.id
FROM sp_v2_transactions t
WHERE cb.utr IS NOT NULL 
AND cb.utr = t.utr
AND cb.sp_transaction_id IS NULL;

-- Step 11: Try to auto-link via RRN (for card transactions)
UPDATE sp_v2_chargebacks cb
SET sp_transaction_id = t.id
FROM sp_v2_transactions t
WHERE cb.rrn IS NOT NULL 
AND cb.rrn = t.rrn
AND cb.sp_transaction_id IS NULL;

-- Step 12: Create correlation records for linked transactions
INSERT INTO sp_v2_chargeback_correlations (
  chargeback_id, 
  pg_transaction_id, 
  correlation_method, 
  confidence_score, 
  verified, 
  matched_by
)
SELECT 
  cb.id,
  t.transaction_id,
  CASE 
    WHEN cb.txn_ref = t.transaction_id THEN 'EXACT_TXN_REF'
    WHEN cb.utr = t.utr THEN 'UTR_MATCH'
    WHEN cb.rrn = t.rrn THEN 'RRN_MATCH'
  END,
  1.0,
  true,
  'SYSTEM_AUTO_MIGRATION'
FROM sp_v2_chargebacks cb
JOIN sp_v2_transactions t ON cb.sp_transaction_id = t.id
WHERE NOT EXISTS (
  SELECT 1 FROM sp_v2_chargeback_correlations 
  WHERE chargeback_id = cb.id
);

-- Step 13: Add comments for documentation
COMMENT ON COLUMN sp_v2_chargebacks.acquirer IS 
'Acquiring bank that processed the transaction (HDFC, ICICI, AXIS, etc.)';

COMMENT ON COLUMN sp_v2_chargebacks.card_network IS 
'Card network or payment method (VISA, MASTERCARD, RUPAY, UPI, etc.)';

COMMENT ON COLUMN sp_v2_chargebacks.sp_transaction_id IS 
'Foreign key to sp_v2_transactions.id - links chargeback to original payment transaction';

-- Verification queries
SELECT 
  'Total chargebacks' as metric,
  COUNT(*) as count
FROM sp_v2_chargebacks
UNION ALL
SELECT 
  'Linked to transactions' as metric,
  COUNT(*) FILTER (WHERE sp_transaction_id IS NOT NULL) as count
FROM sp_v2_chargebacks
UNION ALL
SELECT 
  'Card network populated' as metric,
  COUNT(*) FILTER (WHERE card_network IS NOT NULL) as count
FROM sp_v2_chargebacks
UNION ALL
SELECT 
  'Correlations created' as metric,
  COUNT(*) as count
FROM sp_v2_chargeback_correlations;
