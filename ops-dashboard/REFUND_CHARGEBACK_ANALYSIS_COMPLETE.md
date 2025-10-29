# Complete Analysis: Refund & Chargeback System (V1 vs V2)

**Date**: 2025-10-22
**Purpose**: Understand how V1 handled refunds/chargebacks and design V2 implementation
**Status**: Analysis Complete - Ready for Implementation

---

## 🔍 Executive Summary

### Key Findings:
1. ✅ **V1 has refund columns** in `transactions_to_settle` table (denormalized)
2. ✅ **V2 already has chargebacks table** (`sp_v2_chargebacks`) with 52 records
3. ❌ **V2 does NOT have refunds** implemented yet
4. ✅ **V1 used 2-step CSV upload** process (transactions first, refunds later)

### Recommendation:
**Copy V1's approach** - Add refund columns to `sp_v2_transactions` table and create CSV upload API

---

## 📊 Part 1: V1 Database Structure

### V1 Production Database
- **Host**: 3.108.237.99:5432
- **Database**: settlepaisa_demo
- **Total Tables**: 55
- **Transactions**: 23 records in `transactions_to_settle`

### V1 `transactions_to_settle` Table Schema

#### Transaction Columns:
```
id                          bigint (PK)
transaction_id              VARCHAR
pg_name                     VARCHAR
payment_mode                VARCHAR
act_amount                  DOUBLE PRECISION
client_code                 VARCHAR (merchant identifier)
payee_amount                DOUBLE PRECISION
trans_date                  TIMESTAMPTZ
transaction_status          VARCHAR
```

#### **Refund Columns (The Key Discovery):**
```
refund_transaction_amount   NUMERIC (NULL by default)
refund_transaction_date     TIMESTAMPTZ (NULL by default)
is_refund_done             VARCHAR (NULL by default)
refund_type                VARCHAR (either "refund" or "chargeback")
refund_completed_date      TIMESTAMPTZ (NULL by default)
chargeback_processing_fee   NUMERIC (only for chargebacks)
```

**Current Data**:
- Total transactions: 23
- Transactions with refunds: 0 (no refund data in production yet)

---

## 🔄 Part 2: V1 Data Population Flow

### **Step 1: Transaction CSV Upload**

**Endpoint**: `POST /transactions/upload_transaction`

**Controller**: `/src/controllers/transactions.controller.js` (lines 1-150)

**CSV Format**: Standard transaction CSV with columns:
```csv
transaction_id,pg_name,payment_mode,act_amount,client_code,payee_amount,trans_date,...
```

**Process**:
```javascript
// 1. Parse CSV file
// 2. For each row, call insertRowInTransaction()
// 3. INSERT into transactions_to_settle

const data = await pool.query(`
  INSERT INTO transactions_to_settle (
    transaction_id, pg_pay_mode, act_amount, client_code, payee_amount,
    paid_amount, payment_mode, currency, convcharges, ep_charges, gst,
    gst_rate_type, gst_rate, transaction_status, trans_date, payout_status,
    fee_forward, sp_conv_rate, sp_conv_rate_type, ep_conv_rate,
    ep_conv_rate_type, service_provider_id, business_category, referral_id,
    paymode_id, challan_no, udf1, udf5, udf9, udf10, udf11, udf15, udf17,
    created_on, pg_name, trans_complete_date, payee_name, payee_email, payee_mobile
  ) VALUES ($1, $2, ..., $38)
  ON CONFLICT (transaction_id) DO NOTHING;
`);
```

**Important**: Notice the INSERT does NOT include refund columns - they remain NULL.

### **Step 2: Refund CSV Upload** (Separate Process)

**Endpoint**: `POST /transactions/upload_refund_transaction`

**Controller**: `/src/controllers/transactions.controller.js` (lines 981-1129)

**CSV Format**: Simple 3-column format:
```csv
transaction_id,refund_type,refund_amount
TXN001,refund,5000
TXN002,chargeback,10000
```

**Sample CSV**: `/src/utility/sample_file/refundSample.csv`

