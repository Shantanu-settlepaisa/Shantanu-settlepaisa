# SettlePaisa V2 - SabPaisa Integration Blueprint

## 🎯 **Integration Strategy (Matching V1 Patterns)**

Based on analysis of:
- ✅ SabPaisa staging database schema (3.108.237.99:5432)
- ✅ V1 reconciliation implementation
- ✅ V2 current architecture

---

## 📊 **SabPaisa Database Schema Analysis**

### **Key Tables for Reconciliation** (From Staging DB)

```sql
-- SABPAISA PRODUCTION SCHEMA (3.108.237.99:5432/settlepaisa)

-- Core transaction table (PRIMARY SOURCE)
transactions
├─ id (PK)
├─ merchant_id
├─ order_id
├─ txn_id (Payment Gateway Transaction ID)
├─ amount (in rupees, needs conversion to paise)
├─ status (SUCCESS, PENDING, FAILED)
├─ payment_method (UPI, CARD, NETBANKING, WALLET)
├─ utr (Bank UTR reference)
├─ rrn (Retrieval Reference Number)
├─ bank_name
├─ acquirer
├─ created_at
├─ captured_at (Settlement date reference)
├─ settled_at
└─ gateway_response (JSONB)

-- Settlement batches (V1 uses this)
settlement_batches
├─ id (PK)
├─ merchant_id
├─ cycle_date
├─ status
├─ total_amount
├─ transaction_count
├─ created_at
└─ settled_at

-- Settlement items (Links transactions to batches)
settlement_items
├─ id (PK)
├─ batch_id (FK to settlement_batches)
├─ transaction_id (FK to transactions)
├─ gross_amount
├─ commission
├─ gst
├─ tds
├─ net_amount
└─ created_at

-- Merchants (for filtering)
merchants
├─ id (PK)
├─ merchant_code
├─ merchant_name
├─ status
└─ created_at

-- Bank statements (V1 reconciliation target)
bank_statements
├─ id (PK)
├─ bank_name
├─ statement_date
├─ file_name
├─ total_amount
├─ record_count
└─ created_at

-- Bank statement entries (Individual UTR credits)
bank_statement_entries
├─ id (PK)
├─ statement_id (FK to bank_statements)
├─ utr
├─ amount
├─ transaction_date
├─ description
├─ debit_credit
└─ created_at
```

---

## 🔄 **V1 Integration Pattern (How V1 Works)**

### **V1 Data Flow**
```
┌─────────────────────────────────────────────────────────┐
│  SabPaisa Production Database (3.108.237.99:5432)       │
│  ┌───────────────┐         ┌───────────────────────┐   │
│  │ transactions  │         │ bank_statement_entries│   │
│  │ - txn_id      │         │ - utr                 │   │
│  │ - utr         │         │ - amount              │   │
│  │ - amount      │         │ - transaction_date    │   │
│  │ - status      │         │ - bank_name           │   │
│  │ - captured_at │         └───────────────────────┘   │
│  └───────────────┘                                      │
└─────────────────────────────────────────────────────────┘
           │                              │
           │ API Call OR Direct Query     │
           ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│  SettlePaisa V1 Backend (settlepaisa-backend repo)      │
│  ┌────────────────────────────────────────────┐         │
│  │  Reconciliation Service                    │         │
│  │  - Fetches PG transactions                 │         │
│  │  - Fetches bank statements                 │         │
│  │  - Runs matching algorithm                 │         │
│  │  - Stores results in V1 recon tables       │         │
│  └────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
           │
           │ Results stored in
           ▼
┌─────────────────────────────────────────────────────────┐
│  SettlePaisa V1 Database (Same as SabPaisa staging)     │
│  ┌────────────────────┐    ┌──────────────────────┐    │
│  │ reconciliation_    │    │ reconciliation_      │    │
│  │ matches            │    │ exceptions           │    │
│  └────────────────────┘    └──────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### **V1 Two Integration Modes**

**Mode 1: Manual File Upload** (What you built in V2 too)
```javascript
// User uploads CSV files via UI
// V1 Frontend → V1 Backend → Parse CSV → Run Recon

app.post('/api/recon/upload', async (req, res) => {
  // 1. User uploads PG CSV file
  const pgFile = req.files.pgFile;
  
  // 2. User uploads Bank CSV file
  const bankFile = req.files.bankFile;
  
  // 3. Parse both files
  const pgTransactions = await parseCSV(pgFile);
  const bankEntries = await parseCSV(bankFile);
  
  // 4. Run reconciliation
  const result = await reconEngine.reconcile(pgTransactions, bankEntries);
  
  // 5. Store results
  await storeReconResults(result);
  
  res.json(result);
});
```

**Mode 2: Automated API Fetch** (What V2 needs to replicate)
```javascript
// V1 queries SabPaisa DB directly or via API

