# Manual Recon to Settlement - Complete Test Plan

**Goal:** Upload CSV files → Reconcile → Track settlement flow end-to-end  
**Environment:** AWS Staging  
**Date:** October 7, 2025

---

## Overview of Complete Flow

```
Step 1: Upload PG Transactions CSV
    ↓
Step 2: Upload Bank Statement CSV
    ↓
Step 3: Run Reconciliation
    ↓
Step 4: Check sp_v2_transactions (status: RECONCILED)
    ↓
Step 5: Trigger #1 fires automatically
    ↓
Step 6: Check sp_v2_settlement_queue (auto-queued)
    ↓
Step 7: Wait 5 minutes (batch window)
    ↓
Step 8: Settlement processor runs
    ↓
Step 9: Check sp_v2_settlement_batches (batch created)
    ↓
Step 10: Check sp_v2_settlement_items (transaction details)
    ↓
Step 11: Check sp_v2_merchant_reserve_ledger (reserve hold)
    ↓
Step 12: Check sp_v2_commission_audit (commission logged)
    ↓
Step 13: Transaction status: SETTLED
```

---

## Step-by-Step Test Plan

### STEP 1: Prepare Test Data Files

**Create 2 CSV files with matching transactions**

#### File 1: PG Transactions (pg_transactions.csv)
```csv
transaction_id,merchant_id,amount_paise,transaction_date,payment_mode,bank_code,status
PG_TEST_001,MERCH001,50000,2025-10-07,UPI,HDFC,SUCCESS
PG_TEST_002,MERCH001,75000,2025-10-07,Net Banking,ICICI,SUCCESS
PG_TEST_003,MERCH001,100000,2025-10-07,UPI,SBI,SUCCESS
```

#### File 2: Bank Statement (bank_statement.csv)
```csv
transaction_date,credit_amount_paise,debit_amount_paise,description,utr,bank_reference
2025-10-07,50000,0,Payment received,UTR001,REF001
2025-10-07,75000,0,Payment received,UTR002,REF002
2025-10-07,100000,0,Payment received,UTR003,REF003
```

**💡 Key Points:**
- Amounts must match exactly
- Use today's date (2025-10-07)
- Merchant: MERCH001 (exists in staging)
- Total: ₹2,250 (₹500 + ₹750 + ₹1,000)

---

### STEP 2: Access Staging Recon Workspace

**URL:** `http://13.201.179.44:5174/ops/recon-workspace`  
or  
**If accessing via domain:** `http://staging.settlepaisa.com/ops/recon-workspace`

**What you'll see:**
- Manual Upload section with 2 file upload areas
- "Upload PG Transactions" button
- "Upload Bank Statement" button
- Reconciliation status dashboard

---

### STEP 3: Upload PG Transactions File

**Actions:**
1. Click "Upload PG Transactions" or drag-drop area
2. Select `pg_transactions.csv`
3. Wait for upload confirmation
4. Note the upload timestamp

**What happens in database:**
```sql
-- 3 new rows inserted into sp_v2_transactions
INSERT INTO sp_v2_transactions (
  transaction_id = 'PG_TEST_001',
  merchant_id = 'MERCH001',
  amount_paise = 50000,
  status = 'PENDING',
  source_type = 'MANUAL_UPLOAD'
)
```

**Verify immediately:**
```sql
SELECT 
  transaction_id,
  merchant_id,
  amount_paise,
  status,
  source_type,
  created_at
FROM sp_v2_transactions 
WHERE transaction_id LIKE 'PG_TEST_%'
ORDER BY created_at DESC;
```

**Expected Result:**
```
transaction_id | merchant_id | amount_paise | status  | source_type   | created_at
---------------|-------------|--------------|---------|---------------|---------------------------
PG_TEST_001    | MERCH001    | 50000        | PENDING | MANUAL_UPLOAD | 2025-10-07 14:00:00
PG_TEST_002    | MERCH001    | 75000        | PENDING | MANUAL_UPLOAD | 2025-10-07 14:00:01
PG_TEST_003    | MERCH001    | 100000       | PENDING | MANUAL_UPLOAD | 2025-10-07 14:00:02
```

---

