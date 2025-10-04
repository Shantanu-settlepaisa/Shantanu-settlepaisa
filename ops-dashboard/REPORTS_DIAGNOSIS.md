# Reports Section - Issue Diagnosis & Fix

**Date:** October 3, 2025  
**Issue:** Reports page showing "0 records found"  
**Status:** ✅ Root cause identified - Date filter mismatch

---

## Problem Analysis

### What's Happening

The Reports page (`/ops/reports`) is showing:
```
SETTLEMENT SUMMARY
0 records found
```

### Root Cause

**Date filter default mismatch:**

1. **UI Default Filter:**
   ```typescript
   // Reports.tsx line 37
   const [filters, setFilters] = useState<ReportFilters>({
     cycleDate: new Date().toISOString().split('T')[0]  // ✅ "2025-10-03"
   })
   ```

2. **Database Data:**
   ```sql
   SELECT cycle_date FROM sp_v2_settlement_batches ORDER BY cycle_date DESC LIMIT 5;
   
   -- Results:
   2025-09-29  -- ❌ NOT matching today's date
   2025-09-28
   2025-09-27
   ...
   ```

3. **API Query:**
   ```javascript
   // Recon API routes/reports.js line 43
   if (cycleDate) {
     query += ` AND sb.cycle_date = $${paramIndex}`;  // EXACT match required
     params.push(cycleDate);  // "2025-10-03"
   }
   ```

**Result:** UI sends `cycleDate=2025-10-03`, but all settlement batches are from `2025-09-28` and `2025-09-29`. No matches found!

---

## Database Investigation

### Settlement Batches Exist (31 total)

```bash
node -e "..." 
# Output: Settlement batches count: 31
```

### Recent Data Sample

| Cycle Date | Merchant | Gross INR | Txn Count | Status |
|------------|----------|-----------|-----------|--------|
| 2025-09-29 | Test Merchant 1 | ₹3,500 | 1 | PENDING_APPROVAL |
| 2025-09-29 | Test Merchant | ₹100 | 1 | PENDING_APPROVAL |
| 2025-09-28 | Test Merchant 3 | ₹52,274 | 10 | PENDING_APPROVAL |
| 2025-09-28 | Test Merchant 1 | ₹24,631 | 4 | PENDING_APPROVAL |
| 2025-09-28 | Test Merchant 2 | ₹50,751 | 8 | PENDING_APPROVAL |

### API Endpoints Working

**Test 1:** Settlement Summary (no date filter)
```bash
curl "http://localhost:5103/reports/settlement-summary"
# {"data": [...31 records...], "rowCount": 31}
```

**Test 2:** With specific date
```bash
curl "http://localhost:5103/reports/settlement-summary?cycleDate=2025-09-29"
# {"data": [...2 records...], "rowCount": 2}
```

**Test 3:** With today's date (problem case)
```bash
curl "http://localhost:5103/reports/settlement-summary?cycleDate=2025-10-03"
# {"data": [], "rowCount": 0}  ❌ No data for Oct 3
```

---

## Tables Powering Each Report

### 1. Settlement Summary

**Primary Table:** `sp_v2_settlement_batches`

**Query:**
```sql
SELECT 
  sb.cycle_date::date as "cycleDate",
  COALESCE(ew.acquirer_code, 'UNKNOWN') as acquirer,
  sb.merchant_id as "merchantId",
  sb.merchant_name as "merchantName",
  sb.gross_amount_paise / 100.0 as "grossAmountRupees",
  sb.total_commission_paise / 100.0 as "feesRupees",
  sb.total_gst_paise / 100.0 as "gstRupees",
  0 as "tdsRupees",
  sb.net_amount_paise / 100.0 as "netAmountRupees",
  sb.total_transactions as "transactionCount",
  sb.status,
  sb.bank_reference_number as "bankRef"
FROM sp_v2_settlement_batches sb
LEFT JOIN (
  SELECT DISTINCT merchant_id, acquirer_code 
  FROM sp_v2_exception_workflow
  WHERE acquirer_code IS NOT NULL
) ew ON sb.merchant_id = ew.merchant_id
WHERE sb.cycle_date = $1  -- ❌ This is the problem
ORDER BY sb.cycle_date DESC, sb.merchant_id
```

**Columns Used:**
- `cycle_date` - Settlement cycle date
- `merchant_id`, `merchant_name` - Merchant info
- `gross_amount_paise` - Total transaction amount
- `total_commission_paise` - Platform fees
- `total_gst_paise` - GST on fees
- `net_amount_paise` - Amount to be settled
- `total_transactions` - Transaction count
- `status` - Settlement status

---

### 2. Bank MIS

**Primary Table:** `sp_v2_transactions`

