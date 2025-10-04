const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Papa = require('papaparse');

module.exports = function(pool) {
  const router = express.Router();

  // POST /api/chargebacks/ingest/webhook - Webhook from card networks
  router.post('/webhook', async (req, res) => {
    const { event_type, case_id, merchant_acquirer_id, transaction, dispute } = req.body;

    console.log('[Chargeback Ingestion] Webhook received:', event_type, case_id);

    try {
      if (event_type === 'chargeback.created') {
        // Check for duplicate
        const existingResult = await pool.query(`
          SELECT id FROM sp_v2_chargebacks
          WHERE network_case_id = $1
        `, [case_id]);

        if (existingResult.rows.length > 0) {
          console.log('[Chargeback Ingestion] Duplicate detected:', case_id);
          return res.json({ success: true, message: 'Duplicate chargeback ignored', id: existingResult.rows[0].id });
        }

        // Insert chargeback
        const chargebackId = uuidv4();
        const caseRef = `${req.body.card_network || 'NETWORK'}-${new Date().getFullYear()}-${case_id}`;

        await pool.query(`
          INSERT INTO sp_v2_chargebacks (
            id, merchant_id, merchant_name, acquirer, network_case_id, case_ref,
            txn_ref, rrn, original_gross_paise, chargeback_paise, fees_paise,
            reason_code, reason_description, stage, status, outcome,
            received_at, evidence_due_at, deadline_at, source_system, created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
          )
        `, [
          chargebackId,
          merchant_acquirer_id,
          req.body.merchant_name || 'Unknown Merchant',
          req.body.acquirer || 'UNKNOWN',
          case_id,
          caseRef,
          transaction.rrn || transaction.reference_number || 'UNKNOWN',
          transaction.rrn,
          transaction.amount * 100, // Convert to paise
          transaction.amount * 100,
          5000, // Default fee
          dispute.reason_code,
          dispute.reason_text,
          'NEW',
          'OPEN',
          'PENDING',
          new Date(),
          dispute.response_due_date ? new Date(dispute.response_due_date) : null,
          dispute.response_due_date ? new Date(dispute.response_due_date) : null,
          'WEBHOOK',
          'SYSTEM'
        ]);

        // Create audit entry
        await pool.query(`
          INSERT INTO sp_v2_chargeback_audit (
            chargeback_id, action, after_value, performed_by, role
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          chargebackId,
          'CREATE',
          JSON.stringify({ source: 'WEBHOOK', case_id: case_id }),
          'SYSTEM',
          'INGESTION'
        ]);

        console.log('[Chargeback Ingestion] Created chargeback:', chargebackId);

        res.json({ success: true, id: chargebackId, message: 'Chargeback created' });

      } else if (event_type === 'chargeback.resolved') {
        // Update existing chargeback with decision
        const outcomeMap = {
          'merchant_won': 'WON',
          'merchant_lost': 'LOST',
          'partial': 'PARTIAL'
        };

        await pool.query(`
          UPDATE sp_v2_chargebacks
          SET stage = 'CLOSED',
              outcome = $1,
              status = $2,
              closed_at = NOW(),
              updated_at = NOW()
          WHERE network_case_id = $3
        `, [
          outcomeMap[req.body.outcome] || 'PENDING',
          outcomeMap[req.body.outcome] === 'WON' ? 'RECOVERED' : 'WRITEOFF',
          case_id
        ]);

        console.log('[Chargeback Ingestion] Updated chargeback decision:', case_id);

        res.json({ success: true, message: 'Chargeback updated with decision' });
      } else {
        res.json({ success: true, message: 'Event type not handled' });
      }

    } catch (error) {
      console.error('[Chargeback Ingestion] Error:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  // POST /api/chargebacks/ingest/csv - Bulk CSV upload
  router.post('/csv', async (req, res) => {
    const { csv_content, acquirer, source_name } = req.body;

    console.log('[Chargeback Ingestion] CSV upload received from:', acquirer);

    try {
      // Parse CSV
      const parsed = Papa.parse(csv_content, {
        header: true,
        skipEmptyLines: true
      });

      if (parsed.errors.length > 0) {
        return res.status(400).json({ error: 'CSV parsing failed', details: parsed.errors });
      }

      const rows = parsed.data;
      let insertedCount = 0;
      let duplicateCount = 0;

      for (const row of rows) {
        // Check for duplicate
        const existingResult = await pool.query(`
          SELECT id FROM sp_v2_chargebacks
          WHERE acquirer = $1 AND network_case_id = $2
        `, [acquirer, row.CASE_REF || row.case_id]);

        if (existingResult.rows.length > 0) {
          duplicateCount++;
          continue;
        }

        // Insert chargeback
        const chargebackId = uuidv4();
        const amount = parseFloat(row.AMOUNT || row.amount || 0);

        await pool.query(`
          INSERT INTO sp_v2_chargebacks (
            id, merchant_id, merchant_name, acquirer, network_case_id, case_ref,
            txn_ref, rrn, utr, original_gross_paise, chargeback_paise, fees_paise,
            reason_code, reason_description, stage, status, outcome,
            received_at, evidence_due_at, source_system, created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
          )
        `, [
          chargebackId,
          row.MERCHANT_ID || row.merchant_id || 'UNKNOWN',
          row.MERCHANT_NAME || row.merchant_name || 'Unknown Merchant',
          acquirer,
          row.CASE_REF || row.case_id,
          row.CASE_REF || row.case_id,
          row.TXN_REF || row.transaction_ref || row.RRN || 'UNKNOWN',
          row.RRN || row.rrn,
          row.UTR || row.utr,
          Math.round(amount * 100),
          Math.round(amount * 100),
          5000,
          row.REASON_CODE || row.reason_code || 'UNKNOWN',
          row.REASON || row.reason || 'Not specified',
          'NEW',
          'OPEN',
          'PENDING',
          row.CB_DATE || row.chargeback_date ? new Date(row.CB_DATE || row.chargeback_date) : new Date(),
          row.DUE_DATE || row.due_date ? new Date(row.DUE_DATE || row.due_date) : null,
          'CSV_UPLOAD',
          'OPS_TEAM'
        ]);

        insertedCount++;
      }

      console.log(`[Chargeback Ingestion] CSV processed: ${insertedCount} inserted, ${duplicateCount} duplicates`);

      res.json({
        success: true,
        inserted: insertedCount,
        duplicates: duplicateCount,
        total: rows.length
      });

    } catch (error) {
      console.error('[Chargeback Ingestion] CSV Error:', error);
      res.status(500).json({ error: 'Failed to process CSV' });
    }
  });

  // POST /api/chargebacks/ingest/manual - Manual entry
  router.post('/manual', async (req, res) => {
    const {
      merchant_id,
      merchant_name,
      acquirer,
      network_case_id,
      txn_ref,
      amount_paise,
      reason_code,
      reason_description,
      evidence_due_date,
      created_by
    } = req.body;

    console.log('[Chargeback Ingestion] Manual entry:', network_case_id);

    try {
      const chargebackId = uuidv4();
      const caseRef = `${acquirer}-${new Date().getFullYear()}-${network_case_id}`;

      await pool.query(`
        INSERT INTO sp_v2_chargebacks (
          id, merchant_id, merchant_name, acquirer, network_case_id, case_ref,
          txn_ref, original_gross_paise, chargeback_paise, fees_paise,
          reason_code, reason_description, stage, status, outcome,
          received_at, evidence_due_at, deadline_at, source_system, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
      `, [
        chargebackId,
        merchant_id,
        merchant_name,
        acquirer,
        network_case_id,
        caseRef,
        txn_ref,
        amount_paise,
        amount_paise,
        5000,
        reason_code,
        reason_description,
        'NEW',
        'OPEN',
        'PENDING',
        new Date(),
        evidence_due_date ? new Date(evidence_due_date) : null,
        evidence_due_date ? new Date(evidence_due_date) : null,
        'MANUAL_ENTRY',
        created_by || 'OPS_TEAM'
      ]);

      // Create audit entry
      await pool.query(`
        INSERT INTO sp_v2_chargeback_audit (
          chargeback_id, action, after_value, performed_by, role
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        chargebackId,
        'CREATE',
        JSON.stringify({ source: 'MANUAL_ENTRY' }),
        created_by || 'OPS_TEAM',
        'OPS'
      ]);

      console.log('[Chargeback Ingestion] Manual chargeback created:', chargebackId);

      res.json({ success: true, id: chargebackId });

    } catch (error) {
      console.error('[Chargeback Ingestion] Manual entry error:', error);
      res.status(500).json({ error: 'Failed to create chargeback' });
    }
  });

  return router;
};
