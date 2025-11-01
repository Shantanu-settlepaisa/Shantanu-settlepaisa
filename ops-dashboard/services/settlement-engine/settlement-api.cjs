const config = require('../config/env.cjs');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const SettlementCalculator = require('./settlement-calculator.cjs');
const { calculateMerchantSettlement, completeSettlementProcessing } = require('./settlement-calculator-with-deductions.cjs');
// const { createHealthCheckEndpoint } = require('../health-check');

// Security: Authentication middleware (CRIT-003)
const { authenticate, canApprove, opsStaffOnly } = require('../overview-api/middleware/authMiddleware.cjs');
const { corsOptions } = require('../config/corsConfig.cjs');

// Development logging (gated in production)
const isDev = config.app.nodeEnv !== 'production';
const log = (...args) => isDev && console.log(...args);

const app = express();
const PORT = config.app.port || 5109;

// Database pool with production-ready configuration
// Auto-detect RDS and enable SSL
const isRDS = config.db.host && config.db.host.includes('.rds.amazonaws.com');
const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Always use SSL for RDS instances
  ssl: isRDS ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => console.error('[Settlement Pool Error]', err));

// Initialize settlement calculator
const calculator = new SettlementCalculator();

// Middleware
// Security: Restrict CORS to whitelisted origins (HIGH-001)
app.use(cors(corsOptions));
app.use(express.json());

// Get commission tier for merchant
// Security: Requires authentication (CRIT-003)
app.get('/api/commission-tier/:merchantId', authenticate, opsStaffOnly, async (req, res) => {
  try {
    const { merchantId } = req.params;
    const tier = await calculator.getCommissionTier(merchantId);
    
    res.json({
      success: true,
      merchantId,
      tier,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [Settlement API] Commission tier error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Calculate settlement for specific transactions
// Security: Requires authentication (CRIT-003)
app.post('/api/calculate-settlement', authenticate, opsStaffOnly, async (req, res) => {
  try {
    const { transactions, merchantId, batchDate } = req.body;
    
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({
        success: false,
        error: 'Transactions array is required'
      });
    }
    
    const settlement = await calculator.calculateSettlement(
      transactions,
      merchantId || 'default',
      batchDate ? new Date(batchDate) : new Date()
    );
    
    res.json({
      success: true,
      settlement,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [Settlement API] Calculation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Calculate settlement with refund and chargeback deductions
// Security: Requires authentication and approval permission (CRIT-003)
app.post('/api/settlements/calculate-with-deductions', authenticate, canApprove, async (req, res) => {
  try {
    const { merchantId, cycleDate } = req.body;

    if (!merchantId || !cycleDate) {
      return res.status(400).json({
        success: false,
        error: 'merchantId and cycleDate are required'
      });
    }

    log('🧮 [Settlement API] Calculating with deductions:', { merchantId, cycleDate });

    const settlement = await calculateMerchantSettlement(merchantId, cycleDate);

    res.json({
      success: true,
      settlement,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [Settlement API] Calculation with deductions error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get pending transactions for settlement
app.get('/api/pending-transactions', async (req, res) => {
  try {
    const { merchantId, limit } = req.query;
    
    const transactions = await calculator.getPendingTransactions(
      merchantId || null,
      parseInt(limit) || 100
    );
    
    res.json({
      success: true,
      count: transactions.length,
      transactions,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [Settlement API] Pending transactions error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Process settlements for pending transactions
app.post('/api/process-settlements', async (req, res) => {
  try {
    const { merchantId } = req.body;
    
    log('🚀 [Settlement API] Starting settlement processing...');
    
    const settlements = await calculator.processSettlements(merchantId || null);
    
    res.json({
      success: true,
      message: `Created ${settlements.length} settlement batches`,
      settlements,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [Settlement API] Processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get settlement batches
app.get('/api/settlement-batches', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const query = `
      SELECT 
        id, merchant_id, cycle_date, total_transactions,
        gross_amount_paise, total_commission_paise, total_gst_paise, 
        total_reserve_paise, net_amount_paise,
        status, created_at, updated_at
      FROM sp_v2_settlement_batches 
      ORDER BY created_at DESC 
      LIMIT 50
    `;
    
    const result = await client.query(query);
    client.release();
    
    res.json({
      success: true,
      count: result.rows.length,
      batches: result.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [Settlement API] Batches error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get all settlements (alias for settlement-batches for frontend compatibility)
app.get('/api/settlements', async (req, res) => {
  try {
    const client = await pool.connect();

    const query = `
      SELECT
        id, merchant_id, cycle_date, total_transactions,
        gross_amount_paise, total_commission_paise, total_gst_paise,
        total_reserve_paise, net_amount_paise,
        status, created_at, updated_at
      FROM sp_v2_settlement_batches
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const result = await client.query(query);
    client.release();

    // Return array directly for frontend compatibility
    res.json(result.rows);

  } catch (error) {
    console.error('❌ [Settlement API] Settlements error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get single settlement batch by ID
app.get('/api/settlements/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const client = await pool.connect();

    const query = `
      SELECT
        id, merchant_id, cycle_date, total_transactions,
        gross_amount_paise, total_commission_paise, total_gst_paise,
        total_reserve_paise, net_amount_paise, total_tds_paise,
        status, created_at, updated_at, approved_at, sent_to_bank_at,
        bank_reference, failure_reason
      FROM sp_v2_settlement_batches
      WHERE id = $1
    `;

    const result = await client.query(query, [batchId]);
    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Settlement batch not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      batch: result.rows[0],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [Settlement API] Settlement details error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint with database connectivity test
// createHealthCheckEndpoint(app, 'settlement-engine', pool);
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'settlement-engine' }));

app.listen(PORT, () => {
  log(`💰 [Settlement Engine] Running on port ${PORT}`);
  log(`🧮 Commission API: GET http://localhost:${PORT}/api/commission-tier/:merchantId`);
  log(`⚙️  Calculate API: POST http://localhost:${PORT}/api/calculate-settlement`);
  log(`💳 Calculate (with deductions): POST http://localhost:${PORT}/api/settlements/calculate-with-deductions`);
  log(`📋 Pending API: GET http://localhost:${PORT}/api/pending-transactions`);
  log(`🚀 Process API: POST http://localhost:${PORT}/api/process-settlements`);
  log(`📊 Settlements API: GET http://localhost:${PORT}/api/settlements`);
  log(`📄 Settlement Details API: GET http://localhost:${PORT}/api/settlements/:batchId`);
  log(`📊 Batches API: GET http://localhost:${PORT}/api/settlement-batches`);
});

module.exports = app;