### STEP 4: Upload Bank Statement File

**Actions:**
1. Click "Upload Bank Statement" or drag-drop area
2. Select `bank_statement.csv`
3. Wait for upload confirmation
4. Note the upload timestamp

**What happens in database:**
```sql
-- 3 new rows inserted into sp_v2_bank_statement_entries
INSERT INTO sp_v2_bank_statement_entries (
  statement_date = '2025-10-07',
  credit_amount_paise = 50000,
  utr = 'UTR001',
  reconciled = false
)
```

**Verify immediately:**
```sql
SELECT 
  id,
  statement_date,
  credit_amount_paise/100.0 AS amount_rupees,
  utr,
  bank_reference,
  reconciled,
  imported_at
FROM sp_v2_bank_statement_entries 
WHERE statement_date = '2025-10-07'
ORDER BY imported_at DESC
LIMIT 10;
```

**Expected Result:**
```
id | statement_date | amount_rupees | utr    | bank_reference | reconciled | imported_at
---|----------------|---------------|--------|----------------|------------|---------------------------
1  | 2025-10-07     | 500.00        | UTR001 | REF001         | false      | 2025-10-07 14:01:00
2  | 2025-10-07     | 750.00        | UTR002 | REF002         | false      | 2025-10-07 14:01:01
3  | 2025-10-07     | 1000.00       | UTR003 | REF003         | false      | 2025-10-07 14:01:02
```

---

### STEP 5: Run Reconciliation

**Actions:**
1. Click "Run Reconciliation" button
2. Select date range: 2025-10-07 to 2025-10-07
3. Select merchant: MERCH001 (or "All")
4. Click "Start Reconciliation"
5. Watch the progress bar

**What happens:**
- Recon API compares PG transactions with Bank statements
- Matches by amount and date
- Updates transaction status to RECONCILED

**Check reconciliation results:**
```sql
SELECT 
  transaction_id,
  merchant_id,
  amount_paise/100.0 AS amount_rupees,
  status,
  reconciled_at,
  reconciliation_method
FROM sp_v2_transactions 
WHERE transaction_id LIKE 'PG_TEST_%'
ORDER BY transaction_id;
```

**Expected Result (after recon):**
```
transaction_id | merchant_id | amount_rupees | status     | reconciled_at       | reconciliation_method
---------------|-------------|---------------|------------|---------------------|----------------------
PG_TEST_001    | MERCH001    | 500.00        | RECONCILED | 2025-10-07 14:02:00 | AMOUNT_DATE_MATCH
PG_TEST_002    | MERCH001    | 750.00        | RECONCILED | 2025-10-07 14:02:01 | AMOUNT_DATE_MATCH
PG_TEST_003    | MERCH001    | 1000.00       | RECONCILED | 2025-10-07 14:02:02 | AMOUNT_DATE_MATCH
```

---

### STEP 6: Verify Auto-Queueing (Trigger #1)

**⚡ This happens AUTOMATICALLY when status → RECONCILED**

**Check queue immediately:**
```sql
SELECT 
  id,
  transaction_id,
  merchant_id,
  amount_paise/100.0 AS amount_rupees,
  status,
  queued_at,
  processed_at
FROM sp_v2_settlement_queue 
WHERE transaction_id LIKE 'PG_TEST_%'
ORDER BY queued_at DESC;
```

**Expected Result:**
```
id | transaction_id | merchant_id | amount_rupees | status  | queued_at           | processed_at
---|----------------|-------------|---------------|---------|---------------------|-------------
10 | PG_TEST_001    | MERCH001    | 500.00        | PENDING | 2025-10-07 14:02:00 | (null)
11 | PG_TEST_002    | MERCH001    | 750.00        | PENDING | 2025-10-07 14:02:01 | (null)
12 | PG_TEST_003    | MERCH001    | 1000.00       | PENDING | 2025-10-07 14:02:02 | (null)
```

**✅ SUCCESS INDICATOR:** If you see entries in settlement_queue with status PENDING, Trigger #1 is working!

---

### STEP 7: Monitor Settlement Processor

**Check processor logs:**
```bash
ssh -i /tmp/settlepaisa-backend-key.pem ec2-user@13.201.179.44 "pm2 logs 11 --lines 30 --nostream"
```

