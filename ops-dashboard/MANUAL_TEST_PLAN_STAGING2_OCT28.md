# Manual E2E Test Plan - STAGING 2 Environment

**Date:** October 28, 2025
**Environment:** Staging 2
**EC2:** 52.66.199.215
**Frontend:** http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
**Test Type:** Complete flow validation (Upload → Recon → Settlement → Dashboard)
**Merchant:** MERCH001
**Test Files:** V1 Format (PG + HDFC Bank)

---

## 🌐 Staging 2 Environment Details

### Backend APIs (EC2: 52.66.199.215)
```
Upload API:      http://52.66.199.215:5107
Recon API:       http://52.66.199.215:5103
Overview API:    http://52.66.199.215:5108
Settlement API:  http://52.66.199.215:5109
```

### Frontend (S3 Static Hosting)
```
Main Dashboard:   http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
Financial:        http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/financial
Recon Workspace:  http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon-workspace
Reports:          http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/reports
```

### Database (RDS)
```
Host: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
Port: 5432
Database: settlepaisa_v2
```

---

## 📋 Test Files (Already Created Locally)

### 1. PG Transactions File
**File:** `test-manual-pg-v1-oct28.csv`
**Location:** `/Users/shantanusingh/ops-dashboard/test-manual-pg-v1-oct28.csv`
**Transactions:** 10
**Total Amount:** ₹2,20,000

### 2. HDFC Bank Statements File
**File:** `test-manual-hdfc-bank-v1-oct28.csv`
**Location:** `/Users/shantanusingh/ops-dashboard/test-manual-hdfc-bank-v1-oct28.csv`
**Records:** 10
**Total Amount:** ₹2,20,000

---

## 📤 STEP 1: Upload Files to Staging 2

### Option A: Upload via API (Recommended)

#### 1. Upload PG Transactions
```bash
cd /Users/shantanusingh/ops-dashboard

curl -X POST http://52.66.199.215:5107/api/upload \
  -F "file=@test-manual-pg-v1-oct28.csv" \
  -F "type=pg" \
  -F "merchant_id=MERCH001" \
  -F "date=2025-10-28"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "PG transactions uploaded successfully",
  "recordsInserted": 10,
  "merchant_id": "MERCH001",
  "date": "2025-10-28"
}
```

#### 2. Upload Bank Statements
```bash
curl -X POST http://52.66.199.215:5107/api/upload \
  -F "file=@test-manual-hdfc-bank-v1-oct28.csv" \
  -F "type=bank" \
  -F "merchant_id=MERCH001" \
  -F "date=2025-10-28" \
  -F "bank=HDFC BANK"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Bank statements uploaded successfully",
  "recordsInserted": 10,
  "merchant_id": "MERCH001",
  "date": "2025-10-28",
  "bank": "HDFC BANK"
}
```

### Option B: Upload via Frontend (S3 Hosted)

1. Navigate to: **http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon-workspace**
2. Click **"Upload Files"** button
3. Select PG file: `test-manual-pg-v1-oct28.csv`
4. Select Bank file: `test-manual-hdfc-bank-v1-oct28.csv`
5. Select Merchant: MERCH001
6. Select Date: 2025-10-28
7. Click **"Upload & Process"**

---

## ✅ STEP 2: Verify Upload on Staging 2

### Option A: Via SSH to EC2
```bash
# SSH to Staging 2
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215

# Connect to RDS database
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U your_username \
     -d settlepaisa_v2

# Run verification query
SELECT
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE source_type = 'PG') as pg_count,
  COUNT(*) FILTER (WHERE source_type = 'BANK') as bank_count,
  SUM(amount_paise) / 100.0 as total_amount,
  status
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
  AND DATE(transaction_date) = '2025-10-28'
GROUP BY status;
```

**Expected Result:**
```
total_count | pg_count | bank_count | total_amount | status
------------|----------|------------|--------------|--------
     10     |    10    |     0      |  220000.00   | PENDING
```

### Option B: Check Logs on EC2
```bash
# SSH to Staging 2
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215

# Check upload API logs
pm2 logs upload-api --lines 20

# Should see:
# "Uploaded 10 PG transactions for MERCH001"
# "Uploaded 10 bank statements for MERCH001"
```

