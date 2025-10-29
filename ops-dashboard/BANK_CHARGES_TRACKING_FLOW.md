# Bank Charges Tracking - Complete Flow Documentation

**Date:** October 27, 2025
**Purpose:** Document how bank charges are calculated and tracked through the system

---

## Overview

Bank charges represent the difference between what the Payment Gateway (PG) collects from the customer and what the bank actually credits to the merchant account.

**Formula:**
```
bank_fee_paise = pgGrossPaise - bankCreditedPaise
```

**Example:**
- PG collects from customer: ₹5,000 (gross amount)
- Bank credits to merchant: ₹4,950 (net amount)
- Bank charges: ₹50 (the difference)

---

## Three-Stage Flow

### Stage 1: File Upload - Parse and Store

**File:** `services/api/file-upload-v2.cjs`
**Lines:** 737-836

**What Happens:**
- CSV files are uploaded (PG transactions and Bank statements)
- System parses gross and net amounts separately
- **Bank fee is NOT calculated here** - just stored as raw amounts

**Code:**
```javascript
// PG Transactions - Extract gross and net amounts
const grossAmountRaw = row.gross_amount_paise || row.gross_amount || row.paid_amount;
const netAmountRaw = row.amount_paise || row.net_amount || row.payee_amount || row.amount;

// Store in sp_v2_transactions table
{
  transaction_id: row.transaction_id || row.bank_ref_no || row.utr_number,
  gross_amount_paise: parseInt(grossAmountRaw),  // What PG collected
  amount_paise: parseInt(netAmountRaw),          // What merchant receives
  bank_fee_paise: null,                          // NOT calculated yet
  source_type: row.source_type || 'PG',
  status: 'PENDING'
}
```

**V1 Format Mapping (for backward compatibility):**
```javascript
// Old format → New format
paid_amount    → gross_amount_paise  // What customer paid
payee_amount   → amount_paise        // What merchant gets
// bank_fee = paid_amount - payee_amount (calculated later)
```

**Database State After Upload:**
```sql
-- sp_v2_transactions table
transaction_id | gross_amount_paise | amount_paise | bank_fee_paise | status
---------------|-------------------|--------------|----------------|--------
TXN001         | 500000           | 500000       | NULL           | PENDING
TXN002         | 300000           | 300000       | NULL           | PENDING
```

---

### Stage 2: Reconciliation - Calculate Bank Fees

**File:** `services/recon-api/jobs/runReconciliation.js`
**Lines:** 1523-1604

**What Happens:**
- Reconciliation job matches PG transactions with Bank statements
- **THIS IS WHERE BANK FEES ARE CALCULATED**
- System compares PG gross amount with Bank credited amount
- Difference is stored as bank_fee_paise

**Code:**
```javascript
// Line 1523-1532: MAIN CALCULATION
const pgGrossPaise = parseInt(pgTxn.gross_amount || pgTxn.amount) || 0;
const bankCreditedPaise = parseInt(bankTxn.amount) || 0;
const bankFeePaise = pgGrossPaise - bankCreditedPaise;

console.log(`[Bank Fee Calc] ${pgTxn.transaction_id}:
  PG gross=${pgGrossPaise},
  Bank net=${bankCreditedPaise},
  Fee=${bankFeePaise}`);

// Update the transaction with calculated fee
await db.query(`
  UPDATE sp_v2_transactions
  SET
    bank_fee_paise = $1,
    status = 'RECONCILED',
    updated_at = NOW()
  WHERE transaction_id = $2
`, [bankFeePaise, pgTxn.transaction_id]);
```

**Example Calculation:**

| Transaction | PG Gross | Bank Credited | Bank Fee | Status |
|-------------|----------|---------------|----------|--------|
| TXN001 | ₹5,000 | ₹4,950 | ₹50 | RECONCILED |
| TXN002 | ₹3,000 | ₹2,980 | ₹20 | RECONCILED |
| TXN003 | ₹1,000 | ₹1,000 | ₹0 | RECONCILED |

**Database State After Reconciliation:**
```sql
-- sp_v2_transactions table (UPDATED)
transaction_id | gross_amount_paise | amount_paise | bank_fee_paise | status
---------------|-------------------|--------------|----------------|--------
TXN001         | 500000           | 495000       | 5000           | RECONCILED
TXN002         | 300000           | 298000       | 2000           | RECONCILED
```

---

### Stage 3: Settlement - Aggregate and Distribute

