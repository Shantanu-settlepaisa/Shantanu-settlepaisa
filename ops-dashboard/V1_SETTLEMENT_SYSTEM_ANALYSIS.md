# V1 Settlement System - Complete Analysis

**Date:** October 2, 2025  
**Database:** settlepaisa (V1 Staging)  
**Host:** 3.108.237.99:5432

---

## Executive Summary

V1 SettlePaisa uses a **transaction-centric settlement model** where settlement amounts are calculated and stored directly in the `transactions_to_settle` table, not in separate settlement batch tables. This is fundamentally different from V2's batch-centric approach.

**Key Finding:** V1 staging database has **ZERO data** in `transactions_to_settle`, so settlement amounts are calculated dynamically in production.

---

## V1 Database Tables (Actual Schema from Staging)

### 1. **transactions_to_settle** (Main Settlement Table)

**Purpose:** Stores all transaction data with settlement calculations embedded

**Key Settlement Columns:**
```sql
paid_amount                 DOUBLE PRECISION   -- Gross transaction amount
convcharges                 DOUBLE PRECISION   -- Convenience charges (MDR)
gst                        DOUBLE PRECISION   -- GST on commission
ep_charges                 DOUBLE PRECISION   -- Endpoint/PG charges
settlement_amount          DOUBLE PRECISION   -- Final settlement amount
settlement_status          VARCHAR(100)       -- Settlement status
settlement_date            TIMESTAMP          -- When settled
is_settled                 VARCHAR(10)        -- '1' or '0'
is_merchant_settled        VARCHAR(10)        -- Merchant settlement flag
is_bank_settled            VARCHAR(10)        -- Bank settlement flag
rolling_reserve_amount     NUMERIC            -- Reserve held
rolling_deductable_amount  NUMERIC            -- Reserve to deduct
subscription_charges       NUMERIC            -- Subscription fees
is_payout_done             VARCHAR(5)         -- Payout status
merchant_settlement_cycle  DATE               -- Settlement cycle date
```

**Settlement Calculation (from code analysis):**
```
settlement_amount = paid_amount - convcharges - gst - ep_charges - rolling_reserve_amount - subscription_charges
```

### 2. **rolling_reserve_ledger**

**Purpose:** Tracks rolling reserve hold and release per merchant

**Schema:**
```sql
id                          SERIAL PRIMARY KEY
merchant_settlement_amount  NUMERIC          -- Settlement amount for this cycle
rolling_reserve_date        DATE             -- Date reserve was held
percentage                  INTEGER          -- Reserve % (from merchant_data)
days_left                   INTEGER          -- Days until release
rolling_reserve_amount      NUMERIC          -- Amount held in reserve
deductable_amount           NUMERIC          -- Amount to deduct this cycle
merchant_payment            NUMERIC          -- Net payment after deductions
merchant_settlement_date    DATE             -- Settlement date
client_code                 VARCHAR(10)      -- Merchant identifier
is_rolling_reserve          BOOLEAN          -- Reserve active flag
is_subscription             BOOLEAN          -- Subscription fee flag
total_charges               NUMERIC          -- Total charges this cycle
pending_subscribe_amount    NUMERIC          -- Pending subscription balance
subscribe_paymode_id        VARCHAR(5)       -- Payment mode for subscription
subscription_ledger_date    DATE             -- Subscription ledger date
```

**Row Count:** 0 (staging database empty)

**Reserve Calculation Logic (from V1 code):**
```javascript
// From reports.transaction.js line 854
deductableAmount = (merchantSettlementAmount / 100) * rolling_percentage

// Reserve held for X days (no_of_days from merchant_data)
// After X days, reserve is released
```

### 3. **merchant_data** (Merchant Configuration)

**Purpose:** Stores merchant settlement configuration

**Settlement-Related Columns:**
```sql
clientcode                       VARCHAR(255)   -- Merchant identifier
clientname                       VARCHAR(255)   -- Merchant name
rolling_reserve                  BOOLEAN        -- Enable rolling reserve
rolling_percentage               DOUBLE PRECISION -- Reserve % (e.g., 4% or 100%)
no_of_days                       INTEGER        -- Reserve hold period (e.g., 30 days)
subscribe                        BOOLEAN        -- Subscription model enabled
subscribe_amount                 DOUBLE PRECISION -- Monthly subscription fee
referral_ep_charges_prcnt        NUMERIC        -- Referral endpoint charges %
referral_handling_charges_prcnt  NUMERIC        -- Referral handling charges %
sp_ep_charges_prcnt             NUMERIC        -- SabPaisa endpoint charges %
sp_handling_charges_prcnt       NUMERIC        -- SabPaisa handling charges %
merchant_settlement_cycle        INTEGER        -- Settlement cycle (1=T+1, 2=T+2)
```

