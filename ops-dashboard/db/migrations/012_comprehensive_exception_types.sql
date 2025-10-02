-- Migration 012: Comprehensive Exception Types
-- Purpose: Add all exception reason types with proper SLA configurations
-- Date: October 2, 2025

-- =====================================================
-- 1. Add/Update SLA Configurations for All Exception Types
-- =====================================================

INSERT INTO sp_v2_sla_config (reason, severity, hours_to_resolve, is_active, created_at, updated_at)
VALUES 
    -- Critical exceptions (2-4 hours)
    ('DUPLICATE_UTR', 'CRITICAL', 2, TRUE, NOW(), NOW()),
    ('MISSING_UTR', 'CRITICAL', 4, TRUE, NOW(), NOW()),
    
    -- High severity (4-8 hours)
    ('AMOUNT_MISMATCH', 'HIGH', 4, TRUE, NOW(), NOW()),
    ('AMOUNT_MISMATCH', 'CRITICAL', 2, TRUE, NOW(), NOW()),
    
    -- Medium severity (8-24 hours)
    ('UNMATCHED_IN_BANK', 'HIGH', 8, TRUE, NOW(), NOW()),
    ('UNMATCHED_IN_BANK', 'MEDIUM', 12, TRUE, NOW(), NOW()),
    ('UNMATCHED_IN_BANK', 'LOW', 24, TRUE, NOW(), NOW()),
    
    ('UNMATCHED_IN_PG', 'HIGH', 8, TRUE, NOW(), NOW()),
    ('UNMATCHED_IN_PG', 'MEDIUM', 12, TRUE, NOW(), NOW()),
    ('UNMATCHED_IN_PG', 'LOW', 24, TRUE, NOW(), NOW()),
    
    -- Low severity defaults
    ('DUPLICATE_UTR', 'HIGH', 4, TRUE, NOW(), NOW()),
    ('MISSING_UTR', 'HIGH', 4, TRUE, NOW(), NOW())
ON CONFLICT (reason, severity) DO UPDATE 
SET 
    hours_to_resolve = EXCLUDED.hours_to_resolve,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- =====================================================
-- 2. Update Exception Reason Comments
-- =====================================================

COMMENT ON COLUMN sp_v2_transactions.exception_reason IS 
'Exception reason code:
- AMOUNT_MISMATCH: UTR found in both PG & Bank, but amounts differ
- UNMATCHED_IN_BANK: PG transaction exists, no matching bank record
- MISSING_UTR: PG transaction has no UTR (cannot match)
- DUPLICATE_UTR: Same UTR used in multiple PG transactions
- UNMATCHED_IN_PG: Bank record exists, no matching PG transaction (stored in sp_v2_bank_statements)';

-- =====================================================
-- 3. Create View for UNMATCHED_IN_PG Exceptions
-- =====================================================

CREATE OR REPLACE VIEW vw_unmatched_in_pg AS
SELECT 
    'BANK_' || b.id::TEXT as exception_id,
    b.bank_ref as bank_reference_id,
    b.utr,
    b.amount_paise as bank_amount_paise,
    0 as pg_amount_paise,
    b.amount_paise as amount_delta_paise,
    'UNMATCHED_IN_PG' as reason,
    CASE 
        WHEN b.amount_paise >= 10000000 THEN 'CRITICAL'  -- >= ₹100k
        WHEN b.amount_paise >= 1000000 THEN 'HIGH'       -- >= ₹10k
        WHEN b.amount_paise >= 100000 THEN 'MEDIUM'      -- >= ₹1k
        ELSE 'LOW'
    END as severity,
    'open' as status,
    b.bank_name,
    b.transaction_date as cycle_date,
    b.remarks,
    b.source_type,
    b.created_at,
    b.processed
FROM sp_v2_bank_statements b
WHERE b.processed = false
  AND NOT EXISTS (
    SELECT 1 FROM sp_v2_transactions t 
    WHERE t.utr = b.utr
  );

COMMENT ON VIEW vw_unmatched_in_pg IS 
'Bank records without matching PG transactions (UNMATCHED_IN_PG exceptions)';

-- =====================================================
-- 4. Create Comprehensive Exception Summary View
-- =====================================================

