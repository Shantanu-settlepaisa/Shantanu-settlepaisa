# Complete User Flow: Manual Upload → Settlement → Merchant Payout

**Version:** 2.27.0  
**Date:** October 7, 2025  
**Database:** PostgreSQL (settlepaisa_v2)

---

## Quick Reference: User Actions → Database Operations

| User Action | API Endpoint | Tables Modified | Next Step Trigger |
|-------------|--------------|-----------------|-------------------|
| Upload PG CSV | POST /api/upload | INSERT → `sp_v2_transactions` | Manual recon trigger |
| Upload Bank CSV | POST /api/upload | INSERT → `sp_v2_bank_statements` | Manual recon trigger |
| Run Reconciliation | POST /recon/run | INSERT → `sp_v2_reconciliation_results`<br>UPDATE → `sp_v2_transactions.status` | Auto settlement calc |
| Approve Settlement | POST /settlement/approve | UPDATE → `sp_v2_settlement_batches.status` | Bank transfer |
| Process Payout | POST /settlement/transfer | INSERT → `sp_v2_settlement_bank_transfers`<br>UPDATE → `sp_v2_settlement_batches.status` | Complete |

---

## Stage 1: Manual File Upload

### User Action
Ops team uploads CSV files via dashboard at `/ops/upload`:
- **PG Transactions CSV**: Contains transaction_id, UTR, amount, payment_method
- **Bank Statements CSV**: Contains UTR, amount, transaction_date, bank_name

### API Called
```
POST http://13.201.179.44:5109/api/upload/multiple
Content-Type: multipart/form-data
Files: pgTransactions.csv, bankStatements.csv
```

### Code Handler
`services/api/file-upload-v2.cjs` (Port 5109)

### What Happens
1. **CSV Parsing**: Files parsed using `csv-parser` library
2. **Format Detection**: Auto-detects columns to identify PG vs Bank data
3. **V1→V2 Mapping**: Legacy SabPaisa V1 format converted to V2 schema
4. **Validation**: Checks required fields (transaction_id, UTR, amount, date)
5. **Duplicate Check**: Prevents re-upload of same transaction_id

### Database Operations

#### Table: `sp_v2_transactions`
```sql
INSERT INTO sp_v2_transactions (
  transaction_id,      -- Primary key from CSV
  merchant_id,         -- Extracted or default
  gateway_ref,         -- Gateway reference ID
  utr,                 -- UTR for reconciliation matching
  amount_paise,        -- Amount in paise (₹ × 100)
  currency,            -- Default 'INR'
  payment_method,      -- UPI/CARD/NETBANKING
  status,              -- Initially 'PENDING'
  transaction_date,    -- Transaction date
  transaction_timestamp, -- Full timestamp
  source_type,         -- 'MANUAL_UPLOAD'
  source_name,         -- Filename
  created_at           -- Upload timestamp
) VALUES (...);
```

**Example Data:**
| transaction_id | merchant_id | utr | amount_paise | status | source_type |
|----------------|-------------|-----|--------------|--------|-------------|
| TXN_001 | MERCH_123 | UTR123456 | 100000 | PENDING | MANUAL_UPLOAD |

#### Table: `sp_v2_bank_statements`
```sql
INSERT INTO sp_v2_bank_statements (
  bank_ref,           -- Bank's internal reference
  bank_name,          -- HDFC/AXIS/ICICI/etc
  utr,                -- UTR for matching with PG
  amount_paise,       -- Credited amount in paise
  transaction_date,   -- Credit date
  value_date,         -- Value date (if different)
  debit_credit,       -- Always 'CREDIT'
  source_type,        -- 'MANUAL_UPLOAD'
  source_file,        -- Filename
  processed,          -- FALSE initially
  created_at          -- Upload timestamp
) VALUES (...);
```

**Example Data:**
| id | bank_name | utr | amount_paise | processed | source_type |
|----|-----------|-----|--------------|-----------|-------------|
| 5635 | HDFC | UTR123456 | 100000 | FALSE | MANUAL_UPLOAD |

### Result
Upload service returns:
```json
{
  "success": true,
  "pgTransactions": {"processed": 150, "inserted": 148, "duplicates": 2},
  "bankStatements": {"processed": 145, "inserted": 145, "duplicates": 0}
}
```