**Process**:
```javascript
// 1. Parse CSV (supports .csv and .xlsx)
parser.on("data", (data) => {
  results.push(data);
});

// 2. For each row, call insertRowInRefundTransaction()
const insertions = results.map(async (item) => {
  const response = await transactions.insertRowInRefundTransaction(item);
  if (!response.status) {
    failedTransactions.push(item);
  }
});

// 3. Return success/failed counts
const meta = {
  processed_record: processedRecord,
  failed_record: failedRecord,
  url: failedTransactionsS3URL
};
```

**Repository Function**: `/src/repository/transactions.transaction.js` (lines 310-368)

```javascript
const insertRowInRefundTransaction = async (dataArray) => {
  // 1. Validate required fields
  let validationStatus = validation.validationLevelOne(
    ["transaction_id", "refund_type", "refund_amount"],
    [],
    dataArray
  );

  // 2. Check if transaction exists
  let transactionData = await pool.query(
    "SELECT * FROM transactions_to_settle WHERE transaction_id=$1",
    [dataArray.transaction_id]
  );

  if (transactionData.rows.length == 0) {
    return { status: false, message: "Transaction is not correct" };
  }

  // 3. UPDATE based on refund_type
  if (dataArray.refund_type == "chargeback") {
    // For chargebacks: Fetch processing fee from split rules
    const splitRuleBank = await selectBankRule(
      transactionData.paymode_id,
      transactionData.service_provider_id,
      parseInt(transactionData.business_category),
      transactionData.is_on_us
    );

    await pool.query(
      `UPDATE transactions_to_settle
       SET refund_transaction_amount = $1,
           refund_transaction_date = NOW(),
           refund_type = $2,
           chargeback_processing_fee = $3
       WHERE transaction_id = $4`,
      [dataArray.refund_amount, 'chargeback', processing_fee, dataArray.transaction_id]
    );
  }
  else if (dataArray.refund_type == "refund") {
    // For refunds: Just amount and date
    await pool.query(
      `UPDATE transactions_to_settle
       SET refund_transaction_amount = $1,
           refund_transaction_date = NOW(),
           refund_type = $2
       WHERE transaction_id = $3`,
      [dataArray.refund_amount, 'refund', dataArray.transaction_id]
    );
  }

  return { status: true, message: "Success" };
};
```

**Constants**: `/src/utility/constants.js` (lines 109-112)
```javascript
const refundType = {
  refund: "refund",
  chargeback: "chargeback"
};
```

---

## 💰 Part 3: V1 Settlement Deduction Logic

**File**: `/src/repository/reports.transaction.js` (lines 1467-1474)

### How V1 Calculated Settlement with Deductions:

```javascript
// 1. Get pending refunds for merchant
let refundAmount = await pool.query(
  `SELECT COALESCE(SUM(refund_transaction_amount), 0) as sum
   FROM transactions_to_settle
   WHERE client_code = $1
     AND is_payout_done IS NULL        -- Not yet paid out
     AND is_refund_done IS NULL        -- Refund not yet processed
     AND refund_type = 'refund'`,
  [merchant_code]
);

// 2. Get pending chargebacks for merchant
let chargebackAmount = await pool.query(
  `SELECT COALESCE(SUM(refund_transaction_amount), 0) as sum
   FROM transactions_to_settle
   WHERE client_code = $1
     AND is_payout_done IS NULL
     AND is_refund_done IS NULL
     AND refund_type = 'chargeback'`,
  [merchant_code]
);

// 3. Calculate net settlement
const gross_amount = calculateGrossAmount(transactions);
const refund_total = refundAmount.rows[0].sum;
const chargeback_total = chargebackAmount.rows[0].sum;
const net_settlement = gross_amount - refund_total - chargeback_total;
```

**Key Points**:
- Queries same table (`transactions_to_settle`) for both transactions AND refunds
- Filters by `refund_type` to distinguish refunds from chargebacks
- Only deducts if `is_refund_done IS NULL` (not yet processed)
- Only deducts if `is_payout_done IS NULL` (not yet paid out)

---

## 🔧 Part 4: V2 Current State

