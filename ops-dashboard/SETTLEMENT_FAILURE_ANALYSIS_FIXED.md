# Settlement Failure Analysis - FIXED ✅

**Date:** October 2, 2025  
**Status:** Now showing real settlement failures instead of reconciliation exceptions

---

## 🎯 What Changed

### **Before (Incorrect):**
```
Source: sp_v2_transactions WHERE status IN ('EXCEPTION', 'FAILED')

Displayed:
  EXCEPTION: 136 transactions (100%)
  Owner: System
  
Problem: These are RECONCILIATION exceptions, not settlement failures!
```

### **After (Correct):**
```
Source: sp_v2_settlement_errors (actual settlement/payout failures)

Now Displays:
  Calculation Error: 189 failures (100%)
  Owner: System
  Open: 189 | Resolved: 0
  
Correct: These are actual settlement calculation failures!
```

---

## 📊 Current Real Data

### **Settlement Errors Table:**
```sql
SELECT error_type, COUNT(*), 
       COUNT(CASE WHEN is_resolved = false THEN 1 END) as open,
       COUNT(CASE WHEN is_resolved = true THEN 1 END) as resolved
FROM sp_v2_settlement_errors
GROUP BY error_type;

Result:
  calculation_error | 189 total | 189 open | 0 resolved
```

### **Specific Error Messages:**
```
Top calculation errors:
  1. "value '0238600286992727831488...' is out of range for type bigint" (1)
  2. "value '0108752542919546760839...' is out of range for type bigint" (1)
  3. "value '0782920703034159544851...' is out of range for type bigint" (1)
  4. "value '0443696733849227691576...' is out of range for type bigint" (1)
  5. "value '0170184660388628324494...' is out of range for type bigint" (1)
  
Root Cause: Bigint overflow during settlement calculation
```

---

## 🔧 Changes Made

### **1. Settlement Analytics API (Port 5107)**

**File:** `services/settlement-analytics-api/index.js`

**Old Query:**
```javascript
SELECT 
  status as failure_reason,
  COUNT(*) as count,
  COALESCE(SUM(amount_paise), 0) as total_amount_paise
FROM sp_v2_transactions
WHERE status IN ('EXCEPTION', 'FAILED')
GROUP BY status
```

**New Query:**
```javascript
SELECT 
  e.error_type as failure_reason,
  COUNT(*) as count,
  COUNT(DISTINCT e.batch_id) as affected_batches,
  COUNT(CASE WHEN e.is_resolved = false THEN 1 END) as open_count,
  COUNT(CASE WHEN e.is_resolved = true THEN 1 END) as resolved_count,
  COALESCE(SUM(
    CASE 
      WHEN b.net_amount_paise IS NOT NULL 
      THEN b.net_amount_paise 
      ELSE 0 
    END
  ), 0) as total_amount_paise
FROM sp_v2_settlement_errors e
LEFT JOIN sp_v2_settlement_batches b ON e.batch_id = b.id
WHERE 1=1
  AND e.created_at::date BETWEEN $1 AND $2
GROUP BY e.error_type
ORDER BY count DESC
LIMIT 10
```

**Added Owner & Label Mapping:**
```javascript
const ERROR_OWNER_MAP = {
  'bank_error': 'Bank',
  'api_error': 'Gateway',
  'validation_error': 'Ops',
  'calculation_error': 'System',
  'config_error': 'Ops'
};

const ERROR_LABEL_MAP = {
  'bank_error': 'Bank Error',
  'api_error': 'API/Integration Error',
  'validation_error': 'Validation Error',
  'calculation_error': 'Calculation Error',
  'config_error': 'Configuration Error'
};
```

**Response Structure:**
```javascript
{
  failures: [
    {
      reason: 'calculation_error',
      label: 'Calculation Error',
      owner: 'System',
      count: 189,
      affectedBatches: 0,
      openCount: 189,
      resolvedCount: 0,
      amount_paise: 0
    }
  ]
}
```

### **2. Frontend Hook**

**File:** `src/hooks/useAnalyticsV3.ts`

