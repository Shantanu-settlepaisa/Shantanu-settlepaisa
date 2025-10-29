# Manual E2E Test Plan - File Upload to Settlement

**Date:** October 28, 2025
**Test Type:** Complete flow validation (Upload → Recon → Settlement → Dashboard)
**Merchant:** MERCH001
**Test Files:** V1 Format (PG + HDFC Bank)

---

## 📋 Test Files Created

### 1. PG Transactions File
**File:** `test-manual-pg-v1-oct28.csv`
**Format:** V1 (SabPaisa legacy format)
**Transactions:** 10
**Total Amount:** ₹2,20,000

| Transaction ID | Amount | Payment Mode | UTR | PG Name |
|----------------|--------|--------------|-----|---------|
| TXN20251028001 | ₹10,000 | UPI | HDFCN0251028001 | RAZORPAY |
| TXN20251028002 | ₹25,000 | NEFT | HDFCN0251028002 | PAYU |
| TXN20251028003 | ₹15,000 | CARD | HDFCN0251028003 | RAZORPAY |
| TXN20251028004 | ₹35,000 | NETBANKING | HDFCN0251028004 | PAYU |
| TXN20251028005 | ₹20,000 | UPI | HDFCN0251028005 | RAZORPAY |
| TXN20251028006 | ₹40,000 | NEFT | HDFCN0251028006 | PAYU |
| TXN20251028007 | ₹18,000 | UPI | HDFCN0251028007 | RAZORPAY |
| TXN20251028008 | ₹28,000 | CARD | HDFCN0251028008 | PAYU |
| TXN20251028009 | ₹12,000 | NETBANKING | HDFCN0251028009 | RAZORPAY |
| TXN20251028010 | ₹17,000 | UPI | HDFCN0251028010 | PAYU |

**V1 Format Columns:**
```csv
transaction_id,client_code,payee_amount,paid_amount,payment_mode,trans_complete_date,status,utr,pg_name
```

### 2. HDFC Bank Statements File
**File:** `test-manual-hdfc-bank-v1-oct28.csv`
**Format:** HDFC BANK V1 (from recon config)
**Records:** 10
**Total Amount:** ₹2,20,000

**V1 Format Columns (HDFC BANK config):**
```csv
MERCHANT_TRACKID,DOMESTIC AMT,SETTLE DATE,TRANS DATE
```

**Column Mapping (from sp_v2_bank_column_mappings):**
```json
{
  "transaction_id": "MERCHANT_TRACKID",
  "paid_amount": "DOMESTIC AMT",
  "payee_amount": "Net Amount",
  "transaction_date_time": "TRANS DATE",
  "payment_date_time": "SETTLE DATE"
}
```

---

## ✅ Expected Reconciliation Results

### Perfect Match Expected
**100% Reconciliation Rate** (all 10 transactions)

| Transaction ID | PG Amount | Bank Amount | UTR Match | Status |
|----------------|-----------|-------------|-----------|--------|
| TXN20251028001 | ₹10,000 | ₹10,000 | HDFCN0251028001 | ✅ RECONCILED |
| TXN20251028002 | ₹25,000 | ₹25,000 | HDFCN0251028002 | ✅ RECONCILED |
| TXN20251028003 | ₹15,000 | ₹15,000 | HDFCN0251028003 | ✅ RECONCILED |
| TXN20251028004 | ₹35,000 | ₹35,000 | HDFCN0251028004 | ✅ RECONCILED |
| TXN20251028005 | ₹20,000 | ₹20,000 | HDFCN0251028005 | ✅ RECONCILED |
| TXN20251028006 | ₹40,000 | ₹40,000 | HDFCN0251028006 | ✅ RECONCILED |
| TXN20251028007 | ₹18,000 | ₹18,000 | HDFCN0251028007 | ✅ RECONCILED |
| TXN20251028008 | ₹28,000 | ₹28,000 | HDFCN0251028008 | ✅ RECONCILED |
| TXN20251028009 | ₹12,000 | ₹12,000 | HDFCN0251028009 | ✅ RECONCILED |
| TXN20251028010 | ₹17,000 | ₹17,000 | HDFCN0251028010 | ✅ RECONCILED |

### Bank Fees
**Expected:** ₹0 (paid_amount = payee_amount in test data)

```
For each transaction:
bank_fee_paise = pgGrossPaise - bankCreditedPaise
               = 1000000 - 1000000
               = 0

Total Bank Charges = ₹0
```

---

## 💰 Expected Settlement Calculation

### Test Merchant Config (MERCH001)
- **MDR Rate:** 2% (default test config)
- **GST Rate:** 18% (on MDR)
- **Rolling Reserve:** 0% (disabled for test)
- **Fee Bearer:** Merchant (fee_bearer_id = 2)

