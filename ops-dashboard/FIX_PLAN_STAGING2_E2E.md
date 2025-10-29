# Fix Plan: Staging 2 E2E Test Issues

**Date**: October 27, 2025
**Branch**: feat/ops-dashboard-exports
**Environment**: Staging 2 (52.66.199.215)

---

## 🎯 Summary of Issues

| # | Issue | Status | Priority | Impact |
|---|-------|--------|----------|--------|
| 1 | Status filter too restrictive in fetchPGFromDatabase | ❌ NOT FIXED | 🔴 CRITICAL | Blocks reconciliation |
| 2 | Bank-specific overwrite not supported | ❌ NOT FIXED | 🟡 HIGH | Data loss risk |
| 3 | Overwrite safety check - column doesn't exist | ❌ NOT FIXED | 🟡 HIGH | Upload fails with overwrite |
| 4 | Duplicate bank data (18 old + 18 new) | ⚠️ DATA ISSUE | 🟡 HIGH | Wrong recon results |
| 5 | Test file UTR mismatch | ✅ FIXED | - | - |

---

## 🔧 Fix #1: Remove Status Filter (CRITICAL - DO THIS FIRST)

### Problem
```javascript
// services/recon-api/jobs/runReconciliation.js:574-576
WHERE DATE(transaction_date) = $1
  AND source_type = 'MANUAL_UPLOAD'
  AND status = 'PENDING'  // ❌ Filters out SUCCESS status
```

**Why it fails**:
- Uploaded CSV files have `status = 'SUCCESS'` (from V1 format field)
- Query only fetches `status = 'PENDING'`
- Returns 0 rows → falls back to PG API → PG API doesn't exist → job fails

### Solution
```javascript
// Remove the status filter for manual uploads
WHERE DATE(transaction_date) = $1
  AND source_type = 'MANUAL_UPLOAD'
  // Status filter removed - manual uploads can have any status
```

### Files to Change
**File**: `services/recon-api/jobs/runReconciliation.js`

**Line 574-576** (fetchPGFromDatabase function):
```javascript
// BEFORE:
const query = `
  SELECT
    transaction_id,
    merchant_id,
    amount_paise,
    gross_amount_paise,
    utr,
    rrn,
    payment_method,
    transaction_date,
    transaction_timestamp,
    status,
    source_type
  FROM sp_v2_transactions
  WHERE DATE(transaction_date) = $1
    AND source_type = 'MANUAL_UPLOAD'
    AND status = 'PENDING'  // ❌ REMOVE THIS LINE
  ORDER BY transaction_date
`;

// AFTER:
const query = `
  SELECT
    transaction_id,
    merchant_id,
    amount_paise,
    gross_amount_paise,
    utr,
    rrn,
    payment_method,
    transaction_date,
    transaction_timestamp,
    status,
    source_type
  FROM sp_v2_transactions
  WHERE DATE(transaction_date) = $1
    AND source_type = 'MANUAL_UPLOAD'
    // ✅ No status filter - manual uploads can be SUCCESS, PENDING, etc.
  ORDER BY transaction_date
`;
```

### Testing After Fix
```bash
# 1. Make the code change above
# 2. Deploy to Staging 2
# 3. Re-run reconciliation
curl -X POST "http://52.66.199.215:5103/recon/run" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-10-27"}'

# Expected: pgFetched: 25, bankFetched: 36 (includes duplicates)
```

---

## 🔧 Fix #2: Clean Duplicate Bank Data

### Problem
Database currently has:
- 18 old bank records with UTR = TXN20251027001... (WRONG)
- 18 new bank records with UTR = AXISN0251027001... (CORRECT)
- Total: 36 records

**Impact**: Reconciliation will see 18 unmatched bank records with wrong UTRs

### Solution (Run on Staging 2 RDS via EC2)
```sql
-- Delete old wrong bank records
DELETE FROM sp_v2_bank_statements
WHERE DATE(transaction_date) = '2025-10-27'
  AND source_type = 'MANUAL_UPLOAD'
  AND bank_name = 'HDFC BANK'
  AND utr LIKE 'TXN%';  -- Only delete old wrong UTRs

-- Verify: Should delete exactly 18 rows
```

### Expected After Cleanup
- PG transactions: 25 rows
- Bank statements: 18 rows (only correct ones)
- Expected matches: 18
- Expected unmatched PG: 7 (TXN19-25 have no bank records)

---

## 🔧 Fix #3: Bank-Specific Overwrite Support

### Problem
```javascript
// services/api/file-upload-v2.cjs:481-484
DELETE FROM sp_v2_bank_statements
WHERE DATE(transaction_date) = $1
AND source_type = 'MANUAL_UPLOAD'
// ❌ Missing: AND bank_name = $2
```

**Impact**: Deletes ALL banks for a date, not just the specific bank

### Solution
**File**: `services/api/file-upload-v2.cjs`

**Function**: `cleanDataForDate()` (line 299)

**Changes**:
1. Add `bankName` parameter
2. Add bank-specific filter when provided

