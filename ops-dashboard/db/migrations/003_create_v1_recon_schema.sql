-- SettlePaisa V2 Database Schema - V1 Reconciliation Compatible
-- Mirrors V1 reconciliation table structure for compatibility
-- Created: 2024-09-29

-- =============================================================================
-- V1-COMPATIBLE CORE TABLES FOR RECONCILIATION
-- =============================================================================

-- Merchants table (V1 compatible)
CREATE TABLE IF NOT EXISTS sp_v2_merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    gstin VARCHAR(15),
    pan VARCHAR(10),
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    kyc_status VARCHAR(20) DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
    bank_account_number VARCHAR(50),
    bank_ifsc_code VARCHAR(11),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table (V1 compatible)
CREATE TABLE IF NOT EXISTS sp_v2_transactions_v1 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    pgw_ref TEXT NOT NULL UNIQUE, -- Payment gateway reference
    utr VARCHAR(50), -- Unique Transaction Reference
    amount_paise BIGINT NOT NULL,
    currency CHAR(3) DEFAULT 'INR',
    payment_mode VARCHAR(20) CHECK (payment_mode IN ('UPI', 'NEFT', 'RTGS', 'IMPS', 'CARD', 'WALLET')),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('SUCCESS', 'FAILED', 'PENDING', 'REVERSED')),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(15),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (merchant_id) REFERENCES sp_v2_merchants(id)
);

-- Settlement batches (V1 compatible)
CREATE TABLE IF NOT EXISTS sp_v2_settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    cycle_date DATE NOT NULL,
    rail VARCHAR(10) CHECK (rail IN ('NEFT', 'RTGS', 'IMPS', 'UPI')),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED')),
    cutoff_time TIMESTAMP WITH TIME ZONE,
    total_transactions INTEGER DEFAULT 0,
    gross_amount_paise BIGINT DEFAULT 0,
    total_commission_paise BIGINT DEFAULT 0,
    total_gst_paise BIGINT DEFAULT 0,
    total_tds_paise BIGINT DEFAULT 0,
    total_reserve_paise BIGINT DEFAULT 0,
    net_amount_paise BIGINT DEFAULT 0,
    bank_reference VARCHAR(100),
    bank_file_id UUID,
    maker_id UUID,
    checker_id UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    sent_to_bank_at TIMESTAMP WITH TIME ZONE,
    reconciled_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (merchant_id) REFERENCES sp_v2_merchants(id)
);

-- Settlement items (V1 compatible)
CREATE TABLE IF NOT EXISTS sp_v2_settlement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL,
    txn_id UUID NOT NULL,
    gross_paise BIGINT NOT NULL,
    commission_paise BIGINT DEFAULT 0,
    gst_on_commission_paise BIGINT DEFAULT 0,
    tds_paise BIGINT DEFAULT 0,
    reserve_paise BIGINT DEFAULT 0,
    net_paise BIGINT NOT NULL,
    commission_tier VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (batch_id) REFERENCES sp_v2_settlement_batches(id),
    FOREIGN KEY (txn_id) REFERENCES sp_v2_transactions_v1(id)
);

-- Bank files (V1 compatible)
CREATE TABLE IF NOT EXISTS sp_v2_bank_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acquirer TEXT NOT NULL,
    cycle_date DATE NOT NULL,
    rail VARCHAR(10) CHECK (rail IN ('NEFT', 'RTGS', 'IMPS', 'UPI')),
    status VARCHAR(20) DEFAULT 'EXPECTED' CHECK (status IN ('EXPECTED', 'RECEIVED', 'PROCESSED', 'FAILED')),
    file_name VARCHAR(255),
    file_hash TEXT, -- SHA256 for integrity
    s3_bucket VARCHAR(100),
    s3_key VARCHAR(500),
    record_count INTEGER DEFAULT 0,
    total_amount_paise BIGINT DEFAULT 0,
    parsed_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- UTR credits (V1 compatible - CORE FOR RECONCILIATION)
CREATE TABLE IF NOT EXISTS sp_v2_utr_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acquirer TEXT NOT NULL,
    utr TEXT NOT NULL, -- Bank transaction reference
    amount_paise BIGINT NOT NULL,
    credited_at TIMESTAMP WITH TIME ZONE NOT NULL,
    cycle_date DATE NOT NULL,
    bank_reference VARCHAR(100),
    raw_data JSONB, -- Original bank data
    bank_file_id UUID,
    reconciled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (bank_file_id) REFERENCES sp_v2_bank_files(id),
    UNIQUE(acquirer, utr) -- Prevent duplicate UTRs per acquirer
);

-- Reconciliation matches (V1 compatible - CORE FOR RECONCILIATION)
CREATE TABLE IF NOT EXISTS sp_v2_recon_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utr_id UUID NOT NULL, -- FK to utr_credits
    item_id UUID NOT NULL, -- FK to settlement_items
    match_type VARCHAR(10) CHECK (match_type IN ('EXACT', 'FUZZY', 'MANUAL')),
    match_score SMALLINT CHECK (match_score >= 0 AND match_score <= 100),
    amount_difference_paise BIGINT DEFAULT 0,
    matched_by VARCHAR(50) DEFAULT 'SYSTEM',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (utr_id) REFERENCES sp_v2_utr_credits(id),
    FOREIGN KEY (item_id) REFERENCES sp_v2_settlement_items(id),
    UNIQUE(utr_id, item_id) -- One-to-one matching
);

