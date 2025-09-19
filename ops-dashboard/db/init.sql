-- SettlePaisa Ops Dashboard Database Schema
-- Version: 1.0.0

-- Create database if not exists
SELECT 'CREATE DATABASE ops_dashboard'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ops_dashboard')\gexec

-- Use the ops_dashboard database
\c ops_dashboard;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- DATA SOURCE TABLES
-- =====================================================

-- Data Source (Connectors)
CREATE TABLE IF NOT EXISTS data_source (
    source_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('PG_HTTP_API', 'PG_DB_PULL', 'BANK_SFTP', 'BANK_HTTP_API')),
    merchant_id VARCHAR(50),
    acquirer_code VARCHAR(20),
    path_or_endpoint TEXT NOT NULL,
    file_glob VARCHAR(100),
    http_method VARCHAR(10),
    headers_json JSONB,
    mapping_template_id VARCHAR(50),
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data Source Secrets (KMS-encrypted)
CREATE TABLE IF NOT EXISTS data_source_secret (
    secret_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    source_id VARCHAR(50) NOT NULL REFERENCES data_source(source_id) ON DELETE CASCADE,
    secret_type VARCHAR(20) NOT NULL CHECK (secret_type IN ('PASSWORD', 'API_KEY', 'SSH_KEY', 'CERTIFICATE')),
    encrypted_value TEXT NOT NULL, -- KMS-encrypted
    kms_key_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_id, secret_type)
);

-- Ingestion Schedule
CREATE TABLE IF NOT EXISTS ingest_schedule (
    schedule_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    source_id VARCHAR(50) NOT NULL REFERENCES data_source(source_id) ON DELETE CASCADE,
    cron_expr VARCHAR(50) NOT NULL, -- e.g., "0 0 19 * * ?" for 7 PM IST daily
    next_run_at TIMESTAMP WITH TIME ZONE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    is_paused BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_id)
);

-- Ingestion Jobs
CREATE TABLE IF NOT EXISTS ingest_job (
    job_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    source_id VARCHAR(50) NOT NULL REFERENCES data_source(source_id),
    cycle_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DLQ')),
    attempt INT DEFAULT 1,
    max_attempt INT DEFAULT 3,
    artifact_uri TEXT, -- S3 path to raw file
    rows_ingested INT,
    bytes_ingested BIGINT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INT GENERATED ALWAYS AS (
        CASE 
            WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
            ELSE NULL
        END
    ) STORED,
    UNIQUE(source_id, cycle_date)
);