---

## 🔄 STEP 3: Run Reconciliation on Staging 2

### API Call (From Your Local Machine)
```bash
curl -X POST http://52.66.199.215:5103/recon/run \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-28",
    "merchantId": "MERCH001",
    "dryRun": false
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "jobId": "recon-job-12345",
  "status": "processing",
  "counters": {
    "pgTransactions": 10,
    "bankRecords": 10,
    "matched": 0,
    "exceptions": 0
  }
}
```

### Wait and Check Status
```bash
# Poll job status (replace JOB_ID with actual ID from above)
curl http://52.66.199.215:5103/recon/jobs/recon-job-12345
```

**Expected Final Response (after ~30 seconds):**
```json
{
  "jobId": "recon-job-12345",
  "status": "completed",
  "counters": {
    "pgTransactions": 10,
    "bankRecords": 10,
    "matched": 10,
    "exceptions": 0
  },
  "stage": "complete",
  "error": null
}
```

### Check Recon Logs on EC2
```bash
# SSH to Staging 2
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215

# Check recon API logs
pm2 logs recon-api --lines 30

# Should see:
# "[Recon] Starting reconciliation for MERCH001, date: 2025-10-28"
# "[Recon] Matched 10/10 transactions"
# "[Recon] Job completed successfully"
```

---

## ✅ STEP 4: Verify Reconciliation on Staging 2

### Database Query (via SSH)
```bash
# SSH to Staging 2
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215

# Run query
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U your_username \
     -d settlepaisa_v2 \
     -c "SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'RECONCILED') as reconciled,
           COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
           COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exceptions,
           SUM(bank_fee_paise) / 100.0 as total_bank_fees
         FROM sp_v2_transactions
         WHERE merchant_id = 'MERCH001'
           AND DATE(transaction_date) = '2025-10-28';"
```

**Expected Result:**
```
total | reconciled | pending | exceptions | total_bank_fees
------|------------|---------|------------|----------------
  10  |     10     |    0    |     0      |      0.00
```

---

## ⚙️ STEP 5: Wait for Auto-Settlement (5 minutes)

### Background Process
The settlement-queue-processor on Staging 2 will automatically:
1. Detect RECONCILED transactions (via database trigger)
2. Queue them in `sp_v2_settlement_queue`
3. Wait for batching threshold (100 txns OR 5 minutes)
4. Create settlement batch automatically

### Check Queue Status on EC2
```bash
# SSH to Staging 2
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215

# Check settlement queue processor logs
pm2 logs settlement-queue-processor --lines 50

# Should see after ~5 minutes:
# "[Settlement Queue] Found 1 merchant batches ready for processing"
# "[Settlement Queue] Processing batch for merchant MERCH001 (10 transactions, ₹2,20,000)"
# "[Settlement Queue] ✅ Processed batch <UUID> for merchant MERCH001 in Xs"
```

### Verify Settlement Batch Created
```bash
# On Staging 2, run database query
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U your_username \
     -d settlepaisa_v2 \
     -c "SELECT
           id,
           merchant_id,
           cycle_date,
           total_transactions,
           gross_amount_paise / 100.0 as gross,
           total_commission_paise / 100.0 as commission,
           total_gst_paise / 100.0 as gst,
           net_amount_paise / 100.0 as net_payout,
           status,
           created_at
         FROM sp_v2_settlement_batches
         WHERE merchant_id = 'MERCH001'
           AND cycle_date = '2025-10-28';"
```

**Expected Result:**
```
id          | merchant_id | cycle_date | total_transactions | gross     | commission | gst    | net_payout | status     | created_at
------------|-------------|------------|--------------------|-----------|-----------  |--------|------------|------------|------------
<UUID>      | MERCH001    | 2025-10-28 | 10                 | 220000.00 | 4400.00    | 792.00 | 214808.00  | CALCULATED | <timestamp>
```

---

## 📊 STEP 6: Verify Financial Dashboard (Staging 2 Frontend)

### Navigate to Dashboard
**URL:** http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/financial

