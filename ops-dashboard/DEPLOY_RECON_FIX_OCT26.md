# Deploy Reconciliation Status Fix - October 26, 2025

## Issue Fixed
Dashboard showing 0% match rate despite successful reconciliation because `sp_v2_transactions.status` was not being updated after reconciliation.

## Root Cause
- Reconciliation creates records in `sp_v2_reconciliation_results` ✅
- BUT never updates `sp_v2_transactions.status` ❌
- Overview API queries `sp_v2_transactions.status = 'RECONCILED'` which returns 0

## Solution Implemented
1. **Updated `runReconciliation.js`** to update transaction statuses after saving reconciliation results
2. **Created backfill script** to fix existing data

---

## Deployment Steps

### Step 1: Upload Files to EC2

```bash
# From your local machine
cd /Users/shantanusingh/ops-dashboard

# Upload the fixed recon job file
scp -i ~/.ssh/YOUR_KEY.pem \
  services/recon-api/jobs/runReconciliation.js \
  ubuntu@13.201.179.44:/home/ubuntu/ops-dashboard/services/recon-api/jobs/

# Upload the backfill script
scp -i ~/.ssh/YOUR_KEY.pem \
  backfill-reconciliation-statuses.cjs \
  ubuntu@13.201.179.44:/home/ubuntu/ops-dashboard/
```

### Step 2: Connect to EC2 and Run Backfill

```bash
# SSH into EC2
ssh -i ~/.ssh/YOUR_KEY.pem ubuntu@13.201.179.44

# Navigate to project directory
cd /home/ubuntu/ops-dashboard

# Run the backfill script
node backfill-reconciliation-statuses.cjs
```

**Expected Output:**
```
🔄 Starting backfill of sp_v2_transactions statuses...

📊 Step 1: Updating MATCHED transactions...
   ✅ Updated 78 transactions to RECONCILED

📊 Step 2: Updating UNMATCHED_PG transactions...
   ✅ Updated 4 transactions to UNMATCHED

📊 Step 3: Updating EXCEPTION transactions...
   ✅ Updated 14 transactions to EXCEPTION

✅ Backfill completed successfully!

📈 Verification - Current status distribution:
┌─────────┬────────────┬────────┬────────────┐
│ (index) │   status   │ count  │ percentage │
├─────────┼────────────┼────────┼────────────┤
│    0    │   'PENDING'│ '706'  │  '88.00'   │
│    1    │'RECONCILED'│ '78'   │  '9.70'    │
│    2    │'EXCEPTION' │ '14'   │  '1.74'    │
│    3    │'UNMATCHED' │ '4'    │  '0.50'    │
└─────────┴────────────┴────────┴────────────┘

📊 Match Rate Calculation:
   Total Transactions (last 7 days): 20
   Matched (RECONCILED): 17
   Match Rate: 85.00%

🎉 Backfill complete! Dashboard should now show correct match rates.
```

### Step 3: Restart Recon API Service

```bash
# Still on EC2
pm2 restart recon-api

# Verify it's running
pm2 status

# Check logs for errors
pm2 logs recon-api --lines 50
```

### Step 4: Test the Fix

**Open Dashboard:**
```
http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/overview
```

