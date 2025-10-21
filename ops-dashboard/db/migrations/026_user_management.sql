-- Migration 026: User Management for Ops Dashboard
-- Date: 2025-10-21
-- Purpose: Create tables for user authentication and session management
-- Security: Password hashing, JWT tokens, role-based access control

BEGIN;

-- ============================================================================
-- PART 1: Create ops_users table
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '🔧 Migration 026: Creating user management tables...';
END $$;

CREATE TABLE IF NOT EXISTS sp_v2_ops_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Authentication
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,

  -- Profile
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'OPS_MANAGER', 'OPS_VIEWER', 'FINANCE')),

  -- Status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,

  -- Security
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  last_login_at TIMESTAMP,
  last_login_ip INET,

  -- Password management
  password_changed_at TIMESTAMP DEFAULT NOW(),
  password_reset_token TEXT,
  password_reset_expires TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ops_users_email ON sp_v2_ops_users(email);
CREATE INDEX IF NOT EXISTS idx_ops_users_role ON sp_v2_ops_users(role);
CREATE INDEX IF NOT EXISTS idx_ops_users_active ON sp_v2_ops_users(is_active) WHERE is_active = true;

COMMENT ON TABLE sp_v2_ops_users IS 'Ops dashboard users with role-based access control';
COMMENT ON COLUMN sp_v2_ops_users.role IS 'ADMIN: full access, OPS_MANAGER: approve settlements, OPS_VIEWER: read-only, FINANCE: financial reports';

-- ============================================================================
-- PART 2: Create user_sessions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sp_v2_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL REFERENCES sp_v2_ops_users(id) ON DELETE CASCADE,

  -- Session data
  jwt_token_hash TEXT NOT NULL, -- Store hash of JWT for revocation
  refresh_token TEXT,

  -- Client info
  ip_address INET,
  user_agent TEXT,
  device_fingerprint TEXT,

  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  revoked_reason TEXT,

  -- Session metadata
  is_active BOOLEAN DEFAULT true
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON sp_v2_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON sp_v2_user_sessions(jwt_token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON sp_v2_user_sessions(is_active, expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON sp_v2_user_sessions(expires_at) WHERE is_active = true;

COMMENT ON TABLE sp_v2_user_sessions IS 'Active user sessions with JWT token tracking for revocation';

-- ============================================================================
-- PART 3: Create user_permissions table (for fine-grained access)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sp_v2_user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES sp_v2_ops_users(id) ON DELETE CASCADE,

  -- Permission details
  resource_type VARCHAR(50) NOT NULL, -- SETTLEMENT, MERCHANT, TRANSACTION, EXCEPTION
  action VARCHAR(50) NOT NULL, -- VIEW, CREATE, UPDATE, DELETE, APPROVE

  -- Constraints
  allowed BOOLEAN DEFAULT true,
  conditions JSONB, -- Additional conditions like {"merchant_id": "MERCH001"}

  -- Metadata
  granted_by UUID REFERENCES sp_v2_ops_users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,

  -- Unique constraint
  UNIQUE(user_id, resource_type, action)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON sp_v2_user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_resource ON sp_v2_user_permissions(resource_type, action);

COMMENT ON TABLE sp_v2_user_permissions IS 'Fine-grained permissions for role-based access control';

-- ============================================================================
-- PART 4: Create login_attempts table (security monitoring)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sp_v2_login_attempts (
  id BIGSERIAL PRIMARY KEY,

  email VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES sp_v2_ops_users(id),

  -- Attempt details
  success BOOLEAN NOT NULL,
  failure_reason TEXT,

  -- Client info
  ip_address INET,
  user_agent TEXT,

  -- Timing
  attempted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON sp_v2_login_attempts(email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON sp_v2_login_attempts(ip_address, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_failed ON sp_v2_login_attempts(success, attempted_at DESC) WHERE success = false;

COMMENT ON TABLE sp_v2_login_attempts IS 'Login attempt tracking for security monitoring and brute-force detection';

-- ============================================================================
-- PART 5: Create triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ops_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ops_users_updated_at ON sp_v2_ops_users;
CREATE TRIGGER trg_ops_users_updated_at
  BEFORE UPDATE ON sp_v2_ops_users
  FOR EACH ROW
  EXECUTE FUNCTION update_ops_users_updated_at();

-- ============================================================================
-- PART 6: Insert default admin user (password: Admin@123)
-- ============================================================================

-- Password hash for 'Admin@123' using bcrypt (10 rounds)
-- NOTE: Change this password immediately after first login!
INSERT INTO sp_v2_ops_users (email, password_hash, full_name, role, is_active, email_verified)
VALUES (
  'admin@settlepaisa.com',
  '$2b$10$unpj6m9XGLqzNk2Hyqtileaw653LLT6SuoIq6ve5sbTK2ckaVRx0q', -- Admin@123
  'System Administrator',
  'ADMIN',
  true,
  true
)
ON CONFLICT (email) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE '👤 Default admin user created: admin@settlepaisa.com / Admin@123';
  RAISE NOTICE '⚠️  IMPORTANT: Change this password immediately after first login!';
END $$;

-- ============================================================================
-- PART 7: Create view for active sessions
-- ============================================================================

CREATE OR REPLACE VIEW vw_active_user_sessions AS
SELECT
  s.id as session_id,
  u.id as user_id,
  u.email,
  u.full_name,
  u.role,
  s.ip_address,
  s.created_at as session_started,
  s.last_activity_at,
  s.expires_at,
  EXTRACT(EPOCH FROM (s.expires_at - NOW())) / 60 as minutes_until_expiry,
  CASE
    WHEN s.expires_at < NOW() THEN 'EXPIRED'
    WHEN s.last_activity_at < NOW() - INTERVAL '30 minutes' THEN 'INACTIVE'
    ELSE 'ACTIVE'
  END as session_status
FROM sp_v2_user_sessions s
JOIN sp_v2_ops_users u ON s.user_id = u.id
WHERE s.is_active = true
  AND s.revoked_at IS NULL
ORDER BY s.last_activity_at DESC;

COMMENT ON VIEW vw_active_user_sessions IS 'Active user sessions with expiry status';

-- ============================================================================
-- Migration Complete
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration 026 completed successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  ✓ sp_v2_ops_users (user accounts)';
  RAISE NOTICE '  ✓ sp_v2_user_sessions (JWT sessions)';
  RAISE NOTICE '  ✓ sp_v2_user_permissions (RBAC)';
  RAISE NOTICE '  ✓ sp_v2_login_attempts (security monitoring)';
  RAISE NOTICE '';
  RAISE NOTICE 'Default credentials:';
  RAISE NOTICE '  Email: admin@settlepaisa.com';
  RAISE NOTICE '  Password: Admin@123';
  RAISE NOTICE '  ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!';
  RAISE NOTICE '';
END $$;

COMMIT;
