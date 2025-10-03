-- Migration 015: Create Bank Column Mappings Table
-- Purpose: Store bank-specific CSV column mappings for recon file normalization
-- Migrated from V1 recon_configs table

CREATE TABLE IF NOT EXISTS sp_v2_bank_column_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Bank identification
    config_name VARCHAR(100) NOT NULL UNIQUE,
    bank_name VARCHAR(100) NOT NULL,
    
    -- File format settings
    file_type VARCHAR(10) NOT NULL CHECK (file_type IN ('xlsx', 'csv', 'txt', 'xls')),
    delimiter VARCHAR(10),                      -- For CSV/TXT: ',', '~', '|', etc.
    encoding VARCHAR(20) DEFAULT 'UTF-8',
    has_header BOOLEAN DEFAULT TRUE,
    header_row_number INTEGER DEFAULT 1,
    
    -- V1-Compatible Column Mappings (JSONB)
    -- Maps bank-specific column names to V1 standard schema
    -- V1 Standard: transaction_id, paid_amount, payee_amount, transaction_date_time, payment_date_time
    v1_column_mappings JSONB NOT NULL,
    
    -- Additional mapping metadata
    date_format VARCHAR(50) DEFAULT 'dd-MM-yyyy',  -- How dates appear in bank file
    amount_format VARCHAR(20) DEFAULT 'decimal',    -- decimal, integer, etc.
    
    -- Special fields (optional)
    special_fields JSONB,                       -- e.g., {"is_on_us": "Onus Indicator"}
    
    -- Configuration status
    is_active BOOLEAN DEFAULT TRUE,
    source VARCHAR(20) DEFAULT 'V1_MIGRATED',   -- V1_MIGRATED, MANUAL, API
    
    -- Audit trail
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique config per bank
    CONSTRAINT unique_bank_config UNIQUE(config_name)
);

