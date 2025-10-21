-- Migration 027: Audit Log for Ops Dashboard
-- Date: 2025-10-21
-- Purpose: Track all user actions for compliance and security
-- Captures: Who did what, when, from where, and what changed

BEGIN;

-- ============================================================================
-- Create audit log table
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '🔧 Migration 027: Creating audit log table...';
END $$;

CREATE TABLE IF NOT EXISTS sp_v2_ops_audit_log (
  id BIGSERIAL PRIMARY KEY,

  -- Who (user performing the action)
  user_id UUID REFERENCES sp_v2_ops_users(id),
  user_email VARCHAR(255), -- Denormalized for query performance
  user_role VARCHAR(50),

  -- What (action performed)
  action VARCHAR(50) NOT NULL, -- LOGIN, LOGOUT, APPROVE_SETTLEMENT, UPDATE_MERCHANT, etc.
  action_category VARCHAR(30), -- AUTHENTICATION, SETTLEMENT, MERCHANT, TRANSACTION, SYSTEM

  -- Where (resource affected)
  resource_type VARCHAR(50), -- SETTLEMENT, MERCHANT, TRANSACTION, EXCEPTION, USER
  resource_id VARCHAR(100), -- ID of the affected resource
  resource_name TEXT, -- Human-readable name (e.g., merchant name, settlement batch ID)

  -- Details (what changed)
  old_value JSONB, -- Previous state (for updates)
  new_value JSONB, -- New state (for updates)
  changes JSONB, -- Diff of what changed
  metadata JSONB, -- Additional context

  -- When & Where
  created_at TIMESTAMP DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100), -- For tracing requests across services

  -- Result
  success BOOLEAN DEFAULT true,
  error_message TEXT,

  -- Performance tracking
  duration_ms INTEGER -- How long the action took
);

-- ============================================================================
-- Create indexes for common queries
-- ============================================================================

-- Query by user
CREATE INDEX IF NOT EXISTS idx_audit_log_user
  ON sp_v2_ops_audit_log(user_id, created_at DESC);

-- Query by action
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON sp_v2_ops_audit_log(action, created_at DESC);

-- Query by resource
CREATE INDEX IF NOT EXISTS idx_audit_log_resource
  ON sp_v2_ops_audit_log(resource_type, resource_id, created_at DESC);

-- Query by time (for daily/monthly reports)
CREATE INDEX IF NOT EXISTS idx_audit_log_created
  ON sp_v2_ops_audit_log(created_at DESC);

-- Query by action category
CREATE INDEX IF NOT EXISTS idx_audit_log_category
  ON sp_v2_ops_audit_log(action_category, created_at DESC);

-- Query failed actions
CREATE INDEX IF NOT EXISTS idx_audit_log_failed
  ON sp_v2_ops_audit_log(success, created_at DESC)
  WHERE success = false;

-- IP-based security queries
CREATE INDEX IF NOT EXISTS idx_audit_log_ip
  ON sp_v2_ops_audit_log(ip_address, created_at DESC);

-- ============================================================================
-- Create helper views
-- ============================================================================

-- Recent user activity
CREATE OR REPLACE VIEW vw_recent_user_activity AS
SELECT
  user_email,
  user_role,
  action,
  resource_type,
  resource_id,
  created_at,
  ip_address,
  success,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as row_num
FROM sp_v2_ops_audit_log
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

COMMENT ON VIEW vw_recent_user_activity IS 'Recent user activity for the last 7 days';

-- Daily action summary
CREATE OR REPLACE VIEW vw_daily_audit_summary AS
SELECT
  DATE(created_at) as audit_date,
  action_category,
  COUNT(*) as action_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE success = false) as failed_actions,
  AVG(duration_ms) as avg_duration_ms
FROM sp_v2_ops_audit_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), action_category
ORDER BY audit_date DESC, action_count DESC;

COMMENT ON VIEW vw_daily_audit_summary IS 'Daily summary of audit log activity';

-- Failed login attempts (security monitoring)
CREATE OR REPLACE VIEW vw_failed_login_attempts AS
SELECT
  user_email,
  ip_address,
  COUNT(*) as attempt_count,
  MAX(created_at) as last_attempt,
  ARRAY_AGG(created_at ORDER BY created_at DESC) as attempt_times
FROM sp_v2_ops_audit_log
WHERE action = 'LOGIN_FAILED'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_email, ip_address
HAVING COUNT(*) >= 3
ORDER BY attempt_count DESC, last_attempt DESC;

