# Settlement Data Flow - SettlePaisa V2

## Overview
This document explains how transaction data flows into settlement batches and the relationship between tables.

---

## Table Relationships

```
sp_v2_transactions (205 records for MERCH001)
    ↓ (transaction_id)
sp_v2_settlement_items (62 records)
    ↓ (settlement_batch_id)
sp_v2_settlement_batches (10 batches)
    ↓ (settlement_run_id - optional)
sp_v2_settlement_schedule_runs (11 runs)
```

---

## Data Flow Explanation

### 1. **Transaction Creation** (`sp_v2_transactions`)
- Transactions are created when payments are processed
- Status progression: `INITIATED` → `SUCCESS` → `RECONCILED`
- For MERCH001: **205 transactions** total
  - **62 transactions** are in settlement batches
  - **143 transactions** are NOT in batches yet:
    - 108 with status `RECONCILED` (eligible for settlement)
    - 35 with status `UNMATCHED` (need reconciliation first)

### 2. **Settlement Item Creation** (`sp_v2_settlement_items`)
- Acts as a **many-to-many junction table**
- Links individual transactions to settlement batches
- Contains commission/fee breakdown per transaction:
  - `amount_paise` - Transaction amount
  - `commission_paise` - Processing fee
  - `gst_paise` - GST on commission
  - `reserve_paise` - Rolling reserve (if applicable)
  - `net_paise` - Amount to be settled (after fees)

**Example:**
```sql
Transaction: TXN20250923022 (₹3,352.04)
  → Settlement Item: commission ₹179.03, GST ₹32.23
  → Net Amount: ₹3,140.01
  → Settlement Batch: 9b33ea01-5d06-4885-b40a-77e3e27edc2c
```

### 3. **Settlement Batch Creation** (`sp_v2_settlement_batches`)
- Groups multiple transactions into a batch
- One batch per merchant per settlement cycle
- Contains aggregated totals:
  - `total_transactions` - Count of transactions
  - `gross_amount_paise` - Sum of transaction amounts
  - `total_commission_paise` - Sum of fees
  - `total_gst_paise` - Sum of GST
  - `net_amount_paise` - Amount to settle (gross - fees - gst)

**For MERCH001:**
- 10 settlement batches created
- Total 62 transactions settled
- Batches range from 1 to 13 transactions each

### 4. **Settlement Schedule Run** (`sp_v2_settlement_schedule_runs`)
- Orchestrates the settlement process
- Triggered by:
  - `cron` - Automated daily/periodic runs
  - `manual` - Manual execution by ops team
  - `api` - API-triggered settlements
- Tracks execution metrics:
  - Merchants processed
  - Batches created
  - Total amount settled
  - Errors/failures

---

## Settlement Lifecycle

### **Phase 1: Transaction Processing**
```sql
-- Transactions are created by payment gateway
INSERT INTO sp_v2_transactions (transaction_id, merchant_id, amount_paise, status)
VALUES ('TXN20250923022', 'MERCH001', 335204, 'INITIATED');

-- Status updates as payment progresses
UPDATE sp_v2_transactions SET status = 'SUCCESS' WHERE transaction_id = 'TXN20250923022';

-- After bank reconciliation
UPDATE sp_v2_transactions SET status = 'RECONCILED' WHERE transaction_id = 'TXN20250923022';
```

### **Phase 2: Settlement Batch Creation** (Manual Process)
**Currently NO automatic trigger exists!** Settlement batches are created manually or via scheduled jobs.

```sql
-- 1. Create settlement run
INSERT INTO sp_v2_settlement_schedule_runs (run_date, trigger_type, status)
VALUES ('2025-10-02', 'manual', 'running');

-- 2. Create settlement batch per merchant
INSERT INTO sp_v2_settlement_batches (merchant_id, cycle_date, settlement_run_id, status)
VALUES ('MERCH001', '2025-10-02', <run_id>, 'PENDING_APPROVAL');

-- 3. Add transactions to batch (settlement items)
INSERT INTO sp_v2_settlement_items (settlement_batch_id, transaction_id, amount_paise, net_paise)
SELECT 
    <batch_id>,
    transaction_id,
    amount_paise,
    amount_paise - (commission + gst) as net_paise
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
    AND status = 'RECONCILED'
    AND transaction_id NOT IN (SELECT transaction_id FROM sp_v2_settlement_items);

-- 4. Update batch totals
UPDATE sp_v2_settlement_batches SET
    total_transactions = (SELECT COUNT(*) FROM sp_v2_settlement_items WHERE settlement_batch_id = <batch_id>),
    net_amount_paise = (SELECT SUM(net_paise) FROM sp_v2_settlement_items WHERE settlement_batch_id = <batch_id>)
WHERE id = <batch_id>;
```