**What to look for:**
```
[Settlement Queue] New transaction queued: PG_TEST_001
[Settlement Queue] Found 1 merchant batches ready for processing
[Settlement Queue] Processing batch for merchant MERCH001 (3 transactions, ₹2250.00)
```

**Timeline:**
- **Immediately:** Transactions queued
- **2 minutes later:** Processor polls and detects batch
- **5 minutes after last transaction:** Batch window closes, processing starts
- **Total wait:** ~5-7 minutes

**💡 Tip:** You can force immediate processing by manually triggering:
```sql
NOTIFY settlement_queue;
```

---

### STEP 8: Verify Settlement Batch Created

**After ~5-7 minutes, check:**
```sql
SELECT 
  id,
  merchant_id,
  merchant_name,
  total_transactions,
  gross_amount_paise/100.0 AS gross_rupees,
  total_commission_paise/100.0 AS commission_rupees,
  total_gst_paise/100.0 AS gst_rupees,
  total_reserve_paise/100.0 AS reserve_rupees,
  net_amount_paise/100.0 AS net_rupees,
  status,
  created_at
FROM sp_v2_settlement_batches 
WHERE merchant_id = 'MERCH001'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
```
id          | merchant_id | merchant_name   | total_transactions | gross_rupees | commission_rupees | gst_rupees | reserve_rupees | net_rupees | status   | created_at
------------|-------------|-----------------|-------------------|--------------|-------------------|------------|----------------|------------|----------|---------------------------
<UUID>      | MERCH001    | Test Merchant 1 | 3                 | 2250.00      | 45.00             | 8.10       | 87.88          | 2109.02    | APPROVED | 2025-10-07 14:07:00
```

**Calculation Breakdown:**
```
Gross:              ₹2,250.00
Commission (2%):    -₹45.00
GST (18%):          -₹8.10
Reserve (4%):       -₹87.88
────────────────────────────
Net Settlement:     ₹2,109.02
```

---

### STEP 9: Verify Settlement Items

**Check individual transaction details:**
```sql
SELECT 
  si.transaction_id,
  si.amount_paise/100.0 AS amount_rupees,
  si.commission_paise/100.0 AS commission_rupees,
  si.gst_paise/100.0 AS gst_rupees,
  si.reserve_paise/100.0 AS reserve_rupees,
  si.net_paise/100.0 AS net_rupees,
  si.payment_mode,
  si.created_at
FROM sp_v2_settlement_items si
JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
WHERE sb.merchant_id = 'MERCH001'
  AND si.transaction_id LIKE 'PG_TEST_%'
ORDER BY si.transaction_id;
```

**Expected Result:**
```
transaction_id | amount_rupees | commission_rupees | gst_rupees | reserve_rupees | net_rupees | payment_mode | created_at
---------------|---------------|-------------------|------------|----------------|------------|--------------|---------------------------
PG_TEST_001    | 500.00        | 0.00              | 0.00       | 0.00           | 500.00     | UPI          | 2025-10-07 14:07:00
PG_TEST_002    | 750.00        | 0.00              | 0.00       | 0.00           | 750.00     | Net Banking  | 2025-10-07 14:07:01
PG_TEST_003    | 1000.00       | 0.00              | 0.00       | 0.00           | 1000.00    | UPI          | 2025-10-07 14:07:02
```

**Note:** Individual items show 0 commission because batch-level aggregation is used.

---

### STEP 10: Verify Reserve Ledger Entry

**Check reserve hold:**
```sql
SELECT 
  merchant_id,
  transaction_type,
  amount_paise/100.0 AS amount_rupees,
  balance_paise/100.0 AS balance_rupees,
  reference_type,
  reference_id,
  description,
  created_at
FROM sp_v2_merchant_reserve_ledger 
WHERE merchant_id = 'MERCH001'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
```
merchant_id | transaction_type | amount_rupees | balance_rupees | reference_type   | reference_id | description                       | created_at
------------|------------------|---------------|----------------|------------------|--------------|-----------------------------------|---------------------------
MERCH001    | HOLD             | 87.88         | 185.52         | SETTLEMENT_BATCH | <UUID>       | Reserve held for settlement batch | 2025-10-07 14:07:00
```

