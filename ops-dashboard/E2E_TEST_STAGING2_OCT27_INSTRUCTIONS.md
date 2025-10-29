# 🧪 Staging 2 End-to-End Test - October 27, 2025

## 📊 Test Overview

**Environment:** Staging 2
**Frontend URL:** http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
**EC2 IP:** 52.66.199.215
**Test Date:** October 27, 2025
**Test Files Location:** `/Users/shantanusingh/ops-dashboard/`

---

## ✅ Phase 1: Test Files Generated (COMPLETE)

### PG Transaction File
- **File:** `test-pg-v1-staging2-oct27.csv`
- **Format:** V1 Standard (SabPaisa Legacy)
- **Columns:** `transaction_id, client_code, payee_amount, paid_amount, payment_mode, trans_complete_date, status, utr, pg_name`
- **Records:** 25 transactions
- **Total Amount:** ₹644,500.00 (will convert to 64,450,000 paise)
- **Payment Methods:** UPI (13), NEFT (5), CARD (4), NETBANKING (3)
- **All Status:** SUCCESS
- **UTR Format:** AXISN0251027XXX (Axis Bank, NEFT)

### Bank Statement File
- **File:** `test-hdfc-v1-staging2-oct27.csv`
- **Format:** HDFC V1 (Recon Config Format)
- **Columns:** `MERCHANT_TRACKID, DOMESTIC AMT, SETTLE DATE, TRANS DATE`
- **Records:** 18 bank statements
- **Total Amount:** ₹438,000.00 (will convert to 43,800,000 paise)
- **Matched Transactions:** First 18 PG transactions (UTRs match)
- **Unmatched:** 7 PG transactions (for exception testing)

### Expected Reconciliation Results
- ✅ **Matched:** 18 transactions (₹438,000)
- ⚠️ **Unmatched PG:** 7 transactions (₹206,500)
- ✅ **Unmatched Bank:** 0 transactions
- ✅ **Match Rate:** 72% (18/25)

---

## ✅ Phase 2: Backend Services Verified (COMPLETE)

All services are **ONLINE** and **HEALTHY**:

| Service | Port | Status | Response |
|---------|------|--------|----------|
| **Overview API** | 5108 | 🟢 ONLINE | `{"status":"healthy","service":"overview-api","port":5108}` |
| **Recon API** | 5103 | 🟢 ONLINE | `{"status":"ok","service":"recon-api"}` |
| **Upload API** | 5107 | 🟢 ONLINE | `{"status":"ok","service":"v2-file-upload"}` |
| **Settlement API** | 5109 | 🟢 ONLINE | `{"status":"ok","service":"settlement-engine"}` |

---

## 📝 Phase 3: Manual Upload Instructions

### Step 1: Access Recon Workspace

1. Open browser and navigate to:
   ```
   http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon
   ```

2. You should see the Recon Workspace page with two upload sections:
   - **PG Transactions Upload**
   - **Bank Statements Upload**

### Step 2: Upload PG Transaction File

1. Click **"Choose File"** or **"Upload"** button under **PG Transactions** section

2. Select file: `/Users/shantanusingh/ops-dashboard/test-pg-v1-staging2-oct27.csv`

3. **Expected Behavior:**
   - File name appears in upload field
   - System detects file type as "transactions" (auto-detection)
   - File preview may appear showing first few rows
   - Upload status shows "Processing..." then "Success"

4. **V1→V2 Conversion (Automatic):**
   - `payee_amount` (₹5000.00) → `amount_paise` (500000)
   - `paid_amount` (₹5000.00) → `gross_amount_paise` (500000)
   - `trans_complete_date` → `transaction_timestamp` + `transaction_date`
   - `client_code` (MERCH001) → `merchant_id`
   - `source_type` auto-set to "MANUAL_UPLOAD"

5. **Verify Upload Success:**
   - Green success message appears
   - Record count shows: **25 transactions uploaded**
   - Total amount may display

### Step 3: Upload Bank Statement File

1. Click **"Choose File"** or **"Upload"** button under **Bank Statements** section

2. Select file: `/Users/shantanusingh/ops-dashboard/test-hdfc-v1-staging2-oct27.csv`

3. **Expected Behavior:**
   - File name appears in upload field
   - System detects bank as "HDFC BANK" from filename
   - System fetches recon config from database (`sp_v2_bank_column_mappings`)
   - File preview may appear
   - Upload status shows "Processing..." then "Success"

