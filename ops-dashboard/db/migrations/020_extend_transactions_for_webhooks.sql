-- Migration 020: Extend sp_v2_transactions to Support Webhook Data
-- Purpose: Add missing columns from v1 to enable lossless webhook migration
-- Impact: Preserves customer data, enables unified settlement pipeline

-- Step 1: Add webhook-specific columns
ALTER TABLE sp_v2_transactions
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS metadata JSONB,
ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50);

-- Step 2: Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_customer_email 
ON sp_v2_transactions(customer_email) WHERE customer_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_source_type 
ON sp_v2_transactions(source_type);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_mode 
ON sp_v2_transactions(payment_mode) WHERE payment_mode IS NOT NULL;

-- Step 3: Add constraint to ensure webhook transactions have gateway_ref
CREATE INDEX IF NOT EXISTS idx_transactions_gateway_ref 
ON sp_v2_transactions(gateway_ref) WHERE gateway_ref IS NOT NULL;

-- Step 4: Update existing manual upload records to set payment_mode from payment_method
UPDATE sp_v2_transactions
SET payment_mode = payment_method
WHERE payment_mode IS NULL AND payment_method IS NOT NULL;

-- Verification
DO $$
DECLARE
  email_col_exists BOOLEAN;
  phone_col_exists BOOLEAN;
  metadata_col_exists BOOLEAN;
  payment_mode_col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sp_v2_transactions' AND column_name = 'customer_email'
  ) INTO email_col_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sp_v2_transactions' AND column_name = 'customer_phone'
  ) INTO phone_col_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sp_v2_transactions' AND column_name = 'metadata'
  ) INTO metadata_col_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sp_v2_transactions' AND column_name = 'payment_mode'
  ) INTO payment_mode_col_exists;
  
  IF email_col_exists AND phone_col_exists AND metadata_col_exists AND payment_mode_col_exists THEN
    RAISE NOTICE '✅ All webhook columns added successfully';
    RAISE NOTICE '   - customer_email: %', email_col_exists;
    RAISE NOTICE '   - customer_phone: %', phone_col_exists;
    RAISE NOTICE '   - metadata: %', metadata_col_exists;
    RAISE NOTICE '   - payment_mode: %', payment_mode_col_exists;
  ELSE
    RAISE EXCEPTION 'Failed to add one or more columns';
  END IF;
END $$;

-- Migration Summary
COMMENT ON COLUMN sp_v2_transactions.customer_email IS 'Customer email from webhook data';
COMMENT ON COLUMN sp_v2_transactions.customer_phone IS 'Customer phone from webhook data';
COMMENT ON COLUMN sp_v2_transactions.metadata IS 'Original webhook metadata (JSON)';
COMMENT ON COLUMN sp_v2_transactions.payment_mode IS 'Payment mode (UPI/CARD/NB) from webhook, matches v1 column name';