**Note:** Balance increases by ₹87.88 (previous balance + new reserve)

---

### STEP 11: Verify Commission Audit Entry

**Check commission tracking:**
```sql
SELECT 
  batch_id,
  merchant_id,
  commission_tier,
  commission_rate,
  volume_30_days_paise/100.0 AS volume_30_days_rupees,
  calculation_date,
  metadata,
  created_at
FROM sp_v2_commission_audit 
WHERE merchant_id = 'MERCH001'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
```
batch_id | merchant_id | commission_tier | commission_rate | volume_30_days_rupees | calculation_date | metadata                              | created_at
---------|-------------|-----------------|-----------------|----------------------|------------------|---------------------------------------|---------------------------
<UUID>   | MERCH001    | TIER_DEFAULT    | 0.0200          | 0.00                 | 2025-10-07       | {"transaction_count":3,"gross"...}    | 2025-10-07 14:07:00
```

---

### STEP 12: Verify Transaction Status Updated

**Check original transactions:**
```sql
SELECT 
  transaction_id,
  status,
  settlement_batch_id,
  settled_at,
  created_at
FROM sp_v2_transactions 
WHERE transaction_id LIKE 'PG_TEST_%'
ORDER BY transaction_id;
```

**Expected Result:**
```
transaction_id | status  | settlement_batch_id | settled_at          | created_at
---------------|---------|---------------------|---------------------|---------------------------
PG_TEST_001    | SETTLED | <UUID>              | 2025-10-07 14:07:00 | 2025-10-07 14:00:00
PG_TEST_002    | SETTLED | <UUID>              | 2025-10-07 14:07:01 | 2025-10-07 14:00:01
PG_TEST_003    | SETTLED | <UUID>              | 2025-10-07 14:07:02 | 2025-10-07 14:00:02
```

**✅ SUCCESS:** Status changed from PENDING → RECONCILED → SETTLED

---

### STEP 13: Verify Queue Processed

**Check queue final status:**
```sql
SELECT 
  transaction_id,
  status,
  queued_at,
  processed_at,
  EXTRACT(EPOCH FROM (processed_at - queued_at))/60 AS processing_time_minutes,
  error_message
FROM sp_v2_settlement_queue 
WHERE transaction_id LIKE 'PG_TEST_%'
ORDER BY transaction_id;
```

**Expected Result:**
```
transaction_id | status    | queued_at           | processed_at        | processing_time_minutes | error_message
---------------|-----------|---------------------|---------------------|------------------------|---------------
PG_TEST_001    | PROCESSED | 2025-10-07 14:02:00 | 2025-10-07 14:07:00 | 5.0                    | (null)
PG_TEST_002    | PROCESSED | 2025-10-07 14:02:01 | 2025-10-07 14:07:01 | 5.0                    | (null)
PG_TEST_003    | PROCESSED | 2025-10-07 14:02:02 | 2025-10-07 14:07:02 | 5.0                    | (null)
```

---

## Complete Verification Checklist

### ✅ Before Starting
- [ ] Staging recon workspace accessible
- [ ] Database credentials ready
- [ ] SSH access to staging server
- [ ] PM2 process 11 running

### ✅ After File Upload
- [ ] 3 rows in `sp_v2_transactions` with status PENDING
- [ ] 3 rows in `sp_v2_bank_statement_entries` with reconciled = false

### ✅ After Reconciliation
- [ ] Transaction status changed to RECONCILED
- [ ] reconciled_at timestamp populated
- [ ] Bank statements marked as reconciled = true

### ✅ After Trigger #1 (Auto-Queue)
- [ ] 3 rows in `sp_v2_settlement_queue` with status PENDING
- [ ] queued_at timestamp matches reconciled_at

### ✅ After Settlement Processing
- [ ] 1 row in `sp_v2_settlement_batches` with status APPROVED
- [ ] 3 rows in `sp_v2_settlement_items` linked to batch
- [ ] 1 row in `sp_v2_merchant_reserve_ledger` with HOLD
- [ ] 1 row in `sp_v2_commission_audit`
- [ ] Transaction status changed to SETTLED
- [ ] Queue status changed to PROCESSED

---

## Quick Database Access Commands

### Connect to Database
```bash
ssh -i /tmp/settlepaisa-backend-key.pem ec2-user@13.201.179.44

