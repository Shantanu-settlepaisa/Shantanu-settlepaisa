# UTR Mapping Fix Complete - October 29, 2025

## 🎯 Problem Summary

**Symptom**: After uploading 50 PG + 50 Bank CSV files, reconciliation showed **0 matches** despite:
- RDS database having correct `sp_v2_bank_column_mappings` with UTR field mappings
- User updating upload-api to connect to RDS
- Multiple cache clears and service restarts

**Root Cause**: Upload API endpoint `/api/upload/multiple` was NOT passing the `sourceType` parameter (bank name) to the `processFile()` function, causing the v1-mapper to skip database mapping lookup and use hardcoded fallback without UTR field.

## 🔍 Investigation Process

### 1. Initial Hypothesis: Stale Cache
- **Evidence**: Upload logs showed "[V1 Mapper] Using hardcoded mapping (fallback)"
- **Fix Attempted**: Restarted upload-api to clear in-memory `bankMappingCache`
- **Result**: Still 0 matches ❌

### 2. Log Analysis
Cleared logs and asked user to upload single AXIS bank file. Logs revealed:

```
🔍 [V2 Upload] V1 Type Mapping: detectedType="bank_statements" → v1Type="bank_statements", bankName="N/A"
```

**Key Finding**: `bankName="N/A"` meant `sourceType` was UNDEFINED!

### 3. Code Review
**services/api/file-upload-v2.cjs:116**
```javascript
// BUG: Missing sourceType parameter
const result = await processFile(file, req.body.fileType || 'auto-detect');
```

**Expected**:
```javascript
const result = await processFile(
  file,
  req.body.fileType || 'auto-detect',
  req.body.sourceType  // ← THIS WAS MISSING!
);
```

### 4. Secondary Issue: Bank Name Mismatch
Frontend was returning `'AXIS_BANK'` (with underscore), but database has `'AXIS BANK'` (with space).

**Fix**: Updated `detectBankFromFilename()` to return bank names with SPACE to match database format.

## ✅ Fixes Applied

### Fix 1: Backend - Pass sourceType Parameter

**File**: `services/api/file-upload-v2.cjs`
**Line**: 116

```diff
  for (const file of req.files) {
    try {
-     const result = await processFile(file, req.body.fileType || 'auto-detect');
+     // CRITICAL FIX: Pass sourceType (bank name) to processFile for DB-driven mapping
+     const result = await processFile(
+       file,
+       req.body.fileType || 'auto-detect',
+       req.body.sourceType  // Pass bank name from frontend
+     );
      results.push({
```

### Fix 2: Frontend - Bank Name Format

**File**: `src/components/ManualUploadEnhanced.tsx`
**Lines**: 44-58

```diff
+ // Map bank names to patterns - keys use SPACE to match database format
+ // Database has "AXIS BANK", "HDFC BANK", etc. (not "AXIS_BANK")
  const patterns: Record<string, string[]> = {
-   'HDFC_BANK': ['HDFC BANK', 'HDFC_BANK', 'HDFCBANK', 'HDFC'],
-   'AXIS_BANK': ['AXIS BANK', 'AXIS_BANK', 'AXISBANK', 'AXIS'],
-   'SBI_BANK': ['SBI BANK', 'SBI_BANK', 'SBIBANK', 'SBI'],
+   'HDFC BANK': ['HDFC BANK', 'HDFC_BANK', 'HDFCBANK', 'HDFC'],
+   'AXIS BANK': ['AXIS BANK', 'AXIS_BANK', 'AXISBANK', 'AXIS'],
+   'SBI BANK': ['SBI BANK', 'SBI_BANK', 'SBIBANK', 'SBI'],
    ...
  };
```

## 📦 Deployment

### Frontend
```bash
npm run build
# Deployed to: s3://settlepaisa-ops-staging-2/
```

### Backend
```bash
# Deployed files:
- services/api/file-upload-v2.cjs (with sourceType fix)
- services/shared/v1-column-mapper.cjs (missing file)

# Restarted upload-api:
PID: 3437 (running on port 5107)
```

## 🧪 Testing Instructions