### Next Step
User manually triggers reconciliation from dashboard.

---

## Stage 2: Reconciliation Process

### User Action
Ops team clicks "Run Reconciliation" button, selects:
- Date range (e.g., "2025-10-07")
- Merchant ID (optional, or "ALL")
- Source type (MANUAL_UPLOAD)

### API Called
```
POST http://13.201.179.44:5103/recon/run
{
  "date": "2025-10-07",
  "merchantId": "MERCH_123",
  "sourceType": "MANUAL_UPLOAD"
}
```

### Code Handler
`services/recon-api/jobs/runReconciliation.js` (Port 5103)

### What Happens

#### 2.1 Data Fetching
```sql
-- Fetch PG transactions for the date
SELECT * FROM sp_v2_transactions 
WHERE source_type = 'MANUAL_UPLOAD' 
AND transaction_date = '2025-10-07'
AND (merchant_id = 'MERCH_123' OR 'MERCH_123' = 'ALL');

-- Fetch Bank statements for the date  
SELECT * FROM sp_v2_bank_statements
WHERE source_type = 'MANUAL_UPLOAD'
AND transaction_date = '2025-10-07';
```

#### 2.2 Normalization
- **PG Data**: Convert amounts to paise, standardize UTR format
- **Bank Data**: Apply bank-specific column mapping (HDFC/AXIS/ICICI formats differ)

#### 2.3 Matching Logic
**Primary Matching Strategy:** UTR-based matching

```javascript
for (pgTxn of pgTransactions) {
  bankMatch = bankRecords.find(bank => bank.utr === pgTxn.utr);
  
  if (bankMatch) {
    if (pgTxn.amount === bankMatch.amount) {
      // Perfect match
      matched.push({pg: pgTxn, bank: bankMatch, matchScore: 100});
    } else {
      // Amount mismatch exception
      exceptions.push({
        pg: pgTxn, 
        bank: bankMatch, 
        reasonCode: 'AMOUNT_MISMATCH',
        delta: bankMatch.amount - pgTxn.amount
      });
    }
  } else {
    // No bank match found
    unmatchedPg.push(pgTxn);
  }
}
```

**Exception Types Detected:**
- `UTR_MISSING_OR_INVALID`: PG transaction has no UTR
- `DUPLICATE_PG_ENTRY`: Same UTR in multiple PG records
- `DUPLICATE_BANK_ENTRY`: Same UTR in multiple bank records  
- `AMOUNT_MISMATCH`: Amounts differ beyond tolerance (₹0.01)
- `FEE_MISMATCH`: Likely bank fee (₹2-₹5 difference)
- `DATE_OUT_OF_WINDOW`: Dates > T+2 apart

### Database Operations

#### Table: `sp_v2_reconciliation_jobs`
```sql
INSERT INTO sp_v2_reconciliation_jobs (
  job_id,              -- UUID for this job
  job_name,            -- "Reconciliation Job 2025-10-07"
  date_from,           -- Start date
  date_to,             -- End date
  total_pg_records,    -- 148
  total_bank_records,  -- 145
  matched_records,     -- 142
  unmatched_pg,        -- 6
  unmatched_bank,      -- 3
  exception_records,   -- 0
  status,              -- 'COMPLETED'
  processing_start,    -- NOW()
  processing_end       -- NOW() + duration
) VALUES (...) RETURNING job_id;
```

#### Table: `sp_v2_reconciliation_results` (MATCHED)
```sql
-- For each matched transaction
INSERT INTO sp_v2_reconciliation_results (
  job_id,              -- FK to reconciliation_jobs
  pg_transaction_id,   -- 'TXN_001'
  bank_statement_id,   -- 5635
  match_status,        -- 'MATCHED'
  match_score,         -- 100.00
  pg_amount_paise,     -- 100000
  bank_amount_paise,   -- 100000
  variance_paise,      -- 0
  created_at           -- NOW()
) VALUES (...);
```

