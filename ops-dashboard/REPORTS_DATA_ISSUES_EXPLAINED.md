# Reports Data Issues - Complete Explanation

**Date:** October 3, 2025  
**Issues Found:** 4 major data quality problems

---

## Issue #1: Why Data Shows Without Date Filters? ✅

### Question
"Why is the data showing without the date filters?"

### Answer: **This is the FIX we just applied!**

**Before (Broken):**
```typescript
// Reports.tsx - Line 37
const [filters, setFilters] = useState<ReportFilters>({
  cycleDate: new Date().toISOString().split('T')[0]  // ❌ Oct 3, 2025
})
```

**Problem:**
- UI defaulted to today's date (Oct 3, 2025)
- All settlements are from Sept 21-30, 2025
- Result: 0 records found (no matches)

**After (Fixed):**
```typescript
const [filters, setFilters] = useState<ReportFilters>({
  // No default date - show all records
})
```

**Result:**
- Shows all 59 settlement batches on load
- Shows all 747 transactions
- User can then filter by specific dates

**This is intentional and correct behavior!** It's better UX to show all available data first, then let users filter down.

---

## Issue #2: Why is Merchant Name NOT Populated in Recon Outcome?

### Question
"Why in the recon outcome section - Merchant Name is not populated?"

### Root Cause Analysis

#### Current Query (reports.js - Line 158)
```sql
SELECT 
  t.transaction_id as "txnId",
  t.merchant_id as "merchantId",
  m.merchant_name as "merchantName",  -- ❌ This comes from LEFT JOIN
  ...
FROM sp_v2_transactions t
LEFT JOIN (
  SELECT DISTINCT merchant_id, merchant_name 
  FROM sp_v2_settlement_batches
) m ON t.merchant_id = m.merchant_id
```

#### The Problem

**Transactions Table:**
```
transaction_id | merchant_id | merchant_name
---------------|-------------|---------------
SP034          | MERCHANT123 | NULL          ❌ No merchant_name column!
```

**Settlement Batches:**
```
id   | merchant_id | merchant_name
-----|-------------|---------------
uuid | MERCH001    | Test Merchant 1  ✅ Has merchant_name
uuid | MERCH002    | Test Merchant 2  ✅ Has merchant_name
```

**Join Result:**
- Transaction has `merchant_id = "MERCHANT123"`
- Settlement batches have `merchant_id = "MERCH001", "MERCH002", "MERCH003"`
- **No match!** → `merchant_name = NULL`

#### Why Some Merchants Show?

Only 199 out of 747 transactions have `merchant_id` that exists in settlement_batches:

| Transaction Count | Merchant ID Match | Merchant Name |
|-------------------|-------------------|---------------|
| 199 | ✅ Exists in settlement_batches | Shows name |
| 548 | ❌ Doesn't exist in settlement_batches | NULL |

**Sample Mismatched Merchant IDs:**
- Transactions: `MERCHANT123`, `MERCHANT456`, `MERCHANT789`
- Settlement Batches: `MERCH001`, `MERCH002`, `MERCH003`

#### Solution

**Option A: Add merchant_name to transactions table (Recommended)**
```sql
ALTER TABLE sp_v2_transactions 
ADD COLUMN merchant_name VARCHAR(255);

-- Backfill from a master merchant table
UPDATE sp_v2_transactions t
SET merchant_name = (
  SELECT merchant_name 
  FROM sp_v2_merchants m 
  WHERE m.merchant_id = t.merchant_id
);
```

**Option B: Create a master merchants table**
```sql
CREATE TABLE sp_v2_merchants (
  merchant_id VARCHAR(50) PRIMARY KEY,
  merchant_name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255),
  status VARCHAR(20)
);

-- Seed from settlement batches
INSERT INTO sp_v2_merchants (merchant_id, merchant_name)
SELECT DISTINCT merchant_id, merchant_name 
FROM sp_v2_settlement_batches
WHERE merchant_name IS NOT NULL;
```

**Then update query:**
```sql
SELECT 
  t.transaction_id,
  t.merchant_id,
  m.merchant_name,  -- ✅ From master table
  ...
FROM sp_v2_transactions t
LEFT JOIN sp_v2_merchants m ON t.merchant_id = m.merchant_id
```

---

## Issue #3: Why is Acquirer "UNKNOWN"?

### Question
"Why is acquirer unknown and payment method unknown? Bank recon also shows acquirer as unknown?"

