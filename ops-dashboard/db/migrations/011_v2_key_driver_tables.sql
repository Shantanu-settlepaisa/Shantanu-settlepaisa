-- V2 Key Driver Tables for Independent Settlement System
-- These tables sync from SabPaisa core to enable V2 independence
-- Created: October 2, 2025

-- =============================================
-- 1. MERCHANT MASTER (Synced from merchant_data)
-- =============================================

CREATE TABLE IF NOT EXISTS sp_v2_merchant_master (
  merchant_id VARCHAR(50) PRIMARY KEY,
  merchant_name VARCHAR(255) NOT NULL,
  merchant_email VARCHAR(255),
  merchant_phone VARCHAR(50),
  
  -- Rolling reserve config
  rolling_reserve_enabled BOOLEAN DEFAULT false,
  rolling_reserve_percentage DECIMAL(5,2) DEFAULT 0.00,
  reserve_hold_days INTEGER DEFAULT 0,
  
  -- Settlement config
  settlement_cycle INTEGER DEFAULT 1, -- 1=T+1, 2=T+2, etc.
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Sync tracking
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_v2_merchant_active ON sp_v2_merchant_master(is_active);
CREATE INDEX idx_v2_merchant_synced ON sp_v2_merchant_master(synced_at);

COMMENT ON TABLE sp_v2_merchant_master IS 'Merchant master data synced from SabPaisa core merchant_data table';

-- =============================================
-- 2. COMMISSION CONFIG (Synced from merchant_base_rate)
-- =============================================

CREATE TABLE IF NOT EXISTS sp_v2_merchant_commission_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL,
  
  -- Payment identifiers
  payment_mode VARCHAR(50) NOT NULL, -- UPI, Net Banking, Cards, Wallets
  payment_mode_id VARCHAR(10),
  bank_code VARCHAR(100),
  bank_name VARCHAR(100),
  
  -- Commission details
  commission_value DECIMAL(10,2) NOT NULL,
  commission_type VARCHAR(20) NOT NULL, -- percentage|fixed
  
  -- Tax details
  gst_percentage DECIMAL(5,2) DEFAULT 18.0,
  
  -- Slab details (for tiered pricing)
  slab_floor DECIMAL(15,2),
  slab_ceiling DECIMAL(15,2),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Sync tracking
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint per merchant+mode+bank
  CONSTRAINT unique_merchant_commission UNIQUE(merchant_id, payment_mode, bank_code)
);

CREATE INDEX idx_v2_commission_merchant ON sp_v2_merchant_commission_config(merchant_id);
CREATE INDEX idx_v2_commission_mode ON sp_v2_merchant_commission_config(payment_mode);
CREATE INDEX idx_v2_commission_bank ON sp_v2_merchant_commission_config(bank_code);
CREATE INDEX idx_v2_commission_active ON sp_v2_merchant_commission_config(is_active);

COMMENT ON TABLE sp_v2_merchant_commission_config IS 'Commission rates per merchant/mode/bank synced from merchant_base_rate';

-- =============================================
-- 3. FEE BEARER TYPES (Seed data from fee_bearer)
-- =============================================

CREATE TABLE IF NOT EXISTS sp_v2_fee_bearer_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  code VARCHAR(10) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert seed data (from SabPaisa core)
INSERT INTO sp_v2_fee_bearer_types (name, code, description) VALUES
  ('bank', '1', 'Bank bears the transaction fees'),
  ('merchant', '2', 'Merchant bears the transaction fees (most common)'),
  ('payer', '3', 'Customer/Payer bears the transaction fees'),
  ('subscriber', '4', 'Subscription model - fees handled separately')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE sp_v2_fee_bearer_types IS 'Fee bearer types - defines who pays transaction fees';

-- =============================================
-- 4. MERCHANT FEE BEARER CONFIG (Synced from merchant_fee_bearer)
-- =============================================

CREATE TABLE IF NOT EXISTS sp_v2_merchant_fee_bearer_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL,
  payment_mode_id VARCHAR(5) NOT NULL,
  fee_bearer_code VARCHAR(10) NOT NULL REFERENCES sp_v2_fee_bearer_types(code),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Sync tracking
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint per merchant+mode
  CONSTRAINT unique_merchant_fee_bearer UNIQUE(merchant_id, payment_mode_id)
);

CREATE INDEX idx_v2_fee_bearer_merchant ON sp_v2_merchant_fee_bearer_config(merchant_id);
CREATE INDEX idx_v2_fee_bearer_mode ON sp_v2_merchant_fee_bearer_config(payment_mode_id);

COMMENT ON TABLE sp_v2_merchant_fee_bearer_config IS 'Fee bearer configuration per merchant per payment mode';

-- =============================================
-- 5. PAYMENT MODE MASTER (Reference data)
-- =============================================