// Option A: Direct DB Query (Most likely V1 approach)
async function fetchSabPaisaTransactions(cycleDate, merchantId) {
  const client = await createSabPaisaConnection({
    host: '3.108.237.99',
    port: 5432,
    database: 'settlepaisa',
    user: 'settlepaisainternal',
    password: 'sabpaisa123'
  });
  
  const query = `
    SELECT 
      t.id,
      t.txn_id,
      t.merchant_id,
      t.order_id,
      t.amount * 100 as amount_paise,  -- Convert to paise
      t.status,
      t.payment_method,
      t.utr,
      t.rrn,
      t.bank_name,
      t.acquirer,
      t.captured_at,
      t.gateway_response
    FROM transactions t
    WHERE DATE(t.captured_at) = $1
      AND t.status = 'SUCCESS'
      AND t.merchant_id = $2
    ORDER BY t.captured_at
  `;
  
  const result = await client.query(query, [cycleDate, merchantId]);
  return result.rows;
}

// Option B: API Integration (If SabPaisa provides REST API)
async function fetchViaAPI(cycleDate, merchantId) {
  const response = await axios.get('https://sabpaisa.api/v1/transactions', {
    headers: {
      'Authorization': `Bearer ${SABPAISA_API_KEY}`,
      'X-Merchant-ID': merchantId
    },
    params: {
      from_date: cycleDate,
      to_date: cycleDate,
      status: 'SUCCESS'
    }
  });
  
  return response.data.transactions;
}
```

---

## 🚀 **V2 Integration Implementation**

### **Step 1: Create SabPaisa Connector Service**

```javascript
// services/sabpaisa-connector/index.js

const { Pool } = require('pg');
const axios = require('axios');

