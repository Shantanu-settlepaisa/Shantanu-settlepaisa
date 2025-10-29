# Complete Flow: Reconciliation → Settlement Batch Creation

**Date:** October 27, 2025
**Purpose:** Document the complete automated flow from reconciliation to settlement batch creation
**Status:** ✅ **PRODUCTION READY** - This is how the system currently works

---

## Executive Summary

**Current Status:**
- ✅ Reconciliation automatically triggers settlement batch creation
- ✅ Settlement batches created per merchant per cycle_date
- ✅ **NO PAYOUTS** - System creates accurate settlement files ready for manual export
- ✅ Duplicate prevention built-in
- ✅ Refunds, chargebacks, bank charges all tracked

**Key Databases:**
1. **SabPaisa Production DB** (sabpaisa) - Merchant config, MDR rates, fee bearer
2. **SettlePaisa V2 DB** (settlepaisa_v2) - Transactions, reconciliation, settlements

---

## 🔄 Complete Flow (10 Steps)

### Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RECONCILIATION TO SETTLEMENT FLOW                   │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: FILE UPLOAD
┌─────────────────┐
│  CSV Files      │  PG transactions + Bank statements
│  Uploaded       │  via Upload API (port 5107)
└────────┬────────┘
         │
         v
┌─────────────────────────────────────────────────────────────┐
│  sp_v2_transactions                                         │
│  ┌──────────────────────────────────────────────────┐     │
│  │ transaction_id | merchant_id | amount_paise     │     │
│  │ TXN001         | MERCH001    | 500000           │     │
│  │ status: PENDING                                   │     │
│  │ source_type: PG                                   │     │
│  └──────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘

STEP 2: RECONCILIATION TRIGGERED
┌─────────────────┐
│  Recon API      │  POST /recon/run
│  (port 5103)    │  {date: "2025-10-27", merchantId: "MERCH001"}
└────────┬────────┘
         │
         v
┌─────────────────────────────────────────────────────────────┐
│  runReconciliation.js                                       │
│  - Fetch PG transactions (status=PENDING)                   │
│  - Fetch Bank statements                                     │
│  - Match by UTR/amount/date                                  │
│  - Calculate bank_fee_paise = gross - net                   │
└────────┬────────────────────────────────────────────────────┘
         │
         v
STEP 3: UPDATE TRANSACTION STATUS → RECONCILED
┌─────────────────────────────────────────────────────────────┐
│  UPDATE sp_v2_transactions                                  │
│  SET status = 'RECONCILED',                                 │
│      bank_fee_paise = 5000,                                 │
│      reconciled_at = NOW()                                  │
│  WHERE transaction_id = 'TXN001'                            │
└────────┬────────────────────────────────────────────────────┘
         │
         │ 🔔 DATABASE TRIGGER FIRES! 🔔
         │ trg_transaction_status_change
         v
STEP 4: AUTO-QUEUE FOR SETTLEMENT (TRIGGER)
┌─────────────────────────────────────────────────────────────┐
│  fn_transaction_status_change()                             │
│  - Detects status change: PENDING → RECONCILED              │
│  - Inserts into sp_v2_settlement_queue                      │
│  - Sends pg_notify('settlement_queue', {...})               │
└────────┬────────────────────────────────────────────────────┘
         │
         v
┌─────────────────────────────────────────────────────────────┐
│  sp_v2_settlement_queue                                     │
│  ┌──────────────────────────────────────────────────┐     │
│  │ transaction_id | merchant_id | amount_paise     │     │
│  │ TXN001         | MERCH001    | 500000           │     │
│  │ status: PENDING                                   │     │
│  │ queued_at: 2025-10-27 10:00:00                   │     │
│  └──────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘

STEP 5: SETTLEMENT PROCESSOR RECEIVES NOTIFICATION
┌─────────────────────────────────────────────────────────────┐
│  settlement-queue-processor.cjs                             │
│  - Listening to pg_notify('settlement_queue')               │
│  - Receives notification: {transaction_id: 'TXN001'}        │
│  - Calls processPendingBatches()                            │
└────────┬────────────────────────────────────────────────────┘
         │
         v
STEP 6: GROUP TRANSACTIONS BY MERCHANT
┌─────────────────────────────────────────────────────────────┐
│  SELECT merchant_id, COUNT(*), SUM(amount_paise)            │
│  FROM sp_v2_settlement_queue                                │
│  WHERE status = 'PENDING'                                   │
│  GROUP BY merchant_id                                       │
│  HAVING COUNT(*) >= 100 OR                                  │
│         MIN(queued_at) < NOW() - INTERVAL '5 minutes'       │
│                                                              │
│  Result:                                                     │
│  ┌──────────────┬────────────┬──────────────┐             │
│  │ merchant_id  │ txn_count  │ total_amount │             │
│  │ MERCH001     │ 150        │ ₹75,000      │             │
│  └──────────────┴────────────┴──────────────┘             │
└────────┬────────────────────────────────────────────────────┘
         │
         v
STEP 7: CALCULATE SETTLEMENT (3 DATA SOURCES)
┌─────────────────────────────────────────────────────────────┐
│  A. Get RECONCILED transactions from sp_v2_transactions     │
│     WHERE status = 'RECONCILED' AND merchant_id = 'MERCH001'│
│                                                              │
│  B. Get merchant config from SabPaisa DB (merchant_data)    │
│     - companyname, rolling_reserve, rolling_percentage      │
│                                                              │
│  C. Get MDR rates from SabPaisa DB (merchant_base_rate)     │
│     - convcharges, endpointcharge, gst rates                │
│                                                              │
│  D. Calculate for each transaction:                         │
│     • Commission = amount × MDR rate                        │
│     • GST = commission × 18%                                │
│     • Rolling reserve = net × reserve %                     │
│     • Net settlement = amount - commission - GST - reserve  │
│                                                              │
│  E. Calculate deductions:                                   │
│     • Refunds (from sp_v2_refunds)                          │
│     • Chargebacks (from sp_v2_chargebacks)                  │
│     • Bank charges (SUM(bank_fee_paise))                    │
│     • Outstanding debt (if any)                             │
└────────┬────────────────────────────────────────────────────┘
         │
         v
