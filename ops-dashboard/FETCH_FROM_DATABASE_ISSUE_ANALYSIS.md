# "Fetch from Database" Button - Complete Issue Analysis

**Date:** 2025-10-26  
**Status:** 🚨 **BROKEN ON STAGING**  
**Severity:** **CRITICAL** (Blocks automated transaction fetching)

---

## 🎯 What the Flow SHOULD Do

### Intended Flow:
```
User clicks "Fetch from Database" button
         ↓
Frontend: GET /pg-transactions/fetch?cycle_date=2025-10-24
         ↓
Backend checks: sp_v2_transactions for existing API_SYNC data
         ↓
If NOT found → Call SabPaisa Report API
         ↓
https://reportapi.sabpaisa.in/SabPaisaReport/REST/SettlePaisa/txnData/2025-10-24/2025-10-24/ALL
         ↓
Transform V1 format → V2 format
         ↓
INSERT INTO sp_v2_transactions (with source_type='API_SYNC')
         ↓
Return transactions to frontend
         ↓
User sees: "✓ 500 transactions (From Database)"
```

---

## 🚨 What's ACTUALLY Broken

### Issue #1: Database Connection Hardcoded to Localhost

**File:** `services/recon-api/services/pg-sync-service.js`  
**Lines:** 5-11

**Current Code (BROKEN):**
```javascript
const pool = new Pool({
  host: 'localhost',        // ❌ WRONG - only works on local dev
  port: 5433,              // ❌ WRONG - staging uses 5432
  user: 'postgres',        // ❌ WRONG - staging uses 'settlepaisa_user'
  password: 'settlepaisa123',  // ⚠️ May be wrong
  database: 'settlepaisa_v2'   // ✅ Correct
});
```

**Impact:**
- ❌ On staging EC2, this tries to connect to `127.0.0.1:5433`
- ❌ No database exists at localhost:5433 on EC2
- ❌ Flow fails BEFORE even calling SabPaisa API
- ❌ Error: `connect ECONNREFUSED 127.0.0.1:5433`

---

## 📊 Step-by-Step Failure Analysis

### What Happens on Staging When Button is Clicked:

**Step 1:** ✅ Frontend sends request
```javascript
GET http://13.201.179.44:5103/pg-transactions/fetch?cycle_date=2025-10-24
```

**Step 2:** ✅ Recon API receives request
```javascript
router.get('/fetch', async (req, res) => {
  const existingData = await getPgTransactions(cycle_date, merchant_id);
  // ↑ This calls pg-sync-service.js
});
```

**Step 3:** ❌ **FAILS HERE** - Database connection attempt
```javascript
// In pg-sync-service.js line 304
async function getPgTransactions(cycleDate, merchantId) {
  const client = await pool.connect();  // ← FAILS with ECONNREFUSED
  // Never reaches this point:
  // const result = await client.query('SELECT * FROM sp_v2_transactions...');
}
```

**Step 4:** ❌ Never reached - Would call SabPaisa API
```javascript
const v1Data = await fetchFromSabPaisaAPI(cycleDate, cycleDate, merchantId);
// This line is never executed because Step 3 failed
```

**Step 5:** ❌ Never reached - Would insert into database

**Step 6:** ❌ Error returned to frontend
```json
{
  "success": false,
  "error": "connect ECONNREFUSED 127.0.0.1:5433",
  "message": "Failed to fetch PG transactions. Please try manual upload."
}
```

---

## 🔍 Root Cause Analysis

### Why localhost:5433?

This is a **development environment configuration** that was never updated for staging/production.

**Evidence:**
1. Local development uses Docker/PostgreSQL on port 5433
2. Code works perfectly on developer's laptop
3. Code was deployed to staging WITHOUT environment variable updates
4. Staging EC2 doesn't have local database on 5433

### Comparison: Other Services (WORKING)

**File:** `services/recon-api/jobs/runReconciliation.js:97`
```javascript
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',  // ✅ Uses env var
  port: parseInt(process.env.DB_PORT || '5433'),  // ✅ Fallback for local
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  database: process.env.DB_NAME || 'settlepaisa_v2'
});
```

**pg-sync-service.js SHOULD use the same pattern!**

---

## ✅ The Fix Required

### Change 1 File: `services/recon-api/services/pg-sync-service.js`

