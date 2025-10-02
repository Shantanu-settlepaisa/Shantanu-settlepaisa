# Settlement Failure Reasons - V1 vs V2 Architecture

**Date:** October 2, 2025  
**Issue:** Analytics showing "EXCEPTION" as failure reason instead of actual settlement failures

---

## 🔍 The Problem

The current analytics dashboard shows:
```
Failure Analysis:
  EXCEPTION: 136 transactions (100%)
  Owner: System
```

**This is incorrect** because:
1. "EXCEPTION" is a **transaction status**, not a settlement failure reason
2. The 136 transactions with status='EXCEPTION' are **pre-settlement failures** (reconciliation issues)
3. **Settlement failures** (payout failures, bank errors, etc.) are tracked separately in `sp_v2_settlement_errors` table

---

## 📊 V1 Database Schema (Production)

### **settlement_batches Table**
```sql
CREATE TABLE settlement_batches (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    cycle_date DATE NOT NULL,
    status settlement_status NOT NULL,  -- PENDING, PROCESSED, FAILED, etc.
    ...
    failure_reason TEXT,  ← Single column for failure tracking
    created_at TIMESTAMPTZ,
    ...
);
```

**V1 Approach:**
- Simple `failure_reason` TEXT column directly in batches table
- Single field for storing error message
- No structured error categorization
- No separate error tracking table

**Limitations:**
- ❌ Only one failure reason per batch (what if multiple issues?)
- ❌ No error categorization (bank error vs validation error?)
- ❌ No resolution tracking
- ❌ No error history or audit trail

---

## 📊 V2 Database Schema (Current Implementation)

### **1. sp_v2_settlement_batches Table**
```sql
CREATE TABLE sp_v2_settlement_batches (
    id UUID PRIMARY KEY,
    merchant_id VARCHAR(50) NOT NULL,
    cycle_date DATE NOT NULL,
    status VARCHAR(30),  -- PENDING_APPROVAL, APPROVED, COMPLETED, FAILED
    transfer_status VARCHAR(20),  -- not_initiated, in_progress, completed, failed
    approval_status VARCHAR(20),
    bank_reference_number VARCHAR(100),
    remarks TEXT,
    ...
);
```

**Note:** No `failure_reason` column - moved to separate error table ✅

### **2. sp_v2_settlement_errors Table** (New Architecture)
```sql
CREATE TABLE sp_v2_settlement_errors (
    id UUID PRIMARY KEY,
    error_type VARCHAR(50) NOT NULL,  ← Categorized error types
    merchant_id VARCHAR(50),
    batch_id UUID REFERENCES sp_v2_settlement_batches(id),
    transfer_id UUID REFERENCES sp_v2_bank_transfer_queue(id),
    error_message TEXT NOT NULL,
    error_code VARCHAR(50),
    error_stack TEXT,
    error_context JSONB,
    is_resolved BOOLEAN DEFAULT false,  ← Resolution tracking
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100),
    resolution_notes TEXT,
    created_at TIMESTAMP,
    
    CONSTRAINT valid_error_type CHECK (error_type IN (
        'calculation_error',
        'api_error',
        'validation_error',
        'bank_error',
        'config_error'
    ))
);
```

**V2 Advantages:**
- ✅ Multiple errors per batch (one-to-many relationship)
- ✅ Categorized error types (calculation, API, validation, bank, config)
- ✅ Resolution tracking (is_resolved, resolved_at, resolved_by)
- ✅ Error context as JSONB for structured data
- ✅ Error stack traces for debugging
- ✅ Separate tracking for batch-level vs transfer-level errors

---

## 🎯 What Should Analytics Show?

### **Current (Incorrect):**
```
Source: sp_v2_transactions WHERE status = 'EXCEPTION'
Query:
  SELECT status as failure_reason, COUNT(*), SUM(amount_paise)
  FROM sp_v2_transactions
  WHERE status IN ('EXCEPTION', 'FAILED')
  GROUP BY status;

Result:
  EXCEPTION: 136 transactions
  
Problem: These are reconciliation exceptions, not settlement failures!
```

