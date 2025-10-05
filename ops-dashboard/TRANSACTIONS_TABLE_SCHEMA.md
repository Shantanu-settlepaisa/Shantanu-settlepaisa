# sp_v2_transactions - Complete Schema Documentation

## Table Overview

**Purpose**: Core transaction table that stores all payment transactions from Payment Gateway (PG) systems. This is the heart of the reconciliation engine.

**Current Data**: 797 transactions (673 reconciled, 122 unmatched, 1 exception, 1 pending)
- **Date Range**: 2025-09-01 to 2025-10-03
- **Merchants**: 10 unique merchants
- **Acquirers**: 3 (HDFC, ICICI, UNKNOWN)
- **Total Volume**: ₹4.87 Cr (487,194,428 paise)

---

## Complete Schema

### Primary Identification
```sql
id                    BIGINT PRIMARY KEY          -- Internal auto-increment ID
transaction_id        VARCHAR(100) UNIQUE NOT NULL -- External transaction ID (TXN20250923022)
merchant_id           VARCHAR(50) NOT NULL         -- Merchant identifier
merchant_name         VARCHAR(255)                 -- Merchant display name
```

### Financial Information
```sql
amount_paise          BIGINT NOT NULL              -- Transaction amount in paise (₹100 = 10000)
currency              VARCHAR(3) DEFAULT 'INR'     -- Currency code
bank_fee_paise        BIGINT DEFAULT 0             -- Bank/gateway fees in paise
settlement_amount_paise BIGINT DEFAULT 0           -- Net settlement amount
fee_variance_paise    BIGINT DEFAULT 0             -- Difference between expected & actual fees
fee_variance_percentage NUMERIC(10,4)              -- Fee variance as percentage
```

### Transaction Details
```sql
transaction_date      DATE NOT NULL                -- Transaction date (for grouping)
transaction_timestamp TIMESTAMPTZ NOT NULL         -- Exact transaction time
payment_method        VARCHAR(50)                  -- UPI, CARD, NETBANKING, CREDIT_CARD, etc.
acquirer_code         VARCHAR(50)                  -- Bank code: HDFC, ICICI, AXIS, etc.
```

### Payment References (Critical for Matching)
```sql
utr                   VARCHAR(50)                  -- Unique Transaction Reference (bank reference)
rrn                   VARCHAR(50)                  -- Retrieval Reference Number (card transactions)
gateway_ref           VARCHAR(100)                 -- Payment gateway reference
```
**Usage Pattern**:
- **100% have UTR** (797/797) - Primary matching key
- **47% have RRN** (374/797) - Used for card transactions
- **UTR** is the golden key for reconciliation

### Source Tracking
```sql
source_type           VARCHAR(20) NOT NULL         -- How transaction entered system
                      CHECK IN ('MANUAL_UPLOAD', 'CONNECTOR', 'API_SYNC')
source_name           VARCHAR(100)                 -- Which connector/API/file
batch_id              VARCHAR(100)                 -- Upload batch identifier
```
**Current Distribution**:
- MANUAL_UPLOAD: 747 (93.8%)
- API_SYNC: 50 (6.2%)
- CONNECTOR: 0 (not used yet)

### Status & Reconciliation
```sql
status                VARCHAR(20) DEFAULT 'PENDING'
                      CHECK IN ('PENDING', 'RECONCILED', 'EXCEPTION', 'FAILED', 'UNMATCHED')
exception_reason      VARCHAR(50)                  -- Why transaction is in exception state
```

**Exception Reasons** (documented in column description):
- `AMOUNT_MISMATCH` - UTR found in both PG & Bank, but amounts differ
- `UNMATCHED_IN_BANK` - PG transaction exists, no matching bank record
- `MISSING_UTR` - PG transaction has no UTR (cannot match)
- `DUPLICATE_UTR` - Same UTR used in multiple PG transactions
- `UNMATCHED_IN_PG` - Bank record exists, no matching PG transaction

