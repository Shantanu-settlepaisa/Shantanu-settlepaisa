# ✅ CSV Parser Fix - Ready for Testing

## 🎯 What Was Fixed

**Root Cause**: CSV parser was using comma delimiter, but V1 bank files use tilde (~) delimiter.

**Error in Logs**:
```
[V1 Mapper] No fields mapped! Input keys: [ 'MERCHANT_TRACKID~DOMESTIC AMT~Net Amount~SETTLE DATE~TRANS DATE' ]
```
The entire header row was treated as ONE column instead of being split by tildes.

**Fix Applied**:
1. ✅ Updated `parseCSV()` function to auto-detect delimiter (comma vs tilde)
2. ✅ Deployed to staging-2 (file-upload-v2.cjs)
3. ✅ Restarted upload-api (PID 21291)
4. ✅ Fixed JWT_SECRET and PORT in services/api/.env

---

## 📁 Test Files Location

All test files are in: **`/Users/shantanusingh/ops-dashboard/test-files-v1-matching/`**

### Files to Upload:
1. **`pg_transactions.csv`** - 50 PG transactions (UTR00001-UTR00050)
2. **`hdfc_bank_statements.csv`** - 30 HDFC records (UTR00001-UTR00030, tilde delimiter)
3. **`axis_bank_statements.csv`** - 10 AXIS records (UTR00031-UTR00040, tilde delimiter)
4. **`bob_bank_statements.csv`** - 10 BOB records (UTR00041-UTR00050, tilde delimiter)

**Total Expected Matches**: 50/50 (100%)

---

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
2. Cycle date will be set to **October 29, 2025**

### Step 4: Upload PG Transactions
1. Click **"Upload PG Transactions"**
2. Select: **`/Users/shantanusingh/ops-dashboard/test-files-v1-matching/pg_transactions.csv`**
3. Wait for upload confirmation

**Expected Browser Console**:
```
✅ [V2 Upload] Successfully loaded 50 transactions
```

### Step 5: Upload Bank Statements (All 3 Files)

#### 5a. HDFC Bank
- Select: **`hdfc_bank_statements.csv`**
- **Expected Console**: `🏦 [V2 Upload] Detected bank: HDFC BANK, sending as sourceType`

#### 5b. AXIS Bank
- Select: **`axis_bank_statements.csv`**
- **Expected Console**: `🏦 [V2 Upload] Detected bank: AXIS BANK, sending as sourceType`

#### 5c. BOB
- Select: **`bob_bank_statements.csv`**
- **Expected Console**: `🏦 [V2 Upload] Detected bank: BOB, sending as sourceType`

---

## 🔍 Verification Steps

### Verify 1: Check Upload Logs on Server

```bash
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 "tail -100 /tmp/upload-api.log | grep -E '(CSV Parser|Detected delimiter|Fetching DB config|Using DB-driven)'"
```

**Expected Output**:
```
[CSV Parser] Detected delimiter: "~" in file: /tmp/upload-xxxxxx/hdfc_bank_statements.csv
[CSV Parser] Parsed 30 rows with delimiter "~"
[V1 Mapper] Fetching DB config for bank: HDFC BANK
[V1 Mapper] Using DB-driven mapping
```

### Verify 2: Check Database Records

Run this from your local machine:
```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

pool.query(\`
  SELECT
    (SELECT COUNT(*) FROM sp_v2_transactions WHERE DATE(transaction_date) = '2025-10-29') as pg_count,
    (SELECT COUNT(*) FROM sp_v2_bank_statements WHERE DATE(transaction_date) = '2025-10-29') as bank_count,
    (SELECT COUNT(*) FROM sp_v2_bank_statements WHERE DATE(transaction_date) = '2025-10-29' AND utr IS NOT NULL) as utr_populated
\`).then(r => {
  console.table(r.rows);
  pool.end();
});
"
```

**Expected Output**:
```
┌─────────┬──────────┬────────────┬────────────────┐
│ (index) │ pg_count │ bank_count │ utr_populated  │
├─────────┼──────────┼────────────┼────────────────┤
│    0    │    50    │     50     │      50        │
└─────────┴──────────┴────────────┴────────────────┘
```

### Verify 3: Check UTR Population by Bank

```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

pool.query(\`
  SELECT
    bank_name,
    COUNT(*) as total,
    COUNT(utr) as utr_populated,
    ROUND(COUNT(utr) * 100.0 / COUNT(*), 2) as utr_percentage
  FROM sp_v2_bank_statements
  WHERE DATE(transaction_date) = '2025-10-29'
  GROUP BY bank_name
  ORDER BY bank_name
\`).then(r => {
  console.table(r.rows);
  pool.end();
});
"
```

