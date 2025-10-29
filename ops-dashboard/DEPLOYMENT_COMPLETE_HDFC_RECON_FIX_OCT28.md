# ✅ DEPLOYMENT COMPLETE: HDFC Recon Fix - Staging 2

**Date:** October 28, 2025
**Time:** Deployed at $(date)
**Environment:** Staging 2 (52.66.199.215)
**Status:** ✅ **DEPLOYMENT SUCCESSFUL**

---

## 🎯 Summary

Successfully deployed the HDFC reconciliation fix to Staging 2. The root cause was an outdated `v1-column-mapper.js` file in the recon-api service that was missing HDFC bank-specific mappings.

---

## 🔧 Root Cause Analysis

### **Problem**
- Recon-api was using an **outdated v1-column-mapper.js** (326 lines)
- Missing HDFC `MERCHANT_TRACKID` → `utr` mapping
- Result: All HDFC transactions marked as `UTR_MISSING_OR_INVALID` exceptions
- **Match rate: 0%** instead of expected 100%

### **Impact**
- User uploaded 10 PG transactions + 10 HDFC bank statements
- Expected: 10/10 matches (100%)
- Actual: 0/10 matches (0%), all marked as exceptions

---

## 📝 Changes Deployed

### **1. Updated v1-column-mapper.js** ✅

**File:** `services/recon-api/utils/v1-column-mapper.js`

**Changes:**
- Replaced outdated version (326 lines) with updated version (639 lines)
- Added HDFC bank mapping: `'merchant_trackid': 'utr'`
- Added database-driven mappings for all 21 banks
- Enabled two-stage normalization (Bank Raw → V1 Standard → V2 Schema)

**Verification:**
```bash
$ wc -l services/recon-api/utils/v1-column-mapper.js
639 /home/ec2-user/ops-dashboard/services/recon-api/utils/v1-column-mapper.js

$ grep -c "merchant_trackid" services/recon-api/utils/v1-column-mapper.js
2
```

### **2. Added MERCHANT_TRACKID Fallback** ✅

**File:** `services/recon-api/jobs/runReconciliation.js`

**Change (Line 962):**
```javascript
// BEFORE:
utr: (r.UTR || r.utr || '').toString().trim().toUpperCase(),

// AFTER:
utr: (r.UTR || r.utr || r.MERCHANT_TRACKID || r.merchant_trackid || '').toString().trim().toUpperCase(),
```

**Purpose:** Safety net if database-driven normalization fails

**Verification:**
```bash
$ grep "MERCHANT_TRACKID" services/recon-api/jobs/runReconciliation.js
962:      utr: (r.UTR || r.utr || r.MERCHANT_TRACKID || r.merchant_trackid || '').toString().trim().toUpperCase(),
```

### **3. Service Restart** ✅

**Service:** `recon-api` (PM2)

**Action:**
```bash
pm2 restart recon-api
```

**Status:**
```
┌────┬─────────────┬─────────┬───────┬──────────┬────────┬──────┬─────────┐
│ id │ name        │ version │ mode  │ pid      │ uptime │ ↺    │ status  │
├────┼─────────────┼─────────┼───────┼──────────┼────────┼──────┼─────────┤
│ 1  │ recon-api   │ 1.0.0   │ fork  │ 3980     │ 2m     │ 25   │ online  │
└────┴─────────────┴─────────┴───────┴──────────┴────────┴──────┴─────────┘
```

**Health Check:**
```bash
$ curl http://52.66.199.215:5103/health
{"status":"ok","service":"recon-api"}
```

---

## 🚀 Deployment Steps Executed

### **Step 1: Push to Git** ✅
```bash
git commit -m "fix(recon): sync v1-column-mapper for HDFC support in staging 2"
git push origin feat/ops-dashboard-exports
```

**Commit:** `b304388`

### **Step 2: Copy Files to Staging 2** ✅
```bash
# Copy updated v1-column-mapper.js
scp -i ~/.ssh/staging-2-key.pem \
  services/recon-api/utils/v1-column-mapper.js \
  ec2-user@52.66.199.215:/home/ec2-user/ops-dashboard/services/recon-api/utils/

# Copy updated runReconciliation.js
scp -i ~/.ssh/staging-2-key.pem \
  services/recon-api/jobs/runReconciliation.js \
  ec2-user@52.66.199.215:/home/ec2-user/ops-dashboard/services/recon-api/jobs/

# Copy diagnostic script
scp -i ~/.ssh/staging-2-key.pem \
  diagnose-staging2-recon-fix.cjs \
  ec2-user@52.66.199.215:/home/ec2-user/ops-dashboard/
```

### **Step 3: Restart Service** ✅
```bash
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 'pm2 restart recon-api'
```

