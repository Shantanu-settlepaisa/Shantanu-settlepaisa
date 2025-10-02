# Failure Analysis - How It's Powered

**Date:** October 2, 2025  
**Status:** Working with real V2 data

---

## 📊 How Failure Data Flows

### **1. Source: V2 Database**
```sql
-- Query from sp_v2_transactions table
SELECT 
  status as failure_reason,
  COUNT(*) as count,
  SUM(amount_paise) as total_amount_paise
FROM sp_v2_transactions
WHERE status IN ('EXCEPTION', 'FAILED')
GROUP BY status
ORDER BY count DESC;
```

### **2. API Endpoint**
```
GET http://localhost:5107/analytics/failure-analysis

Response:
{
  "failures": [
    {
      "reason": "EXCEPTION",
      "count": 136,
      "amount_paise": 67462612
    }
  ]
}
```

### **3. Frontend Hook Transformation**
```typescript
// useSettlementFailureBreakup hook transforms API data
const slices = data.failures.map(failure => ({
  code: failure.reason,           // "EXCEPTION"
  label: failure.reason,           // Display name
  owner: 'System',                 // Categorization
  txns: failure.count,             // 136 transactions
  impactPaise: failure.amount_paise, // ₹6.7 lakhs
  sharePct: (count/total) * 100   // 100% (only one type)
}));

return { slices };
```

### **4. Component Display**
```
FailureReasonsSummary.tsx displays:
- Donut chart with failure distribution
- Total failed transactions: 136
- Total impact: ₹6.7 lakhs
- Breakdown by reason (currently only EXCEPTION)
```

---

## 🎯 Current Data (from V2 Database)

### **Failure Summary:**
```
Total Failed/Exception Transactions: 136
Total Amount Impact: ₹67,462,612 (₹6.7 lakhs)

Breakdown:
├─ EXCEPTION: 136 txns (100%) - ₹6.7 lakhs
└─ (No other failure types currently)
```

### **Why only EXCEPTION?**

The V2 database currently only has transactions with `status = 'EXCEPTION'`:

```sql
SELECT status, COUNT(*) 
FROM sp_v2_transactions 
GROUP BY status;

Results:
RECONCILED  | 569  ← Successful settlements
PENDING     | 1    ← Waiting to be processed
EXCEPTION   | 136  ← Failed/Exception transactions
```

---

## 🔮 Future Enhancement Plan

### **Phase 1: Detailed Failure Reasons (Current - Basic)**
**Table:** `sp_v2_transactions.status`  
**Granularity:** High-level (EXCEPTION, FAILED, PENDING)  
**Limitation:** No specific reason for failure

### **Phase 2: Add Failure Reason Column (Recommended)**
```sql
ALTER TABLE sp_v2_transactions 
ADD COLUMN failure_reason VARCHAR(100),
ADD COLUMN failure_message TEXT;

-- Examples of failure reasons:
UPDATE sp_v2_transactions 
SET failure_reason = 'BANK_FILE_AWAITED' 
WHERE status = 'EXCEPTION' AND ...;

UPDATE sp_v2_transactions 
SET failure_reason = 'AMOUNT_MISMATCH' 
WHERE status = 'EXCEPTION' AND ...;
```

**Then API would return:**
```json
{
  "failures": [
    { "reason": "BANK_FILE_AWAITED", "count": 45, "amount_paise": 23000000 },
    { "reason": "AMOUNT_MISMATCH", "count": 38, "amount_paise": 19000000 },
    { "reason": "DUPLICATE_IN_BANK", "count": 28, "amount_paise": 14000000 },
    { "reason": "MISSING_IN_PG", "count": 25, "amount_paise": 11462612 }
  ]
}
```

### **Phase 3: Link to Exceptions Table**
```sql
-- Query from sp_v2_exceptions table
SELECT 
  exception_type,
  COUNT(*) as count,
  SUM(amount_paise) as total_amount_paise
FROM sp_v2_exceptions
WHERE created_at >= $1 AND created_at <= $2
GROUP BY exception_type
ORDER BY count DESC;
```

**Benefits:**
- Detailed exception categorization
- Resolution tracking
- Aging analysis (how long exceptions are open)
- Owner assignment (Bank, Gateway, Ops, System)

---

## 📈 Failure Analysis Features

### **Current Features (Working):**
1. ✅ **Total failure count** from V2 database
2. ✅ **Total impact amount** in paise/rupees
3. ✅ **Percentage distribution** by failure type
4. ✅ **Donut chart visualization**
5. ✅ **Owner categorization** (currently all "System")

