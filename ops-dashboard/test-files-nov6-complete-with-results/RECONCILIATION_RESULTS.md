# Reconciliation Results - November 6, 2025 Test Files

## Overview
This folder contains 4 test files designed for complete reconciliation testing with bank fee calculation support for all three banks.

---

## Files Included

### 1. PG Transactions File
**Filename**: `test-pg-180-records-nov6.csv`

**Format**: CSV (comma-delimited)

**Columns**:
- transaction_id
- client_code
- payee_amount (net amount after PG fee)
- paid_amount (gross amount customer paid)
- payment_mode
- trans_complete_date
- status
- utr
- pg_name

**Record Count**: 180

**UTR Range**: UTR001 - UTR180

**Sample Records**:
```csv
transaction_id,client_code,payee_amount,paid_amount,payment_mode,trans_complete_date,status,utr,pg_name
TXN_001,MERCH001,985.00,1000.00,UPI,2025-11-06 09:00:00,SUCCESS,UTR001,RAZORPAY
TXN_002,MERCH001,1477.50,1500.00,UPI,2025-11-06 09:03:00,SUCCESS,UTR002,RAZORPAY
TXN_003,MERCH001,1970.00,2000.00,UPI,2025-11-06 09:06:00,SUCCESS,UTR003,RAZORPAY
```

---

### 2. HDFC Bank Statements
**Filename**: `test-hdfc-60-records-nov6.csv`

**Format**: CSV (comma-delimited)

**Columns**:
- MERCHANT_TRACKID (UTR)
- DOMESTIC AMT (gross amount)
- Net Amount (net amount after bank fee)
- SETTLE DATE
- TRANS DATE

**Record Count**: 60

**UTR Range**: UTR001 - UTR060

**Sample Records**:
```csv
MERCHANT_TRACKID,DOMESTIC AMT,Net Amount,SETTLE DATE,TRANS DATE
UTR001,1000.00,985.00,06-11-2025,06-11-2025
UTR002,1500.00,1477.50,06-11-2025,06-11-2025
UTR003,2000.00,1970.00,06-11-2025,06-11-2025
```

**Bank Fee Calculation**:
- Bank Fee = DOMESTIC AMT - Net Amount
- Example: UTR001 → ₹1,000.00 - ₹985.00 = ₹15.00 (1.5%)

---

### 3. BOB (Bank of Baroda) Statements
**Filename**: `test-bob-60-records-nov6.csv`

**Format**: CSV (comma-delimited)

**Columns**:
- Settlement Amount (gross amount)
- Net Amount (net amount after bank fee)
- Merchant Track ID (UTR)
- Payment Date
- Transaction Date
- Onus Indicator

**Record Count**: 60

**UTR Range**: UTR061 - UTR120

**Sample Records**:
```csv
Settlement Amount,Net Amount,Merchant Track ID,Payment Date,Transaction Date,Onus Indicator
30500.00,30042.50,UTR061,06/11/2025,06/11/2025,Y
31000.00,30535.00,UTR062,06/11/2025,06/11/2025,Y
31500.00,31027.50,UTR063,06/11/2025,06/11/2025,Y
```

**Bank Fee Calculation**:
- Bank Fee = Settlement Amount - Net Amount
- Example: UTR061 → ₹30,500.00 - ₹30,042.50 = ₹457.50 (1.5%)

---

### 4. AXIS Bank Statements
**Filename**: `test-axis-60-records-nov6.csv`

**Format**: CSV (tilde-delimited `~`)

**Columns**:
- GrossAmount (gross amount) ✨ **NEW**
- NetAmount (net amount after bank fee) ✨ **NEW**
- PRNNo (UTR)
- Date

**Record Count**: 60

**UTR Range**: UTR121 - UTR180

**Sample Records**:
```csv
GrossAmount~NetAmount~PRNNo~Date
60500.00~59592.50~UTR121~06/11/2025
61000.00~60085.00~UTR122~06/11/2025
61500.00~60577.50~UTR123~06/11/2025
```

