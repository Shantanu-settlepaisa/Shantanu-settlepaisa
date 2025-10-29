# Issues Found During Staging 2 E2E Testing (Oct 27, 2025)

## 🔴 Critical Issues Blocking E2E Test

### Issue #1: Reconciliation Fetch Query - Status Filter Too Restrictive
**File**: `services/recon-api/jobs/runReconciliation.js:574-576`

**Problem**:
```javascript
// Current query in fetchPGFromDatabase()
WHERE DATE(transaction_date) = $1
  AND source_type = 'MANUAL_UPLOAD'
  AND status = 'PENDING'  // ❌ TOO RESTRICTIVE
```

**Why it fails**:
- Uploaded CSV files have `status = 'SUCCESS'` (from V1 format)
- Query filters `status = 'PENDING'` only
- Result: 0 transactions found, falls back to PG API (http://localhost:5101)
- PG API doesn't exist → recon job fails

**Expected behavior**:
- Should fetch ALL manual upload transactions regardless of status
- Status should only filter connector-based transactions, not manual uploads

**Evidence**:
- First recon job (cb999f50): Fetched 25 PG, 18 Bank successfully
- Second recon job (36135b9c): Failed with "PG_UNREACHABLE" error

---

### Issue #2: Bank-Specific Overwrite Not Supported
**File**: `services/api/file-upload-v2.cjs:481-484`

**Problem**:
```javascript
// In cleanDataForDate() function
DELETE FROM sp_v2_bank_statements
WHERE DATE(transaction_date) = $1
AND source_type = 'MANUAL_UPLOAD'
// ❌ Missing: AND bank_name = $2
```

**Why it's wrong**:
- Deletes ALL bank statements for a date
- Not bank-specific (e.g., deletes both HDFC AND AXIS)

**User requirement**:
> "if hdfc is uploaded and axis is uploaded and then again correct hdfc is upload then it should overwrite hdfc records only"

**Impact**:
- Cannot have multiple banks for same date
- Re-uploading HDFC deletes AXIS data
- Data loss risk

**Solution needed**:
```javascript
async function cleanDataForDate(date, fileType, bankName = null, client = null) {
  // ...
  if (fileType === 'bank_statements' && bankName) {
    DELETE FROM sp_v2_bank_statements
    WHERE DATE(transaction_date) = $1
    AND source_type = 'MANUAL_UPLOAD'
    AND bank_name = $2  // ✅ Bank-specific
  }
}
```

---

### Issue #3: Overwrite Safety Check - Column Does Not Exist
**File**: `services/api/file-upload-v2.cjs:458-464`

**Problem**:
```javascript
// Line 461
const bankReconCheck = await client.query(`
  SELECT COUNT(DISTINCT bs.id) as count
  FROM sp_v2_bank_statements bs
  JOIN sp_v2_reconciliation_results rr ON bs.utr = rr.utr  // ❌ Column rr.utr doesn't exist
  WHERE DATE(bs.transaction_date) = $1
  AND bs.source_type = 'MANUAL_UPLOAD'
`, [date]);
```

**Error**:
```
{"error":"column rr.utr does not exist","uploadSessionId":"e474e191-b388-42ab-b095-618d97c1144b","rolled_back":true}
```

**Why it fails**:
- `sp_v2_reconciliation_results` table schema doesn't have `utr` column
- Wrong join condition

**Solution needed**:
- Check actual `sp_v2_reconciliation_results` schema
- Fix join condition or remove this check if table doesn't exist

---

## ⚠️ Data Quality Issues

### Issue #4: Test File Generation - UTR Mismatch in Bank File
**File**: `test-hdfc-v1-staging2-oct27.csv` (FIXED)

**Problem**:
```csv
MERCHANT_TRACKID,DOMESTIC AMT
TXN20251027001,5000.00  // ❌ Should be AXISN0251027001
```

**Why it's wrong**:
- HDFC recon config maps `MERCHANT_TRACKID` → `utr`
- We put transaction IDs instead of UTR values
- Result: PG UTR (AXISN0251027001) ≠ Bank UTR (TXN20251027001)
- 0% match rate

**Status**: ✅ FIXED
- Created `test-hdfc-v1-staging2-oct27-FIXED.csv` with correct UTR values
- Uploaded successfully (18 rows)

---

### Issue #5: Duplicate Bank Records After Re-upload
**Current state**: Database now has 36 bank records (18 old wrong + 18 new correct)

**Why**:
- First upload: 18 records with wrong UTRs (TXN20251027001...)
- Second upload: 18 records with correct UTRs (AXISN0251027001...)
- No overwrite used (due to Issue #3)
- Duplicate detection checks `utr + bank_name` uniqueness
- Different UTRs = different records

**Impact**:
- Reconciliation will see 36 bank records instead of 18
- 18 unmatched bank records with wrong UTRs

---

## 📊 Current Database State

### PG Transactions (sp_v2_transactions)
```
Count: 25 rows
Source: MANUAL_UPLOAD
Status: SUCCESS (from CSV)
Date: 2025-10-27
UTRs: AXISN0251027001 to AXISN0251027025
Amount: ₹6,44,500
```

### Bank Statements (sp_v2_bank_statements)
```
Count: 36 rows total
  - 18 rows: UTR = TXN20251027001... (WRONG, from first upload)
  - 18 rows: UTR = AXISN0251027001... (CORRECT, from second upload)
Source: MANUAL_UPLOAD
Date: 2025-10-27
Bank: HDFC BANK
Amount: ₹8,76,000 (₹4,38,000 x 2)
```

---

## 🎯 Required Fixes (Priority Order)

### Priority 1: Make Reconciliation Work (BLOCKING)

**Fix #1A: Remove status filter for manual uploads**
```javascript
// File: services/recon-api/jobs/runReconciliation.js:574-576

// BEFORE:
WHERE DATE(transaction_date) = $1
  AND source_type = 'MANUAL_UPLOAD'
  AND status = 'PENDING'

// AFTER:
WHERE DATE(transaction_date) = $1
  AND source_type = 'MANUAL_UPLOAD'
  // No status filter for manual uploads
```

**Fix #1B: Clean duplicate bank data**
```sql
-- Delete old wrong bank records
DELETE FROM sp_v2_bank_statements
WHERE DATE(transaction_date) = '2025-10-27'
AND source_type = 'MANUAL_UPLOAD'
AND utr LIKE 'TXN%'  -- Old wrong UTRs
```

### Priority 2: Fix Bank-Specific Overwrite

**Fix #2: Add bank_name parameter to cleanDataForDate()**
```javascript
// File: services/api/file-upload-v2.cjs

async function cleanDataForDate(date, fileType, bankName = null, client = null) {
  // ... existing code ...

  if (fileType === 'bank_statements' || fileType === 'bank_data') {
    let deleteQuery = `
      DELETE FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = $1
      AND source_type = 'MANUAL_UPLOAD'
    `;
    let params = [date];

    // ✅ Add bank-specific filter if provided
    if (bankName) {
      deleteQuery += ` AND bank_name = $2`;
      params.push(bankName);
    }

    const result = await client.query(deleteQuery, params);
  }
}
```

### Priority 3: Fix Overwrite Safety Check

**Fix #3: Check sp_v2_reconciliation_results schema and fix query**
- Need to check actual table structure
- Fix or remove the broken join

---

## 📁 Reference: Check Staging 1

**Next steps**:
1. Check Staging 1 git branch for working recon engine
2. Compare `runReconciliation.js` differences
3. Check if Staging 1 has status filter or not
4. Apply working logic to Staging 2

**Staging 1 Details**:
- URL: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/overview
- Git: Check for `staging-1` or `main` branch
- Working reconciliation engine reference

---

## ✅ What's Working

1. ✅ Authentication (JWT tokens)
2. ✅ Migration 032 applied
3. ✅ File uploads (both PG and Bank)
4. ✅ V1→V2 conversion working
5. ✅ Upload session tracking
6. ✅ Test file generation (after fix)

---

## 🚫 What's Blocked

1. ❌ Reconciliation (status filter + duplicate data)
2. ❌ Settlement batch creation (depends on recon)
3. ❌ Overview Dashboard metrics (no data to show)
4. ❌ Complete E2E test (blocked by above)

---

*Generated: Oct 27, 2025, 5:00 PM IST*
*Environment: Staging 2*
*Status: BLOCKED - Awaiting fixes*