STEP 8: CREATE SETTLEMENT BATCH
┌─────────────────────────────────────────────────────────────┐
│  INSERT INTO sp_v2_settlement_batches                       │
│  ┌──────────────────────────────────────────────────┐     │
│  │ Batch ID: 9a7b3c2d-1234-5678-90ab-cdef12345678   │     │
│  │ merchant_id: MERCH001                             │     │
│  │ cycle_date: 2025-10-27                            │     │
│  │ total_transactions: 150                           │     │
│  │ gross_amount_paise: 7,500,000 (₹75,000)          │     │
│  │ total_commission_paise: 150,000 (₹1,500)         │     │
│  │ total_gst_paise: 27,000 (₹270)                   │     │
│  │ total_reserve_paise: 75,000 (₹750)               │     │
│  │ refund_deductions_paise: 10,000 (₹100)           │     │
│  │ chargeback_deductions_paise: 5,000 (₹50)         │     │
│  │ total_bank_charges_paise: 3,000 (₹30)            │     │
│  │ settlepaisa_revenue_paise: 147,000 (₹1,470)      │     │
│  │ net_amount_paise: 7,229,000 (₹72,290)            │     │
│  │ status: CALCULATED                                │     │
│  │ created_at: 2025-10-27 10:05:00                   │     │
│  └──────────────────────────────────────────────────┘     │
└────────┬────────────────────────────────────────────────────┘
         │
         v
STEP 9: CREATE SETTLEMENT ITEMS (PER TRANSACTION)
┌─────────────────────────────────────────────────────────────┐
│  INSERT INTO sp_v2_settlement_items                         │
│  (For each transaction in the batch)                        │
│  ┌──────────────────────────────────────────────────┐     │
│  │ transaction_id: TXN001                            │     │
│  │ amount_paise: 500000 (₹5,000)                     │     │
│  │ commission_paise: 10000 (₹100)                    │     │
│  │ gst_paise: 1800 (₹18)                             │     │
│  │ reserve_paise: 500 (₹5)                           │     │
│  │ net_paise: 487700 (₹4,877)                        │     │
│  │ payment_mode: UPI                                 │     │
│  │ commission_rate: 0.02                             │     │
│  └──────────────────────────────────────────────────┘     │
│  (Repeat for all 150 transactions)                          │
└────────┬────────────────────────────────────────────────────┘
         │
         v
STEP 10: UPDATE TRANSACTION STATUS → SETTLED
┌─────────────────────────────────────────────────────────────┐
│  UPDATE sp_v2_transactions                                  │
│  SET status = 'SETTLED',                                    │
│      settlement_batch_id = '9a7b3c2d-...',                  │
│      settled_at = NOW()                                     │
│  WHERE transaction_id IN ('TXN001', 'TXN002', ...)          │
│                                                              │
│  UPDATE sp_v2_settlement_queue                              │
│  SET status = 'PROCESSED',                                  │
│      processed_at = NOW()                                   │
│  WHERE transaction_id IN ('TXN001', 'TXN002', ...)          │
└─────────────────────────────────────────────────────────────┘

✅ SETTLEMENT BATCH READY FOR APPROVAL AND EXPORT!
```

---

## 📊 Step-by-Step Detailed Breakdown

### STEP 1: File Upload
**Trigger:** User uploads CSV files via Upload API
**Endpoint:** `POST http://localhost:5107/api/upload`
**Code:** `services/api/file-upload-v2.cjs:737-836`

**What Happens:**
```javascript
// Parse PG transactions
gross_amount_paise: parseInt(row.paid_amount || row.gross_amount)
amount_paise: parseInt(row.payee_amount || row.net_amount)
bank_fee_paise: NULL  // Not calculated yet

// Insert into database
INSERT INTO sp_v2_transactions (
  transaction_id,
  merchant_id,
  gross_amount_paise,
  amount_paise,
  bank_fee_paise,  // NULL at this stage
  status,          // PENDING
  source_type      // 'PG' or 'BANK'
) VALUES (...)
```

**Database After Upload:**
```sql
sp_v2_transactions
┌──────────────┬─────────────┬────────────────────┬──────────────┬────────────────┬─────────┐
│transaction_id│ merchant_id │ gross_amount_paise │ amount_paise │ bank_fee_paise │ status  │
├──────────────┼─────────────┼────────────────────┼──────────────┼────────────────┼─────────┤
│ TXN001       │ MERCH001    │ 500000             │ 500000       │ NULL           │ PENDING │
│ TXN002       │ MERCH001    │ 300000             │ 300000       │ NULL           │ PENDING │
│ TXN003       │ MERCH001    │ 150000             │ 150000       │ NULL           │ PENDING │
└──────────────┴─────────────┴────────────────────┴──────────────┴────────────────┴─────────┘
```

---

### STEP 2: Reconciliation Triggered
**Trigger:** User clicks "Run Reconciliation" OR Scheduled job
**Endpoint:** `POST http://localhost:5103/recon/run`
**Code:** `services/recon-api/jobs/runReconciliation.js`

**Request:**
```json
{
  "date": "2025-10-27",
  "merchantId": "MERCH001",
  "dryRun": false
}
```

**What Happens:**
1. Fetch all PENDING transactions from sp_v2_transactions
2. Fetch all bank statements (via uploaded CSV or API)
3. Match transactions using multiple strategies:
   - Primary: UTR match
   - Secondary: Amount + Date match
   - Tertiary: Fuzzy matching algorithms

---

### STEP 3: Calculate Bank Fees & Update Status
**Code:** `services/recon-api/jobs/runReconciliation.js:1523-1604`

