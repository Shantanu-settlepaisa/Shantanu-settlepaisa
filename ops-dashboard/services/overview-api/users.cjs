/**
 * User Management API
 *
 * Endpoints:
 * GET    /api/users - List all users (admin only)
 * GET    /api/users/:id - Get user details
 * PUT    /api/users/:id - Update user (role, status)
 * DELETE /api/users/:id - Deactivate user
 * POST   /api/users/:id/reset-password - Admin reset password
 * POST   /api/users/:id/unlock - Unlock locked account
 */

const express = require('express');
const { hashPassword } = require('./lib/passwordUtils.cjs');
const logger = require('./lib/logger.cjs');
const { getDbPool } = require('./real-db-adapter.cjs');

const router = express.Router();

/**
 * GET /api/users
 * List all users (admin only)
 */
router.get('/', async (req, res) => {
  try {
    const {
      role,
      is_active,
      search,
      limit = 100,
      offset = 0
    } = req.query;

    const pool = await getDbPool();

    // Build WHERE clause dynamically
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (role) {
      conditions.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    if (is_active !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(is_active === 'true' || is_active === true);
    }

    if (search) {
      conditions.push(`(email ILIKE $${paramIndex} OR full_name ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM sp_v2_ops_users ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get users
    params.push(parseInt(limit), parseInt(offset));
    const query = `
      SELECT
        id,
        email,
        full_name,
        role,
        is_active,
        email_verified,
        failed_login_attempts,
        locked_until,
        last_login_at,
        last_login_ip,
        password_changed_at,
        created_at,
        updated_at
      FROM sp_v2_ops_users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        users: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get users failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

/**
 * GET /api/users/:id
 * Get user details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getDbPool();

    const result = await pool.query(
      `SELECT
        id,
        email,
        full_name,
        role,
        is_active,
        email_verified,
        failed_login_attempts,
        locked_until,
        last_login_at,
        last_login_ip,
        password_changed_at,
        created_at,
        updated_at,
        created_by,
        updated_by
      FROM sp_v2_ops_users
      WHERE id = $1`,
      [id]
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
    logger.error('Get user failed', { error: error.message, userId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user details'
    });
  }
});

/**
 * PUT /api/users/:id
 * Update user (role, status, etc.)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, role, is_active, email_verified } = req.body;

    // Validate role if provided
    if (role) {
      const validRoles = ['ADMIN', 'OPS_MANAGER', 'OPS_VIEWER', 'FINANCE'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
        });
      }
    }

    const pool = await getDbPool();

    // Check if user exists
    const userCheck = await pool.query('SELECT id, email FROM sp_v2_ops_users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      params.push(full_name);
    }

    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    if (email_verified !== undefined) {
      updates.push(`email_verified = $${paramIndex++}`);
      params.push(email_verified);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    updates.push(`updated_by = $${paramIndex++}`);
    params.push(req.user?.userId || null); // From JWT middleware

    params.push(id);

    const query = `
      UPDATE sp_v2_ops_users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, full_name, role, is_active, email_verified, updated_at
    `;

    const result = await pool.query(query, params);

    // Log audit event
    await logAuditAction(pool, {
      userId: req.user?.userId,
      action: 'UPDATE_USER',
      resourceType: 'USER',
      resourceId: id,
      oldValue: userCheck.rows[0],
      newValue: result.rows[0],
      ipAddress: req.ip
    });

    logger.info('User updated successfully', {
      userId: id,
      updatedBy: req.user?.userId,
      changes: { full_name, role, is_active, email_verified }
    });

    res.json({
      success: true,
      data: { user: result.rows[0] }
    });
  } catch (error) {
    logger.error('Update user failed', { error: error.message, userId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

/**
 * DELETE /api/users/:id
 * Deactivate user (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getDbPool();

    // Check if user exists and is not the last admin
    const userCheck = await pool.query(
      'SELECT id, email, role FROM sp_v2_ops_users WHERE id = $1',
      [id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userCheck.rows[0];

    // Prevent deleting the last admin
    if (user.role === 'ADMIN') {
      const adminCount = await pool.query(
        "SELECT COUNT(*) as count FROM sp_v2_ops_users WHERE role = 'ADMIN' AND is_active = true"
      );
      if (parseInt(adminCount.rows[0].count) <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot deactivate the last admin user'
        });
      }
    }

    // Prevent users from deleting themselves
    if (req.user?.userId === id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot deactivate your own account'
      });
    }

    // Soft delete - set is_active to false
    await pool.query(
      'UPDATE sp_v2_ops_users SET is_active = false, updated_at = NOW(), updated_by = $1 WHERE id = $2',
      [req.user?.userId || null, id]
    );

    // Revoke all active sessions for this user
    await pool.query(
      `UPDATE sp_v2_user_sessions
       SET is_active = false, revoked_at = NOW(), revoked_reason = 'USER_DEACTIVATED'
       WHERE user_id = $1 AND is_active = true`,
      [id]
    );

    // Log audit event
    await logAuditAction(pool, {
      userId: req.user?.userId,
      action: 'DEACTIVATE_USER',
      resourceType: 'USER',
      resourceId: id,
      oldValue: { is_active: true },
      newValue: { is_active: false },
      ipAddress: req.ip
    });

    logger.info('User deactivated successfully', {
      userId: id,
      deactivatedBy: req.user?.userId
    });

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    logger.error('Delete user failed', { error: error.message, userId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate user'
    });
  }
});

/**
 * POST /api/users/:id/reset-password
 * Admin reset user password
 */
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password is required'
      });
    }

    // Validate password strength
    const { validatePasswordStrength } = require('./lib/passwordUtils.cjs');
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
    }

    const pool = await getDbPool();

    // Check if user exists
    const userCheck = await pool.query('SELECT id, email FROM sp_v2_ops_users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and reset failed login attempts
    await pool.query(
      `UPDATE sp_v2_ops_users
       SET password_hash = $1,
           password_changed_at = NOW(),
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = NOW(),
           updated_by = $2
       WHERE id = $3`,
      [newPasswordHash, req.user?.userId || null, id]
    );

    // Revoke all active sessions for this user
    await pool.query(
      `UPDATE sp_v2_user_sessions
       SET is_active = false, revoked_at = NOW(), revoked_reason = 'PASSWORD_RESET_BY_ADMIN'
       WHERE user_id = $1 AND is_active = true`,
      [id]
    );

    // Log audit event
    await logAuditAction(pool, {
      userId: req.user?.userId,
      action: 'RESET_USER_PASSWORD',
      resourceType: 'USER',
      resourceId: id,
      ipAddress: req.ip
    });

    logger.info('User password reset by admin', {
      userId: id,
      resetBy: req.user?.userId
    });

    res.json({
      success: true,
      message: 'Password reset successfully. User must login with new password.'
    });
  } catch (error) {
    logger.error('Password reset failed', { error: error.message, userId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
});

/**
 * POST /api/users/:id/unlock
 * Unlock locked user account
 */
router.post('/:id/unlock', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getDbPool();

    // Check if user exists
    const userCheck = await pool.query(
      'SELECT id, email, locked_until FROM sp_v2_ops_users WHERE id = $1',
      [id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Unlock account
    await pool.query(
      `UPDATE sp_v2_ops_users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = NOW(),
           updated_by = $1
       WHERE id = $2`,
      [req.user?.userId || null, id]
    );

    // Log audit event
    await logAuditAction(pool, {
      userId: req.user?.userId,
      action: 'UNLOCK_USER_ACCOUNT',
      resourceType: 'USER',
      resourceId: id,
      ipAddress: req.ip
    });

    logger.info('User account unlocked', {
      userId: id,
      unlockedBy: req.user?.userId
    });

    res.json({
      success: true,
      message: 'User account unlocked successfully'
    });
  } catch (error) {
    logger.error('Unlock user failed', { error: error.message, userId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to unlock user account'
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Log audit action
 */
async function logAuditAction(pool, { userId, action, resourceType, resourceId, oldValue = null, newValue = null, ipAddress }) {
  try {
    await pool.query(
      `INSERT INTO sp_v2_ops_audit_log (user_id, action, resource_type, resource_id, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, resourceType, resourceId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, ipAddress]
    );
  } catch (error) {
    logger.error('Failed to log audit action', { error: error.message, action });
  }
}

module.exports = router;