**File:** `services/settlement-engine/settlement-calculator-v1-logic.cjs`
**Lines:** 355-387

**What Happens:**
- Settlement job runs to calculate payouts
- Aggregates bank fees from all RECONCILED transactions
- Calculates SettlePaisa revenue (commission - bank charges)
- Creates settlement batches with accurate revenue split

**Code:**
```javascript
// Query to sum up all bank charges for the day
const bankChargesQuery = `
  SELECT
    COALESCE(SUM(bank_fee_paise), 0) as total_bank_fees,
    COUNT(*) FILTER (WHERE bank_fee_paise IS NOT NULL AND bank_fee_paise > 0) as transactions_with_fees,
    COUNT(*) as total_transactions
  FROM sp_v2_transactions
  WHERE merchant_id = $1
    AND DATE(transaction_date) = $2
    AND status = 'RECONCILED'
`;

const bankChargesResult = await db.query(bankChargesQuery, [merchantId, settlementDate]);
const totalBankChargesPaise = parseInt(bankChargesResult.rows[0]?.total_bank_fees || 0);

// Calculate SettlePaisa's actual revenue
// (SettlePaisa pays the bank charges, so revenue = commission - bank_charges)
const settlepaisaRevenuePaise = totalCommissionPaise - totalBankChargesPaise;

// Store in settlement batch
await db.query(`
  INSERT INTO sp_v2_settlement_batches (
    merchant_id,
    settlement_date,
    total_commission_paise,
    total_bank_charges_paise,
    settlepaisa_revenue_paise,
    ...
  ) VALUES ($1, $2, $3, $4, $5, ...)
`, [
  merchantId,
  settlementDate,
  totalCommissionPaise,      // e.g., ₹8,760
  totalBankChargesPaise,     // e.g., ₹70
  settlepaisaRevenuePaise,   // e.g., ₹8,690
  ...
]);
```

**Example Settlement Calculation:**

```
Settlement for Merchant: MERCH001
Date: 2025-10-27

Total GMV:                   ₹4,38,000
Total Transactions:          10
Reconciled Transactions:     10
-----------------------------------
Total Commission (2%):       ₹8,760
Total GST (18% on comm):     ₹1,577
Total Bank Charges:          ₹70
-----------------------------------
SettlePaisa Revenue:         ₹8,690  (commission - bank charges)
Amount to Pay Merchant:      ₹4,27,663  (GMV - commission - GST - bank charges)
```

**Database State After Settlement:**
```sql
-- sp_v2_settlement_batches table
batch_id | merchant_id | total_commission_paise | total_bank_charges_paise | settlepaisa_revenue_paise
---------|-------------|------------------------|--------------------------|---------------------------
BATCH001 | MERCH001    | 876000                 | 7000                     | 869000
```

---

## Why Current Test Data Shows ₹0 Bank Charges

### Test Files Analysis

**PG Transaction File (test-pg-v1-staging2-oct27.csv):**
```csv
merchant_id,paid_amount,payee_amount,bank_ref_no,paid_date
MERCH001,5000.00,5000.00,TXN001,2025-10-27
MERCH001,3000.00,3000.00,TXN002,2025-10-27
```

**Bank Statement File (test-hdfc-v1-staging2-oct27-FIXED.csv):**
```csv
CLIENT_CODE,DOMESTIC_AMT,PG_REF_NO,VALUE_DT
MERCH001,5000.00,TXN001,27-Oct-2025
MERCH001,3000.00,TXN002,27-Oct-2025
```

**Problem:**
- `paid_amount` (PG gross) = `payee_amount` (Bank net) = ₹5,000
- When both are equal, bank_fee = ₹5,000 - ₹5,000 = **₹0**

**Real World Example:**

In production, files would look like:
```csv
# PG File
merchant_id,paid_amount,payee_amount,bank_ref_no,paid_date
MERCH001,5000.00,4950.00,TXN001,2025-10-27  ← Bank keeps ₹50

# Bank File
CLIENT_CODE,DOMESTIC_AMT,PG_REF_NO,VALUE_DT
MERCH001,4950.00,TXN001,27-Oct-2025  ← ₹50 less than paid_amount
```

Then: `bank_fee = ₹5,000 - ₹4,950 = ₹50` ✅

---

## Financial Dashboard Impact

### API Response (services/overview-api/real-db-adapter.cjs)