**Calculation:**
```javascript
// Line 1523-1532: MAIN CALCULATION
const pgGrossPaise = parseInt(pgTxn.gross_amount || pgTxn.amount) || 0;
const bankCreditedPaise = parseInt(bankTxn.amount) || 0;
const bankFeePaise = pgGrossPaise - bankCreditedPaise;

console.log(`[Bank Fee Calc] ${pgTxn.transaction_id}:
  PG gross=${pgGrossPaise},
  Bank net=${bankCreditedPaise},
  Fee=${bankFeePaise}`);

// Update transaction
UPDATE sp_v2_transactions
SET
  status = 'RECONCILED',
  bank_fee_paise = ${bankFeePaise},
  reconciled_at = NOW(),
  updated_at = NOW()
WHERE transaction_id = '${pgTxn.transaction_id}'
```

**Example:**
```
Transaction TXN001:
  PG collected:     ₹5,000 (500000 paise)
  Bank credited:    ₹4,950 (495000 paise)
  Bank fee:         ₹50    (5000 paise)     ← Difference
```

**Database After Reconciliation:**
```sql
sp_v2_transactions
┌──────────────┬────────────────────┬──────────────┬────────────────┬────────────┐
│transaction_id│ gross_amount_paise │ amount_paise │ bank_fee_paise │ status     │
├──────────────┼────────────────────┼──────────────┼────────────────┼────────────┤
│ TXN001       │ 500000             │ 495000       │ 5000           │ RECONCILED │
│ TXN002       │ 300000             │ 298500       │ 1500           │ RECONCILED │
│ TXN003       │ 150000             │ 150000       │ 0              │ RECONCILED │
└──────────────┴────────────────────┴──────────────┴────────────────┴────────────┘
```

---

### STEP 4: 🔔 DATABASE TRIGGER AUTO-QUEUES FOR SETTLEMENT
**Trigger:** Automatic when transaction status → RECONCILED
**Migration:** `db/migrations/024_add_verification_and_settlement_automation.sql:386-435`

**Trigger Definition:**
```sql
-- Lines 386-420: Trigger Function
CREATE OR REPLACE FUNCTION fn_transaction_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If newly reconciled, queue for settlement
  IF NEW.status = 'RECONCILED' AND
     (OLD.status IS NULL OR OLD.status != 'RECONCILED')
  THEN

    -- 1. Insert into settlement queue
    INSERT INTO sp_v2_settlement_queue (
      transaction_id,
      merchant_id,
      amount_paise,
      queued_at,
      priority,
      status
    ) VALUES (
      NEW.transaction_id,
      NEW.merchant_id,
      NEW.amount_paise,
      NOW(),
      'NORMAL',
      'PENDING'
    )
    ON CONFLICT (transaction_id) DO NOTHING;

    -- 2. Notify settlement processor via PostgreSQL notification
    PERFORM pg_notify('settlement_queue',
      json_build_object(
        'transaction_id', NEW.transaction_id,
        'merchant_id', NEW.merchant_id,
        'amount_paise', NEW.amount_paise
      )::text
    );

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Lines 423-430: Trigger Creation
CREATE TRIGGER trg_transaction_status_change
  AFTER UPDATE OF status ON sp_v2_transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_transaction_status_change();
```

**What This Does:**
1. **Detects** when transaction status changes to RECONCILED
2. **Inserts** transaction into `sp_v2_settlement_queue` with status PENDING
3. **Notifies** settlement processor via PostgreSQL pub/sub (`pg_notify`)
4. **Prevents duplicates** using ON CONFLICT (transaction_id) DO NOTHING

**Database After Trigger:**
```sql
sp_v2_settlement_queue
┌──────────────┬─────────────┬──────────────┬─────────────────────┬─────────┐
│transaction_id│ merchant_id │ amount_paise │ queued_at           │ status  │
├──────────────┼─────────────┼──────────────┼─────────────────────┼─────────┤
│ TXN001       │ MERCH001    │ 495000       │ 2025-10-27 10:00:00 │ PENDING │
│ TXN002       │ MERCH001    │ 298500       │ 2025-10-27 10:00:01 │ PENDING │
│ TXN003       │ MERCH001    │ 150000       │ 2025-10-27 10:00:02 │ PENDING │
└──────────────┴─────────────┴──────────────┴─────────────────────┴─────────┘
```

---

### STEP 5: Settlement Processor Receives Notification
**Service:** `settlement-queue-processor.cjs`
**Code:** `services/settlement-engine/settlement-queue-processor.cjs:25-59`

**Setup:**
```javascript
// Lines 30-42: Listen to PostgreSQL notifications
const notificationClient = await v2Pool.connect();
await notificationClient.query('LISTEN settlement_queue');

notificationClient.on('notification', async (msg) => {
  if (msg.channel === 'settlement_queue' && !this.isProcessing) {
    const payload = JSON.parse(msg.payload);
    console.log('[Settlement Queue] New transaction queued:',
                payload.transaction_id);

    // Process immediately
    await this.processPendingBatches();
  }
});

console.log('[Settlement Queue] Listening for settlement events...');
```

**Also Polls Every 2 Minutes** (fallback if notification missed):
```javascript
// Lines 48-53: Polling fallback
setInterval(() => {
  if (!this.isProcessing) {
    this.processPendingBatches();
  }
}, 2 * 60 * 1000); // 2 minutes
```

---

### STEP 6: Group Transactions by Merchant
**Code:** `services/settlement-engine/settlement-queue-processor.cjs:61-108`

**Batching Logic:**
```javascript
// Lines 71-84: Query to group pending transactions
SELECT
  merchant_id,
  array_agg(transaction_id ORDER BY queued_at) as transaction_ids,
  COUNT(*) as txn_count,
  MIN(queued_at) as oldest_queued,
  SUM(amount_paise) as total_amount
FROM sp_v2_settlement_queue
WHERE status = 'PENDING'
GROUP BY merchant_id
HAVING
  COUNT(*) >= 100 OR                           -- Batch size threshold
  MIN(queued_at) < NOW() - INTERVAL '5 minutes' -- Time threshold
```

