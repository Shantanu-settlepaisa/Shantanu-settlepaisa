# SettlePaisa V2 Ops Dashboard - Backend Context for GPT

## 🏗️ **Microservices Architecture Overview**

### **Service Portfolio**
```
services/
├── overview-api/         # Main dashboard data aggregation (Port 5105)
├── recon-api/           # Reconciliation engine & matching (Port 5103)
├── mock-pg-api/         # Payment Gateway mock service (Port 5101)
├── mock-bank-api/       # Bank statements mock service (Port 5102)
├── merchant-api/        # Merchant portal backend (Port 5106)
├── api/                 # Core business logic APIs
├── chargeback-api/      # Chargeback management service
├── settlement-engine/   # Settlement processing engine
├── pg-ingestion/        # Payment Gateway data ingestion
└── connectors/          # External system integrations
```

### **Technology Stack**
- **Runtime**: Node.js + Express.js
- **Database**: PostgreSQL (primary), SQLite (local dev)
- **Message Queue**: Redis (planned), Kafka (streaming POC)
- **External APIs**: Bank SFTP/API, Payment Gateway webhooks
- **Auth**: JWT tokens, role-based access control

## 🔄 **Service Dependencies & Communication**

### **Service Interaction Map**
```
Frontend (5174)
    │
    ├─► Overview API (5105) ──► Database (5432)
    │                      ├─► PG API (5101)
    │                      └─► Bank API (5102)
    │
    ├─► Recon API (5103) ────► Database (5432)
    │                     ├─► PG API (5101)
    │                     └─► Bank API (5102)
    │
    ├─► Merchant API (5106) ─► Database (5432)
    │
    └─► Chargeback API ─────► Database (5432)
                           └─► External APIs
```

### **Data Flow Patterns**
1. **Real-time Dashboard**: Frontend → Overview API → Database aggregations
2. **Reconciliation**: Frontend → Recon API → Matching Engine → Database
3. **File Ingestion**: SFTP/Upload → PG Ingestion → Database → Cache Invalidation
4. **Settlement**: Settlement Engine → Database → Bank APIs

## 🎯 **Core Service Details**

### **1. Overview API (Port 5105)**
**Purpose**: Real-time dashboard data aggregation and KPI calculation

```javascript
// Main endpoints
GET /api/overview                    // Main dashboard KPIs
GET /api/pipeline                   // Settlement pipeline status
GET /api/sources                    // Reconciliation by source
GET /api/connectors/health          // Data connector health
GET /api/top-reasons                // Top exception reasons
```

**Key Features**:
- Real-time KPI calculations from multiple data sources
- Settlement pipeline status aggregation
- Connector health monitoring
- Exception reason analysis
- Time-based filtering and aggregation

**Database Queries**:
```sql
-- Pipeline overview with funnel metrics
SELECT 
  COUNT(*) FILTER (WHERE status = 'captured') as captured,
  COUNT(*) FILTER (WHERE status = 'in_settlement') as in_settlement,
  COUNT(*) FILTER (WHERE status = 'sent_to_bank') as sent_to_bank,
  COUNT(*) FILTER (WHERE status = 'credited') as credited
FROM transactions 
WHERE created_at BETWEEN $1 AND $2;

-- Reconciliation match rates by source
SELECT 
  data_source,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE reconciliation_status = 'matched') as matched
FROM transactions t
GROUP BY data_source;
```

### **2. Reconciliation API (Port 5103)**
**Purpose**: File upload, normalization, matching engine, and exception management

```javascript
// Core reconciliation endpoints
POST /api/jobs                      // Create reconciliation job
POST /api/jobs/:id/upload           // Upload files for matching
POST /api/jobs/:id/normalize        // Apply normalization templates
POST /api/jobs/:id/match            // Run auto-matching
GET  /api/jobs/:id/exceptions       // Get unmatched items
POST /api/exceptions/:id/resolve    // Resolve exceptions
```

**Reconciliation Engine Logic**:
```javascript
// Multi-stage matching algorithm
const matchingStages = [
  { field: 'utr', tolerance: 0, weight: 1.0 },           // Exact UTR match
  { field: 'amount', tolerance: 0.01, weight: 0.8 },     // Exact amount match
  { field: 'date', tolerance: '1 day', weight: 0.6 },    // Date proximity
  { field: 'merchant_ref', tolerance: 0, weight: 0.7 }   // Reference matching
];

// Confidence scoring
function calculateMatchConfidence(pgTxn, bankTxn) {
  let totalScore = 0;
  let totalWeight = 0;
  
  matchingStages.forEach(stage => {
    if (fieldMatches(pgTxn[stage.field], bankTxn[stage.field], stage.tolerance)) {
      totalScore += stage.weight;
    }
    totalWeight += stage.weight;
  });
  
  return totalScore / totalWeight;
}
```

