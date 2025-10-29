# Reconciliation Fix V2 - Oct 29, 2025

## ✅ DEPLOYMENT COMPLETE

**Status**: Successfully deployed to Staging-2
**Time**: Oct 29, 2025
**Branch**: feat/ops-dashboard-exports
**Commit**: 2523609

---

## 🐛 THE REAL PROBLEM

### What We Thought Was Wrong (First Fix - INCORRECT):
- Thought the recon engine wasn't extracting UTRs from AXIS/BOB files
- Added `r.PRNNo`, `r.prnno`, `r['Merchant Track ID']` to line 981
- **This didn't work** because those column names don't exist after normalization

### What Was Actually Wrong (Root Cause):

**The V1-to-V2 Mapper was mapping UTR columns to the WRONG field!**

| Bank | CSV Column | Old Mapping (WRONG) | New Mapping (FIXED) |
|------|------------|---------------------|---------------------|
| **HDFC** | `MERCHANT_TRACKID` | → `utr` ✅ | → `utr` ✅ |
| **AXIS** | `PRNNo` | → `bank_ref` ❌ | → `utr` ✅ |
| **BOB** | `Merchant Track ID` | → `bank_ref` ❌ | → `utr` ✅ |

**Result**: AXIS and BOB UTRs were stored in the `bank_ref` field, not the `utr` field!

---

## 🔍 How Data Actually Flows

```
User uploads CSV file
    ↓
file-upload-v2.cjs parseCSV()
  • Reads: {"PRNNo": "UTR00031", "Amount": "901.00"}
    ↓
file-upload-v2.cjs convertV1CSVToV2()
  • Normalizes keys: "PRNNo" → "prnno"
  • Applies V1-to-V2 mapping: "prnno" → "bank_ref" (OLD MAPPING - WRONG!)
  • Produces: {bank_ref: "UTR00031", amount_paise: 90100, utr: null}
    ↓
Inserted into sp_v2_bank_statements
  • Stored: {utr: null, bank_ref: "UTR00031"}
    ↓
runReconciliation.js fetchBankFromDatabase()
  • Retrieves: {utr: null, bank_ref: "UTR00031"}
    ↓
runReconciliation.js normalizeBankRecords()
  • Line 981: utr = r.utr || ... → utr = null (because r.utr is null!)
    ↓
matchRecords()
  • Tries to match: pg.utr = "UTR00031" vs bank.utr = null
  • NO MATCH! ❌
```

---

## ✅ The Fix

### Fix 1: V1-to-V2 Mapper (Primary Fix)

**File**: `services/shared/v1-column-mapper.cjs`
**Lines**: 297, 301

**BEFORE**:
```javascript
// AXIS BANK
'prnno': 'bank_ref',  // ❌ WRONG

// BOB
'merchant_track_id': 'bank_ref',  // ❌ WRONG
```

**AFTER**:
```javascript
// AXIS BANK
'prnno': 'utr',  // ✅ FIXED

// BOB
'merchant_track_id': 'utr',  // ✅ FIXED
```

### Fix 2: Recon Engine Fallback (Secondary Fix)

**File**: `services/recon-api/jobs/runReconciliation.js`
**Line**: 981

**BEFORE** (from first fix attempt):
```javascript
utr: (r.UTR || r.utr || r.MERCHANT_TRACKID || r.merchant_trackid || r.PRNNo || r.prnno || r.merchant_track_id || r['Merchant Track ID'] || '').toString().trim().toUpperCase(),
```

**AFTER**:
```javascript
utr: (r.utr || r.bank_ref || '').toString().trim().toUpperCase(),
```

**Why Simplified?**:
- After upload, all data is normalized to lowercase_underscore
- Mixed-case variants (`PRNNo`, `Merchant Track ID`) never exist in database
- Now checks `r.utr` (correct field) and `r.bank_ref` (fallback for old data)

---

## 🚀 Deployment Details

### Services Restarted:
1. ✅ upload-api (PM2 ID: 1) - Now uses fixed V1-to-V2 mapper
2. ✅ recon-api (PM2 ID: 2) - Now checks bank_ref as fallback

### PM2 Status:
```
│ 1 │ upload-api │ online │ 5s │ 83.9mb │
│ 2 │ recon-api  │ online │ 5s │ 76.2mb │
```

---

## 🧪 **IMPORTANT: You Need to Re-Upload Files!**

### Why Re-Upload?

**Old data is corrupted** - AXIS and BOB files uploaded before this fix have:
- `utr: null`
- `bank_ref: "UTR00031"` (UTR stored in wrong field)

**New uploads will work correctly** - After this fix:
- `utr: "UTR00031"` ✅
- `bank_ref: null`

### Testing Instructions:

1. **Clear old data** (IMPORTANT!):
   ```bash
   # SSH to staging-2
   ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215

   # Connect to database and clear test data
   # (Get DB credentials from .env files)
   psql postgresql://... << 'SQL'
   DELETE FROM sp_v2_bank_statements WHERE source_type IN ('AXIS BANK', 'BOB', 'HDFC BANK');
   DELETE FROM sp_v2_transactions WHERE source_type = 'PG';
   DELETE FROM sp_v2_reconciliation_results WHERE job_id IN (
     SELECT id FROM sp_v2_reconciliation_jobs WHERE created_at > NOW() - INTERVAL '1 hour'
   );
   SQL
   ```

2. **Re-upload all 4 files**:
   - http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon
   - Upload: `pg_transactions.csv` (50 records)
   - Upload: `hdfc_bank_statements.csv` (30 records)
   - Upload: `axis_bank_statements.csv` (10 records)
   - Upload: `bob_bank_statements.csv` (10 records)

3. **Run Reconciliation**

4. **Expected Result**:
   - ✅ Matched: 50/50
   - ✅ Unmatched PG: 0
   - ✅ Unmatched Bank: 0
   - ✅ Exceptions: 0

---

## 📊 What Should Happen Now

### During Upload:
```javascript
// AXIS file: PRNNo=UTR00031
parseCSV() → {PRNNo: "UTR00031"}
normalize() → {prnno: "UTR00031"}
V1→V2 map() → {utr: "UTR00031"}  // ✅ NOW CORRECT!
database → utr column = "UTR00031"
```

### During Recon:
```javascript
fetchBankFromDatabase() → {utr: "UTR00031", bank_ref: null}
normalizeBankRecords() → bank.utr = "UTR00031"  // ✅ Found in r.utr!
matchRecords() → pg.utr === bank.utr → MATCHED! ✅
```

---

## 🎯 Why Previous Fix Didn't Work

### First Fix Attempt (Wrong Approach):
- Modified: `runReconciliation.js:981`
- Added: `r.PRNNo`, `r.prnno`, `r.merchant_track_id`
- **Problem**: By the time data reaches the recon engine:
  1. CSV columns are normalized: `"PRNNo"` → `"prnno"`
  2. V1→V2 mapper transforms: `"prnno"` → `"bank_ref"`
  3. Database stores: `{bank_ref: "UTR00031", utr: null}`
  4. Recon engine receives: `{bank_ref: "UTR00031", utr: null}`
  5. Line 981 checks: `r.prnno` → **doesn't exist!** (column was renamed to `bank_ref`)

### Second Fix (Correct Approach):
- Modified: `v1-column-mapper.cjs` (the root cause!)
- Changed: `'prnno': 'bank_ref'` → `'prnno': 'utr'`
- **Now**: V1→V2 mapper puts UTR in the correct field from the start
- Data flow: `PRNNo` → `prnno` → `utr` → database.utr column ✅

---

## 📝 Files Modified

1. **services/shared/v1-column-mapper.cjs**
   - Line 297: `'prnno': 'utr'` (was 'bank_ref')
   - Line 301: `'merchant_track_id': 'utr'` (was 'bank_ref')

2. **services/recon-api/jobs/runReconciliation.js**
   - Line 981: Simplified to `(r.utr || r.bank_ref || '')`

---

## ⚠️ Database Mappings (Optional)

If you have database-driven bank mappings in `sp_v2_bank_column_mappings` table, run this SQL to update them:

```sql
-- Update AXIS BANK
UPDATE sp_v2_bank_column_mappings
SET v1_column_mappings = jsonb_set(v1_column_mappings, '{prnno}', '"utr"'::jsonb)
WHERE UPPER(bank_name) = 'AXIS BANK' AND is_active = true;

-- Update BOB
UPDATE sp_v2_bank_column_mappings
SET v1_column_mappings = jsonb_set(v1_column_mappings, '{merchant_track_id}', '"utr"'::jsonb)
WHERE UPPER(bank_name) = 'BOB' AND is_active = true;
```

(The hardcoded fix will work even without this, but updating DB mappings is cleaner.)

---

## ✅ Verification Checklist

- [x] Code changes committed (2523609)
- [x] Changes pushed to GitHub
- [x] Deployed to staging-2 EC2
- [x] Upload API restarted
- [x] Recon API restarted
- [x] PM2 shows services online
- [ ] **OLD DATA CLEARED** (you need to do this!)
- [ ] **FILES RE-UPLOADED** (you need to do this!)
- [ ] **Manual testing shows 50/50 matches** (awaiting your verification!)

---

## 🎉 Expected Outcome

After re-uploading fresh files with the fixed code:

```
✅ PG: 50 transactions uploaded
✅ HDFC: 30 UTRs stored in 'utr' field
✅ AXIS: 10 UTRs stored in 'utr' field (was 'bank_ref' before!)
✅ BOB: 10 UTRs stored in 'utr' field (was 'bank_ref' before!)
✅ Recon engine: 50/50 matched!
✅ Dashboard: No unmatched transactions
✅ Console: No invariant violation errors
```

---

**Next Step**: Clear old data and re-upload all 4 CSV files to test the fix! 🚀
