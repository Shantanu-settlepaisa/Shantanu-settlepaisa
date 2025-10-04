# Version 2.22.0 - Complete Context Document

**Date Created:** October 5, 2025  
**Git Commit:** `9208ec0`  
**Previous Version:** 2.21.0  
**Next Version:** 2.22.1 (deployment flexibility)

---

## Overview

Version 2.22.0 represents the **complete integration of the Merchant Dashboard with SettlePaisa V2 database**, removing all mock data and connecting to real production tables.

---

## What This Version Contains

### **Two Complete Dashboards in One Codebase**

#### **1. Ops Dashboard** (`/ops/*`)
**Purpose:** Internal operations team dashboard for reconciliation and settlement monitoring

**Main Pages:**
- `/ops/overview` - Main dashboard with KPIs, pipeline metrics, 7-day history
- `/ops/recon/manual` - Manual file upload for PG and Bank statements
- `/ops/recon/connectors` - SFTP/API connector management
- `/ops/exceptions` - Exception handling and resolution
- `/ops/settlements/:id` - Settlement details with transaction breakdown
- `/ops/reports` - Settlement, Bank MIS, Recon, Tax reports
- `/ops/analytics` - Analytics and trends
- `/ops/settings` - Recon rules, connector configs

**Backend Services (ports):**
- `overview-api` (5105) - Dashboard metrics and KPIs
- `recon-api` (5103) - Reconciliation engine
- `pg-ingestion` (5101) - Mock PG data
- `mock-bank-api` (5102) - Mock bank data
- `exports-api` (5106) - Report generation

**Database:** `postgresql://localhost:5433/settlepaisa_v2`

**Key Tables:**
- `sp_v2_transactions` - All payment gateway transactions
- `sp_v2_bank_statements` - Bank statement entries
- `sp_v2_recon_matches` - Reconciliation matches
- `sp_v2_settlement_batches` - Settlement batches
- `sp_v2_settlement_items` - Transactions in settlements

---

#### **2. Merchant Dashboard** (`/merchant/*`)
**Purpose:** External merchant-facing portal for settlement tracking

**Main Pages:**
- `/merchant/dashboard` - Merchant overview
- `/merchant/settlements` - Settlement history with transaction details
- `/merchant/reports` - Merchant reports
- `/merchant/disputes` - Dispute management

**Backend Service:**
- `merchant-api` (8080) - Merchant-specific APIs

**Database:** `postgresql://localhost:5433/settlepaisa_v2`

**Key Tables:**
- `sp_v2_transactions` - Merchant transactions
- `sp_v2_settlement_batches` - Merchant settlements
- `sp_v2_settlement_items` - Transaction-settlement mapping
- `sp_v2_merchant_settlement_config` - Settlement schedule config

**Default Merchant:** `MERCH001`

---

## Version 2.22.0 Changes (Merchant Dashboard Integration)

### **Files Modified**

#### **1. services/merchant-api/db.js** (177 lines changed)

**What Changed:**
- Migrated from mock `settlements` table to V2 schema:
  - `sp_v2_settlement_batches`
  - `sp_v2_settlement_items`
  - `sp_v2_transactions`
  - `sp_v2_merchant_settlement_config`

**Key Functions:**

**`getDashboardSummary(merchantId)`**
```javascript
// Before: Used mock data
// After: Calculates from real database

Returns:
{
  currentBalance: // Unsettled reconciled transactions + pending batches
  lastSettlement: { date, amount, status }
  nextSettlementDue: // From settlement config (23:00 IST daily)
  nextSettlementAmount: // Sum of unsettled reconciled txns
  unreconciled: // Pending approval amount
}
```

**Query Logic:**
```sql
-- Current Balance = Unsettled Transactions + Pending Batches
WITH unsettled_txns AS (
  SELECT SUM(amount_paise)
  FROM sp_v2_transactions t
  WHERE merchant_id = 'MERCH001' 
    AND status = 'RECONCILED'
    AND NOT EXISTS (
      SELECT 1 FROM sp_v2_settlement_items si 
      WHERE si.transaction_id = t.transaction_id
    )
)
```

**`listSettlements(merchantId, { limit, offset })`**
```javascript
// Returns paginated settlement list with:
- Settlement ID
- Type (regular/instant/on_demand)
- Amount, fees, tax breakdown
- UTR/RRN
- Status (completed/processing/pending/failed)
- Created/settled dates
- Bank account details
- Transaction count
```