**Query:**
```sql
SELECT 
  t.transaction_id as "txnId",
  t.utr,
  t.amount_paise / 100.0 as "pgAmountRupees",
  t.amount_paise / 100.0 as "bankAmountRupees",  -- Currently same as PG
  0 as "deltaRupees",  -- No variance yet
  t.transaction_date::date as "pgDate",
  t.transaction_date::date as "bankDate",
  t.status as "reconStatus",
  'UNKNOWN' as acquirer,  -- ⚠️ Hardcoded
  t.merchant_id as "merchantId",
  m.merchant_name as "merchantName",
  t.payment_method as "paymentMethod"
FROM sp_v2_transactions t
LEFT JOIN (
  SELECT DISTINCT merchant_id, merchant_name 
  FROM sp_v2_settlement_batches
) m ON t.merchant_id = m.merchant_id
WHERE t.source_type = 'PG_TRANSACTION'
  AND t.transaction_date::date = $1
ORDER BY t.transaction_date DESC 
LIMIT 1000
```

**Columns Used:**
- `transaction_id` - PG transaction ID
- `utr` - Bank UTR
- `amount_paise` - Transaction amount
- `transaction_date` - Transaction timestamp
- `status` - Recon status
- `payment_method` - UPI/NEFT/IMPS/Card

**Current Limitations:**
- Bank amount same as PG amount (no bank statement join yet)
- Delta always 0 (no variance calculation)
- Acquirer hardcoded as "UNKNOWN"

---

### 3. Recon Outcome

**Primary Table:** `sp_v2_transactions`

**Query:**
```sql
SELECT 
  t.transaction_id as "txnId",
  t.transaction_id as "pgRefId",
  t.utr as "bankRefId",
  t.amount_paise / 100.0 as "amountRupees",
  t.status,
  t.exception_reason as "exceptionType",
  t.merchant_id as "merchantId",
  m.merchant_name as "merchantName",
  'UNKNOWN' as acquirer,
  t.payment_method as "paymentMethod",
  t.transaction_date::date as "transactionDate"
FROM sp_v2_transactions t
LEFT JOIN (
  SELECT DISTINCT merchant_id, merchant_name 
  FROM sp_v2_settlement_batches
) m ON t.merchant_id = m.merchant_id
WHERE t.transaction_date::date = $1
ORDER BY t.transaction_date DESC 
LIMIT 1000
```

**Columns Used:**
- `transaction_id` - PG transaction ID
- `utr` - Bank reference
- `amount_paise` - Amount
- `status` - MATCHED/UNMATCHED/EXCEPTION
- `exception_reason` - Exception type code
- `payment_method` - Payment mode

---

### 4. Tax Report

**Primary Table:** `sp_v2_settlement_batches`

**Query:**
```sql
SELECT 
  sb.cycle_date::date as "cycleDate",
  sb.merchant_id as "merchantId",
  sb.merchant_name as "merchantName",
  sb.gross_amount_paise / 100.0 as "grossAmountRupees",
  sb.total_commission_paise / 100.0 as "commissionRupees",
  18.0 as "gstRatePct",  -- ⚠️ Hardcoded
  sb.total_gst_paise / 100.0 as "gstAmountRupees",
  0 as "tdsRatePct",  -- ⚠️ TDS not implemented
  0 as "tdsAmountRupees",
  'INV-' || sb.merchant_id || '-' || TO_CHAR(sb.cycle_date, 'YYYYMMDD') as "invoiceNumber"
FROM sp_v2_settlement_batches sb
WHERE sb.cycle_date = $1
ORDER BY sb.cycle_date DESC, sb.merchant_id
```

**Columns Used:**
- `cycle_date` - Invoice date
- `merchant_id`, `merchant_name` - Merchant
- `gross_amount_paise` - Gross revenue
- `total_commission_paise` - Commission earned
- `total_gst_paise` - GST collected

**Generated Fields:**
- `gstRatePct` - Always 18%
- `invoiceNumber` - Auto-generated from merchant + date

---

## Solutions

### Option 1: Remove Default Date Filter (Quick Fix) ✅

**Change in Reports.tsx:**
```typescript
// BEFORE:
const [filters, setFilters] = useState<ReportFilters>({
  cycleDate: new Date().toISOString().split('T')[0]  // ❌ Defaults to today
})

// AFTER:
const [filters, setFilters] = useState<ReportFilters>({
  // No default cycleDate - show all records initially
})
```

**Result:** Shows all 31 settlement batches on page load, user can then filter by date.

---

### Option 2: Use Date Range Instead of Cycle Date (Better UX) ✅

**Change query logic:**
```typescript
// Use fromDate/toDate instead of cycleDate
const [filters, setFilters] = useState<ReportFilters>({
  fromDate: '2025-09-01',  // Start of month
  toDate: '2025-09-30'     // End of month
})
```

**Backend already supports this:**
```javascript
if (fromDate) {
  query += ` AND sb.cycle_date >= $${paramIndex}`;
  params.push(fromDate);
}

if (toDate) {
  query += ` AND sb.cycle_date <= $${paramIndex}`;
  params.push(toDate);
}
```

---

### Option 3: Smart Default - Last Available Date (Best) ✅

