# SettlePaisa V2 Ops Dashboard - Complete System Overview for GPT

## 🎯 **System Purpose & Business Context**

SettlePaisa V2 Ops Dashboard is a **production-grade operations console** for managing Payment Gateway to Bank to Merchant reconciliation workflows in the Indian fintech ecosystem.

### **Core Business Problem Solved**
- **Payment Reconciliation**: Match PG transactions with bank statements
- **Exception Management**: Investigate and resolve unmatched transactions  
- **Settlement Monitoring**: Track money flow from capture to merchant credit
- **Operational Oversight**: Real-time monitoring of financial operations

### **Key Stakeholders**
- **SP-Ops Team**: Day-to-day reconciliation operations
- **SP-Finance Team**: Settlement verification and financial oversight
- **SP-Compliance Team**: Audit trails and regulatory compliance
- **Merchants**: Settlement tracking and dispute resolution

## 🏗️ **System Architecture Overview**

### **High-Level Architecture**
```
┌─────────────────────────────────────────────────────────────────┐
│                    SETTLEPAISA V2 OPS DASHBOARD                  │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                                  │
│  ├─ Operations Dashboard (/ops)                                 │
│  ├─ Merchant Portal (/merchant)                                 │
│  └─ Authentication & RBAC                                       │
│                                                                 │
│  Backend Microservices (Node.js + Express)                     │
│  ├─ Overview API (5105)     - Dashboard aggregation            │
│  ├─ Recon API (5103)        - Reconciliation engine            │
│  ├─ Merchant API (5106)     - Merchant operations              │
│  ├─ Mock PG API (5101)      - Payment gateway simulation       │
│  ├─ Mock Bank API (5102)    - Bank data simulation            │
│  └─ Chargeback API          - Dispute management               │
│                                                                 │
│  Data Layer                                                     │
│  ├─ PostgreSQL (5432)       - Primary data store              │
│  ├─ Redis (6379)           - Caching & sessions               │
│  └─ File Storage           - Uploaded files & reports         │
│                                                                 │
│  External Integrations                                         │
│  ├─ Bank SFTP/APIs         - Statement ingestion              │
│  ├─ Payment Gateway APIs   - Transaction data                 │
│  └─ Notification Services  - Alerts & reporting               │
└─────────────────────────────────────────────────────────────────┘
```

### **Data Flow Architecture**
```
External Data Sources
    │
    ├─► Bank SFTP Files ──────────┐
    │                            │
    ├─► PG API Webhooks ─────────┤
    │                            │
    └─► Manual File Uploads ─────┤
                                │
                                ▼
                        Data Ingestion Layer
                        (Normalization & Validation)
                                │
                                ▼
                         PostgreSQL Database
                         (60+ tables, 5 views)
                                │
                                ▼
                        Backend APIs Layer
                        (Aggregation & Business Logic)
                                │
                                ▼
                         Frontend Dashboard
                         (Real-time visualization)
```

## 📊 **Database Schema Overview**

### **Core Domain Models**
```sql
-- Transaction Processing Pipeline
transactions              -- PG transactions (captured payments)
bank_transactions         -- Bank statement entries  
reconciliation_jobs       -- Reconciliation batch jobs
reconciliation_exceptions -- Unmatched/problematic items
reconciliation_matches    -- Successful matches

-- Settlement Management
settlement_cycles         -- Settlement batch definitions
settlement_batches        -- Individual settlement runs
settlement_transactions   -- Transaction-to-settlement mapping

-- Configuration & Metadata
merchants                 -- Merchant configuration
banks                     -- Bank master data
bank_connectors          -- Automated data ingestion setup
data_source              -- Data source configurations

-- Operations & Monitoring
connector_health         -- Real-time connector status
ingest_alerts           -- Data ingestion alerts
recon_job_logs          -- Reconciliation audit trail

-- Chargebacks & Disputes
chargebacks              -- Chargeback/dispute tracking
chargeback_transactions  -- Associated transactions
chargeback_events        -- Status change timeline
```

### **Key Relationships**
- `transactions.merchant_id` → `merchants.id`
- `reconciliation_jobs.merchant_id` → `merchants.id`  
- `reconciliation_matches.pg_txn_id` → `transactions.id`
- `reconciliation_matches.bank_txn_id` → `bank_transactions.id`
- `settlement_transactions.transaction_id` → `transactions.id`

## 🔄 **Core Business Workflows**

