const express = require('express');
const { v4: uuidv4 } = require('uuid');

module.exports = function(pool) {
  const router = express.Router();

  // GET /v1/chargebacks - List chargebacks with filters
  router.get('/', async (req, res) => {
    const { 
      status, 
      searchQuery, 
      acquirer, 
      slaBucket, 
      limit = 50,
      offset = 0 
    } = req.query;

    try {
      let query = `
        SELECT 
          id,
          merchant_id,
          merchant_name,
          acquirer,
          network_case_id,
          case_ref,
          txn_ref as txn_id,
          rrn,
          utr,
          reason_code,
          reason_description as reason_desc,
          chargeback_paise as disputed_amount_paise,
          currency,
          stage,
          status,
          outcome,
          assigned_to as owner_user_id,
          assigned_team as owner_email,
          received_at as opened_at,
          evidence_due_at,
          deadline_at,
          closed_at as decision_at,
          created_at,
          updated_at
        FROM sp_v2_chargebacks
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      // Filter by status
      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        const statusMappings = {
          'OPEN': 'OPEN',
          'EVIDENCE_REQUIRED': 'OPEN',
          'REPRESENTMENT_SUBMITTED': 'OPEN',
          'PENDING_BANK': 'OPEN',
          'WON': 'RECOVERED',
          'LOST': 'WRITEOFF',
          'CANCELLED': 'WRITEOFF'
        };
        
        const dbStatuses = statuses.map(s => statusMappings[s] || s);
        query += ` AND status = ANY($${paramIndex})`;
        params.push(dbStatuses);
        paramIndex++;
      }

      // Filter by acquirer
      if (acquirer && acquirer !== 'all') {
        query += ` AND acquirer = $${paramIndex}`;
        params.push(acquirer);
        paramIndex++;
      }

      // Search query
      if (searchQuery) {
        query += ` AND (
          case_ref ILIKE $${paramIndex} OR
          txn_ref ILIKE $${paramIndex} OR
          rrn ILIKE $${paramIndex} OR
          utr ILIKE $${paramIndex} OR
          network_case_id ILIKE $${paramIndex}
        )`;
        params.push(`%${searchQuery}%`);
        paramIndex++;
      }

      // SLA bucket filter
      if (slaBucket) {
        const now = new Date();
        if (slaBucket === 'overdue') {
          query += ` AND deadline_at < $${paramIndex}`;
          params.push(now);
          paramIndex++;
        } else if (slaBucket === 'today') {
          const endOfDay = new Date(now);
          endOfDay.setHours(23, 59, 59, 999);
          query += ` AND deadline_at >= $${paramIndex} AND deadline_at <= $${paramIndex + 1}`;
          params.push(now, endOfDay);
          paramIndex += 2;
        } else if (slaBucket === 'twoToThree') {
          const twoDaysLater = new Date(now);
          twoDaysLater.setDate(now.getDate() + 2);
          const threeDaysLater = new Date(now);
          threeDaysLater.setDate(now.getDate() + 3);
          query += ` AND deadline_at >= $${paramIndex} AND deadline_at <= $${paramIndex + 1}`;
          params.push(twoDaysLater, threeDaysLater);
          paramIndex += 2;
        }
      }

      // Order and pagination
      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Transform to match frontend type expectations
      const chargebacks = result.rows.map(row => {
        const daysUntilDue = row.evidence_due_at 
          ? Math.floor((new Date(row.evidence_due_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          : undefined;

        // Map database status to frontend status
        let frontendStatus = row.status;
        if (row.stage === 'NEW' && row.status === 'OPEN') {
          frontendStatus = 'OPEN';
        } else if (row.stage === 'UNDER_REVIEW' && row.status === 'OPEN') {
          frontendStatus = 'EVIDENCE_REQUIRED';
        } else if (row.stage === 'REPRESENTMENT' && row.status === 'OPEN') {
          frontendStatus = 'REPRESENTMENT_SUBMITTED';
        } else if (row.stage === 'PRE_ARBIT' || row.stage === 'ARBITRATION') {
          frontendStatus = 'PENDING_BANK';
        } else if (row.status === 'RECOVERED') {
          frontendStatus = 'WON';
        } else if (row.status === 'WRITEOFF' && row.outcome === 'LOST') {
          frontendStatus = 'LOST';
        } else if (row.status === 'WRITEOFF' && row.outcome !== 'LOST') {
          frontendStatus = 'CANCELLED';
        }

        return {
          ...row,
          status: frontendStatus,
          daysUntilDue,
          isOverdue: daysUntilDue !== undefined && daysUntilDue < 0,
          category: getCategoryFromReason(row.reason_code)
        };
      });

      res.json({ chargebacks, total: chargebacks.length });
    } catch (error) {
      console.error('[Chargebacks API] Error fetching chargebacks:', error);
      res.status(500).json({ error: 'Failed to fetch chargebacks' });
    }
  });

  // GET /v1/chargebacks/:id - Get chargeback detail
  router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
      // Get chargeback
      const cbResult = await pool.query(`
        SELECT 
          id,
          merchant_id,
          merchant_name,
          acquirer,
          network_case_id,
          case_ref,
          txn_ref,
          original_transaction_id,
          gateway_txn_id,
          rrn,
          utr,
          original_gross_paise,
          chargeback_paise as disputed_amount_paise,
          fees_paise,
          recovered_paise,
          pending_recovery_paise,
          writeoff_paise,
          currency,
          reason_code,
          reason_description as reason_desc,
          customer_complaint,
          stage,
          status,
          outcome,
          assigned_to as owner_user_id,
          assigned_team as owner_email,
          received_at as opened_at,
          evidence_due_at,
          deadline_at,
          responded_at,
          closed_at as decision_at,
          source_system,
          external_reference,
          notes,
          tags,
          created_at,
          updated_at
        FROM sp_v2_chargebacks
        WHERE id = $1
      `, [id]);

      if (cbResult.rows.length === 0) {
        return res.status(404).json({ error: 'Chargeback not found' });
      }

      const chargeback = cbResult.rows[0];

      // Map status for frontend
      chargeback.category = getCategoryFromReason(chargeback.reason_code);
      chargeback.status = mapStatusToFrontend(chargeback);

      // Get evidence documents
      const evidenceResult = await pool.query(`
        SELECT 
          id,
          file_name,
          file_type,
          file_size_bytes as size_bytes,
          s3_url,
          uploaded_by,
          uploaded_at
        FROM sp_v2_chargeback_documents
        WHERE chargeback_id = $1
        ORDER BY uploaded_at DESC
      `, [id]);

      // Get timeline/audit events
      const timelineResult = await pool.query(`
        SELECT 
          id,
          action,
          before_value,
          after_value,
          performed_by as actor_email,
          created_at as ts,
          reason,
          notes
        FROM sp_v2_chargeback_audit
        WHERE chargeback_id = $1
        ORDER BY created_at ASC
      `, [id]);

      // Get transaction correlation
      let transaction = null;
      const corrResult = await pool.query(`
        SELECT 
          pg_transaction_id,
          correlation_method,
          confidence_score
        FROM sp_v2_chargeback_correlations
        WHERE chargeback_id = $1
        LIMIT 1
      `, [id]);

      if (corrResult.rows.length > 0) {
        // Mock transaction details (in real system, would join with pg_transactions table)
        transaction = {
          txnId: corrResult.rows[0].pg_transaction_id,
          paymentDate: chargeback.received_at,
          originalAmountPaise: chargeback.original_gross_paise,
          paymentMethod: chargeback.utr ? 'UPI' : 'CARD',
          correlationMethod: corrResult.rows[0].correlation_method,
          confidenceScore: corrResult.rows[0].confidence_score
        };
      }

      // Get recovery allocations
      const allocationsResult = await pool.query(`
        SELECT 
          id,
          kind as type,
          amount_paise,
          status,
          executed_at as created_at,
          settlement_batch_id as journal_entry_id
        FROM sp_v2_recovery_actions
        WHERE chargeback_id = $1
        ORDER BY created_at DESC
      `, [id]);

      // Settlement impact (mock for now)
      const settlementImpact = chargeback.recovered_paise > 0 ? {
        reserveHoldPaise: chargeback.recovered_paise,
        adjustmentPaise: 0,
        settlementBatchId: allocationsResult.rows[0]?.journal_entry_id || null
      } : null;

      res.json({
        chargeback,
        transaction,
        evidence: evidenceResult.rows,
        timeline: timelineResult.rows.map(event => ({
          ...event,
          payload: event.after_value
        })),
        allocations: allocationsResult.rows,
        settlementImpact
      });

    } catch (error) {
      console.error('[Chargebacks API] Error fetching chargeback detail:', error);
      res.status(500).json({ error: 'Failed to fetch chargeback detail' });
    }
  });

  // Helper functions
  function getCategoryFromReason(reasonCode) {
    if (!reasonCode) return 'OTHER';
    
    if (reasonCode.includes('10.') || reasonCode.toLowerCase().includes('fraud')) {
      return 'FRAUD';
    } else if (reasonCode.includes('13.1') || reasonCode.toLowerCase().includes('not received')) {
      return 'NON_RECEIPT';
    } else if (reasonCode.includes('13.3') || reasonCode.toLowerCase().includes('not as described')) {
      return 'QUALITY';
    } else if (reasonCode.includes('11.') || reasonCode.toLowerCase().includes('authorization')) {
      return 'AUTHORIZATION';
    } else if (reasonCode.includes('12.') || reasonCode.toLowerCase().includes('processing')) {
      return 'PROCESSING';
    }
    return 'OTHER';
  }

  function mapStatusToFrontend(chargeback) {
    if (chargeback.stage === 'NEW' && chargeback.status === 'OPEN') {
      return 'OPEN';
    } else if (chargeback.stage === 'UNDER_REVIEW' && chargeback.status === 'OPEN') {
      return 'EVIDENCE_REQUIRED';
    } else if (chargeback.stage === 'REPRESENTMENT' && chargeback.status === 'OPEN') {
      return 'REPRESENTMENT_SUBMITTED';
    } else if ((chargeback.stage === 'PRE_ARBIT' || chargeback.stage === 'ARBITRATION') && chargeback.status === 'OPEN') {
      return 'PENDING_BANK';
    } else if (chargeback.status === 'RECOVERED') {
      return 'WON';
    } else if (chargeback.status === 'WRITEOFF' && chargeback.outcome === 'LOST') {
      return 'LOST';
    } else if (chargeback.status === 'WRITEOFF') {
      return 'CANCELLED';
    }
    return chargeback.status;
  }

  return router;
};