**Added Resolution Tracking:**
```typescript
const slices = data.failures.map((failure: any) => ({
  code: failure.reason,
  label: failure.label || failure.reason,       // Human-readable label
  owner: failure.owner || 'System',             // Owner categorization
  txns: failure.count,
  affectedBatches: failure.affectedBatches || 0,  // New field
  openCount: failure.openCount || 0,              // New field
  resolvedCount: failure.resolvedCount || 0,      // New field
  impactPaise: failure.amount_paise,
  sharePct: totalCount > 0 ? parseFloat(((failure.count / totalCount) * 100).toFixed(1)) : 0
}));
```

---

## 📈 Dashboard Now Shows

### **Settlement Failure Analysis Card:**
```
Title: Settlement Failure Analysis
Subtitle: Analysis of payout/settlement failure patterns

Donut Chart:
  🔴 Calculation Error (System)
     189 failures (100%)
     Impact: ₹0 (errors occurred before batch creation)
     Open: 189 | Resolved: 0

Legend (clickable):
  ● Calculation Error
    System
    100% share
    189 failures
```

### **Top Failure Reasons Table:**
```
FAILURE REASON        | YESTERDAY | CURRENT WEEK | CURRENT MONTH
--------------------- | --------- | ------------ | -------------
Calculation Error     |   --      |     --       |      --
  System              |           |              |
```

---

## 🎯 Data Quality

### **What This Reveals:**
1. **189 calculation errors** - These are legitimate settlement failures
2. **All are unresolved** - Need attention from engineering team
3. **Root cause: Bigint overflow** - Data validation issue in settlement calculator
4. **No batch impact** - Failures happened before batch creation (calculation phase)

### **Comparison with Previous View:**
```
OLD (Reconciliation Exceptions):
  EXCEPTION: 136 transactions
  → These are pre-reconciliation failures
  → Status field from sp_v2_transactions
  → Not related to settlement/payout failures

NEW (Settlement Failures):
  Calculation Error: 189 failures
  → These are settlement calculation failures
  → error_type field from sp_v2_settlement_errors
  → Actual settlement processing issues
```

---

## 🔍 Error Categories Available

The V2 database tracks **5 types** of settlement errors:

| Error Type | Owner | Description | Example |
|------------|-------|-------------|---------|
| `calculation_error` | System | Math/calculation issues | Bigint overflow, invalid amounts |
| `bank_error` | Bank | Bank API or transfer failures | API timeout, invalid account |
| `validation_error` | Ops | Data validation failures | Missing config, invalid merchant |
| `api_error` | Gateway | External API failures | PG API down, webhook failed |
| `config_error` | Ops | Configuration issues | Missing settlement config |

**Current State:**
- ✅ calculation_error: 189 failures
- ⚪ bank_error: 0
- ⚪ validation_error: 0
- ⚪ api_error: 0
- ⚪ config_error: 0

---

## 📋 Reconciliation Exceptions (Separate Concern)

**These are NOT settlement failures:**
```sql
SELECT status, COUNT(*) 
FROM sp_v2_transactions 
WHERE status IN ('EXCEPTION', 'FAILED')
GROUP BY status;

Result:
  EXCEPTION: 136 transactions (₹6.7 lakhs)
```

**These should be shown in a different section:**
- "Pre-Settlement Exceptions" or
- "Reconciliation Exceptions" or
- "Transaction Processing Exceptions"

**Why they're different:**
- EXCEPTION transactions never reached settlement stage
- They failed during reconciliation (matching PG txn to bank statement)
- Not related to payout/settlement processing
- Different resolution process (recon team vs settlement team)

---

## ✅ Summary

### **Fixed:**
- ✅ Changed data source from `sp_v2_transactions` to `sp_v2_settlement_errors`
- ✅ Added error type categorization (5 categories)
- ✅ Added owner mapping (Bank, Gateway, Ops, System)
- ✅ Added human-readable labels
- ✅ Added resolution tracking (open vs resolved)
- ✅ Added affected batch count

### **Now Showing:**
- ✅ Real settlement failures: 189 calculation errors
- ✅ Owner: System (not generic "System" for all)
- ✅ Resolution status: All open (0 resolved)
- ✅ Root cause visible: Bigint overflow during calculation

### **Next Steps:**
1. **Fix bigint overflow** in settlement calculator
2. **Add resolution workflow** for settlement errors
3. **Create separate section** for reconciliation exceptions (136 EXCEPTION txns)
4. **Add error drill-down** to see specific error messages per failure type

---

**Result:** Settlement Failure Analysis now shows **actual settlement failures** instead of reconciliation exceptions! 🎉
