/**
 * Authentication API
 *
 * Endpoints:
 * POST /api/auth/register - Register new user (admin only)
 * POST /api/auth/login - Login and get JWT token
 * POST /api/auth/logout - Logout and revoke session
 * POST /api/auth/refresh - Refresh JWT token
 * GET /api/auth/me - Get current user info
 * POST /api/auth/change-password - Change user password
 * POST /api/auth/verify-token - Verify JWT token validity
 */

const config = require('../config/env.cjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('./lib/passwordUtils.cjs');
const logger = require('./lib/logger.cjs');
const { getDbPool } = require('./real-db-adapter.cjs');

const router = express.Router();

// JWT configuration
const JWT_SECRET = config.auth.jwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

/**
 * POST /api/auth/register
 * Register a new user (admin only)
 */
router.post('/register', async (req, res) => {
  const { email, password, full_name, role } = req.body;

  try {
    // Validate input
    if (!email || !password || !full_name || !role) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, password, full_name, role'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
    }

    // Validate role
    const validRoles = ['ADMIN', 'OPS_MANAGER', 'OPS_VIEWER', 'FINANCE'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    // Hash password
    const password_hash = await hashPassword(password);

    // Insert user
    const pool = await getDbPool();
    const result = await pool.query(
      `INSERT INTO sp_v2_ops_users (email, password_hash, full_name, role, is_active, email_verified)
       VALUES ($1, $2, $3, $4, true, true)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [email, password_hash, full_name, role]
    );

    const user = result.rows[0];

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Log audit event
    await logAuditAction(pool, {
      userId: user.id,
      action: 'USER_REGISTERED',
      resourceType: 'USER',
      resourceId: user.id,
      newValue: { email: user.email, role: user.role },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          is_active: user.is_active,
          created_at: user.created_at
        }
      }
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    logger.error('Registration failed', { error: error.message, email });
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

/**
 * POST /api/auth/login
 * Login and get JWT token
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const pool = await getDbPool();

    // Get user
    const userResult = await pool.query(
      'SELECT * FROM sp_v2_ops_users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      await logLoginAttempt(pool, { email, success: false, reason: 'User not found', ipAddress: req.ip });
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      await logLoginAttempt(pool, { email, userId: user.id, success: false, reason: 'Account deactivated', ipAddress: req.ip });
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated. Please contact administrator.'
      });
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await logLoginAttempt(pool, { email, userId: user.id, success: false, reason: 'Account locked', ipAddress: req.ip });
      return res.status(403).json({
        success: false,
        error: 'Account is locked. Please try again later.'
      });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      // Increment failed login attempts
      await pool.query(
        'UPDATE sp_v2_ops_users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1',
        [user.id]
      );

      // Lock account after 5 failed attempts
      if (user.failed_login_attempts + 1 >= 5) {
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        await pool.query(
          'UPDATE sp_v2_ops_users SET locked_until = $1 WHERE id = $2',
          [lockUntil, user.id]
        );
      }

      await logLoginAttempt(pool, { email, userId: user.id, success: false, reason: 'Invalid password', ipAddress: req.ip });
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Reset failed login attempts
    await pool.query(
      'UPDATE sp_v2_ops_users SET failed_login_attempts = 0, last_login_at = NOW(), last_login_ip = $1 WHERE id = $2',
      [req.ip, user.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    // Calculate expiry times
    const tokenExpiresAt = new Date(Date.now() + parseTimeToMs(JWT_EXPIRES_IN));
    const refreshExpiresAt = new Date(Date.now() + parseTimeToMs(REFRESH_TOKEN_EXPIRES_IN));

    // Store session
    await pool.query(
      `INSERT INTO sp_v2_user_sessions (user_id, jwt_token_hash, refresh_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, hashToken(token), refreshToken, req.ip, req.headers['user-agent'], tokenExpiresAt]
    );

    // Log successful login
    await logLoginAttempt(pool, { email, userId: user.id, success: true, ipAddress: req.ip });
    await logAuditAction(pool, {
      userId: user.id,
      action: 'LOGIN',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: req.ip
    });

    logger.info('User logged in successfully', { userId: user.id, email: user.email });

    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        expiresAt: tokenExpiresAt.toISOString(),
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        }
      }
    });
  } catch (error) {
    logger.error('Login failed', { error: error.message, email });
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout and revoke session
 */
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = await getDbPool();

    // Revoke session
    await pool.query(
      `UPDATE sp_v2_user_sessions
       SET is_active = false, revoked_at = NOW(), revoked_reason = 'USER_LOGOUT'
       WHERE jwt_token_hash = $1 AND user_id = $2`,
      [hashToken(token), decoded.userId]
    );

    // Log audit event
    await logAuditAction(pool, {
      userId: decoded.userId,
      action: 'LOGOUT',
      resourceType: 'USER',
      resourceId: decoded.userId,
      ipAddress: req.ip
    });

    logger.info('User logged out', { userId: decoded.userId });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = await getDbPool();

    const result = await pool.query(
      'SELECT id, email, full_name, role, is_active, last_login_at FROM sp_v2_ops_users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user: result.rows[0] }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    logger.error('Get user info failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get user info'
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'New password does not meet requirements',
        details: passwordValidation.errors
      });
    }

    const pool = await getDbPool();

    // Get user
    const userResult = await pool.query(
      'SELECT * FROM sp_v2_ops_users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await pool.query(
      'UPDATE sp_v2_ops_users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2',
      [newPasswordHash, user.id]
    );

    // Revoke all existing sessions
    await pool.query(
      `UPDATE sp_v2_user_sessions
       SET is_active = false, revoked_at = NOW(), revoked_reason = 'PASSWORD_CHANGED'
       WHERE user_id = $1 AND is_active = true`,
      [user.id]
    );

    // Log audit event
    await logAuditAction(pool, {
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: req.ip
    });

    logger.info('Password changed successfully', { userId: user.id });

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });
  } catch (error) {
    logger.error('Change password failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

/**
 * POST /api/auth/verify-token
 * Verify JWT token validity
 */
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = await getDbPool();

    // Check if session is active
    const sessionResult = await pool.query(
      `SELECT * FROM sp_v2_user_sessions
       WHERE jwt_token_hash = $1 AND user_id = $2 AND is_active = true AND expires_at > NOW()`,
      [hashToken(token), decoded.userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Session has been revoked or expired'
      });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token has expired'
      });
    }

    logger.error('Token verification failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Token verification failed'
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Log login attempt
 */
async function logLoginAttempt(pool, { email, userId = null, success, reason = null, ipAddress }) {
  await pool.query(
    `INSERT INTO sp_v2_login_attempts (email, user_id, success, failure_reason, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [email, userId, success, reason, ipAddress]
  );
}

/**
 * Log audit action
 */
async function logAuditAction(pool, { userId, action, resourceType, resourceId, oldValue = null, newValue = null, ipAddress }) {
  await pool.query(
    `INSERT INTO sp_v2_ops_audit_log (user_id, action, resource_type, resource_id, old_value, new_value, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, action, resourceType, resourceId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, ipAddress]
  );
}

/**
 * Hash token for storage
 */
function hashToken(token) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Parse time string to milliseconds
 */
function parseTimeToMs(timeStr) {
  const units = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  const match = timeStr.match(/^(\d+)([smhd])$/);
  if (!match) return 8 * 60 * 60 * 1000; // Default 8 hours

  const value = parseInt(match[1]);
  const unit = match[2];

  return value * units[unit];
}

module.exports = router;
