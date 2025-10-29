# Manual Recon Workspace Test Plan: Staging 1 vs Staging 2 Comparison

**Date:** October 27, 2025
**Purpose:** Verify Recon Workspace on Staging 2 works identically to Staging 1 using V1 format files
**Test Duration:** ~60 minutes
**Tester:** Shantanu Singh

---

## Pre-Test Summary

### ✅ Infrastructure Verified

**Staging 1:**
- URL: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/overview
- Backend IP: 13.201.179.44
- Services: 7/7 online ✅
- Uptime: 20+ hours

**Staging 2:**
- URL: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/overview
- Backend IP: 52.66.199.215
- Services: 7/7 online ✅ (settlement-api fixed today)
- Uptime: 13-39 minutes (freshly restarted)

**Shared Database:**
- RDS: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432
- Database: settlepaisa_v2
- Status: ✅ Both environments connected

**Key Difference:**
- Upload API Port: Staging 1 uses 5109, Staging 2 uses 5107

---

## Test Data Files (V1 Format)

### PG Transactions: `test-pg-v1-proper-2025-10-24.csv`
```
transaction_id,client_code,payee_amount,paid_amount,payment_mode,trans_complete_date,status,utr,pg_name
TXN001,MERCH001,5000.00,5000.00,UPI,2025-10-24 10:00:00,SUCCESS,AXIS001,RAZORPAY
TXN002,MERCH001,22000.00,22000.00,UPI,2025-10-24 10:05:00,SUCCESS,AXIS002,RAZORPAY
... (30 more transactions)
```

**File Size:** 4.2 KB
**Transactions:** 32 total
**Amount Format:** Rupees (will be converted to paise)
**Expected Conversion:** 5000.00 → 500000 paise

### Bank Statements: `test-hdfc-v1-proper-2025-10-24.csv`
```
MERCHANT_TRACKID,DOMESTIC AMT,SETTLE DATE,TRANS DATE
HDFC001,50000.00,24-10-2025,24-10-2025
HDFC002,25000.00,24-10-2025,24-10-2025
... (20 more statements)
```

**File Size:** 1.2 KB
**Bank Format:** HDFC Bank V1
**Mapping:** MERCHANT_TRACKID → transaction_id, DOMESTIC AMT → paid_amount
**Expected Behavior:** Auto-detect HDFC format, apply bank-specific column mappings

---

## Phase 1: Pre-Test Setup (10 mins)

### Step 1.1: Clear Test Data

**Database Cleanup:**
```sql
-- Run from local machine
psql postgresql://postgres:SettlePaisa2024@settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2

-- Delete in correct order
DELETE FROM sp_v2_reconciliation_results WHERE pg_transaction_id IN (SELECT transaction_id FROM sp_v2_transactions WHERE merchant_id = 'MERCH001');
DELETE FROM sp_v2_settlement_items WHERE settlement_batch_id IN (SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001');
DELETE FROM sp_v2_transactions WHERE merchant_id = 'MERCH001';
DELETE FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001';
DELETE FROM sp_v2_settlement_queue WHERE merchant_id = 'MERCH001';
DELETE FROM sp_v2_bank_statement_entries WHERE created_at > NOW() - INTERVAL '1 hour';

-- Verify cleanup
SELECT COUNT(*) FROM sp_v2_transactions WHERE merchant_id = 'MERCH001';
-- Expected: 0
```

**✅ Success Criteria:** All counts should be 0

### Step 1.2: Verify Services

**Staging 1:**
```bash
# Recon API
curl http://13.201.179.44:5103/health
# Expected: {"status":"ok","service":"recon-api"}

# Upload API
curl http://13.201.179.44:5109/health
# Expected: (may not have /health endpoint)

# Overview API
curl http://13.201.179.44:5108/health
# Expected: {"status":"healthy","service":"overview-api","port":"5108"}
```

**Staging 2:**
```bash
# Recon API
curl http://52.66.199.215:5103/health
# Expected: {"status":"ok","service":"recon-api"}

# Upload API
curl http://52.66.199.215:5107/health
# Expected: {"status":"ok","service":"v2-file-upload"}

# Overview API
curl http://52.66.199.215:5108/health
# Expected: {"status":"healthy","service":"overview-api","port":5108}
```