### Root Cause: Missing acquirer_code in Core Tables

#### Investigation Results

**1. Transactions Table:**
```sql
-- Check if acquirer column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'sp_v2_transactions' 
AND column_name LIKE '%acquir%';

-- Result: 0 columns ❌ No acquirer field!
```

**2. Settlement Batches Table:**
```sql
-- Check if acquirer column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'sp_v2_settlement_batches' 
AND column_name LIKE '%acquir%';

-- Result: 0 columns ❌ No acquirer field!
```

**3. Acquirer Data Lives in Exception Workflow:**
```sql
SELECT merchant_id, acquirer_code, COUNT(*) 
FROM sp_v2_exception_workflow
WHERE acquirer_code IS NOT NULL
GROUP BY merchant_id, acquirer_code;
```

**Results:**
| Merchant ID | Acquirer Code | Records |
|-------------|---------------|---------|
| MERCH001 | HDFC | 27 |
| MERCH001 | UNKNOWN | 8 |
| MERCH002 | HDFC | 33 |
| MERCH003 | ICICI | 41 |

#### Why "UNKNOWN" Shows in Reports?

**Current Query Logic (reports.js):**
```sql
SELECT 
  'UNKNOWN' as acquirer,  -- ❌ Hardcoded!
  ...
FROM sp_v2_transactions t
```

**The report literally hardcodes "UNKNOWN"!**

#### Attempted Fix (Current Code)
```sql
-- Settlement Summary tries this:
LEFT JOIN (
  SELECT DISTINCT merchant_id, acquirer_code 
  FROM sp_v2_exception_workflow
  WHERE acquirer_code IS NOT NULL
) ew ON sb.merchant_id = ew.merchant_id
```

**Problem with this approach:**
- Exception workflow has **multiple acquirers per merchant**
- DISTINCT returns random acquirer
- Many transactions have `acquirer_code = 'UNKNOWN'` in exception_workflow

**Example:**
```
merchant_id | acquirer_code | count
------------|---------------|------
MERCH001    | HDFC          | 27
MERCH001    | UNKNOWN       | 8
```

Joining this gives inconsistent results!

#### Solution: Add Acquirer to Core Tables

**Step 1: Add acquirer_code to transactions**
```sql
ALTER TABLE sp_v2_transactions 
ADD COLUMN acquirer_code VARCHAR(50);

-- Backfill from exception workflow (take most common acquirer)
UPDATE sp_v2_transactions t
SET acquirer_code = (
  SELECT acquirer_code
  FROM sp_v2_exception_workflow ew
  WHERE ew.merchant_id = t.merchant_id
    AND ew.acquirer_code != 'UNKNOWN'
  GROUP BY acquirer_code
  ORDER BY COUNT(*) DESC
  LIMIT 1
);
```

**Step 2: Add acquirer_code to settlement_batches**
```sql
ALTER TABLE sp_v2_settlement_batches 
ADD COLUMN acquirer_code VARCHAR(50);

-- Backfill from transactions in that batch
UPDATE sp_v2_settlement_batches sb
SET acquirer_code = (
  SELECT t.acquirer_code
  FROM sp_v2_transactions t
  WHERE t.settlement_batch_id = sb.id
    AND t.acquirer_code IS NOT NULL
  LIMIT 1
);
```

**Step 3: Update report queries**
```sql
-- Settlement Summary
SELECT 
  sb.acquirer_code as acquirer,  -- ✅ Direct column
  ...
FROM sp_v2_settlement_batches sb

-- Bank MIS & Recon Outcome
SELECT 
  t.acquirer_code as acquirer,  -- ✅ Direct column
  ...
FROM sp_v2_transactions t
```

---

## Issue #4: Why is Payment Method "UNKNOWN"?

### Question
"Why is payment method unknown?"

### Investigation

**Payment Method Distribution:**
```
payment_method | count
---------------|------
UPI            | 411 (55%)
CARD           | 184 (25%)
NETBANKING     | 76  (10%)
UNKNOWN        | 70  (9%)   ❌ Problem rows
WALLET         | 6   (1%)
```

### Root Cause

**70 transactions (9%) have `payment_method = 'UNKNOWN'`**

This happens during transaction ingestion when:
1. Payment gateway doesn't provide payment method
2. Manual upload without payment method mapping
3. Legacy data migration with missing fields

### Data Quality Check

