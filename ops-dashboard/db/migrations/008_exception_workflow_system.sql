-- =====================================================
-- Exception Workflow System - Complete Implementation
-- Version: 2.5.0
-- Date: 2025-10-02
-- =====================================================

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS sp_v2_exception_comments CASCADE;
DROP TABLE IF EXISTS sp_v2_exception_ml_suggestions CASCADE;
DROP TABLE IF EXISTS sp_v2_exception_actions CASCADE;
DROP TABLE IF EXISTS sp_v2_exception_workflow CASCADE;
DROP TABLE IF EXISTS sp_v2_exception_saved_views CASCADE;
DROP TABLE IF EXISTS sp_v2_exception_rules CASCADE;
DROP TABLE IF EXISTS sp_v2_sla_config CASCADE;
DROP SEQUENCE IF EXISTS exception_seq CASCADE;

-- =====================================================
-- 1. EXCEPTION SEQUENCE
-- =====================================================
CREATE SEQUENCE exception_seq START 1;

-- =====================================================
-- 2. SLA CONFIGURATION TABLE
-- =====================================================
CREATE TABLE sp_v2_sla_config (
    id SERIAL PRIMARY KEY,
    reason VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    hours_to_resolve INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(reason, severity)
);

-- Insert default SLA configurations
INSERT INTO sp_v2_sla_config (reason, severity, hours_to_resolve) VALUES
    ('AMOUNT_MISMATCH', 'CRITICAL', 2),
    ('AMOUNT_MISMATCH', 'HIGH', 8),
    ('AMOUNT_MISMATCH', 'MEDIUM', 24),
    ('AMOUNT_MISMATCH', 'LOW', 48),
    ('DATE_MISMATCH', 'HIGH', 12),
    ('DATE_MISMATCH', 'MEDIUM', 24),
    ('DATE_MISMATCH', 'LOW', 72),
    ('FEE_MISMATCH', 'HIGH', 8),
    ('FEE_MISMATCH', 'MEDIUM', 24),
    ('FEE_MISMATCH', 'LOW', 48),
    ('BANK_FILE_AWAITED', 'HIGH', 12),
    ('BANK_FILE_AWAITED', 'MEDIUM', 24),
    ('BANK_FILE_AWAITED', 'LOW', 72),
    ('PG_ONLY', 'CRITICAL', 4),
    ('PG_ONLY', 'HIGH', 12),
    ('PG_ONLY', 'MEDIUM', 24),
    ('BANK_ONLY', 'CRITICAL', 4),
    ('BANK_ONLY', 'HIGH', 12),
    ('BANK_ONLY', 'MEDIUM', 24),
    ('DUPLICATE', 'MEDIUM', 24),
    ('DUPLICATE', 'LOW', 48),
    ('REFUND_PENDING', 'HIGH', 8),
    ('REFUND_PENDING', 'MEDIUM', 24),
    ('MISSING_UTR', 'CRITICAL', 4),
    ('MISSING_UTR', 'HIGH', 8),
    ('STATUS_MISMATCH', 'MEDIUM', 24),
    ('MERCHANT_MISMATCH', 'HIGH', 8);

