-- OP-0011: Chargeback Workflow Implementation
-- Database schema for chargeback/dispute management system

-- Enum for chargeback status
CREATE TYPE chargeback_status AS ENUM (
  'OPEN',
  'EVIDENCE_REQUIRED',
  'REPRESENTMENT_SUBMITTED',
  'PENDING_BANK',
  'WON',
  'LOST',
  'CANCELLED'
);

-- Enum for chargeback category
CREATE TYPE chargeback_category AS ENUM (
  'FRAUD',
  'QUALITY',
  'PROCESSING',
  'AUTHORIZATION',
  'NON_RECEIPT',
  'OTHER'
);

-- Enum for allocation type
CREATE TYPE chargeback_allocation_type AS ENUM (
  'RESERVE_HOLD',
  'RESERVE_RELEASE',
  'LOSS_ADJUSTMENT'
);

-- Enum for network type
CREATE TYPE network_type AS ENUM (
  'VISA',
  'MASTERCARD',
  'RUPAY',
  'UPI',
  'AMEX',
  'DINERS',
  'OTHER'
);

-- Main chargebacks table
CREATE TABLE chargebacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  merchant_name TEXT NOT NULL,
  acquirer TEXT NOT NULL,
  network network_type NOT NULL,
  case_ref TEXT NOT NULL UNIQUE, -- Unique case reference from acquirer
  txn_id TEXT NOT NULL, -- Gateway transaction ID
  rrn TEXT, -- Retrieval Reference Number
  utr TEXT, -- Unique Transaction Reference
  pg_ref TEXT, -- Payment Gateway Reference
  reason_code TEXT NOT NULL,
  reason_desc TEXT NOT NULL,
  category chargeback_category NOT NULL,
  disputed_amount_paise BIGINT NOT NULL CHECK (disputed_amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status chargeback_status NOT NULL DEFAULT 'OPEN',
  opened_at TIMESTAMPTZ NOT NULL,
  evidence_due_at TIMESTAMPTZ,
  decision_at TIMESTAMPTZ,
  owner_user_id UUID REFERENCES users(id),
  owner_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_chargebacks_merchant_id ON chargebacks(merchant_id);
CREATE INDEX idx_chargebacks_status ON chargebacks(status);
CREATE INDEX idx_chargebacks_category ON chargebacks(category);
CREATE INDEX idx_chargebacks_acquirer ON chargebacks(acquirer);
CREATE INDEX idx_chargebacks_txn_id ON chargebacks(txn_id);
CREATE INDEX idx_chargebacks_rrn ON chargebacks(rrn) WHERE rrn IS NOT NULL;
CREATE INDEX idx_chargebacks_utr ON chargebacks(utr) WHERE utr IS NOT NULL;
CREATE INDEX idx_chargebacks_opened_at ON chargebacks(opened_at);
CREATE INDEX idx_chargebacks_evidence_due_at ON chargebacks(evidence_due_at) WHERE evidence_due_at IS NOT NULL;
CREATE INDEX idx_chargebacks_owner_user_id ON chargebacks(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Chargeback events (timeline)
CREATE TABLE chargeback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chargeback_id UUID NOT NULL REFERENCES chargebacks(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for timeline queries
CREATE INDEX idx_chargeback_events_chargeback_id ON chargeback_events(chargeback_id);
CREATE INDEX idx_chargeback_events_ts ON chargeback_events(ts);

-- Evidence files
CREATE TABLE chargeback_evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chargeback_id UUID NOT NULL REFERENCES chargebacks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  storage_url TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for evidence queries
CREATE INDEX idx_chargeback_evidence_files_chargeback_id ON chargeback_evidence_files(chargeback_id);

-- Ledger allocations
CREATE TABLE chargeback_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chargeback_id UUID NOT NULL REFERENCES chargebacks(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL, -- Reference to ledger journal entry
  type chargeback_allocation_type NOT NULL,
  amount_paise BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for allocation queries
CREATE INDEX idx_chargeback_allocations_chargeback_id ON chargeback_allocations(chargeback_id);
CREATE INDEX idx_chargeback_allocations_journal_entry_id ON chargeback_allocations(journal_entry_id);
CREATE INDEX idx_chargeback_allocations_type ON chargeback_allocations(type);

-- Transaction details cache (denormalized for performance)
CREATE TABLE chargeback_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chargeback_id UUID NOT NULL REFERENCES chargebacks(id) ON DELETE CASCADE UNIQUE,
  txn_id TEXT NOT NULL,
  original_amount_paise BIGINT NOT NULL,
  fee_paise BIGINT NOT NULL DEFAULT 0,
  tax_paise BIGINT NOT NULL DEFAULT 0,
  net_amount_paise BIGINT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL,
  settlement_date TIMESTAMPTZ,
  customer_email TEXT,
  customer_phone TEXT,
  order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for transaction lookups
CREATE INDEX idx_chargeback_transactions_chargeback_id ON chargeback_transactions(chargeback_id);
CREATE INDEX idx_chargeback_transactions_txn_id ON chargeback_transactions(txn_id);

-- Notifications
CREATE TABLE chargeback_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('NEW_CHARGEBACK', 'EVIDENCE_DUE_SOON', 'EVIDENCE_OVERDUE', 'DECISION_RECEIVED')),
  chargeback_id UUID NOT NULL REFERENCES chargebacks(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  merchant_email TEXT,
  case_ref TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for notification queries
CREATE INDEX idx_chargeback_notifications_chargeback_id ON chargeback_notifications(chargeback_id);
CREATE INDEX idx_chargeback_notifications_scheduled_at ON chargeback_notifications(scheduled_at) WHERE sent_at IS NULL;
CREATE INDEX idx_chargeback_notifications_type ON chargeback_notifications(type);

-- Connector configuration for chargeback intake
CREATE TABLE chargeback_connector_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CHARGEBACK_SFTP', 'CHARGEBACK_API')),
  acquirer TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  schedule TEXT, -- Cron expression
  sftp_config JSONB, -- SFTP connection details
  api_config JSONB, -- API connection details
  mapping_template_id UUID REFERENCES chargeback_mapping_templates(id),
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for connector queries
CREATE INDEX idx_chargeback_connector_configs_acquirer ON chargeback_connector_configs(acquirer);
CREATE INDEX idx_chargeback_connector_configs_enabled ON chargeback_connector_configs(enabled);

-- Mapping templates for normalization
CREATE TABLE chargeback_mapping_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  acquirer TEXT NOT NULL,
  field_map JSONB NOT NULL, -- Field mapping configuration
  date_formats JSONB, -- Date parsing formats
  amount_parser JSONB, -- Amount parsing configuration
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for template queries
CREATE INDEX idx_chargeback_mapping_templates_acquirer ON chargeback_mapping_templates(acquirer);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_chargebacks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chargebacks_updated_at
  BEFORE UPDATE ON chargebacks
  FOR EACH ROW
  EXECUTE FUNCTION update_chargebacks_updated_at();

CREATE TRIGGER trigger_update_chargeback_connector_configs_updated_at
  BEFORE UPDATE ON chargeback_connector_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_chargebacks_updated_at();

CREATE TRIGGER trigger_update_chargeback_mapping_templates_updated_at
  BEFORE UPDATE ON chargeback_mapping_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_chargebacks_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON chargebacks TO sp_ops, sp_finance, sp_compliance;
GRANT SELECT ON chargebacks TO merchant_admin, merchant_ops, auditor;
GRANT SELECT, INSERT, UPDATE, DELETE ON chargeback_events TO sp_ops, sp_finance, sp_compliance;
GRANT SELECT ON chargeback_events TO merchant_admin, merchant_ops, auditor;
GRANT SELECT, INSERT, UPDATE, DELETE ON chargeback_evidence_files TO sp_ops, sp_finance, sp_compliance;
GRANT SELECT, INSERT ON chargeback_evidence_files TO merchant_admin, merchant_ops; -- Allow evidence upload
GRANT SELECT ON chargeback_allocations TO sp_ops, sp_finance, sp_compliance, auditor;
GRANT SELECT ON chargeback_transactions TO sp_ops, sp_finance, sp_compliance, merchant_admin, merchant_ops, auditor;
GRANT SELECT, INSERT, UPDATE ON chargeback_notifications TO sp_ops, sp_finance, sp_compliance;
GRANT SELECT, INSERT, UPDATE ON chargeback_connector_configs TO sp_ops, sp_compliance;
GRANT SELECT, INSERT, UPDATE ON chargeback_mapping_templates TO sp_ops, sp_compliance;

-- Comments for documentation
COMMENT ON TABLE chargebacks IS 'Main table for storing chargeback/dispute cases';
COMMENT ON TABLE chargeback_events IS 'Event timeline for chargebacks, append-only audit log';
COMMENT ON TABLE chargeback_evidence_files IS 'Evidence files uploaded for chargeback representment';
COMMENT ON TABLE chargeback_allocations IS 'Ledger allocations for reserve holds and adjustments';
COMMENT ON TABLE chargeback_transactions IS 'Cached transaction details for chargebacks';
COMMENT ON TABLE chargeback_notifications IS 'Notification queue for chargeback alerts';
COMMENT ON TABLE chargeback_connector_configs IS 'Configuration for automated chargeback intake';
COMMENT ON TABLE chargeback_mapping_templates IS 'Field mapping templates for normalizing acquirer data';