**Batching Strategy:**
- **Option 1:** Wait for 100 transactions (configurable via `this.batchSize`)
- **Option 2:** Process if oldest transaction > 5 minutes old

**Example Result:**
```
┌─────────────┬────────────┬──────────────────────┬──────────────┐
│ merchant_id │ txn_count  │ oldest_queued        │ total_amount │
├─────────────┼────────────┼──────────────────────┼──────────────┤
│ MERCH001    │ 150        │ 2025-10-27 10:00:00  │ 7,500,000    │
│ MERCH002    │ 85         │ 2025-10-27 09:55:00  │ 4,200,000    │
└─────────────┴────────────┴──────────────────────┴──────────────┘
```

---

### STEP 7: Calculate Settlement (Multi-DB Query)
**Code:** `services/settlement-engine/settlement-queue-processor.cjs:110-210`

**3 Database Queries:**

#### A. Get RECONCILED Transactions
```javascript
// Lines 138-152: Get transactions from sp_v2_transactions
SELECT
  id,
  transaction_id,
  merchant_id,
  amount_paise as paid_amount,
  transaction_date,
  payment_method as payment_mode,
  utr,
  status
FROM sp_v2_transactions
WHERE transaction_id = ANY($1)
  AND status = 'RECONCILED'
```

#### B. Get Merchant Config from SabPaisa DB
**Code:** `services/settlement-engine/settlement-calculator-v1-logic.cjs:163-205`

```javascript
// Lines 180-193: Query merchant_data table in SabPaisa DB
SELECT
  merchantid,
  clientcode as client_code,
  companyname,
  rolling_reserve,          -- Is rolling reserve enabled?
  rolling_percentage,       -- What % to hold?
  no_of_days,              -- For how many days?
  subscribe,               -- Is subscription model enabled?
  subscribe_amount         -- Monthly subscription fee
FROM merchant_data
WHERE clientcode = 'MERCH001'
```

**Example Result:**
```json
{
  "merchantid": 123,
  "client_code": "MERCH001",
  "companyname": "ABC Pvt Ltd",
  "rolling_reserve": true,
  "rolling_percentage": 10,
  "no_of_days": 7,
  "subscribe": false,
  "subscribe_amount": 0
}
```

#### C. Get MDR Rates from SabPaisa DB
**Code:** `services/settlement-engine/settlement-calculator-v1-logic.cjs:245-297`

```javascript
// Lines 259-270: Query merchant_base_rate table
SELECT
  convcharges,              -- Convenience charges (e.g., "0" or "1.5")
  convchargestype,          -- "percentage" or "flat"
  endpointcharge,           -- Endpoint charges (e.g., "2" for 2%)
  endpointchargestypes,     -- "percentage" or "flat"
  gst,                      -- GST rate (e.g., "18" for 18%)
  gsttype                   -- "percentage" or "flat"
FROM merchant_base_rate
WHERE client_code = 'MERCH001'
  AND paymodeid = 6  -- 6 = UPI
LIMIT 1
```

**Example Result:**
```json
{
  "convcharges": "0",
  "convchargestype": "percentage",
  "endpointcharge": "2",
  "endpointchargestypes": "percentage",
  "gst": "18",
  "gsttype": "percentage"
}
```

#### D. Calculate Settlement Amounts
**Code:** `services/settlement-engine/settlement-calculator-v1-logic.cjs:26-161`

```javascript
// Lines 46-129: For each transaction
for (const txn of reconciledTransactions) {

  // 1. Calculate convenience charges
  const convCharges = (amount × convcharges) / 100;  // 0% = 0

  // 2. Calculate endpoint charges (main MDR)
  const epCharges = (amount × endpointcharge) / 100;  // 2% = ₹100 on ₹5000

  // 3. Calculate GST on total charges
  const gst = (convCharges + epCharges) × 0.18;  // 18% of charges

  // 4. Total PG charge
  const pgCharge = convCharges + epCharges + gst;

  // 5. Calculate settlement amount based on fee bearer
  if (fee_bearer_id === '2') {  // Merchant bears fee
    settlementAmount = txn.paid_amount - pgCharge;
  } else {
    settlementAmount = txn.paid_amount;
  }

  // 6. Apply rolling reserve
  if (rolling_reserve === true) {
    rollingReserveAmount = settlementAmount × (rolling_percentage / 100);
  }

  // 7. Final settlement
  finalSettlement = settlementAmount - rollingReserveAmount;

  // Accumulate totals
  totalGrossAmount += txn.paid_amount;
  totalConvCharges += convCharges;
  totalEpCharges += epCharges;
  totalGST += gst;
  totalPGCharge += pgCharge;
  totalRollingReserve += rollingReserveAmount;
  totalSettlementAmount += finalSettlement;
}
```

**Example Calculation for TXN001 (₹5,000 UPI payment):**
```
Gross Amount:           ₹5,000.00
─────────────────────────────────
Conv Charges (0%):      ₹0.00
Endpoint Charges (2%):  ₹100.00
GST (18% on charges):   ₹18.00
─────────────────────────────────
Total PG Charge:        ₹118.00
─────────────────────────────────
Before Reserve:         ₹4,882.00
Rolling Reserve (10%):  ₹488.20
─────────────────────────────────
Net Settlement:         ₹4,393.80
```

#### E. Calculate Deductions
**Code:** `services/settlement-engine/settlement-calculator-with-deductions.cjs`

```javascript
// Calculate refunds for this merchant + cycle_date
const refunds = await calculateRefunds(merchantId, cycleDate);

// Calculate chargebacks
const chargebacks = await calculateChargebacks(merchantId, cycleDate);

// Calculate bank charges from reconciled transactions
const bankCharges = await calculateBankCharges(merchantId, cycleDate);

// Calculate outstanding debt (if any)
const outstandingDebt = await calculateOutstandingDebt(merchantId);

// Final net amount
netAmount = grossAmount
  - commission
  - gst
  - reserve
  - refunds
  - chargebacks
  - outstandingDebt;
```

