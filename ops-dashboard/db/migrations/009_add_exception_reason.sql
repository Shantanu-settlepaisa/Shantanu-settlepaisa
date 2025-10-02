-- Migration 009: Add exception_reason column and update trigger
-- Purpose: Store actual exception reason codes from reconciliation engine
-- Date: October 2, 2025

-- Step 0: Create missing helper function
CREATE OR REPLACE FUNCTION fn_generate_exception_id()
RETURNS VARCHAR AS $$
DECLARE
    v_date_str VARCHAR(8);
    v_random_str VARCHAR(6);
BEGIN
    v_date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    v_random_str := UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6));
    RETURN 'EXC_' || v_date_str || '_' || v_random_str;
END;
$$ LANGUAGE plpgsql;

-- Step 1: Add exception_reason column to sp_v2_transactions
ALTER TABLE sp_v2_transactions 
ADD COLUMN IF NOT EXISTS exception_reason VARCHAR(50);

-- Step 2: Create index for faster querying by reason
CREATE INDEX IF NOT EXISTS idx_transactions_exception_reason 
ON sp_v2_transactions(exception_reason) 
WHERE status = 'EXCEPTION';

-- Step 3: Update trigger to use actual exception_reason from transaction
CREATE OR REPLACE FUNCTION fn_create_exception_workflow()
RETURNS TRIGGER AS $$
DECLARE
    v_reason VARCHAR(50);
    v_severity VARCHAR(20);
    v_sla_hours INT;
    v_sla_due TIMESTAMP WITH TIME ZONE;
    v_exception_id VARCHAR(50);
BEGIN
    IF NEW.status = 'EXCEPTION' AND (OLD IS NULL OR OLD.status != 'EXCEPTION') THEN
        -- Use actual reason from transaction, default to AMOUNT_MISMATCH if not set
        v_reason := COALESCE(NEW.exception_reason, 'AMOUNT_MISMATCH');
        
        -- Determine severity based on amount and reason
        v_severity := fn_determine_severity(NEW.amount_paise, v_reason);
        
        -- Calculate SLA based on reason and severity
        v_sla_hours := fn_calculate_sla(v_reason, v_severity);
        v_sla_due := NOW() + (v_sla_hours || ' hours')::INTERVAL;
        
        -- Generate unique exception ID
        v_exception_id := fn_generate_exception_id();
        
        -- Insert into exception workflow table
        INSERT INTO sp_v2_exception_workflow (
            exception_id,
            transaction_id,
            merchant_id,
            acquirer_code,
            cycle_date,
            pg_transaction_id,
            bank_reference_id,
            utr,
            pg_amount_paise,
            bank_amount_paise,
            amount_delta_paise,
            reason,
            severity,
            status,
            sla_due_at,
            sla_breached,
            assigned_to,
            assigned_to_name,
            tags,
            created_at,
            updated_at
        ) VALUES (
            v_exception_id,
            NEW.id,
            NEW.merchant_id,
            NULL,  -- acquirer_code (sp_v2_transactions doesn't have acquirer_id)
            NEW.transaction_date,
            NEW.transaction_id,
            NULL,
            NEW.utr,
            NEW.amount_paise,
            0,
            NEW.amount_paise,
            v_reason,  -- Now using actual reason from transaction!
            v_severity,
            'open',
            v_sla_due,
            FALSE,
            NULL,
            NULL,
            ARRAY[]::TEXT[],
            NEW.created_at,
            NOW()
        );
        
        RAISE NOTICE 'Exception workflow created: % for transaction % with reason %', 
            v_exception_id, NEW.transaction_id, v_reason;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Drop and recreate fn_determine_severity to consider reason type
DROP FUNCTION IF EXISTS fn_determine_severity(BIGINT, VARCHAR);

CREATE FUNCTION fn_determine_severity(p_amount_paise BIGINT, p_reason VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_amount_rupees NUMERIC;
    v_severity VARCHAR(20);
BEGIN
    v_amount_rupees := p_amount_paise / 100.0;
    
    -- CRITICAL severity for specific reason types
    IF p_reason IN ('MISSING_UTR', 'DUPLICATE_UTR') THEN
        RETURN 'CRITICAL';
    END IF;
    
    -- UTR_NOT_FOUND is HIGH severity regardless of amount
    IF p_reason = 'UTR_NOT_FOUND' THEN
        RETURN 'HIGH';
    END IF;
    
    -- For AMOUNT_MISMATCH and NO_PG_TXN, use amount-based severity
    IF v_amount_rupees >= 100000 THEN
        v_severity := 'CRITICAL';
    ELSIF v_amount_rupees >= 10000 THEN
        v_severity := 'HIGH';
    ELSIF v_amount_rupees >= 1000 THEN
        v_severity := 'MEDIUM';
    ELSE
        v_severity := 'LOW';
    END IF;
    
    RETURN v_severity;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Update fn_calculate_sla to consider reason type
CREATE OR REPLACE FUNCTION fn_calculate_sla(p_reason VARCHAR, p_severity VARCHAR)
RETURNS INT AS $$
DECLARE
    v_hours INT;
BEGIN
    -- Check if there's a specific SLA configuration for this reason+severity
    SELECT hours_to_resolve INTO v_hours
    FROM sp_v2_sla_config
    WHERE reason = p_reason 
      AND severity = p_severity
      AND is_active = TRUE
    LIMIT 1;
    
    -- If found, return it
    IF v_hours IS NOT NULL THEN
        RETURN v_hours;
    END IF;
    
    -- Otherwise use default severity-based SLA
    CASE p_severity
        WHEN 'CRITICAL' THEN v_hours := 2;
        WHEN 'HIGH' THEN v_hours := 8;
        WHEN 'MEDIUM' THEN v_hours := 24;
        WHEN 'LOW' THEN v_hours := 72;
        ELSE v_hours := 24;
    END CASE;
    
    RETURN v_hours;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Add SLA configurations for new reason types (if not already present)
INSERT INTO sp_v2_sla_config (reason, severity, hours_to_resolve, is_active, created_at, updated_at)
VALUES 
    ('UTR_NOT_FOUND', 'HIGH', 4, TRUE, NOW(), NOW()),
    ('DUPLICATE_UTR', 'CRITICAL', 2, TRUE, NOW(), NOW()),
    ('MISSING_UTR', 'CRITICAL', 4, TRUE, NOW(), NOW()),
    ('NO_PG_TXN', 'MEDIUM', 12, TRUE, NOW(), NOW())
ON CONFLICT (reason, severity) DO UPDATE 
SET 
    hours_to_resolve = EXCLUDED.hours_to_resolve,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Verification queries
DO $$
BEGIN
    RAISE NOTICE '=== Migration 009 Verification ===';
    RAISE NOTICE 'Column exception_reason added to sp_v2_transactions: %', 
        (SELECT COUNT(*) FROM information_schema.columns 
         WHERE table_name = 'sp_v2_transactions' 
         AND column_name = 'exception_reason') > 0;
    RAISE NOTICE 'Trigger fn_create_exception_workflow updated successfully';
    RAISE NOTICE 'SLA configurations added for new reason types';
    RAISE NOTICE '=== Migration 009 Complete ===';
END $$;