### **Mock Features (Placeholders):**
6. 🔶 **Weekly trend** for each failure reason (mock data)
7. 🔶 **Performance metrics** (mock: yesterday, this week, this month)

### **Future Features (Not Yet Implemented):**
8. ❌ **Detailed failure reasons** (need failure_reason column)
9. ❌ **Owner-based categorization** (Bank vs Gateway vs Ops)
10. ❌ **Resolution rate tracking**
11. ❌ **Aging buckets** (0-24h, 24-48h, 48-72h, >72h)
12. ❌ **Root cause analysis** from exceptions table

---

## 🛠️ How to Add More Failure Reasons

### **Option 1: Update Transaction Status (Quick)**
```javascript
// In settlement engine or reconciliation logic
if (bankFileMissing) {
  await pool.query(`
    UPDATE sp_v2_transactions 
    SET status = 'BANK_FILE_AWAITED' 
    WHERE transaction_id = $1
  `, [txnId]);
}

if (amountMismatch) {
  await pool.query(`
    UPDATE sp_v2_transactions 
    SET status = 'AMOUNT_MISMATCH' 
    WHERE transaction_id = $1
  `, [txnId]);
}
```

Then API query becomes:
```sql
SELECT 
  status as failure_reason,  -- Now returns specific reasons
  COUNT(*) as count,
  SUM(amount_paise) as total_amount_paise
FROM sp_v2_transactions
WHERE status NOT IN ('RECONCILED', 'PENDING')
GROUP BY status;
```

### **Option 2: Add Failure Reason Column (Better)**
```sql
-- Migration
ALTER TABLE sp_v2_transactions 
ADD COLUMN failure_reason VARCHAR(100),
ADD COLUMN failure_details JSONB;

-- Update logic
UPDATE sp_v2_transactions 
SET 
  status = 'EXCEPTION',
  failure_reason = 'AMOUNT_MISMATCH',
  failure_details = '{"expected": 5000, "actual": 4950, "diff": 50}'
WHERE transaction_id = '...';
```

Then API query:
```sql
SELECT 
  failure_reason,
  COUNT(*) as count,
  SUM(amount_paise) as total_amount_paise
FROM sp_v2_transactions
WHERE status = 'EXCEPTION' 
  AND failure_reason IS NOT NULL
GROUP BY failure_reason;
```

### **Option 3: Use Exceptions Table (Best for Production)**
```sql
-- sp_v2_exceptions table (already exists)
SELECT 
  exception_type as failure_reason,
  exception_category as owner,
  COUNT(*) as count,
  SUM(transaction_amount_paise) as total_amount_paise
FROM sp_v2_exceptions
WHERE resolution_status IN ('OPEN', 'IN_PROGRESS')
  AND created_at BETWEEN $1 AND $2
GROUP BY exception_type, exception_category
ORDER BY count DESC;
```

---

## 🎯 Current Implementation Status

### **Working with Real Data:**
```
✅ Failure count: 136 transactions
✅ Failure amount: ₹6.7 lakhs
✅ Failure type: EXCEPTION (100%)
✅ Donut chart: Displays
✅ Owner: System (default)
```

### **Using Mock Data:**
```
🔶 Weekly trend: Mock array [120, 125, 130, 136, 140, 145, 136]
🔶 Performance metrics: Mock percentages
```

### **To Enable Real Breakdown:**

1. **Add failure_reason column** to `sp_v2_transactions` OR
2. **Update status values** to be more specific OR  
3. **Query sp_v2_exceptions table** for detailed categorization

**Recommended:** Use `sp_v2_exceptions` table - it already has:
- `exception_type` (failure reason)
- `exception_category` (owner)
- `resolution_status` (OPEN, RESOLVED, etc.)
- `created_at`, `resolved_at` (aging)

---

## 📋 Summary

**Current State:**
- ✅ Failure Analysis is **powered by real V2 data**
- ✅ Shows 136 EXCEPTION transactions worth ₹6.7 lakhs
- ✅ Displays in donut chart with owner categorization
- 🔶 Some features use mock data (trends, performance)

**Why "No failure data available" appeared:**
- Component expected `breakupData.slices` format
- API returned simple `failures` array
- **Fixed by transforming data in hook** ✅

**How to improve:**
1. Add `failure_reason` column to transactions table
2. OR query `sp_v2_exceptions` table for detailed breakdown
3. Link failure reasons to owner categories (Bank, Gateway, Ops, System)
4. Add resolution tracking and aging metrics

**Result:** Failure Analysis now shows real data from V2 database! 🎉
