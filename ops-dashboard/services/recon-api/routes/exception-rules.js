const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

// =====================================================
// 1. GET /rules - Get all exception rules
// =====================================================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        rule_name as "name",
        priority,
        enabled,
        scope_reason_codes as "scope.reasonCodes",
        scope_amount_delta_gt as "scope.amountDeltaGt",
        scope_amount_delta_lt as "scope.amountDeltaLt",
        scope_age_gt as "scope.ageGt",
        scope_age_lt as "scope.ageLt",
        scope_acquirers as "scope.acquirers",
        scope_merchants as "scope.merchantIds",
        scope_tags_includes as "scope.tagsIncludes",
        scope_tags_excludes as "scope.tagsExcludes",
        scope_status as "scope.statusIn",
        scope_severity as "scope.severityIn",
        actions,
        created_by as "createdBy",
        updated_by as "updatedBy",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_applied_at as "lastAppliedAt",
        applied_count as "appliedCount"
      FROM sp_v2_exception_rules
      ORDER BY priority ASC, id ASC
    `);

    // Transform rows to nest scope object
    const rules = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      priority: row.priority,
      enabled: row.enabled,
      scope: {
        reasonCodes: row['scope.reasonCodes'],
        amountDeltaGt: row['scope.amountDeltaGt'],
        amountDeltaLt: row['scope.amountDeltaLt'],
        ageGt: row['scope.ageGt'],
        ageLt: row['scope.ageLt'],
        acquirers: row['scope.acquirers'],
        merchantIds: row['scope.merchantIds'],
        tagsIncludes: row['scope.tagsIncludes'],
        tagsExcludes: row['scope.tagsExcludes'],
        statusIn: row['scope.statusIn'],
        severityIn: row['scope.severityIn']
      },
      actions: row.actions,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastAppliedAt: row.lastAppliedAt,
      appliedCount: row.appliedCount
    }));

    res.json({
      success: true,
      data: rules
    });

  } catch (error) {
    console.error('[Exception Rules API] Error fetching rules:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 2. POST /rules - Create new rule
// =====================================================
router.post('/', async (req, res) => {
  try {
    const { name, priority, enabled, scope, actions, createdBy } = req.body;

    const result = await pool.query(`
      INSERT INTO sp_v2_exception_rules (
        rule_name,
        priority,
        enabled,
        scope_reason_codes,
        scope_amount_delta_gt,
        scope_amount_delta_lt,
        scope_age_gt,
        scope_age_lt,
        scope_acquirers,
        scope_merchants,
        scope_tags_includes,
        scope_tags_excludes,
        scope_status,
        scope_severity,
        actions,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      name,
      priority || 100,
      enabled !== false,
      scope?.reasonCodes || null,
      scope?.amountDeltaGt || null,
      scope?.amountDeltaLt || null,
      scope?.ageGt || null,
      scope?.ageLt || null,
      scope?.acquirers || null,
      scope?.merchantIds || null,
      scope?.tagsIncludes || null,
      scope?.tagsExcludes || null,
      scope?.statusIn || null,
      scope?.severityIn || null,
      JSON.stringify(actions),
      createdBy || 'SYSTEM'
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Exception rule created'
    });

  } catch (error) {
    console.error('[Exception Rules API] Error creating rule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 3. PUT /rules/:id - Update rule
// =====================================================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, priority, enabled, scope, actions, updatedBy } = req.body;

    const result = await pool.query(`
      UPDATE sp_v2_exception_rules
      SET 
        rule_name = COALESCE($1, rule_name),
        priority = COALESCE($2, priority),
        enabled = COALESCE($3, enabled),
        scope_reason_codes = COALESCE($4, scope_reason_codes),
        scope_amount_delta_gt = COALESCE($5, scope_amount_delta_gt),
        scope_amount_delta_lt = COALESCE($6, scope_amount_delta_lt),
        scope_age_gt = COALESCE($7, scope_age_gt),
        scope_age_lt = COALESCE($8, scope_age_lt),
        scope_acquirers = COALESCE($9, scope_acquirers),
        scope_merchants = COALESCE($10, scope_merchants),
        scope_tags_includes = COALESCE($11, scope_tags_includes),
        scope_tags_excludes = COALESCE($12, scope_tags_excludes),
        scope_status = COALESCE($13, scope_status),
        scope_severity = COALESCE($14, scope_severity),
        actions = COALESCE($15, actions),
        updated_by = $16,
        updated_at = NOW()
      WHERE id = $17
      RETURNING *
    `, [
      name,
      priority,
      enabled,
      scope?.reasonCodes,
      scope?.amountDeltaGt,
      scope?.amountDeltaLt,
      scope?.ageGt,
      scope?.ageLt,
      scope?.acquirers,
      scope?.merchantIds,
      scope?.tagsIncludes,
      scope?.tagsExcludes,
      scope?.statusIn,
      scope?.severityIn,
      actions ? JSON.stringify(actions) : null,
      updatedBy || 'SYSTEM',
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception rule not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Exception rule updated'
    });

  } catch (error) {
    console.error('[Exception Rules API] Error updating rule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 4. DELETE /rules/:id - Delete rule
// =====================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM sp_v2_exception_rules
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Exception rule deleted'
    });

  } catch (error) {
    console.error('[Exception Rules API] Error deleting rule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 5. POST /rules/:id/toggle - Enable/disable rule
// =====================================================
router.post('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE sp_v2_exception_rules
      SET enabled = NOT enabled, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception rule not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `Rule ${result.rows[0].enabled ? 'enabled' : 'disabled'}`
    });

  } catch (error) {
    console.error('[Exception Rules API] Error toggling rule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 6. POST /rules/apply - Apply rules to exception(s)
// =====================================================
router.post('/apply', async (req, res) => {
  try {
    const { exceptionIds } = req.body;

    if (!exceptionIds || !Array.isArray(exceptionIds)) {
      return res.status(400).json({
        success: false,
        error: 'exceptionIds array required'
      });
    }

    // Get all enabled rules ordered by priority
    const rulesResult = await pool.query(`
      SELECT * FROM sp_v2_exception_rules
      WHERE enabled = true
      ORDER BY priority ASC
    `);

    const rules = rulesResult.rows;
    const results = {
      processed: 0,
      matched: 0,
      actionsApplied: 0
    };

    for (const exceptionId of exceptionIds) {
      // Get exception details
      const exceptionResult = await pool.query(`
        SELECT * FROM sp_v2_exception_workflow
        WHERE exception_id = $1
      `, [exceptionId]);

      if (exceptionResult.rows.length === 0) continue;

      const exception = exceptionResult.rows[0];
      results.processed++;

      // Check each rule
      for (const rule of rules) {
        if (matchesScope(exception, rule)) {
          results.matched++;
          
          // Apply actions
          await applyActions(exceptionId, rule.actions);
          results.actionsApplied += rule.actions.length;

          // Update rule stats
          await pool.query(`
            UPDATE sp_v2_exception_rules
            SET last_applied_at = NOW(), applied_count = applied_count + 1
            WHERE id = $1
          `, [rule.id]);
        }
      }
    }

    res.json({
      success: true,
      results,
      message: `Applied rules to ${results.processed} exceptions`
    });

  } catch (error) {
    console.error('[Exception Rules API] Error applying rules:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// Helper Functions
// =====================================================

function matchesScope(exception, rule) {
  // Check reason codes
  if (rule.scope_reason_codes && rule.scope_reason_codes.length > 0) {
    if (!rule.scope_reason_codes.includes(exception.reason)) {
      return false;
    }
  }

  // Check severity
  if (rule.scope_severity && rule.scope_severity.length > 0) {
    if (!rule.scope_severity.includes(exception.severity)) {
      return false;
    }
  }

  // Check status
  if (rule.scope_status && rule.scope_status.length > 0) {
    if (!rule.scope_status.includes(exception.status)) {
      return false;
    }
  }

  // Check amount delta
  if (rule.scope_amount_delta_gt) {
    if (Math.abs(exception.amount_delta_paise) <= rule.scope_amount_delta_gt) {
      return false;
    }
  }

  if (rule.scope_amount_delta_lt) {
    if (Math.abs(exception.amount_delta_paise) >= rule.scope_amount_delta_lt) {
      return false;
    }
  }

  // Check merchants
  if (rule.scope_merchants && rule.scope_merchants.length > 0) {
    if (!rule.scope_merchants.includes(exception.merchant_id)) {
      return false;
    }
  }

  // Check acquirers
  if (rule.scope_acquirers && rule.scope_acquirers.length > 0) {
    if (!rule.scope_acquirers.includes(exception.acquirer_code)) {
      return false;
    }
  }

  // Check tags (includes)
  if (rule.scope_tags_includes && rule.scope_tags_includes.length > 0) {
    const hasSomeTag = rule.scope_tags_includes.some(tag => 
      exception.tags && exception.tags.includes(tag)
    );
    if (!hasSomeTag) return false;
  }

  // Check tags (excludes)
  if (rule.scope_tags_excludes && rule.scope_tags_excludes.length > 0) {
    const hasExcludedTag = rule.scope_tags_excludes.some(tag => 
      exception.tags && exception.tags.includes(tag)
    );
    if (hasExcludedTag) return false;
  }

  // Check age
  if (rule.scope_age_gt || rule.scope_age_lt) {
    const ageHours = (Date.now() - new Date(exception.created_at).getTime()) / (1000 * 60 * 60);
    
    if (rule.scope_age_gt && ageHours <= rule.scope_age_gt) {
      return false;
    }
    
    if (rule.scope_age_lt && ageHours >= rule.scope_age_lt) {
      return false;
    }
  }

  return true;
}

async function applyActions(exceptionId, actions) {
  for (const action of actions) {
    switch (action.type) {
      case 'assign':
        await pool.query(`
          UPDATE sp_v2_exception_workflow
          SET assigned_to = $1, assigned_to_name = $2, assigned_at = NOW()
          WHERE exception_id = $3
        `, [action.params.assignTo, action.params.assignToName || action.params.assignTo, exceptionId]);
        break;

      case 'setSeverity':
        await pool.query(`
          UPDATE sp_v2_exception_workflow
          SET severity = $1
          WHERE exception_id = $2
        `, [action.params.severity, exceptionId]);
        break;

      case 'addTag':
        await pool.query(`
          UPDATE sp_v2_exception_workflow
          SET tags = array_append(tags, $1)
          WHERE exception_id = $2 AND NOT ($1 = ANY(tags))
        `, [action.params.tag, exceptionId]);
        break;

      case 'removeTag':
        await pool.query(`
          UPDATE sp_v2_exception_workflow
          SET tags = array_remove(tags, $1)
          WHERE exception_id = $2
        `, [action.params.tag, exceptionId]);
        break;

      case 'snooze':
        await pool.query(`
          UPDATE sp_v2_exception_workflow
          SET status = 'snoozed', snooze_until = $1, snooze_reason = $2
          WHERE exception_id = $3
        `, [action.params.snoozeUntil, action.params.reason || 'Auto-snoozed by rule', exceptionId]);
        break;

      case 'resolve':
        await pool.query(`
          UPDATE sp_v2_exception_workflow
          SET status = 'resolved', resolution = $1, resolved_by = 'RULE_ENGINE', resolved_at = NOW()
          WHERE exception_id = $2
        `, [action.params.resolution || 'AUTO_CORRECTED', exceptionId]);
        break;
    }
  }
}

module.exports = router;
