-- SettlePaisa 2.0 Reconciliation Database Schema
-- Designed for payment transaction reconciliation and settlement tracking

-- Enable UUID extension for PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search optimization

-- =============================================
-- CORE TABLES
-- =============================================

-- Merchants table
CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_code VARCHAR(50) UNIQUE NOT NULL,
    merchant_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Banks and financial institutions
CREATE TABLE banks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_code VARCHAR(10) UNIQUE NOT NULL, -- HDFC, ICICI, AXIS, SBI, etc.
    bank_name VARCHAR(100) NOT NULL,
    swift_code VARCHAR(11),
    country_code CHAR(2) DEFAULT 'IN',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bank connectors (SFTP/API connections)
CREATE TABLE bank_connectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_id UUID NOT NULL REFERENCES banks(id),
    connector_name VARCHAR(100) NOT NULL, -- "HDFC Bank SFTP", "ICICI API"
    connector_type VARCHAR(10) NOT NULL CHECK (connector_type IN ('SFTP', 'API', 'EMAIL')),
    connection_config JSONB, -- Stores SFTP details, API endpoints, credentials ref
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'MAINTENANCE')),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_frequency_minutes INTEGER DEFAULT 30, -- How often to sync
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TRANSACTION PIPELINE TABLES
-- =============================================

-- Main transactions table - captures all payment transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Transaction identifiers
    transaction_id VARCHAR(100) UNIQUE NOT NULL, -- PG transaction ID
    utr VARCHAR(50), -- Unique Transaction Reference from bank
    rrn VARCHAR(50), -- Retrieval Reference Number
    
    -- Transaction details
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    amount_paise BIGINT NOT NULL, -- Amount in paise (₹1 = 100 paise)
    currency CHAR(3) DEFAULT 'INR',
    
    -- Dates and timing
    transaction_date DATE NOT NULL,
    transaction_time TIMESTAMP WITH TIME ZONE NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Settlement pipeline status
    pipeline_status VARCHAR(20) DEFAULT 'CAPTURED' CHECK (
        pipeline_status IN ('CAPTURED', 'IN_SETTLEMENT', 'SENT_TO_BANK', 'CREDITED', 'FAILED', 'CANCELLED')
    ),
    settlement_date DATE,
    credited_at TIMESTAMP WITH TIME ZONE,
    
    -- Bank information
    bank_id UUID REFERENCES banks(id),
    bank_account_number VARCHAR(50),
    ifsc_code VARCHAR(11),
    
    -- Data source tracking
    data_source VARCHAR(20) DEFAULT 'MANUAL' CHECK (data_source IN ('MANUAL', 'CONNECTOR')),
    source_connector_id UUID REFERENCES bank_connectors(id),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes
    CONSTRAINT valid_amount CHECK (amount_paise > 0),
    CONSTRAINT valid_dates CHECK (credited_at IS NULL OR credited_at >= captured_at)
);

-- Bank statements/files received from connectors
CREATE TABLE bank_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- File information
    bank_id UUID NOT NULL REFERENCES banks(id),
    connector_id UUID REFERENCES bank_connectors(id),
    statement_date DATE NOT NULL,
    file_name VARCHAR(255),
    file_hash VARCHAR(64), -- SHA-256 for duplicate detection
    
    -- Processing status
    status VARCHAR(20) DEFAULT 'RECEIVED' CHECK (
        status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DUPLICATE')
    ),
    total_records INTEGER,
    processed_records INTEGER DEFAULT 0,
    
    -- Timing
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Raw file content (optional)
    raw_content TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual bank statement entries