### **1. Reconciliation Workflow**
```
┌─ File Upload ─┐    ┌─ Normalization ─┐    ┌─ Auto-Match ─┐    ┌─ Exception Resolution ─┐
│               │    │                 │    │              │    │                       │
│ • Manual CSV  │───►│ • Field mapping │───►│ • UTR match  │───►│ • Manual review       │
│ • SFTP pull   │    │ • Data cleanse  │    │ • Amount     │    │ • Bulk actions        │
│ • API webhook │    │ • Validation    │    │ • Date range │    │ • Reason codes        │
└───────────────┘    └─────────────────┘    └──────────────┘    └───────────────────────┘
```

### **2. Settlement Pipeline**
```
Captured ──► In Settlement ──► Sent to Bank ──► Credited to Merchant
   │              │                  │                    │
   │              │                  │                    │
   ▼              ▼                  ▼                    ▼
PG Success    Reconciled &      Bank Transfer        Bank Confirms
             Approved           Initiated             Credit
```

### **3. Exception Management**
```
Exception Types:
├─ UNMATCHED_PG     (PG transaction without bank counterpart)
├─ UNMATCHED_BANK   (Bank transaction without PG counterpart)
├─ AMOUNT_MISMATCH  (Matched but amounts differ)
├─ UTR_MISSING      (Missing UTR reference)
└─ DUPLICATE_UTR    (Same UTR used multiple times)

Resolution Actions:
├─ Manual Match     (Link PG ↔ Bank transactions)
├─ Mark Resolved    (Accept discrepancy with reason)
├─ Escalate        (Send to finance team)
└─ Bulk Resolve    (Apply same resolution to similar cases)
```

## 📱 **Frontend Application Structure**

### **Route Organization**
```
/ (Root)
├─ /login                    # Authentication
├─ /ops/                    # Operations Dashboard
│  ├─ overview              # Main KPI dashboard  
│  ├─ recon                 # Reconciliation workspace
│  ├─ exceptions            # Exception management
│  ├─ connectors            # Data source monitoring
│  ├─ reports               # Report generation
│  ├─ analytics             # Trend analysis
│  └─ settings              # System configuration
└─ /merchant/               # Merchant Portal
   ├─ dashboard             # Merchant overview
   ├─ settlements           # Settlement tracking
   ├─ disputes              # Chargeback management
   └─ reports               # Merchant reporting
```

### **Component Architecture Patterns**
```typescript
// Page-level components
pages/ops/Overview.tsx
├─ components/overview/Kpis.tsx
├─ components/overview/SettlementPipeline.tsx  
├─ components/overview/ConnectorsHealth.tsx
└─ components/overview/TopReasons.tsx

// Shared business components
components/recon/
├─ ManualUploadPage.tsx     # File upload interface
├─ ReconResults.tsx         # Match results display
├─ ExceptionTable.tsx       # Exception data grid
└─ BulkActionsModal.tsx     # Bulk resolution actions

// UI primitives
components/ui/
├─ button.tsx, card.tsx, dialog.tsx (Radix UI based)
├─ table.tsx, select.tsx, input.tsx
└─ Custom: KpiCard.tsx, ProgressTracker.tsx
```

## 🔧 **Backend Service Architecture**

### **Service Responsibilities**
```
Overview API (5105)
├─ Real-time KPI calculations
├─ Pipeline status aggregation  
├─ Connector health monitoring
└─ Exception analytics

Reconciliation API (5103)
├─ File upload & validation
├─ Normalization engine
├─ Auto-matching algorithms
└─ Exception management

Mock PG API (5101)
├─ Transaction data simulation
├─ Webhook event generation  
└─ Test data seeding

Mock Bank API (5102)
├─ Bank statement simulation
├─ SFTP file generation
└─ Multi-bank format support

Merchant API (5106)
├─ Merchant portal backend
├─ Settlement scheduling
├─ Dispute management
└─ Portal user management
```

### **API Design Patterns**
```javascript
// RESTful resource endpoints
GET    /api/overview                    # Dashboard data
POST   /api/recon/jobs                  # Create recon job
GET    /api/recon/jobs/:id/exceptions   # Get exceptions
POST   /api/exceptions/:id/resolve      # Resolve exception

// Bulk operations
POST   /api/exceptions/bulk-resolve     # Bulk exception resolution
POST   /api/connectors/bulk-backfill    # Bulk historical data fetch

// Real-time endpoints
GET    /api/connectors/health           # Live connector status
GET    /api/pipeline/status             # Real-time pipeline metrics
```

## 🔐 **Security & Authentication**

### **Authentication Flow**
```
1. User Login (/login)
   ├─ Email/password validation
   ├─ Role selection (sp-ops, sp-finance, etc.)
   └─ JWT token generation

2. Request Authorization
   ├─ JWT token validation
   ├─ Role-based permission check
   └─ Resource access control

3. Session Management
   ├─ Token refresh mechanism
   ├─ Logout & cleanup
   └─ Session timeout handling
```