---

### STEP 8: Create Settlement Batch
**Code:** `services/settlement-engine/settlement-queue-processor.cjs:339-408`

**Duplicate Prevention Check:**
```javascript
// Lines 341-348: Check for existing batch
SELECT id, status, created_at, gross_amount_paise
FROM sp_v2_settlement_batches
WHERE merchant_id = 'MERCH001'
  AND DATE(cycle_date) = DATE('2025-10-27')
  AND status IN ('CALCULATED', 'PENDING_APPROVAL', 'APPROVED')
LIMIT 1;

// If exists, return existing batch ID and skip creation
if (existingBatch.rows.length > 0) {
  console.log('⚠️ DUPLICATE PREVENTED: Batch already exists');
  return existing.id;
}
```

**Calculate Revenue Split:**
```javascript
// Lines 363-367: Bank charges and SettlePaisa revenue
const totalBankCharges = settlementBatch.total_bank_charges_paise || 0;
const settlepaisaRevenue = settlementBatch.total_commission_paise
                           - totalBankCharges;

// SettlePaisa keeps: Commission - Bank Charges
// Bank keeps: Bank Charges
```

**Insert Settlement Batch:**
```sql
-- Lines 370-408: Create settlement batch
INSERT INTO sp_v2_settlement_batches (
  id,
  merchant_id,
  cycle_date,
  total_transactions,
  gross_amount_paise,              -- Total transaction amount
  total_commission_paise,           -- MDR collected
  total_gst_paise,                  -- GST on MDR
  total_reserve_paise,              -- Rolling reserve held
  net_amount_paise,                 -- Final payout amount
  refund_deductions_paise,          -- Refunds deducted
  chargeback_deductions_paise,      -- Chargebacks deducted
  outstanding_debt_recovered_paise, -- Debt recovered
  total_bank_charges_paise,         -- Bank's share
  settlepaisa_revenue_paise,        -- SettlePaisa's revenue
  status,                           -- CALCULATED
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'MERCH001',
  '2025-10-27',
  150,
  7500000,    -- ₹75,000
  150000,     -- ₹1,500 (2% MDR)
  27000,      -- ₹270 (18% GST on MDR)
  75000,      -- ₹750 (10% reserve)
  7229000,    -- ₹72,290 (net payout)
  10000,      -- ₹100 (refunds)
  5000,       -- ₹50 (chargebacks)
  0,          -- ₹0 (no debt)
  3000,       -- ₹30 (bank charges)
  147000,     -- ₹1,470 (SettlePaisa revenue = 1500 - 30)
  'CALCULATED',
  NOW(),
  NOW()
) RETURNING id;
```

**Formula Summary:**
```
Gross Amount:                       ₹75,000.00
─────────────────────────────────────────────
Deductions:
  - Commission (2%):                ₹1,500.00
  - GST (18% on commission):        ₹270.00
  - Rolling Reserve (10%):          ₹750.00
  - Refunds:                        ₹100.00
  - Chargebacks:                    ₹50.00
  - Bank Charges:                   ₹30.00
─────────────────────────────────────────────
Net Payout to Merchant:             ₹72,290.00

Revenue Split:
  Bank's Share (bank charges):      ₹30.00
  SettlePaisa Revenue:              ₹1,470.00 (comm - bank charges)
```

---

### STEP 9: Create Settlement Items (Per Transaction)
**Code:** `services/settlement-engine/settlement-queue-processor.cjs:413-441`

```javascript
// Lines 414-441: Insert settlement items
for (const txn of transactions) {
  // Find matching item from calculator result
  const item = settlementBatch.items.find(
    i => i.transaction_id === txn.transaction_id
  );

  await client.query(`
    INSERT INTO sp_v2_settlement_items (
      settlement_batch_id,
      transaction_id,
      amount_paise,           -- Gross amount
      commission_paise,       -- Commission charged
      gst_paise,             -- GST on commission
      reserve_paise,         -- Reserve held
      net_paise,             -- Net to merchant
      payment_mode,          -- UPI/Card/NetBanking
      commission_rate        -- Rate used (e.g., 0.02)
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    batchId,
    txn.transaction_id,
    item.amount_paise,
    item.commission_paise,
    item.gst_paise,
    item.reserve_paise,
    item.net_paise,
    item.payment_mode,
    item.commission_rate
  ]);
}
```

**Database After Items Creation:**
```sql
sp_v2_settlement_items
┌────────────────────────┬──────────────┬──────────────┬─────────────────┬──────────┬──────────────┬──────────┐
│ settlement_batch_id    │transaction_id│ amount_paise │ commission_paise│ gst_paise│ reserve_paise│ net_paise│
├────────────────────────┼──────────────┼──────────────┼─────────────────┼──────────┼──────────────┼──────────┤
│ 9a7b3c2d-1234-5678-... │ TXN001       │ 500000       │ 10000           │ 1800     │ 500          │ 487700   │
│ 9a7b3c2d-1234-5678-... │ TXN002       │ 300000       │ 6000            │ 1080     │ 300          │ 292620   │
│ 9a7b3c2d-1234-5678-... │ TXN003       │ 150000       │ 3000            │ 540      │ 150          │ 146310   │
└────────────────────────┴──────────────┴──────────────┴─────────────────┴──────────┴──────────────┴──────────┘
```

---

### STEP 10: Update Transaction Status → SETTLED
**Code:** `services/settlement-engine/settlement-queue-processor.cjs:214-296`

```sql
-- Lines 215-222: Update transactions
UPDATE sp_v2_transactions
SET status = 'SETTLED',
    settlement_batch_id = '9a7b3c2d-1234-5678-90ab-cdef12345678',
    settled_at = NOW(),
    updated_at = NOW()
