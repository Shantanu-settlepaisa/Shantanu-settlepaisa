/**
 * JWT Authentication Middleware
 *
 * Purpose: Protect API routes by validating JWT tokens
 * Features:
 * - JWT token validation
 * - Session verification (check if token is revoked)
 * - Role-based access control
 * - Request logging with user context
 *
 * Usage:
 *   const { authenticate, authorize } = require('./middleware/authMiddleware.cjs');
 *
 *   // Protect route (any authenticated user)
 *   router.get('/protected', authenticate, handler);
 *
 *   // Protect route with role requirement
 *   router.post('/approve-settlement', authenticate, authorize(['ADMIN', 'OPS_MANAGER']), handler);
 */

const config = require('../../config/env.cjs');
const jwt = require('jsonwebtoken');
const logger = require('../lib/logger.cjs');
const { getDbPool } = require('../real-db-adapter.cjs');

const JWT_SECRET = config.auth.jwtSecret;

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
      decoded = jwt.verify(token, JWT_SECRET);
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

    // Check if session is still active
    const pool = await getDbPool();
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

    // Create a logger with user context
    req.logger = logger.child({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role
    });

    next();
  } catch (error) {
    logger.error('Authentication middleware error', { error: error.message });
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
      logger.warn('Unauthorized access attempt', {
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
 * Optional authentication middleware
 * Adds user info if token is provided, but doesn't require it
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No token, continue without user info
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const pool = await getDbPool();

      const sessionResult = await pool.query(
        `SELECT s.*, u.email, u.full_name, u.role, u.is_active
         FROM sp_v2_user_sessions s
         JOIN sp_v2_ops_users u ON s.user_id = u.id
         WHERE s.jwt_token_hash = $1 AND s.user_id = $2 AND s.is_active = true AND s.expires_at > NOW()`,
        [hashToken(token), decoded.userId]
      );

      if (sessionResult.rows.length > 0) {
        const session = sessionResult.rows[0];
        req.user = {
          id: decoded.userId,
          email: session.email,
          full_name: session.full_name,
          role: session.role
        };
      }
    } catch (error) {
      // Token invalid or expired, continue without user info
      logger.debug('Optional auth failed', { error: error.message });
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error', { error: error.message });
    next(); // Continue even on error
  }
}

/**
 * Admin-only middleware
 * Shortcut for authorize(['ADMIN'])
 */
function adminOnly(req, res, next) {
  return authorize(['ADMIN'])(req, res, next);
}

/**
 * Ops staff middleware (ADMIN, OPS_MANAGER, OPS_VIEWER)
 */
function opsStaffOnly(req, res, next) {
  return authorize(['ADMIN', 'OPS_MANAGER', 'OPS_VIEWER'])(req, res, next);
}

/**
 * Approval permission middleware (ADMIN, OPS_MANAGER)
 */
function canApprove(req, res, next) {
  return authorize(['ADMIN', 'OPS_MANAGER'])(req, res, next);
}

/**
 * Hash token for lookup
 */
function hashToken(token) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  adminOnly,
  opsStaffOnly,
  canApprove
};
