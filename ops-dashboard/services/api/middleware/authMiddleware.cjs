/**
 * JWT Authentication Middleware for Upload API
 *
 * Purpose: Protect Upload API routes by validating JWT tokens
 * Features:
 * - JWT token validation
 * - Session verification (check if token is revoked)
 * - Role-based access control
 * - Uses Upload API's own database pool (with SSL)
 *
 * Key Difference from Overview API middleware:
 * - Accepts pool parameter instead of using getDbPool()
 * - Avoids cross-service pool dependency issues
 *
 * Usage:
 *   const { createAuthMiddleware, createOpsStaffMiddleware } = require('./middleware/authMiddleware.cjs');
 *   const { authenticate, opsStaffOnly } = createAuthMiddleware(pool);
 *
 *   router.post('/upload', authenticate, opsStaffOnly, handler);
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Create authentication middleware that uses the provided database pool
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} jwtSecret - JWT secret key
 * @returns {Object} - Middleware functions
 */
function createAuthMiddleware(pool, jwtSecret) {
  /**
   * Hash token for lookup
   */
  function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Authenticate middleware
   * Validates JWT token and adds user info to request
   */
  async function authenticate(req, res, next) {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'No authentication token provided'
        });
      }

      const token = authHeader.replace('Bearer ', '');

      // Verify JWT token
      let decoded;
      try {
        decoded = jwt.verify(token, jwtSecret);
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            error: 'Token has expired',
            code: 'TOKEN_EXPIRED'
          });
        }

        if (error.name === 'JsonWebTokenError') {
          return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
          });
        }

        throw error;
      }

      // Check if session is still active using Upload API's pool
      const sessionResult = await pool.query(
        `SELECT s.*, u.email, u.full_name, u.role, u.is_active
         FROM sp_v2_user_sessions s
         JOIN sp_v2_ops_users u ON s.user_id = u.id
         WHERE s.jwt_token_hash = $1 AND s.user_id = $2 AND s.is_active = true AND s.expires_at > NOW()`,
        [hashToken(token), decoded.userId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Session has been revoked or expired',
          code: 'SESSION_REVOKED'
        });
      }

      const session = sessionResult.rows[0];

      // Check if user is still active
      if (!session.is_active) {
        return res.status(403).json({
          success: false,
          error: 'User account is deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }

      // Update last activity
      await pool.query(
        'UPDATE sp_v2_user_sessions SET last_activity_at = NOW() WHERE id = $1',
        [session.id]
      );

      // Add user info to request
      req.user = {
        id: decoded.userId,
        email: session.email,
        full_name: session.full_name,
        role: session.role
      };

      next();
    } catch (error) {
      console.error('[Upload API Auth] Authentication middleware error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Authentication failed'
      });
    }
  }

  /**
   * Authorize middleware factory
   * Checks if user has one of the required roles
   *
   * @param {string[]} allowedRoles - Array of allowed roles
   * @returns {Function} - Express middleware
   */
  function authorize(allowedRoles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        console.warn('[Upload API Auth] Unauthorized access attempt:', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: allowedRoles,
          path: req.path
        });

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: req.user.role
        });
      }

      next();
    };
  }

  /**
   * Ops staff middleware (ADMIN, OPS_MANAGER, OPS_VIEWER)
   */
  function opsStaffOnly(req, res, next) {
    return authorize(['ADMIN', 'OPS_MANAGER', 'OPS_VIEWER'])(req, res, next);
  }

  /**
   * Admin-only middleware
   */
  function adminOnly(req, res, next) {
    return authorize(['ADMIN'])(req, res, next);
  }

  /**
   * Approval permission middleware (ADMIN, OPS_MANAGER)
   */
  function canApprove(req, res, next) {
    return authorize(['ADMIN', 'OPS_MANAGER'])(req, res, next);
  }

  return {
    authenticate,
    authorize,
    opsStaffOnly,
    adminOnly,
    canApprove
  };
}

module.exports = { createAuthMiddleware };
