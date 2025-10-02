-- SettlePaisa V2 Database Schema
-- Complete table structure for dashboard tile population
-- Created: 2024-09-29

-- =============================================================================
-- CORE TRANSACTION TABLES
-- =============================================================================

-- Main transaction ingestion table (from Manual Upload & Connectors)
CREATE TABLE IF NOT EXISTS sp_v2_transactions (
    id BIGSERIAL PRIMARY KEY,
    transaction_id VARCHAR(100) NOT NULL UNIQUE,
    merchant_id VARCHAR(50) NOT NULL,
    amount_paise BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    transaction_date DATE NOT NULL,
    transaction_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Source tracking
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('MANUAL_UPLOAD', 'CONNECTOR')),
    source_name VARCHAR(100), -- File name or connector name
    batch_id VARCHAR(100),
    
    -- Payment details
    payment_method VARCHAR(50),
    gateway_ref VARCHAR(100),
    utr VARCHAR(50),
    rrn VARCHAR(50),
    
    -- Status and metadata
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RECONCILED', 'EXCEPTION', 'FAILED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Will create indexes separately after table creation
);

-- Bank statement data (from Manual Upload & SFTP Connectors)  
CREATE TABLE IF NOT EXISTS sp_v2_bank_statements (
    id BIGSERIAL PRIMARY KEY,
    bank_ref VARCHAR(100) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    amount_paise BIGINT NOT NULL,
    transaction_date DATE NOT NULL,
    value_date DATE,
    
    -- Bank details
    utr VARCHAR(50),
    remarks TEXT,
    debit_credit VARCHAR(10) CHECK (debit_credit IN ('DEBIT', 'CREDIT')),
    
    -- Source tracking
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('MANUAL_UPLOAD', 'SFTP_CONNECTOR')),
    source_file VARCHAR(255),
    batch_id VARCHAR(100),
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    matched_transaction_id VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- RECONCILIATION TABLES (Powers KPI tiles)
-- =============================================================================

