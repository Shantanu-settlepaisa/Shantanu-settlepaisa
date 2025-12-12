/**
 * Shared JWT Authentication Middleware
 * Used across all microservices for consistent authentication
 *
 * Features:
 * - JWT token validation
 * - Session verification (checks if token is revoked)
 * - Role-based access control (RBAC)
 * - User context attachment to requests
 */

const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const crypto = require('crypto');

// JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'settlepaisa-jwt-secret-2024';

// Database pool (singleton)
let pool;

function getDbPool() {
  if (!pool) {
    const isRDS = process.env.DB_HOST?.includes('rds.amazonaws.com') ||
                  process.env.DB_HOST?.includes('amazonaws.com');

    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'settlepaisa_v2',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: isRDS ? { rejectUnauthorized: false } : false
    });

    pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }
  return pool;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Authenticate middleware
 * Validates JWT token and adds user info to request
 *
 * Usage:
 *   app.use(authenticate);
 *   app.get('/protected', (req, res) => {
 *     console.log(req.user); // { id, email, fullName, role }
 *   });
 */
async function authenticate(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided',
        code: 'NO_TOKEN'
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

    // Check if session is still active in database
    const pool = getDbPool();
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

    // Check if user account is active
    if (!session.is_active) {
      return res.status(403).json({
        success: false,
        error: 'User account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Update last activity timestamp
    await pool.query(
      'UPDATE sp_v2_user_sessions SET last_activity_at = NOW() WHERE id = $1',
      [session.id]
    );

    // Attach user info to request
    req.user = {
      id: decoded.userId,
      email: session.email,
      fullName: session.full_name,
      role: session.role
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Authorize middleware
 * Checks if user has one of the required roles
 *
 * Usage:
 *   app.post('/settlements/approve',
 *     authenticate,
 *     authorize(['ADMIN', 'FINANCE']),
 *     settlementController.approve
 *   );
 *
 * @param {string[]} allowedRoles - Array of roles that can access this route
 */
function authorize(allowedRoles) {
  if (!Array.isArray(allowedRoles)) {
    throw new Error('authorize() requires an array of roles');
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
}

/**
 * Optional auth middleware
 * Adds user info if token is present, but doesn't block if missing
 * Useful for endpoints that work for both authenticated and anonymous users
 *
 * Usage:
 *   app.get('/public-data', optionalAuth, (req, res) => {
 *     if (req.user) {
 *       // User is logged in, show personalized data
 *     } else {
 *       // Anonymous user, show public data
 *     }
 *   });
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

      const pool = getDbPool();
      const sessionResult = await pool.query(
        `SELECT u.* FROM sp_v2_user_sessions s
         JOIN sp_v2_ops_users u ON s.user_id = u.id
         WHERE s.jwt_token_hash = $1 AND s.user_id = $2 AND s.is_active = true AND s.expires_at > NOW()`,
        [hashToken(token), decoded.userId]
      );

      if (sessionResult.rows.length > 0) {
        const user = sessionResult.rows[0];
        req.user = {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role
        };
      }
    } catch (error) {
      // Token invalid, continue without user info
    }

    next();
  } catch (error) {
    // Any error, continue without user info
    next();
  }
}

/**
 * Role-based authorization helpers
 */
const opsStaffOnly = authorize(['ADMIN', 'OPS_MANAGER', 'OPS_VIEWER', 'FINANCE']);
const opsManagerOnly = authorize(['ADMIN', 'OPS_MANAGER']);
const adminOnly = authorize(['ADMIN']);
const financeOnly = authorize(['ADMIN', 'FINANCE']);
const canApprove = authorize(['ADMIN', 'OPS_MANAGER', 'FINANCE']);

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  opsStaffOnly,
  opsManagerOnly,
  adminOnly,
  financeOnly,
  canApprove
};