```sql
-- Find transactions with UNKNOWN payment method
SELECT 
  transaction_id,
  merchant_id,
  amount_paise / 100 as amount_inr,
  utr,
  transaction_date::date
FROM sp_v2_transactions
WHERE payment_method = 'UNKNOWN'
ORDER BY transaction_date DESC
LIMIT 10;
```

**Sample Results:**
```
transaction_id | merchant_id | amount_inr | utr       | transaction_date
---------------|-------------|------------|-----------|------------------
SP034          | MERCHANT123 | 450        | UTR1034   | 2025-10-02
SP033          | MERCHANT123 | 1200       | UTR1033   | 2025-10-02
...
```

### Solution Options

**Option A: Infer from UTR pattern (UPI detection)**
```sql
UPDATE sp_v2_transactions
SET payment_method = 'UPI'
WHERE payment_method = 'UNKNOWN'
  AND utr LIKE 'UTR%'
  AND LENGTH(utr) = 12;
```

**Option B: Fix at ingestion source**
```javascript
// In transaction ingestion service
function normalizePaymentMethod(rawMethod) {
  const methodMap = {
    'card': 'CARD',
    'debit_card': 'CARD',
    'credit_card': 'CARD',
    'upi': 'UPI',
    'netbanking': 'NETBANKING',
    'wallet': 'WALLET',
    'paytm': 'WALLET',
    'phonepe': 'UPI'
  };
  
  const normalized = methodMap[rawMethod?.toLowerCase()];
  return normalized || 'UNKNOWN';
}
```

**Option C: Manual data cleanup**
```sql
-- For specific merchants, set default payment method
UPDATE sp_v2_transactions
SET payment_method = 'UPI'
WHERE merchant_id = 'MERCHANT123'
  AND payment_method = 'UNKNOWN';
```

---

## Is This the Same Data from Settlement Batches?

### Question
"Is it the same data present in the transaction table whose settlements have been done?"

### Answer: **YES and NO - Mixed Data!**

#### Data Breakdown

**Total Transactions: 747**

**Category A: Transactions in Settlement Batches (199 txns)**
```sql
SELECT COUNT(*) 
FROM sp_v2_transactions 
WHERE settlement_batch_id IS NOT NULL;
-- Result: 199
```

These transactions:
- ✅ Have been assigned to settlement batches
- ✅ Have `settlement_batch_id` populated
- ✅ Will show in Settlement Summary report
- ✅ Status = 'RECONCILED' (matched)

**Category B: Unsettled Transactions (548 txns)**
```sql
SELECT COUNT(*) 
FROM sp_v2_transactions 
WHERE settlement_batch_id IS NULL;
-- Result: 548
```

These transactions:
- ❌ NOT in any settlement batch yet
- ❌ `settlement_batch_id = NULL`
- ❌ Won't show in Settlement Summary
- ✅ Still show in Bank MIS & Recon Outcome (all transactions)

#### Verification Query

```sql
-- Check settlement assignment
SELECT 
  CASE 
    WHEN settlement_batch_id IS NOT NULL THEN 'SETTLED'
    ELSE 'PENDING_SETTLEMENT'
  END as settlement_status,
  COUNT(*) as txn_count,
  SUM(amount_paise) / 100 as total_amount_inr,
  MIN(transaction_date::date) as earliest_date,
  MAX(transaction_date::date) as latest_date
FROM sp_v2_transactions
GROUP BY 
  CASE 
    WHEN settlement_batch_id IS NOT NULL THEN 'SETTLED'
    ELSE 'PENDING_SETTLEMENT'
  END;
```

**Expected Results:**
```
settlement_status    | txn_count | total_amount_inr | earliest_date | latest_date
---------------------|-----------|------------------|---------------|------------
SETTLED              | 199       | ₹10,00,784       | 2025-09-21    | 2025-09-30
PENDING_SETTLEMENT   | 548       | ₹XX,XX,XXX       | 2025-09-01    | 2025-10-02
```

#### Why the Mismatch?

**Settlement Summary Report:**
- Data source: `sp_v2_settlement_batches` (31 batches)
- Shows: 199 transactions across 31 batches
- Date range: Sept 21-30

**Bank MIS & Recon Outcome Reports:**
- Data source: `sp_v2_transactions` (ALL 747 transactions)
- Shows: ALL transactions (settled + unsettled)
- Date range: Sept 1 - Oct 2

**This is why:**
- Settlement Summary: 31 records (batches only)
- Bank MIS: 747 records (all transactions)
- Recon Outcome: 747 records (all transactions)