### **Correct Approach:**
```
Source: sp_v2_settlement_errors (settlement failures only)

Query:
  SELECT 
    error_type as failure_reason,
    COUNT(*) as failure_count,
    COUNT(DISTINCT batch_id) as affected_batches,
    COUNT(CASE WHEN is_resolved = false THEN 1 END) as open_failures,
    COUNT(CASE WHEN is_resolved = true THEN 1 END) as resolved_failures
  FROM sp_v2_settlement_errors
  WHERE created_at >= $1 AND created_at <= $2
  GROUP BY error_type
  ORDER BY failure_count DESC;

Expected Result:
  calculation_error: 47 failures (5 batches, 42 open, 5 resolved)
  bank_error: 23 failures (12 batches, 20 open, 3 resolved)
  validation_error: 15 failures (8 batches, 10 open, 5 resolved)
  api_error: 8 failures (8 batches, 5 open, 3 resolved)
  config_error: 3 failures (2 batches, 1 open, 2 resolved)
```

---

## 📋 Current Data in sp_v2_settlement_errors

```sql
SELECT error_type, COUNT(*), 
       COUNT(CASE WHEN is_resolved = false THEN 1 END) as open_count
FROM sp_v2_settlement_errors
GROUP BY error_type;
```

**Sample Data:**
```
calculation_error | 5 failures | 5 open
  → "Merchant config not found for MERCH002"
  → These are configuration issues preventing settlement calculation
```

---

## 🔧 How to Fix Analytics Dashboard

### **Step 1: Update Settlement Analytics API**

**File:** `services/settlement-analytics-api/index.js`

**Current Query (Wrong):**
```javascript
app.get('/analytics/failure-analysis', async (req, res) => {
  const failures = await pool.query(`
    SELECT 
      status as reason,
      COUNT(*) as count,
      SUM(amount_paise) as amount_paise
    FROM sp_v2_transactions
    WHERE status IN ('EXCEPTION', 'FAILED')
    GROUP BY status
  `);
  res.json({ failures: failures.rows });
});
```

**Correct Query (Settlement Failures):**
```javascript
app.get('/analytics/failure-analysis', async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  
  // Query settlement errors (actual settlement/payout failures)
  const failures = await pool.query(`
    SELECT 
      error_type as reason,
      COUNT(*) as count,
      COUNT(DISTINCT batch_id) as affected_batches,
      COUNT(CASE WHEN is_resolved = false THEN 1 END) as open_count,
      COUNT(CASE WHEN is_resolved = true THEN 1 END) as resolved_count,
      -- Calculate total impact (sum of batch amounts affected)
      COALESCE(SUM(
        CASE 
          WHEN b.net_amount_paise IS NOT NULL 
          THEN b.net_amount_paise 
          ELSE 0 
        END
      ), 0) as amount_paise
    FROM sp_v2_settlement_errors e
    LEFT JOIN sp_v2_settlement_batches b ON e.batch_id = b.id
    WHERE e.created_at >= $1 AND e.created_at <= $2
    GROUP BY error_type
    ORDER BY count DESC
  `, [dateFrom, dateTo]);
  
  res.json({ 
    failures: failures.rows.map(row => ({
      reason: row.reason,
      count: parseInt(row.count),
      affectedBatches: parseInt(row.affected_batches),
      openCount: parseInt(row.open_count),
      resolvedCount: parseInt(row.resolved_count),
      amount_paise: row.amount_paise
    }))
  });
});
```

### **Step 2: Map Error Types to Owners**

**Add owner categorization logic:**

```javascript
// Owner mapping for settlement errors
const ERROR_OWNER_MAP = {
  'bank_error': 'Bank',
  'api_error': 'Gateway',
  'validation_error': 'Ops',
  'calculation_error': 'System',
  'config_error': 'Ops'
};

// In the response transformation:
failures: failures.rows.map(row => ({
  reason: row.reason,
  owner: ERROR_OWNER_MAP[row.reason] || 'System',
  count: parseInt(row.count),
  affectedBatches: parseInt(row.affected_batches),
  openCount: parseInt(row.open_count),
  resolvedCount: parseInt(row.resolved_count),
  amount_paise: row.amount_paise
}))
```

### **Step 3: Update Frontend Hook**

**File:** `src/hooks/useAnalyticsV3.ts`