CREATE TABLE bank_statement_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to statement file
    statement_id UUID NOT NULL REFERENCES bank_statements(id),
    line_number INTEGER NOT NULL,
    
    -- Bank entry details
    utr VARCHAR(50),
    amount_paise BIGINT NOT NULL,
    transaction_date DATE NOT NULL,
    description TEXT,
    debit_credit CHAR(1) CHECK (debit_credit IN ('D', 'C')),
    balance_paise BIGINT,
    
    -- Reconciliation status
    is_matched BOOLEAN DEFAULT false,
    matched_transaction_id UUID REFERENCES transactions(id),
    match_confidence DECIMAL(5,2), -- 0.00 to 100.00
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_statement_line UNIQUE (statement_id, line_number)
);

-- =============================================
-- RECONCILIATION TABLES
-- =============================================

-- Reconciliation matches between transactions and bank entries
CREATE TABLE reconciliation_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- What's being matched
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    bank_entry_id UUID NOT NULL REFERENCES bank_statement_entries(id),
    
    -- Match quality
    match_type VARCHAR(20) NOT NULL CHECK (
        match_type IN ('EXACT_UTR', 'AMOUNT_DATE', 'FUZZY', 'MANUAL')
    ),
    match_confidence DECIMAL(5,2) NOT NULL, -- 0.00 to 100.00
    match_score JSONB, -- Detailed scoring breakdown
    
    -- Status
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'CONFIRMED', 'DISPUTED', 'REJECTED')
    ),
    
    -- Audit trail
    matched_by VARCHAR(20) DEFAULT 'SYSTEM' CHECK (matched_by IN ('SYSTEM', 'MANUAL')),
    matched_by_user_id UUID, -- When manually matched
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT unique_transaction_match UNIQUE (transaction_id, bank_entry_id)
);

-- =============================================
-- EXCEPTION MANAGEMENT
-- =============================================

-- Exception reasons lookup
CREATE TABLE exception_reasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reason_code VARCHAR(50) UNIQUE NOT NULL, -- UTR_MISSING, AMT_MISMATCH, etc.
    reason_label VARCHAR(100) NOT NULL,
    severity VARCHAR(10) DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reconciliation exceptions
CREATE TABLE reconciliation_exceptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- What has the exception
    transaction_id UUID REFERENCES transactions(id),
    bank_entry_id UUID REFERENCES bank_statement_entries(id),
    
    -- Exception details
    reason_id UUID NOT NULL REFERENCES exception_reasons(id),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    
    -- Status and resolution
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED')
    ),
    
    -- Assignment
    assigned_to UUID, -- User ID from authentication system
    assigned_at TIMESTAMP WITH TIME ZONE,
    
    -- Resolution
    resolution_notes TEXT,
    resolved_by UUID, -- User ID
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional context
    exception_data JSONB, -- Flexible field for exception-specific data
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT transaction_or_bank_entry CHECK (
        transaction_id IS NOT NULL OR bank_entry_id IS NOT NULL
    )
);

-- =============================================
-- OPERATIONAL TABLES
-- =============================================

-- Connector sync logs
CREATE TABLE connector_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    connector_id UUID NOT NULL REFERENCES bank_connectors(id),
    sync_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sync_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Results
    status VARCHAR(20) NOT NULL CHECK (
        status IN ('RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED')
    ),
    files_found INTEGER DEFAULT 0,
    files_processed INTEGER DEFAULT 0,
    records_processed INTEGER DEFAULT 0,
    
    -- Error information
    error_message TEXT,
    error_details JSONB,
    
    -- Performance metrics
    duration_seconds INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System configuration and settings
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    setting_type VARCHAR(20) DEFAULT 'STRING' CHECK (
        setting_type IN ('STRING', 'INTEGER', 'BOOLEAN', 'JSON')
    ),
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false, -- For passwords, API keys, etc.
    updated_by UUID, -- User ID
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Transaction indexes
CREATE INDEX idx_transactions_merchant_date ON transactions(merchant_id, transaction_date);
CREATE INDEX idx_transactions_utr ON transactions(utr) WHERE utr IS NOT NULL;
CREATE INDEX idx_transactions_pipeline_status ON transactions(pipeline_status);
CREATE INDEX idx_transactions_amount_date ON transactions(amount_paise, transaction_date);
CREATE INDEX idx_transactions_bank ON transactions(bank_id) WHERE bank_id IS NOT NULL;
CREATE INDEX idx_transactions_source ON transactions(data_source, source_connector_id);