**`listSettlementTransactions(settlementId)`** (NEW)
```javascript
// Returns detailed transaction list for a settlement
- Transaction ID, timestamp
- Amount, commission, GST, reserve
- Net settlement amount
- Payment method
- Fee bearer (MERCHANT/CUSTOMER)
- Status
- UTR/RRN
```

**Database Connection:**
```javascript
const PG_URL = process.env.PG_URL || 
  'postgresql://postgres:settlepaisa123@localhost:5433/settlepaisa_v2'
const MERCHANT_ID = process.env.DEFAULT_MERCHANT_ID || 'MERCH001'
```

---

#### **2. src/pages/merchant/Settlements.tsx** (303 lines added)

**What Changed:**
- Removed all fallback mock values
- Added transaction details modal
- Enhanced settlement breakup modal
- Real-time data from V2 API

**Key Features:**

**Dashboard Tiles (Lines 220-236):**
```javascript
// Before: Had fallback values like ₹7,50,000
currentBalance: apiData.currentBalance ? apiData.currentBalance / 100 : 750000.00

// After: Shows exact values or 0
currentBalance: apiData.currentBalance / 100 || 0
```

**Transaction Details Modal (Lines 888-1089):**
- Full financial breakdown table
- Shows all transactions in a settlement
- Columns: Transaction ID, Date, Gross, Commission, GST, Reserve, Net
- Export to CSV functionality
- Escape key to close

**Settlement Breakup Modal (Lines 801-886):**
- Settlement summary
- Fees breakdown
- "View Transactions" button → opens transaction modal

**Data Fetching:**
```javascript
// Dashboard summary
fetch('/v1/merchant/dashboard/summary')

// Settlement list
fetch('/v1/merchant/settlements')

// Transaction details (NEW)
fetch(`/v1/merchant/settlements/${settlementId}/transactions`)
```

---

#### **3. src/services/settlementCycleService.ts** (20 lines changed)

**What Changed:**
- Updated to match merchant settlement config from database

**Before:**
```javascript
merchantId: 'demo-merchant'
cutoffLocal: '02:00 PM IST'
nettingRule: 'T+1'
todayCutoff.setUTCHours(8, 30, 0, 0) // 2 PM IST
```

**After:**
```javascript
merchantId: 'MERCH001'
cutoffLocal: '11:00 PM IST'
nettingRule: 'Daily'
todayCutoff.setUTCHours(17, 30, 0, 0) // 11 PM IST
```

**Why:** Matches the settlement schedule in `sp_v2_merchant_settlement_config`:
```sql
SELECT settlement_frequency, settlement_time 
FROM sp_v2_merchant_settlement_config
WHERE merchant_id = 'MERCH001'
-- Result: frequency='daily', time='23:00:00'
```

---

## Current Data State (Version 2.22.0)

### **Merchant: MERCH001**

**Settlement Statistics:**
- Total Settlements: 10 completed
- Total Settlement Amount: ₹296,235.13
- Unsettled Reconciled Transactions: 108 (₹555,425.48)
- Latest Settlement: ₹3,280.70 (Oct 2, 2025)

**Dashboard Tile Values:**
```javascript
{
  currentBalance: ₹5,554.25,        // 108 unsettled transactions
  settlementDueToday: ₹5,554.25,    // Next auto-settlement amount
  previousSettlement: ₹3,280.70,    // Last completed settlement
  upcomingSettlement: '5/10/2025'   // Next settlement date
}
```

**Database Connection:**
```
Host: localhost
Port: 5433
Database: settlepaisa_v2
User: postgres
Password: settlepaisa123
```

---

## Architecture Overview

### **Frontend Stack**
- React 18 + TypeScript
- Vite (build tool)
- TanStack Query (data fetching)
- Tailwind CSS (styling)
- React Router v6 (routing)

### **Backend Stack**
- Node.js + Express
- PostgreSQL 14
- pg (node-postgres library)