### V2 Local Database
- **Host**: localhost:5433
- **Database**: settlepaisa_v2
- **Total V2 Tables**: 71

### V2 `sp_v2_transactions` Table Schema

**Current Columns** (30 columns total):
```
id                          BIGSERIAL (PK)
transaction_id              VARCHAR (NOT NULL)
merchant_id                 VARCHAR (NOT NULL)
amount_paise                BIGINT (NOT NULL)
currency                    VARCHAR
transaction_date            DATE (NOT NULL)
transaction_timestamp       TIMESTAMPTZ (NOT NULL)
source_type                 VARCHAR (NOT NULL) -- WEBHOOK/API_SYNC/CONNECTOR/MANUAL_UPLOAD
source_name                 VARCHAR
batch_id                    VARCHAR
payment_method              VARCHAR
gateway_ref                 VARCHAR
utr                         VARCHAR
rrn                         VARCHAR
status                      VARCHAR
created_at                  TIMESTAMPTZ
updated_at                  TIMESTAMPTZ
exception_reason            VARCHAR
settlement_batch_id         UUID
settled_at                  TIMESTAMP
bank_fee_paise              BIGINT
settlement_amount_paise     BIGINT
fee_variance_paise          BIGINT
fee_variance_percentage     NUMERIC
acquirer_code               VARCHAR
merchant_name               VARCHAR
card_network                VARCHAR
customer_email              VARCHAR
customer_phone              VARCHAR
metadata                    JSONB
payment_mode                VARCHAR
```

**Missing**: NO refund columns (refund_amount_paise, refund_type, refund_date, etc.)

**Current Data**:
- Total transactions: 476
- Source breakdown:
  - WEBHOOK: 379 (79%) - from PG webhooks
  - API_SYNC: 50 (11%) - direct API calls
  - CONNECTOR: 45 (9%) - batch imports
  - MANUAL_UPLOAD: 2 (0.4%) - CSV uploads

### V2 `sp_v2_chargebacks` Table (Already Exists!)

**Schema** (38 columns):
```
id                          UUID (PK)
merchant_id                 VARCHAR (NOT NULL)
merchant_name               VARCHAR
acquirer                    TEXT (NOT NULL)
network_case_id             TEXT (NOT NULL)
case_ref                    VARCHAR
txn_ref                     TEXT (NOT NULL) -- Links to transaction
original_transaction_id     VARCHAR
gateway_txn_id              VARCHAR
utr                         VARCHAR
rrn                         VARCHAR
original_gross_paise        BIGINT (NOT NULL)
chargeback_paise            BIGINT (NOT NULL)
fees_paise                  BIGINT (NOT NULL)
recovered_paise             BIGINT (NOT NULL)
pending_recovery_paise      BIGINT (NOT NULL)
writeoff_paise              BIGINT (NOT NULL)
currency                    TEXT (NOT NULL)
reason_code                 TEXT (NOT NULL)
reason_description          TEXT
customer_complaint          TEXT
stage                       TEXT (NOT NULL)
outcome                     TEXT -- WON/LOST/PENDING
status                      TEXT (NOT NULL)
assigned_to                 VARCHAR
assigned_team               VARCHAR
received_at                 TIMESTAMPTZ (NOT NULL)
deadline_at                 TIMESTAMPTZ
evidence_due_at             TIMESTAMPTZ
responded_at                TIMESTAMPTZ
closed_at                   TIMESTAMPTZ
source_system               VARCHAR
external_reference          JSONB
notes                       TEXT
tags                        ARRAY
created_at                  TIMESTAMPTZ (NOT NULL)
updated_at                  TIMESTAMPTZ (NOT NULL)
created_by                  VARCHAR
updated_by                  VARCHAR
```

**Current Data**: 52 chargeback records

### V2 `sp_v2_settlement_deductions` Table (Already Exists!)