**Lines 5-11 - Replace with:**
```javascript
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  database: process.env.DB_NAME || 'settlepaisa_v2'
});
```

**Staging Environment Variables (on EC2):**
```bash
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_USER=settlepaisa_user
DB_PASSWORD=settlepaisa_password
DB_NAME=settlepaisa_v2
```

---

## 🎯 Complete Fixed Flow (After Fix)

```
User clicks "Fetch from Database"
         ↓
GET /pg-transactions/fetch?cycle_date=2025-10-24
         ↓
Connect to RDS: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432
         ↓
SELECT * FROM sp_v2_transactions WHERE transaction_date = '2025-10-24' AND source_type = 'API_SYNC'
         ↓
If empty → Call https://reportapi.sabpaisa.in/SabPaisaReport/REST/SettlePaisa/txnData/2025-10-24/2025-10-24/ALL
         ↓
Receive 500 transactions from SabPaisa
         ↓
Transform: V1 format → V2 format
         ↓
BEGIN TRANSACTION
INSERT INTO sp_v2_transactions (...) VALUES (...)
WITH source_type = 'API_SYNC'
COMMIT
         ↓
Return 500 transactions to frontend
         ↓
Frontend displays: "✓ 500 transactions (From Database)"
         ↓
User can now click "Run Recon" without manual CSV upload!
```

---

## 📋 Additional Issues Found (Same Root Cause)

### Files with localhost:5433 Hardcoded:

1. ✅ **`services/recon-api/services/pg-sync-service.js:7`** (THIS FILE - main issue)
2. ⚠️ `services/recon-api/services/api-connector-service.js:7`
3. ⚠️ `services/recon-api/routes/reports.js:7`
4. ⚠️ `services/recon-api/routes/exceptions.js:8`
5. ⚠️ `services/recon-api/routes/connectors.js:7`
6. ⚠️ `services/recon-api/routes/jobRoutes.js:177`
7. ⚠️ `services/recon-api/services/sftp-connector-service.js:7`
8. ⚠️ `services/recon-api/jobs/daily-pg-sync.js:7`

**All these files need the same fix!**

---

## 🎯 Business Impact

### Current State (BROKEN):
- ❌ Users MUST manually upload CSV files
- ❌ No automated sync from SabPaisa platform
- ❌ Extra manual work for operations team
- ❌ Slower reconciliation process
- ❌ Higher error rate (manual uploads can have format issues)

### After Fix:
- ✅ One-click fetch from SabPaisa platform
- ✅ Automatic transaction sync
- ✅ No manual CSV uploads needed
- ✅ Faster reconciliation
- ✅ Lower error rate
- ✅ Better user experience

---

## 🚀 Deployment Plan

### Phase 1: Fix pg-sync-service.js (CRITICAL)
1. Update database pool configuration (lines 5-11)
2. Test locally
3. Deploy to staging
4. Verify button works

### Phase 2: Fix other affected files (IMPORTANT)
1. Update all 8 files with localhost:5433
2. Use environment variables consistently
3. Test all affected endpoints
4. Deploy to staging

### Phase 3: Verification (ESSENTIAL)
1. Click "Fetch from Database" on staging
2. Verify it calls SabPaisa API successfully
3. Verify transactions inserted into sp_v2_transactions
4. Verify reconciliation works end-to-end

---

## ✅ Success Criteria

After fix, this should work:

```bash
# On staging
$ curl 'http://13.201.179.44:5103/pg-transactions/fetch?cycle_date=2025-10-24'

# Expected Response:
{
  "success": true,
  "freshly_synced": true,
  "count": 500,
  "transactions": [...],
  "source_breakdown": {
    "API_SYNC": 500
  },
  "message": "Successfully synced 500 transactions from SabPaisa API",
  "stats": {
    "inserted": 500,
    "updated": 0,
    "skipped": 0
  }
}
```

---

## 📊 Priority: CRITICAL

**Why Critical:**
1. Core feature completely broken on staging
2. Blocks automated workflow
3. Forces manual workarounds
4. Simple 5-line fix
5. High ROI (fix 1 file, unblock major feature)

---

**Report Generated:** 2025-10-26  
**Analysis Method:** Code review + staging API testing  
**Confidence:** 100% (error reproduced, root cause confirmed, fix identified)
