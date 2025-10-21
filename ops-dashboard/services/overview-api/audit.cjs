/**
 * Audit Log API
 *
 * Endpoints:
 * GET /api/audit - Get audit logs with filters
 * GET /api/audit/user/:userId - Get audit logs for specific user
 * GET /api/audit/resource/:resourceType/:resourceId - Get audit logs for specific resource
 * GET /api/audit/summary - Get audit log summary stats
 * GET /api/audit/failed-logins - Get failed login attempts
 * GET /api/audit/settlement-approvals - Get settlement approval history
 */

const express = require('express');
const logger = require('./lib/logger.cjs');
const { getDbPool } = require('./real-db-adapter.cjs');

const router = express.Router();

/**
 * GET /api/audit
 * Get audit logs with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const {
      user_id,
      action,
      action_category,
      resource_type,
      resource_id,
      start_date,
      end_date,
      success,
      limit = 100,
      offset = 0
    } = req.query;

    const pool = await getDbPool();

    // Build WHERE clause dynamically
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (user_id) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(user_id);
    }

    if (action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(action);
    }

    if (action_category) {
      conditions.push(`action_category = $${paramIndex++}`);
      params.push(action_category);
    }

    if (resource_type) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(resource_type);
    }

    if (resource_id) {
      conditions.push(`resource_id = $${paramIndex++}`);
      params.push(resource_id);
    }

    if (start_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(start_date);
    }

    if (end_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(end_date);
    }

    if (success !== undefined) {
      conditions.push(`success = $${paramIndex++}`);
      params.push(success === 'true' || success === true);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM sp_v2_ops_audit_log ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get audit logs
    params.push(parseInt(limit), parseInt(offset));
    const query = `
      SELECT
        id,
        user_id,
        user_email,
        user_role,
        action,
        action_category,
        resource_type,
        resource_id,
        resource_name,
        old_value,
        new_value,
        changes,
        metadata,
        created_at,
        ip_address,
        user_agent,
        success,
        error_message,
        duration_ms
      FROM sp_v2_ops_audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        logs: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get audit logs failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit logs'
    });
  }
});

/**
 * GET /api/audit/user/:userId
 * Get audit logs for specific user
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const pool = await getDbPool();

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM sp_v2_ops_audit_log WHERE user_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0].total);

    // Get audit logs
    const result = await pool.query(
      `SELECT * FROM sp_v2_ops_audit_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        logs: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get user audit logs failed', { error: error.message, userId: req.params.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user audit logs'
    });
  }
});

/**
 * GET /api/audit/resource/:resourceType/:resourceId
 * Get audit logs for specific resource
 */