-- Ingestion Events (audit log)
CREATE TABLE IF NOT EXISTS ingest_event (
    event_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES ingest_job(job_id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('CONNECT', 'LIST', 'DOWNLOAD', 'DECRYPT', 'VERIFY', 'UPLOAD_RAW', 'COMPLETE', 'ERROR')),
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- RECONCILIATION TABLES
-- =====================================================

-- Reconciliation Jobs
CREATE TABLE IF NOT EXISTS recon_job (
    job_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cycle_date DATE NOT NULL,
    pg_file_path TEXT,
    bank_file_path TEXT,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    pg_total_amount BIGINT, -- in paise
    bank_total_amount BIGINT, -- in paise
    matched_count INT DEFAULT 0,
    unmatched_pg_count INT DEFAULT 0,
    unmatched_bank_count INT DEFAULT 0,
    matched_amount BIGINT DEFAULT 0, -- in paise
    variance_amount BIGINT DEFAULT 0, -- in paise
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Normalized Transactions
CREATE TABLE IF NOT EXISTS normalized_transaction (
    txn_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES recon_job(job_id) ON DELETE CASCADE,
    source VARCHAR(10) NOT NULL CHECK (source IN ('PG', 'BANK')),
    transaction_id VARCHAR(100) NOT NULL,
    amount BIGINT NOT NULL, -- in paise
    status VARCHAR(20),
    transaction_date DATE,
    merchant_ref VARCHAR(100),
    bank_ref VARCHAR(100),
    raw_data JSONB, -- original row data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_job_source (job_id, source),
    INDEX idx_transaction_id (transaction_id)
);

-- Reconciliation Matches
CREATE TABLE IF NOT EXISTS recon_match (
    match_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES recon_job(job_id) ON DELETE CASCADE,
    pg_txn_id UUID NOT NULL REFERENCES normalized_transaction(txn_id),
    bank_txn_id UUID NOT NULL REFERENCES normalized_transaction(txn_id),
    match_type VARCHAR(20) CHECK (match_type IN ('EXACT', 'FUZZY', 'MANUAL')),
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unmatched Transactions
CREATE TABLE IF NOT EXISTS recon_unmatched (
    unmatched_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES recon_job(job_id) ON DELETE CASCADE,
    txn_id UUID NOT NULL REFERENCES normalized_transaction(txn_id),
    source VARCHAR(10) NOT NULL CHECK (source IN ('PG', 'BANK')),
    reason VARCHAR(100),
    resolution_status VARCHAR(20) DEFAULT 'PENDING' CHECK (resolution_status IN ('PENDING', 'RESOLVED', 'ESCALATED')),
    resolution_notes TEXT,
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- BANK SCHEMA CONFIGURATIONS
-- =====================================================

-- Bank Schema Templates
CREATE TABLE IF NOT EXISTS bank_schema (
    schema_id VARCHAR(50) PRIMARY KEY,
    bank_name VARCHAR(100) NOT NULL,
    schema_name VARCHAR(100) NOT NULL,
    field_mappings JSONB NOT NULL, -- Maps standard fields to bank-specific column names
    validation_rules JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_data_source_type ON data_source(type);
CREATE INDEX IF NOT EXISTS idx_data_source_enabled ON data_source(is_enabled);
CREATE INDEX IF NOT EXISTS idx_ingest_job_source_status ON ingest_job(source_id, status);
CREATE INDEX IF NOT EXISTS idx_ingest_job_cycle_date ON ingest_job(cycle_date);
CREATE INDEX IF NOT EXISTS idx_ingest_event_job ON ingest_event(job_id);
CREATE INDEX IF NOT EXISTS idx_recon_job_cycle_date ON recon_job(cycle_date);
CREATE INDEX IF NOT EXISTS idx_recon_job_status ON recon_job(status);

-- =====================================================
-- SEED DATA
-- =====================================================

-- Insert default bank schemas
INSERT INTO bank_schema (schema_id, bank_name, schema_name, field_mappings, is_active) VALUES
('hdfc_standard', 'HDFC Bank', 'Standard Format', '{
    "transactionId": {"sourceColumn": "txn_id", "dataType": "string"},
    "amount": {"sourceColumn": "amount", "dataType": "number"},
    "status": {"sourceColumn": "status", "dataType": "string"},
    "transactionDate": {"sourceColumn": "date", "dataType": "date"},
    "merchantRef": {"sourceColumn": "merchant_ref", "dataType": "string"},
    "bankRef": {"sourceColumn": "bank_ref", "dataType": "string"}
}'::jsonb, true),
('icici_standard', 'ICICI Bank', 'Standard Format', '{
    "transactionId": {"sourceColumn": "transaction_id", "dataType": "string"},
    "amount": {"sourceColumn": "transaction_amount", "dataType": "number"},
    "status": {"sourceColumn": "transaction_status", "dataType": "string"},
    "transactionDate": {"sourceColumn": "transaction_date", "dataType": "date"},
    "merchantRef": {"sourceColumn": "order_id", "dataType": "string"},
    "bankRef": {"sourceColumn": "bank_reference", "dataType": "string"}
}'::jsonb, true),
('axis_standard', 'AXIS Bank', 'Standard Format', '{
    "transactionId": {"sourceColumn": "trans_id", "dataType": "string"},
    "amount": {"sourceColumn": "trans_amt", "dataType": "number"},
    "status": {"sourceColumn": "trans_status", "dataType": "string"},
    "transactionDate": {"sourceColumn": "trans_dt", "dataType": "date"},
    "merchantRef": {"sourceColumn": "order_ref", "dataType": "string"},
    "bankRef": {"sourceColumn": "bank_txn_id", "dataType": "string"}
}'::jsonb, true)
ON CONFLICT (schema_id) DO NOTHING;

-- Insert demo connectors
INSERT INTO data_source (source_id, name, type, path_or_endpoint, file_glob, is_enabled) VALUES
('demo_hdfc_sftp', 'HDFC Bank SFTP (Demo)', 'BANK_SFTP', '/upload', 'hdfc_*.csv', true),
('demo_icici_sftp', 'ICICI Bank SFTP (Demo)', 'BANK_SFTP', '/upload', 'icici_*.csv', true),
('demo_axis_sftp', 'AXIS Bank SFTP (Demo)', 'BANK_SFTP', '/upload', 'axis_*.csv', true),
('demo_pg_api', 'Payment Gateway API (Demo)', 'PG_HTTP_API', 'https://api.example.com/transactions', NULL, true)
ON CONFLICT (source_id) DO NOTHING;

-- Insert demo schedules
INSERT INTO ingest_schedule (source_id, cron_expr, is_paused) VALUES
('demo_hdfc_sftp', '0 0 19 * * ?', false), -- Daily at 7 PM IST
('demo_icici_sftp', '0 30 19 * * ?', false), -- Daily at 7:30 PM IST
('demo_axis_sftp', '0 0 20 * * ?', false), -- Daily at 8 PM IST
('demo_pg_api', '0 */30 * * * ?', false) -- Every 30 minutes
ON CONFLICT (source_id) DO NOTHING;

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to tables with updated_at
CREATE TRIGGER update_data_source_updated_at BEFORE UPDATE ON data_source
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_source_secret_updated_at BEFORE UPDATE ON data_source_secret
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ingest_schedule_updated_at BEFORE UPDATE ON ingest_schedule
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recon_job_updated_at BEFORE UPDATE ON recon_job
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-reconciliation trigger function
CREATE OR REPLACE FUNCTION check_and_trigger_recon()
RETURNS TRIGGER AS $$
DECLARE
    v_pg_exists BOOLEAN;
    v_bank_exists BOOLEAN;
    v_recon_exists BOOLEAN;
BEGIN
    -- Check if both PG and Bank files exist for the cycle date
    SELECT EXISTS(
        SELECT 1 FROM ingest_job 
        WHERE cycle_date = NEW.cycle_date 
        AND source_id IN (SELECT source_id FROM data_source WHERE type LIKE 'PG_%')
        AND status = 'SUCCEEDED'
    ) INTO v_pg_exists;
    
    SELECT EXISTS(
        SELECT 1 FROM ingest_job 
        WHERE cycle_date = NEW.cycle_date 
        AND source_id IN (SELECT source_id FROM data_source WHERE type LIKE 'BANK_%')
        AND status = 'SUCCEEDED'
    ) INTO v_bank_exists;
    
    -- Check if reconciliation already exists
    SELECT EXISTS(
        SELECT 1 FROM recon_job 
        WHERE cycle_date = NEW.cycle_date
    ) INTO v_recon_exists;
    
    -- If both files exist and no recon job exists, create one
    IF v_pg_exists AND v_bank_exists AND NOT v_recon_exists THEN
        INSERT INTO recon_job (cycle_date, status, created_at)
        VALUES (NEW.cycle_date, 'PENDING', NOW());
        
        RAISE NOTICE 'Auto-triggered reconciliation for cycle date %', NEW.cycle_date;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for auto-reconciliation
CREATE TRIGGER trigger_auto_reconciliation 
AFTER INSERT OR UPDATE OF status ON ingest_job
FOR EACH ROW 
WHEN (NEW.status = 'SUCCEEDED')
EXECUTE FUNCTION check_and_trigger_recon();

-- =====================================================
-- CONNECTOR TABLES (OP-0008)
-- =====================================================

-- Connector configuration table
CREATE TABLE recon_connector (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('SFTP', 'API')),
    provider TEXT NOT NULL CHECK (provider IN ('AXIS', 'BOB', 'HDFC', 'ICICI', 'PG', 'CUSTOM')),
    merchant_id UUID NULL REFERENCES merchant(id),
    acquirer_code TEXT NULL,
    config JSONB NOT NULL, -- host, port, path, pattern, auth, schedule cron, timezone
    mapping_template_id UUID NULL REFERENCES recon_mapping_template(id),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED')),
    last_run_at TIMESTAMPTZ,
    last_ok_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(name)
);

-- Connector run history
CREATE TABLE recon_connector_run (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id UUID NOT NULL REFERENCES recon_connector(id),
    cycle_date DATE NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    outcome TEXT CHECK (outcome IN ('SUCCESS', 'PARTIAL', 'FAILED')),
    files_discovered INTEGER DEFAULT 0,
    files_downloaded INTEGER DEFAULT 0,
    recon_job_id UUID REFERENCES recon_job(id),
    error TEXT,
    metrics JSONB, -- additional runtime metrics
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ingested files tracking
CREATE TABLE recon_ingested_file (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id UUID NOT NULL REFERENCES recon_connector(id),
    connector_run_id UUID REFERENCES recon_connector_run(id),
    cycle_date DATE NOT NULL,
    remote_path TEXT NOT NULL,
    local_uri TEXT, -- S3/object store URI
    sha256 TEXT,
    pgp_verified BOOLEAN DEFAULT FALSE,
    file_bytes BIGINT,
    dedupe_key TEXT UNIQUE, -- provider|cycle|sha256
    state TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (state IN ('DISCOVERED', 'DOWNLOADED', 'NORMALIZED', 'MATCHED', 'ERROR')),
    error TEXT,
    recon_file_id UUID REFERENCES recon_file(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for connector tables
CREATE INDEX idx_recon_connector_status ON recon_connector(status);
CREATE INDEX idx_recon_connector_provider ON recon_connector(provider);
CREATE INDEX idx_recon_connector_merchant ON recon_connector(merchant_id);
CREATE INDEX idx_recon_connector_run_connector ON recon_connector_run(connector_id, cycle_date);
CREATE INDEX idx_recon_connector_run_outcome ON recon_connector_run(outcome);
CREATE INDEX idx_recon_ingested_file_connector ON recon_ingested_file(connector_id, cycle_date);
CREATE INDEX idx_recon_ingested_file_dedupe ON recon_ingested_file(dedupe_key);
CREATE INDEX idx_recon_ingested_file_state ON recon_ingested_file(state);

-- Connector health metrics view
CREATE VIEW connector_health AS
SELECT 
    c.id,
    c.name,
    c.type,
    c.provider,
    c.status,
    c.last_run_at,
    c.last_ok_at,
    CASE 
        WHEN c.last_ok_at IS NULL THEN 'NEVER_RUN'
        WHEN c.last_ok_at > NOW() - INTERVAL '1 day' THEN 'HEALTHY'
        WHEN c.last_ok_at > NOW() - INTERVAL '3 days' THEN 'WARNING'
        ELSE 'CRITICAL'
    END as health_status,
    COUNT(DISTINCT cr.id) as total_runs,
    COUNT(DISTINCT CASE WHEN cr.outcome = 'SUCCESS' THEN cr.id END) as successful_runs,
    COUNT(DISTINCT CASE WHEN cr.outcome = 'FAILED' THEN cr.id END) as failed_runs
FROM recon_connector c
LEFT JOIN recon_connector_run cr ON c.id = cr.connector_id
GROUP BY c.id, c.name, c.type, c.provider, c.status, c.last_run_at, c.last_ok_at;

-- =====================================================
-- REPORT TABLES (OP-0009)
-- =====================================================

-- Report schedule configuration
CREATE TABLE IF NOT EXISTS report_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('SETTLEMENT_SUMMARY', 'BANK_MIS', 'RECON_OUTCOME', 'TAX')),
    filters JSONB NOT NULL DEFAULT '{}',
    cadence_cron TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    format TEXT NOT NULL CHECK (format IN ('CSV', 'XLSX')),
    delivery TEXT NOT NULL CHECK (delivery IN ('EMAIL', 'S3', 'BOTH')),
    recipients TEXT[] NOT NULL DEFAULT '{}',
    s3_prefix TEXT,
    is_enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP,
    last_run_status TEXT CHECK (last_run_status IN ('SUCCESS', 'FAILED', 'RUNNING')),
    next_run_at TIMESTAMP,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Report export audit trail
CREATE TABLE IF NOT EXISTS report_export_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type TEXT NOT NULL,
    filters JSONB NOT NULL,
    format TEXT NOT NULL,
    generated_by TEXT NOT NULL,
    generated_at TIMESTAMP DEFAULT NOW(),
    object_key TEXT,
    file_size_bytes BIGINT,
    row_count INTEGER,
    signature TEXT,
    signed_url TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for report tables
CREATE INDEX idx_report_schedule_type ON report_schedule(type);
CREATE INDEX idx_report_schedule_enabled ON report_schedule(is_enabled);
CREATE INDEX idx_report_schedule_next_run ON report_schedule(next_run_at) WHERE is_enabled = true;
CREATE INDEX idx_report_export_audit_type ON report_export_audit(report_type);
CREATE INDEX idx_report_export_audit_generated_at ON report_export_audit(generated_at);
CREATE INDEX idx_report_export_audit_generated_by ON report_export_audit(generated_by);

-- =====================================================
-- PERMISSIONS
-- =====================================================

-- Grant permissions to ops_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ops_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ops_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ops_user;