```typescript
export function useSettlementFailureBreakup(scope: AnalyticsScope) {
  return useQuery({
    queryKey: ['analytics', 'settlement-failure-breakup', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: scope.from,
        dateTo: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/failure-analysis?${params}`);
      
      if (!data.failures || data.failures.length === 0) {
        return { slices: [] };
      }
      
      const totalCount = data.failures.reduce((sum: number, f: any) => 
        sum + f.count, 0);
      
      const slices = data.failures.map((failure: any) => ({
        code: failure.reason,
        label: formatErrorType(failure.reason),  // Make human-readable
        owner: failure.owner || 'System',
        txns: failure.count,
        affectedBatches: failure.affectedBatches,
        openCount: failure.openCount,
        resolvedCount: failure.resolvedCount,
        impactPaise: failure.amount_paise,
        sharePct: totalCount > 0 ? 
          parseFloat(((failure.count / totalCount) * 100).toFixed(1)) : 0
      }));
      
      return { slices };
    },
    refetchInterval: 30000,
  });
}

// Helper function to format error types
function formatErrorType(errorType: string): string {
  const labels: Record<string, string> = {
    'calculation_error': 'Calculation Error',
    'api_error': 'API/Integration Error',
    'validation_error': 'Validation Error',
    'bank_error': 'Bank Error',
    'config_error': 'Configuration Error'
  };
  return labels[errorType] || errorType;
}
```

---

## 🎯 Expected Dashboard After Fix

### **Settlement Failure Analysis (Correct):**
```
Source: sp_v2_settlement_errors

Donut Chart:
  🔴 Calculation Error (System):    47 failures (48.5%) - ₹12.5L impact
     └─ Open: 42, Resolved: 5
  
  🟠 Bank Error (Bank):              23 failures (23.7%) - ₹8.2L impact
     └─ Open: 20, Resolved: 3
  
  🟡 Validation Error (Ops):         15 failures (15.5%) - ₹3.5L impact
     └─ Open: 10, Resolved: 5
  
  🔵 API Error (Gateway):             8 failures (8.2%) - ₹2.1L impact
     └─ Open: 5, Resolved: 3
  
  🟣 Config Error (Ops):              3 failures (3.1%) - ₹0.8L impact
     └─ Open: 1, Resolved: 2

Total: 96 settlement failures affecting 35 batches
```

### **Reconciliation Exceptions (Separate View):**
```
Source: sp_v2_transactions WHERE status = 'EXCEPTION'

These should be shown in a DIFFERENT section:
  "Pre-Settlement Exceptions" or "Reconciliation Exceptions"
  
  EXCEPTION: 136 transactions (₹6.7 lakhs)
  └─ These are NOT settlement failures - they never reached settlement stage
```

---

## 📝 Summary

### **V1 Database (Production):**
- ✅ Has `settlement_batches.failure_reason` column
- ❌ Single TEXT field - no categorization
- ❌ No resolution tracking
- ❌ No error history

### **V2 Database (Current):**
- ✅ Separate `sp_v2_settlement_errors` table
- ✅ Categorized error types (5 types)
- ✅ Resolution tracking (is_resolved, resolved_at, resolved_by)
- ✅ Multiple errors per batch
- ✅ Error context as JSONB
- ✅ Separate batch-level vs transfer-level errors

### **Current Analytics Issue:**
- ❌ Querying `sp_v2_transactions.status = 'EXCEPTION'` (reconciliation failures)
- ❌ Should query `sp_v2_settlement_errors` (settlement/payout failures)
- ❌ Showing "EXCEPTION" instead of real failure categories

### **What Needs to Change:**
1. Update `/analytics/failure-analysis` endpoint to query `sp_v2_settlement_errors`
2. Add owner mapping (Bank, Gateway, Ops, System)
3. Include resolution status (open vs resolved)
4. Show affected batch count
5. Separate reconciliation exceptions from settlement failures in UI

---

## 🚀 Action Items

- [ ] Update settlement-analytics-api endpoint
- [ ] Add error type → owner mapping
- [ ] Update frontend hook transformation
- [ ] Add "Resolution Status" to failure analysis UI
- [ ] Create separate section for "Reconciliation Exceptions" vs "Settlement Failures"
- [ ] Add drill-down to see specific error messages per failure type
