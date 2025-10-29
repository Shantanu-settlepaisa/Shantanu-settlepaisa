# ✅ Testing Instructions - Recon Fix Verification

## 🎯 What Was Fixed

**Issue**: Reconciliation showed 0 matches because upload-api wasn't passing `sourceType` (bank name) to v1-mapper, causing UTR field to be NULL.

**Fix Applied**:
1. ✅ Backend: Upload API now passes `req.body.sourceType` to `processFile()`
2. ✅ Frontend: Bank name detection returns `'AXIS BANK'` (with space) instead of `'AXIS_BANK'`
3. ✅ Deployed: Backend running on staging-2 (PID 5626)

## 📁 Test Files Created

**Location**: `/Users/shantanusingh/ops-dashboard/test-files-v1-matching/`

### File Details:
1. **PG Transactions** (`pg_transactions.csv`):
   - 50 records
   - UTRs: UTR00001 through UTR00050
   - V1 Format: `transaction_id,client_code,payee_amount,paid_amount,payment_mode,trans_complete_date,status,utr,pg_name`

2. **HDFC Bank** (`hdfc_bank_statements.csv`):
   - 30 records (UTR00001 - UTR00030)
   - V1 Format: `MERCHANT_TRACKID~DOMESTIC AMT~Net Amount~SETTLE DATE~TRANS DATE`
   - Delimiter: `~` (tilde)

3. **AXIS Bank** (`axis_bank_statements.csv`):
   - 10 records (UTR00031 - UTR00040)
   - V1 Format: `Amount~PRNNo~Date`
   - Delimiter: `~` (tilde)

4. **BOB** (`bob_bank_statements.csv`):
   - 10 records (UTR00041 - UTR00050)
   - V1 Format: `Merchant Track ID~Settlement Amount~Net Amount~Payment Date~Transaction Date`
   - Delimiter: `~` (tilde)

## 🧪 Testing Steps

### Step 1: Clear Browser Cache
```
Hard refresh: Cmd+Shift+R (Mac) or Ctrl+F5 (Windows)
```

### Step 2: Navigate to Recon Workspace
```
URL: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon-workspace
```

### Step 3: Start New Reconciliation Cycle
1. Click **"Start New"** button
2. This sets cycle date to **October 29, 2025**

### Step 4: Upload PG Transactions
1. Click **"Upload PG Transactions"** (or similar button)
2. Select file: `/Users/shantanusingh/ops-dashboard/test-files-v1-matching/pg_transactions.csv`
3. Wait for upload confirmation

**Expected Browser Console Output**:
```
✅ [V2 Upload] Successfully loaded 50 transactions
```

### Step 5: Upload Bank Statements
Upload all 3 bank files:

1. **HDFC Bank**:
   - Select: `/Users/shantanusingh/ops-dashboard/test-files-v1-matching/hdfc_bank_statements.csv`
   - **Expected Console**: `🏦 [V2 Upload] Detected bank: HDFC BANK, sending as sourceType`

2. **AXIS Bank**:
   - Select: `/Users/shantanusingh/ops-dashboard/test-files-v1-matching/axis_bank_statements.csv`
   - **Expected Console**: `🏦 [V2 Upload] Detected bank: AXIS BANK, sending as sourceType`

3. **BOB**:
   - Select: `/Users/shantanusingh/ops-dashboard/test-files-v1-matching/bob_bank_statements.csv`
   - **Expected Console**: `🏦 [V2 Upload] Detected bank: BOB, sending as sourceType`

### Step 6: Verify UTR Population (Database Check)

**Option A**: Via Database Query Script
```bash
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 "cd /home/ec2-user/ops-dashboard/ops-dashboard/services/api && node -e \"
const { Pool } = require('pg');
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

pool.query(\\\`
  SELECT bank_name, COUNT(*) as total,
         COUNT(utr) as utr_populated,
         COUNT(utr) * 100.0 / COUNT(*) as utr_percentage
  FROM sp_v2_bank_statements
  WHERE DATE(transaction_date) = '2025-10-29'
  GROUP BY bank_name
  ORDER BY bank_name
\\\`).then(r => {
  console.log('Bank UTR Population:');
  console.table(r.rows);
  pool.end();
});
\""
```

