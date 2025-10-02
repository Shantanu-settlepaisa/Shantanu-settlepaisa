const express = require('express');
const cors = require('cors');
const SettlementCalculator = require('./settlement-calculator.cjs');

const app = express();
const PORT = process.env.PORT || 5109;

// Initialize settlement calculator
const calculator = new SettlementCalculator();

// Middleware
app.use(cors());
app.use(express.json());

// Get commission tier for merchant
app.get('/api/commission-tier/:merchantId', async (req, res) => {
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
app.post('/api/calculate-settlement', async (req, res) => {
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
    
    console.log('🚀 [Settlement API] Starting settlement processing...');
    
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
    const { Pool } = require('pg');
    const pool = new Pool({
      user: 'postgres',
      host: 'localhost',
      database: 'settlepaisa_v2',
      password: 'settlepaisa123',
      port: 5433,
    });
    
    const client = await pool.connect();
    
    const query = `
      SELECT 
        id, merchant_id, cycle_date, total_transactions,
        gross_amount_paise, total_commission_paise, total_gst_paise, 
        total_tds_paise, total_reserve_paise, net_amount_paise,
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'settlement-engine',
    timestamp: new Date().toISOString(),
    features: [
      'V1-compatible commission tiers',
      'Tax calculations (GST/TDS/Reserve)',
      'Volume-based pricing',
      'Batch settlement processing'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`💰 [Settlement Engine] Running on port ${PORT}`);
  console.log(`🧮 Commission API: GET http://localhost:${PORT}/api/commission-tier/:merchantId`);
  console.log(`⚙️  Calculate API: POST http://localhost:${PORT}/api/calculate-settlement`);
  console.log(`📋 Pending API: GET http://localhost:${PORT}/api/pending-transactions`);
  console.log(`🚀 Process API: POST http://localhost:${PORT}/api/process-settlements`);
  console.log(`📊 Batches API: GET http://localhost:${PORT}/api/settlement-batches`);
});

module.exports = app;