-- =====================================================
-- 3. EXCEPTION WORKFLOW TABLE (Primary tracking)
-- =====================================================
CREATE TABLE sp_v2_exception_workflow (
    id BIGSERIAL PRIMARY KEY,
    exception_id VARCHAR(50) NOT NULL UNIQUE,
    transaction_id BIGINT NOT NULL REFERENCES sp_v2_transactions(id) ON DELETE CASCADE,
    bank_statement_id BIGINT REFERENCES sp_v2_bank_statements(id) ON DELETE SET NULL,
    
    -- Classification
    reason VARCHAR(50) NOT NULL DEFAULT 'AMOUNT_MISMATCH',
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'snoozed', 'resolved', 'wont_fix', 'escalated')),
    
    -- Workflow fields
    assigned_to VARCHAR(100),
    assigned_to_name VARCHAR(255),
    assigned_at TIMESTAMP WITH TIME ZONE,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- SLA tracking
    sla_due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sla_breached BOOLEAN DEFAULT FALSE,
    last_transition_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Snooze
    snooze_until TIMESTAMP WITH TIME ZONE,
    snoozed_by VARCHAR(100),
    snooze_reason TEXT,
    
    -- Resolution
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100),
    resolution VARCHAR(50) CHECK (resolution IN ('MANUAL_MATCH', 'AUTO_CORRECTED', 'ACCOUNTING_ADJUSTMENT', 'WONT_FIX', 'DUPLICATE', 'FALSE_POSITIVE')),
    resolution_note TEXT,
    
    -- Variance tracking
    pg_amount_paise BIGINT,
    bank_amount_paise BIGINT,
    amount_delta_paise BIGINT,
    
    -- Source tracking
    source_job_id VARCHAR(100),
    rule_applied VARCHAR(100),
    
    -- Merchant & Acquirer (denormalized for performance)
    merchant_id VARCHAR(50),
    merchant_name VARCHAR(255),
    acquirer_code VARCHAR(50),
    cycle_date DATE,
    
    -- Metadata
    pg_transaction_id VARCHAR(100),
    bank_reference_id VARCHAR(100),
    utr VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for exception_workflow
CREATE INDEX idx_exception_status ON sp_v2_exception_workflow(status);
CREATE INDEX idx_exception_severity ON sp_v2_exception_workflow(severity);
CREATE INDEX idx_exception_reason ON sp_v2_exception_workflow(reason);
CREATE INDEX idx_exception_sla ON sp_v2_exception_workflow(sla_due_at, sla_breached);
CREATE INDEX idx_exception_assigned ON sp_v2_exception_workflow(assigned_to);
CREATE INDEX idx_exception_created ON sp_v2_exception_workflow(created_at DESC);
CREATE INDEX idx_exception_merchant ON sp_v2_exception_workflow(merchant_id);
CREATE INDEX idx_exception_cycle ON sp_v2_exception_workflow(cycle_date);
CREATE INDEX idx_exception_transaction ON sp_v2_exception_workflow(transaction_id);

-- =====================================================
-- 4. EXCEPTION ACTIONS TABLE (Audit trail)
-- =====================================================
CREATE TABLE sp_v2_exception_actions (
    id BIGSERIAL PRIMARY KEY,
    exception_id VARCHAR(50) NOT NULL REFERENCES sp_v2_exception_workflow(exception_id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- State changes
    before_status VARCHAR(20),
    after_status VARCHAR(20),
    before_severity VARCHAR(20),
    after_severity VARCHAR(20),
    before_assigned_to VARCHAR(100),
    after_assigned_to VARCHAR(100),
    
    -- Action details
    note TEXT,
    metadata JSONB
);

-- Indexes for exception_actions
CREATE INDEX idx_exception_action_exception ON sp_v2_exception_actions(exception_id, timestamp DESC);
CREATE INDEX idx_exception_action_user ON sp_v2_exception_actions(user_id, timestamp DESC);
CREATE INDEX idx_exception_action_timestamp ON sp_v2_exception_actions(timestamp DESC);

-- =====================================================
-- 5. EXCEPTION RULES TABLE
-- =====================================================
CREATE TABLE sp_v2_exception_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    enabled BOOLEAN DEFAULT TRUE,
    
    -- Scope (when to apply this rule)
    scope_reason_codes TEXT[],
    scope_amount_delta_gt BIGINT,
    scope_amount_delta_lt BIGINT,
    scope_age_gt INTEGER,
    scope_age_lt INTEGER,
    scope_acquirers TEXT[],
    scope_merchants TEXT[],
    scope_tags_includes TEXT[],
    scope_tags_excludes TEXT[],
    scope_status TEXT[],
    scope_severity TEXT[],
    
    -- Actions (what to do when rule matches)
    actions JSONB NOT NULL,
    
    -- Metadata
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_applied_at TIMESTAMP WITH TIME ZONE,
    applied_count INTEGER DEFAULT 0
);

