const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const cron = require('node-cron');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PG_INGESTION_PORT || 5111;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/json' }));

// Rate limiting for webhooks
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many webhook requests'
});

// PostgreSQL V2 Database connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

// V1 SettlePaisa Production API Configuration
const V1_CONFIG = {
  production: {
    apiUrl: 'https://settlepaisaapi.sabpaisa.in',
    apiKey: process.env.SETTLEPAISA_API_KEY || '',
    jwtToken: process.env.SETTLEPAISA_JWT_TOKEN || ''
  },
  staging: {
    apiUrl: 'https://settlepaisainternalapi.sabpaisa.in',
    apiKey: process.env.SETTLEPAISA_STAGING_API_KEY || '',
    jwtToken: process.env.SETTLEPAISA_STAGING_JWT_TOKEN || ''
  }
};

// Current environment (production/staging)
const CURRENT_ENV = process.env.SETTLEPAISA_ENV || 'staging';
const API_CONFIG = V1_CONFIG[CURRENT_ENV];

// PG Gateway configurations (for webhook validation)
const PG_CONFIGS = {
  'razorpay': {
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'webhook_secret'
  },
  'payu': {
    webhookSecret: process.env.PAYU_WEBHOOK_SECRET || 'webhook_secret'
  },
  'paytm': {
    webhookSecret: process.env.PAYTM_WEBHOOK_SECRET || 'webhook_secret'
  }
};

// Transaction deduplication cache (in production, use Redis)
const processedTransactions = new Set();

// Utility: Insert transaction into V2 database
async function insertTransaction(transaction) {
  try {
    // Check for duplicates
    const duplicateKey = `${transaction.gateway}_${transaction.pgw_ref}`;
    if (processedTransactions.has(duplicateKey)) {
      console.log(`[DUPLICATE] Skipping transaction ${transaction.pgw_ref} from ${transaction.gateway}`);
      return { success: false, reason: 'duplicate' };
    }

    // Insert into sp_v2_transactions_v1 table
    const query = `
      INSERT INTO sp_v2_transactions_v1 
      (merchant_id, pgw_ref, amount_paise, utr, payment_mode, status, gateway, gateway_txn_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (pgw_ref) DO UPDATE SET
        status = EXCLUDED.status,
        utr = EXCLUDED.utr,
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `;

    const values = [
      transaction.merchant_id,
      transaction.pgw_ref,
      transaction.amount_paise,
      transaction.utr || null,
      transaction.payment_mode,
      transaction.status,
      transaction.gateway,
      transaction.gateway_txn_id,
      transaction.created_at || new Date().toISOString(),
      new Date().toISOString()
    ];

    const result = await pool.query(query, values);
    
    // Add to deduplication cache
    processedTransactions.add(duplicateKey);
    
    console.log(`[SUCCESS] Inserted transaction ${transaction.pgw_ref} from ${transaction.gateway}`);
    return { success: true, id: result.rows[0].id };

  } catch (error) {
    console.error(`[ERROR] Failed to insert transaction ${transaction.pgw_ref}:`, error.message);
    return { success: false, reason: error.message };
  }
}

// Utility: Transform gateway-specific data to V2 format
function transformToV2Format(gateway, rawData) {
  switch (gateway) {
    case 'razorpay':
      return {
        gateway: 'razorpay',
        merchant_id: rawData.notes?.merchant_id || 'RAZORPAY_MERCHANT',
        pgw_ref: rawData.id, // Razorpay payment ID
        gateway_txn_id: rawData.id,
        amount_paise: rawData.amount,
        utr: rawData.acquirer_data?.utr || null,
        payment_mode: rawData.method?.toUpperCase() || 'UPI',
        status: rawData.status === 'captured' ? 'SUCCESS' : 'PENDING',
        created_at: new Date(rawData.created_at * 1000).toISOString()
      };
      
    case 'payu':
      return {
        gateway: 'payu',
        merchant_id: rawData.udf1 || 'PAYU_MERCHANT',
        pgw_ref: rawData.mihpayid,
        gateway_txn_id: rawData.payuMoneyId || rawData.mihpayid,
        amount_paise: Math.round(parseFloat(rawData.amount) * 100),
        utr: rawData.bank_ref_num,
        payment_mode: rawData.mode?.toUpperCase() || 'CARD',
        status: rawData.status === 'success' ? 'SUCCESS' : 'PENDING',
        created_at: rawData.addedon || new Date().toISOString()
      };
      
    case 'paytm':
      return {
        gateway: 'paytm',
        merchant_id: rawData.MID || 'PAYTM_MERCHANT',
        pgw_ref: rawData.ORDERID,
        gateway_txn_id: rawData.TXNID,
        amount_paise: Math.round(parseFloat(rawData.TXNAMOUNT) * 100),
        utr: rawData.BANKTXNID,
        payment_mode: rawData.PAYMENTMODE?.toUpperCase() || 'UPI',
        status: rawData.STATUS === 'TXN_SUCCESS' ? 'SUCCESS' : 'PENDING',
        created_at: rawData.TXNDATE || new Date().toISOString()
      };
      
    default:
      throw new Error(`Unsupported gateway: ${gateway}`);
  }
}