CREATE TABLE IF NOT EXISTS sp_v2_payment_mode_master (
  id SERIAL PRIMARY KEY,
  mode_id VARCHAR(10) UNIQUE NOT NULL,
  mode_name VARCHAR(100) NOT NULL,
  mode_category VARCHAR(50), -- UPI, Cards, Net Banking, Wallets
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert common payment modes
INSERT INTO sp_v2_payment_mode_master (mode_id, mode_name, mode_category) VALUES
  ('1', 'Credit Card', 'Cards'),
  ('2', 'Debit Card', 'Cards'),
  ('3', 'Net Banking', 'Net Banking'),
  ('4', 'UPI', 'UPI'),
  ('5', 'Wallets', 'Wallets'),
  ('6', 'IMPS', 'Bank Transfer'),
  ('7', 'NEFT', 'Bank Transfer'),
  ('8', 'RTGS', 'Bank Transfer')
ON CONFLICT (mode_id) DO NOTHING;

COMMENT ON TABLE sp_v2_payment_mode_master IS 'Payment mode reference data';

-- =============================================
-- 6. ENHANCED ROLLING RESERVE LEDGER
-- =============================================

-- Drop old version if exists
DROP TABLE IF EXISTS sp_v2_rolling_reserve_ledger CASCADE;

CREATE TABLE sp_v2_rolling_reserve_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  merchant_id VARCHAR(50) NOT NULL,
  
  -- Reserve amounts
  reserve_amount_paise BIGINT NOT NULL,
  released_amount_paise BIGINT DEFAULT 0,
  balance_paise BIGINT NOT NULL,
  
  -- Dates
  hold_date DATE NOT NULL,
  release_date DATE NOT NULL,
  released_at TIMESTAMP,
  
  -- Status
  status VARCHAR(20) DEFAULT 'HELD' CHECK (status IN ('HELD', 'RELEASED', 'ADJUSTED')),
  
  -- Metadata
  reserve_percentage DECIMAL(5,2),
  hold_days INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_v2_reserve_merchant ON sp_v2_rolling_reserve_ledger(merchant_id);
CREATE INDEX idx_v2_reserve_status ON sp_v2_rolling_reserve_ledger(status);
CREATE INDEX idx_v2_reserve_release_date ON sp_v2_rolling_reserve_ledger(release_date, status);
CREATE INDEX idx_v2_reserve_batch ON sp_v2_rolling_reserve_ledger(settlement_batch_id);

COMMENT ON TABLE sp_v2_rolling_reserve_ledger IS 'Rolling reserve tracking - holds and releases per merchant';

-- =============================================
-- 7. SYNC LOG (Track sync operations)
-- =============================================

CREATE TABLE IF NOT EXISTS sp_v2_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type VARCHAR(50) NOT NULL, -- merchant_master, commission_config, fee_bearer
  sync_mode VARCHAR(20) NOT NULL, -- full, incremental, single_merchant
  
  -- Stats
  records_synced INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  
  -- Status
  status VARCHAR(20) DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL')),
  error_message TEXT,
  
  -- Context
  triggered_by VARCHAR(100),
  sync_params JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_v2_sync_type ON sp_v2_sync_log(sync_type);
CREATE INDEX idx_v2_sync_status ON sp_v2_sync_log(status);
CREATE INDEX idx_v2_sync_started ON sp_v2_sync_log(started_at DESC);

COMMENT ON TABLE sp_v2_sync_log IS 'Audit log for all SabPaisa config sync operations';

-- =============================================
-- 8. UPDATE EXISTING SETTLEMENT TABLES
-- =============================================

-- Add fee_bearer to settlement_items if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sp_v2_settlement_items' 
    AND column_name = 'fee_bearer_code'
  ) THEN
    ALTER TABLE sp_v2_settlement_items 
    ADD COLUMN fee_bearer_code VARCHAR(10);
  END IF;
END $$;

-- Add commission_type to settlement_items if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sp_v2_settlement_items' 
    AND column_name = 'commission_type'
  ) THEN
    ALTER TABLE sp_v2_settlement_items 
    ADD COLUMN commission_type VARCHAR(20);
  END IF;
END $$;

-- Add commission_rate to settlement_items if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sp_v2_settlement_items' 
    AND column_name = 'commission_rate'
  ) THEN
    ALTER TABLE sp_v2_settlement_items 
    ADD COLUMN commission_rate DECIMAL(10,2);
  END IF;
END $$;

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_merchant_master_updated_at ON sp_v2_merchant_master;
CREATE TRIGGER update_merchant_master_updated_at 
  BEFORE UPDATE ON sp_v2_merchant_master 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_commission_config_updated_at ON sp_v2_merchant_commission_config;
CREATE TRIGGER update_commission_config_updated_at 
  BEFORE UPDATE ON sp_v2_merchant_commission_config 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fee_bearer_config_updated_at ON sp_v2_merchant_fee_bearer_config;
CREATE TRIGGER update_fee_bearer_config_updated_at 
  BEFORE UPDATE ON sp_v2_merchant_fee_bearer_config 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reserve_ledger_updated_at ON sp_v2_rolling_reserve_ledger;
CREATE TRIGGER update_reserve_ledger_updated_at 
  BEFORE UPDATE ON sp_v2_rolling_reserve_ledger 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SUMMARY
-- =============================================

-- Tables created:
-- 1. sp_v2_merchant_master (synced from merchant_data)
-- 2. sp_v2_merchant_commission_config (synced from merchant_base_rate)
-- 3. sp_v2_fee_bearer_types (seed data)
-- 4. sp_v2_merchant_fee_bearer_config (synced from merchant_fee_bearer)
-- 5. sp_v2_payment_mode_master (reference data)
-- 6. sp_v2_rolling_reserve_ledger (enhanced version)
-- 7. sp_v2_sync_log (sync audit trail)

COMMENT ON SCHEMA public IS 'V2 SettlePaisa - Independent settlement system with SabPaisa core integration';
