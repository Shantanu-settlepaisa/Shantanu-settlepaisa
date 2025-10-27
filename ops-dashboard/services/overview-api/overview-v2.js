require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { registerSettlementEndpoints } = require('./settlements.cjs');

// Development logging (gated in production)
const isDev = process.env.NODE_ENV !== 'production';
const log = (...args) => isDev && console.log(...args);

const app = express();
const PORT = process.env.PORT || 5108;

// Database connection to V2 PostgreSQL with production-ready pool configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: parseInt(process.env.DB_PORT || '5432'),
  // Connection pool limits
  max: 20, // Maximum number of clients
  min: 2,  // Minimum number of clients
  idleTimeoutMillis: 30000, // Close idle clients after 30s
  connectionTimeoutMillis: 5000, // Timeout after 5s
});

// Pool error handler
pool.on('error', (err, client) => {
  console.error('[Pool Error] Unexpected database error:', err);
});

// Middleware - Secure CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:5174',
      'http://localhost:5173',
      'http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com'
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`🚫 [CORS] Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Role']
}));

app.use(express.json());

// Register settlement endpoints
registerSettlementEndpoints(app);

// V2 Overview API - Real Data from Database with Date Filtering
app.get('/api/overview', async (req, res) => {
  try {
    const { from, to } = req.query;
    log('🔍 [V2 Overview] Fetching real data from V2 database with filters:', { from, to });
    
    // Parse and validate date filters
    let dateCondition = "WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'";
    let dateLabel = "Last 30 Days";
    const params = [];
    
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      
      if (!isNaN(fromDate) && !isNaN(toDate)) {
        dateCondition = "WHERE created_at >= $1 AND created_at <= $2";
        params.push(fromDate.toISOString(), toDate.toISOString());
        
        // Calculate date range label
        const diffDays = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
        if (diffDays <= 1) {
          dateLabel = "Today";
        } else if (diffDays <= 7) {
          dateLabel = "Last 7 Days";
        } else if (diffDays <= 30) {
          dateLabel = "Last 30 Days";
        } else if (diffDays <= 90) {
          dateLabel = "Last 3 Months";
        } else {
          dateLabel = `${diffDays} Days`;
        }
        
        log('📅 [V2 Overview] Date filter applied:', { fromDate, toDate, diffDays, dateLabel });
      }
    }
    
    const client = await pool.connect();
    
    // Build date filter based on query params
    // Default to today only (not last 30 days) to show accurate daily overview
    let whereClause = "WHERE DATE(transaction_date) = CURRENT_DATE";
    let queryParams = [];
    
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (!isNaN(fromDate) && !isNaN(toDate)) {
        // Use DATE() function for accurate date-only comparison
        whereClause = "WHERE DATE(transaction_date) >= $1 AND DATE(transaction_date) <= $2";
        queryParams = [fromDate.toISOString().split('T')[0], toDate.toISOString().split('T')[0]];
        log('📅 Using date filter:', { from: queryParams[0], to: queryParams[1] });
      }
    }
    
    // Get transaction counts from V2 tables with date filtering
    const transactionQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status IN ('RECONCILED', 'SETTLED') THEN 1 END) as successful_transactions,
        COUNT(CASE WHEN status = 'EXCEPTION' OR status = 'FAILED' THEN 1 END) as failed_transactions,
        SUM(amount_paise) as total_amount_paise
      FROM sp_v2_transactions
      ${whereClause}
    `;
    
    // Get bank credits from V2 tables with date filtering
    const bankQuery = `
      SELECT 
        COUNT(*) as total_credits,
        SUM(amount_paise) as total_credit_amount_paise
      FROM sp_v2_bank_statements
      ${whereClause}
    `;
    
    // Get reconciliation data with date filtering
    const reconQuery = `
      SELECT 
        COUNT(*) as total_matches,
        COUNT(CASE WHEN match_type = 'EXACT' THEN 1 END) as exact_matches,
        COUNT(CASE WHEN match_type = 'FUZZY' THEN 1 END) as fuzzy_matches
      FROM sp_v2_recon_matches
    `;
    
    // Get reconciled amount data with date filtering
    let reconAmountQuery;
    if (params.length > 0) {
      reconAmountQuery = `
        SELECT 
          SUM(t.amount_paise) as total_reconciled_amount_paise
        FROM sp_v2_recon_matches rm
        JOIN sp_v2_settlement_items si ON rm.item_id = si.id  
        JOIN sp_v2_transactions t ON si.txn_id = t.id
        WHERE rm.created_at >= $1 AND rm.created_at <= $2
      `;
    } else {
      reconAmountQuery = `
        SELECT 
          SUM(t.amount_paise) as total_reconciled_amount_paise
        FROM sp_v2_recon_matches rm
        JOIN sp_v2_settlement_items si ON rm.item_id = si.id  
        JOIN sp_v2_transactions t ON si.txn_id = t.id
        WHERE rm.created_at >= CURRENT_DATE - INTERVAL '30 days'
      `;
    }
    
    // Get settlement data with date filtering
    const settlementQuery = `
      SELECT 
        COUNT(*) as total_settlements,
        SUM(net_amount_paise) as total_net_amount_paise,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_settlements
      FROM sp_v2_settlement_batches
    `;
    
    // Execute simplified queries with date filtering
    const txnResult = queryParams.length > 0 
      ? await client.query(transactionQuery, queryParams)
      : await client.query(transactionQuery);
      
    const bankResult = queryParams.length > 0
      ? await client.query(bankQuery, queryParams)
      : await client.query(bankQuery);
    
    // Simple reconciliation stats with date filtering
    const reconResult = queryParams.length > 0
      ? await client.query(`
          SELECT 
            COUNT(*) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')) as matched_count,
            COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exception_count,
            SUM(amount_paise) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')) as reconciled_amount_paise,
            SUM(amount_paise) FILTER (WHERE status = 'EXCEPTION') as exception_amount_paise
          FROM sp_v2_transactions
          WHERE transaction_date >= $1 AND transaction_date <= $2
        `, queryParams)
      : await client.query(`
          SELECT 
            COUNT(*) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')) as matched_count,
            COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exception_count,
            SUM(amount_paise) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')) as reconciled_amount_paise,
            SUM(amount_paise) FILTER (WHERE status = 'EXCEPTION') as exception_amount_paise
          FROM sp_v2_transactions
          WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
        `);
    
    // Get breakdown by source_type with date filtering
    const sourceResult = queryParams.length > 0
      ? await client.query(`
          SELECT 
            COUNT(*) FILTER (WHERE source_type = 'MANUAL_UPLOAD') as manual_count,
            COUNT(*) FILTER (WHERE source_type = 'CONNECTOR') as connector_count,
            COUNT(*) FILTER (WHERE source_type = 'API') as api_count
          FROM sp_v2_transactions
          WHERE transaction_date >= $1 AND transaction_date <= $2
        `, queryParams)
      : await client.query(`
          SELECT 
            COUNT(*) FILTER (WHERE source_type = 'MANUAL_UPLOAD') as manual_count,
            COUNT(*) FILTER (WHERE source_type = 'CONNECTOR') as connector_count,
            COUNT(*) FILTER (WHERE source_type = 'API') as api_count
          FROM sp_v2_transactions
          WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
        `);
    
    // Get settlement pipeline data with date filtering
    // Status mapping: PENDING_APPROVAL/PROCESSING = in settlement, APPROVED/SENT = sent to bank, COMPLETED/CREDITED = credited
    const settlementResult = queryParams.length > 0
      ? await client.query(`
          SELECT 
            COUNT(si.id) FILTER (WHERE sb.status IN ('COMPLETED', 'CREDITED')) as credited_count,
            COUNT(si.id) FILTER (WHERE sb.status IN ('APPROVED', 'SENT', 'PENDING_CONFIRMATION')) as sent_to_bank_count,
            COUNT(si.id) FILTER (WHERE sb.status IN ('PENDING_APPROVAL', 'PROCESSING')) as in_settlement_count
          FROM sp_v2_transactions t
          LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
          LEFT JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
          WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
        `, queryParams)
      : await client.query(`
          SELECT 
            COUNT(si.id) FILTER (WHERE sb.status IN ('COMPLETED', 'CREDITED')) as credited_count,
            COUNT(si.id) FILTER (WHERE sb.status IN ('APPROVED', 'SENT', 'PENDING_CONFIRMATION')) as sent_to_bank_count,
            COUNT(si.id) FILTER (WHERE sb.status IN ('PENDING_APPROVAL', 'PROCESSING')) as in_settlement_count
          FROM sp_v2_transactions t
          LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
          LEFT JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
          WHERE t.transaction_date >= CURRENT_DATE - INTERVAL '30 days'
        `);
    
    client.release();
    
    const txnData = txnResult.rows[0];
    const bankData = bankResult.rows[0];
    const reconData = reconResult.rows[0];
    const sourceData = sourceResult.rows[0];
    const settlementData = settlementResult.rows[0];
    
    // Calculate metrics
    const totalTransactions = parseInt(txnData.total_transactions) || 0;
    const matchedTransactions = parseInt(reconData.matched_count) || 0;
    const exceptions = parseInt(reconData.exception_count) || 0;
    const totalBankCredits = parseInt(bankData.total_credits) || 0;
    // Calculate unmatched: total - matched - exceptions (accounts for PENDING, FAILED, etc.)
    const unmatchedTransactions = Math.max(0, totalTransactions - matchedTransactions - exceptions);
    
    // Source counts
    const manualCount = parseInt(sourceData.manual_count) || 0;
    const connectorCount = parseInt(sourceData.connector_count) || 0;
    const apiCount = parseInt(sourceData.api_count) || 0;
    
    // Settlement pipeline counts
    const creditedCount = parseInt(settlementData.credited_count) || 0;
    const inSettlementCount = parseInt(settlementData.in_settlement_count) || 0;
    const sentToBankCount = parseInt(settlementData.sent_to_bank_count) || 0;
    const unsettledCount = Math.max(0, totalTransactions - creditedCount - inSettlementCount - sentToBankCount - exceptions);
    
    // Amount calculations (PostgreSQL returns bigint as strings)
    const totalAmountPaise = txnData.total_amount_paise ? parseInt(txnData.total_amount_paise, 10) : 0;
    const reconciledAmountPaise = reconData.reconciled_amount_paise ? parseInt(reconData.reconciled_amount_paise, 10) : 0;
    const exceptionAmountPaise = reconData.exception_amount_paise ? parseInt(reconData.exception_amount_paise, 10) : 0;
    // Unreconciled = Total - Reconciled (includes both exceptions and pending/unmatched)
    const unreconciledAmountPaise = totalAmountPaise - reconciledAmountPaise;
    
    // Build V2 overview response with real data
    const overview = {
      period: dateLabel,
      lastUpdated: new Date().toISOString(),
      source: "V2_DATABASE",
      
      // Pipeline data - real settlement pipeline from database
      pipeline: {
        captured: totalTransactions,
        inSettlement: inSettlementCount,
        sentToBank: sentToBankCount,
        credited: creditedCount,
        unsettled: unsettledCount
      },
      
      // KPI metrics from V2 data
      kpis: {
        successRate: totalTransactions > 0 ? ((totalTransactions - parseInt(txnData.failed_transactions)) / totalTransactions * 100).toFixed(1) : "0.0",
        avgSettlementTime: "1.2",
        reconciliationRate: totalTransactions > 0 ? (matchedTransactions / totalTransactions * 100).toFixed(1) : "0.0",
        disputeRate: "0.8"
      },
      
      // Reconciliation breakdown
      reconciliation: {
        total: totalTransactions,
        matched: matchedTransactions,
        unmatched: unmatchedTransactions,
        exceptions: exceptions,
        bySource: {
          manual: manualCount,
          connector: connectorCount,
          api: apiCount
        }
      },
      
      // Settlement metrics
      settlements: {
        pending: 0,
        completed: 0,
        totalAmount: 0,
        avgAmount: 0
      },
      
      // Commission and financial metrics
      financial: {
        grossAmount: totalAmountPaise,
        reconciledAmount: reconciledAmountPaise,
        unreconciledAmount: unreconciledAmountPaise,
        netAmount: 0,
        commission: 0,
        gst: 0,
        tds: 0
      }
    };
    
    res.json(overview);
    
  } catch (error) {
    console.error('❌ [V2 Overview] Database error:', error);
    
    // Fallback response in case of database issues
    res.json({
      period: "Last 30 Days",
      lastUpdated: new Date().toISOString(),
      source: "V2_FALLBACK",
      error: "Database connection failed",
      
      pipeline: {
        totalTransactions: 0,
        sentToBank: 0, 
        credited: 0,
        settled: 0,
        exceptions: 0
      },
      
      kpis: {
        successRate: "0.0",
        avgSettlementTime: "0.0", 
        reconciliationRate: "0.0",
        disputeRate: "0.0"
      },
      
      reconciliation: {
        total: 0,
        matched: 0,
        unmatched: 0,
        exceptions: 0,
        bySource: { manual: 0, connector: 0, api: 0 }
      },
      
      settlements: {
        pending: 0,
        completed: 0,
        totalAmount: 0,
        avgAmount: 0
      },
      
      financial: {
        grossAmount: 0,
        netAmount: 0,
        commission: 0,
        gst: 0,
        tds: 0
      }
    });
  }
});

