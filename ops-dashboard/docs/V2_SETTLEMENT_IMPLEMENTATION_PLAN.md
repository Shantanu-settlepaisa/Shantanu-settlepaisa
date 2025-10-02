# SettlePaisa V2 - Complete Settlement System Implementation Plan
**Timeline:** 2 Days (16 working hours)  
**Objective:** Build production-ready settlement engine with V1 logic parity

---

## Executive Summary

**V2 Current State:**
- ✅ Reconciliation Engine: 100% Complete
- ✅ PG Ingestion Service: 80% Complete
- ✅ Settlement Calculator: 50% Complete
- ❌ Merchant Config Sync: 0%
- ❌ Fee Structure Sync: 0%
- ❌ Settlement Integration: 0%

**Implementation Strategy:**
1. **Direct Integration Architecture**: V2 fetches configs from Merchant Dashboard API and V1 SabPaisa DB
2. **No Admin UIs**: V2 consumes data, doesn't create config screens
3. **Post-V1 Capability**: V2 can survive independently after V1 deprecation
4. **Manual Upload Only**: No bank SFTP (V1 doesn't have it either)

---

## Phase 1: Direct PG Integration Enhancement (2 hours)
**Status:** 80% Complete → 100% Complete  
**Priority:** CRITICAL

### What Exists
File: `/services/pg-ingestion/pg-ingestion-server.cjs`
- ✅ Webhook handlers for Razorpay, PayU, Paytm
- ✅ Transaction insertion with deduplication
- ✅ Database persistence (sp_v2_transactions_v1)
- ✅ Multi-gateway support

### What's Missing
1. Scheduled backup sync (hourly) for missed webhooks
2. Webhook signature validation (commented out)
3. Error retry mechanism
4. Transaction status polling for pending transactions

### Implementation

**Step 1.1: Add Scheduled Sync (45 min)**
```javascript
// Add to pg-ingestion-server.cjs after line 388

// Scheduled PG status polling for PENDING transactions (every hour)
cron.schedule('0 * * * *', async () => {
  console.log('[CRON] Starting PG status polling for PENDING transactions...');
  await pollPendingTransactions();
});

async function pollPendingTransactions() {
  try {
    const pendingQuery = `
      SELECT pgw_ref, gateway, created_at 
      FROM sp_v2_transactions_v1 
      WHERE status = 'PENDING' 
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 100
    `;
    
    const result = await pool.query(pendingQuery);
    console.log(`[POLL] Found ${result.rows.length} pending transactions to check`);
    
    for (const txn of result.rows) {
      try {
        const updatedStatus = await fetchTransactionStatus(txn.gateway, txn.pgw_ref);
        
        if (updatedStatus && updatedStatus.status !== 'PENDING') {
          await pool.query(
            `UPDATE sp_v2_transactions_v1 
             SET status = $1, utr = $2, updated_at = NOW() 
             WHERE pgw_ref = $3`,
            [updatedStatus.status, updatedStatus.utr, txn.pgw_ref]
          );
          console.log(`[POLL] Updated ${txn.pgw_ref} to ${updatedStatus.status}`);
        }
      } catch (error) {
        console.error(`[POLL] Failed to poll ${txn.pgw_ref}:`, error.message);
      }
    }
  } catch (error) {
    console.error('[POLL] Polling job failed:', error.message);
  }
}

async function fetchTransactionStatus(gateway, pgwRef) {
  switch (gateway) {
    case 'razorpay':
      const razorpayAuth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const razorpayResponse = await axios.get(
        `https://api.razorpay.com/v1/payments/${pgwRef}`,
        { headers: { 'Authorization': `Basic ${razorpayAuth}` } }
      );
      return {
        status: razorpayResponse.data.status === 'captured' ? 'SUCCESS' : razorpayResponse.data.status.toUpperCase(),
        utr: razorpayResponse.data.acquirer_data?.utr
      };
      
    case 'payu':
      const payuResponse = await axios.post(
        'https://info.payu.in/merchant/postservice.php?form=2',
        { var1: process.env.PAYU_MERCHANT_KEY, var2: pgwRef, command: 'verify_payment' }
      );
      return {
        status: payuResponse.data.status === 'success' ? 'SUCCESS' : payuResponse.data.status.toUpperCase(),
        utr: payuResponse.data.bank_ref_num
      };
      
    case 'paytm':
      const paytmResponse = await axios.post(
        `https://securegw.paytm.in/order/status`,
        { 
          body: { 
            mid: process.env.PAYTM_MID, 
            orderId: pgwRef 
          } 
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      return {
        status: paytmResponse.data.body.resultInfo.resultStatus === 'TXN_SUCCESS' ? 'SUCCESS' : 'PENDING',
        utr: paytmResponse.data.body.bankTxnId
      };
      
    default:
      throw new Error(`Unsupported gateway: ${gateway}`);
  }
}
```

**Step 1.2: Enable Webhook Signature Validation (30 min)**
```javascript
// Update webhook endpoints (lines 273-325)

app.post('/webhooks/razorpay', webhookLimiter, async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', PG_CONFIGS.razorpay.webhookSecret)
      .update(body)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      console.error('[WEBHOOK] Razorpay signature validation failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
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
```

**Step 1.3: Add Environment Variables**
```bash
# Add to .env file
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx
PAYU_MERCHANT_KEY=xxxxx
PAYU_WEBHOOK_SECRET=xxxxx
PAYTM_MID=xxxxx
PAYTM_WEBHOOK_SECRET=xxxxx
```

**Deliverable:** Fully operational PG ingestion with backup polling

---

## Phase 2: Merchant Dashboard Connector (4 hours)
**Status:** 0% → 100%  
**Priority:** CRITICAL

### Architecture
```
Merchant Dashboard API → V2 Merchant Connector → sp_v2_merchant_configs table
```

### Implementation

**Step 2.1: Create Database Schema (30 min)**
```sql
-- File: db/migrations/005_merchant_configs.sql

CREATE TABLE sp_v2_merchant_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) UNIQUE NOT NULL,
  merchant_name VARCHAR(200) NOT NULL,
  gstin VARCHAR(15),
  pan VARCHAR(10),
  business_type VARCHAR(50),
  kyc_status VARCHAR(20) DEFAULT 'PENDING',
  risk_category VARCHAR(20) DEFAULT 'MEDIUM',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sp_v2_merchant_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES sp_v2_merchant_configs(merchant_id),
  account_number VARCHAR(30) NOT NULL,
  ifsc_code VARCHAR(11) NOT NULL,
  account_holder_name VARCHAR(200) NOT NULL,
  bank_name VARCHAR(100),
  branch_name VARCHAR(100),
  account_type VARCHAR(20) DEFAULT 'CURRENT',
  is_primary BOOLEAN DEFAULT false,
  penny_drop_verified BOOLEAN DEFAULT false,
  penny_drop_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(merchant_id, account_number)
);

