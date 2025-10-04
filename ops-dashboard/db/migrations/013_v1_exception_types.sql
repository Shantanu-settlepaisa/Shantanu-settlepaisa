-- Migration 013: V1-Style Exception Types (11 Types)
-- Purpose: Add SLA configs and support for all V1 exception reasons
-- Date: October 2, 2025
-- Version: 2.9.0

-- =====================================================
-- 1. Add SLA Configurations for All V1 Exception Types
-- =====================================================

INSERT INTO sp_v2_sla_config (reason, severity, hours_to_resolve, is_active, created_at, updated_at)
VALUES 
    -- Critical exceptions (2-4 hours)
    ('BANK_FILE_MISSING', 'CRITICAL', 2, TRUE, NOW(), NOW()),
    ('UTR_MISSING_OR_INVALID', 'CRITICAL', 4, TRUE, NOW(), NOW()),
    ('DUPLICATE_PG_ENTRY', 'CRITICAL', 2, TRUE, NOW(), NOW()),
    ('DUPLICATE_BANK_ENTRY', 'CRITICAL', 2, TRUE, NOW(), NOW()),
    
    -- High severity (4-8 hours)
    ('DATE_OUT_OF_WINDOW', 'HIGH', 8, TRUE, NOW(), NOW()),
    ('UTR_MISMATCH', 'HIGH', 6, TRUE, NOW(), NOW()),
    ('AMOUNT_MISMATCH', 'HIGH', 4, TRUE, NOW(), NOW()),
    
    -- Medium severity (8-12 hours)
    ('FEE_MISMATCH', 'MEDIUM', 12, TRUE, NOW(), NOW()),
    ('ROUNDING_ERROR', 'MEDIUM', 12, TRUE, NOW(), NOW()),
    
    -- Existing types - keep current config
    ('PG_TXN_MISSING_IN_BANK', 'HIGH', 8, TRUE, NOW(), NOW()),
    ('BANK_TXN_MISSING_IN_PG', 'HIGH', 8, TRUE, NOW(), NOW())
ON CONFLICT (reason, severity) DO UPDATE 
SET 
    hours_to_resolve = EXCLUDED.hours_to_resolve,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- =====================================================
-- 2. Update Exception Reason Column Comment
-- =====================================================

COMMENT ON COLUMN sp_v2_transactions.exception_reason IS 
'V1-Style Exception Reason Codes:
- BANK_FILE_MISSING: No bank file uploaded for reconciliation cycle
- PG_TXN_MISSING_IN_BANK: PG transaction exists, no matching bank record (UNMATCHED_IN_BANK)
- BANK_TXN_MISSING_IN_PG: Bank record exists, no matching PG transaction (UNMATCHED_IN_PG)
- UTR_MISSING_OR_INVALID: PG transaction has no UTR or invalid UTR
- UTR_MISMATCH: UTR format mismatch (RRN vs UTR)
- DATE_OUT_OF_WINDOW: Date difference exceeds T+2 window
- AMOUNT_MISMATCH: Amount differs beyond tolerance
- FEE_MISMATCH: Amount difference suggests bank fee (₹2-₹5)
- ROUNDING_ERROR: Amount difference is exactly ₹0.01
- DUPLICATE_PG_ENTRY: Same UTR in multiple PG transactions
- DUPLICATE_BANK_ENTRY: Same UTR in multiple bank records';

-- =====================================================
-- 3. Update Exception Rules for New Types
-- =====================================================

INSERT INTO sp_v2_exception_rules (
    rule_name,
    enabled,
    priority,
    scope_reason_codes,
    actions,
    applied_count,
    created_at,
    updated_at
)
VALUES 
    (
        'Auto-assign BANK_FILE_MISSING to Ops Lead',
        TRUE,
        1,
        ARRAY['BANK_FILE_MISSING'],
        '{"assign": {"role": "ops_lead"}, "notify": true, "escalate": {"after_hours": 1}}'::jsonb,
        0,
        NOW(),
        NOW()
    ),
    (
        'Auto-assign DATE_OUT_OF_WINDOW to Reconciliation Team',
        TRUE,
        2,
        ARRAY['DATE_OUT_OF_WINDOW'],
        '{"assign": {"team": "recon"}, "notify": true, "tag": {"tags": ["date_mismatch"]}}'::jsonb,
        0,
        NOW(),
        NOW()
    ),
    (
        'Auto-tag FEE_MISMATCH for review',
        TRUE,
        3,
        ARRAY['FEE_MISMATCH'],
        '{"tag": {"tags": ["bank_fee", "verify_with_bank"]}, "notify": false}'::jsonb,
        0,
        NOW(),
        NOW()
    ),
    (
        'Auto-resolve ROUNDING_ERROR',
        TRUE,
        4,
        ARRAY['ROUNDING_ERROR'],
        '{"tag": {"tags": ["auto_resolvable", "rounding"]}, "notify": false}'::jsonb,
        0,
        NOW(),
        NOW()
    ),
    (
        'Critical: DUPLICATE entries',
        TRUE,
        5,
        ARRAY['DUPLICATE_PG_ENTRY', 'DUPLICATE_BANK_ENTRY'],
        '{"assign": {"role": "senior_ops"}, "notify": true, "escalate": {"after_hours": 2}}'::jsonb,
        0,
        NOW(),
        NOW()
    ),
    (
        'Auto-assign UTR issues to Tech Team',
        TRUE,
        6,
        ARRAY['UTR_MISSING_OR_INVALID', 'UTR_MISMATCH'],
        '{"assign": {"team": "tech"}, "notify": true, "tag": {"tags": ["utr_issue"]}}'::jsonb,
        0,
        NOW(),
        NOW()
    )