COMMENT ON VIEW vw_failed_login_attempts IS 'Failed login attempts in last 24 hours (potential brute-force attacks)';

-- Settlement approval audit
CREATE OR REPLACE VIEW vw_settlement_approval_audit AS
SELECT
  user_email,
  user_role,
  resource_id as settlement_batch_id,
  (new_value->>'status')::TEXT as new_status,
  (old_value->>'status')::TEXT as old_status,
  (new_value->>'net_amount_paise')::BIGINT / 100.0 as amount_rupees,
  created_at as approved_at,
  metadata
FROM sp_v2_ops_audit_log
WHERE action IN ('APPROVE_SETTLEMENT', 'REJECT_SETTLEMENT')
  AND resource_type = 'SETTLEMENT'
ORDER BY created_at DESC;

COMMENT ON VIEW vw_settlement_approval_audit IS 'Audit trail for settlement approvals and rejections';

-- ============================================================================
-- Create function to automatically capture user info
-- ============================================================================

CREATE OR REPLACE FUNCTION log_audit_action(
  p_user_id UUID,
  p_action VARCHAR,
  p_resource_type VARCHAR DEFAULT NULL,
  p_resource_id VARCHAR DEFAULT NULL,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_user_email VARCHAR;
  v_user_role VARCHAR;
  v_audit_id BIGINT;
BEGIN
  -- Get user details
  SELECT email, role INTO v_user_email, v_user_role
  FROM sp_v2_ops_users
  WHERE id = p_user_id;

  -- Insert audit log
  INSERT INTO sp_v2_ops_audit_log (
    user_id,
    user_email,
    user_role,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    metadata
  ) VALUES (
    p_user_id,
    v_user_email,
    v_user_role,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_value,
    p_new_value,
    p_metadata
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_audit_action IS 'Helper function to insert audit log entries with automatic user info capture';

-- ============================================================================
-- Create table comments
-- ============================================================================

COMMENT ON TABLE sp_v2_ops_audit_log IS 'Complete audit trail of all user actions in ops dashboard';
COMMENT ON COLUMN sp_v2_ops_audit_log.action IS 'Action performed (LOGIN, APPROVE_SETTLEMENT, UPDATE_MERCHANT, etc.)';
COMMENT ON COLUMN sp_v2_ops_audit_log.old_value IS 'Previous state before the action (for update/delete operations)';
COMMENT ON COLUMN sp_v2_ops_audit_log.new_value IS 'New state after the action (for create/update operations)';
COMMENT ON COLUMN sp_v2_ops_audit_log.changes IS 'Computed diff showing what changed (old → new)';

-- ============================================================================
-- Sample audit actions reference
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration 027 completed successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Audit Log Actions:';
  RAISE NOTICE '  Authentication:';
  RAISE NOTICE '    - LOGIN, LOGIN_FAILED, LOGOUT';
  RAISE NOTICE '    - PASSWORD_CHANGED, PASSWORD_RESET';
  RAISE NOTICE '  ';
  RAISE NOTICE '  Settlement:';
  RAISE NOTICE '    - APPROVE_SETTLEMENT, REJECT_SETTLEMENT';
  RAISE NOTICE '    - HOLD_SETTLEMENT, RELEASE_SETTLEMENT';
  RAISE NOTICE '  ';
  RAISE NOTICE '  Merchant:';
  RAISE NOTICE '    - CREATE_MERCHANT, UPDATE_MERCHANT';
  RAISE NOTICE '    - ACTIVATE_MERCHANT, DEACTIVATE_MERCHANT';
  RAISE NOTICE '  ';
  RAISE NOTICE '  User Management:';
  RAISE NOTICE '    - CREATE_USER, UPDATE_USER, DELETE_USER';
  RAISE NOTICE '    - GRANT_PERMISSION, REVOKE_PERMISSION';
  RAISE NOTICE '';
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  ✓ vw_recent_user_activity';
  RAISE NOTICE '  ✓ vw_daily_audit_summary';
  RAISE NOTICE '  ✓ vw_failed_login_attempts';
  RAISE NOTICE '  ✓ vw_settlement_approval_audit';
  RAISE NOTICE '';
  RAISE NOTICE 'Helper function:';
  RAISE NOTICE '  ✓ log_audit_action() - Easy audit logging from application';
  RAISE NOTICE '';
END $$;

COMMIT;
