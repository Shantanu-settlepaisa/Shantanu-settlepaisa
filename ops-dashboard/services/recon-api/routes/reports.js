const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

router.get('/settlement-summary', async (req, res) => {
  try {
    const { cycleDate, fromDate, toDate, acquirer, merchantId } = req.query;
    
    let query = `
      SELECT 
        sb.cycle_date::date as "cycleDate",
        COALESCE(ew.acquirer_code, 'UNKNOWN') as acquirer,
        sb.merchant_id as "merchantId",
        sb.merchant_name as "merchantName",
        sb.gross_amount_paise / 100.0 as "grossAmountRupees",
        sb.total_commission_paise / 100.0 as "feesRupees",
        sb.total_gst_paise / 100.0 as "gstRupees",
        0 as "tdsRupees",
        sb.net_amount_paise / 100.0 as "netAmountRupees",
        sb.total_transactions as "transactionCount",
        sb.status,
        sb.bank_reference_number as "bankRef"
      FROM sp_v2_settlement_batches sb
      LEFT JOIN (
        SELECT DISTINCT merchant_id, acquirer_code 
        FROM sp_v2_exception_workflow
        WHERE acquirer_code IS NOT NULL
      ) ew ON sb.merchant_id = ew.merchant_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (cycleDate) {
      query += ` AND sb.cycle_date = $${paramIndex}`;
      params.push(cycleDate);
      paramIndex++;
    }
    
    if (fromDate) {
      query += ` AND sb.cycle_date >= $${paramIndex}`;
      params.push(fromDate);
      paramIndex++;
    }
    
    if (toDate) {
      query += ` AND sb.cycle_date <= $${paramIndex}`;
      params.push(toDate);
      paramIndex++;
    }
    
    if (acquirer && acquirer !== 'all') {
      query += ` AND ew.acquirer_code = $${paramIndex}`;
      params.push(acquirer);
      paramIndex++;
    }
    
    if (merchantId) {
      query += ` AND sb.merchant_id = $${paramIndex}`;
      params.push(merchantId);
      paramIndex++;
    }
    
    query += ` ORDER BY sb.cycle_date DESC, sb.merchant_id`;
    
    const result = await pool.query(query, params);
    
    res.json({
      data: result.rows,
      rowCount: result.rows.length
    });
  } catch (error) {
    console.error('Settlement summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/bank-mis', async (req, res) => {
  try {
    const { cycleDate, fromDate, toDate, acquirer, merchantId } = req.query;
    
    let query = `
      SELECT 
        t.transaction_id as "txnId",
        t.utr,
        t.amount_paise / 100.0 as "pgAmountRupees",
        t.amount_paise / 100.0 as "bankAmountRupees",
        0 as "deltaRupees",
        t.transaction_date::date as "pgDate",
        t.transaction_date::date as "bankDate",
        t.status as "reconStatus",
        'UNKNOWN' as acquirer,
        t.merchant_id as "merchantId",
        m.merchant_name as "merchantName",
        t.payment_method as "paymentMethod"
      FROM sp_v2_transactions t
      LEFT JOIN (
        SELECT DISTINCT merchant_id, merchant_name 
        FROM sp_v2_settlement_batches
      ) m ON t.merchant_id = m.merchant_id
      WHERE t.source_type = 'PG_TRANSACTION'
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (cycleDate) {
      query += ` AND t.transaction_date::date = $${paramIndex}`;
      params.push(cycleDate);
      paramIndex++;
    }
    
    if (fromDate) {
      query += ` AND t.transaction_date::date >= $${paramIndex}`;
      params.push(fromDate);
      paramIndex++;
    }
    
    if (toDate) {
      query += ` AND t.transaction_date::date <= $${paramIndex}`;
      params.push(toDate);
      paramIndex++;
    }
    
    if (merchantId) {
      query += ` AND t.merchant_id = $${paramIndex}`;
      params.push(merchantId);
      paramIndex++;
    }
    
    query += ` ORDER BY t.transaction_date DESC LIMIT 1000`;
    
    const result = await pool.query(query, params);
    
    res.json({
      data: result.rows,
      rowCount: result.rows.length
    });
  } catch (error) {
    console.error('Bank MIS error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/recon-outcome', async (req, res) => {
  try {
    const { cycleDate, fromDate, toDate, acquirer, merchantId } = req.query;
    
    let query = `
      SELECT 
        t.transaction_id as "txnId",
        t.transaction_id as "pgRefId",
        t.utr as "bankRefId",
        t.amount_paise / 100.0 as "amountRupees",
        t.status,
        t.exception_reason as "exceptionType",
        t.merchant_id as "merchantId",
        m.merchant_name as "merchantName",
        'UNKNOWN' as acquirer,
        t.payment_method as "paymentMethod",
        t.transaction_date::date as "transactionDate"
      FROM sp_v2_transactions t
      LEFT JOIN (
        SELECT DISTINCT merchant_id, merchant_name 
        FROM sp_v2_settlement_batches
      ) m ON t.merchant_id = m.merchant_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (cycleDate) {
      query += ` AND t.transaction_date::date = $${paramIndex}`;
      params.push(cycleDate);
      paramIndex++;
    }
    
    if (fromDate) {
      query += ` AND t.transaction_date::date >= $${paramIndex}`;
      params.push(fromDate);
      paramIndex++;
    }
    
    if (toDate) {
      query += ` AND t.transaction_date::date <= $${paramIndex}`;
      params.push(toDate);
      paramIndex++;
    }
    
    if (merchantId) {
      query += ` AND t.merchant_id = $${paramIndex}`;
      params.push(merchantId);
      paramIndex++;
    }
    
    query += ` ORDER BY t.transaction_date DESC LIMIT 1000`;
    
    const result = await pool.query(query, params);
    
    res.json({
      data: result.rows,
      rowCount: result.rows.length
    });
  } catch (error) {
    console.error('Recon outcome error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/tax-report', async (req, res) => {
  try {
    const { cycleDate, fromDate, toDate, acquirer, merchantId } = req.query;
    
    let query = `
      SELECT 
        sb.cycle_date::date as "cycleDate",
        sb.merchant_id as "merchantId",
        sb.merchant_name as "merchantName",
        sb.gross_amount_paise / 100.0 as "grossAmountRupees",
        sb.total_commission_paise / 100.0 as "commissionRupees",
        18.0 as "gstRatePct",
        sb.total_gst_paise / 100.0 as "gstAmountRupees",
        0 as "tdsRatePct",
        0 as "tdsAmountRupees",
        'INV-' || sb.merchant_id || '-' || TO_CHAR(sb.cycle_date, 'YYYYMMDD') as "invoiceNumber"
      FROM sp_v2_settlement_batches sb
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (cycleDate) {
      query += ` AND sb.cycle_date = $${paramIndex}`;
      params.push(cycleDate);
      paramIndex++;
    }
    
    if (fromDate) {
      query += ` AND sb.cycle_date >= $${paramIndex}`;
      params.push(fromDate);
      paramIndex++;
    }
    
    if (toDate) {
      query += ` AND sb.cycle_date <= $${paramIndex}`;
      params.push(toDate);
      paramIndex++;
    }
    
    if (merchantId) {
      query += ` AND sb.merchant_id = $${paramIndex}`;
      params.push(merchantId);
      paramIndex++;
    }
    
    query += ` ORDER BY sb.cycle_date DESC, sb.merchant_id`;
    
    const result = await pool.query(query, params);
    
    res.json({
      data: result.rows,
      rowCount: result.rows.length
    });
  } catch (error) {
    console.error('Tax report error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