### **Phase 3: Settlement Processing**
```sql
-- 5. Approve settlement
UPDATE sp_v2_settlement_batches SET status = 'APPROVED' WHERE id = <batch_id>;

-- 6. Create bank transfer
INSERT INTO sp_v2_settlement_bank_transfers (
    settlement_batch_id, merchant_id, amount_paise, utr_number, status
) VALUES (<batch_id>, 'MERCH001', <net_amount>, 'UTR123', 'COMPLETED');

-- 7. Mark as settled
UPDATE sp_v2_settlement_batches SET 
    status = 'COMPLETED',
    settled_at = NOW(),
    bank_reference_number = 'UTR123'
WHERE id = <batch_id>;
```

---

## Current State for MERCH001

### ✅ **Settled (62 transactions)**
- In 10 settlement batches
- Status: `COMPLETED`
- Settled date: 2025-10-03 (T+1)
- UTR numbers assigned
- Bank transfers created

### ⏳ **Pending Settlement (143 transactions)**
- **108 transactions** with status `RECONCILED` - **Ready to settle**
- **35 transactions** with status `UNMATCHED` - Need reconciliation first
- Date range: Sep 1 - Oct 1, 2025
- **Action needed**: Run settlement process to create new batches

---

## Important Notes

### 🚨 **No Automatic Triggers**
There are **NO database triggers** that automatically create settlements when a transaction becomes `RECONCILED`. Settlement batches must be created through:
1. Scheduled cron jobs (daily/periodic)
2. Manual execution by ops team
3. API calls to settlement service

### 📊 **Data Integrity**
- `sp_v2_settlement_items.transaction_id` references `sp_v2_transactions.transaction_id` (string, not FK)
- `sp_v2_transactions.settlement_batch_id` is populated when transaction is added to batch
- A transaction can only be in ONE settlement batch (no duplicates allowed)

### 🔄 **Settlement Cycles**
- **T+1**: Next business day settlement (most common)
- **T+2**: Two business days
- **Instant**: Real-time settlement (separate process)

Settlement cycle is determined by merchant agreement and payment method.

---

## How to Create a New Settlement Batch

To settle the 108 pending `RECONCILED` transactions for MERCH001:

```sql
-- Run this SQL to create a new settlement batch
BEGIN;

-- 1. Create settlement run
INSERT INTO sp_v2_settlement_schedule_runs (run_date, trigger_type, status)
VALUES (CURRENT_DATE, 'manual', 'running')
RETURNING id; -- Use this run_id below

-- 2. Create settlement batch
INSERT INTO sp_v2_settlement_batches (
    merchant_id, cycle_date, settlement_run_id, status, created_at
) VALUES (
    'MERCH001', CURRENT_DATE, '<run_id>', 'PENDING_APPROVAL', NOW()
) RETURNING id; -- Use this batch_id below

-- 3. Add transactions as settlement items
INSERT INTO sp_v2_settlement_items (
    settlement_batch_id, transaction_id, amount_paise, 
    commission_paise, gst_paise, net_paise
)
SELECT 
    '<batch_id>',
    t.transaction_id,
    t.amount_paise,
    COALESCE(t.mdr_charged_paise, 0) as commission_paise,
    COALESCE(t.gst_paise, 0) as gst_paise,
    t.amount_paise - COALESCE(t.mdr_charged_paise, 0) - COALESCE(t.gst_paise, 0) as net_paise
FROM sp_v2_transactions t
WHERE t.merchant_id = 'MERCH001'
    AND t.status = 'RECONCILED'
    AND t.transaction_id NOT IN (SELECT transaction_id FROM sp_v2_settlement_items);

-- 4. Update batch aggregates
UPDATE sp_v2_settlement_batches SET
    total_transactions = (SELECT COUNT(*) FROM sp_v2_settlement_items WHERE settlement_batch_id = '<batch_id>'),
    gross_amount_paise = (SELECT SUM(amount_paise) FROM sp_v2_settlement_items WHERE settlement_batch_id = '<batch_id>'),
    total_commission_paise = (SELECT SUM(commission_paise) FROM sp_v2_settlement_items WHERE settlement_batch_id = '<batch_id>'),
    total_gst_paise = (SELECT SUM(gst_paise) FROM sp_v2_settlement_items WHERE settlement_batch_id = '<batch_id>'),
    net_amount_paise = (SELECT SUM(net_paise) FROM sp_v2_settlement_items WHERE settlement_batch_id = '<batch_id>')
WHERE id = '<batch_id>';

-- 5. Mark run as completed
UPDATE sp_v2_settlement_schedule_runs SET
    status = 'completed',
    batches_created = 1,
    completed_at = NOW()
WHERE id = '<run_id>';

COMMIT;
```

---

## Summary

**Data Source**: Settlements get their data from `sp_v2_transactions` table  
**Trigger**: No automatic trigger - manual/scheduled process required  
**Junction Table**: `sp_v2_settlement_items` links transactions to batches  
**Batch Table**: `sp_v2_settlement_batches` contains aggregated settlement data  
**Current Status**: 62/205 transactions settled for MERCH001, 108 ready to settle  

**Key Takeaway**: Settlement is a **batch process**, not a real-time trigger. Transactions must be explicitly grouped into batches through a settlement run.