**Date Filter:** 2025-10-28

### Expected Dashboard Values

```
┌─────────────────────────────┬─────────────┐
│ Metric                      │ Value       │
├─────────────────────────────┼─────────────┤
│ Gross GMV                   │ ₹2.20 L     │
│ MDR Collected               │ ₹5.19K      │
│ Commission                  │ ₹4.40K      │
│ GST                         │ ₹792        │
│ Gross Margin                │ 2.36%       │
│ Bank Charges                │ ₹0          │
│ SettlePaisa Revenue         │ ₹4.40K      │
└─────────────────────────────┴─────────────┘
```

### API Query (Direct to EC2)
```bash
# From your local machine
curl "http://52.66.199.215:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28" | jq
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "gmv": {
      "paise": "22000000",
      "rupees": 220000,
      "formatted": "₹2.20 L"
    },
    "commission": {
      "paise": "440000",
      "rupees": 4400,
      "formatted": "₹4.40K"
    },
    "gst": {
      "paise": "79200",
      "rupees": 792,
      "formatted": "₹792"
    },
    "mdrCollected": {
      "paise": "519200",
      "rupees": 5192,
      "formatted": "₹5.19K"
    },
    "bankCharges": {
      "paise": "0",
      "rupees": 0,
      "formatted": "₹0"
    },
    "settlepaisaRevenue": {
      "paise": "440000",
      "rupees": 4400,
      "formatted": "₹4.40K"
    },
    "grossMargin": {
      "percent": "2.36"
    }
  }
}
```

---

## 📑 STEP 7: Verify Reports Section (Staging 2 Frontend)

### Navigate to Reports
**URL:** http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/reports

### Test Each Report

#### 1. Transaction Report
**Filter:** Date = 2025-10-28, Merchant = MERCH001

**Expected:**
- Total rows: 10
- All statuses: SETTLED
- All amounts visible (₹10K, ₹25K, ₹15K, etc.)
- All UTRs present (HDFCN0251028001-010)

#### 2. Settlement Report
**Filter:** Date = 2025-10-28

**Expected:**
- 1 settlement batch for MERCH001
- Gross: ₹2,20,000
- Net: ₹2,14,808
- Status: CALCULATED

#### 3. Reconciliation Report
**Filter:** Date = 2025-10-28

**Expected:**
- Total: 10 transactions
- Reconciled: 10
- Exceptions: 0
- Reconciliation Rate: 100%

---

## 🐛 Troubleshooting on Staging 2

### Issue: Upload Failed

**Check Upload API:**
```bash
# Test health endpoint
curl http://52.66.199.215:5107/health

# Check logs on EC2
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215
pm2 logs upload-api --lines 50
```

**Common Issues:**
- Service not running: `pm2 restart upload-api`
- Port not accessible: Check security group rules
- Database connection: Check RDS credentials in `.env`

### Issue: Reconciliation Not Running

**Check Recon API:**
```bash
# Test health endpoint
curl http://52.66.199.215:5103/health

# Check logs on EC2
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215
pm2 logs recon-api --lines 50

# Verify PM2 status
pm2 status | grep recon-api
```

**Manual Trigger:**
```bash
curl -X POST http://52.66.199.215:5103/recon/run \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-10-28","merchantId":"MERCH001"}'
```

### Issue: Settlement Not Created

**Check Settlement Queue Processor:**
```bash
# SSH to Staging 2
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215

# Check processor status
pm2 status | grep settlement-queue-processor

# Check logs
pm2 logs settlement-queue-processor --lines 100

# Verify database trigger fired
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U your_username \
     -d settlepaisa_v2 \
     -c "SELECT COUNT(*), status FROM sp_v2_settlement_queue
         WHERE merchant_id = 'MERCH001'
         AND DATE(queued_at) = '2025-10-28'
         GROUP BY status;"

# Expected: 10 rows with status = PENDING or PROCESSED
```

**Restart Processor if Needed:**
```bash
pm2 restart settlement-queue-processor
```

### Issue: Dashboard Shows ₹0

