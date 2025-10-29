# Settlement Pipeline Label Fix

## Issue
Settlement Pipeline was showing "Exceptions: 28" when it should show "Unsettled: 28"

## Problem Explanation

### Two Different Concepts:

1. **Reconciliation Exceptions** (3 transactions)
   - Location: Exceptions Card (separate component)
   - Meaning: Conflicts in reconciliation (duplicate UTR, missing UTR, amount mismatch)
   - Status: Need manual intervention to resolve reconciliation issues

2. **Unsettled Transactions** (28 transactions)
   - Location: Settlement Pipeline (red segment)
   - Meaning: Transactions NOT YET in settlement pipeline
   - Status: May be pending, unmatched, or waiting for next settlement cycle

### The Bug:
The Settlement Pipeline component was incorrectly labeling "unsettled" transactions as "Exceptions", causing confusion between two separate concepts.

## Changes Made

### 1. `/Users/shantanusingh/ops-dashboard/src/components/SettlementPipeline.tsx`

**Line 83**: Changed label
```typescript
// BEFORE
label: 'Exceptions',

// AFTER
label: 'Unsettled',
```

**Line 116**: Updated tooltip
```typescript
// BEFORE
<p>🟥 <b>Exceptions</b> - Reconciliation failed or settlement rejected, needs review</p>

// AFTER  
<p>🟥 <b>Unsettled</b> - Not yet in settlement pipeline, may be pending or unmatched</p>
```

### 2. `/Users/shantanusingh/ops-dashboard/src/components/overview/SettlementPipeline.tsx`

**Line 102**: Changed label
```typescript
// BEFORE
label: 'Exceptions',

// AFTER
label: 'Unsettled',
```

**Lines 160-161**: Updated tooltip
```typescript
// BEFORE
<b>Exceptions</b> — Reconciliation <i>failed or settlement rejected</i> 
(e.g., amount mismatch, missing UTR, duplicate entry). Needs Ops review.

// AFTER
<b>Unsettled</b> — Transactions <i>not yet in settlement pipeline</i>
(may be pending, unmatched, or waiting for next settlement cycle).
```

**Line 168**: Updated summary formula
```typescript
// BEFORE
Captured = Reconciled + Settled + Credited to Merchant + Exceptions

// AFTER
Captured = Reconciled + Settled + Credited to Merchant + Unsettled
```

## Result

### Dashboard Now Shows Correctly:

**Settlement Pipeline**:
- 🟦 Reconciled: 116 (in settlement)
- 🟧 Settled: 0 (sent to bank)
- 🟩 Credited to Merchant: 50 (successfully paid)
- 🟥 **Unsettled: 28** ← Fixed label

**Exceptions Card** (separate):
- Shows: **3 exceptions** (2 critical + 1 high)
- This is for reconciliation conflicts only

## Verification

Open http://localhost:5174/ops/overview and verify:
- Settlement Pipeline red segment shows "Unsettled: 28"
- Hover over red segment tooltip says "Unsettled - Not yet in settlement pipeline"
- Exceptions Card shows "3 exceptions" (unchanged, correct)
- No confusion between settlement status and reconciliation exceptions

## Status: ✅ COMPLETE

The Settlement Pipeline now correctly distinguishes between:
- **Settlement status** (Reconciled/Settled/Credited/Unsettled)
- **Reconciliation exceptions** (shown in separate Exceptions Card)