**Expected Output**:
```
┌─────────┬────────────┬───────┬───────────────┬────────────────┐
│ (index) │ bank_name  │ total │ utr_populated │ utr_percentage │
├─────────┼────────────┼───────┼───────────────┼────────────────┤
│    0    │ AXIS BANK  │  10   │      10       │     100.0      │
│    1    │ BOB        │  10   │      10       │     100.0      │
│    2    │ HDFC BANK  │  30   │      30       │     100.0      │
└─────────┴────────────┴───────┴───────────────┴────────────────┘
```

### Step 7: Run Reconciliation
1. Click **"Run Reconciliation"** button
2. Wait for reconciliation to complete

### Step 8: Verify Results

**Expected Reconciliation Results**:
```
✅ Matched: 50/50 (100%)
❌ Unmatched (PG): 0
❌ Unmatched (Bank): 0
```

**Pipeline Status** should show:
- **Matched**: 50 records
- **Pending Settlement**: 50 records
- **Unmatched**: 0 records

## 🔍 Verification Checklist

- [ ] Browser cache cleared (hard refresh)
- [ ] PG file uploaded (50 records)
- [ ] HDFC file uploaded (30 records) - console shows "HDFC BANK"
- [ ] AXIS file uploaded (10 records) - console shows "AXIS BANK"
- [ ] BOB file uploaded (10 records) - console shows "BOB"
- [ ] Database shows 100% UTR population for all 3 banks
- [ ] Reconciliation shows 50/50 matches
- [ ] No unmatched records

## 🐛 Troubleshooting

### If UTR is still NULL:
1. **Check upload-api logs**:
   ```bash
   ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 "tail -100 /tmp/upload-api.log"
   ```

   **Should see**:
   ```
   🔍 [V2 Upload] V1 Type Mapping: detectedType="bank_statements" → v1Type="bank_statements", bankName="AXIS BANK"
   [V1 Mapper] Fetching DB config for bank: AXIS BANK
   [V1 Mapper] Using DB-driven mapping
   ```

2. **Check backend deployment**:
   ```bash
   ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 "grep -A 5 'req.body.sourceType' /home/ec2-user/ops-dashboard/ops-dashboard/services/api/file-upload-v2.cjs"
   ```

   **Should see**: `req.body.sourceType  // Pass bank name from frontend`

### If still 0 matches:
1. Verify UTR values in database match PG transactions
2. Check browser console for any errors during upload
3. Verify reconciliation engine is using correct matching logic (pg.utr === bank.utr)

## 📊 Sample Data for Manual Verification

**Sample PG Transaction (TXN00001)**:
- UTR: `UTR00001`
- Amount: 950.00 (payee), 975.00 (paid)

**Should match with**:
- **HDFC Bank Record**: MERCHANT_TRACKID=`UTR00001`, Amount=975.00

**Sample Reconciliation Match**:
```sql
SELECT
  t.transaction_id,
  t.utr as pg_utr,
  b.utr as bank_utr,
  t.paid_amount as pg_amount,
  b.amount_paise / 100.0 as bank_amount,
  CASE WHEN t.utr = b.utr THEN 'MATCHED ✅' ELSE 'NO MATCH ❌' END as status
FROM sp_v2_transactions t
JOIN sp_v2_bank_statements b ON t.utr = b.utr
WHERE DATE(t.transaction_date) = '2025-10-29'
LIMIT 5;
```

## ✅ Success Criteria

**Fix is confirmed successful when**:
1. ✅ All bank statements have UTR populated (not NULL)
2. ✅ Reconciliation shows 50/50 matches
3. ✅ Upload logs show "Fetching DB config for bank: [BANK NAME]"
4. ✅ Upload logs show "Using DB-driven mapping"

---

**If all checks pass**: The recon issue is FIXED! 🎉

**If any check fails**: Share the error logs and I'll help debug further.