4. **V1→V2 Conversion (Two-Stage, Automatic):**
   - **Stage 1 (Bank Raw → V1 Standard):**
     - `MERCHANT_TRACKID` → `transaction_id`
     - `DOMESTIC AMT` → `paid_amount`
     - `SETTLE DATE` → `payment_date_time`

   - **Stage 2 (V1 Standard → V2):**
     - `paid_amount` (₹5000.00) → `amount_paise` (500000)
     - `payment_date_time` (27-10-2025) → `value_date` (2025-10-27)
     - `transaction_id` → `bank_ref`

5. **Verify Upload Success:**
   - Green success message appears
   - Record count shows: **18 bank statements uploaded**
   - Total amount may display

---

## 📝 Phase 4: Run Reconciliation

### Step 1: Trigger Reconciliation

1. After both files are uploaded, look for **"Run Reconciliation"** button
2. Click the button
3. System may show confirmation dialog
4. Confirm to proceed

### Step 2: Monitor Progress

**Expected behavior:**
- Progress spinner/indicator appears
- Status updates: "Matching by UTR...", "Validating amounts...", "Complete"
- Processing time: 5-15 seconds for 25 transactions

### Step 3: View Results

**Results Table Should Show:**

| Tab | Count | Amount |
|-----|-------|--------|
| **All** | 25 | ₹644,500 |
| **Matched** | 18 | ₹438,000 |
| **Unmatched PG** | 7 | ₹206,500 |
| **Unmatched Bank** | 0 | ₹0 |
| **Exceptions** | 0 | ₹0 |

### Step 4: Verify Matched Transactions

Click on **"Matched"** tab and verify:
- ✅ All 18 matched transactions have 100% confidence
- ✅ UTRs match exactly (AXISN0251027001 - AXISN0251027018)
- ✅ Amounts match exactly (no delta)
- ✅ Status shows "MATCHED"

### Step 5: Verify Unmatched Transactions

Click on **"Unmatched PG"** tab and verify:
- ✅ Shows 7 unmatched transactions (TXN20251027019 - TXN20251027025)
- ✅ Reason: "No matching bank record found"
- ✅ UTRs: AXISN0251027019 - AXISN0251027025
- ✅ Total: ₹206,500

### Step 6: Export Results

1. Click **"Export CSV"** or **"Download Results"** button
2. CSV file should download with name like: `recon-results-{jobId}-{date}.csv`
3. Open CSV and verify:
   - All 25 rows present
   - Columns: Transaction ID, UTR, Amount, Status, Reason, Date
   - Amounts formatted correctly (₹ symbol, commas)

---

## 📝 Phase 5: Create Settlement Batches

### Step 1: Navigate to Settlements Page

1. Go to:
   ```
   http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/settlements
   ```

2. Look for **"Create Settlement"** or **"New Settlement Batch"** button

### Step 2: Trigger Settlement Creation

**Option A: Manual Button Click**
1. Click "Create Settlement" button
2. Select merchant: MERCH001
3. Select date range: Today (2025-10-27)
4. Confirm

**Option B: API Call (if no UI button)**
```bash
curl -X POST http://52.66.199.215:5109/api/create-settlement \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "MERCH001",
    "startDate": "2025-10-27",
    "endDate": "2025-10-27"
  }'
```

### Step 3: Verify Settlement Batch Created

**Expected Database Records:**

1. **`sp_v2_settlement_batches`** table:
   - 1 new batch record
   - `batch_id`: Auto-generated (e.g., BATCH_20251027_001)
   - `merchant_id`: MERCH001
   - `status`: PENDING_APPROVAL
   - `total_amount_paise`: 43,800,000 (₹438,000)
   - `items_count`: 18

2. **`sp_v2_settlement_items`** table:
   - 18 new settlement item records
   - Each linked to matched transaction via `txn_id`
   - Each has calculated fees, tax, net amount

### Step 4: Verify Settlement Calculations

**Expected Calculations (assuming 2% commission + 18% GST):**

- **Gross Amount:** ₹438,000.00
- **Commission (2%):** ₹8,760.00
- **GST (18% of commission):** ₹1,576.80
- **Net Payable:** ₹427,663.20

**Verify in UI:**
- Settlement batch shows correct gross amount
- Fees and tax calculated correctly
- Net amount is accurate
- All 18 transactions linked

---

## 📝 Phase 6: Verify Reports Section

### Step 1: Access Reports Page

Navigate to:
```
http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/reports
```

### Step 2: Check Transaction Summary Report

**Expected Data:**
- **Total Transactions:** 25
- **Matched:** 18 (72%)
- **Unmatched:** 7 (28%)
- **Total Value:** ₹644,500
- **Matched Value:** ₹438,000
- **Unmatched Value:** ₹206,500

### Step 3: Check Settlement Report