WHERE transaction_id IN ('TXN001', 'TXN002', 'TXN003', ...)

-- Lines 290-296: Mark queue as processed
UPDATE sp_v2_settlement_queue
SET status = 'PROCESSED',
    processed_at = NOW(),
    updated_at = NOW()
WHERE transaction_id IN ('TXN001', 'TXN002', 'TXN003', ...)
```

**Final Database State:**
```sql
sp_v2_transactions
┌──────────────┬────────────────────┬────────────────┬────────────────────────┬─────────┐
│transaction_id│ gross_amount_paise │ bank_fee_paise │ settlement_batch_id    │ status  │
├──────────────┼────────────────────┼────────────────┼────────────────────────┼─────────┤
│ TXN001       │ 500000             │ 5000           │ 9a7b3c2d-1234-5678-... │ SETTLED │
│ TXN002       │ 300000             │ 1500           │ 9a7b3c2d-1234-5678-... │ SETTLED │
│ TXN003       │ 150000             │ 0              │ 9a7b3c2d-1234-5678-... │ SETTLED │
└──────────────┴────────────────────┴────────────────┴────────────────────────┴─────────┘

sp_v2_settlement_queue
┌──────────────┬─────────────┬──────────────┬──────────────────────┬───────────┐
│transaction_id│ merchant_id │ amount_paise │ processed_at         │ status    │
├──────────────┼─────────────┼──────────────┼──────────────────────┼───────────┤
│ TXN001       │ MERCH001    │ 495000       │ 2025-10-27 10:05:00  │ PROCESSED │
│ TXN002       │ MERCH001    │ 298500       │ 2025-10-27 10:05:00  │ PROCESSED │
│ TXN003       │ MERCH001    │ 150000       │ 2025-10-27 10:05:00  │ PROCESSED │
└──────────────┴─────────────┴──────────────┴──────────────────────┴───────────┘
```

---

## 🗄️ Database Tables Involved

### Three Database Systems

#### 1. **SabPaisa Production DB** (sabpaisa)
**Connection:** `sabpaisaPool` in settlement-calculator-v1-logic.cjs

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **merchant_data** | Merchant configuration | merchantid, clientcode, companyname, rolling_reserve, rolling_percentage, no_of_days |
| **merchant_base_rate** | MDR rates per payment mode | client_code, paymodeid, convcharges, endpointcharge, gst, gsttype |
| **merchant_fee_bearer** | Who pays the MDR? | merchant_id, mode_id, fee_bearer_id (1=Customer, 2=Merchant) |
| **fee_bearer** | Fee bearer names | id, name |

#### 2. **SettlePaisa V2 DB** (settlepaisa_v2)
**Connection:** `v2Pool` in settlement-queue-processor.cjs

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **sp_v2_transactions** | All transactions | transaction_id, merchant_id, gross_amount_paise, amount_paise, bank_fee_paise, status, settlement_batch_id |
| **sp_v2_settlement_queue** | Settlement queue | transaction_id, merchant_id, amount_paise, status, queued_at, processed_at |
| **sp_v2_settlement_batches** | Settlement batches | id, merchant_id, cycle_date, gross_amount_paise, total_commission_paise, net_amount_paise, status |
| **sp_v2_settlement_items** | Per-transaction breakdown | settlement_batch_id, transaction_id, amount_paise, commission_paise, gst_paise, net_paise |
| **sp_v2_merchant_reserve_ledger** | Reserve tracking | merchant_id, transaction_type, amount_paise, balance_paise |
| **sp_v2_refunds** | Refund tracking | merchant_id, refund_date, amount_paise, status |
| **sp_v2_chargebacks** | Chargeback tracking | merchant_id, chargeback_date, amount_paise, status |

---

## 🔔 Triggers and Notifications

### Trigger 1: Auto-Queue for Settlement
**File:** `db/migrations/024_add_verification_and_settlement_automation.sql:386-435`

```sql
CREATE TRIGGER trg_transaction_status_change
  AFTER UPDATE OF status ON sp_v2_transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_transaction_status_change();
```

**When Fires:** Transaction status changes to RECONCILED
**What It Does:**
1. Inserts into `sp_v2_settlement_queue`
2. Sends `pg_notify('settlement_queue', {...})`

### Notification: PostgreSQL Pub/Sub
**Publisher:** Database trigger (fn_transaction_status_change)
**Subscriber:** settlement-queue-processor.cjs

```javascript
// Settlement processor listens
await notificationClient.query('LISTEN settlement_queue');

notificationClient.on('notification', async (msg) => {
  if (msg.channel === 'settlement_queue') {
    const payload = JSON.parse(msg.payload);
    // Process immediately
    await this.processPendingBatches();
  }
});
```

**Payload:**
```json
{
  "transaction_id": "TXN001",
  "merchant_id": "MERCH001",
  "amount_paise": 495000
}
```

---

## 📂 Settlement File Structure

### Settlement Batch (Ready for Export)

**Query to Get Settlement Batch:**
```sql
SELECT
  id,
  merchant_id,
  cycle_date,
  total_transactions,
  gross_amount_paise / 100.0 as gross_amount,
  total_commission_paise / 100.0 as commission,
  total_gst_paise / 100.0 as gst,
  total_reserve_paise / 100.0 as reserve,
  refund_deductions_paise / 100.0 as refunds,
  chargeback_deductions_paise / 100.0 as chargebacks,
  total_bank_charges_paise / 100.0 as bank_charges,
  net_amount_paise / 100.0 as net_payout,
  status,
  created_at
FROM sp_v2_settlement_batches
WHERE merchant_id = 'MERCH001'
  AND cycle_date = '2025-10-27'
  AND status = 'CALCULATED';
```

**Example Settlement File for MERCH001 (2025-10-27):**
```
════════════════════════════════════════════════════════════
                    SETTLEMENT SUMMARY