### Calculations

```
Gross Amount (GMV):              ₹2,20,000.00
──────────────────────────────────────────────
Commission (2% MDR):             ₹4,400.00
GST (18% on commission):         ₹792.00
Rolling Reserve (0%):            ₹0.00
Bank Charges:                    ₹0.00
Refunds:                         ₹0.00
Chargebacks:                     ₹0.00
──────────────────────────────────────────────
Net Payout to Merchant:          ₹2,14,808.00

Revenue Split:
  Total MDR Collected:           ₹4,400.00
  Bank's Share:                  ₹0.00
  SettlePaisa Revenue:           ₹4,400.00
```

### Detailed Per-Transaction Breakdown

| TXN ID | Gross | Commission (2%) | GST (18%) | Reserve | Net Payout |
|--------|-------|-----------------|-----------|---------|------------|
| TXN001 | ₹10,000 | ₹200 | ₹36 | ₹0 | ₹9,764 |
| TXN002 | ₹25,000 | ₹500 | ₹90 | ₹0 | ₹24,410 |
| TXN003 | ₹15,000 | ₹300 | ₹54 | ₹0 | ₹14,646 |
| TXN004 | ₹35,000 | ₹700 | ₹126 | ₹0 | ₹34,174 |
| TXN005 | ₹20,000 | ₹400 | ₹72 | ₹0 | ₹19,528 |
| TXN006 | ₹40,000 | ₹800 | ₹144 | ₹0 | ₹39,056 |
| TXN007 | ₹18,000 | ₹360 | ₹64.80 | ₹0 | ₹17,575.20 |
| TXN008 | ₹28,000 | ₹560 | ₹100.80 | ₹0 | ₹27,339.20 |
| TXN009 | ₹12,000 | ₹240 | ₹43.20 | ₹0 | ₹11,716.80 |
| TXN010 | ₹17,000 | ₹340 | ₹61.20 | ₹0 | ₹16,598.80 |
| **Total** | **₹2,20,000** | **₹4,400** | **₹792** | **₹0** | **₹2,14,808** |

---

## 📤 STEP 1: Upload Files

### Option A: Upload via API (cURL)

#### 1. Upload PG Transactions
```bash
curl -X POST http://localhost:5107/api/upload \
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
curl -X POST http://localhost:5107/api/upload \
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

### Option B: Upload via Frontend

1. Navigate to **Recon Workspace**: http://localhost:5174/ops/recon-workspace
2. Click **"Upload Files"** button
3. Select PG file: `test-manual-pg-v1-oct28.csv`
4. Select Bank file: `test-manual-hdfc-bank-v1-oct28.csv`
5. Select Merchant: MERCH001
6. Select Date: 2025-10-28
7. Click **"Upload & Process"**

---

## ✅ STEP 2: Verify Upload

### Query 1: Check Uploaded Transactions
```sql
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

### Query 2: Check Transaction Details
```sql
SELECT
  transaction_id,
  merchant_id,
  amount_paise / 100.0 as amount,
  gross_amount_paise / 100.0 as gross,
  payment_method,
  utr,
  status,
  source_type
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
  AND DATE(transaction_date) = '2025-10-28'
ORDER BY transaction_id;
```

**Expected Result:**
```
10 rows showing all transactions with status = PENDING
```

---

## 🔄 STEP 3: Run Reconciliation

### API Call
```bash
curl -X POST http://localhost:5103/recon/run \
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

### Wait for Completion
Poll job status:
```bash
curl http://localhost:5103/recon/jobs/recon-job-12345
```

**Expected Final Response:**
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

---

## ✅ STEP 4: Verify Reconciliation

### Query 1: Check Reconciliation Status
```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'RECONCILED') as reconciled,
  COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
  COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exceptions,
  SUM(bank_fee_paise) / 100.0 as total_bank_fees
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
  AND DATE(transaction_date) = '2025-10-28';
```

**Expected Result:**
```
total | reconciled | pending | exceptions | total_bank_fees
------|------------|---------|------------|----------------
  10  |     10     |    0    |     0      |      0.00
```

### Query 2: Check Bank Fee Calculation
```sql
SELECT
  transaction_id,
  gross_amount_paise / 100.0 as gross,
  amount_paise / 100.0 as net,
  bank_fee_paise / 100.0 as bank_fee,
  status,
  reconciled_at
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
  AND DATE(transaction_date) = '2025-10-28'
ORDER BY transaction_id;
```

**Expected Result:**
```
All 10 transactions with:
- status = RECONCILED
- bank_fee_paise = 0
- reconciled_at = <timestamp>
```

---

## ⚙️ STEP 5: Verify Auto-Settlement Queue

### Query 1: Check Settlement Queue
```sql
SELECT
  transaction_id,
  merchant_id,
  amount_paise / 100.0 as amount,
  status,
  queued_at,
  processed_at