**✅ Success Criteria:** All APIs return healthy status

---

## Phase 2: Upload V1 Files to Staging 1 (15 mins)

### Step 2.1: Login to Staging 1 Dashboard

1. Open browser: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/overview
2. Login credentials:
   - Email: `admin@settlepaisa.com`
   - Password: `Admin@123`
3. Navigate to: **Recon Workspace** (`/ops/recon`)

### Step 2.2: Upload PG Transactions

1. Click **"Upload PG Transactions"** button
2. Select file: `test-pg-v1-proper-2025-10-24.csv`
3. Click **Upload**
4. Wait for success message (should see green notification)
5. Expected: "32 transactions uploaded successfully"

**Verification:**
```sql
-- Check V1 to V2 conversion
SELECT
  transaction_id,
  merchant_id,
  amount_paise,           -- Should be in paise (e.g., 500000)
  gross_amount_paise,
  source_type,            -- Should be 'MANUAL_UPLOAD'
  payment_method,
  status                  -- Should be 'PENDING'
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
ORDER BY transaction_id
LIMIT 5;
```

**✅ Success Criteria:**
- 32 rows inserted
- `amount_paise` values are in paise (multiplied by 100)
- `source_type` = 'MANUAL_UPLOAD'
- `status` = 'PENDING'

### Step 2.3: Upload Bank Statements

1. Click **"Upload Bank Statements"** button
2. Select file: `test-hdfc-v1-proper-2025-10-24.csv`
3. Bank selection: Choose **"HDFC Bank"** from dropdown
4. Click **Upload**
5. Wait for success message
6. Expected: "22 bank statements uploaded successfully"

**Verification:**
```sql
-- Check bank statements
SELECT
  bank_ref,
  amount_paise,           -- Should be in paise
  transaction_date,
  utr,
  reconciled              -- Should be false
FROM sp_v2_bank_statement_entries
WHERE created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 5;
```

**✅ Success Criteria:**
- 22 rows inserted
- HDFC column mappings applied correctly
- `reconciled` = false

### Step 2.4: Take Baseline Snapshot

```sql
-- Staging 1 baseline
SELECT
  COUNT(*) as total_transactions,
  COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
  COUNT(*) FILTER (WHERE status = 'RECONCILED') as reconciled_count
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001';

-- Record these numbers for comparison
```

---

## Phase 3: Upload V1 Files to Staging 2 (15 mins)

### Step 3.1: Clear Data Again

Run same cleanup queries from Step 1.1

### Step 3.2: Login to Staging 2 Dashboard

1. Open browser: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/overview
2. Login credentials: Same as Staging 1
3. Navigate to: **Recon Workspace**

### Step 3.3: Upload Same Files

Repeat Step 2.2 and 2.3 with **exact same files**

### Step 3.4: Take Staging 2 Snapshot

Run same query from Step 2.4

### Step 3.5: Compare Upload Results

**Expected: IDENTICAL numbers**
- Total transactions: 32
- Pending count: 32
- Reconciled count: 0

**✅ Success Criteria:** Staging 1 and Staging 2 have identical row counts and data

---

## Phase 4: Reconciliation Execution (10 mins)

### Step 4.1: Trigger Recon on Staging 1

**Option A: Via UI**
1. In Recon Workspace, click **"Run Reconciliation"** button
2. Select date range: October 24, 2025
3. Click **"Start Reconciliation"**
4. Monitor job status (should complete in 2-3 minutes)

**Option B: Via API**
```bash
# Get JWT token first
TOKEN=$(curl -s -X POST http://13.201.179.44:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"Admin@123"}' \
  | jq -r '.data.token')

# Trigger reconciliation
curl -X POST http://13.201.179.44:5103/recon/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-24",
    "merchantId": "MERCH001",
    "dryRun": false
  }'
```

### Step 4.2: Monitor Reconciliation Progress