-- Reconciliation jobs (Manual Upload reconciliation runs)
CREATE TABLE IF NOT EXISTS sp_v2_reconciliation_jobs (
    id BIGSERIAL PRIMARY KEY,
    job_id VARCHAR(100) NOT NULL UNIQUE,
    job_name VARCHAR(255) NOT NULL,
    
    -- Job parameters
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    source_types TEXT[], -- ['MANUAL_UPLOAD', 'CONNECTOR']
    
    -- Job metrics (populates KPI tiles)
    total_pg_records INTEGER DEFAULT 0,
    total_bank_records INTEGER DEFAULT 0,
    matched_records INTEGER DEFAULT 0,
    unmatched_pg INTEGER DEFAULT 0,
    unmatched_bank INTEGER DEFAULT 0,
    exception_records INTEGER DEFAULT 0,
    
    -- Financial metrics (populates amount tiles)
    total_amount_paise BIGINT DEFAULT 0,
    reconciled_amount_paise BIGINT DEFAULT 0,
    variance_amount_paise BIGINT DEFAULT 0,
    
    -- Processing status
    status VARCHAR(20) DEFAULT 'RUNNING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    processing_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_end TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reconciliation results (detailed match/exception data)
CREATE TABLE IF NOT EXISTS sp_v2_reconciliation_results (
    id BIGSERIAL PRIMARY KEY,
    job_id VARCHAR(100) NOT NULL REFERENCES sp_v2_reconciliation_jobs(job_id),
    
    -- Transaction references
    pg_transaction_id VARCHAR(100),
    bank_statement_id BIGINT,
    
    -- Match details
    match_status VARCHAR(20) NOT NULL CHECK (match_status IN ('MATCHED', 'UNMATCHED_PG', 'UNMATCHED_BANK', 'EXCEPTION')),
    match_score DECIMAL(5,2), -- Confidence score 0-100
    
    -- Exception details (populates Exception tiles)
    exception_reason_code VARCHAR(50),
    exception_severity VARCHAR(20) CHECK (exception_severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    exception_message TEXT,
    
    -- Amounts
    pg_amount_paise BIGINT,
    bank_amount_paise BIGINT,
    variance_paise BIGINT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- EXCEPTION MANAGEMENT (Powers Exception tiles)
-- =============================================================================

-- Exception reason codes and descriptions
CREATE TABLE IF NOT EXISTS sp_v2_exception_reasons (
    id SERIAL PRIMARY KEY,
    reason_code VARCHAR(50) NOT NULL UNIQUE,
    reason_label VARCHAR(255) NOT NULL,
    description TEXT,
    default_severity VARCHAR(20) DEFAULT 'MEDIUM' CHECK (default_severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exception tracking (aggregated for dashboard)
CREATE TABLE IF NOT EXISTS sp_v2_exceptions_summary (
    id BIGSERIAL PRIMARY KEY,
    summary_date DATE NOT NULL,
    reason_code VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    
    -- Counts for dashboard tiles
    exception_count INTEGER DEFAULT 0,
    total_amount_paise BIGINT DEFAULT 0,
    
    -- Source breakdown
    manual_upload_count INTEGER DEFAULT 0,
    connector_count INTEGER DEFAULT 0,
    
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints and indexes
    UNIQUE(summary_date, reason_code, severity),
    INDEX idx_exception_summary_date (summary_date),
    INDEX idx_exception_summary_severity (severity)
);

-- =============================================================================
-- CONNECTOR & SOURCE MANAGEMENT (Powers Connector Health tiles)
-- =============================================================================

-- Connector definitions and health
CREATE TABLE IF NOT EXISTS sp_v2_connectors (
    id SERIAL PRIMARY KEY,
    connector_name VARCHAR(100) NOT NULL UNIQUE,
    connector_type VARCHAR(50) NOT NULL, -- 'SFTP', 'API', 'FILE_UPLOAD'
    
    -- Configuration
    is_active BOOLEAN DEFAULT TRUE,
    bank_name VARCHAR(100),
    description TEXT,
    
    -- Health monitoring
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_successful_sync TIMESTAMP WITH TIME ZONE,
    sync_frequency_minutes INTEGER DEFAULT 60,
    
    -- Status for dashboard
    health_status VARCHAR(20) DEFAULT 'UNKNOWN' CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN')),
    last_error_message TEXT,
    last_health_check TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_connectors_active (is_active),
    INDEX idx_connectors_health (health_status)
);

-- Connector sync history (for lag calculation)
CREATE TABLE IF NOT EXISTS sp_v2_connector_sync_history (
    id BIGSERIAL PRIMARY KEY,
    connector_id INTEGER NOT NULL REFERENCES sp_v2_connectors(id),
    
    -- Sync details
    sync_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    sync_status VARCHAR(20) NOT NULL CHECK (sync_status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
    
    -- Data metrics
    records_processed INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    file_name VARCHAR(255),
    file_size_bytes BIGINT,
    
    -- Processing time
    processing_duration_ms INTEGER,
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_sync_history_connector (connector_id),
    INDEX idx_sync_history_timestamp (sync_timestamp)
);

-- =============================================================================
-- SETTLEMENT PIPELINE (Powers Settlement Pipeline tiles)
-- =============================================================================

-- Settlement batches
CREATE TABLE IF NOT EXISTS sp_v2_settlements (
    id BIGSERIAL PRIMARY KEY,
    settlement_id VARCHAR(100) NOT NULL UNIQUE,
    merchant_id VARCHAR(50) NOT NULL,
    
    -- Settlement details
    settlement_date DATE NOT NULL,
    cycle_date DATE NOT NULL,
    
    -- Pipeline status (populates pipeline visualization)
    pipeline_status VARCHAR(30) NOT NULL CHECK (pipeline_status IN ('CAPTURED', 'IN_SETTLEMENT', 'SENT_TO_BANK', 'CREDITED', 'FAILED', 'UNSETTLED')),
    
    -- Financial data
    gross_amount_paise BIGINT NOT NULL,
    fees_paise BIGINT DEFAULT 0,
    tax_paise BIGINT DEFAULT 0,
    net_amount_paise BIGINT NOT NULL,
    
    -- Timing
    captured_at TIMESTAMP WITH TIME ZONE,
    settlement_initiated_at TIMESTAMP WITH TIME ZONE,
    bank_transfer_at TIMESTAMP WITH TIME ZONE,
    credited_at TIMESTAMP WITH TIME ZONE,
    
    -- Reconciliation link
    reconciliation_job_id VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for pipeline queries
    INDEX idx_settlements_date (settlement_date),
    INDEX idx_settlements_status (pipeline_status),
    INDEX idx_settlements_merchant (merchant_id)
);

-- =============================================================================
-- DASHBOARD AGGREGATION TABLES (Optimized for tile queries)
-- =============================================================================

-- Daily KPI summary (pre-calculated for fast dashboard loading)
CREATE TABLE IF NOT EXISTS sp_v2_daily_kpis (
    id BIGSERIAL PRIMARY KEY,
    summary_date DATE NOT NULL,
    
    -- Transaction metrics (KPI tiles)
    total_transactions INTEGER DEFAULT 0,
    total_amount_paise BIGINT DEFAULT 0,
    matched_transactions INTEGER DEFAULT 0,
    matched_amount_paise BIGINT DEFAULT 0,
    unmatched_transactions INTEGER DEFAULT 0,
    exception_transactions INTEGER DEFAULT 0,
    
    -- Match rate (percentage tile)
    match_rate_percentage DECIMAL(5,2) DEFAULT 0.00,
    
    -- Source breakdown (source tiles)
    manual_upload_transactions INTEGER DEFAULT 0,
    connector_transactions INTEGER DEFAULT 0,
    manual_upload_matched INTEGER DEFAULT 0,
    connector_matched INTEGER DEFAULT 0,
    
    -- Settlement pipeline counts
    captured_count INTEGER DEFAULT 0,
    in_settlement_count INTEGER DEFAULT 0,
    sent_to_bank_count INTEGER DEFAULT 0,
    credited_count INTEGER DEFAULT 0,
    unsettled_count INTEGER DEFAULT 0,
    
    -- Last updated
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(summary_date),
    INDEX idx_daily_kpis_date (summary_date)
);

-- =============================================================================
-- INITIAL DATA SETUP
-- =============================================================================

-- Insert default exception reason codes
INSERT INTO sp_v2_exception_reasons (reason_code, reason_label, description, default_severity) VALUES
('MISSING_UTR', 'Missing UTR', 'Bank UTR not found in transaction data', 'CRITICAL'),
('DUPLICATE_UTR', 'Duplicate UTR', 'Same UTR found in multiple transactions', 'HIGH'),
('AMOUNT_MISMATCH', 'Amount Mismatch', 'PG amount does not match bank amount', 'HIGH'),
('DATE_MISMATCH', 'Date Mismatch', 'Transaction date differs between PG and bank', 'MEDIUM'),
('INVALID_REFERENCE', 'Invalid Reference', 'Invalid or malformed reference number', 'MEDIUM'),
('BANK_CHARGE_VARIANCE', 'Bank Charge Variance', 'Unexpected bank charges applied', 'LOW'),
('TIMING_DIFFERENCE', 'Timing Difference', 'Transaction processed on different dates', 'LOW')
ON CONFLICT (reason_code) DO NOTHING;

-- Insert default connectors
INSERT INTO sp_v2_connectors (connector_name, connector_type, bank_name, description, is_active) VALUES
('AXIS_SFTP', 'SFTP', 'Axis Bank', 'SFTP connector for Axis Bank statements', TRUE),
('HDFC_SFTP', 'SFTP', 'HDFC Bank', 'SFTP connector for HDFC Bank statements', TRUE),
('ICICI_SFTP', 'SFTP', 'ICICI Bank', 'SFTP connector for ICICI Bank statements', TRUE),
('SBI_API', 'API', 'State Bank of India', 'API connector for SBI real-time data', TRUE),
('MANUAL_UPLOAD', 'FILE_UPLOAD', 'Multiple', 'Manual file upload processor', TRUE)
ON CONFLICT (connector_name) DO NOTHING;

-- =============================================================================
-- SAMPLE DATA FOR DEMONSTRATION
-- =============================================================================

-- Insert sample reconciliation job
INSERT INTO sp_v2_reconciliation_jobs (
    job_id, job_name, date_from, date_to, 
    total_pg_records, total_bank_records, matched_records, 
    unmatched_pg, unmatched_bank, exception_records,
    total_amount_paise, reconciled_amount_paise, variance_amount_paise,
    status, processing_end
) VALUES (
    'DEMO_JOB_20240929', 'Manual Upload Demo Reconciliation', 
    '2024-09-29', '2024-09-29',
    47, 45, 17,
    15, 15, 28,
    330000, 250000, 80000,
    'COMPLETED', NOW()
) ON CONFLICT (job_id) DO NOTHING;

-- Insert sample daily KPI data
INSERT INTO sp_v2_daily_kpis (
    summary_date,
    total_transactions, total_amount_paise,
    matched_transactions, matched_amount_paise,
    unmatched_transactions, exception_transactions,
    match_rate_percentage,
    manual_upload_transactions, connector_transactions,
    manual_upload_matched, connector_matched,
    captured_count, in_settlement_count, sent_to_bank_count, credited_count, unsettled_count
) VALUES (
    '2024-09-29',
    47, 330000,
    17, 250000, 
    30, 28,
    36.17,
    32, 15,
    12, 5,
    47, 3, 17, 14, 30
) ON CONFLICT (summary_date) DO UPDATE SET
    total_transactions = EXCLUDED.total_transactions,
    total_amount_paise = EXCLUDED.total_amount_paise,
    matched_transactions = EXCLUDED.matched_transactions,
    matched_amount_paise = EXCLUDED.matched_amount_paise,
    unmatched_transactions = EXCLUDED.unmatched_transactions,
    exception_transactions = EXCLUDED.exception_transactions,
    match_rate_percentage = EXCLUDED.match_rate_percentage,
    calculated_at = NOW();

-- Insert sample exception summary data
INSERT INTO sp_v2_exceptions_summary (
    summary_date, reason_code, severity, 
    exception_count, total_amount_paise,
    manual_upload_count, connector_count
) VALUES 
('2024-09-29', 'MISSING_UTR', 'CRITICAL', 11, 45000, 8, 3),
('2024-09-29', 'DUPLICATE_UTR', 'HIGH', 8, 32000, 5, 3),
('2024-09-29', 'AMOUNT_MISMATCH', 'HIGH', 6, 18000, 4, 2),
('2024-09-29', 'DATE_MISMATCH', 'MEDIUM', 3, 5000, 2, 1)
ON CONFLICT (summary_date, reason_code, severity) DO UPDATE SET
    exception_count = EXCLUDED.exception_count,
    total_amount_paise = EXCLUDED.total_amount_paise,
    manual_upload_count = EXCLUDED.manual_upload_count,
    connector_count = EXCLUDED.connector_count,
    last_updated = NOW();

-- =============================================================================
-- DASHBOARD VIEWS FOR OPTIMIZED QUERIES
-- =============================================================================

-- View for overview dashboard tiles
CREATE OR REPLACE VIEW v_dashboard_overview AS
SELECT 
    summary_date,
    total_transactions,
    total_amount_paise,
    matched_transactions,
    matched_amount_paise,
    (total_amount_paise - matched_amount_paise) as variance_amount_paise,
    unmatched_transactions,
    exception_transactions,
    match_rate_percentage,
    manual_upload_transactions,
    connector_transactions,
    captured_count,
    in_settlement_count, 
    sent_to_bank_count,
    credited_count,
    unsettled_count
FROM sp_v2_daily_kpis
ORDER BY summary_date DESC;

-- View for exception breakdown
CREATE OR REPLACE VIEW v_exception_summary AS
SELECT 
    summary_date,
    reason_code,
    er.reason_label,
    severity,
    exception_count,
    total_amount_paise,
    manual_upload_count + connector_count as total_count
FROM sp_v2_exceptions_summary es
JOIN sp_v2_exception_reasons er ON es.reason_code = er.reason_code
ORDER BY summary_date DESC, exception_count DESC;

-- =============================================================================
-- INDEXES FOR DASHBOARD PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_dashboard_summary 
ON sp_v2_transactions (transaction_date, source_type, status);

CREATE INDEX IF NOT EXISTS idx_reconciliation_dashboard_metrics
ON sp_v2_reconciliation_results (job_id, match_status, exception_severity);

CREATE INDEX IF NOT EXISTS idx_settlements_pipeline_status
ON sp_v2_settlements (settlement_date, pipeline_status);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE sp_v2_transactions IS 'Main transaction table populated by Manual Upload and Connectors';
COMMENT ON TABLE sp_v2_reconciliation_jobs IS 'Reconciliation job results that populate KPI tiles';
COMMENT ON TABLE sp_v2_daily_kpis IS 'Pre-calculated daily metrics for fast dashboard loading';
COMMENT ON TABLE sp_v2_exceptions_summary IS 'Exception breakdowns for Exception tiles';
COMMENT ON TABLE sp_v2_connectors IS 'Connector health data for Connector Health tiles';
COMMENT ON TABLE sp_v2_settlements IS 'Settlement pipeline data for Pipeline visualization';

COMMENT ON VIEW v_dashboard_overview IS 'Optimized view for main dashboard tiles';
COMMENT ON VIEW v_exception_summary IS 'Exception breakdown for Exception tiles';

-- Schema creation completed successfully
SELECT 'SettlePaisa V2 database schema created successfully!' as result;