**Current Status Breakdown**:
```
RECONCILED:  673 transactions (84.4%) - ₹4.26 Cr
UNMATCHED:   122 transactions (15.3%) - ₹0.61 Cr
EXCEPTION:     1 transaction  (0.1%)  - ₹0.02 Cr
PENDING:       1 transaction  (0.1%)  - ₹150
```

### Settlement Tracking
```sql
settlement_batch_id   UUID                         -- FK to sp_v2_settlement_batches
settled_at            TIMESTAMP                    -- When settlement occurred
```
**Settlement Stats**: 249 transactions settled (31.2%)

### Audit Fields
```sql
created_at            TIMESTAMPTZ DEFAULT NOW()    -- Record creation time
updated_at            TIMESTAMPTZ DEFAULT NOW()    -- Last update time
```

---

## Indexes

### Primary & Unique Keys
- `sp_v2_transactions_pkey` - PRIMARY KEY (id)
- `sp_v2_transactions_transaction_id_key` - UNIQUE (transaction_id)

### Performance Indexes
```sql
idx_transactions_dashboard_summary
  -- Optimized for dashboard queries
  ON (transaction_date, source_type, status)

idx_transactions_exception_reason
  -- Fast exception filtering
  ON (exception_reason) WHERE status = 'EXCEPTION'
```

---

## Relationships

### Foreign Keys (Outbound)
```sql
settlement_batch_id → sp_v2_settlement_batches(id)
  -- Links transactions to settlement batches
```

### Referenced By (Inbound)
```sql
sp_v2_exception_workflow.transaction_id → sp_v2_transactions(id) ON DELETE CASCADE
  -- Each transaction can have exception workflow records
```

**Proposed** (from chargeback fix):
```sql
sp_v2_chargebacks.sp_transaction_id → sp_v2_transactions(id) ON DELETE SET NULL
  -- Chargebacks should link to original transactions
```

---

## Triggers

### Auto-Exception Creation
```sql
trg_create_exception_workflow
  AFTER INSERT OR UPDATE ON sp_v2_transactions
  EXECUTE FUNCTION fn_create_exception_workflow()
```
**Purpose**: Automatically creates exception workflow records when status = 'EXCEPTION'

---

## Data Quality & Patterns

### Payment Method Distribution
```
UPI:         489 transactions (61.4%)
CARD:        184 transactions (23.1%)
NETBANKING:   93 transactions (11.7%)
CREDIT_CARD:  14 transactions (1.8%)
DEBIT_CARD:   11 transactions (1.4%)
WALLET:        6 transactions (0.8%)
```

### Acquirer Distribution
```
HDFC:    546 transactions (68.5%) - ₹3.59 Cr
ICICI:   244 transactions (30.6%) - ₹1.28 Cr
UNKNOWN:   3 transactions (0.4%)  - ₹850
```

### Reference Field Completeness
- **UTR**: 100% (797/797) ✓ Excellent
- **RRN**: 47% (374/797) - Normal (only for card txns)
- **Gateway Ref**: Need to check
- **Batch ID**: Need to check

---

## Key Business Rules

### 1. Transaction Reconciliation Flow
```
┌──────────────┐
│ PENDING      │ ← New transaction inserted
└──────┬───────┘
       │
       ├─► Match with bank via UTR/RRN
       │
       ├─► RECONCILED (if matched successfully)
       │
       ├─► UNMATCHED (if no bank record found)
       │
       └─► EXCEPTION (if mismatch detected)
```

### 2. Exception Creation Rules
When a transaction becomes EXCEPTION:
1. `exception_reason` is set (AMOUNT_MISMATCH, etc.)
2. Trigger creates record in `sp_v2_exception_workflow`
3. Exception workflow handles resolution

### 3. Settlement Assignment
When a transaction is settled:
1. `settlement_batch_id` is assigned
2. `settled_at` timestamp is recorded
3. Transaction is included in merchant payout

---

## Critical Matching Keys