**Expected Output**:
```
┌─────────┬────────────┬───────┬───────────────┬────────────────┐
│ (index) │ bank_name  │ total │ utr_populated │ utr_percentage │
├─────────┼────────────┼───────┼───────────────┼────────────────┤
│    0    │ AXIS BANK  │  10   │      10       │    100.00      │
│    1    │ BOB        │  10   │      10       │    100.00      │
│    2    │ HDFC BANK  │  30   │      30       │    100.00      │
└─────────┴────────────┴───────┴───────────────┴────────────────┘
```

### Step 6: Run Reconciliation
1. Click **"Run Reconciliation"** button
2. Wait for reconciliation to complete

### Step 7: Verify Reconciliation Results

**Expected Results**:
```
✅ Matched: 50/50 (100%)
❌ Unmatched (PG): 0
❌ Unmatched (Bank): 0
```

**Dashboard Should Show**:
- **Matched**: 50 records
- **Pending Settlement**: 50 records
- **Unmatched**: 0 records

---

## ✅ Success Criteria

The fix is confirmed successful when:

1. ✅ Upload logs show **`[CSV Parser] Detected delimiter: "~"`** for all bank files
2. ✅ Upload logs show **`[V1 Mapper] Fetching DB config for bank: [BANK NAME]`**
3. ✅ Database has **50 PG + 50 Bank records** for Oct 29
4. ✅ All 50 bank statements have **UTR NOT NULL**
5. ✅ Reconciliation shows **50/50 matches (100%)**

---

## 🐛 Troubleshooting

### If UTR is still NULL:

1. **Check upload-api logs**:
   ```bash
   ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 "tail -100 /tmp/upload-api.log"
   ```

2. **Look for**:
   - `[CSV Parser] Detected delimiter: "~"` ← Should see this
   - `[V1 Mapper] No fields mapped!` ← Should NOT see this

### If still 0 matches:

1. Verify UTR values match between PG and Bank:
   ```bash
   node -e "
   const { Pool } = require('pg');
   const pool = new Pool({
     host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
     port: 5432,
     database: 'settlepaisa_v2',
     user: 'postgres',
     password: 'SettlePaisa2024'
   });

   pool.query(\`
     SELECT t.utr as pg_utr, b.utr as bank_utr, b.bank_name
     FROM sp_v2_transactions t
     FULL OUTER JOIN sp_v2_bank_statements b ON t.utr = b.utr
     WHERE DATE(COALESCE(t.transaction_date, b.transaction_date)) = '2025-10-29'
     LIMIT 10
   \`).then(r => {
     console.table(r.rows);
     pool.end();
   });
   "
   ```

2. Check browser console for errors during reconciliation

### If upload fails:

1. Verify JWT token is valid (check if logged in)
2. Check if upload-api is running: `ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215 "ps aux | grep file-upload-v2"`
3. Check upload-api port is correct (5107)

---

## 📊 Sample Verification Query

To manually verify a few matches:

```sql
SELECT
  t.transaction_id,
  t.utr as pg_utr,
  b.utr as bank_utr,
  b.bank_name,
  t.paid_amount as pg_amount,
  b.amount_paise / 100.0 as bank_amount,
  CASE WHEN t.utr = b.utr THEN '✅ MATCHED' ELSE '❌ NO MATCH' END as status
FROM sp_v2_transactions t
JOIN sp_v2_bank_statements b ON t.utr = b.utr
WHERE DATE(t.transaction_date) = '2025-10-29'
LIMIT 10;
```

---

## 🎉 If All Checks Pass

**The CSV parser fix is WORKING!**

The reconciliation should now show:
- ✅ 50/50 matches (100% success rate)
- ✅ All UTRs populated correctly
- ✅ Tilde-delimited V1 bank files parsed correctly

---

## 🔧 Deployment Details

**Staging-2 Server**: `ec2-user@52.66.199.215`
**Upload API Process**: PID 21291
**Upload API Port**: 5107
**Upload API Logs**: `/tmp/upload-api.log`
**Environment File**: `/home/ec2-user/ops-dashboard/ops-dashboard/services/api/.env`

**Deployment Time**: October 29, 2025 (3:52 AM UTC)

**Files Modified**:
- `services/api/file-upload-v2.cjs` - Added CSV delimiter auto-detection
- `services/api/.env` - Fixed JWT_SECRET and PORT

---

## 📝 Next Steps After Testing

If testing is successful:
1. ✅ Document the CSV parser fix in CLAUDE.md
2. ✅ Commit and push the changes to git
3. ✅ Update TESTING_INSTRUCTIONS_OCT29.md with the final results
4. ✅ Create PR for the CSV parser fix

If testing fails:
1. Share the error logs from browser console
2. Share upload-api logs from server
3. Share database query results
4. I'll help debug further
