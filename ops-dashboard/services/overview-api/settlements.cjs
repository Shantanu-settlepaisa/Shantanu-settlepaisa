const { Pool } = require('pg');

// Connect to settlement database (sp_v2)
const v2Pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: process.env.DB_PORT || 5433,
});

v2Pool.on('connect', () => {
  console.log('[Settlements API] Connected to settlement database');
});

v2Pool.on('error', (err) => {
  console.error('[Settlements API] Database error:', err);
});

/**
 * Register settlement endpoints on the Express app
 */
function registerSettlementEndpoints(app) {
  // GET /api/settlements - List all settlement batches
  app.get('/api/settlements', async (req, res) => {
    try {
      console.log('[Settlements API] Fetching all settlement batches');

      const result = await v2Pool.query(`
        SELECT
          sb.id,
          sb.merchant_id,
          sb.cycle_date,
          sb.total_transactions,
          sb.gross_amount_paise,
          sb.total_commission_paise,
          sb.total_gst_paise,
          sb.total_reserve_paise,
          sb.net_amount_paise,
          sb.status,
          sb.created_at,
          sb.approved_at,
          sb.updated_at,
          bt.utr_number as bank_reference_number
        FROM sp_v2_settlement_batches sb
        LEFT JOIN sp_v2_settlement_bank_transfers bt ON bt.settlement_batch_id = sb.id
        ORDER BY sb.created_at DESC
        LIMIT 100
      `);

      console.log(`[Settlements API] Found ${result.rows.length} settlement batches`);

      res.json(result.rows);
    } catch (error) {
      console.error('[Settlements API] Error fetching batches:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/settlements/:batchId - Get specific batch details
  app.get('/api/settlements/:batchId', async (req, res) => {
    const { batchId } = req.params;

    try {
      console.log(`[Settlements API] Fetching batch details for ${batchId}`);

      // Get settlement batch details with bank transfer info
      const batchResult = await v2Pool.query(`
        SELECT
          sb.id,
          sb.merchant_id,
          sb.cycle_date,
          sb.total_transactions,
          sb.gross_amount_paise,
          sb.total_commission_paise,
          sb.total_gst_paise,
          sb.total_reserve_paise,
          sb.net_amount_paise,
          sb.status,
          sb.created_at,
          sb.approved_at,
          sb.updated_at,
          bt.id as bank_transfer_id,
          bt.utr_number,
          bt.status as transfer_status,
          bt.verification_status,
          bt.transfer_mode,
          bt.initiated_at as transfer_initiated_at,
          bt.processing_started_at,
          bt.completed_at as transfer_completed_at
        FROM sp_v2_settlement_batches sb
        LEFT JOIN sp_v2_settlement_bank_transfers bt ON bt.settlement_batch_id = sb.id
        WHERE sb.id = $1
      `, [batchId]);

      if (batchResult.rows.length === 0) {
        return res.status(404).json({ error: 'Settlement batch not found' });
      }

      const batch = batchResult.rows[0];

      // Get settlement items (transaction breakdown)
      const itemsResult = await v2Pool.query(`
        SELECT
          si.transaction_id,
          si.amount_paise,
          si.commission_paise,
          si.gst_paise,
          si.reserve_paise,
          si.net_paise,
          si.payment_mode,
          si.commission_rate
        FROM sp_v2_settlement_items si
        WHERE si.settlement_batch_id = $1
        ORDER BY si.created_at
      `, [batchId]);

      // Get merchant bank details
      const configResult = await v2Pool.query(`
        SELECT
          mc.account_number as bank_account_number,
          mc.account_holder_name as bank_account_name,
          mc.ifsc_code as bank_ifsc_code,
          mc.bank_name,
          mc.branch_name as bank_branch,
          mc.preferred_transfer_mode
        FROM sp_v2_merchant_settlement_config mc
        WHERE mc.merchant_id = $1
          AND mc.is_active = true
        LIMIT 1
      `, [batch.merchant_id]);

      // Merge all data
      const response = {
        ...batch,
        items: itemsResult.rows,
        ...(configResult.rows.length > 0 ? configResult.rows[0] : {}),
      };

      console.log(`[Settlements API] Batch ${batchId}: ${response.total_transactions} transactions, ${itemsResult.rows.length} items`);

      res.json(response);
    } catch (error) {
      console.error(`[Settlements API] Error fetching batch ${batchId}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/settlements/:batchId/approve - Approve a settlement batch
  app.post('/api/settlements/:batchId/approve', async (req, res) => {
    const { batchId } = req.params;
    const { decision, notes, approver_id, approver_name, approver_role } = req.body;

    const client = await v2Pool.connect();

    try {
      console.log(`[Settlements API] Processing ${decision} for batch ${batchId}`);

      await client.query('BEGIN');

      // Validate decision
      if (!['approved', 'rejected', 'on_hold'].includes(decision)) {
        throw new Error('Invalid decision. Must be approved, rejected, or on_hold');
      }

      // Get batch details
      const batchResult = await client.query(
        'SELECT * FROM sp_v2_settlement_batches WHERE id = $1',
        [batchId]
      );

      if (batchResult.rows.length === 0) {
        throw new Error('Settlement batch not found');
      }

      const batch = batchResult.rows[0];

      if (batch.status !== 'PENDING_APPROVAL') {
        throw new Error(`Batch is not pending approval. Current status: ${batch.status}`);
      }

      // Insert approval record
      await client.query(`
        INSERT INTO sp_v2_settlement_approvals (
          batch_id,
          approval_level,
          approver_id,
          approver_name,
          approver_role,
          decision,
          approval_notes,
          approved_at
        ) VALUES ($1, 1, $2, $3, $4, $5, $6, NOW())
      `, [batchId, approver_id, approver_name, approver_role, decision, notes]);

      console.log(`[Settlements API] Approval record created`);

      if (decision === 'approved') {
        // Update batch status to APPROVED
        await client.query(`
          UPDATE sp_v2_settlement_batches
          SET status = 'APPROVED', approved_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [batchId]);

        console.log(`[Settlements API] Batch status updated to APPROVED`);

        // Get merchant bank details
        const configResult = await client.query(`
          SELECT
            mc.merchant_id,
            mc.account_number as bank_account_number,
            mc.account_holder_name as bank_account_name,
            mc.ifsc_code as bank_ifsc_code,
            mc.bank_name,
            mc.branch_name as bank_branch,
            mc.preferred_transfer_mode
          FROM sp_v2_merchant_settlement_config mc
          WHERE mc.merchant_id = $1
            AND mc.is_active = true
          LIMIT 1
        `, [batch.merchant_id]);

        if (configResult.rows.length === 0) {
          throw new Error('Merchant bank configuration not found');
        }

        const config = configResult.rows[0];

        // Create bank transfer record
        await client.query(`
          INSERT INTO sp_v2_settlement_bank_transfers (
            settlement_batch_id,
            merchant_id,
            bank_account_number,
            ifsc_code,
            amount_paise,
            transfer_mode,
            status,
            initiated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NOW())
        `, [
          batchId,
          config.merchant_id,
          config.bank_account_number,
          config.bank_ifsc_code,
          batch.net_amount_paise,
          config.preferred_transfer_mode || 'NEFT',
        ]);

        console.log(`[Settlements API] Bank transfer record created`);

        // Add timeline event
        await client.query(`
          INSERT INTO sp_v2_settlement_timeline_events (
            settlement_batch_id,
            event_type,
            event_data,
            created_by,
            created_at
          ) VALUES ($1, 'SETTLEMENT_APPROVED', $2, $3, NOW())
        `, [
          batchId,
          JSON.stringify({ approver: approver_name, notes }),
          approver_id,
        ]);

        console.log(`[Settlements API] Timeline event added`);

      } else if (decision === 'rejected') {
        // Update batch status to REJECTED
        await client.query(`
          UPDATE sp_v2_settlement_batches
          SET status = 'REJECTED', updated_at = NOW()
          WHERE id = $1
        `, [batchId]);

        console.log(`[Settlements API] Batch status updated to REJECTED`);

      } else if (decision === 'on_hold') {
        // Update batch status to ON_HOLD
        await client.query(`
          UPDATE sp_v2_settlement_batches
          SET status = 'ON_HOLD', updated_at = NOW()
          WHERE id = $1
        `, [batchId]);

        console.log(`[Settlements API] Batch status updated to ON_HOLD`);
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        batchId,
        decision,
        message: `Settlement batch ${decision} successfully`,
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[Settlements API] Error processing approval:`, error);
      res.status(400).json({ error: error.message });
    } finally {
      client.release();
    }
  });

  console.log('[Settlements API] Endpoints registered');
}

module.exports = { registerSettlementEndpoints };