CREATE OR REPLACE VIEW vw_all_exceptions AS
-- PG-based exceptions (from sp_v2_exception_workflow)
SELECT 
    ew.exception_id,
    ew.reason,
    ew.severity,
    ew.status,
    ew.pg_transaction_id,
    ew.bank_reference_id,
    ew.utr,
    ew.pg_amount_paise,
    ew.bank_amount_paise,
    ew.amount_delta_paise,
    ew.merchant_id,
    ew.merchant_name,
    ew.cycle_date,
    ew.assigned_to,
    ew.assigned_to_name,
    ew.sla_due_at,
    ew.sla_breached,
    ew.created_at,
    ew.updated_at,
    'PG_EXCEPTION' as source_type
FROM sp_v2_exception_workflow ew
WHERE ew.status IN ('open', 'investigating', 'snoozed')

UNION ALL

-- Bank-based exceptions (UNMATCHED_IN_PG)
SELECT 
    u.exception_id,
    u.reason,
    u.severity,
    u.status,
    NULL as pg_transaction_id,
    u.bank_reference_id,
    u.utr,
    u.pg_amount_paise,
    u.bank_amount_paise,
    u.amount_delta_paise,
    NULL as merchant_id,
    u.bank_name as merchant_name,
    u.cycle_date,
    NULL as assigned_to,
    NULL as assigned_to_name,
    NULL as sla_due_at,
    FALSE as sla_breached,
    u.created_at,
    NULL as updated_at,
    'BANK_EXCEPTION' as source_type
FROM vw_unmatched_in_pg u;

COMMENT ON VIEW vw_all_exceptions IS 
'Unified view of all exceptions from both PG and Bank sources';

-- =====================================================
-- 5. Create Exception Statistics View
-- =====================================================

CREATE OR REPLACE VIEW vw_exception_stats AS
SELECT 
    reason,
    severity,
    COUNT(*) as count,
    SUM(pg_amount_paise + bank_amount_paise) as total_amount_paise,
    MIN(created_at) as earliest_exception,
    MAX(created_at) as latest_exception,
    COUNT(CASE WHEN sla_breached = true THEN 1 END) as sla_breached_count
FROM vw_all_exceptions
GROUP BY reason, severity
ORDER BY count DESC;

COMMENT ON VIEW vw_exception_stats IS 
'Exception statistics grouped by reason and severity';

-- =====================================================
-- 6. Update Default Exception Rules
-- =====================================================

-- Insert default auto-assignment rules for new exception types (if they don't exist)
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
SELECT * FROM (VALUES 
    ('Auto-assign DUPLICATE_UTR to Senior Ops', TRUE, 1, ARRAY['DUPLICATE_UTR'], '{"assign": {"role": "senior_ops"}, "notify": true}'::jsonb, 0, NOW(), NOW()),
    ('Auto-assign MISSING_UTR to Tech Team', TRUE, 2, ARRAY['MISSING_UTR'], '{"assign": {"team": "tech"}, "notify": true}'::jsonb, 0, NOW(), NOW()),
    ('Auto-tag high AMOUNT_MISMATCH', TRUE, 3, ARRAY['AMOUNT_MISMATCH'], '{"tag": {"tags": ["high_delta", "review_required"]}}'::jsonb, 0, NOW(), NOW())
) AS v(rule_name, enabled, priority, scope_reason_codes, actions, applied_count, created_at, updated_at)
WHERE NOT EXISTS (
    SELECT 1 FROM sp_v2_exception_rules WHERE rule_name = v.rule_name
);

-- =====================================================
-- Verification
-- =====================================================

DO $$
DECLARE
    v_sla_count INT;
    v_rule_count INT;
BEGIN
    SELECT COUNT(*) INTO v_sla_count FROM sp_v2_sla_config WHERE is_active = TRUE;
    SELECT COUNT(*) INTO v_rule_count FROM sp_v2_exception_rules WHERE enabled = TRUE;
    
    RAISE NOTICE '=== Migration 012 Complete ===';
    RAISE NOTICE 'Active SLA configs: %', v_sla_count;
    RAISE NOTICE 'Active exception rules: %', v_rule_count;
    RAISE NOTICE 'Views created: vw_unmatched_in_pg, vw_all_exceptions, vw_exception_stats';
    RAISE NOTICE '';
    RAISE NOTICE 'Exception Types Supported:';
    RAISE NOTICE '  - AMOUNT_MISMATCH (UTR match, amount differs)';
    RAISE NOTICE '  - UNMATCHED_IN_BANK (PG exists, no bank)';
    RAISE NOTICE '  - UNMATCHED_IN_PG (Bank exists, no PG)';
    RAISE NOTICE '  - MISSING_UTR (PG has no UTR)';
    RAISE NOTICE '  - DUPLICATE_UTR (Same UTR in multiple PG)';
END $$;