**UPSERT Logic:** Uses manual SELECT-then-INSERT/UPDATE:
```sql
-- Check if result exists
SELECT id FROM sp_v2_reconciliation_results 
WHERE pg_transaction_id = 'TXN_001';

-- If exists: UPDATE
UPDATE sp_v2_reconciliation_results 
SET job_id = $newJobId, 
    bank_statement_id = $bankId,
    match_status = 'MATCHED',
    pg_amount_paise = $pgAmount,
    bank_amount_paise = $bankAmount,
    created_at = NOW()
WHERE pg_transaction_id = 'TXN_001';

-- If not exists: INSERT
INSERT INTO sp_v2_reconciliation_results (...) VALUES (...);
```

#### Table: `sp_v2_reconciliation_results` (UNMATCHED_PG)
```sql
-- For PG transactions without bank match
INSERT INTO sp_v2_reconciliation_results (
  job_id,
  pg_transaction_id,   -- 'TXN_007'
  bank_statement_id,   -- NULL
  match_status,        -- 'UNMATCHED_PG'
  pg_amount_paise,     -- 50000
  bank_amount_paise,   -- NULL
  variance_paise,      -- 50000 (full amount)
  created_at
) VALUES (...);
```

#### Table: `sp_v2_reconciliation_results` (EXCEPTION)
```sql
-- For transactions with issues
INSERT INTO sp_v2_reconciliation_results (
  job_id,
  pg_transaction_id,
  bank_statement_id,
  match_status,        -- 'EXCEPTION'
  exception_reason_code, -- 'AMOUNT_MISMATCH'
  exception_severity,    -- 'MEDIUM'
  exception_message,     -- 'Amount differs by ₹2.00'
  pg_amount_paise,       -- 100000
  bank_amount_paise,     -- 99800
  variance_paise,        -- -200
  created_at
) VALUES (...);
```

#### Update Transaction Status
```sql
-- Mark matched transactions as reconciled
UPDATE sp_v2_transactions 
SET status = 'RECONCILED', updated_at = NOW()
WHERE transaction_id IN (SELECT pg_transaction_id 
                         FROM sp_v2_reconciliation_results 
                         WHERE job_id = $jobId 
                         AND match_status = 'MATCHED');

-- Mark unmatched transactions  
UPDATE sp_v2_transactions
SET status = 'UNMATCHED', updated_at = NOW()
WHERE transaction_id IN (SELECT pg_transaction_id
                         FROM sp_v2_reconciliation_results
                         WHERE job_id = $jobId
                         AND match_status = 'UNMATCHED_PG');

-- Mark exception transactions
UPDATE sp_v2_transactions
SET status = 'EXCEPTION', 
    exception_reason = exception_reason_code,
    updated_at = NOW()
WHERE transaction_id IN (SELECT pg_transaction_id
                         FROM sp_v2_reconciliation_results
                         WHERE job_id = $jobId
                         AND match_status = 'EXCEPTION');
```

#### Mark Bank Statements as Processed
```sql
UPDATE sp_v2_bank_statements
SET processed = TRUE, processed_at = NOW()
WHERE id IN (SELECT bank_statement_id 
             FROM sp_v2_reconciliation_results 
             WHERE job_id = $jobId
             AND match_status = 'MATCHED');
```

### Result
Reconciliation returns:
```json
{
  "success": true,
  "jobId": "4ae1f584-cec6-491e-a308-c81cfb15acd3",
  "status": "completed",
  "counters": {
    "matched": 142,
    "unmatchedPg": 6,
    "unmatchedBank": 3,
    "exceptions": 0
  }
}
```

### Next Step
**Automatic Trigger:** If `matched > 0`, settlement calculation starts immediately.

---

## Stage 3: Settlement Calculation

### Trigger Condition
**Automatic:** Reconciliation job with `matched_count > 0` triggers settlement calculation.

### API Called
```
POST http://13.201.179.44:5109/settlement/calculate
{
  "merchantId": "MERCH_123",
  "transactions": [matched_transaction_ids]
}
```

### Code Handler
`services/settlement-engine/settlement-calculator-v1-logic.cjs`

### What Happens