**Expected Data:**
- **Settlement Batch:** BATCH_20251027_001 (or similar)
- **Status:** PENDING_APPROVAL
- **Gross Amount:** ₹438,000
- **Net Amount:** ~₹427,663 (after fees and tax)
- **Items Count:** 18
- **Created Date:** 2025-10-27

### Step 4: Check Exception Report

**Expected Data:**
- **Exceptions:** 0 (all unmatched are properly categorized)
- **Or 7 unmatched PG** (if system treats them as exceptions)

### Step 5: Export All Reports

1. Export each report as CSV
2. Verify data accuracy in exported files
3. Check for proper formatting (amounts, dates, etc.)

---

## 📝 Phase 7: Verify Financial Dashboard

### Step 1: Access Overview Dashboard

Navigate to:
```
http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/overview
```

### Step 2: Verify Pipeline Metrics

**Expected Values:**

| Metric | Value | Calculation |
|--------|-------|-------------|
| **Captured** | 25 | Total PG transactions uploaded |
| **In Settlement** | 18 | Matched transactions in settlement batch |
| **Sent to Bank** | 0 | Not yet approved/sent |
| **Credited** | 0 | Not yet paid out |
| **Unsettled** | 7 | Unmatched transactions |

### Step 3: Verify Financial Metrics

**Expected Values:**

| Metric | Value (₹) | Value (paise) | Calculation |
|--------|-----------|---------------|-------------|
| **Gross Amount** | 644,500 | 64,450,000 | Sum of all captured |
| **Reconciled Amount** | 438,000 | 43,800,000 | Sum of matched |
| **Unreconciled Amount** | 206,500 | 20,650,000 | Sum of unmatched |
| **Settlement Value** | ~427,663 | ~42,766,320 | Gross - Fees - Tax |

### Step 4: Verify By Source Breakdown

**Expected Data:**
- **Manual Upload:** 100% (25 transactions, ₹644,500)
- **Connectors:** 0% (no connector uploads in this test)
- **Match Rate:** 72% (18/25)

### Step 5: Verify Data Accuracy

**Critical Checks:**
- ✅ All amounts are integers in paise (no decimals)
- ✅ Totals add up correctly (Reconciled + Unreconciled = Gross)
- ✅ Pipeline stages are mutually exclusive
- ✅ No negative values
- ✅ Match rate calculation is accurate (18/25 = 72%)

---

## 📊 Expected Results Summary

### File Upload
- ✅ 25 PG transactions uploaded (V1 format)
- ✅ 18 bank statements uploaded (HDFC V1 format)
- ✅ All amounts converted to paise correctly
- ✅ V1→V2 mapping accurate

### Reconciliation
- ✅ 18 matched (72% match rate)
- ✅ 7 unmatched PG (28%)
- ✅ 0 exceptions (unless unmatched are treated as exceptions)
- ✅ All UTR matching accurate
- ✅ Amount validation working

### Settlement
- ✅ 1 settlement batch created
- ✅ 18 settlement items (one per matched transaction)
- ✅ Status: PENDING_APPROVAL
- ✅ Calculations accurate (gross, fees, tax, net)

### Reports
- ✅ All metrics displaying correctly
- ✅ Export functionality working
- ✅ Data accuracy validated

### Dashboard
- ✅ Pipeline metrics correct
- ✅ Financial metrics accurate
- ✅ By source breakdown showing 100% manual
- ✅ All amounts in paise (integers)

---

## 🐛 Potential Issues to Watch For

### Issue 1: V1→V2 Conversion Failure
**Symptom:** Upload succeeds but amounts are wrong (too large or have decimals)
**Cause:** Amounts not multiplied by 100
**Check:** Verify `amount_paise` values in database are integers (500000, not 5000.00)

### Issue 2: Bank File Not Recognized
**Symptom:** Bank file upload fails with "Unknown bank format"
**Cause:** Recon config not found in `sp_v2_bank_column_mappings` table
**Fix:** Ensure HDFC Bank mapping exists in database

### Issue 3: No Matches Found
**Symptom:** All 25 transactions show as unmatched
**Cause:** UTR format mismatch or case sensitivity
**Check:** Verify UTRs in database are uppercase and match exactly

### Issue 4: Settlement Calculation Wrong
**Symptom:** Net amount is incorrect
**Cause:** Commission rate or tax calculation error
**Check:** Verify commission tier for MERCH001 in database

### Issue 5: Dashboard Shows Zero Data
**Symptom:** Overview dashboard displays 0 for all metrics
**Cause:** Database query issue or date filter problem
**Check:** Verify transaction_date is set to today (2025-10-27)

---

## 🔍 Database Verification Queries

If you need to verify data directly in the database, SSH to Staging 2 and run:

```bash
ssh -i ~/.ssh/staging-2-key.pem ec2-user@52.66.199.215
```