**Bank Fee Calculation** ✨ **NOW SUPPORTED**:
- Bank Fee = GrossAmount - NetAmount
- Example: UTR121 → ₹60,500.00 - ₹59,592.50 = ₹907.50 (1.5%)

---

## Expected Reconciliation Results

### Overall Match Summary
```
Total PG Transactions:     180
Total Bank Transactions:   180 (60 HDFC + 60 BOB + 60 AXIS)
Expected Matches:          180 (100%)
Expected Exceptions:       0
```

### By Bank Breakdown

#### HDFC Bank (UTR001 - UTR060)
| Metric | Value |
|--------|-------|
| PG Transactions | 60 |
| Bank Statements | 60 |
| Matched | 60 (100%) |
| Exceptions | 0 |
| Bank Fees Calculable | ✅ Yes (60 txns) |

#### BOB Bank (UTR061 - UTR120)
| Metric | Value |
|--------|-------|
| PG Transactions | 60 |
| Bank Statements | 60 |
| Matched | 60 (100%) |
| Exceptions | 0 |
| Bank Fees Calculable | ✅ Yes (60 txns) |

#### AXIS Bank (UTR121 - UTR180)
| Metric | Value |
|--------|-------|
| PG Transactions | 60 |
| Bank Statements | 60 |
| Matched | 60 (100%) |
| Exceptions | 0 |
| Bank Fees Calculable | ✅ Yes (60 txns) ✨ **FIXED** |

---

## Financial Dashboard Expected Results

### Total Transaction Volume
```
Total Gross Amount:  ₹81,90,000.00
Total Net Amount:    ~₹80,46,300.00
Total Bank Fees:     ~₹1,43,700.00
```

### Bank Fee Breakdown by Bank

#### HDFC Bank Fees
```
Amount Range:        ₹1,000 - ₹30,500
Transaction Count:   60
Total Gross:         ₹9,30,000.00
Total Net:           ~₹9,15,450.00
Total Fees:          ~₹14,550.00
Average Fee:         ~₹242.50 per transaction
```

#### BOB Bank Fees
```
Amount Range:        ₹30,500 - ₹60,500
Transaction Count:   60
Total Gross:         ₹27,30,000.00
Total Net:           ~₹26,86,350.00
Total Fees:          ~₹43,650.00
Average Fee:         ~₹727.50 per transaction
```

#### AXIS Bank Fees ✨ **NOW CALCULABLE**
```
Amount Range:        ₹60,500 - ₹90,500
Transaction Count:   60
Total Gross:         ₹45,30,000.00
Total Net:           ~₹44,44,500.00
Total Fees:          ~₹85,500.00
Average Fee:         ~₹1,425.00 per transaction
```

### Fee Rate Distribution (All Banks)
| Payment Mode | Fee Rate | Distribution | Transaction Count |
|--------------|----------|--------------|-------------------|
| **UPI** | 1.5% | 60% | 108 transactions |
| **NETBANKING** | 1.8% | 20% | 36 transactions |
| **CARD** | 2.0% | 20% | 36 transactions |

---

## Database Schema Mapping

### V1 → V2 Column Mappings

#### HDFC Bank
```json
{
  "paid_amount": "DOMESTIC AMT",      → gross_amount_paise
  "payee_amount": "Net Amount",       → amount_paise
  "utr": "MERCHANT_TRACKID",          → utr
  "transaction_date": "TRANS DATE"    → transaction_date
}
```

**Bank Fee Calculation**:
```sql
bank_fee_paise = gross_amount_paise - amount_paise
```

#### BOB Bank
```json
{
  "paid_amount": "Settlement Amount",  → gross_amount_paise
  "payee_amount": "Net Amount",        → amount_paise
  "utr": "Merchant Track ID",          → utr
  "transaction_date": "Transaction Date" → transaction_date
}
```