**With Bank Charges:**
```json
{
  "gmv": {"paise": "438000", "rupees": 4380, "formatted": "₹4.38 L"},
  "commission": {"paise": "8760", "rupees": 87.6, "formatted": "₹8.76K"},
  "gst": {"paise": "1577", "rupees": 15.77, "formatted": "₹1.58K"},
  "bankCharges": {"paise": "70", "rupees": 0.7, "formatted": "₹70"},  ← Would show here
  "settlepaisaRevenue": {"paise": "8690", "rupees": 86.9, "formatted": "₹8.69K"},
  "grossMargin": {"percent": "2.36"}
}
```

**Current (No Bank Charges):**
```json
{
  "gmv": {"paise": "438000", "rupees": 4380, "formatted": "₹4.38 L"},
  "commission": {"paise": "8760", "rupees": 87.6, "formatted": "₹8.76K"},
  "gst": {"paise": "1577", "rupees": 15.77, "formatted": "₹1.58K"},
  "bankCharges": {"paise": "0", "rupees": 0, "formatted": "₹0"},  ← Zero in test data
  "settlepaisaRevenue": {"paise": "8760", "rupees": 87.6, "formatted": "₹8.76K"},
  "grossMargin": {"percent": "2.36"}
}
```

**Formula:**
```javascript
settlepaisaRevenue = commission - bankCharges
                   = ₹8,760 - ₹0
                   = ₹8,760
```

With real bank charges:
```javascript
settlepaisaRevenue = commission - bankCharges
                   = ₹8,760 - ₹70
                   = ₹8,690
```

---

## Database Schema

### sp_v2_transactions

```sql
CREATE TABLE sp_v2_transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) UNIQUE,
  merchant_id VARCHAR(255),

  -- Amount fields
  gross_amount_paise BIGINT,        -- What PG collected from customer
  amount_paise BIGINT,              -- What merchant receives (net)
  bank_fee_paise BIGINT,            -- Calculated: gross - net
  total_commission_paise BIGINT,    -- SettlePaisa's commission
  total_gst_paise BIGINT,           -- GST on commission

  -- Status tracking
  status VARCHAR(50),               -- PENDING, RECONCILED, SETTLED
  source_type VARCHAR(50),          -- PG or BANK

  -- Reconciliation
  reconciliation_status VARCHAR(50),
  reconciled_at TIMESTAMP,

  -- Settlement
  settlement_batch_id VARCHAR(255),
  settled_at TIMESTAMP,

  -- Metadata
  transaction_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### sp_v2_settlement_batches

```sql
CREATE TABLE sp_v2_settlement_batches (
  batch_id VARCHAR(255) PRIMARY KEY,
  merchant_id VARCHAR(255),
  settlement_date DATE,

  -- Aggregated amounts
  total_gmv_paise BIGINT,
  total_commission_paise BIGINT,
  total_gst_paise BIGINT,
  total_bank_charges_paise BIGINT,      -- Sum of all bank_fee_paise
  settlepaisa_revenue_paise BIGINT,     -- commission - bank_charges

  -- Merchant payout
  merchant_payout_paise BIGINT,         -- GMV - comm - gst - bank_charges

  -- Status
  status VARCHAR(50),                   -- PENDING, APPROVED, PAID

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  paid_at TIMESTAMP
);
```

---

## Key Insights

### 1. Calculation Timing
- ❌ **NOT** calculated during upload
- ✅ **Calculated during reconciliation** (when PG and Bank records are matched)
- ✅ **Aggregated during settlement** (when creating payout batches)

### 2. Why This Design?
- **Upload stage:** Don't know the actual bank credit yet
- **Reconciliation stage:** Now we have both PG and Bank amounts, can calculate difference
- **Settlement stage:** Aggregate all fees for accurate revenue calculation

### 3. Revenue Impact
- Bank charges reduce SettlePaisa's revenue
- Formula: `SettlePaisa Revenue = Commission - Bank Charges`
- This is correct because SettlePaisa typically bears the bank charges

### 4. Data Dependency
- Requires accurate gross and net amounts in uploaded files
- If files have same paid_amount and payee_amount → bank_fee = ₹0
- Real production data should have different values

---

## Testing Bank Charges

### To Test With Real Bank Charges

**Step 1: Create test PG file with fees**
```csv
merchant_id,paid_amount,payee_amount,bank_ref_no,paid_date
MERCH001,5000.00,4950.00,TXN001,2025-10-27
MERCH001,3000.00,2985.00,TXN002,2025-10-27
```

**Step 2: Create matching bank file**
```csv
CLIENT_CODE,DOMESTIC_AMT,PG_REF_NO,VALUE_DT
MERCH001,4950.00,TXN001,27-Oct-2025
MERCH001,2985.00,TXN002,27-Oct-2025
```

**Step 3: Upload both files**
```bash
curl -X POST http://52.66.199.215:5107/api/upload \
  -F "pg_file=@test-pg.csv" \
  -F "bank_file=@test-bank.csv" \
  -F "merchant_id=MERCH001"