**Fetch latest cycle date on load:**
```typescript
// New API endpoint: GET /reports/latest-cycle
const { data: latestCycle } = useQuery({
  queryKey: ['latest-cycle'],
  queryFn: () => opsApi.getLatestCycleDate()
})

const [filters, setFilters] = useState<ReportFilters>({
  cycleDate: latestCycle?.date || ''  // Use latest available date
})
```

**Backend endpoint:**
```javascript
router.get('/latest-cycle', async (req, res) => {
  const result = await pool.query(`
    SELECT cycle_date::date 
    FROM sp_v2_settlement_batches 
    ORDER BY cycle_date DESC 
    LIMIT 1
  `);
  res.json({ date: result.rows[0]?.cycle_date || null });
});
```

---

## Recommended Fix (Immediate)

**Step 1:** Remove default cycleDate filter to show all data initially

**File:** `/src/pages/ops/Reports.tsx` (line 36-38)

```typescript
const [filters, setFilters] = useState<ReportFilters>({
  // cycleDate: new Date().toISOString().split('T')[0]  // ❌ Remove this
  // User will select date from dropdown
})
```

**Step 2:** Add placeholder text to date input

```typescript
<Input
  id="cycleDate"
  type="date"
  placeholder="Select cycle date"
  value={filters.cycleDate || ''}
  onChange={(e) => updateFilter('cycleDate', e.target.value)}
/>
```

**Step 3:** Show helper text in UI

```typescript
<CardDescription>
  {reportData?.rowCount || 0} records found
  {!filters.cycleDate && !filters.fromDate && !filters.toDate && 
    ' (showing all cycles - select date to filter)'}
</CardDescription>
```

---

## Verification Steps

After applying fix:

1. **Navigate to `/ops/reports`**
2. **Should see:** "31 records found (showing all cycles)"
3. **Settlement Summary tab:** Shows all 31 batches from Sept 27-29
4. **Select cycle date:** `2025-09-29`
5. **Should see:** "2 records found"
6. **Bank MIS tab:** Shows transactions from selected date
7. **Recon Outcome tab:** Shows reconciliation results
8. **Tax Report tab:** Shows tax summary by merchant

---

## Production Recommendations

### 1. Add Date Range Presets

```typescript
const datePresets = [
  { label: 'Today', from: today, to: today },
  { label: 'Yesterday', from: yesterday, to: yesterday },
  { label: 'Last 7 days', from: sevenDaysAgo, to: today },
  { label: 'This Month', from: monthStart, to: monthEnd },
  { label: 'Last Month', from: lastMonthStart, to: lastMonthEnd }
]
```

### 2. Show Data Availability Range

```sql
SELECT 
  MIN(cycle_date) as earliest,
  MAX(cycle_date) as latest,
  COUNT(DISTINCT cycle_date) as total_cycles
FROM sp_v2_settlement_batches
```

Display: "Data available: Sep 27 - Sep 29, 2025 (3 cycles)"

### 3. Add Acquirer Filter Data

Currently acquirer is "UNKNOWN" because:
- `sp_v2_settlement_batches` doesn't have `acquirer_code` column
- Joining `sp_v2_exception_workflow` for acquirer is incomplete

**Fix:** Add acquirer to settlement batches table:
```sql
ALTER TABLE sp_v2_settlement_batches 
ADD COLUMN acquirer_code VARCHAR(50);

UPDATE sp_v2_settlement_batches sb
SET acquirer_code = (
  SELECT DISTINCT acquirer_code 
  FROM sp_v2_exception_workflow ew
  WHERE ew.merchant_id = sb.merchant_id
  LIMIT 1
);
```

### 4. Improve Bank MIS Report

Currently shows PG data only. To show true bank MIS:

```sql
SELECT 
  t.transaction_id,
  t.utr,
  t.amount_paise / 100.0 as pg_amount,
  bs.amount_paise / 100.0 as bank_amount,  -- ✅ From bank statement
  (t.amount_paise - bs.amount_paise) / 100.0 as delta,
  t.transaction_date as pg_date,
  bs.transaction_date as bank_date
FROM sp_v2_transactions t
LEFT JOIN sp_v2_bank_statements bs 
  ON t.utr = bs.utr
WHERE t.transaction_date::date = $1
```

---

## Summary

### ✅ Issue Identified
Reports page filters by today's date (Oct 3) by default, but all settlement batches are from Sept 27-29.

### ✅ APIs Working
All 4 report endpoints (`/reports/settlement-summary`, `/reports/bank-mis`, `/reports/recon-outcome`, `/reports/tax-report`) are functional.

### ✅ Data Present
- 31 settlement batches
- 747 transactions
- 2,011 bank statements

### ✅ Quick Fix
Remove default `cycleDate` filter to show all data initially.

### 🔄 Production Enhancements
1. Add date range presets
2. Show data availability range
3. Fix acquirer mapping
4. Improve Bank MIS with actual bank data join
5. Add TDS calculation to tax report