ON CONFLICT (rule_name) DO NOTHING;

-- =====================================================
-- 4. Create Exception Type Statistics View
-- =====================================================

CREATE OR REPLACE VIEW vw_exception_type_stats AS
SELECT 
    exception_reason as reason,
    COUNT(*) as count,
    SUM(amount_paise) as total_amount_paise,
    AVG(amount_paise) as avg_amount_paise,
    MIN(transaction_date) as earliest_date,
    MAX(transaction_date) as latest_date,
    COUNT(DISTINCT merchant_id) as affected_merchants
FROM sp_v2_transactions
WHERE status = 'EXCEPTION'
  AND exception_reason IS NOT NULL
GROUP BY exception_reason
ORDER BY count DESC;

COMMENT ON VIEW vw_exception_type_stats IS 
'Statistics for each exception type - count, amount, date range, affected merchants';

-- =====================================================
-- 5. Create V1 Reason Code Mapping View
-- =====================================================

CREATE OR REPLACE VIEW vw_v1_reason_code_mapping AS
SELECT 
    'BANK_FILE_MISSING' as v1_code,
    'CRITICAL' as default_severity,
    2 as default_sla_hours,
    'No bank file uploaded for reconciliation cycle' as description,
    'Upload bank file immediately' as resolution
UNION ALL SELECT 'UTR_MISSING_OR_INVALID', 'CRITICAL', 4, 'PG transaction missing UTR', 'Contact PG for UTR reference'
UNION ALL SELECT 'DUPLICATE_PG_ENTRY', 'CRITICAL', 2, 'Same UTR in multiple PG transactions', 'Investigate duplicate submission'
UNION ALL SELECT 'DUPLICATE_BANK_ENTRY', 'CRITICAL', 2, 'Same UTR in multiple bank records', 'Check for duplicate bank postings'
UNION ALL SELECT 'DATE_OUT_OF_WINDOW', 'HIGH', 8, 'Date exceeds T+2 window', 'Check settlement delays/holidays'
UNION ALL SELECT 'UTR_MISMATCH', 'HIGH', 6, 'UTR format mismatch (RRN vs UTR)', 'Verify UTR/RRN mapping'
UNION ALL SELECT 'AMOUNT_MISMATCH', 'HIGH', 4, 'Amount differs beyond tolerance', 'Verify fees and deductions'
UNION ALL SELECT 'FEE_MISMATCH', 'MEDIUM', 12, 'Amount difference suggests bank fee', 'Confirm bank fee with statement'
UNION ALL SELECT 'ROUNDING_ERROR', 'MEDIUM', 12, 'Rounding difference (₹0.01)', 'Auto-resolvable, log for audit'
UNION ALL SELECT 'PG_TXN_MISSING_IN_BANK', 'HIGH', 8, 'PG exists, no bank match', 'Check with bank for transaction'
UNION ALL SELECT 'BANK_TXN_MISSING_IN_PG', 'HIGH', 8, 'Bank exists, no PG match', 'Verify if processed via different channel';

COMMENT ON VIEW vw_v1_reason_code_mapping IS 
'V1 exception reason codes with severity, SLA, and resolution guidance';

-- =====================================================
-- 6. Verification and Summary
-- =====================================================

DO $$
DECLARE
    v_sla_count INT;
    v_rule_count INT;
    v_exception_types TEXT[];
BEGIN
    -- Count SLA configs
    SELECT COUNT(*) INTO v_sla_count 
    FROM sp_v2_sla_config 
    WHERE is_active = TRUE;
    
    -- Count active rules
    SELECT COUNT(*) INTO v_rule_count 
    FROM sp_v2_exception_rules 
    WHERE enabled = TRUE;
    
    -- Get all exception types
    SELECT ARRAY_AGG(DISTINCT reason ORDER BY reason) INTO v_exception_types
    FROM sp_v2_sla_config
    WHERE is_active = TRUE;
    
    RAISE NOTICE '=== Migration 013 Complete ===';
    RAISE NOTICE 'Active SLA configs: %', v_sla_count;
    RAISE NOTICE 'Active exception rules: %', v_rule_count;
    RAISE NOTICE '';
    RAISE NOTICE 'V1 Exception Types Supported (11 types):';
    RAISE NOTICE '  1. BANK_FILE_MISSING - No bank file uploaded';
    RAISE NOTICE '  2. UTR_MISSING_OR_INVALID - Missing or invalid UTR';
    RAISE NOTICE '  3. DUPLICATE_PG_ENTRY - Duplicate UTR in PG';
    RAISE NOTICE '  4. DUPLICATE_BANK_ENTRY - Duplicate UTR in bank';
    RAISE NOTICE '  5. DATE_OUT_OF_WINDOW - Date exceeds T+2';
    RAISE NOTICE '  6. UTR_MISMATCH - RRN vs UTR format';
    RAISE NOTICE '  7. AMOUNT_MISMATCH - General amount difference';
    RAISE NOTICE '  8. FEE_MISMATCH - Bank fee (₹2-₹5)';
    RAISE NOTICE '  9. ROUNDING_ERROR - ₹0.01 difference';
    RAISE NOTICE ' 10. PG_TXN_MISSING_IN_BANK - UNMATCHED_IN_BANK';
    RAISE NOTICE ' 11. BANK_TXN_MISSING_IN_PG - UNMATCHED_IN_PG';
    RAISE NOTICE '';
    RAISE NOTICE 'Views created:';
    RAISE NOTICE '  - vw_exception_type_stats';
    RAISE NOTICE '  - vw_v1_reason_code_mapping';
END $$;
