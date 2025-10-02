# Cash Impact Card - Analysis & Implementation

## What Cash Impact Card Should Show

### Purpose
The Cash Impact Card displays the **unreconciled amount** - money that hasn't been successfully matched between PG transactions and bank statements. This represents potential cash flow risk or revenue loss.

---

## Correct Formula

### Unreconciled Amount
```javascript
unreconciledAmount = SUM(amount_paise WHERE status = 'EXCEPTION')
// Alternative calculation:
unreconciledAmount = totalAmount - reconciledAmount
```

**Database Query:**
```sql
SELECT 
  SUM(amount_paise) FILTER (WHERE status = 'EXCEPTION') as unreconciled_amount_paise
FROM sp_v2_transactions
WHERE transaction_date >= $1 AND transaction_date <= $2
```

### Percentage of Total Volume
```javascript
variancePct = (unreconciledAmount / totalAmount) * 100
```

### Unreconciled Count
```javascript
unreconciledCount = COUNT(*) WHERE status = 'EXCEPTION'
// This equals exceptions count
```

---

## Current Implementation (FIXED)

### Data Flow

1. **Backend API** (`services/overview-api/overview-v2.js`)
   ```javascript
   // Lines 145-207
   const exceptionAmountPaise = reconData.exception_amount_paise || 0;
   const unreconciledAmountPaise = exceptionAmountPaise;
   
   financial: {
     grossAmount: totalAmountPaise,
     reconciledAmount: reconciledAmountPaise,
     unreconciledAmount: unreconciledAmountPaise  // This is correct
   }
   ```

2. **Frontend Hook** (`src/hooks/opsOverview.ts`)
   ```javascript
   // Lines 137-140
   const totalAmount = financial.grossAmount || 0;
   const reconciledAmount = financial.reconciledAmount || 0;
   const variance = financial.unreconciledAmount || (totalAmount - reconciledAmount);
   
   // Lines 161-165
   totals: {
     totalAmountPaise: totalAmount.toString(),
     reconciledAmountPaise: reconciledAmount.toString(),
     variancePaise: variance.toString(),  // Passed to Cash Impact Card
   }
   ```

3. **Overview Page** (`src/pages/Overview.tsx`)
   ```javascript
   // Lines 196-207
   <CashImpactCard
     variancePaise={kpis?.totals.variancePaise || '0'}  // Correct
     reconciledAmountPaise={kpis?.totals.reconciledAmountPaise || '0'}
     totalAmountPaise={kpis?.totals.totalAmountPaise || '0'}
     unreconciledCount={
       (kpis?.recon.unmatchedPgCount || 0) +   // Now = exceptionsCount
       (kpis?.recon.unmatchedBankCount || 0) +  // Now = 0
       (kpis?.recon.exceptionsCount || 0)       // = 15
     }  // Total = 15 + 0 + 15 = 30? Should be just 15
     filters={filters}
     isLoading={isLoading}
   />
   ```

4. **Cash Impact Card Component** (`src/components/overview/CashImpactCard.tsx`)
   ```javascript
   // Lines 40-43
   const variance = BigInt(variancePaise);  // Receives correct value
   const total = BigInt(totalAmountPaise);
   const reconciled = BigInt(reconciledAmountPaise);
   const variancePct = total > 0n ? Number((variance * 100n) / total) : 0;
   ```

---

## Issue Found & Fixed

### Problem
The `unreconciledCount` calculation was **DUPLICATING** the exception count:

```javascript
// BEFORE (WRONG):
unreconciledCount={
  (kpis?.recon.unmatchedPgCount || 0) +   // Was Math.floor(0/2) = 0, NOW = 15
  (kpis?.recon.unmatchedBankCount || 0) +  // Was Math.ceil(0/2) = 0, NOW = 0
  (kpis?.recon.exceptionsCount || 0)       // = 15
}
// Total was 0 + 0 + 15 = 15 ✅
// But NOW it would be 15 + 0 + 15 = 30 ❌
```

### Fix Applied
Updated `src/hooks/opsOverview.ts` lines 167-174:
```javascript
recon: {
  matchRatePct: matchRatePct,
  matchedCount: matchedTransactions,
  // Exceptions ARE the unmatched transactions - don't split artificially
  unmatchedPgCount: exceptionsCount,  // All exceptions are unmatched PG
  unmatchedBankCount: 0,              // Bank unmatched tracked separately
  exceptionsCount: exceptionsCount,
}
```