### **Role-Based Permissions**
```typescript
const rolePermissions = {
  'sp-ops': [
    'overview:read', 'reconciliation:write', 'exceptions:resolve',
    'connectors:configure', 'reports:generate'
  ],
  'sp-finance': [
    'overview:read', 'settlements:read', 'reports:generate',
    'analytics:read'
  ],
  'sp-compliance': [
    'overview:read', 'analytics:read', 'audit:read'
  ],
  'merchant-admin': [
    'merchant:dashboard', 'merchant:settlements', 'merchant:reports'
  ]
};
```

## 📈 **Performance & Monitoring**

### **Frontend Performance**
- **Code Splitting**: Route-level lazy loading
- **Query Optimization**: TanStack Query with caching
- **Real-time Updates**: 30-second polling intervals
- **Optimistic Updates**: Immediate UI feedback

### **Backend Performance**
- **Database Indexing**: Optimized for time-series queries
- **Caching Strategy**: Redis for expensive calculations
- **Connection Pooling**: Shared database connections
- **Query Optimization**: Materialized views for aggregations

### **Monitoring Strategy**
```javascript
// Health check endpoints
GET /health                 # Service health status
GET /metrics               # Prometheus metrics
GET /api/system/status     # System-wide health

// Performance monitoring
- Database query performance
- API response times  
- Cache hit rates
- Error rates by endpoint
```

## 🚀 **Development & Deployment**

### **Development Workflow**
```bash
# Local development setup
make install               # Install dependencies
make data-context         # Generate schema documentation
make dev                  # Start frontend (port 5174)
./start-services.sh       # Start all backend services

# Testing
make test                 # Run unit tests
make test-e2e            # Run end-to-end tests

# Production build  
make build               # Build frontend
docker-compose up        # Start containerized services
```

### **Version Management**
- **Current Version**: 2.3.1 (SQL ambiguity fixes)
- **Previous Versions**: 2.3.0 (V2 integration), 2.1.1 (stable release)
- **Versioning Strategy**: Semantic versioning with git tags
- **Rollback Capability**: Automated rollback scripts available

## 📊 **Key Metrics & KPIs**

### **Operational Metrics**
- **Reconciliation Match Rate**: Target >95%
- **Exception Resolution Time**: Target <24 hours
- **Data Quality Score**: Automated consistency checks
- **Settlement Processing Time**: End-to-end settlement duration

### **Business Metrics**  
- **Daily Transaction Volume**: Processed transaction count
- **Settlement Value**: Total money flow through system
- **Merchant Satisfaction**: Settlement accuracy and timeliness
- **Operational Efficiency**: Automation vs manual processing ratio

## 🔄 **Integration Points**

### **External Systems**
```
Bank Integrations
├─ HDFC Bank SFTP          # Statement files
├─ ICICI Bank API          # Real-time transaction data
├─ AXIS Bank SFTP          # Batch settlement files
└─ SBI API                 # Account balance checks

Payment Gateway APIs
├─ Razorpay Webhooks       # Transaction events
├─ PayU API                # Transaction status
├─ Cashfree Webhooks       # Payment notifications  
└─ Paytm API               # Settlement data

Notification Services
├─ Email (SMTP)            # Exception alerts
├─ SMS Gateway             # Critical notifications
├─ Slack Webhooks          # Team notifications
└─ WhatsApp Business API   # Merchant communications
```

### **Data Formats**
```javascript
// Standard transaction format (internal)
{
  transaction_id: "TXN123456",
  merchant_id: "MERCH001", 
  amount_paise: 150000,     // ₹1,500.00
  status: "captured",
  payment_method: "UPI",
  utr: "123456789012",
  created_at: "2025-09-30T10:30:00Z"
}

// Bank statement format (variable by bank)
{
  bank_reference: "HDFC123456",
  utr: "123456789012",
  amount: "1500.00",
  transaction_date: "30/09/2025",
  debit_credit: "CREDIT",
  description: "UPI-123456789012-Payment"
}
```

## 🎯 **Success Criteria & Business Impact**

### **System Success Metrics**
- **Uptime**: 99.9% availability target
- **Performance**: <2s page load times
- **Accuracy**: >99.5% reconciliation accuracy
- **User Satisfaction**: <5% error rate in operations

### **Business Value Delivered**
- **Operational Efficiency**: 80% reduction in manual reconciliation effort
- **Financial Accuracy**: Near real-time settlement tracking
- **Regulatory Compliance**: Complete audit trails
- **Merchant Experience**: Self-service portal for transparency

This comprehensive system overview provides GPT with complete context of the SettlePaisa V2 Ops Dashboard - from business purpose through technical implementation to operational metrics.