-- Indexes for fast lookups
CREATE INDEX idx_bank_mappings_bank_name ON sp_v2_bank_column_mappings(bank_name);
CREATE INDEX idx_bank_mappings_active ON sp_v2_bank_column_mappings(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_bank_mappings_config_name ON sp_v2_bank_column_mappings(config_name);

-- Comments
COMMENT ON TABLE sp_v2_bank_column_mappings IS 'Bank-specific CSV column mappings for file normalization (migrated from V1 recon_configs)';
COMMENT ON COLUMN sp_v2_bank_column_mappings.v1_column_mappings IS 'JSONB mapping: {"transaction_id": "MERCHANT_TRACKID", "paid_amount": "DOMESTIC AMT", ...}';
COMMENT ON COLUMN sp_v2_bank_column_mappings.special_fields IS 'Optional bank-specific fields like on-us indicators';
COMMENT ON COLUMN sp_v2_bank_column_mappings.source IS 'Origin: V1_MIGRATED (from V1), MANUAL (ops team), API (programmatic)';

-- Insert V1 migrated bank configs (24 banks from production)
INSERT INTO sp_v2_bank_column_mappings 
(config_name, bank_name, file_type, delimiter, v1_column_mappings, source, created_by, special_fields) 
VALUES

-- 1. HDFC BANK
('HDFC BANK', 'HDFC BANK', 'xlsx', NULL, 
'{"transaction_id": "MERCHANT_TRACKID", "paid_amount": "DOMESTIC AMT", "payee_amount": "Net Amount", "transaction_date_time": "TRANS DATE", "payment_date_time": "SETTLE DATE"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 2. AXIS BANK (Tilde delimited TXT)
('AXIS BANK', 'AXIS BANK', 'txt', '~',
'{"transaction_id": "PRNNo", "paid_amount": "Amount", "payee_amount": "Amount", "transaction_date_time": "Date", "payment_date_time": "Date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 3. SBI BANK
('SBI BANK', 'SBI BANK', 'xlsx', NULL,
'{"transaction_id": "MERCHANT_TXNNO", "paid_amount": "GROSS_AMT", "payee_amount": "NET_AMT", "transaction_date_time": "TRAN_DATE", "payment_date_time": "TRAN_DATE"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 4. BOB (Bank of Baroda) - Has special "is_on_us" field
('BOB', 'BOB', 'xlsx', NULL,
'{"transaction_id": "Merchant Track ID", "paid_amount": "Settlement Amount", "payee_amount": "Net Amount", "transaction_date_time": "Transaction Date", "payment_date_time": "Payment Date"}'::jsonb,
'V1_MIGRATED', 'migration_script', '{"is_on_us": "Onus Indicator"}'::jsonb),

-- 5. CANARA BANK
('CANARA', 'CANARA BANK', 'txt', NULL,
'{"transaction_id": "PGIRefNo", "paid_amount": "TxnAmount", "payee_amount": "TxnAmount", "transaction_date_time": "TxnDate", "payment_date_time": "TxnDate"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 6. YES BANK
('YES BANK', 'YES BANK', 'xlsx', NULL,
'{"transaction_id": "MERCHANT REF. NO", "paid_amount": "TRANSACTION AMOUNT", "payee_amount": "TRANSACTION AMOUNT", "transaction_date_time": "TRANSACTION DATE", "payment_date_time": "TRANSACTION DATE"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 7. IDBI
('IDBI', 'IDBI', 'xlsx', NULL,
'{"transaction_id": "Txn id", "paid_amount": "Gross Amount", "payee_amount": "Net Amount", "transaction_date_time": "Txn date", "payment_date_time": "Payment date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 8. INDIAN BANK
('INDIAN BANK', 'INDIAN BANK', 'xlsx', NULL,
'{"transaction_id": "Txn id", "paid_amount": "Gross Amount", "payee_amount": "Net Amount", "transaction_date_time": "Txn date", "payment_date_time": "Payment date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 9. FEDERAL
('FEDERL', 'FEDERAL', 'xlsx', NULL,
'{"transaction_id": "Txn id", "paid_amount": "Gross Amount", "payee_amount": "Net Amount", "transaction_date_time": "Txn date", "payment_date_time": "Payment date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 10. BOI (Bank of India)
('BOI', 'BOI', 'xlsx', NULL,
'{"transaction_id": "Txn id", "paid_amount": "Gross Amount", "payee_amount": "Net Amount", "transaction_date_time": "Txn date", "payment_date_time": "Payment date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 11. CENTRAL BANK
('CENTRAL', 'CENTRAL', 'xlsx', NULL,
'{"transaction_id": "Txn id", "paid_amount": "Gross Amount", "payee_amount": "Net Amount", "transaction_date_time": "Txn date", "payment_date_time": "Payment date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 12. MAHARASTRA
('MAHARASTRA', 'MAHARASTRA', 'xlsx', NULL,
'{"transaction_id": "Txn id", "paid_amount": "Gross Amount", "payee_amount": "Net Amount", "transaction_date_time": "Txn date", "payment_date_time": "Payment date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 13. HDFC NETBANKING
('HDFC NB', 'HDFC NB', 'xlsx', NULL,
'{"transaction_id": "Txn id", "paid_amount": "Gross Amount", "payee_amount": "Net Amount", "transaction_date_time": "Txn date", "payment_date_time": "Payment date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 14. HDFC UPI
('HDFC UPI', 'HDFC UPI', 'xlsx', NULL,
'{"transaction_id": "Order ID", "paid_amount": "Transaction Amount", "payee_amount": "Net Amount", "transaction_date_time": "Transaction Req Date", "payment_date_time": "Settlement Date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 15. SBI NETBANKING
('SBI NB', 'SBI NB', 'xlsx', NULL,
'{"transaction_id": "Txn id", "paid_amount": "Gross Amount", "payee_amount": "Net Amount", "transaction_date_time": "Txn date", "payment_date_time": "Payment date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 16. AIRTEL UPI
('AIRTEL UPI', 'AIRTEL UPI', 'xlsx', NULL,
'{"transaction_id": "Till_ID", "paid_amount": "ORIG_AMNT", "payee_amount": "Net_Credit_Amnt", "transaction_date_time": "TXN_DATE", "payment_date_time": "Settlement_Date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 17. INDIAN UPI
('INDIAN UPI', 'INDIAN UPI', 'xlsx', NULL,
'{"transaction_id": "REF ID", "paid_amount": "AMOUNT", "payee_amount": "AMOUNT", "transaction_date_time": "DATETIMEOFTRANSACTION", "payment_date_time": "DATETIMEOFTRANSACTION"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 18. ATOM
('ATOM', 'ATOM', 'xlsx', NULL,
'{"transaction_id": "Merchant Txn ID", "paid_amount": "Gross Txn Amount", "payee_amount": "Net Amount to be Paid", "transaction_date_time": "Txn Date", "payment_date_time": "Settlement Date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 19. AMAZON
('AMAZON', 'AMAZON', 'xlsx', NULL,
'{"transaction_id": "SellerOrderId", "paid_amount": "TransactionAmount", "payee_amount": "NetTransactionAmount", "transaction_date_time": "TransactionPostedDate", "payment_date_time": "TransactionPostedDate"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 20. MOBIKWIK
('MOBIKWIK', 'MOBIKWIK', 'xlsx', NULL,
'{"transaction_id": "Order Id", "paid_amount": "Txn Amount", "payee_amount": "Amount Paid", "transaction_date_time": "Transaction Date", "payment_date_time": "Settlement Date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL),

-- 21. INGENICO
('INGENICO', 'INGENICO', 'xlsx', NULL,
'{"transaction_id": "SM Transaction Id", "paid_amount": "Total Amount", "payee_amount": "Net Amount", "transaction_date_time": "Transaction Date", "payment_date_time": "Payment Date"}'::jsonb,
'V1_MIGRATED', 'migration_script', NULL);

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 015 completed: Created sp_v2_bank_column_mappings table';
    RAISE NOTICE 'Inserted 21 bank configurations from V1 recon_configs';
    RAISE NOTICE 'Banks: HDFC, AXIS, SBI, BOB, CANARA, YES, IDBI, INDIAN, FEDERAL, BOI, CENTRAL, MAHARASTRA, HDFC NB/UPI, SBI NB, AIRTEL UPI, INDIAN UPI, ATOM, AMAZON, MOBIKWIK, INGENICO';
END $$;