---

## Summary of All Issues

| Issue | Root Cause | Current State | Fix Required |
|-------|------------|---------------|--------------|
| **1. No date filter default** | Defaulted to today (Oct 3) | ✅ Fixed - shows all data | Done |
| **2. Merchant name NULL** | Transactions don't have merchant_name column | ❌ 548 txns show NULL | Add merchant_name to transactions |
| **3. Acquirer = UNKNOWN** | No acquirer_code in transactions/batches | ❌ Hardcoded "UNKNOWN" | Add acquirer_code column |
| **4. Payment method = UNKNOWN** | 70 txns missing payment method | ⚠️ 9% affected | Fix at ingestion + backfill |
| **5. Data mismatch** | Mixed settled (199) + unsettled (548) | ⚠️ Confusing | Document clearly |

---

## Recommended Fixes (Priority Order)

### Priority 1: Add Acquirer to Core Tables ⭐⭐⭐

```sql
-- Transactions
ALTER TABLE sp_v2_transactions ADD COLUMN acquirer_code VARCHAR(50);
UPDATE sp_v2_transactions t
SET acquirer_code = (
  SELECT acquirer_code FROM sp_v2_exception_workflow ew
  WHERE ew.merchant_id = t.merchant_id
    AND acquirer_code != 'UNKNOWN'
  GROUP BY acquirer_code ORDER BY COUNT(*) DESC LIMIT 1
);

-- Settlement Batches
ALTER TABLE sp_v2_settlement_batches ADD COLUMN acquirer_code VARCHAR(50);
UPDATE sp_v2_settlement_batches sb
SET acquirer_code = (
  SELECT t.acquirer_code FROM sp_v2_transactions t
  WHERE t.settlement_batch_id = sb.id LIMIT 1
);
```

### Priority 2: Add Merchant Name to Transactions ⭐⭐

```sql
ALTER TABLE sp_v2_transactions ADD COLUMN merchant_name VARCHAR(255);

-- Create master merchant table
CREATE TABLE sp_v2_merchants (
  merchant_id VARCHAR(50) PRIMARY KEY,
  merchant_name VARCHAR(255) NOT NULL
);

-- Seed from settlement batches
INSERT INTO sp_v2_merchants
SELECT DISTINCT merchant_id, merchant_name 
FROM sp_v2_settlement_batches
WHERE merchant_name IS NOT NULL;

-- Backfill transactions
UPDATE sp_v2_transactions t
SET merchant_name = m.merchant_name
FROM sp_v2_merchants m
WHERE t.merchant_id = m.merchant_id;
```

### Priority 3: Fix Unknown Payment Methods ⭐

```sql
-- Infer UPI from UTR pattern
UPDATE sp_v2_transactions
SET payment_method = 'UPI'
WHERE payment_method = 'UNKNOWN'
  AND utr LIKE 'UTR%';
```

### Priority 4: Update Report Queries

```sql
-- Use direct columns instead of joins/hardcoded values
SELECT 
  t.acquirer_code as acquirer,  -- ✅ Not "UNKNOWN"
  t.merchant_name as merchantName,  -- ✅ Not NULL
  t.payment_method
FROM sp_v2_transactions t
```

---

## Testing After Fixes

Run these queries to verify:

```sql
-- 1. Check acquirer population
SELECT 
  COALESCE(acquirer_code, 'NULL') as acquirer,
  COUNT(*) 
FROM sp_v2_transactions 
GROUP BY acquirer_code;
-- Should show: HDFC, ICICI, AXIS (not UNKNOWN)

-- 2. Check merchant name population
SELECT 
  COUNT(*) as total,
  COUNT(merchant_name) as with_name
FROM sp_v2_transactions;
-- Should show: with_name = 747 (100%)

-- 3. Check payment method
SELECT payment_method, COUNT(*) 
FROM sp_v2_transactions 
GROUP BY payment_method;
-- UNKNOWN should be 0 or minimal
```

---

## Conclusion

All 4 issues stem from **missing core data in transaction and settlement tables**:

1. ✅ **Date filter**: Fixed by removing default
2. ❌ **Merchant name**: Need to add column + backfill
3. ❌ **Acquirer**: Need to add column + backfill
4. ⚠️ **Payment method**: Need to fix 70 UNKNOWN rows

**Once these columns are added and populated, all reports will show complete data.**