PGPASSWORD='SettlePaisa2024' psql \
  -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2
```

### Quick Check All Tables
```sql
-- Check transactions
SELECT COUNT(*), status FROM sp_v2_transactions WHERE transaction_id LIKE 'PG_TEST_%' GROUP BY status;

-- Check queue
SELECT COUNT(*), status FROM sp_v2_settlement_queue WHERE transaction_id LIKE 'PG_TEST_%' GROUP BY status;

-- Check batches
SELECT COUNT(*) FROM sp_v2_settlement_batches WHERE created_at > NOW() - INTERVAL '1 hour';

-- Check items
SELECT COUNT(*) FROM sp_v2_settlement_items WHERE transaction_id LIKE 'PG_TEST_%';

-- Check reserve
SELECT COUNT(*) FROM sp_v2_merchant_reserve_ledger WHERE created_at > NOW() - INTERVAL '1 hour';

-- Check audit
SELECT COUNT(*) FROM sp_v2_commission_audit WHERE created_at > NOW() - INTERVAL '1 hour';
```

---

## Troubleshooting

### Issue 1: Transactions Not Auto-Queued
**Symptom:** No entries in settlement_queue after reconciliation

**Check:**
```sql
-- Verify trigger exists
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%transaction_status%';

-- Check if status actually changed to RECONCILED
SELECT transaction_id, status FROM sp_v2_transactions WHERE transaction_id LIKE 'PG_TEST_%';
```

**Fix:** Re-run migration 024 if trigger is missing

---

### Issue 2: Settlement Not Processing
**Symptom:** Queue entries stuck in PENDING status for > 10 minutes

**Check:**
```bash
# Check if processor is running
ssh -i /tmp/settlepaisa-backend-key.pem ec2-user@13.201.179.44 "pm2 status | grep settlement"

# Check processor logs
ssh -i /tmp/settlepaisa-backend-key.pem ec2-user@13.201.179.44 "pm2 logs 11 --lines 50 --nostream"
```

**Fix:** Restart processor
```bash
ssh -i /tmp/settlepaisa-backend-key.pem ec2-user@13.201.179.44 "pm2 restart 11"
```

---

### Issue 3: Manual Force Processing
**If you don't want to wait 5 minutes:**

```sql
-- Option 1: Send notification
NOTIFY settlement_queue;

-- Option 2: Update queue entry to force priority
UPDATE sp_v2_settlement_queue 
SET priority = 'HIGH', updated_at = NOW() 
WHERE transaction_id LIKE 'PG_TEST_%';
```

---

## Expected Timeline

```
00:00 - Upload PG file
00:30 - Upload Bank file
01:00 - Run reconciliation
01:30 - Transactions marked RECONCILED
01:31 - Auto-queued (Trigger #1 fires)
03:00 - Processor polls (every 2 min)
06:30 - Batch window closes (5 min after last txn)
07:00 - Settlement processed
07:01 - All tables updated
```

**Total Time:** ~7 minutes from upload to settlement

---

## Success Criteria

### ✅ Complete Success
- All 3 transactions reconciled
- All 3 auto-queued
- Settlement batch created with correct amounts
- Reserve ledger updated
- Commission audit logged
- Transaction status: SETTLED
- Queue status: PROCESSED
- No errors in any table

### ⚠️ Partial Success
- Some transactions reconciled but not all
- Queue entries created but stuck in PENDING
- Settlement batch created but amounts wrong

### ❌ Failure
- Transactions not reconciled
- No queue entries created
- Processor errors in logs
- Database constraint violations

---

## Next Steps After Test

1. **If successful:** Document with screenshots
2. **If failed:** Check error logs and troubleshoot
3. **Production deployment:** Repeat same test in production
4. **Scale test:** Upload 100+ transactions to test batch processing

---

**Created:** October 7, 2025  
**Last Updated:** October 7, 2025  
**Test Environment:** AWS Staging  
**Status:** Ready for execution