### Primary Matching Key: UTR
```sql
-- Match PG transaction with Bank statement
SELECT t.*, b.*
FROM sp_v2_transactions t
JOIN sp_v2_bank_statements b ON t.utr = b.utr
WHERE t.status = 'PENDING';
```

### Secondary Matching Key: RRN (for cards)
```sql
-- Match card transactions
SELECT t.*, b.*
FROM sp_v2_transactions t
JOIN sp_v2_bank_statements b ON t.rrn = b.rrn
WHERE t.payment_method IN ('CARD', 'CREDIT_CARD', 'DEBIT_CARD')
  AND t.status = 'PENDING';
```

### Tertiary Matching: Transaction ID
```sql
-- Match via transaction reference
SELECT t.*, b.*
FROM sp_v2_transactions t
JOIN sp_v2_bank_statements b ON t.transaction_id = b.transaction_id
WHERE t.status = 'PENDING';
```

---

## Related Tables

### 1. sp_v2_bank_statements
**Relationship**: Matched via UTR/RRN
**Purpose**: Bank records to reconcile against PG transactions

### 2. sp_v2_settlement_batches
**Relationship**: FK via settlement_batch_id
**Purpose**: Groups transactions for merchant settlement

### 3. sp_v2_exception_workflow
**Relationship**: FK via transaction_id
**Purpose**: Exception resolution workflow

### 4. sp_v2_chargebacks (proposed fix)
**Relationship**: Should FK via sp_transaction_id
**Purpose**: Links chargebacks to original transactions

---

## Common Queries

### 1. Daily Reconciliation Summary
```sql
SELECT 
  transaction_date,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'RECONCILED') as reconciled,
  COUNT(*) FILTER (WHERE status = 'UNMATCHED') as unmatched,
  COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exceptions,
  SUM(amount_paise) as gross_amount,
  SUM(amount_paise) FILTER (WHERE status = 'RECONCILED') as reconciled_amount
FROM sp_v2_transactions
WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY transaction_date
ORDER BY transaction_date DESC;
```

### 2. Merchant Reconciliation Rate
```sql
SELECT 
  merchant_id,
  merchant_name,
  COUNT(*) as total_transactions,
  COUNT(*) FILTER (WHERE status = 'RECONCILED') as reconciled,
  ROUND(COUNT(*) FILTER (WHERE status = 'RECONCILED')::NUMERIC / COUNT(*) * 100, 2) as recon_rate_pct,
  SUM(amount_paise) as total_amount
FROM sp_v2_transactions
WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY merchant_id, merchant_name
ORDER BY total_amount DESC;
```

### 3. Acquirer Performance
```sql
SELECT 
  acquirer_code,
  COUNT(*) as transactions,
  SUM(amount_paise) as volume,
  AVG(bank_fee_paise) as avg_fee,
  COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exceptions,
  ROUND(COUNT(*) FILTER (WHERE status = 'RECONCILED')::NUMERIC / COUNT(*) * 100, 2) as recon_rate
FROM sp_v2_transactions
WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY acquirer_code
ORDER BY volume DESC;
```

### 4. Exception Analysis
```sql
SELECT 
  exception_reason,
  COUNT(*) as count,
  SUM(amount_paise) as impacted_amount,
  ROUND(AVG(amount_paise), 0) as avg_transaction_size,
  ARRAY_AGG(DISTINCT acquirer_code) as acquirers_affected
FROM sp_v2_transactions
WHERE status = 'EXCEPTION'
  AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY exception_reason
ORDER BY count DESC;
```

### 5. Settlement Pending Transactions
```sql
SELECT 
  merchant_id,
  merchant_name,
  COUNT(*) as pending_txns,
  SUM(amount_paise) as pending_amount,
  MIN(transaction_date) as oldest_txn_date,
  COUNT(*) FILTER (WHERE settlement_batch_id IS NULL AND status = 'RECONCILED') as ready_for_settlement
FROM sp_v2_transactions
WHERE settled_at IS NULL
GROUP BY merchant_id, merchant_name
ORDER BY pending_amount DESC;
```