**Schema**:
```
id                          UUID (PK)
recovery_action_id          UUID (NOT NULL)
chargeback_id               UUID (NOT NULL) -- FK to sp_v2_chargebacks
settlement_batch_id         VARCHAR
settlement_date             DATE
merchant_id                 VARCHAR (NOT NULL)
deduction_paise             BIGINT (NOT NULL)
settlement_gross_paise      BIGINT
max_deduction_percent       NUMERIC
status                      TEXT (NOT NULL)
applied_at                  TIMESTAMPTZ
applied_by                  VARCHAR
failure_reason              TEXT
created_at                  TIMESTAMPTZ (NOT NULL)
updated_at                  TIMESTAMPTZ (NOT NULL)
```

**Purpose**: Tracks what chargebacks were deducted from which settlements
**Current Data**: 0 records (not being used yet)

### V2 `sp_v2_settlement_batches` Table

**Current Schema** (25 columns - NO refund/chargeback deduction columns):
```
id                          UUID (PK)
merchant_id                 VARCHAR
merchant_name               VARCHAR
cycle_date                  DATE
total_transactions          INTEGER
gross_amount_paise          BIGINT
total_commission_paise      BIGINT
total_gst_paise             BIGINT
total_reserve_paise         BIGINT
net_amount_paise            BIGINT
status                      VARCHAR
created_at                  TIMESTAMP
updated_at                  TIMESTAMP
approved_at                 TIMESTAMP
approved_by                 VARCHAR
settlement_completed_at     TIMESTAMP
bank_reference_number       VARCHAR
remarks                     TEXT
settlement_run_id           UUID
approval_status             VARCHAR
transfer_status             VARCHAR
settled_at                  TIMESTAMP
acquirer_code               VARCHAR
settlement_type             VARCHAR
priority                    INTEGER
```

**Missing**: NO columns for `refunds_deducted_paise`, `chargebacks_deducted_paise`

---

## 📋 Part 5: V2 Data Population Sources

### What Populates `sp_v2_transactions`?

**Source 1: CSV File Upload API** (port 5109)
- File: `services/api/file-upload-v2.cjs`
- Endpoint: `POST /api/upload/multiple`
- Process: Parses CSV/XLSX → Inserts into `sp_v2_transactions`
- Sets `source_type = 'MANUAL_UPLOAD'`

**Source 2: PG Webhook Ingestion**
- File: `services/pg-ingestion/pg-ingestion-server.cjs`
- Real-time payment gateway webhooks (Razorpay, PayU, etc.)
- Sets `source_type = 'WEBHOOK'`

**Source 3: Connector Sync Service**
- File: `services/recon-api/services/pg-sync-service.js`
- Batch imports from PG APIs
- Sets `source_type = 'CONNECTOR'`

**Source 4: Direct API Sync**
- Sets `source_type = 'API_SYNC'`

**Important**: NONE of these sources include refund data. Refunds are a separate business event.

---

## 🎯 Part 6: Architecture Decision

### Option A: V1 Approach (Denormalized) ⭐ **RECOMMENDED**

**Changes Required**:

1. **Add refund columns to `sp_v2_transactions`**:
```sql
ALTER TABLE sp_v2_transactions
ADD COLUMN refund_amount_paise BIGINT DEFAULT NULL,
ADD COLUMN refund_type VARCHAR DEFAULT NULL,  -- 'refund' or 'chargeback'
ADD COLUMN refund_date TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN is_refund_processed BOOLEAN DEFAULT FALSE,
ADD COLUMN chargeback_processing_fee_paise BIGINT DEFAULT NULL;

CREATE INDEX idx_sp_v2_transactions_refunds
ON sp_v2_transactions(merchant_id, refund_type)
WHERE refund_amount_paise IS NOT NULL;
```

2. **Create Refund CSV Upload API**:
```javascript
// New endpoint: POST /api/refunds/upload
// CSV format: transaction_id,refund_type,refund_amount
// Process: UPDATES sp_v2_transactions SET refund_amount_paise = X WHERE transaction_id = Y
```

3. **Update Settlement Calculator**:
```javascript
// Query refunds from sp_v2_transactions
const refunds = await pool.query(`
  SELECT COALESCE(SUM(refund_amount_paise), 0) as total
  FROM sp_v2_transactions
  WHERE merchant_id = $1
    AND refund_type = 'refund'
    AND is_refund_processed = FALSE