-- Rolling reserve ledger (V1 compatible)
CREATE TABLE IF NOT EXISTS sp_v2_rolling_reserve_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    cycle_date DATE NOT NULL,
    batch_id UUID,
    debit_paise BIGINT DEFAULT 0, -- Amount held
    credit_paise BIGINT DEFAULT 0, -- Amount released
    balance_paise BIGINT DEFAULT 0, -- Current balance
    release_date DATE, -- Scheduled release
    released BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (merchant_id) REFERENCES sp_v2_merchants(id),
    FOREIGN KEY (batch_id) REFERENCES sp_v2_settlement_batches(id)
);

-- Commission tiers (V1 compatible)
CREATE TABLE IF NOT EXISTS sp_v2_commission_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name VARCHAR(50) NOT NULL,
    min_volume_paise BIGINT NOT NULL,
    max_volume_paise BIGINT,
    commission_percentage DECIMAL(5,3) NOT NULL, -- e.g., 2.100 for 2.1%
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR RECONCILIATION PERFORMANCE
-- =============================================================================

-- UTR-based reconciliation indexes
CREATE INDEX IF NOT EXISTS idx_utr_credits_utr ON sp_v2_utr_credits (utr);
CREATE INDEX IF NOT EXISTS idx_utr_credits_acquirer_cycle ON sp_v2_utr_credits (acquirer, cycle_date);
CREATE INDEX IF NOT EXISTS idx_utr_credits_reconciled ON sp_v2_utr_credits (reconciled);

-- Transaction reconciliation indexes
CREATE INDEX IF NOT EXISTS idx_transactions_v1_utr ON sp_v2_transactions_v1 (utr);
CREATE INDEX IF NOT EXISTS idx_transactions_v1_pgw_ref ON sp_v2_transactions_v1 (pgw_ref);
CREATE INDEX IF NOT EXISTS idx_transactions_v1_merchant_date ON sp_v2_transactions_v1 (merchant_id, created_at);

-- Settlement indexes
CREATE INDEX IF NOT EXISTS idx_settlement_batches_merchant_cycle ON sp_v2_settlement_batches (merchant_id, cycle_date);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON sp_v2_settlement_batches (status);
CREATE INDEX IF NOT EXISTS idx_settlement_items_batch ON sp_v2_settlement_items (batch_id);

-- Reconciliation match indexes
CREATE INDEX IF NOT EXISTS idx_recon_matches_utr ON sp_v2_recon_matches (utr_id);
CREATE INDEX IF NOT EXISTS idx_recon_matches_item ON sp_v2_recon_matches (item_id);
CREATE INDEX IF NOT EXISTS idx_recon_matches_type ON sp_v2_recon_matches (match_type);

-- =============================================================================
-- V1-COMPATIBLE SAMPLE DATA FOR RECONCILIATION TESTING
-- =============================================================================

-- Insert sample merchants
INSERT INTO sp_v2_merchants (id, name, gstin, pan, risk_score, kyc_status, bank_account_number, bank_ifsc_code) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Tech Solutions Pvt Ltd', '27AABCT1332L1ZZ', 'AABCT1332L', 25, 'VERIFIED', '1234567890123456', 'ICIC0001234'),
('550e8400-e29b-41d4-a716-446655440002', 'E-commerce Store', '29BBCXY9876M1AA', 'BBCXY9876M', 45, 'VERIFIED', '9876543210987654', 'HDFC0002345'),
('550e8400-e29b-41d4-a716-446655440003', 'Digital Services', '33CCDPQ5432N1BB', 'CCDPQ5432N', 15, 'VERIFIED', '5432167890543216', 'SBIN0003456')
ON CONFLICT (id) DO NOTHING;

-- Insert commission tiers (V1 rates)
INSERT INTO sp_v2_commission_tiers (tier_name, min_volume_paise, max_volume_paise, commission_percentage) VALUES
('Tier 1 - Under 25L', 0, 2500000000, 2.100), -- Up to ₹25L: 2.1%
('Tier 2 - 25L to 75L', 2500000000, 7500000000, 1.900), -- ₹25L-₹75L: 1.9%
('Tier 3 - 75L to 2Cr', 7500000000, 20000000000, 1.700), -- ₹75L-₹2Cr: 1.7%
('Tier 4 - Above 2Cr', 20000000000, NULL, 1.500) -- Above ₹2Cr: 1.5%
ON CONFLICT DO NOTHING;

