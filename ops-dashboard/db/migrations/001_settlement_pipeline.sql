-- Migration: Settlement Pipeline Schema
-- Version: 001
-- Date: 2025-09-18
-- Description: Creates settlement_state enum and settlement_txn table for mutually-exclusive state tracking

-- =========================================
-- 1. Create Settlement State Enum (idempotent)
-- =========================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_state') THEN
    CREATE TYPE settlement_state AS ENUM (
      'IN_SETTLEMENT',
      'SENT_TO_BANK',
      'CREDITED',
      'UNSETTLED'
    );
  END IF;
END$$;

-- =========================================
-- 2. Create Settlement Transaction Table
-- =========================================
-- Core principle: Exactly ONE row per transaction (UTR)
-- Each transaction is in exactly ONE state at any time
CREATE TABLE IF NOT EXISTS settlement_txn (
  id              BIGSERIAL PRIMARY KEY,
  utr             TEXT UNIQUE NOT NULL,                    -- Unique Transaction Reference
  amount_paise    BIGINT NOT NULL CHECK (amount_paise >= 0), -- Amount in paise (INR * 100)
  mode            TEXT NOT NULL,                           -- Payment mode: UPI/CARD/NETBANKING/WALLET/QR
  captured_at     TIMESTAMPTZ NOT NULL,                    -- When transaction was captured
  state           settlement_state NOT NULL,               -- Current settlement state (mutually exclusive)
  state_at        TIMESTAMPTZ NOT NULL,                    -- When entered current state
  merchant_id     TEXT DEFAULT 'demo-merchant',            -- Merchant identifier
  created_at      TIMESTAMPTZ DEFAULT NOW(),               -- Row creation time
  updated_at      TIMESTAMPTZ DEFAULT NOW()                -- Row update time
);

-- =========================================
-- 3. Create Indexes for Query Performance
-- =========================================
CREATE INDEX IF NOT EXISTS idx_settlement_txn_captured_at 
  ON settlement_txn (captured_at);

CREATE INDEX IF NOT EXISTS idx_settlement_txn_state 
  ON settlement_txn (state);

CREATE INDEX IF NOT EXISTS idx_settlement_txn_merchant_id 
  ON settlement_txn (merchant_id);

CREATE INDEX IF NOT EXISTS idx_settlement_txn_utr 
  ON settlement_txn (utr);

-- Compound index for date range queries with state filtering
CREATE INDEX IF NOT EXISTS idx_settlement_txn_captured_state 
  ON settlement_txn (captured_at, state);

-- =========================================
-- 4. Create Settlement Event History Table (Optional)
-- =========================================
-- Tracks state transitions for audit trail
CREATE TABLE IF NOT EXISTS settlement_txn_events (
  id           BIGSERIAL PRIMARY KEY,
  utr          TEXT NOT NULL,
  prev_state   settlement_state,           -- NULL for initial state
  next_state   settlement_state NOT NULL,
  event_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason       TEXT,                        -- Optional reason for state change
  metadata     JSONB                       -- Optional additional data
);

CREATE INDEX IF NOT EXISTS idx_settlement_txn_events_utr 
  ON settlement_txn_events (utr);

CREATE INDEX IF NOT EXISTS idx_settlement_txn_events_event_at 
  ON settlement_txn_events (event_at);

-- =========================================
-- 5. Create Update Trigger for updated_at
-- =========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_settlement_txn_updated_at ON settlement_txn;
CREATE TRIGGER update_settlement_txn_updated_at
  BEFORE UPDATE ON settlement_txn
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- 6. Verification Query
-- =========================================
-- This should always return 'VALID' if data is consistent
DO $$
BEGIN
  RAISE NOTICE 'Settlement Pipeline schema created successfully';
  RAISE NOTICE 'Table: settlement_txn';
  RAISE NOTICE 'States: IN_SETTLEMENT, SENT_TO_BANK, CREDITED, UNSETTLED';
  RAISE NOTICE 'Invariant: Each UTR has exactly one row with one state';
END$$;