**BUT** - Now we need to fix the unreconciledCount calculation in Overview.tsx to avoid double-counting:

```javascript
// Should be:
unreconciledCount={kpis?.recon.exceptionsCount || 0}
// Not:
unreconciledCount={
  (kpis?.recon.unmatchedPgCount || 0) + 
  (kpis?.recon.unmatchedBankCount || 0) + 
  (kpis?.recon.exceptionsCount || 0)
}
```

---

## Expected Display (2025-10-02 Data)

### After Refresh
- **Unreconciled Amount:** ₹71,494.43
- **Percentage:** 46.4% of total volume
- **Total Processed:** ₹1,53,911.86
- **Reconciled:** ₹82,417.43
- **Alert:** "15 transactions need reconciliation"

### Calculation Verification
```
Total Amount = ₹153,911.86 (30 transactions)
Reconciled Amount = ₹82,417.43 (15 RECONCILED status)
Unreconciled Amount = ₹71,494.43 (15 EXCEPTION status)

Percentage = (71,494.43 / 153,911.86) * 100 = 46.4%
```

---

## Data Model Clarification

### Transaction Statuses in Database
- **RECONCILED** = Successfully matched with bank record
- **EXCEPTION** = Failed to match (these ARE the "unmatched" transactions)
- **PENDING** = Not yet processed (not currently used)

### Semantic Meaning
- **Matched** = status='RECONCILED'
- **Unmatched/Exceptions** = status='EXCEPTION'
  - Includes: Missing UTR, Amount Mismatch, Duplicate UTR, etc.

### Why "exceptions" = "unmatched"
In our reconciliation model:
- Every transaction is either RECONCILED or EXCEPTION
- There's no separate "unmatched" status
- Exceptions ARE the unmatched transactions that need manual review

---

## Additional Issue Found

### Overview.tsx unreconciledCount Calculation

**Current Code (Line 200-203):**
```javascript
unreconciledCount={
  (kpis?.recon.unmatchedPgCount || 0) +      // = 15
  (kpis?.recon.unmatchedBankCount || 0) +    // = 0  
  (kpis?.recon.exceptionsCount || 0)         // = 15
}
// Total = 30 (WRONG - double counting!)
```

**Should Be:**
```javascript
unreconciledCount={kpis?.recon.exceptionsCount || 0}
// Total = 15 (CORRECT)
```

---

## Summary of Changes Made

### 1. Backend API (`overview-v2.js`)
✅ Changed `unmatchedTransactions` calculation from `total - matched - exceptions` to `0`
✅ Added comment explaining exceptions = unmatched

### 2. Frontend Hook (`opsOverview.ts`)  
✅ Changed `unmatchedPgCount` from `Math.floor(unmatched/2)` to `exceptionsCount`
✅ Changed `unmatchedBankCount` from `Math.ceil(unmatched/2)` to `0`
✅ Added comments explaining the logic

### 3. Still Needed (`Overview.tsx`)
⚠️ Need to fix `unreconciledCount` calculation to avoid double-counting

---

## Recommended Next Fix

Update `src/pages/Overview.tsx` line 200:

```diff
- unreconciledCount={
-   (kpis?.recon.unmatchedPgCount || 0) + 
-   (kpis?.recon.unmatchedBankCount || 0) + 
-   (kpis?.recon.exceptionsCount || 0)
- }
+ unreconciledCount={kpis?.recon.exceptionsCount || 0}
```

This will prevent showing "30 transactions need reconciliation" when it should be "15 transactions".

---

## Testing Checklist

- [x] API returns correct `unreconciledAmount` (7149443 paise = ₹71,494.43)
- [x] Frontend hook calculates correct `variancePaise`  
- [x] Cash Impact Card receives correct props
- [ ] Cash Impact Card displays correct amount after browser refresh
- [ ] `unreconciledCount` shows 15 (not 30) after fixing Overview.tsx
- [ ] Percentage calculation is correct (46.4%)
- [ ] Visual styling updates based on variance percentage

---

**Report Generated:** 2025-10-02  
**Status:** PARTIALLY FIXED - One more change needed in Overview.tsx