```javascript
// Line 299 - Add bankName parameter
async function cleanDataForDate(date, fileType, bankName = null, client = null) {
  // ... existing code ...

  // Line 455-487 - Update bank deletion logic
  if (fileType === 'bank_statements' || fileType === 'bank_data') {
    // Safety check (existing)
    const bankReconCheck = await client.query(`
      SELECT COUNT(DISTINCT bs.id) as count
      FROM sp_v2_bank_statements bs
      WHERE DATE(bs.transaction_date) = $1
      AND bs.source_type = 'MANUAL_UPLOAD'
    `, [date]);

    // Build deletion query with optional bank filter
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
      log(`🧹 [Overwrite] Deleting only ${bankName} statements for ${date}`);
    } else {
      log(`⚠️  [Overwrite] Deleting ALL bank statements for ${date}`);
    }

    const result = await client.query(deleteQuery, params);
    bankDeleted = result.rowCount;
    log(`🧹 [Overwrite] Deleted ${bankDeleted} bank statements`);
  }
}
```

**Line 140-180 - Pass bankName to cleanDataForDate**:
```javascript
// In POST /api/upload/single endpoint

// Detect bank name from file or sourceType
const bankName = (detectedType === 'bank_statements' && sourceType) ? sourceType : null;

if (overwriteMode) {
  log(`🔄 [Overwrite] Cleaning existing data for ${date}, fileType: ${fileType}, bank: ${bankName || 'ALL'}`);
  const deletionStats = await cleanDataForDate(date, fileType, bankName, client);  // ✅ Pass bankName
  // ...
}
```

---

## 🔧 Fix #4: Fix Overwrite Safety Check (Column Error)

### Problem
```javascript
// Line 458-464
const bankReconCheck = await client.query(`
  SELECT COUNT(DISTINCT bs.id) as count
  FROM sp_v2_bank_statements bs
  JOIN sp_v2_reconciliation_results rr ON bs.utr = rr.utr  // ❌ Column doesn't exist
  WHERE DATE(bs.transaction_date) = $1
  AND bs.source_type = 'MANUAL_UPLOAD'
`, [date]);
```

**Error**: `column rr.utr does not exist`

### Solution Option 1: Remove the check
```javascript
// Lines 456-478 - Comment out or remove the reconciliation check
// This check was trying to prevent deleting reconciled data
// But it references a non-existent column

// OPTION A: Remove entirely (simpler)
// Delete lines 456-478

// OPTION B: Fix to use correct table structure
// First check if sp_v2_reconciliation_results exists and has correct schema
```

### Solution Option 2: Check correct table
```javascript
// Check if there are recon matches for this date
const bankReconCheck = await client.query(`
  SELECT COUNT(DISTINCT bs.id) as count
  FROM sp_v2_bank_statements bs
  WHERE DATE(bs.transaction_date) = $1
  AND bs.source_type = 'MANUAL_UPLOAD'
  AND bs.processed = true  // Or whatever field indicates reconciliation
`, [date]);
```

**Recommended**: Remove this check for now, add proper protection later

---

## 📋 Execution Plan (Step-by-Step)

### Step 1: Fix Status Filter ✅ DO FIRST
1. Edit `services/recon-api/jobs/runReconciliation.js` line 576
2. Remove `AND status = 'PENDING'`
3. Save file

### Step 2: Clean Duplicate Data
1. Create SQL script to delete old wrong bank data
2. Execute via EC2 or direct database access
3. Verify only 18 bank records remain

### Step 3: Test Reconciliation
1. Trigger reconciliation via API
2. Expected results:
   - pgFetched: 25
   - bankFetched: 18
   - matched: 18
   - unmatchedPg: 7
   - unmatchedBank: 0

### Step 4: Verify Settlement
1. Check settlement batch auto-created
2. Verify 18 items in batch
3. Status: PENDING_APPROVAL

### Step 5: Check Dashboard
1. GET http://52.66.199.215:5108/... endpoints
2. Verify metrics show correct data

### Step 6: Bank-Specific Overwrite (Optional - Can do later)
1. Edit `services/api/file-upload-v2.cjs`
2. Add bankName parameter
3. Update deletion query
4. Test with multiple banks

### Step 7: Fix Overwrite Safety Check (Optional - Can do later)
1. Remove or fix the broken reconciliation check
2. Add proper settlement protection

---

## 🧪 Complete E2E Test Scenario

After all fixes:

```bash
# 1. Upload PG file
curl -X POST "http://52.66.199.215:5107/api/upload/single" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@test-pg-v1-staging2-oct27.csv;type=text/csv" \
  -F "fileType=transactions" \
  -F "overwrite=true" \
  -F "date=2025-10-27"

# 2. Upload HDFC bank file
curl -X POST "http://52.66.199.215:5107/api/upload/single" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@test-hdfc-v1-staging2-oct27-FIXED.csv;type=text/csv" \
  -F "fileType=bank_statements" \
  -F "sourceType=HDFC BANK" \
  -F "overwrite=true" \
  -F "date=2025-10-27"

# 3. Run reconciliation
curl -X POST "http://52.66.199.215:5103/recon/run" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"date": "2025-10-27"}'

# 4. Expected results:
# {
#   "matched": 18,
#   "unmatchedPg": 7,
#   "unmatchedBank": 0,
#   "settlementBatchIds": ["batch-id-here"]
# }
```

---

## ✅ Success Criteria

1. ✅ Reconciliation fetches 25 PG + 18 Bank records from database
2. ✅ Matching produces 18 matches (72% match rate)
3. ✅ Settlement batch auto-created with 18 items
4. ✅ Overview Dashboard shows correct metrics
5. ✅ Can upload multiple banks (HDFC, AXIS) without data loss

---

*Ready for implementation - Fix #1 is CRITICAL and must be done first*