**Exception Categories**:
- `UNMATCHED_PG`: PG transaction without bank counterpart
- `UNMATCHED_BANK`: Bank transaction without PG counterpart  
- `AMOUNT_MISMATCH`: Transactions matched but amounts differ
- `UTR_MISSING`: Missing UTR reference
- `DUPLICATE_UTR`: Same UTR used multiple times

### **3. Mock PG API (Port 5101)**
**Purpose**: Simulates Payment Gateway transaction data for development

```javascript
// Transaction generation patterns
const transactionTypes = [
  { method: 'UPI', success_rate: 0.92, avg_amount: 850 },
  { method: 'CARD', success_rate: 0.88, avg_amount: 1200 },
  { method: 'NETBANKING', success_rate: 0.85, avg_amount: 2500 },
  { method: 'WALLET', success_rate: 0.95, avg_amount: 400 }
];

// Endpoints
GET /api/transactions                // Get transactions with filters
POST /admin/seed                     // Seed with test data
GET /health                         // Health check
```

### **4. Mock Bank API (Port 5102)**
**Purpose**: Simulates bank statement data and SFTP file ingestion

```javascript
// Bank statement simulation
GET /api/statements                  // Get bank statements
GET /api/statements/:date           // Get statements for specific date
POST /admin/generate-file           // Generate bank file
GET /health                         // Health check

// File format patterns
const bankFormats = {
  'HDFC': { delimiter: ',', date_format: 'DD/MM/YYYY' },
  'ICICI': { delimiter: '|', date_format: 'YYYY-MM-DD' },
  'AXIS': { delimiter: ',', date_format: 'DD-MM-YYYY' }
};
```

### **5. Merchant API (Port 5106)**
**Purpose**: Merchant portal backend with settlement management

```javascript
// Merchant-specific endpoints
GET /merchant/dashboard             // Merchant overview
GET /merchant/settlements           // Settlement history
POST /merchant/settlement/schedule  // Schedule new settlement
GET /merchant/disputes              // Chargeback/dispute list
POST /merchant/disputes/:id/respond // Respond to dispute
```

## 📊 **Database Schema Integration**

### **Core Tables Used by Services**
```sql
-- Overview API primary tables
transactions              -- Main transaction records
settlements               -- Settlement batches
reconciliation_jobs       -- Recon job tracking
reconciliation_exceptions -- Exception management
bank_connectors          -- Data source configuration

-- Recon API working tables
recon_job_files          -- Uploaded files tracking
recon_matches            -- Match results
recon_normalization      -- Field mapping templates

-- Merchant API tables
merchants                -- Merchant configuration
settlement_schedules     -- Settlement timing rules
merchant_users          -- Portal access control
```

### **Key Database Operations**

**Overview Aggregations**:
```sql
-- Real-time KPI calculation
WITH pipeline_stats AS (
  SELECT 
    status,
    COUNT(*) as count,
    SUM(amount_paise) as amount
  FROM transactions 
  WHERE created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY status
)
SELECT 
  COALESCE(SUM(count) FILTER (WHERE status = 'captured'), 0) as captured,
  COALESCE(SUM(count) FILTER (WHERE status = 'credited'), 0) as credited,
  COALESCE(SUM(amount) FILTER (WHERE status = 'captured'), 0) as total_amount
FROM pipeline_stats;
```

**Reconciliation Matching**:
```sql
-- Find potential matches for PG transaction
SELECT b.*, 
       CASE 
         WHEN b.utr = $1 THEN 1.0
         WHEN ABS(b.amount_paise - $2) < 100 THEN 0.8
         WHEN ABS(EXTRACT(EPOCH FROM (b.transaction_date - $3))/3600) < 24 THEN 0.6
         ELSE 0.0
       END as confidence_score
FROM bank_transactions b
WHERE (b.utr = $1 OR ABS(b.amount_paise - $2) < 100)
  AND b.transaction_date BETWEEN $3 - INTERVAL '2 days' AND $3 + INTERVAL '2 days'
  AND b.reconciliation_status = 'pending'
ORDER BY confidence_score DESC
LIMIT 10;
```

## 🔧 **Service Configuration & Startup**

### **Environment Configuration**
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/settlepaisa_v2
REDIS_URL=redis://localhost:6379

# Service Ports
OVERVIEW_API_PORT=5105
RECON_API_PORT=5103
PG_API_PORT=5101
BANK_API_PORT=5102
MERCHANT_API_PORT=5106

# External APIs
BANK_SFTP_HOST=sftp.bank.com
BANK_API_KEY=xxxx
PG_WEBHOOK_SECRET=yyyy

# Features
ENABLE_REAL_TIME_PROCESSING=true
MATCH_CONFIDENCE_THRESHOLD=0.75
AUTO_RESOLVE_HIGH_CONFIDENCE=true
```

### **Service Startup Script** (`start-services.sh`)
```bash
#!/bin/bash
# Starts all backend services in correct order