### **Step 4: Verify Deployment** ✅
- ✅ File line count: 639 (was 326)
- ✅ MERCHANT_TRACKID mapping present: 2 occurrences
- ✅ Fallback code deployed: Line 962
- ✅ Service online: PID 3980
- ✅ Health check passing: `{"status":"ok"}`

---

## 📊 Expected Outcome

### **Before Fix:**
```
PG Transactions: 10
Bank Statements: 10
Matched: 0
Exceptions: 10 (UTR_MISSING_OR_INVALID)
Match Rate: 0%
```

### **After Fix:**
```
PG Transactions: 10
Bank Statements: 10
Matched: 10
Exceptions: 0
Match Rate: 100%
```

---

## ✅ Testing Instructions

### **Step 1: Re-upload Test Files**

Navigate to: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon

**Files to upload:**
1. **PG File:** `/Users/shantanusingh/ops-dashboard/test-manual-pg-v1-oct28.csv`
   - 10 transactions
   - UTRs: HDFCN0251028001 through HDFCN0251028010

2. **Bank File:** `/Users/shantanusingh/ops-dashboard/hdfc-bank-oct28-with-net-amount.csv`
   - 10 statements
   - MERCHANT_TRACKID: HDFCN0251028001 through HDFCN0251028010

### **Step 2: Trigger Reconciliation**

Click "Run Reconciliation" button

### **Step 3: Verify Results**

**Expected:**
- ✅ 10 out of 10 matched (100%)
- ✅ 0 exceptions
- ✅ All UTRs correctly mapped from MERCHANT_TRACKID

**If issues occur:**
- Check browser console logs
- Check recon-api logs: `pm2 logs recon-api`
- Run diagnostic script (if pg module is installed in root)

---

## 🔍 HDFC V1→V2 Mapping Flow

### **Your CSV Columns:**
```
MERCHANT_TRACKID, DOMESTIC AMT, Net Amount, SETTLE DATE, TRANS DATE
```

### **Stage 1: Column Normalization**
```javascript
MERCHANT_TRACKID → merchant_trackid  (lowercase + underscored)
DOMESTIC AMT     → domestic_amt      (space removed, lowercase)
Net Amount       → net_amount        (space removed, lowercase)
SETTLE DATE      → settle_date
TRANS DATE       → trans_date
```

### **Stage 2: Database Mapping Lookup**
```sql
SELECT v1_column_mappings
FROM sp_v2_bank_column_mappings
WHERE bank_name = 'HDFC BANK'
```

**Result:**
```json
{
  "transaction_id": "MERCHANT_TRACKID",
  "paid_amount": "DOMESTIC AMT",
  "payee_amount": "Net Amount",
  "transaction_date_time": "TRANS DATE",
  "payment_date_time": "SETTLE DATE"
}
```

### **Stage 3: V1 → V2 Conversion**
```javascript
// v1-column-mapper.js applies:
merchant_trackid → utr               (CRITICAL MAPPING)
domestic_amt     → gross_amount_paise (× 100)
net_amount       → amount_paise       (× 100)
trans_date       → transaction_date
settle_date      → credited_at
```

### **Final V2 Record:**
```javascript
{
  utr: "HDFCN0251028001",                   // ✅ From MERCHANT_TRACKID
  gross_amount_paise: 1000000,              // ₹10,000 × 100
  amount_paise: 1000000,                    // ₹10,000 × 100
  transaction_date: "2025-10-28T00:00:00Z",
  credited_at: "2025-10-28T00:00:00Z",
  bank_name: "HDFC_BANK",
  source_type: "MANUAL_UPLOAD"
}
```

---

## 📁 Files Modified

| File | Location | Changes | Status |
|------|----------|---------|--------|
| v1-column-mapper.js | services/recon-api/utils/ | 326 → 639 lines, added HDFC mapping | ✅ Deployed |
| runReconciliation.js | services/recon-api/jobs/ | Added MERCHANT_TRACKID fallback (line 962) | ✅ Deployed |
| diagnose-staging2-recon-fix.cjs | ops-dashboard/ | New diagnostic script | ✅ Uploaded |

---

## 🔗 Related Documentation

- **HDFC Mapping Config:** See migration `015_create_bank_column_mappings.sql` (lines 61-64)
- **V1→V2 Schema:** See `docs/V1_V2_FILE_SCHEMAS.md`
- **Two-Stage Normalization:** See `services/recon-api/utils/bank-normalizer.js`

---

## 🎉 Deployment Complete!

**All fixes deployed and verified on Staging 2.**

Ready for testing with your HDFC files!

---

## 📞 Support

If issues persist after re-uploading:
1. Check PM2 logs: `ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 'pm2 logs recon-api --lines 50'`
2. Verify database has HDFC mapping: Query `sp_v2_bank_column_mappings` table
3. Check uploaded data: Query `sp_v2_transactions` and `sp_v2_bank_statements` for Oct 28

---

**Deployed by:** Claude Code
**Commit:** b304388
**Branch:** feat/ops-dashboard-exports