#### 3.1 Merchant Configuration Fetch
```sql
-- Get merchant master data (synced from SabPaisa V1)
SELECT 
  merchant_id, merchant_name, 
  rolling_reserve_enabled, rolling_reserve_percentage,
  reserve_hold_days, settlement_cycle, is_active
FROM sp_v2_merchant_master 
WHERE merchant_id = 'MERCH_123' AND is_active = true;

-- Get settlement config (bank account details)
SELECT 
  account_number, ifsc_code, account_holder_name,
  settlement_frequency, min_settlement_amount_paise
FROM sp_v2_merchant_settlement_config
WHERE merchant_id = 'MERCH_123' AND is_active = true;

-- Get commission config (rates per payment mode)
SELECT 
  commission_value, commission_type, gst_percentage,
  payment_mode, bank_code
FROM sp_v2_merchant_commission_config
WHERE merchant_id = 'MERCH_123' 
  AND payment_mode = 'UPI'
  AND is_active = true;

-- Get fee bearer config (who pays gateway fees)
SELECT fee_bearer_code
FROM sp_v2_merchant_fee_bearer_config
WHERE merchant_id = 'MERCH_123' 
  AND payment_mode_id = 6  -- UPI
  AND is_active = true;
```

**Example Result:**
| merchant_id | commission_rate | reserve_percentage | gst_applicable | tds_applicable |
|-------------|-----------------|--------------------|--------------------|----------------|
| MERCH_123 | 1.8% | 5.0% | TRUE | TRUE |

#### 3.2 Volume-Based Tier Calculation
```sql
-- Calculate 30-day transaction volume
SELECT COALESCE(SUM(amount_paise), 0) as total_volume_paise
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH_123'
AND status IN ('RECONCILED', 'SUCCESS', 'PENDING')
AND transaction_date >= CURRENT_DATE - INTERVAL '30 days';

-- Find applicable commission tier
SELECT tier_name, commission_percentage
FROM sp_v2_commission_tiers
WHERE is_active = TRUE
AND min_volume_paise <= $calculatedVolume
ORDER BY min_volume_paise DESC
LIMIT 1;
```

#### 3.3 Settlement Math (V1 Compatible Logic)

**For each matched transaction:**
```javascript
grossAmount = transaction.amount_paise;  // e.g., 100000 paise (₹1000)

// Step 1: Calculate commission
commission = grossAmount × commission_rate;  // 100000 × 1.8% = 1800 paise

// Step 2: Calculate GST on commission
gst = commission × 0.18;  // 1800 × 18% = 324 paise

// Step 3: Calculate TDS  
tds = grossAmount × 0.01;  // 100000 × 1% = 1000 paise

// Step 4: Calculate rolling reserve
reserve = (grossAmount - commission - gst - tds) × 0.05;
// (100000 - 1800 - 324 - 1000) × 5% = 4843.8 ≈ 4844 paise

// Step 5: Net settlement amount
netAmount = grossAmount - commission - gst - tds - reserve;
// 100000 - 1800 - 324 - 1000 - 4844 = 92032 paise (₹920.32)
```

**Settlement Breakdown Example:**
| Component | Formula | Amount (₹) |
|-----------|---------|------------|
| Gross Amount | Transaction total | 1000.00 |
| Commission (1.8%) | Gross × 1.8% | -18.00 |
| GST on Commission (18%) | Commission × 18% | -3.24 |
| TDS (1%) | Gross × 1% | -10.00 |
| Rolling Reserve (5%) | (Gross - Comm - GST - TDS) × 5% | -48.44 |
| **Net Settlement** | Gross - all deductions | **920.32** |

### Database Operations

#### Table: `sp_v2_settlement_batches`
```sql
INSERT INTO sp_v2_settlement_batches (
  batch_id,            -- Generated UUID
  merchant_id,         -- 'MERCH_123'
  cycle_date,          -- '2025-10-07'
  total_transactions,  -- 142
  gross_amount_paise,  -- 14200000 (₹142,000)
  total_commission_paise, -- 255600 (₹2,556)
  total_gst_paise,     -- 46008 (₹460.08)
  total_tds_paise,     -- 142000 (₹1,420)
  total_reserve_paise, -- 687819 (₹6,878.19)
  net_amount_paise,    -- 13068573 (₹130,685.73)
  status,              -- 'PENDING_APPROVAL'
  created_at,          -- NOW()
  created_by           -- 'system'
) VALUES (...) RETURNING batch_id;
```

