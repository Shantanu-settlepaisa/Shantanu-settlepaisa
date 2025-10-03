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
        COALESCE(sb.acquirer_code, 'UNKNOWN') as acquirer,
        sb.merchant_id as "merchantId",
        sb.merchant_name as "merchantName",
        ROUND(sb.gross_amount_paise / 100.0, 2) as "grossAmountRupees",
        ROUND(sb.total_commission_paise / 100.0, 2) as "totalFeesRupees",
        ROUND(sb.total_gst_paise / 100.0, 2) as "gstRupees",
        ROUND((sb.total_commission_paise + sb.total_gst_paise) / 100.0, 2) as "totalPgChargesRupees",
        ROUND(sb.total_reserve_paise / 100.0, 2) as "rollingReserveRupees",
        0 as "tdsRupees",
        ROUND(sb.net_amount_paise / 100.0, 2) as "netAmountRupees",
        ROUND((sb.gross_amount_paise - sb.total_commission_paise - sb.total_gst_paise) / 100.0, 2) as "amountBeforeReserveRupees",
        sb.total_transactions as "transactionCount",
        sb.status,
        sb.bank_reference_number as "bankRef",
        sb.id as "batchId"
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
    
    if (acquirer && acquirer !== 'all') {
      query += ` AND sb.acquirer_code = $${paramIndex}`;
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

router.get('/settlement-transactions', async (req, res) => {
  try {
    const { cycleDate, fromDate, toDate, merchantId, batchId } = req.query;
    
    let query = `
      SELECT 
        si.transaction_id as "txnId",
        sb.cycle_date::date as "cycleDate",
        sb.merchant_id as "merchantId",
        sb.merchant_name as "merchantName",
        COALESCE(sb.acquirer_code, 'UNKNOWN') as acquirer,
        si.payment_mode as "paymentMode",
        ROUND(si.amount_paise / 100.0, 2) as "grossAmountRupees",
        ROUND(si.commission_paise / 100.0, 2) as "mdrFeesRupees",
        ROUND(si.gst_paise / 100.0, 2) as "gstRupees",
        ROUND((si.commission_paise + si.gst_paise) / 100.0, 2) as "totalPgChargesRupees",
        ROUND(si.reserve_paise / 100.0, 2) as "rollingReserveRupees",
        ROUND(si.net_paise / 100.0, 2) as "netSettlementRupees",
        ROUND((si.amount_paise - si.commission_paise - si.gst_paise) / 100.0, 2) as "amountBeforeReserveRupees",
        si.fee_bearer as "feeBearer",
        sb.status as "batchStatus",
        sb.id as "batchId",
        sb.bank_reference_number as "bankRef",
        t.utr,
        t.status as "reconStatus"
      FROM sp_v2_settlement_items si
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      LEFT JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
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
    
    if (batchId) {
      query += ` AND sb.id = $${paramIndex}`;
      params.push(batchId);
      paramIndex++;
    }
    
    query += ` ORDER BY sb.cycle_date DESC, si.transaction_id LIMIT 1000`;
    
    const result = await pool.query(query, params);
    
    res.json({
      data: result.rows,
      rowCount: result.rows.length
    });
  } catch (error) {
    console.error('Settlement transactions error:', error);
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
        ROUND(t.amount_paise / 100.0, 2) as "pgAmountRupees",
        ROUND(t.amount_paise / 100.0, 2) as "bankAmountRupees",
        0 as "deltaRupees",
        t.transaction_date::date as "pgDate",
        t.transaction_date::date as "bankDate",
        t.status as "reconStatus",
        COALESCE(t.acquirer_code, 'UNKNOWN') as acquirer,
        t.merchant_id as "merchantId",
        COALESCE(t.merchant_name, 'Unknown Merchant') as "merchantName",
        t.payment_method as "paymentMethod"
      FROM sp_v2_transactions t
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
        ROUND(t.amount_paise / 100.0, 2) as "amountRupees",
        t.status,
        t.exception_reason as "exceptionType",
        t.merchant_id as "merchantId",
        COALESCE(t.merchant_name, 'Unknown Merchant') as "merchantName",
        COALESCE(t.acquirer_code, 'UNKNOWN') as acquirer,
        t.payment_method as "paymentMethod",
        t.transaction_date::date as "transactionDate"
      FROM sp_v2_transactions t
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
        ROUND(sb.gross_amount_paise / 100.0, 2) as "grossAmountRupees",
        ROUND(sb.total_commission_paise / 100.0, 2) as "commissionRupees",
        18.0 as "gstRatePct",
        ROUND(sb.total_gst_paise / 100.0, 2) as "gstAmountRupees",
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