════════════════════════════════════════════════════════════
Merchant:           ABC Pvt Ltd (MERCH001)
Settlement Date:    2025-10-27
Batch ID:           9a7b3c2d-1234-5678-90ab-cdef12345678
Status:             CALCULATED
────────────────────────────────────────────────────────────
TRANSACTION SUMMARY
────────────────────────────────────────────────────────────
Total Transactions:         150
Gross Amount:               ₹75,000.00
────────────────────────────────────────────────────────────
DEDUCTIONS
────────────────────────────────────────────────────────────
Commission (2%):            ₹1,500.00
GST (18% on commission):    ₹270.00
Rolling Reserve (10%):      ₹750.00
Refunds:                    ₹100.00
Chargebacks:                ₹50.00
Bank Charges:               ₹30.00
────────────────────────────────────────────────────────────
REVENUE SPLIT
────────────────────────────────────────────────────────────
Total MDR Collected:        ₹1,500.00
Bank's Share:               ₹30.00 (bank charges)
SettlePaisa Revenue:        ₹1,470.00
────────────────────────────────────────────────────────────
NET PAYOUT TO MERCHANT
════════════════════════════════════════════════════════════
                         ₹72,290.00
════════════════════════════════════════════════════════════

DETAILED TRANSACTION BREAKDOWN
────────────────────────────────────────────────────────────
TXN ID   | Payment Mode | Gross    | Comm  | GST  | Net
────────────────────────────────────────────────────────────
TXN001   | UPI          | ₹5,000   | ₹100  | ₹18  | ₹4,877
TXN002   | UPI          | ₹3,000   | ₹60   | ₹11  | ₹2,926
TXN003   | Debit Card   | ₹1,500   | ₹30   | ₹5   | ₹1,463
...      | ...          | ...      | ...   | ...  | ...
(150 transactions total)
════════════════════════════════════════════════════════════
```

### Per-Transaction Details Query:
```sql
SELECT
  si.transaction_id,
  t.payment_method,
  t.transaction_date,
  t.utr,
  si.amount_paise / 100.0 as gross_amount,
  si.commission_paise / 100.0 as commission,
  si.gst_paise / 100.0 as gst,
  si.reserve_paise / 100.0 as reserve,
  si.net_paise / 100.0 as net_settlement,
  si.commission_rate
FROM sp_v2_settlement_items si
JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
WHERE si.settlement_batch_id = '9a7b3c2d-1234-5678-90ab-cdef12345678'
ORDER BY t.transaction_date, si.transaction_id;
```

---

## 🔄 Status Progression

### Settlement Batch Status Flow

```
┌──────────────┐
│  CALCULATED  │  ← Created by settlement processor
└──────┬───────┘
       │
       │ (Manual approval by ops team)
       │
       v
┌──────────────────┐
│ PENDING_APPROVAL │  ← Waiting for approval
└──────┬───────────┘
       │
       │ (Ops team approves)
       │
       v
┌──────────────┐
│   APPROVED   │  ← Ready for payout
└──────┬───────┘
       │
       │ (Bank transfer initiated)
       │
       v
┌──────────────┐
│     PAID     │  ← Payment completed
└──────────────┘
```

**Current Implementation:**
- System automatically creates batches with status `CALCULATED`
- **NO AUTO-PAYOUTS** - Requires manual approval
- Auto-approval threshold: ₹10,000 (configurable)
  - Below threshold: Auto-approve
  - Above threshold: Requires manual approval

**Code Reference:**
```javascript
// Lines 314-318: Check approval threshold
const autoApproveThreshold = 1000000; // ₹10,000 (in paise)

if (settlementBatch.net_settlement_amount > autoApproveThreshold) {
  await this.queueForApproval(batchId, settlementBatch, merchantId);
} else {
  await this.autoApprove(batchId, settlementBatch.net_settlement_amount);
}
```

---

## 📊 Monitoring Queries

### Check Settlement Queue Status
```sql
SELECT
  status,
  COUNT(*) as queue_count,
  SUM(amount_paise) / 100.0 as total_amount,
  MIN(queued_at) as oldest_queued,
  MAX(queued_at) as newest_queued
FROM sp_v2_settlement_queue
GROUP BY status
ORDER BY
  CASE status
    WHEN 'PENDING' THEN 1
    WHEN 'PROCESSING' THEN 2
    WHEN 'PROCESSED' THEN 3
    WHEN 'FAILED' THEN 4
  END;
```

### Check Settlement Batches by Status
```sql
SELECT
  status,
  COUNT(*) as batch_count,
  SUM(net_amount_paise) / 100.0 as total_payout,
  SUM(settlepaisa_revenue_paise) / 100.0 as total_revenue
FROM sp_v2_settlement_batches
GROUP BY status
ORDER BY
  CASE status
    WHEN 'CALCULATED' THEN 1
    WHEN 'PENDING_APPROVAL' THEN 2
    WHEN 'APPROVED' THEN 3
    WHEN 'PAID' THEN 4
  END;
```

### Check Pending Settlements by Merchant
```sql
SELECT
  merchant_id,
  COUNT(*) as pending_batches,
  SUM(net_amount_paise) / 100.0 as total_pending_payout,
  MIN(created_at) as oldest_batch_created
FROM sp_v2_settlement_batches
WHERE status IN ('CALCULATED', 'PENDING_APPROVAL')
GROUP BY merchant_id
ORDER BY total_pending_payout DESC;
```

### Check Daily Settlement Summary
```sql
SELECT
  DATE(cycle_date) as date,
  COUNT(DISTINCT merchant_id) as unique_merchants,
  COUNT(*) as total_batches,
  SUM(total_transactions) as total_transactions,
  SUM(gross_amount_paise) / 100.0 as gross_amount,
  SUM(total_commission_paise) / 100.0 as commission_collected,
  SUM(total_bank_charges_paise) / 100.0 as bank_charges,
  SUM(settlepaisa_revenue_paise) / 100.0 as settlepaisa_revenue,
  SUM(net_amount_paise) / 100.0 as net_payouts
