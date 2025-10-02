# Settlement Analytics - Data Source Reality Check

**Date:** October 2, 2025  
**Issue:** sp_v2_transactions is only powered by manual CSV uploads (test data)

---

## 🚨 Current Reality

### What You Asked:
> "But sp_v2_transactions is only powered by uploaded PG files right?"

### Answer: **YES - You're 100% Correct!**

```
sp_v2_transactions Data Source:
├─ MANUAL_UPLOAD: 702 transactions (test data)
├─ pg_data_20240929.csv: 3 transactions
└─ TEST_SOURCE: 1 transaction

Merchants:
├─ MERCH001, MERCH002, MERCH003 (test merchants - 700 txns)
└─ MERCHANT_001, etc. (more test data)

Source: Manual CSV uploads via frontend (ManualUploadEnhanced.tsx)
```

**This is NOT real production data from SabPaisa!**

---

## 🤔 The Problem

### Analytics Would Be Powered By:
1. ❌ **Test/Mock Data** - Manual CSV uploads
2. ❌ **Limited Scope** - Only 706 transactions
3. ❌ **No Real Merchants** - MERCH001, MERCH002, MERCH003
4. ❌ **No Real-time Updates** - Manual upload only

### This Means:
The Settlement Analytics dashboard would show **test data analytics**, not real production settlement data.

---

## ✅ The Right Solution

### Option A: Use SabPaisa Core Data Directly (Recommended)

**Goal:** Pull real transaction data from SabPaisa staging/production DB

#### **Source Tables in SabPaisa:**
```sql
-- SabPaisa DB (3.108.237.99:5432/settlepaisa)
transactions_to_settle      -- Main transaction table
merchant_data               -- Merchant details
transaction_details         -- Detailed transaction info
payment_gateway_response    -- Gateway responses
```

#### **Approach:**
1. Settlement Analytics API queries **SabPaisa DB directly**
2. Joins with V2 settlement data for reconciliation status
3. Shows real transactions, real merchants, real-time data

#### **Example Query:**
```sql
-- Real settled transactions from SabPaisa
SELECT 
  t.txn_id,
  t.merchant_code,
  t.amount,
  t.payment_mode,
  t.txn_date,
  v2.settlement_batch_id,
  CASE 
    WHEN v2.settlement_batch_id IS NOT NULL THEN 'SETTLED'
    ELSE 'UNSETTLED'
  END as settlement_status
FROM settlepaisa.transactions_to_settle t
LEFT JOIN settlepaisa_v2.sp_v2_settlement_batches v2 
  ON t.merchant_code = v2.merchant_id 
  AND DATE(t.txn_date) = v2.cycle_date
WHERE t.txn_date >= CURRENT_DATE - INTERVAL '30 days'
```

---

### Option B: Sync SabPaisa Transactions to V2 (Alternative)

**Goal:** Create an ingestion pipeline to sync SabPaisa txns → sp_v2_transactions

#### **Approach:**
1. Create sync service (like we have for merchant configs)
2. Sync transactions daily from SabPaisa → V2
3. Analytics queries V2 tables (faster, isolated)

#### **Files to Create:**
```
services/transaction-sync/
├── sync-sabpaisa-transactions.cjs
└── auto-sync-scheduler.cjs
```

#### **Sync Logic:**
```javascript
// Sync transactions from SabPaisa → V2
async function syncTransactions(startDate, endDate) {
  const sabpaisaTxns = await sabpaisaPool.query(`
    SELECT 
      txn_id,
      merchant_code,
      amount,
      payment_mode,
      txn_date,
      utr,
      status
    FROM transactions_to_settle
    WHERE txn_date BETWEEN $1 AND $2
  `, [startDate, endDate]);
  
  for (const txn of sabpaisaTxns.rows) {
    await v2Pool.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise,
        payment_method, transaction_date, source_type
      ) VALUES ($1, $2, $3, $4, $5, 'SABPAISA_SYNC')
      ON CONFLICT (transaction_id) DO UPDATE SET
        amount_paise = EXCLUDED.amount_paise,
        updated_at = NOW()
    `, [txn.txn_id, txn.merchant_code, txn.amount * 100, ...]);
  }
}
```

---

## 📊 Revised Analytics Architecture

### **Option A Architecture (Recommended):**

```
┌─────────────────────────────────────────┐
│   SabPaisa Core DB (Source of Truth)   │
│   • transactions_to_settle (millions)   │
│   • Real merchants (15K+)               │
│   • Real-time transaction data          │
└─────────────────────────────────────────┘
            ↓ (Direct Query)
