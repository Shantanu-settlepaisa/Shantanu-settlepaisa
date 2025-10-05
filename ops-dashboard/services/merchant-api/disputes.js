const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const v2Pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const MERCHANT_ID = process.env.DEFAULT_MERCHANT_ID || 'MERCH001';

router.get('/disputes', async (req, res) => {
  console.log('[Disputes] GET /disputes - List disputes', { query: req.query });
  
  try {
    const {
      merchant_id = MERCHANT_ID,
      status,
      searchQuery,
      fromDate,
      toDate,
      limit = 25,
      offset = 0
    } = req.query;

    const conditions = ['d.merchant_id = $1'];
    const params = [merchant_id];
    let paramIndex = 2;

    if (status && status !== 'all') {
      const statuses = Array.isArray(status) ? status : [status];
      conditions.push(`d.status = ANY($${paramIndex}::text[])`);
      params.push(statuses.map(s => s.toUpperCase()));
      paramIndex++;
    }

    if (searchQuery && searchQuery.trim()) {
      params.push(`%${searchQuery.trim()}%`);
      conditions.push(`(
        d.dispute_id ILIKE $${paramIndex} OR 
        d.transaction_id ILIKE $${paramIndex} OR 
        d.case_number ILIKE $${paramIndex}
      )`);
      paramIndex++;
    }

    if (fromDate) {
      params.push(fromDate);
      conditions.push(`DATE(d.dispute_date) >= $${paramIndex}::date`);
      paramIndex++;
    }

    if (toDate) {
      params.push(toDate);
      conditions.push(`DATE(d.dispute_date) <= $${paramIndex}::date`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT
        d.dispute_id,
        d.case_number,
        d.transaction_id,
        d.dispute_type,
        d.dispute_reason,
        d.dispute_amount_paise,
        d.status,
        TO_CHAR(d.dispute_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dispute_date,
        TO_CHAR(d.due_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS due_date,
        TO_CHAR(d.resolution_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS resolution_date,
        d.resolution,
        d.card_network,
        d.arn,
        d.merchant_response,
        t.utr,
        t.rrn
      FROM sp_v2_disputes d
      LEFT JOIN sp_v2_transactions t ON d.transaction_id = t.transaction_id
      WHERE ${whereClause}
      ORDER BY d.dispute_date DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM sp_v2_disputes d 
      WHERE ${whereClause}
    `;

    const [disputes, count] = await Promise.all([
      v2Pool.query(query, params),
      v2Pool.query(countQuery, params.slice(0, -2))
    ]);

    const urgentCount = disputes.rows.filter(d => {
      if (!d.due_date || d.status !== 'UNDER_REVIEW') return false;
      const daysUntilDue = Math.ceil((new Date(d.due_date) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntilDue <= 2 && daysUntilDue >= 0;
    }).length;

    res.json({
      disputes: disputes.rows.map(d => ({
        id: d.dispute_id,
        caseRef: d.case_number || d.dispute_id,
        merchantId: merchant_id,
        txnId: d.transaction_id,
        utr: d.utr,
        rrn: d.rrn,
        reasonCode: d.dispute_reason?.split(' - ')[0] || '',
        reasonDesc: d.dispute_reason,
        disputedAmountPaise: d.dispute_amount_paise,
        currency: 'INR',
        status: d.status,
        openedAt: d.dispute_date,
        evidenceDueAt: d.due_date,
        resolvedAt: d.resolution_date,
        resolution: d.resolution,
        lastUpdateAt: d.resolution_date || d.dispute_date,
        canUploadEvidence: d.status === 'UNDER_REVIEW' && d.due_date && new Date(d.due_date) > new Date(),
        cardNetwork: d.card_network,
        arn: d.arn
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: parseInt(count.rows[0].total),
        hasNext: parseInt(offset) + parseInt(limit) < parseInt(count.rows[0].total)
      },
      summary: {
        total: parseInt(count.rows[0].total),
        urgent: urgentCount
      }
    });

  } catch (error) {
    console.error('[Disputes] Error fetching disputes:', error.message);
    res.status(500).json({ error: 'Failed to fetch disputes', details: error.message });
  }
});

router.get('/disputes/export', async (req, res) => {
  console.log('[Disputes] GET /disputes/export - Export disputes', { query: req.query });
  
  try {
    const {
      merchant_id = MERCHANT_ID,
      status,
      searchQuery,
      fromDate,
      toDate
    } = req.query;

    const conditions = ['d.merchant_id = $1'];
    const params = [merchant_id];
    let paramIndex = 2;

    if (status && status !== 'all') {
      const statuses = Array.isArray(status) ? status : [status];
      conditions.push(`d.status = ANY($${paramIndex}::text[])`);
      params.push(statuses.map(s => s.toUpperCase()));
      paramIndex++;
    }

    if (searchQuery && searchQuery.trim()) {
      params.push(`%${searchQuery.trim()}%`);
      conditions.push(`(
        d.dispute_id ILIKE $${paramIndex} OR 
        d.transaction_id ILIKE $${paramIndex} OR 
        d.case_number ILIKE $${paramIndex}
      )`);
      paramIndex++;
    }

    if (fromDate) {
      params.push(fromDate);
      conditions.push(`DATE(d.dispute_date) >= $${paramIndex}::date`);
      paramIndex++;
    }

    if (toDate) {
      params.push(toDate);
      conditions.push(`DATE(d.dispute_date) <= $${paramIndex}::date`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT
        d.dispute_id,
        d.case_number,
        d.transaction_id,
        t.utr,
        t.rrn,
        d.dispute_type,
        d.dispute_reason,
        d.dispute_amount_paise / 100.0 AS dispute_amount_inr,
        d.status,
        TO_CHAR(d.dispute_date, 'YYYY-MM-DD HH24:MI:SS') AS dispute_date,
        TO_CHAR(d.due_date, 'YYYY-MM-DD HH24:MI:SS') AS due_date,
        TO_CHAR(d.resolution_date, 'YYYY-MM-DD HH24:MI:SS') AS resolution_date,
        d.resolution,
        d.resolution_amount_paise / 100.0 AS resolution_amount_inr,
        d.card_network,
        d.arn
      FROM sp_v2_disputes d
      LEFT JOIN sp_v2_transactions t ON d.transaction_id = t.transaction_id
      WHERE ${whereClause}
      ORDER BY d.dispute_date DESC
    `;

    const result = await v2Pool.query(query, params);

    const headers = [
      'Dispute_ID', 'Case_Number', 'Transaction_ID', 'UTR', 'RRN',
      'Type', 'Reason', 'Amount_INR', 'Status', 
      'Dispute_Date', 'Due_Date', 'Resolution_Date',
      'Resolution', 'Resolution_Amount_INR', 'Card_Network', 'ARN'
    ];

    const csvRows = result.rows.map(row => [
      row.dispute_id,
      row.case_number || '',
      row.transaction_id,
      row.utr || '',
      row.rrn || '',
      row.dispute_type,
      row.dispute_reason,
      row.dispute_amount_inr,
      row.status,
      row.dispute_date,
      row.due_date || '',
      row.resolution_date || '',
      row.resolution || '',
      row.resolution_amount_inr || '',
      row.card_network || '',
      row.arn || ''
    ].map(val => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="disputes_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);

  } catch (error) {
    console.error('[Disputes] Error exporting disputes:', error.message);
    res.status(500).json({ error: 'Failed to export disputes', details: error.message });
  }
});

router.post('/disputes/ingest', async (req, res) => {
  console.log('[Disputes] POST /disputes/ingest - Ingest dispute from payment gateway', { body: req.body });
  
  try {
    const {
      source,
      merchantId,
      payload,
      idempotencyKey
    } = req.body;

    if (!source || !payload) {
      return res.status(400).json({ error: 'source and payload are required' });
    }

    const {
      networkCaseId,
      txnRef,
      originalAmount,
      chargebackAmount,
      fees,
      reasonCode,
      receivedAt,
      deadline
    } = payload;

    if (!txnRef || !chargebackAmount || !reasonCode) {
      return res.status(400).json({ 
        error: 'payload must contain: txnRef, chargebackAmount, reasonCode' 
      });
    }

    const finalMerchantId = merchantId || MERCHANT_ID;
    const client = await v2Pool.connect();

    try {
      await client.query('BEGIN');

      const disputedAmountPaise = Math.round(parseFloat(chargebackAmount) * 100);
      const originalAmountPaise = originalAmount ? Math.round(parseFloat(originalAmount) * 100) : null;
      const feesPaise = fees ? Math.round(parseFloat(fees) * 100) : 0;

      const disputeId = `DIS-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      const insertQuery = `
        INSERT INTO sp_v2_disputes (
          dispute_id,
          merchant_id,
          transaction_id,
          case_number,
          dispute_amount_paise,
          dispute_type,
          dispute_reason,
          dispute_date,
          due_date,
          status,
          merchant_response,
          merchant_evidence,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
        )
        RETURNING *
      `;

      const insertValues = [
        disputeId,
        finalMerchantId,
        txnRef,
        networkCaseId || null,
        disputedAmountPaise,
        'CHARGEBACK',
        reasonCode,
        receivedAt ? new Date(receivedAt) : new Date(),
        deadline ? new Date(deadline) : null,
        'UNDER_REVIEW',
        null,
        JSON.stringify({
          source,
          originalAmountPaise,
          feesPaise,
          idempotencyKey,
          ingestedAt: new Date().toISOString()
        })
      ];

      const result = await client.query(insertQuery, insertValues);

      await client.query('COMMIT');

      const dispute = result.rows[0];

      res.status(201).json({
        success: true,
        dispute: {
          disputeId: dispute.dispute_id,
          merchantId: dispute.merchant_id,
          transactionId: dispute.transaction_id,
          caseNumber: dispute.case_number,
          disputeAmountPaise: dispute.dispute_amount_paise.toString(),
          disputeType: dispute.dispute_type,
          status: dispute.status,
          reason: dispute.dispute_reason,
          disputeDate: dispute.dispute_date,
          dueDate: dispute.due_date
        }
      });

    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('[Disputes] Error ingesting dispute:', error.message);
    res.status(500).json({ error: 'Failed to ingest dispute', details: error.message });
  }
});

router.get('/disputes/:disputeId', async (req, res) => {
  console.log('[Disputes] GET /disputes/:disputeId - Get dispute details', { disputeId: req.params.disputeId });
  
  try {
    const { disputeId } = req.params;
    const merchantId = req.query.merchant_id || MERCHANT_ID;

    const query = `
      SELECT
        d.*,
        t.transaction_timestamp,
        t.amount_paise as transaction_amount_paise,
        t.utr,
        t.rrn,
        t.payment_method,
        t.acquirer_code
      FROM sp_v2_disputes d
      LEFT JOIN sp_v2_transactions t ON d.transaction_id = t.transaction_id
      WHERE d.dispute_id = $1 AND d.merchant_id = $2
    `;

    const result = await v2Pool.query(query, [disputeId, merchantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const dispute = result.rows[0];

    res.json({
      id: dispute.dispute_id,
      caseRef: dispute.case_number || dispute.dispute_id,
      merchantId: dispute.merchant_id,
      txnId: dispute.transaction_id,
      utr: dispute.utr,
      rrn: dispute.rrn,
      reasonCode: dispute.dispute_reason?.split(' - ')[0] || '',
      reasonDesc: dispute.dispute_reason,
      disputedAmountPaise: dispute.dispute_amount_paise,
      currency: 'INR',
      status: dispute.status,
      disputeType: dispute.dispute_type,
      openedAt: dispute.dispute_date,
      evidenceDueAt: dispute.due_date,
      resolvedAt: dispute.resolution_date,
      resolution: dispute.resolution,
      resolutionAmountPaise: dispute.resolution_amount_paise,
      cardNetwork: dispute.card_network,
      arn: dispute.arn,
      merchantResponse: dispute.merchant_response,
      merchantEvidence: dispute.merchant_evidence || {},
      canUploadEvidence: dispute.status === 'UNDER_REVIEW' && dispute.due_date && new Date(dispute.due_date) > new Date(),
      transaction: {
        id: dispute.transaction_id,
        timestamp: dispute.transaction_timestamp,
        amountPaise: dispute.transaction_amount_paise,
        paymentMethod: dispute.payment_method,
        acquirerCode: dispute.acquirer_code
      }
    });

  } catch (error) {
    console.error('[Disputes] Error fetching dispute details:', error.message);
    res.status(500).json({ error: 'Failed to fetch dispute details', details: error.message });
  }
});

router.post('/disputes/:disputeId/evidence', async (req, res) => {
  console.log('[Disputes] POST /disputes/:disputeId/evidence - Upload evidence', { 
    disputeId: req.params.disputeId,
    body: req.body 
  });
  
  try {
    const { disputeId } = req.params;
    const { response, evidence } = req.body;
    const merchantId = req.query.merchant_id || MERCHANT_ID;

    const checkQuery = `
      SELECT status, due_date 
      FROM sp_v2_disputes 
      WHERE dispute_id = $1 AND merchant_id = $2
    `;
    
    const check = await v2Pool.query(checkQuery, [disputeId, merchantId]);

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const dispute = check.rows[0];

    if (dispute.status !== 'UNDER_REVIEW') {
      return res.status(400).json({ error: 'Cannot upload evidence for this dispute status' });
    }

    if (dispute.due_date && new Date(dispute.due_date) < new Date()) {
      return res.status(400).json({ error: 'Evidence submission deadline has passed' });
    }

    const updateQuery = `
      UPDATE sp_v2_disputes
      SET 
        merchant_response = $1,
        merchant_evidence = $2,
        status = 'SUBMITTED',
        updated_at = NOW()
      WHERE dispute_id = $3 AND merchant_id = $4
      RETURNING *
    `;

    const result = await v2Pool.query(updateQuery, [
      response,
      JSON.stringify(evidence),
      disputeId,
      merchantId
    ]);

    res.json({
      success: true,
      message: 'Evidence submitted successfully',
      dispute: {
        id: result.rows[0].dispute_id,
        status: result.rows[0].status
      }
    });

  } catch (error) {
    console.error('[Disputes] Error uploading evidence:', error.message);
    res.status(500).json({ error: 'Failed to upload evidence', details: error.message });
  }
});

module.exports = router;