`);

// Query chargebacks from sp_v2_chargebacks (existing table)
const chargebacks = await pool.query(`
  SELECT COALESCE(SUM(chargeback_paise), 0) as total
  FROM sp_v2_chargebacks
  WHERE merchant_id = $1
    AND outcome = 'LOST'
`);

const net = gross - refunds.total - chargebacks.total;
```

**Pros**:
- ✅ Proven approach (V1 working)
- ✅ Simple implementation
- ✅ One table query for transactions + refunds
- ✅ Faster to implement

**Cons**:
- ⚠️ Denormalized (refund data in transaction table)
- ⚠️ Inconsistent: chargebacks separate, refunds in transactions
- ⚠️ Can only track one refund per transaction

---

### Option B: Normalized Approach (Separate Tables)

**Changes Required**:

1. **Create new `sp_v2_refunds` table**:
```sql
CREATE TABLE sp_v2_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR NOT NULL,
  transaction_id VARCHAR NOT NULL,
  refund_amount_paise BIGINT NOT NULL,
  refund_reason TEXT,
  status VARCHAR DEFAULT 'PENDING',
  refund_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sp_v2_refunds_merchant ON sp_v2_refunds(merchant_id);
CREATE INDEX idx_sp_v2_refunds_status ON sp_v2_refunds(status);
CREATE INDEX idx_sp_v2_refunds_txn ON sp_v2_refunds(transaction_id);
```

2. **Create Refund CSV Upload API**:
```javascript
// New endpoint: POST /api/refunds/upload
// CSV format: transaction_id,refund_amount,refund_date
// Process: INSERTS into sp_v2_refunds (new independent row)
```

3. **Update Settlement Calculator**:
```javascript
// Query refunds from sp_v2_refunds
const refunds = await pool.query(`
  SELECT COALESCE(SUM(refund_amount_paise), 0) as total
  FROM sp_v2_refunds
  WHERE merchant_id = $1
    AND status = 'PENDING'
`);

// Query chargebacks from sp_v2_chargebacks
const chargebacks = await pool.query(`
  SELECT COALESCE(SUM(chargeback_paise), 0) as total
  FROM sp_v2_chargebacks
  WHERE merchant_id = $1
    AND outcome = 'LOST'
`);

const net = gross - refunds.total - chargebacks.total;
```

**Pros**:
- ✅ Normalized architecture
- ✅ Consistent: both refunds and chargebacks independent
- ✅ Can track multiple refunds per transaction
- ✅ Matches "data flows independently" principle

**Cons**:
- ⚠️ More complex (new table + new API)
- ⚠️ Settlement calculator queries 3 tables
- ⚠️ Takes longer to implement

---

## 🏆 Final Recommendation: **Option A (V1 Approach)**

### Why Option A?

1. **Proven & Working**: V1 has been using this for years
2. **Faster Implementation**: ALTER table vs CREATE new table
3. **Simpler Queries**: Settlement calculator queries one table for transactions + refunds
4. **Business Rule**: Typically one refund per transaction
5. **Pragmatic**: Get Phase 1 done quickly, can refactor later if needed

### Implementation Order:

1. ✅ **Day 1 Morning**: Add refund columns to `sp_v2_transactions` (migration)
2. ✅ **Day 1 Afternoon**: Create refund CSV upload API (copy V1 logic)
3. ✅ **Day 2 Morning**: Update settlement calculator to deduct refunds + chargebacks
4. ✅ **Day 2 Afternoon**: Test with sample data, deploy to local
5. ✅ **Day 3**: Deploy to staging, verify with real data

---

## 📝 Next Steps

1. Create migration file: `db/migrations/027_add_refund_columns_to_transactions.sql`
2. Create refund upload API: `services/api/refund-upload-api.cjs`
3. Update settlement calculator: `services/settlement-engine/settlement-calculator-v1-logic.cjs`
4. Test on local database
5. Deploy to staging

---

**Document Status**: ✅ Analysis Complete - Ready for Implementation
**Approved By**: User (2025-10-22)
**Implementation Start**: Pending approval to proceed