-- Insert sample transactions with UTRs
INSERT INTO sp_v2_transactions_v1 (id, merchant_id, pgw_ref, utr, amount_paise, payment_mode, status) VALUES
('650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'PGW_REF_20240929_001', 'UTR240929001001', 10000, 'UPI', 'SUCCESS'),
('650e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'PGW_REF_20240929_002', 'UTR240929001002', 25000, 'NEFT', 'SUCCESS'),
('650e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440002', 'PGW_REF_20240929_003', 'UTR240929002001', 15000, 'UPI', 'SUCCESS'),
('650e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440003', 'PGW_REF_20240929_004', 'UTR240929003001', 50000, 'RTGS', 'SUCCESS'),
('650e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440001', 'PGW_REF_20240929_005', 'UTR240929001003', 30000, 'IMPS', 'SUCCESS')
ON CONFLICT (pgw_ref) DO NOTHING;

-- Insert settlement batch
INSERT INTO sp_v2_settlement_batches (id, merchant_id, cycle_date, rail, status, total_transactions, gross_amount_paise, total_commission_paise, total_gst_paise, total_tds_paise, net_amount_paise) VALUES
('750e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '2024-09-29', 'NEFT', 'COMPLETED', 3, 65000, 1365, 246, 650, 62739)
ON CONFLICT (id) DO NOTHING;

-- Insert settlement items
INSERT INTO sp_v2_settlement_items (batch_id, txn_id, gross_paise, commission_paise, gst_on_commission_paise, tds_paise, net_paise, commission_tier) VALUES
('750e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 10000, 210, 38, 100, 9652, 'Tier 1 - Under 25L'),
('750e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440002', 25000, 525, 95, 250, 24130, 'Tier 1 - Under 25L'),
('750e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440005', 30000, 630, 113, 300, 28957, 'Tier 1 - Under 25L')
ON CONFLICT DO NOTHING;

-- Insert bank file
INSERT INTO sp_v2_bank_files (id, acquirer, cycle_date, rail, status, file_name, record_count, total_amount_paise) VALUES
('850e8400-e29b-41d4-a716-446655440001', 'ICICI Bank', '2024-09-29', 'NEFT', 'PROCESSED', 'ICICI_NEFT_20240929.csv', 1, 62739)
ON CONFLICT (id) DO NOTHING;

-- Insert UTR credits (bank side)
INSERT INTO sp_v2_utr_credits (acquirer, utr, amount_paise, credited_at, cycle_date, bank_reference, bank_file_id) VALUES
('ICICI Bank', 'UTR240929001001', 10000, '2024-09-29 14:30:00+00', '2024-09-29', 'ICICI_REF_001', '850e8400-e29b-41d4-a716-446655440001'),
('ICICI Bank', 'UTR240929001002', 25000, '2024-09-29 14:45:00+00', '2024-09-29', 'ICICI_REF_002', '850e8400-e29b-41d4-a716-446655440001'),
('ICICI Bank', 'UTR240929001003', 30000, '2024-09-29 15:00:00+00', '2024-09-29', 'ICICI_REF_003', '850e8400-e29b-41d4-a716-446655440001')
ON CONFLICT (acquirer, utr) DO NOTHING;

-- =============================================================================
-- RECONCILIATION VIEWS (V1 COMPATIBLE)
-- =============================================================================

-- View for reconciliation dashboard
CREATE OR REPLACE VIEW v_reconciliation_summary AS
SELECT 
    cycle_date,
    COUNT(DISTINCT t.id) as total_transactions,
    COUNT(DISTINCT uc.id) as total_utr_credits,
    COUNT(DISTINCT rm.id) as matched_records,
    COUNT(DISTINCT t.id) - COUNT(DISTINCT rm.id) as unmatched_pg,
    COUNT(DISTINCT uc.id) - COUNT(DISTINCT rm.id) as unmatched_bank,
    SUM(DISTINCT t.amount_paise) as total_pg_amount,
    SUM(DISTINCT uc.amount_paise) as total_bank_amount,
    ROUND(COUNT(DISTINCT rm.id)::DECIMAL / GREATEST(COUNT(DISTINCT t.id), 1) * 100, 2) as match_rate_percentage
FROM sp_v2_transactions_v1 t
FULL OUTER JOIN sp_v2_utr_credits uc ON t.utr = uc.utr
LEFT JOIN sp_v2_recon_matches rm ON uc.id = rm.utr_id
WHERE t.created_at::date = '2024-09-29' OR uc.cycle_date = '2024-09-29'
GROUP BY cycle_date;

-- View for unmatched transactions
CREATE OR REPLACE VIEW v_unmatched_transactions AS
SELECT 
    t.id,
    t.pgw_ref,
    t.utr,
    t.amount_paise,
    t.merchant_id,
    'UNMATCHED_PG' as exception_type
FROM sp_v2_transactions_v1 t
LEFT JOIN sp_v2_utr_credits uc ON t.utr = uc.utr
WHERE uc.id IS NULL AND t.status = 'SUCCESS';

-- View for unmatched bank credits
CREATE OR REPLACE VIEW v_unmatched_bank_credits AS
SELECT 
    uc.id,
    uc.utr,
    uc.amount_paise,
    uc.acquirer,
    'UNMATCHED_BANK' as exception_type
FROM sp_v2_utr_credits uc
LEFT JOIN sp_v2_transactions_v1 t ON uc.utr = t.utr
WHERE t.id IS NULL;

SELECT 'SettlePaisa V2 database schema created successfully with V1-compatible reconciliation structure!' as result;