### **Project Structure**
```
ops-dashboard/
├── src/
│   ├── pages/
│   │   ├── ops/              # Ops Dashboard pages (24 files)
│   │   └── merchant/         # Merchant Dashboard pages (5 files)
│   ├── components/           # Shared components
│   ├── layouts/
│   │   ├── OpsLayout.tsx     # Ops dashboard layout
│   │   └── MerchantLayout.tsx # Merchant dashboard layout
│   ├── services/             # API services
│   └── router.tsx            # Route configuration
├── services/
│   ├── merchant-api/         # Merchant API (port 8080)
│   ├── overview-api/         # Ops Overview API (port 5105)
│   ├── recon-api/            # Reconciliation API (port 5103)
│   ├── mock-pg-api/          # Mock PG data (port 5101)
│   └── mock-bank-api/        # Mock bank data (port 5102)
└── package.json
```

---

## API Endpoints (Version 2.22.0)

### **Merchant API (Port 8080)**

#### **Dashboard Summary**
```
GET /v1/merchant/dashboard/summary
Response: {
  currentBalance: 555425,                    // paise
  lastSettlement: { date, amount, status },
  nextSettlementDue: "2025-10-05T17:30:00Z", // 23:00 IST
  nextSettlementAmount: 555425,              // paise
  unreconciled: 0
}
```

#### **Settlement List**
```
GET /v1/merchant/settlements?limit=25&offset=0
Response: {
  settlements: [
    {
      id: "e4874a00-a71f-4739-b101-702627abbbff",
      type: "regular",
      amount: 328070,      // paise
      fees: 7000,
      tax: 1260,
      utr: "...",
      status: "completed",
      createdAt: "2025-10-02T14:23:40Z",
      transactionCount: 5
    }
  ],
  pagination: { limit, offset, total, hasNext }
}
```

#### **Settlement Transactions** (NEW in 2.22.0)
```
GET /v1/merchant/settlements/:id/transactions
Response: {
  transactions: [
    {
      transaction_id: "TXN123",
      transaction_timestamp: "2025-10-02T10:30:00Z",
      amount_paise: 10000,
      commission_paise: 210,
      commission_rate: "2.10",
      gst_paise: 38,
      reserve_paise: 0,
      net_paise: 9752,
      payment_method: "UPI",
      fee_bearer: "MERCHANT",
      status: "RECONCILED",
      utr: "UTR123"
    }
  ]
}
```

### **Ops API (Port 5105)**

```
GET /api/ops/overview
GET /api/ops/settlements
GET /api/ops/exceptions
GET /api/ops/connectors/health
```

---

## Environment Configuration

### **Frontend (.env)**
```env
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false
VITE_MERCHANT_API_URL=http://localhost:8080
```

### **Merchant API (.env)**
```env
USE_DB=true
PG_URL=postgresql://postgres:settlepaisa123@localhost:5433/settlepaisa_v2
DEFAULT_MERCHANT_ID=MERCH001
PORT=8080
NODE_ENV=development
TIMEZONE=Asia/Kolkata
```

---

## How to Run (Version 2.22.0)

### **1. Start Database**
```bash
# PostgreSQL should be running on port 5433
# Database: settlepaisa_v2
```

### **2. Start Backend Services**
```bash
# Merchant API
cd services/merchant-api
USE_DB=true PG_URL="postgresql://postgres:settlepaisa123@localhost:5433/settlepaisa_v2" \
DEFAULT_MERCHANT_ID="MERCH001" node index.js > /tmp/merchant-api.log 2>&1 &

# Ops APIs (if needed)
cd services/overview-api && node index.js &
cd services/recon-api && node index.js &
```

### **3. Start Frontend**
```bash
cd /Users/shantanusingh/ops-dashboard
npm run dev -- --port 5174
```

### **4. Access Dashboards**
- **Ops Dashboard:** http://localhost:5174/ops/overview
- **Merchant Dashboard:** http://localhost:5174/merchant/settlements

---

## Database Schema (V2 Tables)

### **Core Tables Used by Version 2.22.0**

#### **sp_v2_transactions**
```sql
Columns:
- transaction_id (UUID, PK)
- merchant_id (VARCHAR)
- amount_paise (BIGINT)
- payment_method (VARCHAR)
- status (VARCHAR) -- PENDING, RECONCILED, EXCEPTION, FAILED
- utr (VARCHAR)
- rrn (VARCHAR)
- transaction_timestamp (TIMESTAMP)
- settled_at (TIMESTAMP)
- acquirer_code (VARCHAR)
- source (VARCHAR) -- MANUAL_UPLOAD, CONNECTOR
```