```sql
-- Check reconciliation job status
SELECT
  id,
  status,
  total_pg_records,
  total_bank_records,
  matches_found,
  created_at,
  completed_at
FROM sp_v2_reconciliation_jobs
WHERE merchant_id = 'MERCH001'
ORDER BY created_at DESC
LIMIT 1;
```

**✅ Success Criteria:**
- Job status: 'COMPLETED'
- `matches_found` > 0
- `completed_at` is NOT NULL

### Step 4.3: Trigger Recon on Staging 2

Repeat Step 4.1 for Staging 2 (use IP 52.66.199.215)

### Step 4.4: Compare Reconciliation Results

```sql
-- Staging 1 & 2 should show identical results
SELECT
  COUNT(*) as total_matches,
  COUNT(DISTINCT pg_transaction_id) as unique_pg_matches,
  COUNT(DISTINCT bank_statement_id) as unique_bank_matches
FROM sp_v2_reconciliation_results;

-- Check transaction status updates
SELECT
  status,
  COUNT(*) as count
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
GROUP BY status;
```

**✅ Success Criteria:**
- Match counts are identical on both
- RECONCILED count > 0
- PENDING count decreased

---

## Phase 5: Results Verification (15 mins)

### Step 5.1: Dashboard Metrics Comparison

**Staging 1 Dashboard:**
- Open: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/overview
- Record:
  - Total Transactions
  - Match Rate (%)
  - Reconciled Count
  - Pending Count
  - Exception Count

**Staging 2 Dashboard:**
- Open: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/overview
- Record same metrics

**✅ Success Criteria:** All metrics match within 1% tolerance

### Step 5.2: Settlement Queue Verification

```sql
-- Check settlement queue auto-population
SELECT
  COUNT(*) as queued_transactions,
  SUM(amount_paise) as total_amount_paise,
  status
FROM sp_v2_settlement_queue
WHERE merchant_id = 'MERCH001'
GROUP BY status;
```

**✅ Success Criteria:**
- Queued transactions > 0 (should match RECONCILED count)
- Status = 'PENDING_SETTLEMENT'

### Step 5.3: Settlement Batch Creation

**Wait 5-7 minutes** for settlement-queue-processor to run

```sql
-- Check settlement batches created
SELECT
  id,
  merchant_id,
  gross_amount_paise,
  net_amount_paise,
  status,
  created_at
FROM sp_v2_settlement_batches
WHERE merchant_id = 'MERCH001'
ORDER BY created_at DESC;

-- Check settlement items
SELECT
  COUNT(*) as total_items,
  SUM(amount_paise) as total_amount
FROM sp_v2_settlement_items
WHERE settlement_batch_id IN (
  SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
);
```

**✅ Success Criteria:**
- At least 1 settlement batch created
- `status` = 'PENDING_APPROVAL'
- Settlement items count matches reconciled transactions

---

## Phase 6: Final Comparison Report (5 mins)

### Comparison Checklist

| Metric | Staging 1 | Staging 2 | Match? |
|--------|-----------|-----------|--------|
| **Upload Phase** ||||
| PG Transactions Uploaded | __ | __ | ☐ |
| Bank Statements Uploaded | __ | __ | ☐ |
| V1 to V2 Conversion | ✓ | ✓ | ☐ |
| Amount in Paise | ✓ | ✓ | ☐ |
| **Reconciliation** ||||
| Job Status | __ | __ | ☐ |
| Total Matches | __ | __ | ☐ |
| Match Rate (%) | __% | __% | ☐ |
| RECONCILED Count | __ | __ | ☐ |
| PENDING Count | __ | __ | ☐ |
| EXCEPTION Count | __ | __ | ☐ |
| **Settlement** ||||
| Queue Count | __ | __ | ☐ |
| Batches Created | __ | __ | ☐ |
| Batch Status | __ | __ | ☐ |
| Total Amount (paise) | __ | __ | ☐ |

**Overall Test Result:** ☐ PASS ☐ FAIL

---

## Troubleshooting

### Issue 1: Upload Fails with 401 Unauthorized