**Sample Data:**
```json
{
  "clientcode": "KAPR63",
  "clientname": "Karthik Prabhu",
  "rolling_reserve": true,
  "rolling_percentage": 4,
  "no_of_days": 30,
  "subscribe": false,
  "merchant_settlement_cycle": 1
}
```

**Reserve Examples:**
- Normal merchant: 4% held for 30 days
- High-risk merchant: 100% held for 2 days (subscription model)

### 4. **merchant_base_rate** (Commission Configuration)

**Purpose:** Defines commission rates per merchant per payment mode per bank

**Schema:**
```sql
client_code             VARCHAR       -- Merchant identifier
paymodename             VARCHAR       -- Payment mode (Net Banking, UPI, etc.)
epname                  VARCHAR       -- Bank/endpoint name
slabnumber              VARCHAR       -- Tier/slab identifier
slabfloor               VARCHAR       -- Min amount for this tier
slabceiling             VARCHAR       -- Max amount for this tier
convcharges             VARCHAR       -- Convenience charge value
convchargestype         VARCHAR       -- fixed|percentage
endpointcharge          VARCHAR       -- Endpoint charge value
endpointchargestypes    VARCHAR       -- fixed|percentage
gst                     VARCHAR       -- GST % (18%)
gsttype                 VARCHAR       -- percentage
feeforward              VARCHAR       -- yes|no (fee bearer)
```

**Sample Data:**
```json
{
  "client_code": "SHSA82",
  "paymodename": "Net Banking",
  "epname": "State Bank of India",
  "slabfloor": "1",
  "slabceiling": "10000",
  "convcharges": "0",
  "convchargestype": "fixed",
  "endpointcharge": "2",
  "endpointchargestypes": "percentage",
  "gst": "18",
  "gsttype": "percentage",
  "feeforward": "no"
}
```

**Commission is 2% for SBI Net Banking transactions**

### 5. **fee_bearer** (Fee Bearer Configuration)

**Purpose:** Defines who pays the fees

**Schema:**
```sql
id       SERIAL PRIMARY KEY
name     VARCHAR(255)      -- Fee bearer name
code     VARCHAR(50)       -- Fee bearer code
status   BOOLEAN           -- Active status
```

**Data:**
```json
[
  { "id": 1, "name": "bank", "code": "1", "status": true },
  { "id": 2, "name": "merchant", "code": "2", "status": true },
  { "id": 3, "name": "payer", "code": "3", "status": true }
]
```

### 6. **merchant_fee_bearer** (Merchant-Specific Fee Bearer)

**Purpose:** Maps merchants to fee bearer configuration

**Schema:**
```sql
id              SERIAL PRIMARY KEY
merchant_id     INTEGER          -- Merchant ID
mode_id         VARCHAR(5)       -- Payment mode ID
fee_bearer_id   VARCHAR(50)      -- Fee bearer code (1=bank, 2=merchant, 3=payer)
```

**Row Count:** 91,884 records (active configurations)

### 7. **client_fee_bearer** (Daily Fee Bearer Summary)

**Purpose:** Stores daily fee bearer totals per merchant per mode

**Schema:**
```sql
id              SERIAL PRIMARY KEY
client_code     VARCHAR(10)      -- Merchant code
trans_date      DATE             -- Transaction date
paymode_id      VARCHAR(5)       -- Payment mode
fee_bearer_id   VARCHAR(10)      -- Fee bearer code
total_amount    NUMERIC          -- Total fee amount
referral_id     INTEGER          -- Referral partner ID
```

**Row Count:** 0 (staging empty)

---

## V1 Settlement Calculation Logic (From Code)

### Settlement Formula (from `reports.transaction.js`)