#### Table: `sp_v2_settlement_items`
```sql
-- For each transaction in the settlement
INSERT INTO sp_v2_settlement_items (
  settlement_batch_id, -- FK to settlement_batches
  transaction_id,      -- 'TXN_001'
  amount_paise,        -- 100000 (gross)
  commission_paise,    -- 1800
  gst_paise,           -- 324
  tds_paise,           -- 1000
  reserve_paise,       -- 4844
  net_paise,           -- 92032
  commission_rate,     -- 1.8
  created_at           -- NOW()
) VALUES (...);
```

**Example Settlement Items:**
| id | transaction_id | amount_paise | commission_paise | net_paise |
|----|----------------|--------------|------------------|-----------|
| 1 | TXN_001 | 100000 | 1800 | 92032 |
| 2 | TXN_002 | 50000 | 900 | 46016 |
| 3 | TXN_003 | 75000 | 1350 | 69024 |

#### Link Transactions to Settlement
```sql
UPDATE sp_v2_transactions
SET settlement_batch_id = $batchId,
    settlement_date = NOW(),
    updated_at = NOW()
WHERE transaction_id IN (SELECT transaction_id 
                         FROM sp_v2_settlement_items 
                         WHERE settlement_batch_id = $batchId);
```

#### Table: `sp_v2_rolling_reserve_ledger`
```sql
-- Track rolling reserve holds
INSERT INTO sp_v2_rolling_reserve_ledger (
  settlement_batch_id,  -- FK to settlement_batches
  merchant_id,          -- 'MERCH_123'
  reserve_amount_paise, -- 687819
  hold_date,            -- '2025-10-07'
  release_date,         -- '2025-10-37' (T+30 days)
  status,               -- 'HELD'
  created_at            -- NOW()
) VALUES (...);
```

### Result
Settlement calculation returns:
```json
{
  "success": true,
  "batchId": "BATCH_20251007_MERCH123",
  "summary": {
    "transactions": 142,
    "grossAmount": 1420000.00,
    "commission": 2556.00,
    "gst": 460.08,
    "tds": 1420.00,
    "reserve": 6878.19,
    "netAmount": 130685.73
  },
  "status": "PENDING_APPROVAL"
}
```

### Next Step
User must **manually approve** settlement batch before bank transfer.

---

## Stage 4: Settlement Approval & Bank Transfer

### User Action 1: Approve Settlement
Finance team reviews settlement batch and clicks "Approve" button.

### API Called
```
POST http://13.201.179.44:5109/settlement/approve
{
  "batchId": "BATCH_20251007_MERCH123"
}
```

### Database Operations
```sql
-- Update batch status to approved
UPDATE sp_v2_settlement_batches
SET status = 'APPROVED',
    approved_at = NOW(),
    approved_by = 'finance_user_id'
WHERE batch_id = 'BATCH_20251007_MERCH123';
```

### User Action 2: Process Bank Transfer
Finance team initiates bank transfer (NEFT/RTGS/IMPS).

### API Called
```
POST http://13.201.179.44:5109/settlement/transfer
{
  "batchId": "BATCH_20251007_MERCH123",
  "transferMode": "NEFT",
  "utrNumber": "BANK_UTR_789"
}
```

### Database Operations

#### Table: `sp_v2_settlement_bank_transfers`
```sql
INSERT INTO sp_v2_settlement_bank_transfers (
  settlement_batch_id,  -- 'BATCH_20251007_MERCH123'
  merchant_id,          -- 'MERCH_123'
  amount_paise,         -- 13068573 (net amount)
  bank_account_number,  -- From merchant config
  ifsc_code,            -- From merchant config
  beneficiary_name,     -- Merchant name
  transfer_mode,        -- 'NEFT'
  utr_number,           -- 'BANK_UTR_789'
  transfer_date,        -- NOW()
  status,               -- 'SUCCESS'
  created_at,           -- NOW()
  created_by            -- 'finance_user_id'
) VALUES (...);
```

