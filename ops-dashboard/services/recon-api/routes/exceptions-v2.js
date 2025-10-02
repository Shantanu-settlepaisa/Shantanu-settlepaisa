const express = require('express');
const { Pool } = require('pg');
const { Parser } = require('json2csv');

const router = express.Router();

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

// =====================================================
// 1. GET /exceptions - List exceptions with filters
// =====================================================
router.get('/', async (req, res) => {
  try {
    const {
      q, // Search term
      status,
      severity,
      reason,
      merchantId,
      acquirer,
      assignedTo,
      tags,
      dateFrom,
      dateTo,
      amountDeltaGt,
      amountDeltaLt,
      slaBreached,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT 
        ew.id,
        ew.exception_id as "exceptionCode",
        ew.merchant_id as "merchantId",
        ew.merchant_name as "merchantName",
        ew.acquirer_code as "acquirerCode",
        ew.cycle_date as "cycleDate",
        ew.reason,
        ew.status,
        ew.severity,
        ew.pg_amount_paise as "pgAmount",
        ew.bank_amount_paise as "bankAmount",
        ew.amount_delta_paise as "amountDelta",
        ew.pg_transaction_id as "pgTransactionId",
        ew.bank_reference_id as "bankReferenceId",
        ew.utr,
        ew.assigned_to as "assignedTo",
        ew.assigned_to_name as "assignedToName",
        ew.tags,
        ew.snooze_until as "snoozeUntil",
        ew.sla_due_at as "slaDueAt",
        ew.sla_breached as "slaBreached",
        ew.last_transition_at as "lastTransitionAt",
        ew.source_job_id as "sourceJobId",
        ew.transaction_id as "pgRowId",
        ew.bank_statement_id as "bankRowId",
        ew.rule_applied as "ruleApplied",
        ew.created_at as "createdAt",
        ew.updated_at as "updatedAt"
      FROM sp_v2_exception_workflow ew
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Search term (search in transaction ID, UTR, exception ID)
    if (q) {
      query += ` AND (
        ew.exception_id ILIKE $${paramIndex} OR 
        ew.pg_transaction_id ILIKE $${paramIndex} OR
        ew.utr ILIKE $${paramIndex}
      )`;
      params.push(`%${q}%`);
      paramIndex++;
    }

    // Status filter (can be array)
    if (status) {
      const statusArray = Array.isArray(status) ? status : [status];
      query += ` AND ew.status = ANY($${paramIndex})`;
      params.push(statusArray);
      paramIndex++;
    }

    // Severity filter (can be array)
    if (severity) {
      const severityArray = Array.isArray(severity) ? severity : [severity];
      query += ` AND ew.severity = ANY($${paramIndex})`;
      params.push(severityArray);
      paramIndex++;
    }

    // Reason filter (can be array)
    if (reason) {
      const reasonArray = Array.isArray(reason) ? reason : [reason];
      query += ` AND ew.reason = ANY($${paramIndex})`;
      params.push(reasonArray);
      paramIndex++;
    }

    // Merchant filter
    if (merchantId) {
      query += ` AND ew.merchant_id = $${paramIndex}`;
      params.push(merchantId);
      paramIndex++;
    }

    // Acquirer filter
    if (acquirer) {
      query += ` AND ew.acquirer_code = $${paramIndex}`;
      params.push(acquirer);
      paramIndex++;
    }

    // Assigned to filter
    if (assignedTo) {
      query += ` AND ew.assigned_to = $${paramIndex}`;
      params.push(assignedTo);
      paramIndex++;
    }

    // Tags filter
    if (tags) {
      const tagsArray = Array.isArray(tags) ? tags : [tags];
      query += ` AND ew.tags && $${paramIndex}`;
      params.push(tagsArray);
      paramIndex++;
    }

    // Date range filter
    if (dateFrom) {
      query += ` AND ew.cycle_date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      query += ` AND ew.cycle_date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    // Amount delta filters
    if (amountDeltaGt) {
      query += ` AND ABS(ew.amount_delta_paise) > $${paramIndex}`;
      params.push(amountDeltaGt);
      paramIndex++;
    }

    if (amountDeltaLt) {
      query += ` AND ABS(ew.amount_delta_paise) < $${paramIndex}`;
      params.push(amountDeltaLt);
      paramIndex++;
    }

    // SLA breached filter
    if (slaBreached === 'true') {
      query += ` AND ew.sla_breached = true`;
    }

    query += ` ORDER BY ew.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get counts by status, severity, reason
    const countQuery = `
      SELECT 
        status,
        severity,
        reason,
        COUNT(*) as count,
        SUM(CASE WHEN sla_breached THEN 1 ELSE 0 END) as sla_breached_count
      FROM sp_v2_exception_workflow
      WHERE 1=1
      ${merchantId ? `AND merchant_id = '${merchantId}'` : ''}
      ${acquirer ? `AND acquirer_code = '${acquirer}'` : ''}
      ${dateFrom ? `AND cycle_date >= '${dateFrom}'` : ''}
      ${dateTo ? `AND cycle_date <= '${dateTo}'` : ''}
      GROUP BY ROLLUP(status, severity, reason)
    `;

    const countResult = await pool.query(countQuery);

    // Build counts object
    const counts = {
      byStatus: {},
      bySeverity: {},
      byReason: {},
      slaBreached: 0,
      total: 0
    };

    countResult.rows.forEach(row => {
      if (row.status && !row.severity && !row.reason) {
        counts.byStatus[row.status] = parseInt(row.count);
      }
      if (row.severity && !row.reason && !row.status) {
        counts.bySeverity[row.severity] = parseInt(row.count);
      }
      if (row.reason && !row.status && !row.severity) {
        counts.byReason[row.reason] = parseInt(row.count);
      }
      if (!row.status && !row.severity && !row.reason) {
        counts.total = parseInt(row.count);
        counts.slaBreached = parseInt(row.sla_breached_count);
      }
    });

    res.json({
      success: true,
      counts,
      items: result.rows,
      hasMore: result.rows.length === parseInt(limit),
      cursor: result.rows.length > 0 ? parseInt(offset) + parseInt(limit) : null
    });

  } catch (error) {
    console.error('[Exceptions API] Error fetching exceptions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 2. GET /exceptions/:id - Get single exception detail
// =====================================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get exception details
    const exceptionQuery = `
      SELECT 
        ew.*,
        t.transaction_id as pg_txn_id,
        t.amount_paise as pg_amount,
        t.payment_method,
        t.source_type,
        bs.bank_ref,
        bs.bank_name,
        bs.amount_paise as bank_amount,
        bs.remarks as bank_remarks
      FROM sp_v2_exception_workflow ew
      LEFT JOIN sp_v2_transactions t ON ew.transaction_id = t.id
      LEFT JOIN sp_v2_bank_statements bs ON ew.bank_statement_id = bs.id
      WHERE ew.exception_id = $1
    `;

    const exceptionResult = await pool.query(exceptionQuery, [id]);

    if (exceptionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception not found'
      });
    }

    const exception = exceptionResult.rows[0];

    // Get timeline (actions)
    const timelineQuery = `
      SELECT 
        id,
        exception_id as "exceptionId",
        user_id as "userId",
        user_name as "userName",
        action,
        timestamp,
        before_status as "beforeStatus",
        after_status as "afterStatus",
        before_severity as "beforeSeverity",
        after_severity as "afterSeverity",
        before_assigned_to as "beforeAssignedTo",
        after_assigned_to as "afterAssignedTo",
        note,
        metadata
      FROM sp_v2_exception_actions
      WHERE exception_id = $1
      ORDER BY timestamp DESC
    `;

    const timelineResult = await pool.query(timelineQuery, [id]);

    // Get comments
    const commentsQuery = `
      SELECT 
        id,
        exception_id as "exceptionId",
        user_id as "userId",
        user_name as "userName",
        comment,
        mentions,
        created_at as "createdAt"
      FROM sp_v2_exception_comments
      WHERE exception_id = $1
      ORDER BY created_at DESC
    `;

    const commentsResult = await pool.query(commentsQuery, [id]);

    // Build response
    const detail = {
      ...exception,
      pgData: exception.pg_txn_id ? {
        transaction_id: exception.pg_txn_id,
        amount_paise: exception.pg_amount,
        payment_method: exception.payment_method,
        source_type: exception.source_type
      } : null,
      bankData: exception.bank_ref ? {
        bank_ref: exception.bank_ref,
        bank_name: exception.bank_name,
        amount_paise: exception.bank_amount,
        remarks: exception.bank_remarks
      } : null,
      variance: {
        pgAmount: exception.pg_amount,
        bankAmount: exception.bank_amount,
        delta: exception.amount_delta_paise
      },
      timeline: timelineResult.rows,
      comments: commentsResult.rows,
      suggestions: [] // Can add ML suggestions later
    };

    res.json({
      success: true,
      data: detail
    });

  } catch (error) {
    console.error('[Exceptions API] Error fetching exception:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 3. POST /exceptions/:id/assign - Assign exception
// =====================================================
router.post('/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { assignTo, assignToName, note } = req.body;

    const result = await pool.query(`
      UPDATE sp_v2_exception_workflow
      SET 
        assigned_to = $1,
        assigned_to_name = $2,
        assigned_at = NOW(),
        updated_at = NOW()
      WHERE exception_id = $3
      RETURNING *
    `, [assignTo, assignToName, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `Exception assigned to ${assignToName}`
    });

  } catch (error) {
    console.error('[Exceptions API] Error assigning exception:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 4. POST /exceptions/:id/investigate - Mark as investigating
// =====================================================
router.post('/:id/investigate', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userName, note } = req.body;

    const result = await pool.query(`
      UPDATE sp_v2_exception_workflow
      SET 
        status = 'investigating',
        last_transition_at = NOW(),
        updated_at = NOW()
      WHERE exception_id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Exception marked as investigating'
    });

  } catch (error) {
    console.error('[Exceptions API] Error marking as investigating:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 5. POST /exceptions/:id/snooze - Snooze exception
// =====================================================
router.post('/:id/snooze', async (req, res) => {
  try {
    const { id } = req.params;
    const { snoozeUntil, snoozedBy, snoozeReason } = req.body;

    const result = await pool.query(`
      UPDATE sp_v2_exception_workflow
      SET 
        status = 'snoozed',
        snooze_until = $1,
        snoozed_by = $2,
        snooze_reason = $3,
        last_transition_at = NOW(),
        updated_at = NOW()
      WHERE exception_id = $4
      RETURNING *
    `, [snoozeUntil, snoozedBy, snoozeReason, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `Exception snoozed until ${snoozeUntil}`
    });

  } catch (error) {
    console.error('[Exceptions API] Error snoozing exception:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 6. POST /exceptions/:id/resolve - Resolve exception
// =====================================================
router.post('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedBy, resolution, resolutionNote } = req.body;

    // Update exception to resolved (trigger will update transaction)
    const result = await pool.query(`
      UPDATE sp_v2_exception_workflow
      SET 
        status = 'resolved',
        resolved_by = $1,
        resolution = $2,
        resolution_note = $3,
        resolved_at = NOW(),
        last_transition_at = NOW(),
        updated_at = NOW()
      WHERE exception_id = $4
      RETURNING *
    `, [resolvedBy, resolution || 'MANUAL_MATCH', resolutionNote, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Exception resolved successfully'
    });

  } catch (error) {
    console.error('[Exceptions API] Error resolving exception:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 7. POST /exceptions/:id/wont-fix - Mark as won't fix
// =====================================================
router.post('/:id/wont-fix', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedBy, resolutionNote } = req.body;

    const result = await pool.query(`
      UPDATE sp_v2_exception_workflow
      SET 
        status = 'wont_fix',
        resolved_by = $1,
        resolution = 'WONT_FIX',
        resolution_note = $2,
        resolved_at = NOW(),
        last_transition_at = NOW(),
        updated_at = NOW()
      WHERE exception_id = $3
      RETURNING *
    `, [resolvedBy, resolutionNote, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Exception marked as won\'t fix'
    });

  } catch (error) {
    console.error('[Exceptions API] Error marking as won\'t fix:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 8. POST /exceptions/:id/add-tag - Add tag
// =====================================================
router.post('/:id/add-tag', async (req, res) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;

    const result = await pool.query(`
      UPDATE sp_v2_exception_workflow
      SET 
        tags = array_append(tags, $1),
        updated_at = NOW()
      WHERE exception_id = $2
        AND NOT ($1 = ANY(tags))
      RETURNING *
    `, [tag, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception not found or tag already exists'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `Tag "${tag}" added`
    });

  } catch (error) {
    console.error('[Exceptions API] Error adding tag:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 9. POST /exceptions/:id/comment - Add comment
// =====================================================
router.post('/:id/comment', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userName, comment, mentions } = req.body;

    const result = await pool.query(`
      INSERT INTO sp_v2_exception_comments (
        exception_id, user_id, user_name, comment, mentions
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, userId, userName, comment, mentions || []]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Comment added'
    });

  } catch (error) {
    console.error('[Exceptions API] Error adding comment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 10. POST /exceptions/bulk-update - Bulk operations
// =====================================================
router.post('/bulk-update', async (req, res) => {
  try {
    const { ids, action, params, note } = req.body;

    let query;
    let queryParams;

    switch (action) {
      case 'assign':
        query = `
          UPDATE sp_v2_exception_workflow
          SET assigned_to = $1, assigned_to_name = $2, assigned_at = NOW(), updated_at = NOW()
          WHERE exception_id = ANY($3)
        `;
        queryParams = [params.assignTo, params.assignToName, ids];
        break;

      case 'investigate':
        query = `
          UPDATE sp_v2_exception_workflow
          SET status = 'investigating', last_transition_at = NOW(), updated_at = NOW()
          WHERE exception_id = ANY($1)
        `;
        queryParams = [ids];
        break;

      case 'resolve':
        query = `
          UPDATE sp_v2_exception_workflow
          SET status = 'resolved', resolved_by = $1, resolution_note = $2, 
              resolved_at = NOW(), last_transition_at = NOW(), updated_at = NOW()
          WHERE exception_id = ANY($3)
        `;
        queryParams = [params.resolvedBy, note, ids];
        break;

      case 'snooze':
        query = `
          UPDATE sp_v2_exception_workflow
          SET status = 'snoozed', snooze_until = $1, snooze_reason = $2,
              last_transition_at = NOW(), updated_at = NOW()
          WHERE exception_id = ANY($3)
        `;
        queryParams = [params.snoozeUntil, note, ids];
        break;

      case 'tag':
        query = `
          UPDATE sp_v2_exception_workflow
          SET tags = array_append(tags, $1), updated_at = NOW()
          WHERE exception_id = ANY($2) AND NOT ($1 = ANY(tags))
        `;
        queryParams = [params.tag, ids];
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`
        });
    }

    const result = await pool.query(query, queryParams);

    res.json({
      success: true,
      affected: result.rowCount,
      message: `Bulk ${action} completed on ${result.rowCount} exceptions`
    });

  } catch (error) {
    console.error('[Exceptions API] Error in bulk update:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 11. POST /exceptions/export - Export to CSV/XLSX
// =====================================================
router.post('/export', async (req, res) => {
  try {
    const { query: filterQuery, format, template } = req.body;

    // Build SQL based on filters (reuse logic from GET /)
    let sql = `
      SELECT 
        ew.exception_id as "Exception ID",
        ew.status as "Status",
        ew.severity as "Severity",
        ew.reason as "Reason",
        ew.merchant_id as "Merchant ID",
        ew.merchant_name as "Merchant Name",
        ew.pg_transaction_id as "PG Transaction ID",
        ew.utr as "UTR",
        ew.pg_amount_paise / 100.0 as "PG Amount (INR)",
        ew.bank_amount_paise / 100.0 as "Bank Amount (INR)",
        ew.amount_delta_paise / 100.0 as "Delta (INR)",
        ew.assigned_to_name as "Assigned To",
        ew.sla_due_at as "SLA Due",
        ew.sla_breached as "SLA Breached",
        ew.created_at as "Created At",
        ew.resolved_at as "Resolved At"
      FROM sp_v2_exception_workflow ew
      WHERE 1=1
    `;

    const params = [];
    // Add filter logic here (similar to GET /)

    sql += ` ORDER BY ew.created_at DESC`;

    const result = await pool.query(sql, params);

    // Convert to CSV
    const parser = new Parser();
    const csv = parser.parse(result.rows);

    // Set response headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=exceptions_export_${Date.now()}.csv`);
    res.send(csv);

  } catch (error) {
    console.error('[Exceptions API] Error exporting:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
