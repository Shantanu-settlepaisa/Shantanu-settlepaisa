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

// Get all exceptions with filtering
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      severity, 
      merchantId, 
      dateFrom, 
      dateTo,
      limit = 50,
      offset = 0 
    } = req.query;

    let query = `
      SELECT 
        t.id,
        t.transaction_id,
        t.merchant_id,
        t.amount_paise,
        t.transaction_date,
        t.utr,
        t.rrn,
        t.payment_method,
        t.status,
        t.created_at,
        t.updated_at
      FROM sp_v2_transactions t
      WHERE t.status = 'EXCEPTION'
    `;

    const params = [];
    let paramIndex = 1;

    if (merchantId) {
      query += ` AND t.merchant_id = $${paramIndex}`;
      params.push(merchantId);
      paramIndex++;
    }

    if (dateFrom) {
      query += ` AND t.transaction_date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      query += ` AND t.transaction_date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
      ${merchantId ? `AND merchant_id = '${merchantId}'` : ''}
    `;
    const countResult = await pool.query(countQuery);

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('[Exceptions API] Error fetching exceptions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single exception details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        t.*,
        bs.bank_ref,
        bs.bank_name,
        bs.amount_paise as bank_amount_paise,
        bs.remarks as bank_remarks
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_bank_statements bs ON t.utr = bs.utr
      WHERE t.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[Exceptions API] Error fetching exception:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Resolve exception (mark as RECONCILED)
router.post('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedBy, resolution, notes } = req.body;

    console.log(`[Exceptions API] Resolving exception ${id} by ${resolvedBy}`);

    // Update transaction status from EXCEPTION to RECONCILED
    const result = await pool.query(`
      UPDATE sp_v2_transactions
      SET 
        status = 'RECONCILED',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Exception not found'
      });
    }

    console.log(`[Exceptions API] Exception ${id} resolved successfully`);

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

// Manual match - link PG transaction with bank statement
router.post('/manual-match', async (req, res) => {
  try {
    const { pgTransactionId, bankStatementId, matchedBy } = req.body;

    console.log(`[Exceptions API] Manual match: PG ${pgTransactionId} <-> Bank ${bankStatementId}`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Update PG transaction status
      await client.query(`
        UPDATE sp_v2_transactions
        SET status = 'RECONCILED', updated_at = NOW()
        WHERE id = $1
      `, [pgTransactionId]);

      // Mark bank statement as processed
      await client.query(`
        UPDATE sp_v2_bank_statements
        SET processed = true, updated_at = NOW()
        WHERE id = $1
      `, [bankStatementId]);

      // Create match record
      await client.query(`
        INSERT INTO sp_v2_recon_matches (
          item_id,
          utr_id,
          match_type,
          matched_by,
          match_score,
          amount_difference_paise
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        pgTransactionId,
        bankStatementId,
        'MANUAL',
        matchedBy || 'MANUAL_USER',
        100,
        0
      ]);

      await client.query('COMMIT');

      console.log(`[Exceptions API] Manual match created successfully`);

      res.json({
        success: true,
        message: 'Manual match created successfully'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('[Exceptions API] Error creating manual match:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk resolve exceptions
router.post('/bulk-resolve', async (req, res) => {
  try {
    const { exceptionIds, resolvedBy } = req.body;

    console.log(`[Exceptions API] Bulk resolving ${exceptionIds.length} exceptions`);

    const result = await pool.query(`
      UPDATE sp_v2_transactions
      SET 
        status = 'RECONCILED',
        updated_at = NOW()
      WHERE id = ANY($1)
      RETURNING id
    `, [exceptionIds]);

    console.log(`[Exceptions API] Bulk resolved ${result.rows.length} exceptions`);

    res.json({
      success: true,
      resolved: result.rows.length,
      message: `${result.rows.length} exceptions resolved successfully`
    });

  } catch (error) {
    console.error('[Exceptions API] Error bulk resolving:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