Then connect to database:
```bash
psql postgresql://postgres:SettlePaisa2024@settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2
```

### Query 1: Check Uploaded Transactions
```sql
SELECT
  COUNT(*) as total_count,
  SUM(amount_paise) as total_amount_paise,
  SUM(amount_paise)/100.0 as total_amount_rupees,
  source_type
FROM sp_v2_transactions
WHERE transaction_date = '2025-10-27'
  AND merchant_id = 'MERCH001'
GROUP BY source_type;
```

**Expected Output:**
```
total_count | total_amount_paise | total_amount_rupees | source_type
------------+--------------------+---------------------+------------------
         25 |           64450000 |            644500.00 | MANUAL_UPLOAD
```

### Query 2: Check Reconciliation Results
```sql
SELECT
  status,
  COUNT(*) as count,
  SUM(pg_amount_paise) as total_paise,
  SUM(pg_amount_paise)/100.0 as total_rupees
FROM sp_v2_recon_matches
WHERE DATE(created_at) = '2025-10-27'
GROUP BY status
ORDER BY status;
```

**Expected Output:**
```
status        | count | total_paise | total_rupees
--------------+-------+-------------+--------------
MATCHED       |    18 |    43800000 |     438000.00
UNMATCHED_PG  |     7 |    20650000 |     206500.00
```

### Query 3: Check Settlement Batch
```sql
SELECT
  batch_id,
  status,
  total_amount_paise,
  total_amount_paise/100.0 as total_rupees,
  items_count,
  created_at
FROM sp_v2_settlement_batches
WHERE DATE(created_at) = '2025-10-27'
  AND merchant_id = 'MERCH001';
```

**Expected Output:**
```
batch_id              | status           | total_amount_paise | total_rupees | items_count | created_at
----------------------+------------------+--------------------+--------------+-------------+-------------------------
BATCH_20251027_001    | PENDING_APPROVAL |           43800000 |     438000.00|          18 | 2025-10-27 16:30:45.123
```

### Query 4: Verify V1→V2 Conversion
```sql
SELECT
  transaction_id,
  amount_paise,
  amount_paise/100.0 as amount_rupees,
  gross_amount_paise,
  gross_amount_paise/100.0 as gross_rupees,
  source_type,
  utr
FROM sp_v2_transactions
WHERE transaction_date = '2025-10-27'
  AND merchant_id = 'MERCH001'
ORDER BY transaction_id
LIMIT 5;
```

**Expected Output (sample):**
```
transaction_id  | amount_paise | amount_rupees | gross_amount_paise | gross_rupees | source_type    | utr
----------------+--------------+---------------+--------------------+--------------+----------------+------------------
TXN20251027001  |       500000 |       5000.00 |             500000 |      5000.00 | MANUAL_UPLOAD  | AXISN0251027001
TXN20251027002  |      1250000 |      12500.00 |            1250000 |     12500.00 | MANUAL_UPLOAD  | AXISN0251027002
TXN20251027003  |      2200000 |      22000.00 |            2200000 |     22000.00 | MANUAL_UPLOAD  | AXISN0251027003
```

---

## ✅ Test Completion Checklist

Mark each item as you complete:

- [ ] Both test files generated and verified
- [ ] All 4 backend services confirmed online
- [ ] PG transaction file uploaded successfully (25 records)
- [ ] Bank statement file uploaded successfully (18 records)
- [ ] Reconciliation completed (18 matched, 7 unmatched)
- [ ] Settlement batch created (PENDING_APPROVAL)
- [ ] Settlement calculations verified (fees + tax correct)
- [ ] Reports section shows accurate data
- [ ] Financial dashboard metrics correct
- [ ] All amounts in paise (integers, no decimals)
- [ ] Export functionality tested (CSV downloads)
- [ ] Database queries confirm data accuracy

---

## 📝 Next Steps After Test

1. **If all tests pass:**
   - Document results in E2E test report
   - Mark Staging 2 as production-ready
   - Plan production deployment

2. **If any tests fail:**
   - Document failures with screenshots
   - Check PM2 logs on Staging 2 EC2
   - Review database queries for data issues
   - Fix issues and re-run tests

3. **Additional Testing:**
   - Test settlement approval workflow
   - Test payout file generation (if implemented)
   - Test with larger datasets (100+ transactions)
   - Test with multiple merchants

---

**Test Prepared By:** Claude (AI Assistant)
**Test Date:** October 27, 2025
**Environment:** Staging 2 (52.66.199.215)
**Status:** Ready for Execution

---

**🚀 YOU ARE NOW READY TO BEGIN MANUAL TESTING!**

Open the Staging 2 dashboard and follow the instructions above.