# 1. Start mock data services first
node services/mock-pg-api/index.js &       # Port 5101
node services/mock-bank-api/index.js &     # Port 5102

# 2. Start core business services
node services/recon-api/index.js &         # Port 5103
node services/overview-api/index.js &      # Port 5105
node services/merchant-api/index.js &      # Port 5106

# 3. Start specialized services
node services/chargeback-api/index.js &
node services/settlement-engine/index.js &
```

## 🔐 **Authentication & Authorization**

### **JWT Token Structure**
```javascript
const tokenPayload = {
  userId: 'user_123',
  email: 'ops@settlepaisa.com',
  role: 'sp-ops',
  merchantId: null,        // null for internal users
  permissions: [
    'overview:read',
    'reconciliation:write',
    'exceptions:resolve',
    'reports:generate'
  ],
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8) // 8 hours
};
```

### **Role-Based Access Control**
```javascript
const rolePermissions = {
  'sp-ops': [
    'overview:read', 'reconciliation:write', 'exceptions:resolve',
    'connectors:configure', 'reports:generate', 'analytics:read'
  ],
  'sp-finance': [
    'overview:read', 'settlements:read', 'reports:generate',
    'analytics:read', 'disputes:read'
  ],
  'sp-compliance': [
    'overview:read', 'analytics:read', 'reports:generate',
    'audit:read', 'disputes:read'
  ],
  'merchant-admin': [
    'merchant:dashboard', 'merchant:settlements', 'merchant:reports',
    'merchant:disputes'
  ]
};

// Middleware for permission checking
function requirePermission(permission) {
  return (req, res, next) => {
    const userRole = req.user.role;
    if (rolePermissions[userRole]?.includes(permission)) {
      next();
    } else {
      res.status(403).json({ error: 'Insufficient permissions' });
    }
  };
}
```

## 📈 **Performance & Monitoring**

### **Caching Strategy**
```javascript
// Redis caching for expensive operations
const cache = {
  overview: { ttl: 30, key: 'overview:{{timeFilter}}' },
  connectorHealth: { ttl: 60, key: 'connectors:health' },
  topReasons: { ttl: 300, key: 'exceptions:top-reasons:{{timeFilter}}' }
};

// Cache-aside pattern
async function getOverviewData(timeFilter) {
  const cacheKey = `overview:${timeFilter.from}:${timeFilter.to}`;
  let data = await redis.get(cacheKey);
  
  if (!data) {
    data = await calculateOverviewMetrics(timeFilter);
    await redis.setex(cacheKey, 30, JSON.stringify(data));
  }
  
  return JSON.parse(data);
}
```

### **Database Optimization**
```sql
-- Indexes for performance
CREATE INDEX CONCURRENTLY idx_transactions_created_at_status 
ON transactions (created_at, status);

CREATE INDEX CONCURRENTLY idx_transactions_utr 
ON transactions (utr) WHERE utr IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_bank_transactions_date_amount 
ON bank_transactions (transaction_date, amount_paise);

-- Materialized views for complex aggregations
CREATE MATERIALIZED VIEW daily_kpi_summary AS
SELECT 
  DATE(created_at) as business_date,
  status,
  data_source,
  COUNT(*) as transaction_count,
  SUM(amount_paise) as total_amount
FROM transactions
GROUP BY DATE(created_at), status, data_source;

-- Refresh strategy
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_kpi_summary;
```

### **Health Checks & Monitoring**
```javascript
// Health check endpoints for all services
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'overview-api',
    version: process.env.npm_package_version,
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      external_apis: await checkExternalApis()
    }
  };
  
  const isHealthy = Object.values(health.checks)
    .every(check => check.status === 'healthy');
  
  res.status(isHealthy ? 200 : 503).json(health);
});
```

## 🔄 **Error Handling & Resilience**

### **Error Response Format**
```javascript
// Standardized error response
const errorResponse = {
  error: {
    code: 'RECONCILIATION_FAILED',
    message: 'Unable to process reconciliation job',
    details: 'Insufficient matching confidence scores',
    timestamp: '2025-09-30T22:23:45Z',
    requestId: 'req_123456',
    metadata: {
      jobId: 'job_789',
      affectedRecords: 15
    }
  }
};
```

### **Retry & Circuit Breaker Patterns**
```javascript
// Exponential backoff for external API calls
async function callExternalAPI(url, data, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios.post(url, data, { timeout: 10000 });
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## 🚀 **Deployment & Scaling**

### **Container Configuration**
```dockerfile
# Typical service Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5105
CMD ["node", "index.js"]
```

### **Load Balancing Strategy**
- **Horizontal Scaling**: Multiple instances behind load balancer
- **Service Discovery**: Health check based routing
- **Database Connection Pooling**: Shared connection pools per service
- **Rate Limiting**: Per-user and per-endpoint limits

This backend context provides GPT with comprehensive understanding of the microservices architecture, API endpoints, database integration, authentication patterns, and operational aspects of the SettlePaisa V2 backend system.