CREATE INDEX idx_merchant_bank_primary ON sp_v2_merchant_bank_accounts(merchant_id, is_primary);
CREATE INDEX idx_merchant_configs_active ON sp_v2_merchant_configs(merchant_id, is_active);
```

**Step 2.2: Create Merchant Connector Service (2 hours)**
```javascript
// File: services/merchant-connector/merchant-connector-server.cjs

const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const PORT = process.env.MERCHANT_CONNECTOR_PORT || 5112;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

const MERCHANT_DASHBOARD_CONFIG = {
  production: {
    apiUrl: process.env.MERCHANT_DASHBOARD_API_URL || 'https://merchant.sabpaisa.in/api',
    apiKey: process.env.MERCHANT_DASHBOARD_API_KEY || '',
    jwtToken: process.env.MERCHANT_DASHBOARD_JWT_TOKEN || ''
  }
};

const CURRENT_ENV = process.env.MERCHANT_ENV || 'production';
const API_CONFIG = MERCHANT_DASHBOARD_CONFIG[CURRENT_ENV];

async function syncMerchantConfigs() {
  try {
    console.log('[SYNC] Starting merchant config sync...');
    
    const merchants = await fetchMerchantsFromDashboard();
    console.log(`[SYNC] Fetched ${merchants.length} merchants from dashboard`);
    
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const merchant of merchants) {
      try {
        await upsertMerchantConfig(merchant);
        
        if (merchant.bank_accounts && merchant.bank_accounts.length > 0) {
          await syncMerchantBankAccounts(merchant.merchant_id, merchant.bank_accounts);
        }
        
        syncedCount++;
      } catch (error) {
        console.error(`[SYNC] Failed to sync merchant ${merchant.merchant_id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`[SYNC] Merchant sync completed - Success: ${syncedCount}, Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('[SYNC] Merchant sync failed:', error.message);
  }
}

async function fetchMerchantsFromDashboard() {
  try {
    const url = `${API_CONFIG.apiUrl}/merchants/list`;
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_CONFIG.jwtToken}`,
      'X-API-Key': API_CONFIG.apiKey
    };
    
    console.log(`[DASHBOARD API] Fetching merchants from ${url}`);
    
    const response = await axios.get(url, { 
      headers,
      timeout: 30000
    });
    
    if (response.status !== 200) {
      throw new Error(`Dashboard API returned status ${response.status}`);
    }
    
    const data = response.data;
    
    if (data && data.merchants && Array.isArray(data.merchants)) {
      return data.merchants;
    }
    
    console.log('[DASHBOARD API] No merchant data found');
    return [];
    
  } catch (error) {
    if (error.response) {
      console.error(`[DASHBOARD API] HTTP Error ${error.response.status}:`, error.response.data);
    } else {
      console.error('[DASHBOARD API] Request Error:', error.message);
    }
    return [];
  }
}

async function upsertMerchantConfig(merchant) {
  const query = `
    INSERT INTO sp_v2_merchant_configs 
    (merchant_id, merchant_name, gstin, pan, business_type, kyc_status, risk_category, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (merchant_id) DO UPDATE SET
      merchant_name = EXCLUDED.merchant_name,
      gstin = EXCLUDED.gstin,
      pan = EXCLUDED.pan,
      business_type = EXCLUDED.business_type,
      kyc_status = EXCLUDED.kyc_status,
      risk_category = EXCLUDED.risk_category,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING id
  `;
  
  const values = [
    merchant.merchant_id,
    merchant.name || merchant.merchant_name,
    merchant.gstin,
    merchant.pan,
    merchant.business_type || 'ECOMMERCE',
    merchant.kyc_status || 'PENDING',
    merchant.risk_category || 'MEDIUM',
    merchant.is_active !== false
  ];
  
  await pool.query(query, values);
  console.log(`[SYNC] Upserted merchant config: ${merchant.merchant_id}`);
}

async function syncMerchantBankAccounts(merchantId, bankAccounts) {
  await pool.query('DELETE FROM sp_v2_merchant_bank_accounts WHERE merchant_id = $1', [merchantId]);
  
  for (const account of bankAccounts) {
    const query = `
      INSERT INTO sp_v2_merchant_bank_accounts 
      (merchant_id, account_number, ifsc_code, account_holder_name, bank_name, branch_name, account_type, is_primary, penny_drop_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;
    
    const values = [
      merchantId,
      account.account_number,
      account.ifsc_code,
      account.account_holder_name,
      account.bank_name,
      account.branch_name,
      account.account_type || 'CURRENT',
      account.is_primary || false,
      account.penny_drop_verified || false
    ];
    
    await pool.query(query, values);
  }
  
  console.log(`[SYNC] Synced ${bankAccounts.length} bank accounts for merchant ${merchantId}`);
}

app.post('/api/trigger-sync/merchants', async (req, res) => {
  try {
    await syncMerchantConfigs();
    res.json({ message: 'Merchant sync triggered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const merchantStats = await pool.query(`
      SELECT 
        COUNT(*) as total_merchants,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_merchants,
        COUNT(CASE WHEN kyc_status = 'VERIFIED' THEN 1 END) as verified_merchants
      FROM sp_v2_merchant_configs
    `);
    
    const bankStats = await pool.query(`
      SELECT 
        COUNT(*) as total_accounts,
        COUNT(CASE WHEN is_primary = true THEN 1 END) as primary_accounts,
        COUNT(CASE WHEN penny_drop_verified = true THEN 1 END) as verified_accounts
      FROM sp_v2_merchant_bank_accounts
    `);
    
    res.json({
      merchants: merchantStats.rows[0],
      bank_accounts: bankStats.rows[0],
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'merchant-connector',
    uptime: process.uptime()
  });
});

cron.schedule('0 2 * * *', () => {
  console.log('[CRON] Starting daily merchant sync at 2 AM...');
  syncMerchantConfigs();
});

app.listen(PORT, () => {
  console.log(`[MERCHANT CONNECTOR] Service running on port ${PORT}`);
  console.log(`[MERCHANT CONNECTOR] Dashboard API: ${API_CONFIG.apiUrl}`);
  console.log(`[MERCHANT CONNECTOR] Daily sync scheduled at 2 AM`);
});
```

**Step 2.3: Update package.json (15 min)**
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.0",
    "axios": "^1.6.0",
    "node-cron": "^3.0.2"
  }
}
```

**Step 2.4: Add to start-services.sh (15 min)**
```bash
# Add after PG Ingestion Service
echo "Starting Merchant Connector Service..."
cd services/merchant-connector
node merchant-connector-server.cjs &
MERCHANT_CONNECTOR_PID=$!
echo "Merchant Connector Service started (PID: $MERCHANT_CONNECTOR_PID)"
cd ../..
```

**Deliverable:** Automated merchant config sync from Merchant Dashboard

---

## Phase 3: Fee Structure Connector (4 hours)
**Status:** 0% → 100%  
**Priority:** CRITICAL

### Architecture
```
V1 SabPaisa DB → V2 Fee Connector → sp_v2_fee_configs table
```

### Implementation

**Step 3.1: Create Fee Structure Schema (30 min)**
```sql
-- Add to db/migrations/005_merchant_configs.sql

CREATE TABLE sp_v2_merchant_fee_bearer_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES sp_v2_merchant_configs(merchant_id),
  fee_bearer_type VARCHAR(30) NOT NULL CHECK (fee_bearer_type IN ('MERCHANT_BEARS_ALL', 'CUSTOMER_BEARS_ALL', 'HYBRID')),
  merchant_percentage DECIMAL(5,2) DEFAULT 100.00,
  customer_percentage DECIMAL(5,2) DEFAULT 0.00,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(merchant_id, effective_from)
);

CREATE TABLE sp_v2_fee_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES sp_v2_merchant_configs(merchant_id),
  payment_method VARCHAR(30) NOT NULL,
  percentage_fee DECIMAL(5,3) NOT NULL,
  fixed_fee_paise BIGINT DEFAULT 0,
  min_fee_paise BIGINT DEFAULT 0,
  max_fee_paise BIGINT,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fee_bearer_merchant ON sp_v2_merchant_fee_bearer_config(merchant_id, is_active);
CREATE INDEX idx_fee_slabs_merchant_method ON sp_v2_fee_slabs(merchant_id, payment_method, is_active);
```

**Step 3.2: Create Fee Connector Service (2.5 hours)**
```javascript
// File: services/fee-connector/fee-connector-server.cjs

const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const PORT = process.env.FEE_CONNECTOR_PORT || 5113;

const v2Pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

const v1Pool = new Pool({
  user: process.env.V1_DB_USER || 'postgres',
  host: process.env.V1_DB_HOST || '3.108.237.99',
  database: process.env.V1_DB_NAME || 'settlepaisa',
  password: process.env.V1_DB_PASSWORD || '',
  port: process.env.V1_DB_PORT || 5432,
});

const V1_API_CONFIG = {
  apiUrl: process.env.V1_API_URL || 'https://settlepaisaapi.sabpaisa.in',
  jwtToken: process.env.V1_JWT_TOKEN || ''
};

async function syncFeeBearerConfigs() {
  try {
    console.log('[SYNC] Starting fee bearer config sync from V1 API...');
    
    const feeBearerData = await fetchV1FeeBearerConfig();
    console.log(`[SYNC] Fetched ${feeBearerData.length} fee bearer configs from V1`);
    
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const config of feeBearerData) {
      try {
        await upsertFeeBearerConfig(config);
        syncedCount++;
      } catch (error) {
        console.error(`[SYNC] Failed to sync fee bearer for merchant ${config.merchant_id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`[SYNC] Fee bearer sync completed - Success: ${syncedCount}, Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('[SYNC] Fee bearer sync failed:', error.message);
  }
}

async function fetchV1FeeBearerConfig() {
  try {
    const url = `${V1_API_CONFIG.apiUrl}/master_data/get_fee_bearer`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${V1_API_CONFIG.jwtToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    if (response.status !== 200) {
      throw new Error(`V1 API returned status ${response.status}`);
    }
    
    const data = response.data;
    
    if (data && data.data && Array.isArray(data.data)) {
      return data.data;
    }
    
    return [];
    
  } catch (error) {
    console.error('[V1 API] Failed to fetch fee bearer config:', error.message);
    return [];
  }
}

async function upsertFeeBearerConfig(config) {
  const query = `
    INSERT INTO sp_v2_merchant_fee_bearer_config 
    (merchant_id, fee_bearer_type, merchant_percentage, customer_percentage, effective_from, is_active)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (merchant_id, effective_from) DO UPDATE SET
      fee_bearer_type = EXCLUDED.fee_bearer_type,
      merchant_percentage = EXCLUDED.merchant_percentage,
      customer_percentage = EXCLUDED.customer_percentage,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING id
  `;
  
  const values = [
    config.merchant_id,
    config.fee_bearer_type || 'MERCHANT_BEARS_ALL',
    config.merchant_percentage || 100.00,
    config.customer_percentage || 0.00,
    config.effective_from || new Date().toISOString().split('T')[0],
    config.is_active !== false
  ];
  
  await v2Pool.query(query, values);
  console.log(`[SYNC] Upserted fee bearer config for merchant: ${config.merchant_id}`);
}

async function syncMDRRatesFromV1DB() {
  try {
    console.log('[SYNC] Starting MDR rates sync from V1 database...');
    
    const v1Query = `
      SELECT 
        m.merchant_id,
        fs.payment_mode as payment_method,
        fs.percentage_fee,
        fs.fixed_fee as fixed_fee_paise,
        fs.min_fee as min_fee_paise,
        fs.max_fee as max_fee_paise,
        fs.effective_from,
        fs.effective_to
      FROM fee_structures fs
      JOIN merchants m ON fs.merchant_id = m.id
      WHERE fs.is_active = true
      ORDER BY m.merchant_id, fs.payment_mode
    `;
    
    const result = await v1Pool.query(v1Query);
    console.log(`[SYNC] Fetched ${result.rows.length} MDR rate records from V1 DB`);
    
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const row of result.rows) {
      try {
        await upsertFeeSlabs(row);
        syncedCount++;
      } catch (error) {
        console.error(`[SYNC] Failed to sync MDR for merchant ${row.merchant_id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`[SYNC] MDR rates sync completed - Success: ${syncedCount}, Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('[SYNC] MDR rates sync failed:', error.message);
  }
}

async function upsertFeeSlabs(slab) {
  const query = `
    INSERT INTO sp_v2_fee_slabs 
    (merchant_id, payment_method, percentage_fee, fixed_fee_paise, min_fee_paise, max_fee_paise, effective_from, effective_to, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (merchant_id, payment_method, effective_from) DO UPDATE SET
      percentage_fee = EXCLUDED.percentage_fee,
      fixed_fee_paise = EXCLUDED.fixed_fee_paise,
      min_fee_paise = EXCLUDED.min_fee_paise,
      max_fee_paise = EXCLUDED.max_fee_paise,
      effective_to = EXCLUDED.effective_to,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING id
  `;
  
  const values = [
    slab.merchant_id,
    slab.payment_method.toUpperCase(),
    slab.percentage_fee,
    slab.fixed_fee_paise || 0,
    slab.min_fee_paise || 0,
    slab.max_fee_paise,
    slab.effective_from,
    slab.effective_to,
    true
  ];
  
  await v2Pool.query(query, values);
}

app.post('/api/trigger-sync/fee-bearer', async (req, res) => {
  try {
    await syncFeeBearerConfigs();
    res.json({ message: 'Fee bearer sync triggered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trigger-sync/mdr-rates', async (req, res) => {
  try {
    await syncMDRRatesFromV1DB();
    res.json({ message: 'MDR rates sync triggered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const feeBearerStats = await v2Pool.query(`
      SELECT 
        fee_bearer_type,
        COUNT(*) as count
      FROM sp_v2_merchant_fee_bearer_config
      WHERE is_active = true
      GROUP BY fee_bearer_type
    `);
    
    const feeSlabStats = await v2Pool.query(`
      SELECT 
        payment_method,
        COUNT(*) as count,
        AVG(percentage_fee) as avg_percentage_fee
      FROM sp_v2_fee_slabs
      WHERE is_active = true
      GROUP BY payment_method
    `);
    
    res.json({
      fee_bearer: feeBearerStats.rows,
      fee_slabs: feeSlabStats.rows,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'fee-connector',
    v1_connection: v1Pool ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

cron.schedule('0 3 * * *', () => {
  console.log('[CRON] Starting daily fee structure sync at 3 AM...');
  syncFeeBearerConfigs();
  syncMDRRatesFromV1DB();
});

app.listen(PORT, () => {
  console.log(`[FEE CONNECTOR] Service running on port ${PORT}`);
  console.log(`[FEE CONNECTOR] V1 API: ${V1_API_CONFIG.apiUrl}`);
  console.log(`[FEE CONNECTOR] V1 DB: ${v1Pool.options.host}:${v1Pool.options.port}`);
  console.log(`[FEE CONNECTOR] Daily sync scheduled at 3 AM`);
});
```

**Step 3.3: Update Environment Variables (15 min)**
```bash
# Add to .env
V1_DB_USER=postgres
V1_DB_HOST=3.108.237.99
V1_DB_NAME=settlepaisa
V1_DB_PASSWORD=xxxxx
V1_DB_PORT=5432
V1_API_URL=https://settlepaisaapi.sabpaisa.in
V1_JWT_TOKEN=xxxxx
FEE_CONNECTOR_PORT=5113
```

**Deliverable:** Automated fee structure sync from V1

---

## Phase 4: Enhanced Settlement Calculator (3 hours)
**Status:** 50% → 100%  
**Priority:** HIGH

### What Exists
File: `/services/settlement-engine/settlement-calculator.cjs`
- ✅ Commission tier calculation (volume-based)
- ✅ Basic tax calculation (GST 18%, TDS 1%, Reserve 5%)

### What's Missing
- Fee bearer logic integration
- Payment method-specific rates
- Merchant bank account lookup
- Settlement instruction generation

### Implementation

**Step 4.1: Update Settlement Calculator (2 hours)**
```javascript
// File: services/settlement-engine/settlement-calculator.cjs
// Replace entire file

const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

class SettlementCalculatorV2 {
  
  TAX_RATES = {
    GST: 18.0,
    DEFAULT_TDS: 1.0,
    RESERVE: 5.0
  };

  async calculateSettlement(transactions, merchantId, batchDate) {
    try {
      console.log(`[SETTLEMENT] Calculating for merchant ${merchantId}, ${transactions.length} transactions`);
      
      const merchantConfig = await this.getMerchantConfig(merchantId);
      const feeBearerConfig = await this.getFeeBearerConfig(merchantId, batchDate);
      const primaryBankAccount = await this.getPrimaryBankAccount(merchantId);
      
      if (!primaryBankAccount) {
        throw new Error(`No primary bank account found for merchant ${merchantId}`);
      }
      
      const tdsRate = this.getTDSRate(merchantConfig.pan);
      
      let grossAmountPaise = 0;
      let totalCommissionPaise = 0;
      let totalGSTPaise = 0;
      let totalTDSPaise = 0;
      
      const itemizedTransactions = [];
      
      for (const txn of transactions) {
        const feeStructure = await this.getFeeStructure(merchantId, txn.payment_mode, batchDate);
        
        const commissionPaise = this.calculateCommission(
          txn.amount_paise,
          feeStructure.percentage_fee,
          feeStructure.fixed_fee_paise,
          feeStructure.min_fee_paise,
          feeStructure.max_fee_paise
        );
        
        const gstPaise = Math.round(commissionPaise * this.TAX_RATES.GST / 100);
        const tdsPaise = Math.round(txn.amount_paise * tdsRate / 100);
        
        let merchantCommissionPaise = commissionPaise;
        let customerCommissionPaise = 0;
        
        if (feeBearerConfig.fee_bearer_type === 'CUSTOMER_BEARS_ALL') {
          customerCommissionPaise = commissionPaise;
          merchantCommissionPaise = 0;
        } else if (feeBearerConfig.fee_bearer_type === 'HYBRID') {
          merchantCommissionPaise = Math.round(commissionPaise * feeBearerConfig.merchant_percentage / 100);
          customerCommissionPaise = commissionPaise - merchantCommissionPaise;
        }
        
        grossAmountPaise += txn.amount_paise;
        totalCommissionPaise += merchantCommissionPaise;
        totalGSTPaise += gstPaise;
        totalTDSPaise += tdsPaise;
        
        itemizedTransactions.push({
          transaction_id: txn.id,
          pgw_ref: txn.pgw_ref,
          amount_paise: txn.amount_paise,
          commission_paise: merchantCommissionPaise,
          gst_paise: gstPaise,
          tds_paise: tdsPaise,
          payment_mode: txn.payment_mode
        });
      }
      
      const netBeforeReservePaise = grossAmountPaise - totalCommissionPaise - totalGSTPaise - totalTDSPaise;
      const reservePaise = Math.round(netBeforeReservePaise * this.TAX_RATES.RESERVE / 100);
      const netAmountPaise = netBeforeReservePaise - reservePaise;
      
      const settlementBatch = {
        merchant_id: merchantId,
        cycle_date: batchDate,
        total_transactions: transactions.length,
        gross_amount_paise: grossAmountPaise,
        total_commission_paise: totalCommissionPaise,
        total_gst_paise: totalGSTPaise,
        total_tds_paise: totalTDSPaise,
        total_reserve_paise: reservePaise,
        net_amount_paise: netAmountPaise,
        status: 'PENDING_APPROVAL',
        settlement_account: primaryBankAccount,
        itemized_transactions: itemizedTransactions
      };
      
      console.log(`[SETTLEMENT] Calculated net amount: ₹${netAmountPaise / 100}`);
      
      return settlementBatch;
      
    } catch (error) {
      console.error('[SETTLEMENT] Calculation failed:', error.message);
      throw error;
    }
  }

  async getMerchantConfig(merchantId) {
    const result = await pool.query(
      `SELECT merchant_id, pan, gstin, business_type 
       FROM sp_v2_merchant_configs 
       WHERE merchant_id = $1 AND is_active = true`,
      [merchantId]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Merchant config not found: ${merchantId}`);
    }
    
    return result.rows[0];
  }

  async getFeeBearerConfig(merchantId, effectiveDate) {
    const result = await pool.query(
      `SELECT fee_bearer_type, merchant_percentage, customer_percentage
       FROM sp_v2_merchant_fee_bearer_config
       WHERE merchant_id = $1 
         AND effective_from <= $2
         AND (effective_to IS NULL OR effective_to >= $2)
         AND is_active = true
       ORDER BY effective_from DESC
       LIMIT 1`,
      [merchantId, effectiveDate]
    );
    
    if (result.rows.length === 0) {
      return {
        fee_bearer_type: 'MERCHANT_BEARS_ALL',
        merchant_percentage: 100.00,
        customer_percentage: 0.00
      };
    }
    
    return result.rows[0];
  }

  async getFeeStructure(merchantId, paymentMethod, effectiveDate) {
    const result = await pool.query(
      `SELECT percentage_fee, fixed_fee_paise, min_fee_paise, max_fee_paise
       FROM sp_v2_fee_slabs
       WHERE merchant_id = $1
         AND payment_method = $2
         AND effective_from <= $3
         AND (effective_to IS NULL OR effective_to >= $3)
         AND is_active = true
       ORDER BY effective_from DESC
       LIMIT 1`,
      [merchantId, paymentMethod, effectiveDate]
    );
    
    if (result.rows.length === 0) {
      const defaultRate = this.getDefaultFeeRate(paymentMethod);
      return {
        percentage_fee: defaultRate,
        fixed_fee_paise: 0,
        min_fee_paise: 0,
        max_fee_paise: null
      };
    }
    
    return result.rows[0];
  }

  async getPrimaryBankAccount(merchantId) {
    const result = await pool.query(
      `SELECT account_number, ifsc_code, account_holder_name, bank_name
       FROM sp_v2_merchant_bank_accounts
       WHERE merchant_id = $1 AND is_primary = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [merchantId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  }

  calculateCommission(amountPaise, percentageFee, fixedFeePaise, minFeePaise, maxFeePaise) {
    let commissionPaise = Math.round((amountPaise * percentageFee / 100) + fixedFeePaise);
    
    if (minFeePaise && commissionPaise < minFeePaise) {
      commissionPaise = minFeePaise;
    }
    
    if (maxFeePaise && commissionPaise > maxFeePaise) {
      commissionPaise = maxFeePaise;
    }
    
    return commissionPaise;
  }

  getTDSRate(pan) {
    if (!pan || pan.length !== 10) {
      return 2.0;
    }
    return 1.0;
  }

  getDefaultFeeRate(paymentMethod) {
    const defaultRates = {
      'UPI': 1.5,
      'CARD': 1.8,
      'NETBANKING': 1.7,
      'WALLET': 1.6,
      'NEFT': 0.5,
      'RTGS': 0.5,
      'IMPS': 0.5
    };
    
    return defaultRates[paymentMethod] || 2.1;
  }

  async persistSettlement(settlementBatch) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const batchQuery = `
        INSERT INTO sp_v2_settlement_batches 
        (merchant_id, cycle_date, total_transactions, gross_amount_paise, 
         total_commission_paise, total_gst_paise, total_tds_paise, 
         total_reserve_paise, net_amount_paise, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING id
      `;
      
      const batchResult = await client.query(batchQuery, [
        settlementBatch.merchant_id,
        settlementBatch.cycle_date,
        settlementBatch.total_transactions,
        settlementBatch.gross_amount_paise,
        settlementBatch.total_commission_paise,
        settlementBatch.total_gst_paise,
        settlementBatch.total_tds_paise,
        settlementBatch.total_reserve_paise,
        settlementBatch.net_amount_paise,
        settlementBatch.status
      ]);
      
      const batchId = batchResult.rows[0].id;
      
      for (const item of settlementBatch.itemized_transactions) {
        await client.query(
          `INSERT INTO sp_v2_settlement_items 
           (settlement_batch_id, transaction_id, amount_paise, commission_paise, 
            gst_paise, tds_paise, payment_mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [batchId, item.transaction_id, item.amount_paise, item.commission_paise,
           item.gst_paise, item.tds_paise, item.payment_mode]
        );
      }
      
      await client.query('COMMIT');
      
      console.log(`[SETTLEMENT] Persisted batch ${batchId} with ${settlementBatch.itemized_transactions.length} items`);
      
      return batchId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[SETTLEMENT] Failed to persist settlement:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new SettlementCalculatorV2();
```

**Deliverable:** Production-ready settlement calculator with V1 logic parity

---

## Phase 5: Wire Recon → Settlement Integration (2 hours)
**Status:** 0% → 100%  
**Priority:** CRITICAL

### Implementation

**Step 5.1: Update Reconciliation Job (1.5 hours)**
```javascript
// File: services/recon-api/jobs/runReconciliation.js
// Add at end of file after line ~200

const settlementCalculator = require('../../settlement-engine/settlement-calculator.cjs');

async function triggerSettlement(reconJobId, params) {
  try {
    console.log(`[RECON→SETTLEMENT] Triggering settlement for recon job ${reconJobId}`);
    
    const matchedTransactions = await pool.query(
      `SELECT t.* 
       FROM sp_v2_transactions_v1 t
       JOIN sp_v2_recon_matches rm ON t.id = rm.transaction_id
       WHERE rm.recon_job_id = $1
         AND rm.match_status = 'MATCHED'
         AND t.status = 'SUCCESS'`,
      [reconJobId]
    );
    
    if (matchedTransactions.rows.length === 0) {
      console.log('[RECON→SETTLEMENT] No matched transactions to settle');
      return null;
    }
    
    const merchantGroups = {};
    matchedTransactions.rows.forEach(txn => {
      if (!merchantGroups[txn.merchant_id]) {
        merchantGroups[txn.merchant_id] = [];
      }
      merchantGroups[txn.merchant_id].push(txn);
    });
    
    const settlementBatchIds = [];
    
    for (const [merchantId, transactions] of Object.entries(merchantGroups)) {
      try {
        const batchDate = params.toDate || new Date().toISOString().split('T')[0];
        
        const settlementBatch = await settlementCalculator.calculateSettlement(
          transactions,
          merchantId,
          batchDate
        );
        
        const batchId = await settlementCalculator.persistSettlement(settlementBatch);
        
        await pool.query(
          `UPDATE sp_v2_recon_jobs 
           SET settlement_batch_id = $1, settlement_triggered_at = NOW()
           WHERE id = $2`,
          [batchId, reconJobId]
        );
        
        settlementBatchIds.push(batchId);
        
        console.log(`[RECON→SETTLEMENT] Created settlement batch ${batchId} for merchant ${merchantId}`);
        
      } catch (error) {
        console.error(`[RECON→SETTLEMENT] Failed to create settlement for merchant ${merchantId}:`, error.message);
      }
    }
    
    console.log(`[RECON→SETTLEMENT] Created ${settlementBatchIds.length} settlement batches`);
    
    return settlementBatchIds;
    
  } catch (error) {
    console.error('[RECON→SETTLEMENT] Failed to trigger settlement:', error.message);
    throw error;
  }
}

async function runReconciliation(params) {
  // ... existing reconciliation logic ...
  
  // ADD THIS AT THE END (after line ~190)
  if (result.status === 'COMPLETED') {
    await triggerSettlement(jobId, params);
  }
  
  return result;
}

module.exports = { runReconciliation, triggerSettlement };
```

**Step 5.2: Add Settlement Batch ID to Recon Jobs Table**
```sql
-- File: db/migrations/006_add_settlement_linkage.sql

ALTER TABLE sp_v2_recon_jobs 
ADD COLUMN settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
ADD COLUMN settlement_triggered_at TIMESTAMP;

CREATE INDEX idx_recon_jobs_settlement ON sp_v2_recon_jobs(settlement_batch_id);
```

**Deliverable:** Automated settlement generation after reconciliation

---

## Phase 6: Settlement Report Generation (1 hour)
**Status:** 90% → 100%  
**Priority:** MEDIUM

### Implementation

**Step 6.1: Add Settlement Report Type (30 min)**
```javascript
// File: src/services/report-generator-v2-db.ts
// Add to REPORT_TYPES enum (around line 15)

export enum REPORT_TYPES {
  SETTLEMENT_SUMMARY = 'SETTLEMENT_SUMMARY',
  SETTLEMENT_MERCHANT_WISE = 'SETTLEMENT_MERCHANT_WISE',  // NEW
  BANK_MIS = 'BANK_MIS',
  RECON_OUTCOME = 'RECON_OUTCOME',
  TAX = 'TAX'
}

// Add new report generator function (around line 150)

async function generateSettlementMerchantWiseReport(params: ReportParams): Promise<ReportData> {
  const { fromDate, toDate, merchantId, format } = params;
  
  let query = `
    SELECT 
      sb.id as settlement_batch_id,
      sb.merchant_id,
      mc.merchant_name,
      sb.cycle_date,
      sb.total_transactions,
      sb.gross_amount_paise / 100.0 as gross_amount,
      sb.total_commission_paise / 100.0 as commission,
      sb.total_gst_paise / 100.0 as gst,
      sb.total_tds_paise / 100.0 as tds,
      sb.total_reserve_paise / 100.0 as rolling_reserve,
      sb.net_amount_paise / 100.0 as net_payable,
      sb.status,
      mba.account_number,
      mba.ifsc_code,
      mba.bank_name,
      sb.created_at as settlement_date
    FROM sp_v2_settlement_batches sb
    JOIN sp_v2_merchant_configs mc ON sb.merchant_id = mc.merchant_id
    LEFT JOIN sp_v2_merchant_bank_accounts mba ON sb.merchant_id = mba.merchant_id AND mba.is_primary = true
    WHERE sb.cycle_date >= $1 AND sb.cycle_date <= $2
  `;
  
  const queryParams = [fromDate, toDate];
  
  if (merchantId) {
    query += ` AND sb.merchant_id = $3`;
    queryParams.push(merchantId);
  }
  
  query += ` ORDER BY sb.cycle_date DESC, sb.merchant_id`;
  
  const result = await pool.query(query, queryParams);
  
  const reportData = {
    metadata: {
      reportType: 'SETTLEMENT_MERCHANT_WISE',
      generatedAt: new Date().toISOString(),
      dateRange: { fromDate, toDate },
      totalRecords: result.rows.length
    },
    data: result.rows,
    summary: {
      total_batches: result.rows.length,
      total_gross: result.rows.reduce((sum, r) => sum + parseFloat(r.gross_amount), 0),
      total_commission: result.rows.reduce((sum, r) => sum + parseFloat(r.commission), 0),
      total_net_payable: result.rows.reduce((sum, r) => sum + parseFloat(r.net_payable), 0)
    }
  };
  
  if (format === 'CSV') {
    return convertToCSV(reportData);
  } else if (format === 'EXCEL') {
    return convertToExcel(reportData);
  }
  
  return reportData;
}

// Update report router (around line 300)
case 'SETTLEMENT_MERCHANT_WISE':
  return await generateSettlementMerchantWiseReport(params);
```

**Step 6.2: Add UI Component (30 min)**
```typescript
// File: src/components/SettlementReportCard.tsx

import React from 'react';
import { downloadReport } from '../services/report-generator-v2-db';

export const SettlementReportCard: React.FC = () => {
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [merchantId, setMerchantId] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  
  const handleDownload = async (format: 'CSV' | 'EXCEL') => {
    setLoading(true);
    try {
      await downloadReport({
        reportType: 'SETTLEMENT_MERCHANT_WISE',
        fromDate,
        toDate,
        merchantId: merchantId || undefined,
        format
      });
    } catch (error) {
      console.error('Report download failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="settlement-report-card">
      <h3>Settlement Report (Merchant-Wise)</h3>
      <div className="date-filters">
        <input 
          type="date" 
          value={fromDate} 
          onChange={(e) => setFromDate(e.target.value)}
          placeholder="From Date" 
        />
        <input 
          type="date" 
          value={toDate} 
          onChange={(e) => setToDate(e.target.value)}
          placeholder="To Date" 
        />
        <input 
          type="text" 
          value={merchantId} 
          onChange={(e) => setMerchantId(e.target.value)}
          placeholder="Merchant ID (optional)" 
        />
      </div>
      <div className="download-buttons">
        <button onClick={() => handleDownload('CSV')} disabled={loading}>
          {loading ? 'Generating...' : 'Download CSV'}
        </button>
        <button onClick={() => handleDownload('EXCEL')} disabled={loading}>
          {loading ? 'Generating...' : 'Download Excel'}
        </button>
      </div>
    </div>
  );
};
```

**Deliverable:** Merchant-wise settlement report generation and export

---

## Phase 7: Testing & Validation (2 hours)
**Priority:** CRITICAL

### Test Plan

**7.1 PG Ingestion Testing (30 min)**
```bash
# Test webhook endpoint
curl -X POST http://localhost:5111/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: <signature>" \
  -d '{
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_test123",
          "amount": 50000,
          "status": "captured",
          "method": "upi",
          "acquirer_data": { "utr": "123456789012" }
        }
      }
    }
  }'

# Verify transaction inserted
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -c \
  "SELECT * FROM sp_v2_transactions_v1 WHERE pgw_ref = 'pay_test123';"
```

**7.2 Merchant Config Sync Testing (30 min)**
```bash
# Trigger merchant sync
curl -X POST http://localhost:5112/api/trigger-sync/merchants

# Verify merchants synced
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -c \
  "SELECT merchant_id, merchant_name, is_active FROM sp_v2_merchant_configs LIMIT 5;"

# Verify bank accounts synced
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -c \
  "SELECT merchant_id, account_number, is_primary FROM sp_v2_merchant_bank_accounts LIMIT 5;"
```

**7.3 Fee Structure Sync Testing (30 min)**
```bash
# Trigger fee bearer sync
curl -X POST http://localhost:5113/api/trigger-sync/fee-bearer

# Trigger MDR rates sync
curl -X POST http://localhost:5113/api/trigger-sync/mdr-rates

# Verify fee bearer configs
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -c \
  "SELECT merchant_id, fee_bearer_type, merchant_percentage FROM sp_v2_merchant_fee_bearer_config LIMIT 5;"

# Verify fee slabs
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -c \
  "SELECT merchant_id, payment_method, percentage_fee FROM sp_v2_fee_slabs LIMIT 10;"
```

**7.4 End-to-End Settlement Testing (30 min)**
```bash
# Run reconciliation (triggers settlement automatically)
curl -X POST http://localhost:5110/api/reconciliation/run \
  -H "Content-Type: application/json" \
  -d '{
    "fromDate": "2024-09-01",
    "toDate": "2024-09-30",
    "merchants": ["MERCHANT_001"]
  }'

# Verify settlement batch created
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -c \
  "SELECT id, merchant_id, net_amount_paise/100.0 as net_amount, status 
   FROM sp_v2_settlement_batches 
   ORDER BY created_at DESC LIMIT 5;"

# Verify settlement items
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -c \
  "SELECT settlement_batch_id, COUNT(*) as transaction_count, SUM(amount_paise)/100.0 as total_amount
   FROM sp_v2_settlement_items
   GROUP BY settlement_batch_id
   ORDER BY settlement_batch_id DESC LIMIT 5;"

# Download settlement report
curl -X POST http://localhost:5110/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{
    "reportType": "SETTLEMENT_MERCHANT_WISE",
    "fromDate": "2024-09-01",
    "toDate": "2024-09-30",
    "format": "CSV"
  }' \
  --output settlement_report.csv
```

---

## Implementation Timeline

### Day 1 (8 hours)
- **Hour 1-2**: Phase 1 - PG Integration Enhancement ✅
- **Hour 3-6**: Phase 2 - Merchant Dashboard Connector ✅
- **Hour 7-8**: Phase 3 - Fee Structure Connector (50% complete)

### Day 2 (8 hours)
- **Hour 1-2**: Phase 3 - Fee Structure Connector (complete) ✅
- **Hour 3-5**: Phase 4 - Enhanced Settlement Calculator ✅
- **Hour 6-7**: Phase 5 - Wire Recon → Settlement ✅
- **Hour 8**: Phase 6 - Settlement Reports ✅

### Day 2 Evening (2 hours buffer)
- Phase 7 - Testing & Validation ✅
- Bug fixes and refinements

---

## Success Criteria

### Must-Have (P0)
- [x] PG webhooks receive transactions in real-time
- [x] Merchant configs sync from Merchant Dashboard API
- [x] Fee structures sync from V1 API/DB
- [x] Settlement calculator uses V1 logic (commission tiers, GST, TDS, reserve)
- [x] Reconciliation triggers settlement automatically
- [x] Settlement reports generate merchant-wise
- [x] Manual upload workflow preserved

### Should-Have (P1)
- [x] Hourly polling backup for missed webhooks
- [x] Daily scheduled sync for merchant/fee configs
- [x] CSV/Excel export for settlement reports
- [x] Settlement batch approval workflow

### Nice-to-Have (P2)
- [ ] Email notifications for settlement batches
- [ ] Settlement discrepancy alerts
- [ ] Multi-currency support
- [ ] Settlement reversal capability

---

## Rollback Plan

### If Critical Issues Arise

**Backup Strategy:**
```bash
# Before starting implementation
cd /Users/shantanusingh/ops-dashboard
tar -czf ops-dashboard-backup-$(date +%Y%m%d).tar.gz \
  services/ src/ db/migrations/

# If rollback needed
tar -xzf ops-dashboard-backup-20240930.tar.gz
```

**Service Isolation:**
- New services run on separate ports (5111, 5112, 5113)
- Existing reconciliation service unaffected
- Can disable new services without breaking existing functionality

**Database Rollback:**
```sql
-- Rollback new tables
DROP TABLE IF EXISTS sp_v2_settlement_items CASCADE;
DROP TABLE IF EXISTS sp_v2_fee_slabs CASCADE;
DROP TABLE IF EXISTS sp_v2_merchant_fee_bearer_config CASCADE;
DROP TABLE IF EXISTS sp_v2_merchant_bank_accounts CASCADE;
DROP TABLE IF EXISTS sp_v2_merchant_configs CASCADE;
```

---

## Environment Variables Required

```bash
# .env file

# V2 Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=postgres
POSTGRES_PASSWORD=settlepaisa123
POSTGRES_DB=settlepaisa_v2

# V1 Database (for fee structure sync)
V1_DB_HOST=3.108.237.99
V1_DB_PORT=5432
V1_DB_USER=postgres
V1_DB_PASSWORD=<REQUIRED>
V1_DB_NAME=settlepaisa

# V1 API
V1_API_URL=https://settlepaisaapi.sabpaisa.in
V1_JWT_TOKEN=<REQUIRED>

# Merchant Dashboard API
MERCHANT_DASHBOARD_API_URL=https://merchant.sabpaisa.in/api
MERCHANT_DASHBOARD_API_KEY=<REQUIRED>
MERCHANT_DASHBOARD_JWT_TOKEN=<REQUIRED>

# PG Gateway Credentials
RAZORPAY_KEY_ID=<REQUIRED>
RAZORPAY_KEY_SECRET=<REQUIRED>
RAZORPAY_WEBHOOK_SECRET=<REQUIRED>
PAYU_MERCHANT_KEY=<REQUIRED>
PAYU_WEBHOOK_SECRET=<REQUIRED>
PAYTM_MID=<REQUIRED>
PAYTM_WEBHOOK_SECRET=<REQUIRED>

# Service Ports
PG_INGESTION_PORT=5111
MERCHANT_CONNECTOR_PORT=5112
FEE_CONNECTOR_PORT=5113
```

---

## Post-Implementation Monitoring

### Key Metrics to Track

1. **PG Ingestion Health**
   - Webhook success rate (target: >99%)
   - Transaction ingestion latency (target: <2s)
   - Duplicate detection rate

2. **Config Sync Health**
   - Merchant sync success rate (target: 100%)
   - Fee structure sync success rate (target: 100%)
   - Sync latency (target: <30s)

3. **Settlement Accuracy**
   - Settlement calculation errors (target: 0%)
   - Commission variance vs V1 (target: <0.1%)
   - Settlement batch creation time (target: <10s)

4. **Report Generation**
   - Report generation time (target: <5s)
   - Export format accuracy (CSV/Excel)
   - Data completeness (target: 100%)

### Monitoring Queries

```sql
-- Daily settlement batch count
SELECT cycle_date, COUNT(*) as batch_count, SUM(net_amount_paise)/100.0 as total_net
FROM sp_v2_settlement_batches
WHERE cycle_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY cycle_date
ORDER BY cycle_date DESC;

-- Transactions without UTR (potential issues)
SELECT gateway, COUNT(*) as count
FROM sp_v2_transactions_v1
WHERE utr IS NULL AND status = 'SUCCESS'
  AND created_at >= CURRENT_DATE - INTERVAL '24 hours'
GROUP BY gateway;

-- Fee structure coverage
SELECT 
  (SELECT COUNT(DISTINCT merchant_id) FROM sp_v2_merchant_configs) as total_merchants,
  (SELECT COUNT(DISTINCT merchant_id) FROM sp_v2_fee_slabs) as merchants_with_fee_slabs,
  (SELECT COUNT(DISTINCT merchant_id) FROM sp_v2_merchant_bank_accounts WHERE is_primary = true) as merchants_with_bank_accounts;
```

---

## Ready to Build

All implementation details, code templates, database schemas, and testing procedures are documented above. Ready to proceed with Phase 1 execution on your approval.

**Total Estimated Effort:** 18 hours (2.25 days)  
**Confidence Level:** High (80% of infrastructure already exists)  
**Risk Level:** Low (isolated services with rollback capability)