FROM sp_v2_settlement_batches
WHERE cycle_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(cycle_date)
ORDER BY date DESC;
```

### Check Revenue Split
```sql
SELECT
  merchant_id,
  cycle_date,
  gross_amount_paise / 100.0 as gross,
  total_commission_paise / 100.0 as mdr_collected,
  total_bank_charges_paise / 100.0 as bank_share,
  settlepaisa_revenue_paise / 100.0 as settlepaisa_share,
  (settlepaisa_revenue_paise::FLOAT / NULLIF(total_commission_paise, 0) * 100) as revenue_percentage
FROM sp_v2_settlement_batches
WHERE status = 'CALCULATED'
ORDER BY cycle_date DESC, merchant_id;
```

---

## 🐛 Debugging & Troubleshooting

### Check if Trigger is Firing
```sql
-- See recent queue entries
SELECT
  transaction_id,
  merchant_id,
  queued_at,
  status,
  EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60 as minutes_ago
FROM sp_v2_settlement_queue
ORDER BY queued_at DESC
LIMIT 20;
```

### Check if Processor is Running
```bash
# On EC2
pm2 status | grep settlement-queue-processor

# Check logs
pm2 logs settlement-queue-processor --lines 50
```

### Manual Trigger Settlement Processing
```sql
-- Manually send notification (if processor missed it)
SELECT pg_notify('settlement_queue',
  json_build_object(
    'transaction_id', 'TXN001',
    'merchant_id', 'MERCH001',
    'amount_paise', 500000
  )::text
);
```

### Check for Failed Queue Items
```sql
SELECT
  transaction_id,
  merchant_id,
  status,
  retry_count,
  error_message,
  queued_at,
  updated_at
FROM sp_v2_settlement_queue
WHERE status = 'FAILED'
ORDER BY updated_at DESC;
```

### Check for Stuck Transactions
```sql
-- Transactions reconciled but not in settlement queue
SELECT
  t.transaction_id,
  t.merchant_id,
  t.status,
  t.reconciled_at,
  EXTRACT(EPOCH FROM (NOW() - t.reconciled_at)) / 60 as stuck_minutes
FROM sp_v2_transactions t
LEFT JOIN sp_v2_settlement_queue q ON t.transaction_id = q.transaction_id
WHERE t.status = 'RECONCILED'
  AND q.transaction_id IS NULL
  AND t.reconciled_at < NOW() - INTERVAL '10 minutes'
ORDER BY t.reconciled_at;
```

### Manually Queue Stuck Transactions
```sql
-- If trigger failed, manually insert into queue
INSERT INTO sp_v2_settlement_queue (
  transaction_id,
  merchant_id,
  amount_paise,
  queued_at,
  status
)
SELECT
  transaction_id,
  merchant_id,
  amount_paise,
  NOW(),
  'PENDING'
FROM sp_v2_transactions
WHERE status = 'RECONCILED'
  AND settlement_batch_id IS NULL
  AND transaction_id NOT IN (SELECT transaction_id FROM sp_v2_settlement_queue)
ON CONFLICT (transaction_id) DO NOTHING;
```

---

## 🎯 Key Takeaways

### What Triggers Settlement?
✅ **Automatic via Database Trigger**
- When transaction status → RECONCILED
- Trigger: `trg_transaction_status_change`
- Inserts into `sp_v2_settlement_queue`
- Sends `pg_notify('settlement_queue')`

### How Are Batches Created?
✅ **Per Merchant Per Cycle Date**
- Batching logic: 100 transactions OR 5 minutes
- Duplicate prevention: Check existing batches
- Status: CALCULATED (not paid yet)

### What Databases Are Used?
✅ **Two Database Systems**
1. **SabPaisa DB** - Merchant config, MDR rates
2. **SettlePaisa V2 DB** - Transactions, settlements

### Where Do Settlement Files Come From?
✅ **sp_v2_settlement_batches Table**
- One batch per merchant per cycle_date
- Contains: Gross, Commission, GST, Reserve, Refunds, Chargebacks, Net
- Ready for export (no auto-payouts)

### How Is Revenue Tracked?
✅ **Revenue Split Calculation**
```
Total MDR Collected = Commission + GST
Bank's Share = Bank Charges
SettlePaisa Revenue = (Commission + GST) - Bank Charges
Net Payout = Gross - All Deductions
```

---

## 📚 File References

| Component | File | Lines |
|-----------|------|-------|
| **Upload** | services/api/file-upload-v2.cjs | 737-836 |
| **Reconciliation** | services/recon-api/jobs/runReconciliation.js | 1523-1604 |
| **Database Trigger** | db/migrations/024_add_verification_and_settlement_automation.sql | 386-435 |
| **Queue Processor** | services/settlement-engine/settlement-queue-processor.cjs | 25-441 |
| **Settlement Calculator** | services/settlement-engine/settlement-calculator-v1-logic.cjs | 26-471 |
| **Settlement API** | services/settlement-engine/settlement-api.cjs | 104-133 |

---

## 🔐 Security & Data Integrity

### Duplicate Prevention
- ✅ Check existing batch before creation (merchant_id + cycle_date + status)
- ✅ ON CONFLICT DO NOTHING in settlement queue insert
- ✅ Row-level locking when marking transactions as PROCESSING

### Transaction Safety
- ✅ All settlement operations wrapped in BEGIN/COMMIT transactions
- ✅ ROLLBACK on any error
- ✅ Status transitions logged

### Audit Trail
- ✅ All tables have created_at, updated_at timestamps
- ✅ Status progression tracked
- ✅ Commission audit table (sp_v2_commission_audit)
- ✅ Reserve ledger (sp_v2_merchant_reserve_ledger)

---

**Document Created:** October 27, 2025
**Status:** ✅ Production-Ready Documentation
**Next Action:** Use this as reference for settlement file exports and payout automation