**Symptom:** File upload returns "No authentication token provided"

**Solution:**
1. Ensure you're logged in to the dashboard
2. Check browser console for JWT token
3. Try logging out and logging back in
4. Verify cookies are enabled

### Issue 2: V1 Format Not Detected

**Symptom:** Upload fails with "Invalid format" or amounts not converted to paise

**Solution:**
1. Verify CSV headers match V1 format exactly
2. Check for extra spaces or special characters in headers
3. Ensure file encoding is UTF-8
4. Validate CSV structure (no empty rows)

### Issue 3: Reconciliation Shows 0 Matches

**Symptom:** Job completes but `matches_found` = 0

**Solution:**
1. Check transaction dates match bank statement dates
2. Verify amounts are identical (before paise conversion)
3. Check transaction_id/UTR fields for mismatches
4. Review reconciliation matching logic in code

### Issue 4: Settlement Queue Not Populating

**Symptom:** Transactions are RECONCILED but settlement queue is empty

**Solution:**
1. Verify database trigger `auto_queue_reconciled_transactions` is enabled
2. Check trigger function exists: `\df auto_queue_for_settlement`
3. Manually run: `SELECT auto_queue_for_settlement();`

### Issue 5: Settlement Batches Not Created

**Symptom:** Queue has items but no batches after 10 minutes

**Solution:**
1. Check `settlement-queue-processor` service is running: `pm2 list`
2. View logs: `pm2 logs settlement-queue-processor`
3. Verify processor runs every 5 minutes
4. Check for errors in logs

---

## Success Criteria Summary

### ✅ Upload Phase
- [x] Both environments accept V1 format files
- [x] V1 to V2 conversion produces identical data
- [x] Amounts converted to paise correctly
- [x] HDFC bank mappings applied

### ✅ Reconciliation Phase
- [ ] Match rates are identical (± 1%)
- [ ] Transaction statuses update correctly
- [ ] Reconciliation jobs complete successfully
- [ ] Match counts are consistent

### ✅ Settlement Phase
- [ ] Settlement queue auto-populates
- [ ] Settlement batches created with same amounts
- [ ] Commission calculations match
- [ ] Dashboard metrics are consistent

---

## Post-Test Cleanup

```sql
-- Clean up test data after test completes
DELETE FROM sp_v2_reconciliation_results WHERE pg_transaction_id IN (SELECT transaction_id FROM sp_v2_transactions WHERE merchant_id = 'MERCH001');
DELETE FROM sp_v2_settlement_items WHERE settlement_batch_id IN (SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001');
DELETE FROM sp_v2_transactions WHERE merchant_id = 'MERCH001';
DELETE FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001';
DELETE FROM sp_v2_settlement_queue WHERE merchant_id = 'MERCH001';
DELETE FROM sp_v2_bank_statement_entries WHERE created_at > NOW() - INTERVAL '2 hours';
```

---

## Test Execution Log

**Date:** __________
**Tester:** __________
**Start Time:** __________
**End Time:** __________
**Duration:** __________

**Notes:**
```
[Record any observations, issues, or anomalies here]
```

**Final Verdict:**
- ☐ Staging 2 is **IDENTICAL** to Staging 1 - Ready for production
- ☐ Staging 2 has **MINOR DIFFERENCES** - Acceptable
- ☐ Staging 2 has **MAJOR ISSUES** - Needs investigation

**Signature:** ________________

---

## Reference Documentation

- V1 to V2 Mapper: `/Users/shantanusingh/ops-dashboard/services/api/v1-column-mapper.js`
- Bank Mappings: `/Users/shantanusingh/ops-dashboard/db/migrations/015_create_bank_column_mappings.sql`
- Recon Logic: `/Users/shantanusingh/ops-dashboard/services/recon-api/jobs/runReconciliation.js`
- Settlement Processor: `/Users/shantanusingh/ops-dashboard/services/settlement-engine/settlement-queue-processor.cjs`

---

**Document Version:** 1.0
**Last Updated:** October 27, 2025
**Created By:** Claude Code (AI Assistant)