┌─────────────────────────────────────────┐
│   Settlement Analytics API              │
│   • Queries SabPaisa for txn data       │
│   • Joins with V2 for settlement status │
│   • Aggregates for analytics            │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│   V2 Settlement Tables (Join Key)       │
│   • sp_v2_settlement_batches            │
│   • sp_v2_settlement_items              │
│   • Provides settlement status overlay  │
└─────────────────────────────────────────┘
```

**Pros:**
- ✅ Real production data
- ✅ Real-time analytics
- ✅ No data duplication
- ✅ Uses existing SabPaisa connection

**Cons:**
- ⚠️ Depends on SabPaisa DB availability
- ⚠️ Cross-database queries (slightly slower)

---

### **Option B Architecture (Alternative):**

```
┌─────────────────────────────────────────┐
│   SabPaisa Core DB                      │
└─────────────────────────────────────────┘
            ↓ (Daily Sync)
┌─────────────────────────────────────────┐
│   Transaction Sync Service              │
│   • Runs daily (2 AM)                   │
│   • Syncs last 30 days                  │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│   V2 Database (Self-Contained)          │
│   • sp_v2_transactions (synced)         │
│   • sp_v2_settlement_batches            │
│   • All analytics data in V2            │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│   Settlement Analytics API              │
│   • Queries V2 only (fast)              │
└─────────────────────────────────────────┘
```

**Pros:**
- ✅ Fast queries (single database)
- ✅ Independent of SabPaisa availability
- ✅ Can cache/optimize V2 data

**Cons:**
- ⚠️ Data sync lag (daily)
- ⚠️ Data duplication
- ⚠️ More maintenance (sync job)

---

## 🎯 Recommended Approach: **Hybrid (Best of Both)**

### **For Settlement Analytics:**

Use **Option A** (Direct SabPaisa Query) because:
1. Settlement is already reconciled data (not real-time critical)
2. We need historical transaction data for trends
3. Analytics queries are read-heavy (no performance impact)
4. We already have SabPaisa connection for merchant config sync

### **Updated Tile Mapping:**

| Tile | Primary Source | Join Table | Notes |
|------|----------------|------------|-------|
| 1. Settled Txns | `sp_v2_settlement_items` | - | V2 only (already settled) |
| 2. Unsettled Txns | `SabPaisa.transactions_to_settle` | `sp_v2_settlement_batches` | Cross-DB query |
| 3. Settlement Rate | Calculated from 1 + 2 | - | Hybrid |
| 4. Avg Time | `SabPaisa + sp_v2_batches` | - | Cross-DB query |
| 5. Mode Donut | `sp_v2_settlement_items` | - | V2 only |
| 6. GMV Trend | `SabPaisa.transactions_to_settle` | `sp_v2_settlement_items` | Cross-DB |
| 7. Funnel | `SabPaisa.transactions_to_settle` | `sp_v2_*` | Cross-DB |
| 8. Rate History | `SabPaisa + sp_v2_batches` | - | Cross-DB |
| 9. Failures | `SabPaisa.transactions_to_settle` | - | SabPaisa only |

---

## 📝 Revised Implementation Plan

### Phase 1: Backend API with SabPaisa Integration

**File:** `services/settlement-analytics-api/index.js`

**Database Connections:**
```javascript
const sabpaisaPool = new Pool({
  host: '3.108.237.99',
  port: 5432,
  user: 'settlepaisainternal',
  password: 'sabpaisa123',
  database: 'settlepaisa'
});

const v2Pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});
```

**Example Endpoint:**
```javascript
// GET /analytics/kpis
app.get('/analytics/kpis', async (req, res) => {
  const { startDate, endDate } = req.query;
  
  // Settled (from V2)
  const settled = await v2Pool.query(`
    SELECT COUNT(*), SUM(amount_paise)
    FROM sp_v2_settlement_items si
    JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
    WHERE sb.created_at BETWEEN $1 AND $2
  `, [startDate, endDate]);
  
  // Unsettled (from SabPaisa)
  const unsettled = await sabpaisaPool.query(`
    SELECT COUNT(*), SUM(amount)
    FROM transactions_to_settle
    WHERE is_settled = '0'
      AND txn_date BETWEEN $1 AND $2
  `, [startDate, endDate]);
  
  res.json({ settled, unsettled });
});
```

---

## ⚠️ Important Caveat

### For Testing/Demo:
Current test data in `sp_v2_transactions` is **perfect for testing** the Settlement Engine (Calculator V3, Scheduler, etc.)

### For Production Analytics:
Must use **real SabPaisa data** to show meaningful analytics

---

## 🚀 Next Steps

### Immediate Question to Answer:

**Do you want Settlement Analytics to show:**

A. **Real production data** from SabPaisa?  
   → Use Option A (Direct SabPaisa queries)  
   → More effort, real value

B. **Test data** from manual uploads?  
   → Use current sp_v2_transactions  
   → Quick implementation, limited value

**My Recommendation:** **Option A** - Pull real SabPaisa data for analytics. The current test data is great for testing settlement calculation logic, but analytics should show real production insights.

---

## 📋 Summary

**Your Observation:** ✅ Correct - sp_v2_transactions is manual upload only  
**Impact:** Analytics would show test data, not production data  
**Solution:** Query SabPaisa directly for transaction data, join with V2 for settlement status  
**Result:** Real production analytics with actual merchant data

**Should we proceed with Option A (SabPaisa integration)?**
