-- Seed: Settlement Pipeline Demo Data
-- Version: 002
-- Date: 2025-09-18
-- Description: Seeds exactly 2,250 transactions with the specified distribution

-- =========================================
-- Clear existing demo data (last 14 days)
-- =========================================
DELETE FROM settlement_txn
WHERE captured_at >= NOW() - INTERVAL '14 days';

-- =========================================
-- Helper Functions for Demo Data Generation
-- =========================================

-- Generate random amount in paise (₹100 to ₹5,000)
CREATE OR REPLACE FUNCTION demo_rand_paise()
RETURNS BIGINT AS $$
  SELECT (100 + (random() * 4900)::int) * 100; -- Returns paise (100 paise = ₹1)
$$ LANGUAGE sql IMMUTABLE;

-- Generate random payment mode
CREATE OR REPLACE FUNCTION demo_rand_mode()
RETURNS TEXT AS $$
  SELECT (ARRAY['UPI', 'CARD', 'NETBANKING', 'WALLET', 'QR'])[(floor(random() * 5) + 1)::int];
$$ LANGUAGE sql IMMUTABLE;

-- =========================================
-- Seed Generator Procedure
-- =========================================
CREATE OR REPLACE PROCEDURE demo_seed_bucket(
  p_state settlement_state,
  p_count int
)
LANGUAGE plpgsql AS $$
DECLARE
  i int := 0;
  d TIMESTAMPTZ;
  base_time TIMESTAMPTZ := NOW();
BEGIN
  WHILE i < p_count LOOP
    -- Spread captured_at evenly across last 14 days
    d := base_time 
         - (floor(random() * 14))::int * INTERVAL '1 day'
         - (floor(random() * 86400))::int * INTERVAL '1 second';
    
    -- Insert transaction with deterministic UTR
    INSERT INTO settlement_txn(
      utr,
      amount_paise,
      mode,
      captured_at,
      state,
      state_at,
      merchant_id
    )
    VALUES (
      -- Unique, deterministic UTR format
      concat('UTR', 
             to_char(clock_timestamp(), 'YYMMDDHH24MISS'),
             '-', 
             p_state::text,
             '-',
             lpad(i::text, 4, '0')),
      demo_rand_paise(),
      demo_rand_mode(),
      d,
      p_state,
      d + INTERVAL '1 hour', -- State transition 1 hour after capture
      'demo-merchant'
    )
    ON CONFLICT (utr) DO NOTHING; -- Idempotent seeding
    
    i := i + 1;
  END LOOP;
  
  RAISE NOTICE 'Seeded % transactions in state %', p_count, p_state;
END$$;

-- =========================================
-- Seed Exact Distribution
-- =========================================
-- Target: 2,250 total transactions
-- Distribution:
--   IN_SETTLEMENT: 237 (10.53%)
--   SENT_TO_BANK:  575 (25.56%)
--   CREDITED:     1338 (59.47%)
--   UNSETTLED:     100 (4.44%)
-- =========================================

DO $$
BEGIN
  RAISE NOTICE 'Starting settlement pipeline demo data seed...';
  RAISE NOTICE 'Target: 2,250 transactions across 4 states';
END$$;

-- Seed each bucket with exact counts
CALL demo_seed_bucket('IN_SETTLEMENT'::settlement_state, 237);
CALL demo_seed_bucket('SENT_TO_BANK'::settlement_state, 575);
CALL demo_seed_bucket('CREDITED'::settlement_state, 1338);
CALL demo_seed_bucket('UNSETTLED'::settlement_state, 100);

-- =========================================
-- Verification Queries
-- =========================================

-- Verify total count and distribution
DO $$
DECLARE
  total_count INT;
  in_settlement_count INT;
  sent_to_bank_count INT;
  credited_count INT;
  unsettled_count INT;
  sum_check INT;
BEGIN
  -- Get counts for last 14 days
  SELECT COUNT(*) INTO total_count
  FROM settlement_txn
  WHERE captured_at >= NOW() - INTERVAL '14 days';
  
  SELECT COUNT(*) INTO in_settlement_count
  FROM settlement_txn
  WHERE captured_at >= NOW() - INTERVAL '14 days'
    AND state = 'IN_SETTLEMENT';
  
  SELECT COUNT(*) INTO sent_to_bank_count
  FROM settlement_txn
  WHERE captured_at >= NOW() - INTERVAL '14 days'
    AND state = 'SENT_TO_BANK';
  
  SELECT COUNT(*) INTO credited_count
  FROM settlement_txn
  WHERE captured_at >= NOW() - INTERVAL '14 days'
    AND state = 'CREDITED';
  
  SELECT COUNT(*) INTO unsettled_count
  FROM settlement_txn
  WHERE captured_at >= NOW() - INTERVAL '14 days'
    AND state = 'UNSETTLED';
  
  sum_check := in_settlement_count + sent_to_bank_count + credited_count + unsettled_count;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Demo Data Seed Verification';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total Captured: % (expected: 2250)', total_count;
  RAISE NOTICE 'IN_SETTLEMENT: % (expected: 237)', in_settlement_count;
  RAISE NOTICE 'SENT_TO_BANK: % (expected: 575)', sent_to_bank_count;
  RAISE NOTICE 'CREDITED: % (expected: 1338)', credited_count;
  RAISE NOTICE 'UNSETTLED: % (expected: 100)', unsettled_count;
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'Sum Check: % = %', sum_check, total_count;
  RAISE NOTICE 'Invariant Valid: %', CASE WHEN sum_check = total_count THEN 'YES ✓' ELSE 'NO ✗' END;
  RAISE NOTICE '========================================';
  
  IF total_count != 2250 THEN
    RAISE WARNING 'Total count % does not match expected 2250', total_count;
  END IF;
  
  IF sum_check != total_count THEN
    RAISE EXCEPTION 'INVARIANT VIOLATION: Sum of states (%) != total (%)', sum_check, total_count;
  END IF;
END$$;

-- Display sample transactions
SELECT 
  state,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / 2250, 2) as percentage,
  ROUND(AVG(amount_paise) / 100, 2) as avg_amount_inr,
  ROUND(SUM(amount_paise) / 100, 2) as total_amount_inr
FROM settlement_txn
WHERE captured_at >= NOW() - INTERVAL '14 days'
GROUP BY state
ORDER BY 
  CASE state
    WHEN 'IN_SETTLEMENT' THEN 1
    WHEN 'SENT_TO_BANK' THEN 2
    WHEN 'CREDITED' THEN 3
    WHEN 'UNSETTLED' THEN 4
  END;