const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const v2Pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

const MERCHANT_ID = process.env.DEFAULT_MERCHANT_ID || 'MERCH001';

async function generateReportData(reportType, dateFrom, dateTo, merchantId) {
  let query, params;
  
  switch (reportType) {
    case 'TRANSACTION':
      query = `
        SELECT
          t.transaction_id,
          TO_CHAR(t.transaction_timestamp, 'YYYY-MM-DD HH24:MI:SS') AS transaction_date,
          t.amount_paise / 100.0 AS amount_inr,
          t.status,
          t.payment_method,
          COALESCE(t.settlement_batch_id::TEXT, 'Pending') AS settlement_id,
          t.utr,
          t.rrn,
          t.acquirer_code AS bank,
          t.gateway_ref,
          t.merchant_name
        FROM sp_v2_transactions t
        WHERE t.merchant_id = $1
          AND DATE(t.transaction_timestamp) BETWEEN $2 AND $3
        ORDER BY t.transaction_timestamp DESC
      `;
      params = [merchantId, dateFrom, dateTo];
      break;
      
    case 'SETTLEMENT':
      query = `
        SELECT
          b.id AS settlement_id,
          TO_CHAR(b.cycle_date, 'YYYY-MM-DD') AS settlement_date,
          b.gross_amount_paise / 100.0 AS gross_amount_inr,
          b.total_commission_paise / 100.0 AS fees_inr,
          b.total_gst_paise / 100.0 AS tax_inr,
          b.net_amount_paise / 100.0 AS net_amount_inr,
          b.bank_reference_number AS utr,
          b.status,
          b.total_transactions AS transaction_count,
          TO_CHAR(b.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
          TO_CHAR(b.settled_at, 'YYYY-MM-DD HH24:MI:SS') AS settled_at
        FROM sp_v2_settlement_batches b
        WHERE b.merchant_id = $1
          AND b.cycle_date BETWEEN $2 AND $3
        ORDER BY b.cycle_date DESC
      `;
      params = [merchantId, dateFrom, dateTo];
      break;
      
    case 'DISPUTE':
      query = `
        SELECT
          d.dispute_id,
          d.transaction_id,
          d.dispute_amount_paise / 100.0 AS amount_inr,
          d.dispute_reason AS reason,
          d.status,
          TO_CHAR(d.dispute_date, 'YYYY-MM-DD') AS created_date,
          COALESCE(d.resolution, 'Pending') AS resolution,
          d.dispute_type,
          d.card_network,
          d.case_number,
          TO_CHAR(d.resolution_date, 'YYYY-MM-DD') AS resolution_date
        FROM sp_v2_disputes d
        WHERE d.merchant_id = $1
          AND DATE(d.dispute_date) BETWEEN $2 AND $3
        ORDER BY d.dispute_date DESC
      `;
      params = [merchantId, dateFrom, dateTo];
      break;
      
    case 'TAX':
      query = `
        SELECT
          TO_CHAR(b.cycle_date, 'YYYY-MM') AS invoice_month,
          b.id AS invoice_no,
          TO_CHAR(b.cycle_date, 'YYYY-MM-DD') AS date,
          b.gross_amount_paise / 100.0 AS taxable_amount,
          (b.total_gst_paise * 0.5) / 100.0 AS cgst,
          (b.total_gst_paise * 0.5) / 100.0 AS sgst,
          0.00 AS igst,
          b.total_gst_paise / 100.0 AS total_tax,
          (b.gross_amount_paise + b.total_gst_paise) / 100.0 AS total_amount
        FROM sp_v2_settlement_batches b
        WHERE b.merchant_id = $1
          AND b.cycle_date BETWEEN $2 AND $3
          AND b.status != 'CANCELLED'
        ORDER BY b.cycle_date DESC
      `;
      params = [merchantId, dateFrom, dateTo];
      break;
      
    case 'INVOICE':
      query = `
        SELECT
          b.id AS invoice_no,
          TO_CHAR(b.cycle_date, 'YYYY-MM-DD') AS date,
          'Settlement Processing Fee' AS description,
          b.total_transactions AS quantity,
          (b.total_commission_paise / b.total_transactions / 100.0) AS rate_inr,
          b.total_commission_paise / 100.0 AS amount_inr,
          b.total_gst_paise / 100.0 AS tax_inr,
          (b.total_commission_paise + b.total_gst_paise) / 100.0 AS total_inr
        FROM sp_v2_settlement_batches b
        WHERE b.merchant_id = $1
          AND b.cycle_date BETWEEN $2 AND $3
          AND b.status != 'CANCELLED'
        ORDER BY b.cycle_date DESC
      `;
      params = [merchantId, dateFrom, dateTo];
      break;
      
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
  
  const result = await v2Pool.query(query, params);
  return result.rows;
}

function formatCSV(data, headers) {
  if (!data || data.length === 0) return '';
  
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header.toLowerCase().replace(/ /g, '_')];
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

function getReportHeaders(reportType) {
  const headerMap = {
    TRANSACTION: ['Transaction_ID', 'Date', 'Amount_INR', 'Status', 'Payment_Method', 'Settlement_ID', 'UTR', 'RRN', 'Bank', 'Gateway_Ref', 'Merchant_Name'],
    SETTLEMENT: ['Settlement_ID', 'Date', 'Gross_Amount_INR', 'Fees_INR', 'Tax_INR', 'Net_Amount_INR', 'UTR', 'Status', 'Transaction_Count', 'Created_At', 'Settled_At'],
    DISPUTE: ['Dispute_ID', 'Transaction_ID', 'Amount_INR', 'Reason', 'Status', 'Created_Date', 'Resolution', 'Dispute_Type', 'Card_Network', 'Case_Number', 'Resolution_Date'],
    TAX: ['Invoice_Month', 'Invoice_No', 'Date', 'Taxable_Amount', 'CGST', 'SGST', 'IGST', 'Total_Tax', 'Total_Amount'],
    INVOICE: ['Invoice_No', 'Date', 'Description', 'Quantity', 'Rate_INR', 'Amount_INR', 'Tax_INR', 'Total_INR']
  };
  return headerMap[reportType] || [];
}

// Stats endpoint must come before :reportId
router.get('/reports/stats', async (req, res) => {
  console.log('[Reports] GET /reports/stats - Get report statistics', { query: req.query });
  
  try {
    const merchantId = req.query.merchant_id || MERCHANT_ID;
    
    const statsResult = await v2Pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE generated_at >= DATE_TRUNC('month', CURRENT_DATE)) AS reports_this_month,
        COUNT(*) FILTER (WHERE status = 'READY' AND generated_at >= NOW() - INTERVAL '2 hours') AS recent_reports,
        SUM(downloaded_count) AS total_downloads
      FROM sp_v2_report_metadata
      WHERE merchant_id = $1
    `, [merchantId]);
    
    const scheduledResult = await v2Pool.query(`
      SELECT COUNT(*) AS active_scheduled
      FROM sp_v2_scheduled_reports
      WHERE merchant_id = $1 AND is_active = TRUE
    `, [merchantId]);
    
    const recipientsResult = await v2Pool.query(`
      SELECT COUNT(*) AS total_recipients
      FROM sp_v2_report_recipients
      WHERE merchant_id = $1 AND is_active = TRUE
    `, [merchantId]);
    
    const lastReportResult = await v2Pool.query(`
      SELECT
        report_name,
        TO_CHAR(generated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS generated_at
      FROM sp_v2_report_metadata
      WHERE merchant_id = $1 AND status = 'READY'
      ORDER BY generated_at DESC
      LIMIT 1
    `, [merchantId]);
    
    res.json({
      reportsGenerated: parseInt(statsResult.rows[0].reports_this_month) || 0,
      scheduledReports: parseInt(scheduledResult.rows[0].active_scheduled) || 0,
      emailRecipients: parseInt(recipientsResult.rows[0].total_recipients) || 0,
      lastGenerated: lastReportResult.rows[0] || null
    });
    
  } catch (error) {
    console.error('[Reports] Error fetching stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch statistics', details: error.message });
  }
});

// Scheduled reports must come before :reportId
router.get('/reports/scheduled', async (req, res) => {
  console.log('[Reports] GET /reports/scheduled - List scheduled reports', { query: req.query });
  
  try {
    const merchantId = req.query.merchant_id || MERCHANT_ID;
    
    const result = await v2Pool.query(`
      SELECT
        schedule_id AS id,
        report_name AS "reportType",
        frequency || ' at ' || TO_CHAR(time_ist, 'HH12:MI AM') AS schedule,
        format,
        delivery_method AS delivery,
        array_to_string(email_recipients, ', ') AS recipients,
        TO_CHAR(last_run_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastRun",
        TO_CHAR(next_run_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "nextRun",
        CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status
      FROM sp_v2_scheduled_reports
      WHERE merchant_id = $1
      ORDER BY next_run_at ASC
    `, [merchantId]);
    
    res.json({
      scheduledReports: result.rows
    });
    
  } catch (error) {
    console.error('[Reports] Error listing scheduled reports:', error.message);
    res.status(500).json({ error: 'Failed to fetch scheduled reports', details: error.message });
  }
});

router.get('/reports', async (req, res) => {
  console.log('[Reports] GET /reports - List available reports', { query: req.query });
  
  try {
    const merchantId = req.query.merchant_id || MERCHANT_ID;
    const reportType = req.query.report_type;
    const limit = parseInt(req.query.limit) || 25;
    const offset = parseInt(req.query.offset) || 0;
    
    let query = `
      SELECT
        report_id,
        report_type,
        report_name,
        report_description,
        TO_CHAR(generated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS generated_at,
        ROUND(file_size_bytes / 1024.0, 1) || ' KB' AS size,
        status,
        format,
        row_count,
        downloaded_count,
        TO_CHAR(date_range_from, 'YYYY-MM-DD') AS date_from,
        TO_CHAR(date_range_to, 'YYYY-MM-DD') AS date_to
      FROM sp_v2_report_metadata
      WHERE merchant_id = $1
    `;
    
    const params = [merchantId];
    
    if (reportType) {
      query += ` AND report_type = $${params.length + 1}`;
      params.push(reportType);
    }
    
    query += ` ORDER BY generated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await v2Pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM sp_v2_report_metadata
      WHERE merchant_id = $1 ${reportType ? 'AND report_type = $2' : ''}
    `;
    const countParams = reportType ? [merchantId, reportType] : [merchantId];
    const countResult = await v2Pool.query(countQuery, countParams);
    
    res.json({
      reports: result.rows,
      pagination: {
        limit,
        offset,
        total: parseInt(countResult.rows[0].total),
        hasNext: offset + limit < parseInt(countResult.rows[0].total)
      }
    });
    
  } catch (error) {
    console.error('[Reports] Error listing reports:', error.message);
    res.status(500).json({ error: 'Failed to fetch reports', details: error.message });
  }
});

router.post('/reports/generate', async (req, res) => {
  console.log('[Reports] POST /reports/generate - Generate new report', { body: req.body });
  
  try {
    const { report_type, date_from, date_to, format = 'CSV' } = req.body;
    const merchantId = req.body.merchant_id || MERCHANT_ID;
    
    if (!report_type || !date_from || !date_to) {
      return res.status(400).json({ error: 'Missing required fields: report_type, date_from, date_to' });
    }
    
    const reportId = `${report_type.toLowerCase().substring(0, 2)}-${date_to.replace(/-/g, '')}-${Date.now().toString().slice(-3)}`;
    
    const startTime = Date.now();
    
    const reportName = `${report_type.charAt(0) + report_type.slice(1).toLowerCase()} Report - ${date_to}`;
    const reportDescription = `Report generated for ${date_from} to ${date_to}`;
    
    await v2Pool.query(`
      INSERT INTO sp_v2_report_metadata (
        report_id, merchant_id, report_type, report_name, report_description,
        date_range_from, date_range_to, format, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'GENERATING')
    `, [reportId, merchantId, report_type, reportName, reportDescription, date_from, date_to, format]);
    
    const reportData = await generateReportData(report_type, date_from, date_to, merchantId);
    
    const headers = getReportHeaders(report_type);
    const csvContent = formatCSV(reportData, headers);
    
    const filePath = `/reports/${reportId}.${format.toLowerCase()}`;
    const fileSize = Buffer.byteLength(csvContent, 'utf8');
    const generationTime = Date.now() - startTime;
    
    await v2Pool.query(`
      UPDATE sp_v2_report_metadata
      SET status = 'READY',
          file_path = $1,
          file_size_bytes = $2,
          row_count = $3,
          generation_time_ms = $4,
          expires_at = NOW() + INTERVAL '30 days',
          updated_at = NOW()
      WHERE report_id = $5
    `, [filePath, fileSize, reportData.length, generationTime, reportId]);
    
    res.json({
      success: true,
      report_id: reportId,
      report_name: reportName,
      status: 'READY',
      row_count: reportData.length,
      file_size_bytes: fileSize,
      generation_time_ms: generationTime,
      download_url: `/v1/merchant/reports/${reportId}/download`,
      generated_at: new Date().toISOString(),
      csvPreview: csvContent
    });
    
  } catch (error) {
    console.error('[Reports] Error generating report:', error.message);
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
  }
});

router.get('/reports/:reportId', async (req, res) => {
  console.log('[Reports] GET /reports/:reportId - Get report details', { reportId: req.params.reportId });
  
  try {
    const { reportId } = req.params;
    
    const result = await v2Pool.query(`
      SELECT
        report_id,
        report_type,
        report_name,
        report_description,
        TO_CHAR(generated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS generated_at,
        file_size_bytes,
        ROUND(file_size_bytes / 1024.0, 1) || ' KB' AS size,
        status,
        format,
        row_count,
        downloaded_count,
        TO_CHAR(last_downloaded_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_downloaded_at,
        TO_CHAR(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at,
        generation_time_ms
      FROM sp_v2_report_metadata
      WHERE report_id = $1
    `, [reportId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('[Reports] Error fetching report:', error.message);
    res.status(500).json({ error: 'Failed to fetch report', details: error.message });
  }
});

router.get('/reports/:reportId/download', async (req, res) => {
  console.log('[Reports] GET /reports/:reportId/download - Download report', { reportId: req.params.reportId });
  
  try {
    const { reportId } = req.params;
    const merchantId = req.query.merchant_id || MERCHANT_ID;
    
    const result = await v2Pool.query(`
      SELECT
        report_type, report_name, format, status, file_path,
        date_range_from, date_range_to
      FROM sp_v2_report_metadata
      WHERE report_id = $1 AND merchant_id = $2
    `, [reportId, merchantId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    const report = result.rows[0];
    
    if (report.status !== 'READY') {
      return res.status(400).json({ error: `Report is not ready. Current status: ${report.status}` });
    }
    
    const reportData = await generateReportData(
      report.report_type,
      report.date_range_from,
      report.date_range_to,
      merchantId
    );
    
    const headers = getReportHeaders(report.report_type);
    const csvContent = formatCSV(reportData, headers);
    
    await v2Pool.query(`
      UPDATE sp_v2_report_metadata
      SET downloaded_count = downloaded_count + 1,
          last_downloaded_at = NOW()
      WHERE report_id = $1
    `, [reportId]);
    
    await v2Pool.query(`
      INSERT INTO sp_v2_report_downloads_log (report_id, merchant_id, downloaded_by, download_ip)
      VALUES ($1, $2, $3, $4)
    `, [reportId, merchantId, 'merchant-dashboard', req.ip]);
    
    const filename = `${report.report_name.replace(/ /g, '_')}_${report.date_range_to}.${report.format.toLowerCase()}`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('[Reports] Error downloading report:', error.message);
    res.status(500).json({ error: 'Failed to download report', details: error.message });
  }
});

router.post('/reports/scheduled', async (req, res) => {
  console.log('[Reports] POST /reports/scheduled - Create scheduled report', { body: req.body });
  
  try {
    const {
      report_type, frequency, time, format = 'CSV',
      email_recipients = [], delivery_method = 'EMAIL'
    } = req.body;
    const merchantId = req.body.merchant_id || MERCHANT_ID;
    
    if (!report_type || !frequency || !time) {
      return res.status(400).json({ error: 'Missing required fields: report_type, frequency, time' });
    }
    
    const scheduleId = `sch-${Date.now()}`;
    const reportName = `${frequency} ${report_type.charAt(0) + report_type.slice(1).toLowerCase()} Report`;
    
    const timeIST = time + ':00';
    
    const nextRunResult = await v2Pool.query(`
      SELECT calculate_next_run_time($1, $2::TIME) AS next_run
    `, [frequency, timeIST]);
    
    const nextRunAt = nextRunResult.rows[0].next_run;
    
    await v2Pool.query(`
      INSERT INTO sp_v2_scheduled_reports (
        schedule_id, merchant_id, report_type, report_name, frequency,
        time_ist, format, delivery_method, email_recipients, next_run_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [scheduleId, merchantId, report_type, reportName, frequency, timeIST, format, delivery_method, email_recipients, nextRunAt]);
    
    res.json({
      success: true,
      schedule_id: scheduleId,
      report_name: reportName,
      next_run_at: nextRunAt,
      status: 'active'
    });
    
  } catch (error) {
    console.error('[Reports] Error creating scheduled report:', error.message);
    res.status(500).json({ error: 'Failed to create scheduled report', details: error.message });
  }
});

router.delete('/reports/scheduled/:scheduleId', async (req, res) => {
  console.log('[Reports] DELETE /reports/scheduled/:scheduleId - Delete scheduled report', { scheduleId: req.params.scheduleId });
  
  try {
    const { scheduleId } = req.params;
    const merchantId = req.query.merchant_id || MERCHANT_ID;
    
    const result = await v2Pool.query(`
      DELETE FROM sp_v2_scheduled_reports
      WHERE schedule_id = $1 AND merchant_id = $2
      RETURNING schedule_id
    `, [scheduleId, merchantId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled report not found' });
    }
    
    res.json({
      success: true,
      message: 'Scheduled report deleted successfully'
    });
    
  } catch (error) {
    console.error('[Reports] Error deleting scheduled report:', error.message);
    res.status(500).json({ error: 'Failed to delete scheduled report', details: error.message });
  }
});

module.exports = router;