**Expected Results (for today's data):**
- ✅ Match Rate: **85%** (was 0.0%)
- ✅ Total Amount: **₹4.68L** (correct)
- ✅ Reconciled Amount: **₹2.14L** (was ₹0)
- ✅ Captured: **20 transactions** (correct)
- ✅ Variance: **₹2.54L** (was ₹4.68L)

**Browser Console Should Show:**
```
📡 [V2 Hooks] Calling V2 API: http://13.201.179.44:5108/api/overview?from=2025-10-26&to=2025-10-26
💰 [V2 Hooks] KPI Calculations: {
  totalTransactions: 20,
  matchedTransactions: 17,
  matchRatePct: 85,
  ...
}
```

### Step 5: Run New Reconciliation Test

To verify the fix works for future reconciliations:

```bash
# On EC2
curl -X POST 'http://localhost:5103/recon/run' \
  -H 'Content-Type: application/json' \
  -d '{
    "cycle_date": "2025-10-26",
    "merchant_id": "ALL"
  }'
```

**Check the logs for status updates:**
```
[Persistence] Saved 17 MATCHED results
[Persistence] Saved 3 UNMATCHED_PG results
[Persistence] Saved 0 EXCEPTION results
[Persistence] Updating sp_v2_transactions status based on reconciliation results...
[Persistence] Updated 17 transactions to RECONCILED
[Persistence] Updated 3 transactions to UNMATCHED
[Persistence] Updated 0 transactions to EXCEPTION
[Persistence] ✅ Transaction statuses updated successfully
[Persistence] ✅ Transaction COMMITTED successfully
```

---

## Rollback Plan (If Needed)

If something goes wrong:

```bash
# On EC2, restore original file
cd /home/ubuntu/ops-dashboard
git checkout services/recon-api/jobs/runReconciliation.js

# Restart service
pm2 restart recon-api

# Revert backfill (set all back to PENDING)
psql $DATABASE_URL <<EOF
UPDATE sp_v2_transactions
SET status = 'PENDING', updated_at = NOW()
WHERE status IN ('RECONCILED', 'UNMATCHED', 'EXCEPTION');
EOF
```

---

## What Changed in runReconciliation.js

**Location:** After line 2088 (after saving exception results, before COMMIT)

**Added Code (lines 2090-2141):**
```javascript
// NEW (Oct 26): Update sp_v2_transactions.status to sync with reconciliation results
console.log('[Persistence] Updating sp_v2_transactions status based on reconciliation results...');

// Update MATCHED transactions
if (results.matched.length > 0) {
  const matchedTxnIds = results.matched.map(m => m.pg?.transaction_id || m.pg?.pgw_ref).filter(Boolean);
  if (matchedTxnIds.length > 0) {
    const matchedUpdateResult = await client.query(`
      UPDATE sp_v2_transactions
      SET status = 'RECONCILED', updated_at = NOW()
      WHERE transaction_id = ANY($1) AND status != 'RECONCILED'
    `, [matchedTxnIds]);
    console.log(`[Persistence] Updated ${matchedUpdateResult.rowCount} transactions to RECONCILED`);
  }
}

// Update UNMATCHED_PG transactions
// ... (similar pattern)

// Update EXCEPTION transactions
// ... (similar pattern)
```

**Why This Works:**
- Updates happen in same database transaction as reconciliation results
- Uses `ANY($1)` for efficient batch updates
- Only updates if status different (avoids unnecessary writes)
- Logs the number of rows updated for debugging

---

## Verification Queries

After deployment, run these on EC2 to verify:

```bash
# Connect to database
psql postgresql://postgres:SabPaisa%402025@settlepaisa-dev-db.cvdzuahlio62.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2_dev

# Check today's reconciliation status distribution
SELECT
  status,
  COUNT(*) as count
FROM sp_v2_transactions
WHERE created_at::date = '2025-10-26'
GROUP BY status;

# Expected:
#    status    | count
# -------------+-------
#  RECONCILED  |    17
#  UNMATCHED   |     3

# Check reconciliation results match transaction statuses
SELECT
  r.match_status,
  t.status as transaction_status,
  COUNT(*) as count
FROM sp_v2_reconciliation_results r
JOIN sp_v2_transactions t ON r.pg_transaction_id = t.transaction_id
WHERE r.created_at::date = '2025-10-26'
GROUP BY r.match_status, t.status;

# Expected perfect alignment:
#  match_status  | transaction_status | count
# ---------------+--------------------+-------
#  MATCHED       | RECONCILED         |    17
#  UNMATCHED_PG  | UNMATCHED          |     3
```

---

## Success Criteria

✅ Backfill script completes without errors
✅ Dashboard shows 85% match rate (not 0%)
✅ Reconciled Amount shows ₹2.14L (not ₹0)
✅ Future reconciliations automatically update statuses
✅ PM2 logs show status update messages
✅ Database queries show status alignment

---

**Deployment Time Estimate:** 5-10 minutes
**Risk Level:** Low (only affects display, not actual reconciliation logic)
**Rollback Time:** < 2 minutes

---

**Deployed By:** _____________
**Deployment Date:** _____________
**Verification Completed:** ☐ Yes ☐ No
**Issues Encountered:** _____________