#### Update Settlement Status
```sql
-- Mark settlement as completed
UPDATE sp_v2_settlement_batches
SET status = 'COMPLETED',
    settlement_completed_at = NOW(),
    payout_utr = 'BANK_UTR_789'
WHERE batch_id = 'BATCH_20251007_MERCH123';
```

#### Update Transaction Status
```sql
-- Mark transactions as settled
UPDATE sp_v2_transactions
SET status = 'SETTLED',
    settlement_utr = 'BANK_UTR_789',
    updated_at = NOW()
WHERE settlement_batch_id = 'BATCH_20251007_MERCH123';
```

### Result
```json
{
  "success": true,
  "message": "Settlement transferred successfully",
  "utr": "BANK_UTR_789",
  "amount": 130685.73,
  "merchant": "MERCH_123",
  "status": "COMPLETED"
}
```

---

## Complete Transaction Status Flow

```
┌─────────────────┐
│ UPLOAD          │
│ status: PENDING │
└────────┬────────┘
         │
         ▼
┌────────────────────┐
│ RECONCILIATION     │
└────────┬───────────┘
         │
    ┌────┴────┬──────────┬─────────────┐
    │         │          │             │
    ▼         ▼          ▼             ▼
┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│MATCHED │ │UNMATCHED │ │EXCEPTION │ │UNMATCHED │
│(142)   │ │PG (6)    │ │(0)       │ │BANK (3)  │
└───┬────┘ └──────────┘ └──────────┘ └──────────┘
    │
    │ (Auto-trigger settlement)
    │
    ▼
┌────────────────────┐
│ SETTLEMENT         │
│ status: PENDING    │
│ APPROVAL           │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ APPROVED           │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ BANK TRANSFER      │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ COMPLETED/SETTLED  │
└────────────────────┘
```

---

## Database Table Relationships Diagram

```
┌──────────────────────┐
│ sp_v2_transactions   │
│ ──────────────────── │
│ PK: transaction_id   │◄─────┐
│ merchant_id          │      │
│ utr                  │      │
│ amount_paise         │      │
│ status               │      │
│ settlement_batch_id  │──┐   │
└──────────────────────┘  │   │
                          │   │
┌──────────────────────┐  │   │
│ sp_v2_bank_statements│  │   │
│ ──────────────────── │  │   │
│ PK: id               │◄─┼───┼───────┐
│ utr                  │  │   │       │
│ amount_paise         │  │   │       │
│ processed            │  │   │       │
└──────────────────────┘  │   │       │
                          │   │       │
┌──────────────────────┐  │   │       │
│ sp_v2_reconciliation │  │   │       │
│ _results             │  │   │       │
│ ──────────────────── │  │   │       │
│ PK: id               │  │   │       │
│ job_id               │──┼───┼───┐   │
│ pg_transaction_id    │──┘   │   │   │
│ bank_statement_id    │──────┘   │   │
│ match_status         │          │   │
└──────────────────────┘          │   │
                                  │   │
┌──────────────────────┐          │   │
│ sp_v2_reconciliation │          │   │
│ _jobs                │          │   │
│ ──────────────────── │          │   │
│ PK: job_id           │◄─────────┘   │
│ matched_records      │              │
│ status               │              │
└──────────────────────┘              │
                                      │
┌──────────────────────┐              │
│ sp_v2_settlement     │              │
│ _batches             │              │
│ ──────────────────── │              │
│ PK: batch_id         │◄─────────────┘
│ merchant_id          │
│ net_amount_paise     │
│ status               │◄─────┐
└──────────┬───────────┘      │
           │                  │
           ▼                  │
┌──────────────────────┐      │
│ sp_v2_settlement     │      │
│ _items               │      │
│ ──────────────────── │      │
│ PK: id               │      │
│ settlement_batch_id  │──────┘
│ transaction_id       │──────┐
│ net_paise            │      │
└──────────────────────┘      │
                              │
┌──────────────────────┐      │
│ sp_v2_settlement     │      │
│ _bank_transfers      │      │
│ ──────────────────── │      │
│ PK: id               │      │
│ settlement_batch_id  │──────┘
│ utr_number           │
│ status               │
└──────────────────────┘
```

---

## Key Data Transformation Points

