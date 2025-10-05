# Mock Data Fallback Fix - Overview Dashboard

**Date**: 2025-10-05  
**Issue**: Dashboard showing 47 hardcoded transactions instead of 0 real transactions  
**Root Cause**: Faulty `hasRealData` logic causing fallback to mock data

---

## The Problem

Even though:
- ✅ Database has 0 transactions for today
- ✅ API returns 0 transactions correctly
- ✅ Date filter is set to "Today"

The dashboard was showing:
- ❌ 47 transactions
- ❌ ₹3.30K total amount
- ❌ 28 exceptions

---

## Root Cause

### File: `src/hooks/opsOverview.ts`

The transformation functions had **flawed logic** to detect real vs mock data:

```typescript
// OLD (PROBLEMATIC) - Lines 128, 239, 259, 305
const hasRealData = (pipeline.captured || pipeline.totalTransactions || 0) > 0;
//                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                   This evaluates to FALSE when API returns 0 transactions!
```

**What Happened:**

1. API correctly returns: `{ pipeline: { captured: 0, ... } }`
2. Code checks: `(0 || 0 || 0) > 0` → **FALSE**
3. Code thinks: "No real data, use mock data"
4. Falls into ELSE clause with hardcoded values:
   ```typescript
   const totalTxns = 47;        // ❌ Hardcoded!
   const matchedTxns = 17;
   const totalAmount = 330000;   // ₹3.30K
   const exceptionTxns = 28;
   ```

---

## The Fix

Changed the `hasRealData` check to detect **API source** instead of **transaction count**:

### Before (Broken):
```typescript
const hasRealData = (pipeline.captured || pipeline.totalTransactions || 0) > 0;
// ❌ Returns false when captured = 0
```

### After (Fixed):
```typescript
const hasRealData = v2Data.source === 'V2_DATABASE' || v2Data.pipeline !== undefined;
// ✅ Returns true as long as we have API data (even if 0 transactions)
```

**Why This Works:**

The API response includes a `source` field:
```json
{
  "source": "V2_DATABASE",  // ← Check this!
  "pipeline": {
    "captured": 0,
    "inSettlement": 0,
    ...
  }
}
```

- If `source === 'V2_DATABASE'`, we have real API data (even if empty)
- If `pipeline !== undefined`, we have a valid API response
- Only use mock data if **both** conditions are false (API completely failed)

---

## Files Changed

**File**: `src/hooks/opsOverview.ts`

Fixed in 4 transformation functions:

### 1. `transformV2ToKpis()` - Line 129
```typescript
// OLD
const hasRealData = (pipeline.captured || pipeline.totalTransactions || 0) > 0;

// NEW
const hasRealData = v2Data.source === 'V2_DATABASE' || v2Data.pipeline !== undefined;
```

### 2. `transformV2ToTopReasons()` - Line 239
```typescript
// OLD
const hasRealData = (pipeline.captured || pipeline.totalTransactions || 0) > 0;

// NEW
const hasRealData = v2Data.source === 'V2_DATABASE' || v2Data.pipeline !== undefined;
```

### 3. `transformV2ToPipeline()` - Line 259
```typescript
// OLD
const hasRealData = (pipeline.captured || pipeline.totalTransactions || 0) > 0;

// NEW
const hasRealData = v2Data.source === 'V2_DATABASE' || v2Data.pipeline !== undefined;
```

### 4. `transformV2ToReconSources()` - Line 305
```typescript
// OLD
const hasRealData = reconciliation.total > 0;

// NEW
const hasRealData = v2Data.source === 'V2_DATABASE' || v2Data.reconciliation !== undefined;
```

---

## What the Mock Data Was

When `hasRealData` was false, the dashboard showed these **hardcoded values**:

```typescript
// From transformV2ToKpis() - Line 190-196
const totalTxns = 47;               // ← This is where 47 came from!
const matchedTxns = 17;
const unmatchedTxns = 30;
const exceptionTxns = 28;           // ← 28 exceptions
const totalAmount = 330000;         // ← ₹3.30K in paise
const reconciledAmount = 250000;    // ← ₹2.50K
const variance = 80000;             // ← ₹800
```

These numbers were meant for **demonstration purposes** when the API is completely unavailable, but they were being shown even when the API was working fine (just returning 0 transactions).

---

## Testing the Fix

After the fix, when API returns 0 transactions:

### Old Behavior (Broken):
```
1. API returns: { source: 'V2_DATABASE', pipeline: { captured: 0 } }
2. Code checks: (0 || 0 || 0) > 0 → FALSE
3. Falls back to mock data
4. Shows: 47 transactions ❌
```

### New Behavior (Fixed):
```
1. API returns: { source: 'V2_DATABASE', pipeline: { captured: 0 } }
2. Code checks: v2Data.source === 'V2_DATABASE' → TRUE
3. Uses real API data
4. Shows: 0 transactions ✅
```

---

## When Mock Data SHOULD Be Used

Mock data should **only** be used when:

1. API is completely down (network error)
2. API returns invalid/malformed response
3. API returns undefined/null for all fields

It should **NOT** be used when:
- API returns 0 transactions (valid response)
- API returns empty arrays (valid response)
- API is working but has no data for the selected date range (valid response)

---

## Verification

After refreshing the browser, you should see:

✅ **0 transactions** for today  
✅ **₹0** total amount  
✅ **0 exceptions**  
✅ **36.0% match rate** (calculated from 0/0, shows as 0%)  

Console logs should show:
```
🔄 [V2 Hooks] Transforming V2 data to KPIs: {source: 'V2_DATABASE', pipeline: {captured: 0, ...}}
💰 [V2 Hooks] KPI Calculations: {totalTransactions: 0, matchedTransactions: 0, ...}
```

No more seeing the hardcoded 47 transactions!

---

## Impact

This fix affects **all dashboard pages** that use the overview hooks:

✅ **Overview** (`/ops/overview`) - Now shows real 0 instead of mock 47  
✅ **Analytics** - Correct data transformation  
✅ **Exceptions** - Correct exception count  
✅ **Any component using `useKpis`, `usePipeline`, etc.**

---

**Status**: ✅ Fixed  
**Impact**: Dashboard now correctly displays 0 transactions when there's no data  
**No Breaking Changes**: Mock data still available as fallback when API truly fails
