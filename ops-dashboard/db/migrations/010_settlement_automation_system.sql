-- Settlement Automation System (Option B - Production Ready)
-- Generated: 2025-10-02
-- Purpose: Full automated settlement with scheduler, approval workflow, and bank transfers

-- ============================================
-- 1. MERCHANT SETTLEMENT CONFIGURATION
-- ============================================

CREATE TABLE IF NOT EXISTS sp_v2_merchant_settlement_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL UNIQUE,
  merchant_name VARCHAR(200),
  
  -- Settlement Frequency
  settlement_frequency VARCHAR(20) NOT NULL DEFAULT 'daily', -- daily, weekly, monthly, on_demand
  settlement_day INTEGER, -- For weekly: 1=Monday, 7=Sunday; For monthly: 1-31
  settlement_time TIME DEFAULT '23:00:00', -- When to run settlement
  
  -- Settlement Rules
  auto_settle BOOLEAN DEFAULT true,
  min_settlement_amount_paise BIGINT DEFAULT 10000, -- Min ₹100 for settlement
  settlement_currency VARCHAR(3) DEFAULT 'INR',
  
  -- Bank Account Details
  account_holder_name VARCHAR(200),
  account_number VARCHAR(30),
  ifsc_code VARCHAR(11),
  bank_name VARCHAR(100),
  branch_name VARCHAR(100),
  account_type VARCHAR(20), -- savings, current
  
  -- Transfer Preferences
  preferred_transfer_mode VARCHAR(20) DEFAULT 'NEFT', -- NEFT, RTGS, IMPS, UPI
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100),
  
  CONSTRAINT valid_frequency CHECK (settlement_frequency IN ('daily', 'weekly', 'monthly', 'on_demand')),
  CONSTRAINT valid_transfer_mode CHECK (preferred_transfer_mode IN ('NEFT', 'RTGS', 'IMPS', 'UPI'))
);

CREATE INDEX idx_merchant_settlement_config_active ON sp_v2_merchant_settlement_config(merchant_id) WHERE is_active = true;
CREATE INDEX idx_merchant_settlement_config_auto ON sp_v2_merchant_settlement_config(auto_settle, settlement_frequency);

-- ============================================
-- 2. SETTLEMENT SCHEDULE RUNS (Audit Trail)
-- ============================================

CREATE TABLE IF NOT EXISTS sp_v2_settlement_schedule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  run_timestamp TIMESTAMP DEFAULT NOW(),
  trigger_type VARCHAR(20) NOT NULL, -- cron, manual, api
  triggered_by VARCHAR(100),
  
  -- Run Statistics
  total_merchants_eligible INTEGER DEFAULT 0,
  merchants_processed INTEGER DEFAULT 0,
  batches_created INTEGER DEFAULT 0,
  total_amount_settled_paise BIGINT DEFAULT 0,
  
  -- Status
  status VARCHAR(20) DEFAULT 'running', -- running, completed, failed, partial
  errors_count INTEGER DEFAULT 0,
  error_details JSONB,
  
  -- Execution Time
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  
  -- Logs
  execution_log TEXT,
  
  CONSTRAINT valid_trigger_type CHECK (trigger_type IN ('cron', 'manual', 'api')),
  CONSTRAINT valid_run_status CHECK (status IN ('running', 'completed', 'failed', 'partial'))
);

CREATE INDEX idx_settlement_runs_date ON sp_v2_settlement_schedule_runs(run_date DESC);
CREATE INDEX idx_settlement_runs_status ON sp_v2_settlement_schedule_runs(status);

-- ============================================
-- 3. SETTLEMENT BATCH APPROVALS
-- ============================================

CREATE TABLE IF NOT EXISTS sp_v2_settlement_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES sp_v2_settlement_batches(id) ON DELETE CASCADE,
  
  -- Approval Details
  approval_level INTEGER DEFAULT 1, -- Multi-level approval support
  approver_id VARCHAR(100),
  approver_name VARCHAR(200),
  approver_role VARCHAR(50),
  
  -- Decision
  decision VARCHAR(20) NOT NULL, -- approved, rejected, on_hold
  decision_at TIMESTAMP DEFAULT NOW(),
  approval_notes TEXT,
  rejection_reason TEXT,
  
  -- Conditions
  requires_manager_approval BOOLEAN DEFAULT false,
  manager_approved_by VARCHAR(100),
  manager_approved_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_decision CHECK (decision IN ('approved', 'rejected', 'on_hold'))
);

CREATE INDEX idx_approvals_batch ON sp_v2_settlement_approvals(batch_id);
CREATE INDEX idx_approvals_decision ON sp_v2_settlement_approvals(decision);

-- ============================================
-- 4. BANK TRANSFER QUEUE
-- ============================================