FROM sp_v2_settlement_queue
WHERE merchant_id = 'MERCH001'
  AND DATE(queued_at) = '2025-10-28'
ORDER BY queued_at;
```

**Expected Result (Immediately after recon):**
```
10 rows with status = PENDING or PROCESSING
```

**Expected Result (After 5 minutes):**
```
10 rows with status = PROCESSED
```

### Query 2: Check Transactions Marked as SETTLED
```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'SETTLED') as settled_count,
  COUNT(*) FILTER (WHERE settlement_batch_id IS NOT NULL) as with_batch_id
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
  AND DATE(transaction_date) = '2025-10-28';
```

**Expected Result:**
```
total | settled_count | with_batch_id
------|---------------|---------------
  10  |      10       |      10
```

---

## 💼 STEP 6: Verify Settlement Batch Created

### Query 1: Check Settlement Batch
```sql
SELECT
  id,
  merchant_id,
  cycle_date,
  total_transactions,
  gross_amount_paise / 100.0 as gross,
  total_commission_paise / 100.0 as commission,
  total_gst_paise / 100.0 as gst,
  total_reserve_paise / 100.0 as reserve,
  net_amount_paise / 100.0 as net_payout,
  total_bank_charges_paise / 100.0 as bank_charges,
  settlepaisa_revenue_paise / 100.0 as revenue,
  status,
  created_at
FROM sp_v2_settlement_batches
WHERE merchant_id = 'MERCH001'
  AND cycle_date = '2025-10-28';
```

**Expected Result:**
```
id                  | merchant_id | cycle_date | total_transactions | gross     | commission | gst    | reserve | net_payout | bank_charges | revenue  | status     | created_at
--------------------|-------------|------------|--------------------|-----------|-----------  |--------|---------|------------|--------------|----------|------------|------------
<UUID>              | MERCH001    | 2025-10-28 | 10                 | 220000.00 | 4400.00    | 792.00 | 0.00    | 214808.00  | 0.00         | 4400.00  | CALCULATED | <timestamp>
```

### Query 2: Check Settlement Items
```sql
SELECT
  transaction_id,
  amount_paise / 100.0 as gross,
  commission_paise / 100.0 as commission,
  gst_paise / 100.0 as gst,
  reserve_paise / 100.0 as reserve,
  net_paise / 100.0 as net_payout,
  payment_mode
FROM sp_v2_settlement_items
WHERE settlement_batch_id = (
  SELECT id FROM sp_v2_settlement_batches
  WHERE merchant_id = 'MERCH001' AND cycle_date = '2025-10-28'
)
ORDER BY transaction_id;
```

**Expected Result:**
```
10 rows matching the per-transaction breakdown table above
```

---

## 📊 STEP 7: Verify Financial Dashboard

### Navigate to Dashboard
**URL:** http://localhost:5174/ops/financial

**Date Filter:** 2025-10-28

### Expected Dashboard Values

#### Top KPIs
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

#### Transaction Breakdown
```
┌─────────────────┬───────┬───────────┐
│ Payment Mode    │ Count │ Amount    │
├─────────────────┼───────┼───────────┤
│ UPI             │   5   │ ₹85,000   │
│ NEFT            │   2   │ ₹65,000   │
│ CARD            │   2   │ ₹43,000   │
│ NETBANKING      │   1   │ ₹27,000   │
└─────────────────┴───────┴───────────┘
```

### API Query
```bash
curl "http://localhost:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28" | jq
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

## 📑 STEP 8: Verify Reports Section

### Navigate to Reports
**URL:** http://localhost:5174/ops/reports

### Test Each Report

#### 1. Transaction Report
**Filter:** Date = 2025-10-28, Merchant = MERCH001

**Expected:**
- Total rows: 10
- All statuses: SETTLED
- All amounts visible
- All UTRs present

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

#### 4. Revenue Report
**Filter:** Date = 2025-10-28

**Expected:**
- Commission: ₹4,400
- GST: ₹792
- Revenue: ₹4,400
- Bank Charges: ₹0

---

## 🎯 Success Criteria Checklist

### Upload Phase
- [ ] PG file uploaded: 10 records inserted
- [ ] Bank file uploaded: 10 records inserted
- [ ] All transactions in PENDING status

### Reconciliation Phase
- [ ] All 10 transactions matched (100% rate)
- [ ] All 10 transactions status = RECONCILED
- [ ] Bank fees calculated (₹0 for all)
- [ ] reconciled_at timestamp populated

### Settlement Phase
- [ ] All 10 transactions auto-queued
- [ ] Settlement batch created (CALCULATED status)
- [ ] Settlement batch totals match expected values
- [ ] 10 settlement items created
- [ ] All transactions status = SETTLED
- [ ] settlement_batch_id populated

