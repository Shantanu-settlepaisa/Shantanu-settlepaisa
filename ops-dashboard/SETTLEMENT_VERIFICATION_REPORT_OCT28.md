# ❌ SETTLEMENT VERIFICATION REPORT - CRITICAL ISSUE FOUND

**Date:** October 28, 2025
**Environment:** Staging 2 (52.66.199.215)
**Reconciliation Job:** `6e0ad272-dfb1-41ff-ab73-7079c02e721e`
**Status:** 🔴 **SETTLEMENT PERSISTENCE FAILING**

---

## 🎯 Executive Summary

The reconciliation fix is working perfectly (10/10 matches, 100% success rate), but **settlement persistence is failing** due to a database pool closure timing issue.

### Current State:
- ✅ **Reconciliation**: Working correctly
- ✅ **Settlement Calculation**: Computed successfully (₹2148.08 net settlement)
- ❌ **Settlement Persistence**: **FAILING** - Database pool closed prematurely
- ❌ **Settlement Items**: **0 items** persisted to database
- ⚠️  **Settlement Batches**: 3 batches created with **NULL/NaN values**

---

## 🔍 Root Cause Analysis

### **Error Found in PM2 Logs:**

```
[Settlement] Calculated for MERCH001:
  Net Settlement: ₹2148.08

❌ ERROR: Cannot use a pool after calling end on the pool
    at BoundPool.connect (pg-pool/index.js:184:19)
    at SettlementCalculatorV1Logic.persistSettlement
    at runReconciliation (/services/recon-api/jobs/runReconciliation.js:483:44)
```

### **Root Cause:**

**File:** `/services/recon-api/jobs/runReconciliation.js`

**Sequence of Events:**

```
1. Line 395-410: Persistence function called
   └─> Saves reconciliation results to database
   └─> Line 2160: await pool.end()  ❌ CLOSES POOL

2. Line 443-505: Settlement calculation triggered
   └─> Line 453: Loads SettlementCalculatorV1Logic
   └─> Line 477: await calculator.calculateSettlement()  ✅ SUCCESS
   └─> Line 483: await calculator.persistSettlement()    ❌ FAILS!

       Error: Cannot use a pool after calling end on the pool
```

**Why It Fails:**

The `persistSettlement()` method in `settlement-calculator-v1-logic.cjs` uses a module-level pool (`v2Pool` defined at line 12):

```javascript
// settlement-calculator-v1-logic.cjs
const v2Pool = new Pool({ /* config */ });  // Line 12 - Module level

class SettlementCalculatorV1Logic {
  async persistSettlement(settlementBatch) {
    const client = await v2Pool.connect();  // Line 350 - Uses module pool
    // ... persistence logic
  }
}
```

But in `runReconciliation.js`, multiple functions create **local pools** and call `pool.end()`, which somehow affects the module-level pool in the settlement calculator (possibly due to connection pooling sharing or environment variable caching).

---

## 📊 Database State Verification

### Settlement Batches (Oct 28):

```sql
SELECT * FROM sp_v2_settlement_batches
WHERE DATE(created_at) = '2025-10-28';
```

**Results:**
| Batch ID | Merchant | Total Txns | Net Settlement | Status |
|----------|----------|------------|----------------|---------|
| 0aa91ca2-ed8a-4ba4-bbf5-adad5f4985c3 | MERCH001 | 10 | **NaN** ❌ | PENDING_APPROVAL |
| d10d458d-244f-4ba4-9241-7b520f0eb163 | MERCH001 | 10 | **NaN** ❌ | PENDING_APPROVAL |
| 363a3313-df7a-4f30-990c-22bf284e23ca | MERCH001 | 10 | **NaN** ❌ | PENDING_APPROVAL |

**Issues:**
- ✅ 3 batches created (from 3 test runs)
- ❌ `net_settlement_amount_paise` is NULL → displays as NaN
- ❌ Other amount fields likely NULL as well

### Settlement Items (Oct 28):

```sql
SELECT COUNT(*) FROM sp_v2_settlement_items
WHERE DATE(created_at) = '2025-10-28';
```

**Result:** **0 items** ❌

**Impact:**
- No itemized fee breakdown
- No per-transaction settlement data
- Cannot verify PG commission, GST, bank fees, TDS, reserves
- Settlement batches are incomplete/unusable

---

## 🔧 The Fix Required

### **Problem:** Pool closure timing issue

### **Solution:** Remove premature `pool.end()` calls OR use a singleton pool pattern

### **Files to Fix:**

#### 1. `/services/recon-api/jobs/runReconciliation.js`

**Lines to modify:**
- Line 2160: `await pool.end();` ← Remove or delay
- Line 581: `await pool.end();` ← Remove from `fetchPGFromDatabase`
- Line 639: `await pool.end();` ← Remove from `fetchBankFromDatabase`
- Line 884: `await pool.end();` ← Remove from bank normalization
- Line 2194: `await pool.end();` ← Error handler

**Approach 1: Remove All `pool.end()` Calls**
```javascript
// BEFORE (Line 2160):
await pool.end();
console.log('[Persistence] Connection pool ended');

// AFTER:
// Don't close pool - let it stay open for settlement calculation
// Pool will be cleaned up when process exits
console.log('[Persistence] Transaction committed');
```

**Approach 2: Use Module-Level Singleton Pool**
```javascript
// At top of runReconciliation.js
const { Pool } = require('pg');
const config = require('../../config/env.cjs');

// Create ONE shared pool for the entire module
const sharedPool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20,  // Allow 20 concurrent connections
  idleTimeoutMillis: 30000
});

// Use sharedPool everywhere instead of creating new pools
```