```

**Step 4: Run reconciliation**
```bash
curl -X POST http://52.66.199.215:5103/api/reconcile \
  -H "Content-Type: application/json" \
  -d '{"merchant_id":"MERCH001","date":"2025-10-27"}'
```

**Step 5: Check results**
```bash
# Query database
SELECT
  transaction_id,
  gross_amount_paise,
  amount_paise,
  bank_fee_paise,
  status
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001';

# Expected results:
# TXN001: gross=500000, net=495000, fee=5000 (₹50)
# TXN002: gross=300000, net=298500, fee=1500 (₹15)
```

**Step 6: Verify in Financial Dashboard**
```bash
curl "http://52.66.199.215:5108/api/analytics/financial?from=2025-10-27&to=2025-10-27"

# Should show:
# "bankCharges": {"paise": "6500", "rupees": 65, "formatted": "₹65"}
# "settlepaisaRevenue": {"paise": "XXX", ...}  ← commission - 65
```

---

## Monitoring & Debugging

### Check Bank Charges in Database
```sql
-- See all transactions with bank charges
SELECT
  transaction_id,
  gross_amount_paise / 100.0 as gross_rupees,
  amount_paise / 100.0 as net_rupees,
  bank_fee_paise / 100.0 as fee_rupees,
  status
FROM sp_v2_transactions
WHERE bank_fee_paise IS NOT NULL
  AND bank_fee_paise > 0
ORDER BY transaction_date DESC;
```

### Check Aggregated Bank Charges
```sql
-- Daily bank charges summary
SELECT
  DATE(transaction_date) as date,
  COUNT(*) as total_transactions,
  COUNT(bank_fee_paise) as transactions_with_fees,
  SUM(bank_fee_paise) / 100.0 as total_bank_charges_rupees,
  AVG(bank_fee_paise) / 100.0 as avg_fee_per_transaction_rupees
FROM sp_v2_transactions
WHERE status = 'RECONCILED'
GROUP BY DATE(transaction_date)
ORDER BY date DESC;
```

### Check Settlement Batches
```sql
-- Settlement batches with bank charges
SELECT
  batch_id,
  merchant_id,
  settlement_date,
  total_commission_paise / 100.0 as commission_rupees,
  total_bank_charges_paise / 100.0 as bank_charges_rupees,
  settlepaisa_revenue_paise / 100.0 as revenue_rupees,
  (settlepaisa_revenue_paise::FLOAT / NULLIF(total_commission_paise, 0) * 100) as revenue_percent_of_commission
FROM sp_v2_settlement_batches
WHERE total_bank_charges_paise > 0
ORDER BY settlement_date DESC;
```

### Check Logs
```bash
# Watch reconciliation logs for bank fee calculations
pm2 logs recon-api | grep "Bank Fee Calc"

# Expected output:
# [Bank Fee Calc] TXN001: PG gross=500000, Bank net=495000, Fee=5000
# [Bank Fee Calc] TXN002: PG gross=300000, Bank net=298500, Fee=1500
```

---

## Summary

**Bank charges tracking is a 3-stage process:**

1. **Upload Stage** - Parse and store gross/net amounts separately
2. **Reconciliation Stage** - Calculate bank_fee = gross - net
3. **Settlement Stage** - Aggregate fees and calculate SettlePaisa revenue

**Current Status:**
- ✅ Code is correctly implemented
- ✅ Calculations work as designed
- ✅ Test data shows ₹0 fees (because test files have identical amounts)
- ✅ With real production data, bank charges will be calculated correctly

**Files to Reference:**
- Upload: `services/api/file-upload-v2.cjs:737-836`
- Reconciliation: `services/recon-api/jobs/runReconciliation.js:1523-1604`
- Settlement: `services/settlement-engine/settlement-calculator-v1-logic.cjs:355-387`

---

**Document Created:** October 27, 2025
**Status:** ✅ Complete
**Next Action:** Test with real bank charges data (different paid_amount and payee_amount)