**Check Overview API:**
```bash
# Test health endpoint
curl http://52.66.199.215:5108/health

# Test financial API directly
curl "http://52.66.199.215:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28"

# Check logs on EC2
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215
pm2 logs overview-api --lines 50
```

**Check Frontend Build:**
```bash
# Verify frontend is pointing to correct backend
# Check browser console for API errors
# URL should be: http://52.66.199.215:5108 (not localhost)
```

### Issue: Can't Access Frontend

**Check S3 Static Hosting:**
```bash
# Test S3 URL directly
curl -I http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com

# Should return HTTP 200

# If 403/404, check S3 bucket:
# 1. Bucket policy allows public read
# 2. Static website hosting enabled
# 3. Index document set to index.html
```

---

## 🎯 Success Criteria Checklist

### Upload Phase (Staging 2)
- [ ] PG file uploaded via EC2 API: 10 records inserted
- [ ] Bank file uploaded via EC2 API: 10 records inserted
- [ ] Verified in RDS: All transactions PENDING status
- [ ] PM2 logs show successful upload

### Reconciliation Phase (Staging 2)
- [ ] Recon API called successfully
- [ ] Job completed with 10/10 matched
- [ ] RDS shows all 10 transactions RECONCILED
- [ ] Bank fees calculated (₹0)
- [ ] PM2 logs show successful reconciliation

### Settlement Phase (Staging 2)
- [ ] Settlement queue has 10 entries
- [ ] After 5 minutes, settlement batch created
- [ ] RDS shows 1 batch with CALCULATED status
- [ ] All 10 transactions status = SETTLED
- [ ] PM2 logs show batch processing

### Financial Dashboard (Staging 2 Frontend)
- [ ] S3 frontend accessible
- [ ] GMV shows ₹2.20 L
- [ ] Commission shows ₹4.40K
- [ ] GST shows ₹792
- [ ] Gross Margin shows 2.36%
- [ ] Bank Charges shows ₹0

### Reports Section (Staging 2 Frontend)
- [ ] Transaction Report shows 10 rows
- [ ] Settlement Report shows 1 batch
- [ ] Reconciliation Report shows 100% rate
- [ ] All data matches expected values

---

## 📱 Quick Commands Reference (Staging 2)

### Upload Files
```bash
cd /Users/shantanusingh/ops-dashboard

# PG file
curl -X POST http://52.66.199.215:5107/api/upload \
  -F "file=@test-manual-pg-v1-oct28.csv" \
  -F "type=pg" \
  -F "merchant_id=MERCH001" \
  -F "date=2025-10-28"

# Bank file
curl -X POST http://52.66.199.215:5107/api/upload \
  -F "file=@test-manual-hdfc-bank-v1-oct28.csv" \
  -F "type=bank" \
  -F "merchant_id=MERCH001" \
  -F "date=2025-10-28" \
  -F "bank=HDFC BANK"
```

### Run Reconciliation
```bash
curl -X POST http://52.66.199.215:5103/recon/run \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-10-28","merchantId":"MERCH001"}'
```

### Check Financial Dashboard
```bash
curl "http://52.66.199.215:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28" | jq
```

### SSH to Staging 2
```bash
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215
```

### Check PM2 Status
```bash
# On EC2
pm2 status
pm2 logs upload-api --lines 20
pm2 logs recon-api --lines 20
pm2 logs settlement-queue-processor --lines 50
```

---

## 📊 Expected Timeline

```
00:00 - Upload PG file              → 10 records
00:01 - Upload Bank file            → 10 records
00:02 - Run reconciliation          → Job started
00:03 - Reconciliation complete     → 10/10 matched
00:04 - Transactions RECONCILED     → Queued for settlement
00:05 - Settlement batch created    → Status: CALCULATED
00:06 - Transactions SETTLED        → All linked to batch
00:08 - Dashboard refreshed         → Shows ₹2.20 L GMV
00:10 - Reports verified            → All data correct
────────────────────────────────────────────────────
Total Time: ~10 minutes
```

---

**Environment:** Staging 2 (EC2: 52.66.199.215)
**Test Plan Created:** October 28, 2025
**Status:** Ready for Execution
**All URLs Updated:** ✅ No localhost references