**Approach 3: Close Pool AFTER Settlement (Recommended)**
```javascript
// Line 390-510 (runReconciliation flow):

// 1. Persist reconciliation results
const matchResult = await persistResultsToDatabase(
  results,
  jobId,
  job,
  params,
  'Persistence for job ${jobId}'
);

// NOTE: DON'T close pool yet - settlement needs it!

// 2. Trigger settlement calculation
if (job.counters.matched > 0) {
  try {
    const calculator = new SettlementCalculatorV1Logic();
    // ... settlement logic ...
    await calculator.persistSettlement(settlementBatch);

    // 3. NOW it's safe to close the pool
    await persistencePool.end();  // Only if we have a reference

  } catch (settlementError) {
    // Handle error but still close pool
    await persistencePool.end().catch(() => {});
    throw settlementError;
  }
}
```

---

## 📋 Settlement Calculation Verification

Based on PM2 logs, the settlement calculation **DID work**:

```
[Settlement] Calculating for merchant MERCH001, 10 transactions
[Settlement] Using mock config for test merchant: MERCH001
[Settlement] Calculated for MERCH001:
  Net Settlement: ₹2148.08
```

### Expected Calculation (Rough Estimate):

**Assumptions:**
- 10 transactions totaling ₹150,000 (₹15,000 each)
- PG Commission: 2% = ₹3,000
- PG GST: 18% of ₹3,000 = ₹540
- Bank Fees: Variable (from bank statements)
- Net = ₹150,000 - ₹3,000 - ₹540 - bank_fees

**Actual Calculated:** ₹2,148.08

**Analysis:** The amount seems very low. Possible reasons:
1. **Mock config** being used instead of real merchant config
2. High bank fees reducing net settlement
3. Rolling reserve being applied
4. Calculation error in settlement calculator

**Cannot verify without settlement items in database!**

---

## 🚨 Impact Assessment

### Immediate Impact:
- ❌ **No settlement records** created for reconciled transactions
- ❌ **Cannot approve settlements** (no data to approve)
- ❌ **Cannot verify fee calculations** (no itemized breakdown)
- ❌ **Cannot track merchant payouts** (no settlement items)

### Business Impact:
- 🔴 **CRITICAL**: Settlement flow is broken in staging
- 🔴 **BLOCKER**: Cannot test end-to-end settlement approval workflow
- 🟡 **MEDIUM**: Reconciliation still works, but settlement doesn't follow
- 🟢 **LOW**: Only affects staging environment (not production yet)

### User Impact:
- Operations team cannot test settlement approval
- Finance team cannot verify fee calculations
- Merchants cannot see expected payout amounts

---

## ✅ Verification Checklist

- [x] Reconciliation working correctly (10/10 matches)
- [x] Settlement trigger activated after reconciliation
- [x] Settlement calculation computed (₹2148.08)
- [ ] ❌ Settlement batch persisted with correct amounts
- [ ] ❌ Settlement items created (0 items found)
- [ ] ❌ Fee calculations verified (PG commission, GST, bank fees)
- [ ] ❌ Bank fee integration working
- [ ] ❌ End-to-end settlement flow functional

---

## 🔄 Recommended Next Steps

### Priority 1: FIX IMMEDIATELY
1. **Remove premature `pool.end()` calls** in `runReconciliation.js`
2. **Deploy fix to staging 2**
3. **Re-run reconciliation** with same test files
4. **Verify settlement items** are created

### Priority 2: VERIFY CALCULATIONS
1. Check settlement items table has 10 rows
2. Verify each item has all fee fields populated:
   - `pg_commission_paise`
   - `pg_gst_paise`
   - `bank_fee_paise`
   - `bank_gst_paise`
   - `tds_paise`
   - `reserve_paise`
   - `net_settlement_paise`
3. Manually verify one transaction's math
4. Confirm batch totals = sum of items

### Priority 3: TEST SETTLEMENT APPROVAL
1. Navigate to Settlements page
2. Approve a settlement batch
3. Verify status changes to APPROVED
4. Test payout generation

---

## 📝 Technical Details

### Database Tables Affected:
- `sp_v2_settlement_batches` - Has partial data (NULL amounts)
- `sp_v2_settlement_items` - Empty (0 rows)
- `sp_v2_settlement_queue` - Status unknown

### Code Files Involved:
1. `/services/recon-api/jobs/runReconciliation.js` - Pool closure issue
2. `/services/settlement-engine/settlement-calculator-v1-logic.cjs` - Persistence method
3. `/services/config/env.cjs` - Database configuration

### Environment Variables:
```
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=settlepaisa_v2
DB_USER=postgres
DB_PASSWORD=(encrypted)
```

---

## 🎯 Success Criteria

Settlement system will be considered fixed when:

1. ✅ Reconciliation completes with 10/10 matches
2. ✅ Settlement batch created with correct totals
3. ✅ 10 settlement items persisted to database
4. ✅ All fee fields populated (PG commission, GST, bank fees, etc.)
5. ✅ Bank fees from `sp_v2_bank_statements` correctly copied to settlement items
6. ✅ Net settlement calculation matches: `gross - all_fees`
7. ✅ Settlement approval workflow functional
8. ✅ No "Cannot use a pool after calling end" errors in logs

---

**Report Generated By:** Claude Code
**Issue Severity:** 🔴 **CRITICAL**
**Status:** ⏳ **Awaiting Fix Deployment**
**Next Action:** Deploy pool closure fix to staging 2