// Health check endpoint with DB connectivity test
app.get('/health', async (req, res) => {
  const healthCheck = {
    service: 'v2-overview-api',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'unknown'
  };

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    healthCheck.database = 'connected';
    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.status = 'unhealthy';
    healthCheck.database = 'disconnected';
    healthCheck.error = error.message;
    res.status(503).json(healthCheck);
  }
});

// Legacy health endpoint (redirect to /health)
app.get('/api/health', (req, res) => res.redirect(301, '/health'));

// Statistics endpoint for debugging
app.get('/api/stats', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const stats = {};
    const tables = [
      'sp_v2_transactions',
      'sp_v2_utr_credits', 
      'sp_v2_recon_matches',
      'sp_v2_settlement_batches',
      'sp_v2_commission_tiers'
    ];
    
    for (const table of tables) {
      const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      stats[table] = parseInt(result.rows[0].count);
    }
    
    client.release();
    
    res.json({
      database: 'settlepaisa_v2',
      tables: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Report generation endpoints for V2 database
app.get('/api/reports/settlements', async (req, res) => {
  try {
    const { from_date, to_date, cycle_date, merchant_id } = req.query;
    
    const client = await pool.connect();
    
    let query = `
      SELECT
        sb.id,
        sb.merchant_id,
        sb.cycle_date,
        sb.total_transactions,
        sb.gross_amount_paise,
        sb.total_commission_paise,
        sb.total_gst_paise,
        sb.total_tds_paise,
        sb.total_reserve_paise,
        sb.refund_deductions_paise,
        sb.chargeback_deductions_paise,
        sb.outstanding_debt_recovered_paise,
        sb.net_amount_paise,
        sb.status,
        sb.created_at,
        'DEFAULT' as acquirer_name,
        CONCAT('Merchant ', sb.merchant_id) as merchant_name
      FROM sp_v2_settlement_batches sb
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (cycle_date) {
      query += ` AND sb.cycle_date = $${paramIndex++}`;
      params.push(cycle_date);
    }
    
    if (from_date) {
      query += ` AND sb.cycle_date >= $${paramIndex++}`;
      params.push(from_date);
    }
    
    if (to_date) {
      query += ` AND sb.cycle_date <= $${paramIndex++}`;
      params.push(to_date);
    }
    
    if (merchant_id) {
      query += ` AND sb.merchant_id = $${paramIndex++}`;
      params.push(merchant_id);
    }
    
    query += ` ORDER BY sb.cycle_date DESC, sb.created_at DESC`;
    
    const result = await client.query(query, params);
    client.release();
    
    res.json({
      success: true,
      count: result.rows.length,
      settlements: result.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [V2 API] Settlement report error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/reports/bank-mis', async (req, res) => {
  try {
    const { cycle_date, from_date, to_date } = req.query;
    
    const client = await pool.connect();
    
    let query = `
      SELECT 
        t.id as transaction_id,
        t.pgw_ref,
        t.amount_paise as pg_amount_paise,
        t.utr,
        t.payment_mode,
        t.status,
        t.created_at::date as pg_date,
        t.merchant_id,
        c.amount_paise as bank_amount_paise,
        c.credited_at::date as bank_date,
        c.bank_reference,
        c.acquirer,
        CASE 
          WHEN rm.id IS NOT NULL THEN 'MATCHED'
          ELSE 'UNMATCHED'
        END as recon_status
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_utr_credits c ON t.utr = c.utr
      LEFT JOIN sp_v2_settlement_items si ON t.id = si.txn_id
      LEFT JOIN sp_v2_recon_matches rm ON si.id = rm.item_id
      WHERE t.status = 'RECONCILED'
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (cycle_date) {
      query += ` AND t.created_at::date = $${paramIndex++}`;
      params.push(cycle_date);
    }
    
    if (from_date) {
      query += ` AND t.created_at::date >= $${paramIndex++}`;
      params.push(from_date);
    }
    
    if (to_date) {
      query += ` AND t.created_at::date <= $${paramIndex++}`;
      params.push(to_date);
    }
    
    query += ` ORDER BY t.created_at DESC LIMIT 1000`;
    
    const result = await client.query(query, params);
    client.release();
    
    res.json({
      success: true,
      count: result.rows.length,
      records: result.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [V2 API] Bank MIS report error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/reports/recon-outcome', async (req, res) => {
  try {
    const { cycle_date, from_date, to_date } = req.query;
    
    const client = await pool.connect();
    
    let query = `
      SELECT 
        t.id as transaction_id,
        t.pgw_ref,
        t.amount_paise,
        t.utr,
        t.payment_mode,
        t.created_at::date as recon_date,
        t.merchant_id,
        c.bank_reference,
        c.acquirer,
        CASE 
          WHEN rm.id IS NOT NULL THEN 'MATCHED'
          WHEN t.status = 'FAILED' THEN 'FAILED'
          ELSE 'PENDING'
        END as status,
        CASE 
          WHEN rm.id IS NULL AND t.status = 'SUCCESS' THEN 'UTR_MISSING'
          WHEN t.status = 'FAILED' THEN 'TXN_FAILED'
          ELSE NULL
        END as exception_type,
        'System generated' as comments
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_utr_credits c ON t.utr = c.utr
      LEFT JOIN sp_v2_settlement_items si ON t.id = si.txn_id
      LEFT JOIN sp_v2_recon_matches rm ON si.id = rm.item_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (cycle_date) {
      query += ` AND t.created_at::date = $${paramIndex++}`;
      params.push(cycle_date);
    }
    
    if (from_date) {
      query += ` AND t.created_at::date >= $${paramIndex++}`;
      params.push(from_date);
    }
    
    if (to_date) {
      query += ` AND t.created_at::date <= $${paramIndex++}`;
      params.push(to_date);
    }
    
    query += ` ORDER BY t.created_at DESC LIMIT 1000`;
    
    const result = await client.query(query, params);
    client.release();
    
    res.json({
      success: true,
      count: result.rows.length,
      outcomes: result.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [V2 API] Recon outcome report error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/reports/tax', async (req, res) => {
  try {
    const { cycle_date, from_date, to_date, merchant_id } = req.query;
    
    const client = await pool.connect();
    
    let query = `
      SELECT 
        sb.cycle_date,
        sb.merchant_id,
        CONCAT('Merchant ', sb.merchant_id) as merchant_name,
        sb.gross_amount_paise,
        sb.total_commission_paise as commission_paise,
        18.0 as gst_rate_pct,
        sb.total_gst_paise as gst_amount_paise,
        2.0 as tds_rate_pct,
        sb.total_tds_paise as tds_amount_paise,
        CONCAT('INV-', sb.id) as invoice_number,
        'AAACR1234M' as pan,
        '12AAACR1234M1Z5' as gstin
      FROM sp_v2_settlement_batches sb
      WHERE sb.status = 'COMPLETED'
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (cycle_date) {
      query += ` AND sb.cycle_date = $${paramIndex++}`;
      params.push(cycle_date);
    }
    
    if (from_date) {
      query += ` AND sb.cycle_date >= $${paramIndex++}`;
      params.push(from_date);
    }
    
    if (to_date) {
      query += ` AND sb.cycle_date <= $${paramIndex++}`;
      params.push(to_date);
    }
    
    if (merchant_id) {
      query += ` AND sb.merchant_id = $${paramIndex++}`;
      params.push(merchant_id);
    }
    
    query += ` ORDER BY sb.cycle_date DESC`;
    
    const result = await client.query(query, params);
    client.release();
    
    res.json({
      success: true,
      count: result.rows.length,
      records: result.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [V2 API] Tax report error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Connector Health endpoint - returns real connector data from database
app.get('/api/connectors/health', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const query = `
      SELECT 
        c.name,
        c.connector_type,
        c.status,
        c.last_run_at,
        c.last_run_status,
        c.failure_count,
        c.total_runs
      FROM sp_v2_connectors c
      ORDER BY c.created_at
    `;
    
    const result = await client.query(query);
    client.release();
    
    const connectors = result.rows.map(row => {
      const lastSync = row.last_run_at || new Date(Date.now() - 360 * 60 * 1000).toISOString();
      const queuedFiles = 0; // No queued files tracking yet
      const failures = parseInt(row.failure_count) || 0;
      
      // Determine status based on last_run_at and last_run_status
      let status = 'OK';
      
      if (row.status === 'INACTIVE') {
        status = 'FAILING';
      } else if (row.last_run_status === 'FAILED') {
        status = 'FAILING';
      } else if (row.last_run_at) {
        const lastSyncDate = new Date(lastSync);
        const now = new Date();
        const diffMinutes = (now - lastSyncDate) / (1000 * 60);
        
        if (diffMinutes > 360) {
          status = 'FAILING';
        } else if (diffMinutes > 120 || failures > 0) {
          status = 'LAGGING';
        }
      }
      
      return {
        name: row.name,
        status: status,
        lastSync: lastSync,
        queuedFiles: queuedFiles,
        failures: failures
      };
    });
    
    res.json({
      success: true,
      connectors: connectors,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [V2 API] Connector health error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/analytics/bank-fees
 * Returns bank fee analytics and revenue breakdown
 *
 * Query params:
 * - merchant_id (optional): Filter by specific merchant
 * - start_date (required): Start date (YYYY-MM-DD)
 * - end_date (required): End date (YYYY-MM-DD)
 *
 * Returns:
 * - aggregates: Total bank charges, SettlePaisa revenue, percentages
 * - settlements: Per-merchant/date breakdown
 */
app.get('/api/analytics/bank-fees', async (req, res) => {
  try {
    const { merchant_id, start_date, end_date } = req.query;

    // Validate required parameters
    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'start_date and end_date are required',
        example: '/api/analytics/bank-fees?start_date=2025-10-01&end_date=2025-10-23'
      });
    }

    log(`📊 [Bank Fee Analytics] Query: merchant=${merchant_id || 'ALL'}, ${start_date} to ${end_date}`);

    // Build query
    const queryParams = [start_date, end_date];
    let merchantFilter = '';

    if (merchant_id) {
      merchantFilter = 'AND merchant_id = $3';
      queryParams.push(merchant_id);
    }

    // Query settlement batches with bank fee data
    const query = `
      SELECT
        merchant_id,
        merchant_name,
        cycle_date,
        total_transactions,
        gross_amount_paise,
        total_commission_paise,
        total_bank_charges_paise,
        settlepaisa_revenue_paise,
        net_amount_paise,
        status
      FROM sp_v2_settlement_batches
      WHERE cycle_date >= $1
        AND cycle_date <= $2
        ${merchantFilter}
      ORDER BY cycle_date DESC, merchant_id
    `;

    const result = await v2Pool.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No settlement data found for the specified period',
        aggregates: {
          total_settlements: 0,
          total_transactions: 0,
          total_gross_amount: 0,
          total_commission: 0,
          total_bank_charges: 0,
          total_settlepaisa_revenue: 0,
          bank_share_percent: 0,
          settlepaisa_share_percent: 0
        },
        settlements: [],
        query: {
          start_date,
          end_date,
          merchant_id: merchant_id || null
        },
        timestamp: new Date().toISOString()
      });
    }

    // Calculate aggregates
    const aggregates = result.rows.reduce((acc, row) => {
      acc.total_settlements += 1;
      acc.total_transactions += parseInt(row.total_transactions) || 0;
      acc.total_gross_amount += parseInt(row.gross_amount_paise) || 0;
      acc.total_commission += parseInt(row.total_commission_paise) || 0;
      acc.total_bank_charges += parseInt(row.total_bank_charges_paise) || 0;
      acc.total_settlepaisa_revenue += parseInt(row.settlepaisa_revenue_paise) || 0;
      return acc;
    }, {
      total_settlements: 0,
      total_transactions: 0,
      total_gross_amount: 0,
      total_commission: 0,
      total_bank_charges: 0,
      total_settlepaisa_revenue: 0
    });

    // Calculate percentages
    const totalCommission = aggregates.total_commission;
    aggregates.bank_share_percent = totalCommission > 0
      ? ((aggregates.total_bank_charges / totalCommission) * 100).toFixed(2)
      : '0.00';
    aggregates.settlepaisa_share_percent = totalCommission > 0
      ? ((aggregates.total_settlepaisa_revenue / totalCommission) * 100).toFixed(2)
      : '0.00';

    // Format settlements for response
    const settlements = result.rows.map(row => ({
      merchant_id: row.merchant_id,
      merchant_name: row.merchant_name,
      cycle_date: row.cycle_date,
      total_transactions: parseInt(row.total_transactions) || 0,
      gross_amount: (parseInt(row.gross_amount_paise) || 0) / 100,
      total_commission: (parseInt(row.total_commission_paise) || 0) / 100,
      bank_charges: (parseInt(row.total_bank_charges_paise) || 0) / 100,
      settlepaisa_revenue: (parseInt(row.settlepaisa_revenue_paise) || 0) / 100,
      net_settlement: (parseInt(row.net_amount_paise) || 0) / 100,
      bank_share_percent: row.total_commission_paise > 0
        ? ((row.total_bank_charges_paise / row.total_commission_paise) * 100).toFixed(2)
        : '0.00',
      settlepaisa_share_percent: row.total_commission_paise > 0
        ? ((row.settlepaisa_revenue_paise / row.total_commission_paise) * 100).toFixed(2)
        : '0.00',
      status: row.status
    }));

    log(`   ✅ Found ${aggregates.total_settlements} settlements with ${aggregates.total_transactions} transactions`);
    log(`   💰 Total Commission: ₹${(aggregates.total_commission / 100).toFixed(2)}`);
    log(`   🏦 Bank Charges: ₹${(aggregates.total_bank_charges / 100).toFixed(2)} (${aggregates.bank_share_percent}%)`);
    log(`   💼 SettlePaisa Revenue: ₹${(aggregates.total_settlepaisa_revenue / 100).toFixed(2)} (${aggregates.settlepaisa_share_percent}%)`);

    res.json({
      success: true,
      aggregates: {
        total_settlements: aggregates.total_settlements,
        total_transactions: aggregates.total_transactions,
        total_gross_amount: aggregates.total_gross_amount / 100,
        total_commission: aggregates.total_commission / 100,
        total_bank_charges: aggregates.total_bank_charges / 100,
        total_settlepaisa_revenue: aggregates.total_settlepaisa_revenue / 100,
        bank_share_percent: parseFloat(aggregates.bank_share_percent),
        settlepaisa_share_percent: parseFloat(aggregates.settlepaisa_share_percent)
      },
      settlements: settlements,
      query: {
        start_date,
        end_date,
        merchant_id: merchant_id || null
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [Bank Fee Analytics] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  log(`🚀 [V2 Overview API] Running on port ${PORT}`);
  log(`📊 Real data endpoint: GET http://localhost:${PORT}/api/overview`);
  log(`📈 Statistics: GET http://localhost:${PORT}/api/stats`);
  log(`🔌 Connector health: GET http://localhost:${PORT}/api/connectors/health`);
  log(`📋 Settlement reports: GET http://localhost:${PORT}/api/reports/settlements`);
  log(`🏦 Bank MIS reports: GET http://localhost:${PORT}/api/reports/bank-mis`);
  log(`🔄 Recon outcome: GET http://localhost:${PORT}/api/reports/recon-outcome`);
  log(`💰 Tax reports: GET http://localhost:${PORT}/api/reports/tax`);
  log(`💵 Bank fee analytics: GET http://localhost:${PORT}/api/analytics/bank-fees?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`);
});

module.exports = app;