-- Bank statement indexes
CREATE INDEX idx_bank_statements_date_bank ON bank_statements(statement_date, bank_id);
CREATE INDEX idx_bank_statements_status ON bank_statements(status);
CREATE INDEX idx_bank_statements_hash ON bank_statements(file_hash);

-- Bank entry indexes
CREATE INDEX idx_bank_entries_utr ON bank_statement_entries(utr) WHERE utr IS NOT NULL;
CREATE INDEX idx_bank_entries_amount_date ON bank_statement_entries(amount_paise, transaction_date);
CREATE INDEX idx_bank_entries_matched ON bank_statement_entries(is_matched, matched_transaction_id);

-- Reconciliation indexes
CREATE INDEX idx_recon_matches_status ON reconciliation_matches(status);
CREATE INDEX idx_recon_matches_confidence ON reconciliation_matches(match_confidence);
CREATE INDEX idx_recon_matches_type ON reconciliation_matches(match_type);

-- Exception indexes
CREATE INDEX idx_exceptions_status ON reconciliation_exceptions(status);
CREATE INDEX idx_exceptions_severity ON reconciliation_exceptions(severity);
CREATE INDEX idx_exceptions_assigned ON reconciliation_exceptions(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_exceptions_created ON reconciliation_exceptions(created_at);

-- Connector indexes
CREATE INDEX idx_connector_logs_connector_time ON connector_sync_logs(connector_id, sync_started_at);
CREATE INDEX idx_connector_logs_status ON connector_sync_logs(status);

-- Text search indexes
CREATE INDEX idx_transactions_search ON transactions USING gin(to_tsvector('english', transaction_id || ' ' || COALESCE(utr, '')));
CREATE INDEX idx_bank_entries_search ON bank_statement_entries USING gin(to_tsvector('english', COALESCE(utr, '') || ' ' || COALESCE(description, '')));

-- =============================================
-- TRIGGERS FOR AUDIT TRAIL
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_merchants_updated_at BEFORE UPDATE ON merchants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bank_connectors_updated_at BEFORE UPDATE ON bank_connectors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_exceptions_updated_at BEFORE UPDATE ON reconciliation_exceptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- VIEWS FOR DASHBOARD QUERIES
-- =============================================

-- View for pipeline overview
CREATE VIEW v_pipeline_overview AS
SELECT 
    COUNT(*) as total_captured,
    COUNT(*) FILTER (WHERE pipeline_status IN ('IN_SETTLEMENT', 'SENT_TO_BANK', 'CREDITED')) as in_settlement,
    COUNT(*) FILTER (WHERE pipeline_status IN ('SENT_TO_BANK', 'CREDITED')) as sent_to_bank,
    COUNT(*) FILTER (WHERE pipeline_status = 'CREDITED') as credited,
    COUNT(*) FILTER (WHERE pipeline_status = 'CAPTURED') as unsettled,
    SUM(amount_paise) as total_value_paise,
    SUM(amount_paise) FILTER (WHERE pipeline_status = 'CREDITED') as credited_value_paise
FROM transactions 
WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 days';

-- View for source breakdown
CREATE VIEW v_source_breakdown AS
SELECT 
    CASE 
        WHEN data_source = 'MANUAL' THEN 'MANUAL'
        ELSE 'CONNECTORS'
    END as source,
    COUNT(*) as captured,
    COUNT(*) FILTER (WHERE pipeline_status IN ('IN_SETTLEMENT', 'SENT_TO_BANK', 'CREDITED')) as in_settlement,
    COUNT(*) FILTER (WHERE pipeline_status IN ('SENT_TO_BANK', 'CREDITED')) as sent_to_bank,
    COUNT(*) FILTER (WHERE pipeline_status = 'CREDITED') as credited,
    COUNT(*) FILTER (WHERE pipeline_status = 'CAPTURED') as unsettled,
    ROUND(
        (COUNT(*) FILTER (WHERE pipeline_status != 'CAPTURED')::DECIMAL / COUNT(*) * 100), 1
    ) as match_rate_pct
FROM transactions 
WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY source;

-- View for top exception reasons
CREATE VIEW v_top_exception_reasons AS
SELECT 
    er.reason_code,
    er.reason_label,
    COUNT(*) as impacted_txns,
    ROUND(
        COUNT(*)::DECIMAL / (SELECT COUNT(*) FROM reconciliation_exceptions WHERE status = 'OPEN') * 100, 0
    ) as percentage
FROM reconciliation_exceptions re
JOIN exception_reasons er ON re.reason_id = er.id
WHERE re.status = 'OPEN'
GROUP BY er.reason_code, er.reason_label
ORDER BY impacted_txns DESC
LIMIT 10;

-- View for connector health
CREATE VIEW v_connector_health AS
SELECT 
    bc.connector_name,
    bc.status,
    bc.last_sync_at,
    COALESCE(recent_logs.files_queued, 0) as queued_files,
    COALESCE(recent_logs.recent_failures, 0) as failures
FROM bank_connectors bc
LEFT JOIN (
    SELECT 
        connector_id,
        COUNT(*) FILTER (WHERE status = 'FAILED') as recent_failures,
        COUNT(*) FILTER (WHERE status IN ('RUNNING', 'FAILED')) as files_queued
    FROM connector_sync_logs 
    WHERE sync_started_at >= NOW() - INTERVAL '24 hours'
    GROUP BY connector_id
) recent_logs ON bc.id = recent_logs.connector_id
WHERE bc.status = 'ACTIVE'
ORDER BY bc.last_sync_at DESC NULLS LAST;

-- =============================================
-- SAMPLE DATA SEEDS
-- =============================================

-- Insert default banks
INSERT INTO banks (bank_code, bank_name, swift_code) VALUES
('HDFC', 'HDFC Bank Limited', 'HDFCINBB'),
('ICICI', 'ICICI Bank Limited', 'ICICINBB'),
('AXIS', 'Axis Bank Limited', 'AXISINBB'),
('SBI', 'State Bank of India', 'SBININBB'),
('INDB', 'IndusInd Bank Limited', 'INDBINBB');

-- Insert sample merchant
INSERT INTO merchants (merchant_code, merchant_name) VALUES
('DEMO001', 'Demo Merchant Ltd');

-- Insert exception reasons
INSERT INTO exception_reasons (reason_code, reason_label, severity, description) VALUES
('UTR_MISSING', 'Missing UTR', 'HIGH', 'Bank UTR not found in transaction'),
('AMT_MISMATCH', 'Amount Mismatch', 'MEDIUM', 'Transaction amount does not match bank entry'),
('DUP_UTR', 'Duplicate UTR', 'MEDIUM', 'Same UTR found in multiple transactions'),
('BANK_MISSING', 'Not in Bank File', 'HIGH', 'Transaction not found in bank statement'),
('STATUS_PENDING', 'Status Pending', 'LOW', 'Transaction status requires manual review');

-- System settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
('recon_match_threshold', '85.0', 'INTEGER', 'Minimum confidence score for automatic matching'),
('max_sync_frequency_minutes', '15', 'INTEGER', 'Minimum time between connector syncs'),
('auto_match_enabled', 'true', 'BOOLEAN', 'Enable automatic transaction matching'),
('dashboard_refresh_interval', '30', 'INTEGER', 'Dashboard auto-refresh interval in seconds');

COMMENT ON DATABASE postgres IS 'SettlePaisa 2.0 Reconciliation System Database';