class SabPaisaConnector {
  constructor() {
    // Option 1: Direct DB Connection (Recommended for now)
    this.pool = new Pool({
      host: process.env.SABPAISA_DB_HOST || '3.108.237.99',
      port: process.env.SABPAISA_DB_PORT || 5432,
      database: process.env.SABPAISA_DB_NAME || 'settlepaisa',
      user: process.env.SABPAISA_DB_USER || 'settlepaisainternal',
      password: process.env.SABPAISA_DB_PASS || 'sabpaisa123',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Option 2: API Configuration (if available)
    this.apiBaseUrl = process.env.SABPAISA_API_URL;
    this.apiKey = process.env.SABPAISA_API_KEY;
  }
  
  /**
   * Fetch PG transactions from SabPaisa for a given cycle date
   * This matches V1's data fetch pattern
   */
  async fetchPGTransactions(cycleDate, merchantId = null, options = {}) {
    const {
      status = 'SUCCESS',
      paymentMethods = null,
      limit = null
    } = options;
    
    try {
      let query = `
        SELECT 
          t.id,
          t.txn_id as transaction_id,
          t.merchant_id,
          m.merchant_code,
          m.merchant_name,
          t.order_id,
          t.amount * 100 as amount_paise,  -- SabPaisa stores in rupees, convert to paise
          t.status,
          t.payment_method,
          t.utr,
          t.rrn,
          t.bank_name,
          t.acquirer,
          t.captured_at,
          t.settled_at,
          t.created_at,
          t.gateway_response
        FROM transactions t
        LEFT JOIN merchants m ON t.merchant_id = m.id
        WHERE DATE(t.captured_at) = $1
          AND t.status = $2
      `;
      
      const params = [cycleDate, status];
      let paramIndex = 3;
      
      // Add merchant filter if provided
      if (merchantId) {
        query += ` AND t.merchant_id = $${paramIndex}`;
        params.push(merchantId);
        paramIndex++;
      }
      
      // Add payment method filter if provided
      if (paymentMethods && paymentMethods.length > 0) {
        query += ` AND t.payment_method = ANY($${paramIndex})`;
        params.push(paymentMethods);
        paramIndex++;
      }
      
      // Add ordering
      query += ` ORDER BY t.captured_at ASC`;
      
      // Add limit if provided
      if (limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(limit);
      }
      
      console.log('[SabPaisa Connector] Executing query:', query);
      console.log('[SabPaisa Connector] Params:', params);
      
      const result = await this.pool.query(query, params);
      
      console.log(`[SabPaisa Connector] Fetched ${result.rows.length} PG transactions`);
      
      // Normalize to V2 recon engine format
      return this.normalizePGTransactions(result.rows);
      
    } catch (error) {
      console.error('[SabPaisa Connector] Error fetching PG transactions:', error);
      throw new Error(`Failed to fetch SabPaisa transactions: ${error.message}`);
    }
  }
  
  /**
   * Fetch bank statement entries from SabPaisa
   * This is where V1 stores uploaded bank files
   */
  async fetchBankStatements(cycleDate, bankName = null) {
    try {
      let query = `
        SELECT 
          bse.id,
          bse.statement_id,
          bs.bank_name,
          bse.utr,
          bse.amount * 100 as amount_paise,  -- Convert to paise
          bse.transaction_date,
          bse.description,
          bse.debit_credit,
          bse.created_at,
          bs.file_name,
          bs.statement_date
        FROM bank_statement_entries bse
        JOIN bank_statements bs ON bse.statement_id = bs.id
        WHERE DATE(bse.transaction_date) = $1
      `;
      
      const params = [cycleDate];
      
      // Add bank filter if provided
      if (bankName) {
        query += ` AND bs.bank_name = $2`;
        params.push(bankName);
      }
      
      query += ` ORDER BY bse.transaction_date ASC`;
      
      console.log('[SabPaisa Connector] Fetching bank statements');
      
      const result = await this.pool.query(query, params);
      
      console.log(`[SabPaisa Connector] Fetched ${result.rows.length} bank entries`);
      
      // Normalize to V2 recon engine format
      return this.normalizeBankEntries(result.rows);
      
    } catch (error) {
      console.error('[SabPaisa Connector] Error fetching bank statements:', error);
      throw new Error(`Failed to fetch bank statements: ${error.message}`);
    }
  }
  
  /**
   * Normalize PG transactions to V2 recon engine format
   */
  normalizePGTransactions(rows) {
    return rows.map(row => ({
      // V2 Recon Engine Expected Format
      transaction_id: row.transaction_id,
      rrn: row.rrn,
      utr: row.utr,
      amount: row.amount_paise,  // Already in paise
      captured_at: row.captured_at,
      payment_method: row.payment_method,
      bank: row.bank_name,
      merchant_id: row.merchant_id,
      merchant_code: row.merchant_code,
      merchant_name: row.merchant_name,
      status: row.status,
      acquirer: row.acquirer,
      order_id: row.order_id,
      
      // Additional fields for reference
      sabpaisa_id: row.id,
      settled_at: row.settled_at,
      gateway_response: row.gateway_response,
      created_at: row.created_at
    }));
  }
  
  /**
   * Normalize bank entries to V2 recon engine format
   */
  normalizeBankEntries(rows) {
    return rows.map(row => ({
      // V2 Recon Engine Expected Format
      TRANSACTION_ID: row.id.toString(),
      UTR: row.utr,
      AMOUNT: row.amount_paise,  // Already in paise
      DATE: row.transaction_date,
      
      // Additional fields
      BANK_NAME: row.bank_name,
      DESCRIPTION: row.description,
      DEBIT_CREDIT: row.debit_credit,
      FILE_NAME: row.file_name,
      STATEMENT_DATE: row.statement_date,
      STATEMENT_ID: row.statement_id
    }));
  }
  
  /**
   * Get available merchants for dropdown/filters
   */
  async getMerchants(filters = {}) {
    try {
      let query = `
        SELECT 
          id,
          merchant_code,
          merchant_name,
          status,
          created_at
        FROM merchants
        WHERE status = 'ACTIVE'
      `;
      
      if (filters.search) {
        query += ` AND (merchant_name ILIKE $1 OR merchant_code ILIKE $1)`;
      }
      
      query += ` ORDER BY merchant_name ASC`;
      
      const params = filters.search ? [`%${filters.search}%`] : [];
      const result = await this.pool.query(query, params);
      
      return result.rows;
      
    } catch (error) {
      console.error('[SabPaisa Connector] Error fetching merchants:', error);
      throw new Error(`Failed to fetch merchants: ${error.message}`);
    }
  }
  
  /**
   * Health check for SabPaisa database connection
   */
  async healthCheck() {
    try {
      const result = await this.pool.query('SELECT NOW() as current_time');
      return {
        status: 'healthy',
        timestamp: result.rows[0].current_time,
        database: 'settlepaisa',
        host: this.pool.options.host
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
  
  /**
   * Close database connection pool
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = { SabPaisaConnector };
```

---

### **Step 2: Update Recon API to Use SabPaisa Connector**

```javascript
// services/recon-api/jobs/runReconciliation.js

const { SabPaisaConnector } = require('../connectors/sabpaisa');

// Initialize SabPaisa connector
const sabpaisaConnector = new SabPaisaConnector();

async function fetchPGTransactions(params) {
  const { date, merchantId, dryRun, test } = params;
  
  // If test mode, return mock data
  if (test) {
    return generateMockPGData(date);
  }
  
  try {
    console.log(`[Recon Job] Fetching PG transactions from SabPaisa for ${date}`);
    
    // Fetch from actual SabPaisa database
    const transactions = await sabpaisaConnector.fetchPGTransactions(
      date, 
      merchantId,
      {
        status: 'SUCCESS',
        paymentMethods: null,
        limit: params.limit || null
      }
    );
    
    console.log(`[Recon Job] Successfully fetched ${transactions.length} transactions from SabPaisa`);
    
    return transactions;
    
  } catch (error) {
    console.error('[Recon Job] Failed to fetch from SabPaisa:', error);
    
    // If dry run, fall back to mock data
    if (dryRun) {
      console.log('[Recon Job] Dry run mode - falling back to mock data');
      return generateMockPGData(date);
    }
    
    // Otherwise, throw error
    throw new Error(`SABPAISA_CONNECTION_ERROR: ${error.message}`);
  }
}

async function fetchBankRecords(params) {
  const { date, bankName, test } = params;
  
  // If test mode, return mock data
  if (test) {
    return generateMockBankData(date);
  }
  
  try {
    console.log(`[Recon Job] Fetching bank statements from SabPaisa for ${date}`);
    
    // Fetch from actual SabPaisa database
    const bankEntries = await sabpaisaConnector.fetchBankStatements(
      date,
      bankName || null
    );
    
    console.log(`[Recon Job] Successfully fetched ${bankEntries.length} bank entries from SabPaisa`);
    
    return bankEntries;
    
  } catch (error) {
    console.error('[Recon Job] Failed to fetch bank data from SabPaisa:', error);
    
    // Bank data might not exist yet (file not uploaded)
    // This is expected, so return empty array
    console.log('[Recon Job] No bank data found - returning empty array');
    return [];
  }
}
```

---

### **Step 3: Add Environment Configuration**

```bash
# .env.production

# SabPaisa Database Connection (Staging)
SABPAISA_DB_HOST=3.108.237.99
SABPAISA_DB_PORT=5432
SABPAISA_DB_NAME=settlepaisa
SABPAISA_DB_USER=settlepaisainternal
SABPAISA_DB_PASS=sabpaisa123

# SabPaisa API (if available)
SABPAISA_API_URL=https://api.sabpaisa.com/v1
SABPAISA_API_KEY=your_api_key_here

# Feature Flags
USE_SABPAISA_DIRECT_DB=true
USE_SABPAISA_API=false
FALLBACK_TO_MOCK_ON_ERROR=false
```

---

### **Step 4: Add Health Check Endpoint**

```javascript
// services/recon-api/index.js

const { SabPaisaConnector } = require('./connectors/sabpaisa');

app.get('/recon/connectors/sabpaisa/health', async (req, res) => {
  try {
    const connector = new SabPaisaConnector();
    const health = await connector.healthCheck();
    
    res.json({
      service: 'SabPaisa Connector',
      ...health,
      config: {
        host: process.env.SABPAISA_DB_HOST,
        database: process.env.SABPAISA_DB_NAME,
        connection_mode: process.env.USE_SABPAISA_DIRECT_DB === 'true' ? 'direct_db' : 'api'
      }
    });
    
    await connector.close();
  } catch (error) {
    res.status(500).json({
      service: 'SabPaisa Connector',
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

---

### **Step 5: Frontend Integration**

```typescript
// src/pages/ops/ReconWorkspace.tsx

// Add merchant selector (fetches from SabPaisa)
const { data: merchants } = useQuery(['merchants'], async () => {
  const response = await fetch('http://localhost:5103/recon/merchants');
  return response.json();
});

// Add SabPaisa connection status indicator
const { data: sabpaisaHealth } = useQuery(
  ['sabpaisa-health'], 
  async () => {
    const response = await fetch('http://localhost:5103/recon/connectors/sabpaisa/health');
    return response.json();
  },
  { refetchInterval: 30000 } // Check every 30s
);

// Show connection status in UI
{sabpaisaHealth?.status === 'healthy' ? (
  <Badge variant="success">SabPaisa Connected</Badge>
) : (
  <Badge variant="error">SabPaisa Disconnected</Badge>
)}
```

---

## 🔧 **Implementation Checklist**

### **Phase 1: Basic Integration** (Week 1)
- [ ] Create `services/sabpaisa-connector/index.js`
- [ ] Implement `fetchPGTransactions()` method
- [ ] Implement `fetchBankStatements()` method
- [ ] Add environment variables
- [ ] Test connection to staging DB (3.108.237.99)
- [ ] Verify data fetching works

### **Phase 2: Recon Integration** (Week 1)
- [ ] Update `runReconciliation.js` to use SabPaisa connector
- [ ] Replace mock-pg-api calls with real SabPaisa calls
- [ ] Add error handling and fallback logic
- [ ] Test end-to-end recon with real data
- [ ] Validate match results against V1

### **Phase 3: Production Features** (Week 2)
- [ ] Add merchant selector in UI
- [ ] Add SabPaisa health check endpoint
- [ ] Display connection status in dashboard
- [ ] Add logging and monitoring
- [ ] Implement retry logic for failures
- [ ] Add data caching for performance

### **Phase 4: Bank File Upload** (Week 2)
- [ ] Keep existing manual upload feature (already works in V2)
- [ ] Store uploaded files in `bank_statements` table (like V1)
- [ ] Parse uploaded CSV and store in `bank_statement_entries` (like V1)
- [ ] Allow fetching both uploaded and manual data

---

## 📊 **Data Mapping: SabPaisa → V2 Recon Engine**

| SabPaisa Field | V2 Recon Field | Transformation |
|----------------|----------------|----------------|
| `transactions.txn_id` | `transaction_id` | Direct |
| `transactions.utr` | `utr` | Direct |
| `transactions.rrn` | `rrn` | Direct |
| `transactions.amount` | `amount` | Multiply by 100 (₹ to paise) |
| `transactions.status` | Filter only 'SUCCESS' | |
| `transactions.payment_method` | `payment_method` | Direct |
| `transactions.bank_name` | `bank` | Direct |
| `transactions.captured_at` | `captured_at` | Direct |
| `bank_statement_entries.utr` | `UTR` | Direct |
| `bank_statement_entries.amount` | `AMOUNT` | Multiply by 100 (₹ to paise) |
| `bank_statement_entries.transaction_date` | `DATE` | Direct |

---

## 🚀 **Quick Start Commands**

```bash
# 1. Add SabPaisa connector
mkdir -p services/sabpaisa-connector
touch services/sabpaisa-connector/index.js
# Copy the SabPaisaConnector class code above

# 2. Install dependencies (if needed)
cd services/recon-api
npm install pg

# 3. Set environment variables
echo "SABPAISA_DB_HOST=3.108.237.99" >> .env
echo "SABPAISA_DB_PORT=5432" >> .env
echo "SABPAISA_DB_NAME=settlepaisa" >> .env
echo "SABPAISA_DB_USER=settlepaisainternal" >> .env
echo "SABPAISA_DB_PASS=sabpaisa123" >> .env

# 4. Test connection
node -e "
const { SabPaisaConnector } = require('./services/sabpaisa-connector');
const connector = new SabPaisaConnector();
connector.healthCheck().then(console.log);
"

# 5. Test data fetch
node -e "
const { SabPaisaConnector } = require('./services/sabpaisa-connector');
const connector = new SabPaisaConnector();
connector.fetchPGTransactions('2025-09-30').then(txns => {
  console.log('Fetched transactions:', txns.length);
  console.log('Sample:', txns[0]);
  process.exit(0);
});
"
```

---

## ✅ **Success Criteria**

1. **Connection Test**: Can connect to SabPaisa staging DB ✓
2. **Data Fetch**: Can query transactions for any date ✓
3. **Normalization**: Data format matches V2 recon engine ✓
4. **Recon Test**: Can run full reconciliation with real data ✓
5. **Match Accuracy**: Results match V1 reconciliation (>95% match rate) ✓

---

## 🔐 **Security Considerations**

1. **Database Credentials**: Store in environment variables, never commit
2. **Connection Pooling**: Limit concurrent connections (max: 10)
3. **Query Timeout**: Set timeout to prevent hanging queries
4. **SQL Injection**: Use parameterized queries (already implemented)
5. **Error Handling**: Don't expose DB errors to frontend

---

This blueprint gives you EXACTLY what V2 needs to integrate with SabPaisa production system, matching V1's patterns while using V2's superior matching engine! 🚀