**Bank Fee Calculation**:
```sql
bank_fee_paise = gross_amount_paise - amount_paise
```

#### AXIS Bank ✨ **UPDATED CONFIGURATION**
```json
{
  "paid_amount": "GrossAmount",        → gross_amount_paise
  "payee_amount": "NetAmount",         → amount_paise
  "utr": "PRNNo",                      → utr
  "transaction_date": "Date"           → transaction_date
}
```

**Bank Fee Calculation** ✨ **NOW WORKING**:
```sql
bank_fee_paise = gross_amount_paise - amount_paise
```

**Previous Configuration (BROKEN)**:
```json
{
  "paid_amount": "Amount",    → both mapped to same column
  "payee_amount": "Amount",   → gross_amount_paise = NULL
}
```

---

## Testing Workflow

### Step 1: Upload PG Transactions
1. Navigate to: **Recon Workspace** → **Manual Upload**
2. Select file: `test-pg-180-records-nov6.csv`
3. Source Type: **Payment Gateway**
4. Click **Upload**

**Expected Result**:
```
✅ 180 PG transactions uploaded successfully
✅ All mapped to sp_v2_transactions table
✅ Status: PENDING
```

### Step 2: Upload HDFC Bank Statements
1. Select file: `test-hdfc-60-records-nov6.csv`
2. Source Type: **Bank Statement**
3. Bank: **HDFC BANK**
4. Click **Upload**

**Expected Result**:
```
✅ 60 bank statements uploaded successfully
✅ All mapped with V1 → V2 transformation
✅ gross_amount_paise populated
✅ amount_paise populated
✅ bank_fee_paise calculated
```

### Step 3: Upload BOB Bank Statements
1. Select file: `test-bob-60-records-nov6.csv`
2. Source Type: **Bank Statement**
3. Bank: **BANK OF BARODA**
4. Click **Upload**

**Expected Result**:
```
✅ 60 bank statements uploaded successfully
✅ All mapped with V1 → V2 transformation
✅ gross_amount_paise populated
✅ amount_paise populated
✅ bank_fee_paise calculated
```

### Step 4: Upload AXIS Bank Statements
1. Select file: `test-axis-60-records-nov6.csv`
2. Source Type: **Bank Statement**
3. Bank: **AXIS BANK**
4. Click **Upload**

**Expected Result** ✨ **FIXED**:
```
✅ 60 bank statements uploaded successfully
✅ All mapped with V1 → V2 transformation
✅ gross_amount_paise populated (from GrossAmount column)
✅ amount_paise populated (from NetAmount column)
✅ bank_fee_paise calculated (gross - net)
```

### Step 5: Run Reconciliation
1. Click **Start New Reconciliation**
2. Wait for reconciliation to complete

**Expected Result**:
```
✅ 180/180 transactions matched (100%)
✅ 0 exceptions
✅ All bank fees calculated correctly
```

### Step 6: Verify Financial Dashboard
1. Navigate to: **Financial Dashboard**
2. Check the following metrics:

**Expected Metrics**:
```
Total Transaction Volume:    ₹81,90,000
Total Bank Fees:             ~₹1,43,700
HDFC Bank Fees:              ~₹14,550 (60 txns)
BOB Bank Fees:               ~₹43,650 (60 txns)
AXIS Bank Fees:              ~₹85,500 (60 txns) ✨ NOW VISIBLE
```

---

## Verification Queries

### Check AXIS Bank Fee Calculation
```sql
SELECT
  transaction_id,
  utr,
  source_type,
  bank_name,
  amount_paise / 100.0 as net_amount,
  gross_amount_paise / 100.0 as gross_amount,
  (gross_amount_paise - amount_paise) / 100.0 as bank_fee,
  CASE
    WHEN gross_amount_paise IS NULL THEN '❌ NOT CALCULABLE'
    WHEN gross_amount_paise = amount_paise THEN '⚠️  NO FEE'
    ELSE '✅ CALCULATED'
  END as fee_status
FROM sp_v2_transactions
WHERE bank_name = 'AXIS BANK'
  AND utr BETWEEN 'UTR121' AND 'UTR180'
ORDER BY utr;
```

