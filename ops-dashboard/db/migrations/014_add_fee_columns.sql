-- Migration 014: Add Fee Tracking Columns for FEES_VARIANCE Detection
-- Version: 2.10.0
-- Purpose: Enable explicit fee variance detection by tracking bank fees and settlement amounts

-- Add fee-related columns to sp_v2_transactions table
ALTER TABLE sp_v2_transactions
ADD COLUMN IF NOT EXISTS bank_fee_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS settlement_amount_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS fee_variance_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS fee_variance_percentage DECIMAL(10,4);

-- Add comments for documentation
COMMENT ON COLUMN sp_v2_transactions.bank_fee_paise IS 'Actual fee charged by bank (from source system bank_exclude_amount)';
COMMENT ON COLUMN sp_v2_transactions.settlement_amount_paise IS 'Net settlement amount after bank fee deduction';
COMMENT ON COLUMN sp_v2_transactions.fee_variance_paise IS 'Calculated fee variance during reconciliation (in paise)';
COMMENT ON COLUMN sp_v2_transactions.fee_variance_percentage IS 'Fee variance as percentage of transaction amount';

-- Add fee columns to sp_v2_pg_transactions_upload table (raw CSV data) - ONLY IF TABLE EXISTS
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sp_v2_pg_transactions_upload') THEN
        ALTER TABLE sp_v2_pg_transactions_upload
        ADD COLUMN IF NOT EXISTS bank_fee_paise BIGINT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS settlement_amount_paise BIGINT DEFAULT 0;
        
        COMMENT ON COLUMN sp_v2_pg_transactions_upload.bank_fee_paise IS 'Bank fee from CSV upload (Bank Fee column)';
        COMMENT ON COLUMN sp_v2_pg_transactions_upload.settlement_amount_paise IS 'Settlement amount from CSV upload (Settlement Amount column)';
    END IF;
END $$;

-- Add FEES_VARIANCE to SLA config if not exists
INSERT INTO sp_v2_sla_config (reason, severity, hours_to_resolve, is_active, created_at, updated_at)
VALUES ('FEES_VARIANCE', 'HIGH', 6, TRUE, NOW(), NOW())
ON CONFLICT (reason, severity) DO UPDATE SET
    hours_to_resolve = EXCLUDED.hours_to_resolve,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Add FEES_VARIANCE exception rule (check if table and columns exist first)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sp_v2_exception_rules') THEN
        INSERT INTO sp_v2_exception_rules (
            rule_name, 
            enabled, 
            priority, 
            scope_reason_codes, 
            actions, 
            created_by, 
            created_at, 
            updated_at
        )
        VALUES (
            'Auto-assign FEES_VARIANCE to Finance Team',
            TRUE,
            3,
            ARRAY['FEES_VARIANCE'],
            '{
                "assign": {"team": "finance"},
                "notify": true,
                "tag": {"tags": ["fee_variance", "bank_overcharge"]},
                "escalate": {"after_hours": 4, "to_role": "finance_manager"}
            }'::jsonb,
            'system',
            NOW(),
            NOW()
        )
        ON CONFLICT (rule_name) DO UPDATE SET
            enabled = EXCLUDED.enabled,
            actions = EXCLUDED.actions,
            updated_at = NOW();
    END IF;
END $$;

-- Create view for fee variance analytics
CREATE OR REPLACE VIEW vw_fee_variance_analytics AS
SELECT 
    DATE(transaction_date) as date,
    COUNT(*) as variance_count,
    SUM(fee_variance_paise) as total_variance_paise,
    AVG(fee_variance_percentage) as avg_variance_percentage,
    SUM(CASE WHEN fee_variance_paise > 0 THEN 1 ELSE 0 END) as bank_overcharge_count,
    SUM(CASE WHEN fee_variance_paise < 0 THEN 1 ELSE 0 END) as bank_undercharge_count,
    SUM(CASE WHEN fee_variance_paise > 0 THEN fee_variance_paise ELSE 0 END) as total_overcharge_paise,
    SUM(CASE WHEN fee_variance_paise < 0 THEN ABS(fee_variance_paise) ELSE 0 END) as total_undercharge_paise
FROM sp_v2_transactions
WHERE exception_reason = 'FEES_VARIANCE'
GROUP BY DATE(transaction_date)
ORDER BY date DESC;

COMMENT ON VIEW vw_fee_variance_analytics IS 'Daily analytics for fee variance exceptions showing overcharge/undercharge patterns';

-- Create index for fee variance queries
CREATE INDEX IF NOT EXISTS idx_sp_v2_transactions_fee_variance 
ON sp_v2_transactions(exception_reason, fee_variance_paise) 
WHERE exception_reason = 'FEES_VARIANCE';

-- Migration complete
SELECT 'Migration 014 completed: Added fee tracking columns for FEES_VARIANCE detection' as status;