### 1. Upload → Transactions
- **Input**: CSV with rupees (e.g., "1000.50")
- **Transform**: Convert to paise (100050)
- **Output**: `sp_v2_transactions.amount_paise = 100050`

### 2. Reconciliation → Results
- **Input**: PG txn (UTR=ABC123, ₹1000) + Bank stmt (UTR=ABC123, ₹1000)
- **Match**: UTR match + amount match
- **Output**: `sp_v2_reconciliation_results` with `match_status='MATCHED'`

### 3. Settlement → Items
- **Input**: Matched txn (₹1000 gross)
- **Calculate**: 
  - Commission: ₹18.00
  - GST: ₹3.24
  - TDS: ₹10.00
  - Reserve: ₹48.44
- **Output**: `sp_v2_settlement_items.net_paise = 92032` (₹920.32)

---

## Exception Handling & Edge Cases

### Duplicate Uploads
**Detection:** Check existing `transaction_id` before INSERT
```sql
SELECT 1 FROM sp_v2_transactions 
WHERE transaction_id = $newTxnId AND source_type = 'MANUAL_UPLOAD';
```
**Action:** Skip duplicate, return warning in upload response

### UTR Mismatch Formats
**Problem:** Bank uses "UTR123" but PG uses "123"
**Solution:** Normalize UTR during reconciliation:
```javascript
normalizedUTR = utr.toUpperCase().replace(/[^A-Z0-9]/g, '');
```

### Amount Tolerance
**Problem:** ₹1000.00 (PG) vs ₹999.98 (Bank) - rounding error
**Solution:** Tolerance of ₹0.01
```javascript
if (Math.abs(pgAmount - bankAmount) <= 1) {
  // Treat as matched with variance
}
```

### Missing Merchant Config
**Problem:** Settlement calculation fails if merchant not in `sp_v2_merchant_master`
**Solution:** Run sync from SabPaisa V1 database or create manual entry with default rates

**Note:** `sp_v2_merchants` (UUID-based) is ONLY used for webhook transactions (`sp_v2_transactions_v1`), NOT for manual upload settlements. Manual upload flow uses `sp_v2_merchant_master` (VARCHAR merchant_id) which is synced from SabPaisa V1.

### Rolling Reserve Release
**Automatic Process:** Cron job runs daily:
```sql
-- Find reserves eligible for release (T+30 days)
UPDATE sp_v2_rolling_reserve_ledger
SET status = 'RELEASED', released_at = NOW()
WHERE release_date <= CURRENT_DATE AND status = 'HELD';

-- Credit merchant account
INSERT INTO sp_v2_merchant_wallet_credits (
  merchant_id, amount_paise, source_type, created_at
) SELECT merchant_id, reserve_amount_paise, 'RESERVE_RELEASE', NOW()
  FROM sp_v2_rolling_reserve_ledger
  WHERE status = 'RELEASED';
```

---

## Performance Optimizations

### Critical Indexes
```sql
-- Upload optimization
CREATE INDEX idx_transactions_upload 
ON sp_v2_transactions(source_type, transaction_date) 
WHERE source_type = 'MANUAL_UPLOAD';

-- Reconciliation optimization
CREATE INDEX idx_bank_statements_utr 
ON sp_v2_bank_statements(utr) WHERE processed = FALSE;

CREATE INDEX idx_reconciliation_results_job_status
ON sp_v2_reconciliation_results(job_id, match_status);

-- Settlement optimization
CREATE INDEX idx_settlement_batches_merchant_status
ON sp_v2_settlement_batches(merchant_id, status);
```

### Batch Processing
- **Upload**: Process 1000 rows per batch
- **Reconciliation**: Stream processing for large datasets
- **Settlement**: Group by merchant for parallel processing

---

## Audit Trail & Compliance

Every operation logged in:
- `sp_v2_reconciliation_jobs`: Complete job history
- `sp_v2_settlement_batches`: Settlement approvals and transfers
- All tables have `created_at`, `updated_at` timestamps
- User IDs tracked in `created_by`, `approved_by` fields

---

## Important: Two Merchant Table Systems

⚠️ **Critical Understanding:** The codebase uses TWO separate merchant table systems:

### System 1: Webhook Flow (UUID-based)
**Table:** `sp_v2_merchants` (UUID primary key)
- **Used By:** `sp_v2_transactions_v1` (webhook/PG ingestion transactions)
- **Foreign Key:** `sp_v2_transactions_v1.merchant_id` → `sp_v2_merchants.id` (UUID)
- **Purpose:** Basic merchant metadata (name, GSTIN, PAN, KYC status, risk score)
- **NOT used for settlements in manual upload flow**

### System 2: Settlement Flow (VARCHAR-based)
**Tables:** 
- `sp_v2_merchant_master` (VARCHAR merchant_id primary key)
- `sp_v2_merchant_settlement_config` (bank account details)
- `sp_v2_merchant_commission_config` (commission rates per payment mode/bank)
- `sp_v2_merchant_fee_bearer_config` (fee bearer configuration)

**Used By:** Settlement calculation engine for both manual uploads and webhook transactions
**Synced From:** SabPaisa V1 database (settlepaisa_v1)
**Purpose:** Complete settlement configuration and commission calculation

### Why Two Systems?

1. **Legacy Compatibility**: `sp_v2_merchant_master` maintains VARCHAR merchant_id for backwards compatibility with SabPaisa V1's `client_code`
2. **Webhook Requirements**: `sp_v2_merchants` uses UUID for modern webhook transaction tracking
3. **Data Sync**: `sp_v2_merchant_master` is automatically synced from V1 using `sync-sabpaisa-configs.cjs`

### Which to Use?

- **Manual Upload Reconciliation → Settlement**: Use `sp_v2_merchant_master` + config tables
- **Webhook Transaction Storage**: Use `sp_v2_merchants` (UUID)
- **Settlement Calculation (both flows)**: Always use `sp_v2_merchant_master` + config tables

---

## Summary: Key Tables & Their Purpose

| Table | Purpose | When Written | Key Data |
|-------|---------|--------------|----------|
| `sp_v2_transactions` | PG transaction master (manual upload) | Upload | transaction_id, UTR, amount, status |
| `sp_v2_transactions_v1` | PG transaction master (webhooks) | Webhook | pgw_ref, merchant_id (UUID FK) |
| `sp_v2_merchants` | Merchant metadata (UUID, webhooks only) | Manual/Sync | id (UUID), name, GSTIN, bank_account |
| `sp_v2_merchant_master` | Merchant master (VARCHAR, settlements) | Sync from V1 | merchant_id (VARCHAR), reserve config |
| `sp_v2_merchant_commission_config` | Commission rates | Sync from V1 | merchant_id, payment_mode, commission_value |
| `sp_v2_merchant_settlement_config` | Bank account details | Sync from V1 | account_number, ifsc_code |
| `sp_v2_bank_statements` | Bank statement master | Upload | UTR, amount, bank_name |
| `sp_v2_reconciliation_jobs` | Job tracking | Reconciliation start | job_id, counts, status |
| `sp_v2_reconciliation_results` | Match results | Reconciliation end | pg_transaction_id, match_status |
| `sp_v2_settlement_batches` | Settlement summary | Settlement calc | batch_id, net_amount, status |
| `sp_v2_settlement_items` | Line-item breakdown | Settlement calc | transaction_id, commission, net |
| `sp_v2_settlement_bank_transfers` | Payout tracking | Bank transfer | utr_number, amount, status |
| `sp_v2_rolling_reserve_ledger` | Reserve management | Settlement calc | reserve_amount, release_date |

---

---

## Related Documentation

📄 **[Migration Status: v1 to v2 Transactions](./MIGRATION_V1_TO_V2_STATUS.md)**  
Detailed analysis of the ongoing migration from `sp_v2_transactions_v1` (UUID, webhooks) to unified `sp_v2_transactions` (VARCHAR, multi-source). 

**Key Findings:**
- ✅ 376 webhook transactions migrated to v2
- ⚠️ v1 table still active (hybrid state)
- ⚠️ Merchant ID type mismatch requires resolution

---

**Document Version:** 1.0  
**Last Updated:** October 7, 2025  
**Maintained By:** SettlePaisa Ops Team