CREATE TABLE IF NOT EXISTS sp_v2_bank_transfer_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES sp_v2_settlement_batches(id),
  
  -- Transfer Details
  transfer_mode VARCHAR(20) NOT NULL, -- NEFT, RTGS, IMPS, UPI
  amount_paise BIGINT NOT NULL,
  
  -- Beneficiary
  beneficiary_name VARCHAR(200) NOT NULL,
  account_number VARCHAR(30) NOT NULL,
  ifsc_code VARCHAR(11) NOT NULL,
  bank_name VARCHAR(100),
  
  -- Transfer Status
  status VARCHAR(30) DEFAULT 'queued', -- queued, processing, sent, success, failed, reversed
  utr_number VARCHAR(50), -- Unique Transaction Reference
  bank_reference_number VARCHAR(100),
  
  -- Timestamps
  queued_at TIMESTAMP DEFAULT NOW(),
  processing_at TIMESTAMP,
  sent_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Error Handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  error_code VARCHAR(50),
  
  -- API Response
  api_request JSONB,
  api_response JSONB,
  
  -- Reconciliation
  bank_confirmed BOOLEAN DEFAULT false,
  bank_confirmation_date DATE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_transfer_mode CHECK (transfer_mode IN ('NEFT', 'RTGS', 'IMPS', 'UPI')),
  CONSTRAINT valid_transfer_status CHECK (status IN ('queued', 'processing', 'sent', 'success', 'failed', 'reversed'))
);

CREATE INDEX idx_transfer_queue_batch ON sp_v2_bank_transfer_queue(batch_id);
CREATE INDEX idx_transfer_queue_status ON sp_v2_bank_transfer_queue(status);
CREATE INDEX idx_transfer_queue_utr ON sp_v2_bank_transfer_queue(utr_number);

-- ============================================
-- 5. SETTLEMENT TRANSACTION MAPPING
-- ============================================

CREATE TABLE IF NOT EXISTS sp_v2_settlement_transaction_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_batch_id UUID NOT NULL REFERENCES sp_v2_settlement_batches(id) ON DELETE CASCADE,
  transaction_id VARCHAR(100) NOT NULL,
  
  -- Link to source transaction
  source_transaction_id BIGINT, -- FK to sp_v2_transactions.id
  
  -- Settlement Amount Breakdown
  transaction_amount_paise BIGINT NOT NULL,
  settlement_amount_paise BIGINT NOT NULL,
  fees_deducted_paise BIGINT DEFAULT 0,
  reserve_held_paise BIGINT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_settlement_txn_map_batch ON sp_v2_settlement_transaction_map(settlement_batch_id);
CREATE INDEX idx_settlement_txn_map_txn ON sp_v2_settlement_transaction_map(transaction_id);

-- ============================================
-- 6. SETTLEMENT ERRORS & RETRY LOG
-- ============================================

CREATE TABLE IF NOT EXISTS sp_v2_settlement_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type VARCHAR(50) NOT NULL, -- calculation_error, api_error, validation_error, bank_error
  
  -- Reference
  merchant_id VARCHAR(50),
  batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  transfer_id UUID REFERENCES sp_v2_bank_transfer_queue(id),
  
  -- Error Details
  error_message TEXT NOT NULL,
  error_code VARCHAR(50),
  error_stack TEXT,
  
  -- Context
  error_context JSONB, -- Store request/response data
  
  -- Resolution
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(100),
  resolution_notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_error_type CHECK (error_type IN ('calculation_error', 'api_error', 'validation_error', 'bank_error', 'config_error'))
);

CREATE INDEX idx_settlement_errors_type ON sp_v2_settlement_errors(error_type);
CREATE INDEX idx_settlement_errors_resolved ON sp_v2_settlement_errors(is_resolved);
CREATE INDEX idx_settlement_errors_merchant ON sp_v2_settlement_errors(merchant_id);

-- ============================================
-- 7. UPDATE EXISTING TABLES
-- ============================================

-- Add settlement status tracking to settlement_batches
ALTER TABLE sp_v2_settlement_batches 
  ADD COLUMN IF NOT EXISTS settlement_run_id UUID REFERENCES sp_v2_settlement_schedule_runs(id),
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending_approval',
  ADD COLUMN IF NOT EXISTS transfer_status VARCHAR(20) DEFAULT 'not_initiated',
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP;

-- Add settlement reference to transactions
ALTER TABLE sp_v2_transactions
  ADD COLUMN IF NOT EXISTS settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE sp_v2_merchant_settlement_config IS 'Merchant-specific settlement configuration and bank account details';
COMMENT ON TABLE sp_v2_settlement_schedule_runs IS 'Audit trail of automated settlement runs (cron/manual)';
COMMENT ON TABLE sp_v2_settlement_approvals IS 'Multi-level approval workflow for settlement batches';
COMMENT ON TABLE sp_v2_bank_transfer_queue IS 'Queue for bank transfers (NEFT/RTGS/IMPS) with retry logic';
COMMENT ON TABLE sp_v2_settlement_transaction_map IS 'Maps transactions to settlement batches';
COMMENT ON TABLE sp_v2_settlement_errors IS 'Error tracking and resolution for settlement issues';