#### **sp_v2_settlement_batches**
```sql
Columns:
- id (UUID, PK)
- merchant_id (VARCHAR)
- merchant_name (VARCHAR)
- gross_amount_paise (BIGINT)
- total_commission_paise (BIGINT)
- total_gst_paise (BIGINT)
- net_amount_paise (BIGINT)
- status (VARCHAR) -- PENDING_APPROVAL, APPROVED, COMPLETED
- bank_reference_number (VARCHAR)
- created_at (TIMESTAMP)
- settled_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- total_transactions (INTEGER)
```

#### **sp_v2_settlement_items**
```sql
Columns:
- id (UUID, PK)
- settlement_batch_id (UUID, FK → sp_v2_settlement_batches.id)
- transaction_id (VARCHAR, FK → sp_v2_transactions.transaction_id)
- amount_paise (BIGINT)
- commission_paise (BIGINT)
- commission_rate (VARCHAR)
- gst_paise (BIGINT)
- net_paise (BIGINT)
- reserve_paise (BIGINT)
- fee_bearer (VARCHAR) -- MERCHANT, CUSTOMER
- created_at (TIMESTAMP)
```

#### **sp_v2_merchant_settlement_config**
```sql
Columns:
- id (UUID, PK)
- merchant_id (VARCHAR)
- merchant_name (VARCHAR)
- settlement_frequency (VARCHAR) -- daily, weekly, monthly
- settlement_time (TIME) -- 23:00:00
- auto_settle (BOOLEAN)
- min_settlement_amount_paise (BIGINT)
- account_holder_name (VARCHAR)
- account_number (VARCHAR)
- ifsc_code (VARCHAR)
- is_active (BOOLEAN)
```

---

## Testing (Version 2.22.0)

### **Merchant Dashboard Test**
```bash
# 1. Access merchant settlements
open http://localhost:5174/merchant/settlements

# 2. Verify tiles show real data
Expected:
- Current Balance: ₹5,554.25
- Settlement Due Today: ₹5,554.25
- Previous Settlement: ₹3,280.70
- Upcoming Settlement: 5/10/2025

# 3. Click on a settlement ID
# Should open breakup modal

# 4. Click "View Transactions" button
# Should show transaction details table

# 5. Verify data in transaction modal
Expected columns:
- Transaction ID
- Date
- Gross Amount
- Commission
- GST
- Reserve
- Net Amount
- Payment Method
- Fee Bearer
```

### **API Testing**
```bash
# Test merchant dashboard summary
curl http://localhost:8080/v1/merchant/dashboard/summary | jq

# Test settlement list
curl http://localhost:8080/v1/merchant/settlements | jq

# Test settlement transactions
curl http://localhost:8080/v1/merchant/settlements/e4874a00-a71f-4739-b101-702627abbbff/transactions | jq
```

---

## Known Issues & Limitations

### **Version 2.22.0 Limitations**
1. **Hardcoded Merchant ID:** Uses `MERCH001` by default
2. **No Authentication:** Anyone can access merchant data
3. **No Multi-tenancy:** Can only view one merchant at a time
4. **Settlement Schedule:** Only supports daily frequency
5. **Error Handling:** Basic error handling in frontend

### **Database Dependencies**
- Requires PostgreSQL on port 5433
- Requires V2 schema tables to exist
- Requires merchant config to be set up
- Requires sample data for MERCH001

---

## Rollback Instructions

See next section for detailed rollback guide.

---

## What's Next (Version 2.22.1)

Version 2.22.1 adds deployment flexibility:
- Deploy Ops dashboard separately
- Deploy Merchant dashboard separately  
- Deploy both together
- Feature flags for module enablement

---

## Files Changed Summary

### **Modified Files (3)**
1. `services/merchant-api/db.js` (+177 lines)
   - V2 database integration
   - Settlement queries
   - Transaction details endpoint

2. `src/pages/merchant/Settlements.tsx` (+303 lines)
   - Transaction modal
   - Real data integration
   - No fallback values

3. `src/services/settlementCycleService.ts` (+20 lines)
   - Settlement schedule update
   - 23:00 IST cutoff

### **No New Files Created**

### **No Files Deleted**

---

## Git Reference

```bash
# View this version
git checkout 9208ec0

# View changes
git show 9208ec0

# View file at this version
git show 9208ec0:ops-dashboard/services/merchant-api/db.js

# Compare with previous version
git diff efbe72c..9208ec0
```

---

**Document Version:** 1.0  
**Last Updated:** October 5, 2025  
**Maintained By:** Claude Code