router.get('/resource/:resourceType/:resourceId', async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const pool = await getDbPool();

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM sp_v2_ops_audit_log WHERE resource_type = $1 AND resource_id = $2',
      [resourceType, resourceId]
    );
    const total = parseInt(countResult.rows[0].total);

    // Get audit logs
    const result = await pool.query(
      `SELECT * FROM sp_v2_ops_audit_log
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [resourceType, resourceId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        logs: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get resource audit logs failed', { error: error.message, resourceType: req.params.resourceType, resourceId: req.params.resourceId });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resource audit logs'
    });
  }
});

/**
 * GET /api/audit/summary
 * Get audit log summary statistics
 */
router.get('/summary', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const pool = await getDbPool();

    const dateFilter = start_date && end_date
      ? `WHERE created_at >= $1 AND created_at <= $2`
      : start_date
      ? `WHERE created_at >= $1`
      : '';

    const params = [];
    if (start_date) params.push(start_date);
    if (end_date) params.push(end_date);

    // Get summary stats
    const summaryQuery = `
      SELECT
        COUNT(*) as total_actions,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) FILTER (WHERE success = false) as failed_actions,
        COUNT(*) FILTER (WHERE action = 'LOGIN') as total_logins,
        COUNT(*) FILTER (WHERE action = 'LOGIN_FAILED') as failed_logins,
        COUNT(*) FILTER (WHERE action IN ('APPROVE_SETTLEMENT', 'REJECT_SETTLEMENT')) as settlement_actions,
        AVG(duration_ms) as avg_duration_ms
      FROM sp_v2_ops_audit_log
      ${dateFilter}
    `;

    const summaryResult = await pool.query(summaryQuery, params);

    // Get action breakdown
    const actionBreakdownQuery = `
      SELECT
        action,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE success = false) as failed_count
      FROM sp_v2_ops_audit_log
      ${dateFilter}
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `;

    const actionBreakdownResult = await pool.query(actionBreakdownQuery, params);

    // Get top users by activity
    const topUsersQuery = `
      SELECT
        user_email,
        user_role,
        COUNT(*) as action_count,
        MAX(created_at) as last_activity
      FROM sp_v2_ops_audit_log
      ${dateFilter}
      GROUP BY user_email, user_role
      ORDER BY action_count DESC
      LIMIT 10
    `;

    const topUsersResult = await pool.query(topUsersQuery, params);

    res.json({
      success: true,
      data: {
        summary: summaryResult.rows[0],
        actionBreakdown: actionBreakdownResult.rows,
        topUsers: topUsersResult.rows
      }
    });
  } catch (error) {
    logger.error('Get audit summary failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit summary'
    });
  }
});

/**
 * GET /api/audit/failed-logins
 * Get failed login attempts (security monitoring)
 */
router.get('/failed-logins', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const pool = await getDbPool();

    // Use the pre-built view for failed logins
    const result = await pool.query(
      `SELECT * FROM vw_failed_login_attempts
       ORDER BY attempt_count DESC, last_attempt DESC`
    );

    // Also get all failed login attempts in the time window
    const allFailedResult = await pool.query(
      `SELECT
         user_email,
         ip_address,
         created_at as attempt_time,
         error_message
       FROM sp_v2_ops_audit_log
       WHERE action = 'LOGIN_FAILED'
         AND created_at > NOW() - INTERVAL '${parseInt(hours)} hours'
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: {
        suspiciousAttempts: result.rows, // Users with 3+ failed attempts
        allFailedAttempts: allFailedResult.rows
      }
    });
  } catch (error) {
    logger.error('Get failed logins failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch failed login attempts'
    });
  }
});

/**
 * GET /api/audit/settlement-approvals
 * Get settlement approval audit trail
 */
router.get('/settlement-approvals', async (req, res) => {
  try {
    const { start_date, end_date, limit = 100, offset = 0 } = req.query;

    const pool = await getDbPool();

    const dateFilter = start_date && end_date
      ? `AND approved_at >= $3 AND approved_at <= $4`
      : '';

    const params = [parseInt(limit), parseInt(offset)];
    if (start_date) params.push(start_date);
    if (end_date) params.push(end_date);

    // Get settlement approval audit
    const query = `
      SELECT * FROM vw_settlement_approval_audit
      WHERE 1=1 ${dateFilter}
      ORDER BY approved_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM sp_v2_ops_audit_log
      WHERE action IN ('APPROVE_SETTLEMENT', 'REJECT_SETTLEMENT')
        AND resource_type = 'SETTLEMENT'
        ${dateFilter.replace(/\$3/g, '$1').replace(/\$4/g, '$2')}
    `;

    const countParams = [];
    if (start_date) countParams.push(start_date);
    if (end_date) countParams.push(end_date);

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        approvals: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get settlement approvals failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settlement approval history'
    });
  }
});

/**
 * GET /api/audit/recent-activity
 * Get recent user activity (last 7 days)
 */
router.get('/recent-activity', async (req, res) => {
  try {
    const pool = await getDbPool();

    const result = await pool.query(
      `SELECT * FROM vw_recent_user_activity
       WHERE row_num <= 10
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: {
        activity: result.rows
      }
    });
  } catch (error) {
    logger.error('Get recent activity failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent activity'
    });
  }
});

/**
 * GET /api/audit/daily-summary
 * Get daily audit summary
 */
router.get('/daily-summary', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const pool = await getDbPool();

    const result = await pool.query(
      `SELECT * FROM vw_daily_audit_summary
       WHERE audit_date > NOW() - INTERVAL '${parseInt(days)} days'
       ORDER BY audit_date DESC`
    );

    res.json({
      success: true,
      data: {
        summary: result.rows
      }
    });
  } catch (error) {
    logger.error('Get daily summary failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch daily summary'
    });
  }
});

module.exports = router;