```javascript
// Line 1402-1411: Get total settlement amount
SELECT 
  client_code, 
  COALESCE(SUM(settlement_amount), 0) AS total_settlement_amount,
  COALESCE(SUM(rolling_reserve_amount), 0) AS rolling_reserve_amount,
  COALESCE(SUM(rolling_deductable_amount), 0) AS rolling_deductable_amount
FROM transactions_to_settle 
WHERE CAST(trans_date AS DATE) BETWEEN $1 AND $2 
  AND is_merchant_settled = $3
  AND is_payout_done IS NULL
GROUP BY client_code
```

### Payout Calculation (from `reports.transaction.js` line 1488-1498)

```javascript
// Get base settlement amount
const totalSettlementAmount = responseData[i].total_settlement_amount;

// Deduct refunds
const refundAmount = await pool.query(
  'SELECT COALESCE(SUM(refund_transaction_amount), 0) FROM transactions_to_settle WHERE client_code=$1 AND is_payout_done IS NULL'
);

// Deduct rolling reserve
const rollingDeductable = responseData[i].rolling_deductable_amount;

// Deduct chargeback processing fees
const chargebackFees = await pool.query(
  'SELECT COALESCE(SUM(chargeback_processing_fee), 0) FROM transactions_to_settle WHERE client_code=$1 AND is_payout_done IS NULL'
);

// Final payout
payoutAmount = totalSettlementAmount - refundAmount - rollingDeductable - chargebackFees;
```

### Rolling Reserve Logic (from `reports.transaction.js` line 751-959)

