const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = 5110;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.stack);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToCSV(data) {
  if (data.length === 0) return 'No data available\n';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => escapeCSV(row[header])).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

app.post('/api/ops/exceptions/export', async (req, res) => {
  try {
    const { query = {}, format = 'csv' } = req.body;
    
    console.log('📤 Exporting exceptions:', { query, format });
    
    let sql = `
      SELECT 
        ew.exception_id,
        ew.reason,
        ew.severity,
        ew.status,
        ew.merchant_id,
        ew.merchant_name,
        ew.acquirer_code,
        ew.pg_amount_paise / 100.0 AS pg_amount_rupees,
        ew.bank_amount_paise / 100.0 AS bank_amount_rupees,
        ew.amount_delta_paise / 100.0 AS amount_delta_rupees,
        ew.utr,
        ew.pg_transaction_id,
        ew.bank_reference_id,
        ew.assigned_to,
        ew.assigned_to_name,
        ew.sla_due_at,
        ew.sla_breached,
        ew.created_at,
        ew.resolved_at,
        ew.resolution,
        ew.resolution_note,
        ew.cycle_date
      FROM sp_v2_exception_workflow ew
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (query.status) {
      sql += ` AND ew.status = $${paramCount}`;
      params.push(query.status);
      paramCount++;
    }
    
    if (query.severity) {
      sql += ` AND ew.severity = $${paramCount}`;
      params.push(query.severity);
      paramCount++;
    }
    
    if (query.reason) {
      sql += ` AND ew.reason = $${paramCount}`;
      params.push(query.reason);
      paramCount++;
    }
    
    if (query.fromDate) {
      sql += ` AND ew.created_at >= $${paramCount}`;
      params.push(query.fromDate);
      paramCount++;
    }
    
    if (query.toDate) {
      sql += ` AND ew.created_at <= $${paramCount}`;
      params.push(query.toDate);
      paramCount++;
    }
    
    if (query.merchant_id) {
      sql += ` AND ew.merchant_id = $${paramCount}`;
      params.push(query.merchant_id);
      paramCount++;
    }
    
    if (query.slaBreached !== undefined) {
      sql += ` AND ew.sla_breached = $${paramCount}`;
      params.push(query.slaBreached);
      paramCount++;
    }
    
    sql += ' ORDER BY ew.created_at DESC LIMIT 10000';
    
    const result = await pool.query(sql, params);
    
    console.log(`✅ Found ${result.rows.length} exceptions`);
    
    const csv = arrayToCSV(result.rows);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `exceptions_${timestamp}.${format}`;
    
    res.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
    
  } catch (error) {
    console.error('❌ Export exceptions error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ops/v1/recon/manual/job/:jobId/export', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { tab = 'matched' } = req.query;
    
    console.log(`📤 Exporting manual recon job ${jobId}, tab: ${tab}`);
    
    let sql;
    const params = [jobId];
    
    if (tab === 'matched') {
      sql = `
        SELECT 
          t.transaction_id AS pg_transaction_id,
          t.amount_paise / 100.0 AS pg_amount_rupees,
          t.transaction_date AS pg_date,
          t.utr AS pg_utr,
          bs.bank_ref AS bank_reference,
          bs.amount_paise / 100.0 AS bank_amount_rupees,
          bs.transaction_date AS bank_date,
          bs.utr AS bank_utr,
          t.merchant_id,
          t.acquirer_code,
          t.payment_method,
          'MATCHED' AS match_status
        FROM sp_v2_transactions t
        INNER JOIN sp_v2_bank_statements bs ON t.transaction_id = bs.matched_transaction_id
        WHERE t.source_job_id = $1 AND t.status = 'RECONCILED'
        ORDER BY t.transaction_date DESC
        LIMIT 10000
      `;
    } else if (tab === 'unmatched') {
      sql = `
        SELECT 
          transaction_id,
          amount_paise / 100.0 AS amount_rupees,
          transaction_date,
          utr,
          merchant_id,
          acquirer_code,
          payment_method,
          status,
          'UNMATCHED_PG' AS source_type
        FROM sp_v2_transactions
        WHERE source_job_id = $1 AND status != 'RECONCILED'
        
        UNION ALL
        
        SELECT 
          bank_ref AS transaction_id,
          amount_paise / 100.0 AS amount_rupees,
          transaction_date,
          utr,
          merchant_id,
          'N/A' AS acquirer_code,
          'N/A' AS payment_method,
          'UNMATCHED' AS status,
          'UNMATCHED_BANK' AS source_type
        FROM sp_v2_bank_statements
        WHERE matched_transaction_id IS NULL
        
        ORDER BY transaction_date DESC
        LIMIT 10000
      `;
    } else {
      sql = `
        SELECT 
          ew.exception_id,
          ew.reason,
          ew.severity,
          ew.pg_transaction_id,
          ew.bank_reference_id,
          ew.pg_amount_paise / 100.0 AS pg_amount_rupees,
          ew.bank_amount_paise / 100.0 AS bank_amount_rupees,
          ew.amount_delta_paise / 100.0 AS delta_rupees,
          ew.merchant_id,
          ew.status,
          ew.created_at
        FROM sp_v2_exception_workflow ew
        WHERE ew.source_job_id = $1
        ORDER BY ew.created_at DESC
        LIMIT 10000
      `;
    }
    
    const result = await pool.query(sql, params);
    
    console.log(`✅ Found ${result.rows.length} records for ${tab}`);
    
    const csv = arrayToCSV(result.rows);
    const filename = `manual_recon_${jobId}_${tab}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
    
  } catch (error) {
    console.error('❌ Export manual recon error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ops/recon/export', async (req, res) => {
  try {
    const { cycleDate, subset = 'all', format = 'csv', includeMetadata = false } = req.body;
    
    console.log(`📤 Exporting recon results:`, { cycleDate, subset, format });
    
    if (!cycleDate) {
      return res.status(400).json({ error: 'cycleDate is required' });
    }
    
    let sql;
    const params = [cycleDate];
    
    if (subset === 'matched') {
      sql = `
        SELECT 
          t.transaction_id,
          t.amount_paise / 100.0 AS amount_rupees,
          t.transaction_date,
          t.utr,
          t.merchant_id,
          t.acquirer_code,
          t.payment_method,
          t.status,
          bs.bank_ref AS bank_reference,
          bs.utr AS bank_utr,
          bs.transaction_date AS bank_date,
          'MATCHED' AS recon_status
        FROM sp_v2_transactions t
        INNER JOIN sp_v2_bank_statements bs ON t.transaction_id = bs.matched_transaction_id
        WHERE t.transaction_date::date = $1::date AND t.status = 'RECONCILED'
        ORDER BY t.transaction_date DESC
      `;
    } else if (subset === 'unmatched') {
      sql = `
        SELECT 
          transaction_id,
          amount_paise / 100.0 AS amount_rupees,
          transaction_date,
          utr,
          merchant_id,
          acquirer_code,
          payment_method,
          status,
          'UNMATCHED_PG' AS recon_status
        FROM sp_v2_transactions
        WHERE transaction_date::date = $1::date AND status IN ('UNRECONCILED', 'PENDING')
        
        UNION ALL
        
        SELECT 
          bank_ref AS transaction_id,
          amount_paise / 100.0 AS amount_rupees,
          transaction_date,
          utr,
          merchant_id,
          'N/A' AS acquirer_code,
          'N/A' AS payment_method,
          'UNMATCHED' AS status,
          'UNMATCHED_BANK' AS recon_status
        FROM sp_v2_bank_statements
        WHERE transaction_date::date = $1::date AND matched_transaction_id IS NULL
        
        ORDER BY transaction_date DESC
      `;
    } else if (subset === 'exceptions') {
      sql = `
        SELECT 
          ew.exception_id,
          ew.reason,
          ew.severity,
          ew.status,
          ew.pg_transaction_id,
          ew.bank_reference_id,
          ew.pg_amount_paise / 100.0 AS pg_amount_rupees,
          ew.bank_amount_paise / 100.0 AS bank_amount_rupees,
          ew.amount_delta_paise / 100.0 AS delta_rupees,
          ew.merchant_id,
          ew.acquirer_code,
          ew.utr,
          ew.sla_breached,
          ew.created_at
        FROM sp_v2_exception_workflow ew
        WHERE ew.cycle_date::date = $1::date
        ORDER BY ew.created_at DESC
      `;
    } else {
      sql = `
        SELECT 
          t.transaction_id,
          t.amount_paise / 100.0 AS amount_rupees,
          t.transaction_date,
          t.utr,
          t.merchant_id,
          t.acquirer_code,
          t.payment_method,
          t.status,
          COALESCE(bs.bank_ref, 'N/A') AS bank_reference,
          COALESCE(bs.utr, 'N/A') AS bank_utr,
          bs.transaction_date AS bank_date,
          CASE 
            WHEN t.status = 'RECONCILED' THEN 'MATCHED'
            WHEN t.status = 'EXCEPTION' THEN 'EXCEPTION'
            ELSE 'UNMATCHED'
          END AS recon_status
        FROM sp_v2_transactions t
        LEFT JOIN sp_v2_bank_statements bs ON t.transaction_id = bs.matched_transaction_id
        WHERE t.transaction_date::date = $1::date
        ORDER BY t.transaction_date DESC
      `;
    }
    
    const result = await pool.query(sql, params);
    
    console.log(`✅ Found ${result.rows.length} records for ${subset}`);
    
    const csv = arrayToCSV(result.rows);
    
    const metadata = {
      exportId: `EXP_${Date.now()}`,
      cycleDate,
      subset,
      format,
      rowCount: result.rows.length,
      exportedAt: new Date().toISOString(),
      generatorVersion: '2.0.0'
    };
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `recon_${cycleDate}_${subset}.${format}`;
    
    if (includeMetadata) {
      const csvWithMetadata = `# Reconciliation Export\n# ${JSON.stringify(metadata)}\n\n${csv}`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvWithMetadata);
    } else {
      res.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    }
    
  } catch (error) {
    console.error('❌ Export recon error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'exports-api', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Exports API Server running on http://localhost:${PORT}`);
  console.log(`📊 Endpoints:`);
  console.log(`   POST /api/ops/exceptions/export`);
  console.log(`   GET  /api/ops/v1/recon/manual/job/:jobId/export?tab=matched`);
  console.log(`   POST /api/ops/recon/export`);
  console.log(`   GET  /health\n`);
});