### Financial Dashboard
- [ ] GMV shows ₹2.20 L
- [ ] Commission shows ₹4.40K
- [ ] GST shows ₹792
- [ ] MDR Collected shows ₹5.19K
- [ ] Gross Margin shows 2.36%
- [ ] Bank Charges shows ₹0
- [ ] SettlePaisa Revenue shows ₹4.40K

### Reports Section
- [ ] Transaction Report shows all 10 transactions
- [ ] Settlement Report shows 1 batch
- [ ] Reconciliation Report shows 100% rate
- [ ] Revenue Report shows correct amounts

---

## 🐛 Troubleshooting

### Issue: Files Not Uploading
**Check:**
```bash
# Verify upload API is running
curl http://localhost:5107/health

# Check file format
head -5 test-manual-pg-v1-oct28.csv
head -5 test-manual-hdfc-bank-v1-oct28.csv

# Check logs
pm2 logs upload-api --lines 50
```

### Issue: Reconciliation Not Running
**Check:**
```bash
# Verify recon API is running
curl http://localhost:5103/health

# Check logs
pm2 logs recon-api --lines 50

# Manually trigger
curl -X POST http://localhost:5103/recon/run \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-10-28","merchantId":"MERCH001"}'
```

### Issue: Settlement Not Created
**Check:**
```bash
# Check settlement queue processor
pm2 status | grep settlement-queue-processor

# Check logs
pm2 logs settlement-queue-processor --lines 50

# Check queue table
psql -d settlepaisa_v2 -c "SELECT * FROM sp_v2_settlement_queue WHERE merchant_id = 'MERCH001' AND DATE(queued_at) = '2025-10-28';"
```

### Issue: Dashboard Shows ₹0
**Check:**
```bash
# Verify overview API is running
curl http://localhost:5108/health

# Test financial API directly
curl "http://localhost:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28"

# Check database
psql -d settlepaisa_v2 -c "SELECT COUNT(*), SUM(amount_paise) FROM sp_v2_transactions WHERE merchant_id = 'MERCH001' AND DATE(transaction_date) = '2025-10-28';"
```

---

## 📝 Test Execution Log Template

Use this to track your test:

```
┌─────────────────────────────────────────────────────────────────┐
│                     MANUAL TEST EXECUTION LOG                   │
├─────────────────────────────────────────────────────────────────┤
│ Test Date: 2025-10-28                                           │
│ Tester: _________________________                               │
│ Start Time: _____________________                               │
├─────────────────────────────────────────────────────────────────┤
│ STEP 1: Upload Files                                            │
│ [ ] PG file uploaded - Records: _____                           │
│ [ ] Bank file uploaded - Records: _____                         │
│ [ ] Database verification passed                                │
│ Issues: ___________________________________________________     │
├─────────────────────────────────────────────────────────────────┤
│ STEP 2: Run Reconciliation                                      │
│ [ ] Recon job triggered - Job ID: __________                    │
│ [ ] Job completed - Matched: _____ / 10                         │
│ [ ] Database verification passed                                │
│ Issues: ___________________________________________________     │
├─────────────────────────────────────────────────────────────────┤
│ STEP 3: Verify Settlement                                       │
│ [ ] Settlement batch created - Batch ID: __________             │
│ [ ] Settlement totals match expected values                     │
│ [ ] All transactions marked as SETTLED                          │
│ Issues: ___________________________________________________     │
├─────────────────────────────────────────────────────────────────┤
│ STEP 4: Verify Financial Dashboard                              │
│ [ ] GMV: ₹_________ (Expected: ₹2.20 L)                         │
│ [ ] Commission: ₹_________ (Expected: ₹4.40K)                   │
│ [ ] Gross Margin: _____% (Expected: 2.36%)                      │
│ Issues: ___________________________________________________     │
├─────────────────────────────────────────────────────────────────┤
│ STEP 5: Verify Reports Section                                  │
│ [ ] Transaction Report - 10 rows visible                        │
│ [ ] Settlement Report - 1 batch visible                         │
│ [ ] Reconciliation Report - 100% rate                           │
│ Issues: ___________________________________________________     │
├─────────────────────────────────────────────────────────────────┤
│ End Time: _____________________                                 │
│ Overall Status: [ ] PASS  [ ] FAIL                              │
│ Notes: _________________________________________________________│
│ ________________________________________________________________│
└─────────────────────────────────────────────────────────────────┘
```

---

**Test Plan Created:** October 28, 2025
**Ready for Execution:** ✅ All files and queries prepared
**Expected Duration:** 15-20 minutes
**Next Step:** Execute upload commands above and follow verification steps