-- Indexes for exception_rules
CREATE INDEX idx_rule_priority ON sp_v2_exception_rules(priority, enabled);
CREATE INDEX idx_rule_enabled ON sp_v2_exception_rules(enabled);

-- =====================================================
-- 6. SAVED VIEWS TABLE
-- =====================================================
CREATE TABLE sp_v2_exception_saved_views (
    id SERIAL PRIMARY KEY,
    view_name VARCHAR(255) NOT NULL,
    description TEXT,
    query JSONB NOT NULL,
    owner_id VARCHAR(100) NOT NULL,
    owner_name VARCHAR(255),
    shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    use_count INTEGER DEFAULT 0
);

-- Indexes for saved_views
CREATE INDEX idx_saved_view_owner ON sp_v2_exception_saved_views(owner_id);
CREATE INDEX idx_saved_view_shared ON sp_v2_exception_saved_views(shared);

-- =====================================================
-- 7. EXCEPTION COMMENTS TABLE (Team collaboration)
-- =====================================================
CREATE TABLE sp_v2_exception_comments (
    id BIGSERIAL PRIMARY KEY,
    exception_id VARCHAR(50) NOT NULL REFERENCES sp_v2_exception_workflow(exception_id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255),
    comment TEXT NOT NULL,
    mentions TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for comments
CREATE INDEX idx_exception_comment_exception ON sp_v2_exception_comments(exception_id, created_at DESC);

-- =====================================================
-- 8. FUNCTIONS
-- =====================================================

-- Function: Calculate SLA due date
CREATE OR REPLACE FUNCTION fn_calculate_sla(
    p_reason VARCHAR,
    p_severity VARCHAR,
    p_created_at TIMESTAMP WITH TIME ZONE
) RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    sla_hours INTEGER;
BEGIN
    -- Get SLA hours from config table
    SELECT hours_to_resolve INTO sla_hours
    FROM sp_v2_sla_config
    WHERE reason = p_reason
      AND severity = p_severity
      AND is_active = TRUE
    LIMIT 1;
    
    -- If not found, use default based on severity
    IF sla_hours IS NULL THEN
        sla_hours := CASE p_severity
            WHEN 'CRITICAL' THEN 4
            WHEN 'HIGH' THEN 8
            WHEN 'MEDIUM' THEN 24
            WHEN 'LOW' THEN 48
            ELSE 24
        END;
    END IF;
    
    RETURN p_created_at + (sla_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-determine severity based on amount delta
CREATE OR REPLACE FUNCTION fn_determine_severity(
    p_amount_delta_paise BIGINT,
    p_reason VARCHAR
) RETURNS VARCHAR AS $$
BEGIN
    -- Critical: Delta > ₹50,000 (5,000,000 paise)
    IF ABS(p_amount_delta_paise) > 5000000 THEN
        RETURN 'CRITICAL';
    -- High: Delta > ₹10,000 (1,000,000 paise)
    ELSIF ABS(p_amount_delta_paise) > 1000000 THEN
        RETURN 'HIGH';
    -- Medium: Delta > ₹1,000 (100,000 paise)
    ELSIF ABS(p_amount_delta_paise) > 100000 THEN
        RETURN 'MEDIUM';
    -- Low: Delta <= ₹1,000
    ELSE
        RETURN 'LOW';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. TRIGGERS
-- =====================================================

-- Trigger 1: Auto-create exception workflow when transaction marked EXCEPTION
CREATE OR REPLACE FUNCTION fn_create_exception_workflow()
RETURNS TRIGGER AS $$
DECLARE
    v_exception_id VARCHAR(50);
    v_severity VARCHAR(20);
    v_reason VARCHAR(50);
    v_sla_due_at TIMESTAMP WITH TIME ZONE;
    v_merchant_name VARCHAR(255);
    v_acquirer VARCHAR(50);
BEGIN
    -- Only fire when status changes TO 'EXCEPTION'
    IF NEW.status = 'EXCEPTION' AND (OLD IS NULL OR OLD.status != 'EXCEPTION') THEN
        
        -- Generate unique exception ID
        v_exception_id := 'EXC_' || TO_CHAR(NOW(), 'YYYYMMDD') || '_' || LPAD(nextval('exception_seq')::TEXT, 6, '0');
        
        -- Determine reason (default to AMOUNT_MISMATCH for now)
        v_reason := COALESCE(NEW.exception_reason, 'AMOUNT_MISMATCH');
        
        -- Auto-determine severity based on amount
        v_severity := fn_determine_severity(NEW.amount_paise, v_reason);
        
        -- Calculate SLA due date
        v_sla_due_at := fn_calculate_sla(v_reason, v_severity, NOW());
        
        -- Get merchant name (you may need to join with merchant table)
        v_merchant_name := COALESCE(NEW.merchant_name, NEW.merchant_id);
        
        -- Get acquirer (from transaction or default)
        v_acquirer := COALESCE(NEW.acquirer_code, 'UNKNOWN');
        
        -- Insert into exception workflow
        INSERT INTO sp_v2_exception_workflow (
            exception_id,
            transaction_id,
            reason,
            severity,
            status,
            sla_due_at,
            pg_amount_paise,
            amount_delta_paise,
            merchant_id,
            merchant_name,
            acquirer_code,
            cycle_date,
            pg_transaction_id,
            utr,
            created_at
        ) VALUES (
            v_exception_id,
            NEW.id,
            v_reason,
            v_severity,
            'open',
            v_sla_due_at,
            NEW.amount_paise,
            0, -- Will be calculated if bank statement exists
            NEW.merchant_id,
            v_merchant_name,
            v_acquirer,
            NEW.transaction_date,
            NEW.transaction_id,
            NEW.utr,
            NOW()
        );
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_exception_workflow
    AFTER INSERT OR UPDATE ON sp_v2_transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_create_exception_workflow();

-- Trigger 2: Sync transaction status when exception resolved
CREATE OR REPLACE FUNCTION fn_sync_transaction_status()
RETURNS TRIGGER AS $$
BEGIN
    -- When exception is resolved, update transaction to RECONCILED
    IF NEW.status = 'resolved' AND (OLD IS NULL OR OLD.status != 'resolved') THEN
        UPDATE sp_v2_transactions
        SET status = 'RECONCILED',
            updated_at = NOW()
        WHERE id = NEW.transaction_id;
        
        -- Update resolved timestamp
        NEW.resolved_at := NOW();
    END IF;
    
    -- When exception is reopened, set transaction back to EXCEPTION
    IF NEW.status IN ('open', 'investigating') AND OLD.status = 'resolved' THEN
        UPDATE sp_v2_transactions
        SET status = 'EXCEPTION',
            updated_at = NOW()
        WHERE id = NEW.transaction_id;
        
        -- Clear resolved timestamp
        NEW.resolved_at := NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_transaction_status
    BEFORE UPDATE ON sp_v2_exception_workflow
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_transaction_status();

-- Trigger 3: Log all exception actions to timeline
CREATE OR REPLACE FUNCTION fn_log_exception_action()
RETURNS TRIGGER AS $$
DECLARE
    v_action VARCHAR(50);
    v_user_id VARCHAR(100);
    v_user_name VARCHAR(255);
BEGIN
    -- Determine action type
    IF TG_OP = 'INSERT' THEN
        v_action := 'CREATED';
        v_user_id := 'SYSTEM';
        v_user_name := 'System';
    ELSIF OLD.status != NEW.status THEN
        v_action := 'STATUS_CHANGED';
        v_user_id := COALESCE(NEW.resolved_by, NEW.assigned_to, 'SYSTEM');
        v_user_name := COALESCE(NEW.assigned_to_name, 'System');
    ELSIF OLD.severity != NEW.severity THEN
        v_action := 'SEVERITY_CHANGED';
        v_user_id := COALESCE(NEW.assigned_to, 'SYSTEM');
        v_user_name := COALESCE(NEW.assigned_to_name, 'System');
    ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        v_action := 'ASSIGNED';
        v_user_id := COALESCE(NEW.assigned_to, 'SYSTEM');
        v_user_name := COALESCE(NEW.assigned_to_name, 'System');
    ELSE
        v_action := 'UPDATED';
        v_user_id := COALESCE(NEW.assigned_to, 'SYSTEM');
        v_user_name := COALESCE(NEW.assigned_to_name, 'System');
    END IF;
    
    -- Insert action log
    INSERT INTO sp_v2_exception_actions (
        exception_id,
        user_id,
        user_name,
        action,
        timestamp,
        before_status,
        after_status,
        before_severity,
        after_severity,
        before_assigned_to,
        after_assigned_to,
        note
    ) VALUES (
        NEW.exception_id,
        v_user_id,
        v_user_name,
        v_action,
        NOW(),
        OLD.status,
        NEW.status,
        OLD.severity,
        NEW.severity,
        OLD.assigned_to,
        NEW.assigned_to,
        NEW.resolution_note
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_exception_action
    AFTER INSERT OR UPDATE ON sp_v2_exception_workflow
    FOR EACH ROW
    EXECUTE FUNCTION fn_log_exception_action();

-- Trigger 4: Update exception summary on status change
CREATE OR REPLACE FUNCTION fn_update_exception_summary()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
        -- Increment summary counts
        INSERT INTO sp_v2_exceptions_summary (
            summary_date,
            reason_code,
            severity,
            exception_count,
            total_amount_paise,
            manual_upload_count,
            connector_count
        ) VALUES (
            CURRENT_DATE,
            NEW.reason,
            NEW.severity,
            1,
            ABS(NEW.amount_delta_paise),
            CASE WHEN (SELECT source_type FROM sp_v2_transactions WHERE id = NEW.transaction_id) = 'MANUAL_UPLOAD' THEN 1 ELSE 0 END,
            CASE WHEN (SELECT source_type FROM sp_v2_transactions WHERE id = NEW.transaction_id) = 'CONNECTOR' THEN 1 ELSE 0 END
        )
        ON CONFLICT (summary_date, reason_code, severity) DO UPDATE SET
            exception_count = sp_v2_exceptions_summary.exception_count + 1,
            total_amount_paise = sp_v2_exceptions_summary.total_amount_paise + EXCLUDED.total_amount_paise,
            manual_upload_count = sp_v2_exceptions_summary.manual_upload_count + EXCLUDED.manual_upload_count,
            connector_count = sp_v2_exceptions_summary.connector_count + EXCLUDED.connector_count,
            last_updated = NOW();
            
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
        -- Decrement summary counts when resolved
        UPDATE sp_v2_exceptions_summary
        SET exception_count = GREATEST(exception_count - 1, 0),
            last_updated = NOW()
        WHERE summary_date = CURRENT_DATE
          AND reason_code = NEW.reason
          AND severity = NEW.severity;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_exception_summary
    AFTER INSERT OR UPDATE ON sp_v2_exception_workflow
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_exception_summary();

-- Trigger 5: Check SLA breach
CREATE OR REPLACE FUNCTION fn_check_sla_breach()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark as breached if current time exceeds SLA due date
    IF NEW.status NOT IN ('resolved', 'wont_fix') AND NOW() > NEW.sla_due_at THEN
        NEW.sla_breached := TRUE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_sla_breach
    BEFORE INSERT OR UPDATE ON sp_v2_exception_workflow
    FOR EACH ROW
    EXECUTE FUNCTION fn_check_sla_breach();

-- =====================================================
-- 10. DEFAULT EXCEPTION RULES
-- =====================================================

-- Rule 1: Auto-assign critical amount mismatches to senior ops
INSERT INTO sp_v2_exception_rules (
    rule_name,
    priority,
    enabled,
    scope_reason_codes,
    scope_severity,
    actions,
    created_by
) VALUES (
    'Auto-assign Critical Amount Mismatches',
    10,
    TRUE,
    ARRAY['AMOUNT_MISMATCH'],
    ARRAY['CRITICAL'],
    '[{"type": "setSeverity", "params": {"severity": "CRITICAL"}}, {"type": "addTag", "params": {"tag": "urgent"}}]'::JSONB,
    'SYSTEM'
);

-- Rule 2: Auto-tag high-value exceptions
INSERT INTO sp_v2_exception_rules (
    rule_name,
    priority,
    enabled,
    scope_amount_delta_gt,
    actions,
    created_by
) VALUES (
    'Tag High-Value Exceptions',
    20,
    TRUE,
    1000000, -- > ₹10,000
    '[{"type": "addTag", "params": {"tag": "high-value"}}, {"type": "setSeverity", "params": {"severity": "HIGH"}}]'::JSONB,
    'SYSTEM'
);

-- Rule 3: Auto-snooze bank file awaited exceptions
INSERT INTO sp_v2_exception_rules (
    rule_name,
    priority,
    enabled,
    scope_reason_codes,
    actions,
    created_by
) VALUES (
    'Auto-snooze Bank File Awaited',
    30,
    TRUE,
    ARRAY['BANK_FILE_AWAITED'],
    '[{"type": "addTag", "params": {"tag": "awaiting-bank-file"}}]'::JSONB,
    'SYSTEM'
);

-- =====================================================
-- 11. DEFAULT SAVED VIEWS
-- =====================================================

-- View 1: My Open Exceptions
INSERT INTO sp_v2_exception_saved_views (
    view_name,
    description,
    query,
    owner_id,
    owner_name,
    shared
) VALUES (
    'My Open Exceptions',
    'All exceptions assigned to me that are open',
    '{"status": ["open"], "assignedTo": "current_user"}'::JSONB,
    'SYSTEM',
    'System',
    TRUE
);

-- View 2: SLA Breached
INSERT INTO sp_v2_exception_saved_views (
    view_name,
    description,
    query,
    owner_id,
    owner_name,
    shared
) VALUES (
    'SLA Breached',
    'All exceptions that have breached their SLA',
    '{"slaBreached": true}'::JSONB,
    'SYSTEM',
    'System',
    TRUE
);

-- View 3: Critical & High Severity
INSERT INTO sp_v2_exception_saved_views (
    view_name,
    description,
    query,
    owner_id,
    owner_name,
    shared
) VALUES (
    'Critical & High Priority',
    'Critical and high severity exceptions needing immediate attention',
    '{"severity": ["CRITICAL", "HIGH"], "status": ["open", "investigating"]}'::JSONB,
    'SYSTEM',
    'System',
    TRUE
);

-- View 4: Amount Mismatches
INSERT INTO sp_v2_exception_saved_views (
    view_name,
    description,
    query,
    owner_id,
    owner_name,
    shared
) VALUES (
    'Amount Mismatches',
    'All amount mismatch exceptions',
    '{"reason": ["AMOUNT_MISMATCH"]}'::JSONB,
    'SYSTEM',
    'System',
    TRUE
);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Grant permissions (adjust as needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Add comment for documentation
COMMENT ON TABLE sp_v2_exception_workflow IS 'Primary exception tracking table with full workflow lifecycle';
COMMENT ON TABLE sp_v2_exception_actions IS 'Audit trail of all actions taken on exceptions';
COMMENT ON TABLE sp_v2_exception_rules IS 'Auto-assignment and processing rules for exceptions';
COMMENT ON TABLE sp_v2_exception_saved_views IS 'User-defined filter presets for exception views';