// V1 API Polling Service - Fetch transactions from SettlePaisa V1 API
async function pollV1Transactions() {
  try {
    console.log(`[POLL] Starting V1 SettlePaisa transaction polling...`);
    
    // Get last polling timestamp (in production, store in database)
    const fromDate = new Date(Date.now() - 5 * 60 * 1000).toISOString().split('T')[0]; // Last 5 minutes worth
    const toDate = new Date().toISOString().split('T')[0];
    
    // Fetch from V1 reconciliation data endpoint
    const transactions = await fetchV1ReconData(fromDate, toDate);
    
    console.log(`[POLL] Fetched ${transactions.length} transactions from V1 API`);
    
    // Process each transaction
    let successCount = 0;
    let errorCount = 0;
    
    for (const rawTxn of transactions) {
      try {
        const v2Transaction = transformV1ToV2Format(rawTxn);
        const result = await insertTransaction(v2Transaction);
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`[POLL] Error processing V1 transaction:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`[POLL] V1 polling completed - Success: ${successCount}, Errors: ${errorCount}`);
    
  } catch (error) {
    console.error(`[POLL] Failed to poll V1 API:`, error.message);
  }
}

// V1 SettlePaisa API Integration
async function fetchV1ReconData(fromDate, toDate) {
  try {
    const url = `${API_CONFIG.apiUrl}/merchant_data/get_recon_data`;
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_CONFIG.jwtToken}`
    };
    
    const params = {
      from_date: fromDate,
      to_date: toDate,
      limit: 1000, // Fetch up to 1000 transactions per call
      offset: 0
    };
    
    console.log(`[V1 API] Fetching recon data from ${url}`, params);
    
    const response = await axios.get(url, { 
      headers,
      params,
      timeout: 30000 // 30 second timeout
    });
    
    if (response.status !== 200) {
      throw new Error(`V1 API returned status ${response.status}: ${response.statusText}`);
    }
    
    const data = response.data;
    
    // Extract transactions from V1 response format
    if (data && data.data && Array.isArray(data.data)) {
      return data.data;
    }
    
    console.log('[V1 API] No transaction data found in response');
    return [];
    
  } catch (error) {
    if (error.response) {
      console.error(`[V1 API] HTTP Error ${error.response.status}:`, error.response.data);
    } else if (error.request) {
      console.error('[V1 API] Network Error:', error.message);
    } else {
      console.error('[V1 API] Request Error:', error.message);
    }
    
    // Return empty array on error (don't crash the service)
    return [];
  }
}

// Transform V1 reconciliation data to V2 format
function transformV1ToV2Format(v1Data) {
  return {
    gateway: 'settlepaisa_v1',
    merchant_id: v1Data.merchant_id || 'UNKNOWN',
    pgw_ref: v1Data.transaction_id || v1Data.payment_id,
    gateway_txn_id: v1Data.gateway_transaction_id || v1Data.transaction_id,
    amount_paise: Math.round(parseFloat(v1Data.amount || 0) * 100), // Convert rupees to paise
    utr: v1Data.utr || v1Data.bank_reference_number,
    payment_mode: (v1Data.payment_method || v1Data.mode || 'UPI').toUpperCase(),
    status: v1Data.status === 'SUCCESS' || v1Data.status === 'CAPTURED' ? 'SUCCESS' : 'PENDING',
    created_at: v1Data.created_at || v1Data.transaction_date || new Date().toISOString()
  };
}

// Webhook endpoints for real-time transaction updates
app.post('/webhooks/razorpay', webhookLimiter, async (req, res) => {
  try {
    // Verify webhook signature (in production)
    const signature = req.headers['x-razorpay-signature'];
    // const body = JSON.stringify(req.body);
    // const expectedSignature = crypto.createHmac('sha256', PG_CONFIGS.razorpay.webhookSecret).update(body).digest('hex');
    
    const event = req.body;
    console.log(`[WEBHOOK] Razorpay event: ${event.event}`);
    
    if (event.event === 'payment.captured' || event.event === 'payment.failed') {
      const v2Transaction = transformToV2Format('razorpay', event.payload.payment.entity);
      const result = await insertTransaction(v2Transaction);
      
      console.log(`[WEBHOOK] Razorpay transaction processed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    }
    
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('[WEBHOOK] Razorpay error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.post('/webhooks/payu', webhookLimiter, async (req, res) => {
  try {
    console.log('[WEBHOOK] PayU notification received');
    
    const v2Transaction = transformToV2Format('payu', req.body);
    const result = await insertTransaction(v2Transaction);
    
    console.log(`[WEBHOOK] PayU transaction processed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    res.json({ status: 'success' });
  } catch (error) {
    console.error('[WEBHOOK] PayU error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.post('/webhooks/paytm', webhookLimiter, async (req, res) => {
  try {
    console.log('[WEBHOOK] Paytm callback received');
    
    const v2Transaction = transformToV2Format('paytm', req.body);
    const result = await insertTransaction(v2Transaction);
    
    console.log(`[WEBHOOK] Paytm transaction processed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    res.json({ STATUS: 'OK' });
  } catch (error) {
    console.error('[WEBHOOK] Paytm error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Manual trigger endpoints for testing
app.post('/api/trigger-poll/v1', async (req, res) => {
  try {
    await pollV1Transactions();
    res.json({ message: 'V1 polling triggered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy gateway polling (kept for webhook testing)
app.post('/api/trigger-poll/:gateway', async (req, res) => {
  const { gateway } = req.params;
  
  if (!PG_CONFIGS[gateway]) {
    return res.status(400).json({ error: 'Unsupported gateway' });
  }
  
  res.json({ message: `Gateway ${gateway} polling disabled - Use V1 API instead` });
});

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        gateway,
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successful_transactions,
        SUM(amount_paise) as total_amount_paise,
        MAX(updated_at) as last_transaction
      FROM sp_v2_transactions_v1 
      WHERE gateway IS NOT NULL
      GROUP BY gateway
      ORDER BY total_transactions DESC
    `);
    
    res.json({
      by_gateway: stats.rows,
      cache_size: processedTransactions.size,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'pg-ingestion',
    gateways: Object.keys(PG_CONFIGS),
    uptime: process.uptime()
  });
});

// Schedule V1 API polling jobs (every 2 minutes)
cron.schedule('*/2 * * * *', () => {
  console.log('[CRON] Starting scheduled V1 API polling...');
  pollV1Transactions();
});

// Clear deduplication cache every hour
cron.schedule('0 * * * *', () => {
  console.log('[CRON] Clearing deduplication cache...');
  processedTransactions.clear();
});

// Start server
app.listen(PORT, () => {
  console.log(`[PG INGESTION] V2 Real-time PG Ingestion Service running on port ${PORT}`);
  console.log(`[PG INGESTION] Environment: ${CURRENT_ENV}`);
  console.log(`[PG INGESTION] V1 API URL: ${API_CONFIG.apiUrl}`);
  console.log(`[PG INGESTION] V2 Database: settlepaisa_v2 (PostgreSQL)`);
  console.log(`[PG INGESTION] API Endpoints:`);
  console.log(`  - POST /api/trigger-poll/v1 (Manual V1 polling)`);
  console.log(`  - GET /api/stats (Service statistics)`);
  console.log(`  - GET /health (Health check)`);
  console.log(`[PG INGESTION] Webhook endpoints (for external PG notifications):`);
  console.log(`  - POST /webhooks/razorpay`);
  console.log(`  - POST /webhooks/payu`);  
  console.log(`  - POST /webhooks/paytm`);
  console.log(`[PG INGESTION] V1 API polling scheduled every 2 minutes`);
  console.log(`[PG INGESTION] Ready to stream PG transactions from V1 → V2 database`);
});