### 6. Transaction Matching Status
```sql
-- Find PG transactions that need bank matching
SELECT 
  transaction_id,
  merchant_name,
  amount_paise,
  utr,
  rrn,
  transaction_date,
  CASE 
    WHEN utr IS NULL THEN 'MISSING_UTR'
    ELSE 'HAS_UTR'
  END as match_readiness
FROM sp_v2_transactions
WHERE status = 'PENDING'
ORDER BY transaction_date DESC
LIMIT 100;
```

---

## Data Validation Rules

### Must-Have Fields
- ✓ transaction_id (unique)
- ✓ merchant_id
- ✓ amount_paise (> 0)
- ✓ transaction_date
- ✓ transaction_timestamp
- ✓ source_type

### Recommended Fields
- ✓ utr (required for reconciliation)
- ✓ payment_method
- ✓ acquirer_code

### Optional Fields
- merchant_name (can be joined from merchant_master)
- rrn (only for card transactions)
- gateway_ref (depends on PG)
- batch_id (only for batch uploads)

---

## Schema Improvements Needed

### 1. Add Card Network Field
Currently payment_method has CARD, CREDIT_CARD, DEBIT_CARD but no card network.

**Proposal**:
```sql
ALTER TABLE sp_v2_transactions 
ADD COLUMN card_network VARCHAR(20);

ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_card_network_check 
CHECK (card_network IN ('VISA', 'MASTERCARD', 'RUPAY', 'AMEX', 'DINERS'));
```

### 2. Add Merchant FK
Currently merchant_id is just a string with no FK constraint.

**Proposal**:
```sql
ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_merchant_id_fkey 
FOREIGN KEY (merchant_id) REFERENCES sp_v2_merchant_master(merchant_id);
```

### 3. Add Acquirer Validation
Currently acquirer_code has no constraint.

**Proposal**:
```sql
ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_acquirer_code_check 
CHECK (acquirer_code IN ('HDFC', 'ICICI', 'AXIS', 'SBI', 'YES_BANK', 'KOTAK', 'INDUSIND', 'UNKNOWN'));
```

### 4. Add Amount Validation
Ensure amounts are positive.

**Proposal**:
```sql
ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_amount_paise_check 
CHECK (amount_paise > 0);

ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_bank_fee_paise_check 
CHECK (bank_fee_paise >= 0);
```

---

## Performance Considerations

### Current Indexes are Good
✓ Primary key on id
✓ Unique index on transaction_id
✓ Composite index on (transaction_date, source_type, status)
✓ Partial index on exception_reason

### Additional Indexes to Consider
```sql
-- For UTR-based matching (most common reconciliation query)
CREATE INDEX idx_transactions_utr ON sp_v2_transactions(utr) 
WHERE utr IS NOT NULL;

-- For RRN-based matching (card transactions)
CREATE INDEX idx_transactions_rrn ON sp_v2_transactions(rrn) 
WHERE rrn IS NOT NULL;

-- For merchant analysis
CREATE INDEX idx_transactions_merchant_date 
ON sp_v2_transactions(merchant_id, transaction_date DESC);

-- For settlement queries
CREATE INDEX idx_transactions_settlement 
ON sp_v2_transactions(settlement_batch_id) 
WHERE settlement_batch_id IS NOT NULL;
```

---

## Summary

**sp_v2_transactions** is the **core reconciliation table** that:
1. Stores all PG transactions (797 currently)
2. Uses **UTR as primary matching key** (100% coverage)
3. Tracks reconciliation status (84.4% reconciled)
4. Links to settlements (31.2% settled)
5. Auto-creates exception workflows via trigger
6. Supports HDFC and ICICI acquirers primarily
7. Handles UPI (61%), CARD (23%), NETBANKING (12%) payment methods

**Critical for**:
- Reconciliation engine
- Settlement generation
- Exception management
- Chargeback linking (after schema fix)
- Financial reporting