```javascript
// Step 1: Check if merchant has rolling reserve enabled
const clientData = await pool.query(
  'SELECT rolling_reserve, rolling_percentage, no_of_days FROM merchant_data WHERE clientcode=$1',
  [client_code]
);

if (clientData.rows[0].rolling_reserve === true) {
  // Step 2: Check existing reserve ledger for this settlement date
  const rollingReserveData = await pool.query(
    'SELECT * FROM rolling_reserve_ledger WHERE client_code=$1 AND merchant_settlement_date=$2'
  );
  
  if (rollingReserveData.rows.length === 0) {
    // Step 3: Create new reserve entry
    merchantSettlementAmount = settlement_amount;
    deductableAmount = (merchantSettlementAmount / 100) * rolling_percentage;
    merchantPayment = merchantSettlementAmount - deductableAmount;
    
    await pool.query(`
      INSERT INTO rolling_reserve_ledger (
        merchant_settlement_amount, 
        percentage, 
        days_left, 
        rolling_reserve_amount, 
        deductable_amount, 
        merchant_payment, 
        merchant_settlement_date, 
        client_code, 
        is_rolling_reserve
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `);
  } else {
    // Step 4: Update existing reserve entry
    merchantSettlementAmount = 
      rollingReserveData.rows[0].merchant_settlement_amount + settlement_amount;
    deductableAmount = (merchantSettlementAmount / 100) * rolling_percentage;
    merchantPayment = merchantSettlementAmount - deductableAmount;
    
    await pool.query(
      'UPDATE rolling_reserve_ledger SET merchant_settlement_amount=$1, deductable_amount=$2, merchant_payment=$3 WHERE id=$4'
    );
  }
  
  // Step 5: Mark transaction with reserve deduction
  await pool.query(
    'UPDATE transactions_to_settle SET is_rolling_reserve=$1, rolling_deductable_amount=$2 WHERE id=$3',
    [true, singleTransactionDeduction, transaction_id]
  );
}
```

---

## V1 Finance Reports & MIS

### 1. **Settlement Summary Report**

**API Endpoint:** `GET /reports/get_payout`

**Data Source:** `transactions_to_settle` table

**SQL Query:**
```sql
SELECT 
  client_code,
  COALESCE(SUM(settlement_amount), 0) AS total_settlement_amount,
  COALESCE(SUM(rolling_reserve_amount), 0) AS rolling_reserve_amount,
  COALESCE(SUM(rolling_deductable_amount), 0) AS rolling_deductable_amount
FROM transactions_to_settle 
WHERE CAST(trans_date AS DATE) BETWEEN $1 AND $2 
  AND is_merchant_settled = $3
  AND is_payout_done IS NULL
GROUP BY client_code
```

**Report Fields:**
- `client_code` - Merchant identifier
- `total_settlement_amount` - Total to settle
- `rolling_reserve_amount` - Total reserve held
- `rolling_deductable_amount` - Total reserve to deduct
- `payout_after_deduction` - Final payout amount

### 2. **Bank MIS Report**

**API Endpoint:** `GET /reports/net_banking_commision_report_details`

**Data Source:** `transactions_to_settle` + `merchant_data` + `business_type`

**SQL Query:**
```sql
SELECT 
  transactions_to_settle.transaction_id as "Sabpaisa Txn ID",
  transactions_to_settle.trans_date as "Transaction Date",
  md.clientname as "Merchant Name",
  bt.business_name as "Merchant Type",
  transactions_to_settle.payment_mode as "Channel Type",
  transactions_to_settle.pg_pay_mode as "Bank Name",
  transactions_to_settle.payee_amount as "Gross Amount",
  transactions_to_settle.bank_commission_share as "Bank Commission Excluding GST",
  transactions_to_settle.bank_commission_gst as "Bank GST (18%)"
FROM transactions_to_settle 
INNER JOIN merchant_data as md ON md.clientcode = transactions_to_settle.client_code 
INNER JOIN business_type as bt ON bt.code = transactions_to_settle.business_category 
WHERE is_settled = '1'
```

### 3. **Rolling Reserve Report**

**API Endpoint:** `GET /reports/get_rolling_reserve_data`

**Data Source:** `rolling_reserve_ledger`

**SQL Query:**
```sql
SELECT 
  client_code,
  deductable_amount,
  merchant_settlement_amount,
  percentage,
  rolling_reserve_amount,
  merchant_settlement_date,
  rolling_reserve_date 
FROM rolling_reserve_ledger 
WHERE merchant_settlement_date BETWEEN $1 AND $2
ORDER BY merchant_settlement_date
```

### 4. **Fee Bearer Report**

**API Endpoint:** `GET /reports/get_fee_bearer_data`

**Data Source:** `client_fee_bearer` + `merchant_data` + `fee_bearer`

**SQL Query:**
```sql
SELECT 
  cfb.*, 
  pm.service_name, 
  fb.name as fee_bearer_name, 
  md.name
FROM public.client_fee_bearer cfb
INNER JOIN service_type pm ON cfb.paymode_id = pm.code
INNER JOIN fee_bearer fb ON cfb.fee_bearer_id = fb.code
LEFT JOIN merchant_data md ON cfb.referral_id = md.loginmasterid
WHERE trans_date BETWEEN $1 AND $2
```

---

## V1 vs V2 Comparison

### **Schema Architecture**

| Aspect | V1 | V2 |
|--------|----|----|
| **Settlement Model** | Transaction-centric (fields in transactions_to_settle) | Batch-centric (separate sp_v2_settlement_batches table) |
| **Commission Config** | `merchant_base_rate` (per merchant, per bank, per mode) | Hardcoded 2% MDR in calculator |
| **Reserve Config** | `rolling_percentage` + `no_of_days` in `merchant_data` | `rolling_reserve_percentage` in sp_v2_merchant_settlement_config |
| **Fee Bearer** | 3 tables: `fee_bearer` + `merchant_fee_bearer` + `client_fee_bearer` | Not implemented |
| **TDS Calculation** | Stored in `transactions_to_settle` | Not calculated (shows 0 in reports) |
| **Settlement Cycles** | T+1, T+2 configurable per merchant | Only daily (hardcoded) |

### **Settlement Calculation**

| Component | V1 Formula | V2 Formula |
|-----------|-----------|-----------|
| **Commission** | `merchant_base_rate` lookup (varies by merchant/bank) | Flat 2% |
| **GST** | 18% on commission | 18% on commission |
| **TDS** | Calculated (stored in `transactions_to_settle`) | Not calculated (0) |
| **Reserve** | `(amount / 100) * rolling_percentage` | `(amount / 100) * rolling_reserve_percentage` |
| **Net Settlement** | `amount - commission - gst - reserve - subscription - refunds - chargebacks` | `amount - commission - gst - reserve` |

### **Tables Present in V1 but Missing in V2**

1. ✅ `merchant_base_rate` - Per-merchant, per-bank commission rates
2. ✅ `fee_bearer` - Fee bearer types (bank/merchant/payer)
3. ✅ `merchant_fee_bearer` - Merchant fee bearer mapping (91K records)
4. ✅ `client_fee_bearer` - Daily fee bearer summary
5. ❌ `settlement_batches` - **Does not exist in V1 staging**
6. ❌ `commission_tiers` - **Does not exist in V1 staging**
7. ❌ `tax_config` - **Does not exist in V1 staging**

### **Tables Present in V2 but Missing in V1**

1. ✅ `sp_v2_settlement_batches` - Batch-level settlement records
2. ✅ `sp_v2_settlement_items` - Transaction-level settlement breakdown
3. ✅ `sp_v2_settlement_schedule_runs` - Scheduler audit trail
4. ✅ `sp_v2_settlement_approvals` - Multi-level approval workflow
5. ✅ `sp_v2_bank_transfer_queue` - NEFT/RTGS/IMPS queue
6. ✅ `sp_v2_settlement_errors` - Error tracking

---

## Key Findings

### 1. **V1 Uses Transaction-Level Settlement**
- Settlement amount is calculated and stored in `transactions_to_settle.settlement_amount`
- No separate settlement batch table
- Reports query `transactions_to_settle` directly

### 2. **V1 Has Sophisticated Commission Configuration**
- `merchant_base_rate` has **per-merchant, per-bank, per-payment-mode** commission rates
- Example: Merchant SHSA82 pays 2% for SBI Net Banking
- V2 uses flat 2% for all merchants/modes

### 3. **V1 Has Active Fee Bearer Management**
- 91,884 merchant fee bearer configurations
- Supports bank/merchant/payer fee models
- V2 doesn't have this feature

### 4. **V1 Staging Database is Empty**
- `transactions_to_settle`: 0 rows
- `rolling_reserve_ledger`: 0 rows
- `client_fee_bearer`: 0 rows
- This is a **staging environment**, not production

### 5. **V1 Missing Advanced Tables Found in Documentation**
The earlier documentation mentioned `commission_tiers`, `tax_config`, `reserve_config` tables, but these **DO NOT EXIST** in the actual V1 staging database.

---

## Recommendations for V2

### Immediate Actions (To Match V1 Functionality)

1. **Add Merchant Base Rate Table**
   ```sql
   CREATE TABLE sp_v2_merchant_commission_config (
     merchant_id VARCHAR(50),
     payment_mode VARCHAR(50),
     bank_code VARCHAR(50),
     commission_percentage DECIMAL(5,2),
     commission_type VARCHAR(20), -- fixed|percentage
     gst_percentage DECIMAL(5,2) DEFAULT 18.0
   );
   ```

2. **Add Fee Bearer Support**
   ```sql
   CREATE TABLE sp_v2_fee_bearer_config (
     merchant_id VARCHAR(50),
     payment_mode VARCHAR(50),
     fee_bearer VARCHAR(20) -- bank|merchant|payer
   );
   ```

3. **Update Settlement Calculator**
   - Replace hardcoded 2% with `merchant_commission_config` lookup
   - Add fee bearer logic
   - Calculate TDS (currently showing 0)

4. **Add Settlement Cycle Configuration**
   - Support T+1, T+2, custom cycles (currently only daily)
   - Add `settlement_cycle` field to `sp_v2_merchant_settlement_config`

### Future Enhancements (V2-Specific Features)

1. ✅ Keep `sp_v2_settlement_batches` (better than V1's transaction-level approach)
2. ✅ Keep `sp_v2_settlement_approvals` (V1 doesn't have this)
3. ✅ Keep `sp_v2_bank_transfer_queue` (V1 doesn't have this)
4. ✅ Keep scheduler automation (V1 doesn't have this)

---

## Conclusion

**V1 Settlement System:**
- Transaction-centric storage model
- Sophisticated commission configuration (per merchant, per bank)
- Active fee bearer management
- No batch-level settlement tracking
- No automated scheduler
- No approval workflow

**V2 Settlement System:**
- Batch-centric storage model (better for auditing)
- Simplified commission (flat 2%)
- No fee bearer support
- Automated scheduler with cron
- Multi-level approval workflow
- Bank transfer queue

**V2 is more automated but less sophisticated in commission/fee configuration. To achieve V1 parity, V2 needs merchant-specific commission rates and fee bearer support.**

---

**Analysis Date:** October 2, 2025  
**Analyzed By:** Claude (Settlement System Investigation)