**Expected Result**: All 60 AXIS transactions should show `✅ CALCULATED`

### Check All Bank Fees
```sql
SELECT
  bank_name,
  COUNT(*) as transaction_count,
  COUNT(CASE WHEN gross_amount_paise IS NOT NULL THEN 1 END) as with_gross,
  COUNT(CASE WHEN gross_amount_paise IS NOT NULL AND gross_amount_paise != amount_paise THEN 1 END) as with_fees,
  SUM((gross_amount_paise - amount_paise)) / 100.0 as total_bank_fees
FROM sp_v2_transactions
WHERE source_type = 'BANK'
  AND utr BETWEEN 'UTR001' AND 'UTR180'
GROUP BY bank_name
ORDER BY bank_name;
```

**Expected Result**:
```
bank_name     | transaction_count | with_gross | with_fees | total_bank_fees
--------------|-------------------|------------|-----------|----------------
AXIS BANK     | 60                | 60         | 60        | ~85,500
BANK OF BARODA| 60                | 60         | 60        | ~43,650
HDFC BANK     | 60                | 60         | 60        | ~14,550
```

---

## What Changed from Previous Version

### Before (AXIS Bank Issues)
```
❌ AXIS file structure: Amount~PRNNo~Date (3 columns)
❌ V1 config: Both paid_amount and payee_amount mapped to "Amount"
❌ Result: gross_amount_paise = NULL, bank fees = ₹0
❌ Financial Dashboard: Only 120/180 transactions showed bank fees
```

### After (AXIS Bank Fixed) ✨
```
✅ AXIS file structure: GrossAmount~NetAmount~PRNNo~Date (4 columns)
✅ V1 config: paid_amount → "GrossAmount", payee_amount → "NetAmount"
✅ Result: Both fields populated, bank fees calculated correctly
✅ Financial Dashboard: All 180/180 transactions show bank fees
```

---

## Troubleshooting

### Issue: AXIS Bank Fees Still Showing ₹0

**Check 1**: Verify V1 configuration in database
```sql
SELECT bank_name, v1_column_mappings
FROM sp_v2_bank_column_mappings
WHERE bank_name = 'AXIS BANK';
```

**Expected**:
```json
{
  "utr": "PRNNo",
  "paid_amount": "GrossAmount",
  "payee_amount": "NetAmount",
  "transaction_date": "Date"
}
```

**Check 2**: Verify test file structure
```bash
head -3 test-axis-60-records-nov6.csv
```

**Expected**:
```
GrossAmount~NetAmount~PRNNo~Date
60500.00~59592.50~UTR121~06/11/2025
61000.00~60085.00~UTR122~06/11/2025
```

**Check 3**: Verify database values after upload
```sql
SELECT utr, amount_paise, gross_amount_paise
FROM sp_v2_transactions
WHERE bank_name = 'AXIS BANK'
  AND utr = 'UTR121';
```

**Expected**:
```
utr    | amount_paise | gross_amount_paise
-------|--------------|-------------------
UTR121 | 5959250      | 6050000
```

---

## File Generation Details

**Generated on**: November 6, 2025
**Generated by**: generate-nov6-test-files.cjs script
**Configuration updated**: Production database (settlepaisa_v2)
**Table**: sp_v2_bank_column_mappings
**Updated row**: AXIS BANK

---

## Summary

✅ **All files ready for testing**
✅ **All banks support bank fee calculation**
✅ **100% match expected**
✅ **Complete financial metrics available**
✅ **AXIS BANK issue resolved**

**Total Impact**: Increased bank fee visibility from 66.7% (120/180) to 100% (180/180) transactions.