### 1. Clear Previous Test Data
```bash
# Run on staging-2 RDS:
DELETE FROM sp_v2_bank_statements WHERE DATE(transaction_date) = '2025-10-29';
DELETE FROM sp_v2_transactions WHERE DATE(transaction_date) = '2025-10-29';
DELETE FROM sp_v2_recon_matches WHERE DATE(created_at) = '2025-10-29';
```

### 2. Upload Test Files
1. Go to Recon Workspace: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon-workspace
2. Click **"Start New"** (this will set cycle date to Oct 29, 2025)
3. Upload files:
   - **PG Transactions**: `test-pg-v1-proper-2025-10-24.csv` (50 records)
   - **Bank Statements**:
     - `test-hdfc-v1-proper-2025-10-24.csv`
     - `test-axis-v1-proper-2025-10-24.csv`
     - `test-bob-v1-proper-2025-10-24.csv`

### 3. Verify UTR Population

**Check Database**:
```sql
-- Bank statements should have UTR populated (not NULL)
SELECT bank_name, COUNT(*) as total,
       COUNT(utr) as utr_populated,
       COUNT(utr) * 100.0 / COUNT(*) as utr_percentage
FROM sp_v2_bank_statements
WHERE DATE(transaction_date) = '2025-10-29'
GROUP BY bank_name;
```

**Expected Result**:
```
  bank_name  | total | utr_populated | utr_percentage
-------------+-------+---------------+---------------
 HDFC BANK   |    30 |            30 |          100.0
 AXIS BANK   |    10 |            10 |          100.0
 BOB         |    10 |            10 |          100.0
```

### 4. Run Reconciliation
Click **"Run Reconciliation"** button and verify:
- **Expected**: 50 matches (all PG transactions should match with bank statements via UTR)
- **Pipeline Status**:
  - Unmatched (Bank): 0
  - Unmatched (PG): 0
  - Matched: 50

### 5. Check Upload Logs
```bash
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 "tail -100 /tmp/upload-api.log"
```

**Expected Log Messages**:
```
🏦 [V2 Upload] Detected bank: AXIS BANK, sending as sourceType
🔍 [V2 Upload] V1 Type Mapping: detectedType="bank_statements" → v1Type="bank_statements", bankName="AXIS BANK"
[V1 Mapper] Fetching DB config for bank: AXIS BANK
[V1 Mapper] Using DB-driven mapping
```

## 🔑 Key Technical Details

### Database Mappings (RDS)
**Table**: `sp_v2_bank_column_mappings`

```sql
SELECT bank_name, v1_column_mappings->'utr' as utr_mapping
FROM sp_v2_bank_column_mappings
WHERE bank_name IN ('HDFC BANK', 'AXIS BANK', 'BOB');
```

**Result**:
```
  bank_name  | utr_mapping
-------------+-------------
 HDFC BANK   | "PRNNo"
 AXIS BANK   | "PRNNo"
 BOB         | "PRNNo"
```

### Upload Flow (Now Fixed)
1. Frontend detects bank from filename → returns `"AXIS BANK"` (with space)
2. Frontend sends `sourceType: "AXIS BANK"` in FormData
3. **Backend receives** `req.body.sourceType = "AXIS BANK"`
4. **Backend calls** `processFile(file, "bank_statements", "AXIS BANK")` ✅ (was missing before)
5. v1-mapper queries DB: `WHERE UPPER(bank_name) = UPPER('AXIS BANK')`
6. v1-mapper uses mapping: `{"utr": "PRNNo", ...}`
7. CSV row `{"PRNNo": "TESTAXIS001"}` → DB row `{utr: "TESTAXIS001"}` ✅

## 📊 Expected Reconciliation Result

**Before Fix**:
- Bank UTR: NULL (used hardcoded mapping)
- PG UTR: "TESTAXIS001"
- **Match**: ❌ (NULL ≠ "TESTAXIS001")
- **Reconciliation Matches**: 0/50

**After Fix**:
- Bank UTR: "TESTAXIS001" (from DB mapping via PRNNo column)
- PG UTR: "TESTAXIS001"
- **Match**: ✅ (both have same UTR)
- **Reconciliation Matches**: 50/50

## 🚀 Ready for Testing

All fixes deployed to **staging-2**:
- ✅ Frontend: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
- ✅ Upload API: Running on port 5107 (PID 3437)
- ✅ Database: RDS with correct mappings

**Next Step**: User should upload test files and verify 50/50 reconciliation matches.
