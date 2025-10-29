# Testing Instructions: Upload API Database Fix (Oct 29, 2025)

## 🎯 What Was Fixed

**Root Cause**: Upload API was inserting data into local PostgreSQL instead of RDS database. This meant:
- V1-V2 mapper ran correctly ✅
- Data inserted successfully ✅
- But reconciliation couldn't find the data ❌ (looking in RDS, data in localhost)

**Solution**: Added hardcoded RDS database config fallback for staging environment (PORT=5107).

**Commit**: `a58a322`

---

## 📋 Pre-Deployment Checklist

### Step 1: Deploy the Fix

```bash
./deploy-upload-api-db-fix.sh
```

**CRITICAL: Verify the log shows**:
```
[Upload API] Database config: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2
```

**NOT**:
```
[Upload API] Database config: localhost:5432/settlepaisa_v2  ❌
```

If you see `localhost`, the fix didn't work. Check PM2 logs:
```bash
ssh ec2-user@52.66.199.215 "pm2 logs upload-api --lines 50 --nostream"
```

---

## 🧪 Testing Steps

### Step 2: Clear Old Test Data

**Run this script to delete all Oct 29 test data**:
```bash
node clear-and-verify-oct29-data.cjs
```

**Expected Output**:
```
✅ Deleted 50 recon results
✅ Deleted 50 recon matches
✅ Deleted 1 recon job
✅ Deleted 50 PG transactions
✅ Deleted 50 bank statements

AFTER DELETION:
PG Transactions (Oct 29): 0 records
Bank Statements (Oct 29): 0 records
Recon Jobs (Oct 29+): 0 jobs
```

---

### Step 3: Re-Upload CSV Files

**Navigate to Recon Workspace**:
http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon

**Upload these 4 files** (in this order):

1. **PG Transactions**: `/Users/shantanusingh/ops-dashboard/test-files-comma-delimiter/pg_transactions.csv`
   - 50 transactions (TXN00001-TXN00050)
   - Date: 2025-10-29
   - UTRs: UTR00001-UTR00050

2. **HDFC Bank**: `/Users/shantanusingh/ops-dashboard/test-files-comma-delimiter/hdfc_bank_statements.csv`
   - 30 statements (UTR00001-UTR00030)
   - Date: 2025-10-29

3. **AXIS Bank**: `/Users/shantanusingh/ops-dashboard/test-files-comma-delimiter/axis_bank_statements.csv`
   - 10 statements (UTR00031-UTR00040)
   - Date: 2025-10-29

4. **BOB**: `/Users/shantanusingh/ops-dashboard/test-files-comma-delimiter/bob_bank_statements.csv`
   - 10 statements (UTR00041-UTR00050)
   - Date: 2025-10-29

**Click "Upload All" button**

---

### Step 4: Verify Data in Database

**Run this verification script**:
```bash
node verify-upload-to-rds.cjs
```

**Expected Output**:
```
PG Transactions: 50 records
  Sample UTRs: UTR00001, UTR00002, UTR00003
  All with utr field populated ✅

Bank Statements: 50 records
  HDFC BANK: 30 records with UTRs
  AXIS BANK: 10 records with UTRs
  BOB: 10 records with UTRs
  All with utr field populated ✅
```

---

### Step 5: Run Reconciliation

**On Recon Workspace**:
1. Select date: **October 29, 2025**
2. Click "Run Reconciliation"
3. Wait for completion

**Expected Result**:
```
✅ Matched: 50/50
   - HDFC: 30 matches (UTR00001-UTR00030)
   - AXIS: 10 matches (UTR00031-UTR00040)
   - BOB: 10 matches (UTR00041-UTR00050)

✅ Unmatched PG: 0
✅ Unmatched Bank: 0
✅ Exceptions: 0
```

---

## 🐛 Troubleshooting

### Issue 1: Still Seeing Amount Mismatches

**Symptom**: All 50 showing as exceptions with amount differences

**Root Cause**: Reconciliation comparing wrong amount fields (gross vs net)

**Check**:
```bash
node check-amount-fields.cjs
```

**Expected**:
- PG: `amount_paise=95000`, `gross_amount_paise=97500`
- Bank: `amount_paise=95000`, `gross_amount_paise=97500`

**If gross_amount_paise is NULL**: V1-V2 mapper not setting gross amounts correctly.

---

### Issue 2: Upload API Still Using localhost

**Symptom**: Verification script shows 0 records in RDS after upload

**Check PM2 Logs**:
```bash
ssh ec2-user@52.66.199.215 "pm2 logs upload-api --lines 100 --nostream | grep 'Database config'"
```

**Should see**:
```
[Upload API] Database config: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2
```

**If still localhost**:
1. Check PORT environment variable: `pm2 env 9 | grep PORT`
2. The fix checks `if (PORT === 5107 && config.db.host === 'localhost')`
3. If PORT is not 5107, the override won't trigger

**Fix**: Update ecosystem.config.upload-api.js to explicitly set PORT=5107.

---

### Issue 3: UTRs Not Matching

**Symptom**: Unmatched PG or Unmatched Bank > 0

**Check Database**:
```bash
node check-utr-fields-in-db.cjs
```

**Expected**:
- PG: All 50 records have `utr` field populated
- Bank: All 50 records have `utr` field populated
- No records with `bank_ref` instead of `utr`

**If UTRs in `bank_ref`**: V1-V2 mapper issue. Check:
- `services/shared/v1-column-mapper.cjs` lines 297, 301
- Should be `'prnno': 'utr'` and `'merchant_track_id': 'utr'`

---

## ✅ Success Criteria

1. ✅ Upload API logs show RDS hostname (not localhost)
2. ✅ All 50 PG + 50 Bank records inserted into RDS
3. ✅ All UTRs stored in `utr` field (not `bank_ref`)
4. ✅ All gross amounts stored in `gross_amount_paise`
5. ✅ Reconciliation shows **50/50 matches**
6. ✅ No exceptions, no unmatched records

---

## 📊 Summary of All Fixes Applied

| Fix # | Commit | What It Fixed | File |
|-------|--------|--------------|------|
| 1 | 2523609 | AXIS/BOB UTR mapping (`prnno` → `utr`, `merchant_track_id` → `utr`) | v1-column-mapper.cjs:297,301 |
| 2 | 9803491 | Allow T+1 dates in reconciliation validation | runReconciliation.js:285-290 |
| 3 | 1ca3c1c | Database-first fetch (use V1-V2 mapped data from DB) | runReconciliation.js:319-356 |
| 4 | **a58a322** | **Force RDS database for staging (PORT=5107)** | **file-upload-v2.cjs:37-69** |

---

## 🚀 Next Steps After Successful Test

Once you see **50/50 matches**:

1. **Verify Settlement Flow**: Check that matched transactions flow to settlement
2. **Test Dashboard**: Verify Overview dashboard shows correct counts
3. **Test Reports**: Generate settlement reports
4. **Production Readiness**: Document this fix for production deployment

---

**Expected test duration**: 5-10 minutes

**Point of contact**: Claude Code session (this conversation)

**Emergency rollback**: `git revert a58a322` if upload API breaks
