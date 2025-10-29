# How to Track if Money Actually Reached Merchant's Account

**Date:** October 7, 2025  
**Environment:** Staging Production System  
**Purpose:** Understanding settlement tracking and money flow

---

## 🎯 The Question

**"How do we know the transaction is settled and money is credited to the merchant?"**

---

## 📊 Current Tracking System (3 Levels)

The system tracks settlement progress through **3 separate status fields** across **2 tables**:

```
sp_v2_transactions.status              → Transaction lifecycle
sp_v2_settlement_batches.status        → Settlement batch status
sp_v2_settlement_batches.transfer_status → Bank transfer status
```

### Plus bank transfer confirmation:
```
sp_v2_settlement_bank_transfers.status → Actual bank transfer status
sp_v2_settlement_bank_transfers.utr_number → Proof of payment
```

---

## 🔍 Current Status Tracking (What We Have)

### Level 1: Transaction Status
**Table:** `sp_v2_transactions`  
**Column:** `status`

**Values:**
- `PENDING` - Just created, not reconciled yet
- `RECONCILED` - Matched with bank statement ✅
- `SUCCESS` - Payment successful (webhook transactions)
- `FAILED` - Payment failed
- `EXCEPTION` - Reconciliation mismatch
- `UNMATCHED` - No bank match found

**What it tells you:**
- ✅ Is the transaction valid?
- ✅ Has it been reconciled with bank?
- ❌ Has settlement been calculated? **NO**
- ❌ Has money been paid to merchant? **NO**

**Example:**
```sql
SELECT transaction_id, status, settlement_batch_id 
FROM sp_v2_transactions 
WHERE transaction_id = 'PGW1759230107582114';

transaction_id      | status  | settlement_batch_id
--------------------|---------|------------------------------------
PGW1759230107582114 | SUCCESS | 4c8569e8-25f4-4ca8-911e-0f5e2f3b7ae6
```

**Interpretation:** 
- Transaction is successful ✅
- Linked to settlement batch ✅
- But is money paid? **Check batch status!** ⬇️

---

### Level 2: Settlement Batch Status
**Table:** `sp_v2_settlement_batches`  
**Columns:** `status`, `approval_status`, `transfer_status`

**Status Values:**
- `PENDING` - Settlement calculated but not approved
- `PENDING_APPROVAL` - Waiting for approval
- `APPROVED` - Approved for payment
- `COMPLETED` - Settlement completed (but does this mean paid? 🤔)
- `REJECTED` - Settlement rejected
- `FAILED` - Settlement failed

**Approval Status Values:**
- `pending_approval` - Waiting for approval
- `approved` - Approved
- `rejected` - Rejected

**Transfer Status Values:**
- `not_initiated` - No bank transfer attempted ❌
- `initiated` - Bank transfer started
- `processing` - Bank is processing
- `completed` - Transfer completed ✅
- `failed` - Transfer failed

**Example:**
```sql
SELECT 
  id,
  merchant_id,
  net_amount_paise,
  status,
  approval_status,
  transfer_status,
  settled_at
FROM sp_v2_settlement_batches 
WHERE id = '4c8569e8-25f4-4ca8-911e-0f5e2f3b7ae6';

id: 4c8569e8-25f4-4ca8-911e-0f5e2f3b7ae6
merchant_id: 550e8400-e29b-41d4-a716-446655440001
net_amount_paise: 2301189 (₹23,011.89)
status: PENDING_APPROVAL
approval_status: pending_approval
transfer_status: not_initiated
settled_at: NULL
```

**Interpretation:**
- Settlement calculated: ✅ (₹23,011.89)
- Approved? ❌ (still pending)
- Money transferred? ❌ (not initiated)
- **Merchant has NOT received money yet!**

---

### Level 3: Bank Transfer Record
**Table:** `sp_v2_settlement_bank_transfers`  
**Column:** `status`, `utr_number`

**Status Values:**
- `PENDING` - Transfer record created, not sent to bank
- `INITIATED` - Sent to bank API
- `PROCESSING` - Bank is processing
- `COMPLETED` - Transfer successful ✅ **MONEY PAID!**
- `FAILED` - Transfer failed

**UTR Number:**
- **This is the PROOF that money was actually transferred!**
- Unique Transaction Reference from bank
- Only available when status = `COMPLETED`

**Example:**
```sql
SELECT 
  id,
  settlement_batch_id,
  merchant_id,
  amount_paise,
  status,
  utr_number,
  transfer_date
FROM sp_v2_settlement_bank_transfers
WHERE settlement_batch_id = 'b529ac0c-09b0-40dd-ba0f-0aae2d424468';

id: 950782b1-5da2-4cb2-889f-7934619a7242
settlement_batch_id: b529ac0c-09b0-40dd-ba0f-0aae2d424468
merchant_id: MERCH001
amount_paise: 1699299 (₹16,992.99)
status: COMPLETED ✅
utr_number: UTR17594150217353 ✅ PROOF!
transfer_date: 2025-10-03
```

**Interpretation:**
- Status = COMPLETED ✅
- UTR exists ✅ 
- **MERCHANT HAS RECEIVED MONEY!** 💰

---

## 🔄 Complete Settlement Lifecycle

### Stage 1: Transaction Created
```sql
sp_v2_transactions.status = 'PENDING'
sp_v2_transactions.settlement_batch_id = NULL
```
**Meaning:** Transaction exists, not yet reconciled

---

### Stage 2: Reconciled
```sql
sp_v2_transactions.status = 'RECONCILED'
sp_v2_transactions.settlement_batch_id = NULL
```
**Meaning:** Matched with bank, ready for settlement

---

### Stage 3: Settlement Calculated
```sql
sp_v2_transactions.status = 'RECONCILED' (unchanged!)
sp_v2_transactions.settlement_batch_id = 'batch-uuid'

sp_v2_settlement_batches:
  status = 'PENDING_APPROVAL'
  approval_status = 'pending_approval'
  transfer_status = 'not_initiated'
```
**Meaning:** Settlement calculated, waiting for approval

---

### Stage 4: Approved (Manual)
```sql
sp_v2_settlement_batches:
  status = 'APPROVED'
  approval_status = 'approved'
  transfer_status = 'not_initiated'
```
**Meaning:** Approved for payment, but not yet sent to bank

---

### Stage 5: Bank Transfer Initiated
```sql
sp_v2_settlement_batches:
  status = 'APPROVED'
  transfer_status = 'initiated'

sp_v2_settlement_bank_transfers:
  status = 'INITIATED'
  utr_number = NULL
```
**Meaning:** Bank API called, waiting for processing

---

### Stage 6: Bank Processing
```sql
sp_v2_settlement_bank_transfers:
  status = 'PROCESSING'
  utr_number = NULL
```
**Meaning:** Bank is processing the transfer

---

### Stage 7: Transfer Completed ✅ **MONEY PAID!**
```sql
sp_v2_settlement_batches:
  status = 'COMPLETED'
  transfer_status = 'completed'
  settled_at = '2025-10-03 14:23:40'

sp_v2_settlement_bank_transfers:
  status = 'COMPLETED' ✅
  utr_number = 'UTR17594150217353' ✅ PROOF!
  transfer_date = '2025-10-03'
```
**Meaning:** 
- 💰 **MERCHANT HAS RECEIVED MONEY IN BANK ACCOUNT**
- UTR number is the official proof
- Can be verified with bank statement

---

## 🚨 Critical Gaps in Current System

### Gap 1: Transaction Status Doesn't Update
**Problem:**
```sql
-- After settlement calculated:
sp_v2_transactions.status = 'RECONCILED'

-- After money paid:
sp_v2_transactions.status = 'RECONCILED' (still the same!)
```

**Impact:** 
- Can't tell from transaction status alone if money is paid
- Must join 3 tables to find payment status
- Confusing for reporting

**What should happen:**
```sql
-- After settlement:
sp_v2_transactions.status = 'SETTLED'

-- After payment:
sp_v2_transactions.status = 'PAID' ✅
```

---

### Gap 2: Multiple Status Fields Are Confusing
**Current Reality:**
```
sp_v2_settlement_batches has 3 status columns:
  • status
  • approval_status  
  • transfer_status

All must be checked to know payment status!
```

**Example of confusion:**
```sql
status = 'COMPLETED'  -- Sounds like money is paid?
transfer_status = 'not_initiated'  -- Wait, no transfer yet!
```

**What "COMPLETED" means:**
- Settlement calculation completed? ✅
- Money paid to merchant? **DEPENDS on transfer_status!**

---

### Gap 3: No Single "Money Paid" Flag
**Current:** Must check multiple conditions:
```sql
-- To know if merchant received money:
SELECT 
  CASE 
    WHEN bt.status = 'COMPLETED' AND bt.utr_number IS NOT NULL 
    THEN 'MONEY PAID ✅'
    ELSE 'NOT PAID YET ❌'
  END as payment_status
FROM sp_v2_transactions t
JOIN sp_v2_settlement_batches b ON t.settlement_batch_id = b.id
JOIN sp_v2_settlement_bank_transfers bt ON b.id = bt.settlement_batch_id;
```

**What should exist:**
```sql
-- Simple check:
SELECT payment_status FROM sp_v2_transactions WHERE transaction_id = 'XYZ';

-- Result: 'PAID' ✅
```

---

## 📋 How to Check if Money is Actually Paid (Query Guide)

### Query 1: Simple Status Check
```sql
-- Check transaction and settlement status
SELECT 
  t.transaction_id,
  t.amount_paise / 100.0 as amount_rupees,
  t.status as transaction_status,
  t.settlement_batch_id,
  b.status as batch_status,
  b.transfer_status,
  b.settled_at
FROM sp_v2_transactions t
LEFT JOIN sp_v2_settlement_batches b ON t.settlement_batch_id = b.id
WHERE t.transaction_id = 'PGW1759230107582114';
```

**Interpretation:**
- If `settlement_batch_id IS NULL` → Not settled yet
- If `batch_status = 'PENDING_APPROVAL'` → Waiting for approval
- If `transfer_status = 'not_initiated'` → Money NOT paid yet
- If `transfer_status = 'completed'` → Money likely paid (check bank transfer)

---

### Query 2: Full Payment Verification (WITH UTR)
```sql
-- Get complete payment proof
SELECT 
  t.transaction_id,
  t.amount_paise / 100.0 as transaction_amount_rupees,
  b.net_amount_paise / 100.0 as settlement_amount_rupees,
  b.status as batch_status,
  b.transfer_status,
  bt.status as bank_transfer_status,
  bt.utr_number as payment_proof,
  bt.transfer_date as payment_date,
  CASE 
    WHEN bt.status = 'COMPLETED' AND bt.utr_number IS NOT NULL 
    THEN '✅ MONEY PAID'
    WHEN bt.status = 'FAILED'
    THEN '❌ TRANSFER FAILED'
    WHEN bt.status IN ('INITIATED', 'PROCESSING')
    THEN '⏳ PROCESSING'
    WHEN b.transfer_status = 'not_initiated'
    THEN '⏸️ NOT STARTED'
    ELSE '❓ UNKNOWN'
  END as payment_status
FROM sp_v2_transactions t
JOIN sp_v2_settlement_batches b ON t.settlement_batch_id = b.id
LEFT JOIN sp_v2_settlement_bank_transfers bt ON b.id = bt.settlement_batch_id
WHERE t.transaction_id = 'PGW1759230107582114';
```

**Golden Rule:** 
✅ **Money is CONFIRMED paid ONLY when:**
```
bt.status = 'COMPLETED' 
AND 
bt.utr_number IS NOT NULL
```

---

### Query 3: Bulk Check - How Many Transactions Are Paid?
```sql
-- Check payment status across all transactions
SELECT 
  CASE 
    WHEN bt.status = 'COMPLETED' THEN 'PAID ✅'
    WHEN bt.status IN ('INITIATED', 'PROCESSING') THEN 'PROCESSING ⏳'
    WHEN bt.status = 'FAILED' THEN 'FAILED ❌'
    WHEN b.transfer_status = 'not_initiated' THEN 'NOT STARTED ⏸️'
    WHEN b.id IS NULL THEN 'NOT SETTLED ⏸️'
    ELSE 'UNKNOWN ❓'
  END as payment_status,
  COUNT(*) as transaction_count,
  SUM(t.amount_paise) / 100.0 as total_amount_rupees
FROM sp_v2_transactions t
LEFT JOIN sp_v2_settlement_batches b ON t.settlement_batch_id = b.id
LEFT JOIN sp_v2_settlement_bank_transfers bt ON b.id = bt.settlement_batch_id
WHERE t.status IN ('RECONCILED', 'SUCCESS')
GROUP BY payment_status
ORDER BY transaction_count DESC;
```

**Expected Output:**
```
payment_status    | transaction_count | total_amount_rupees
------------------|-------------------|--------------------
NOT SETTLED ⏸️    |               900 |         4,500,000.00
PAID ✅           |                50 |           250,000.00
PROCESSING ⏳     |                10 |            50,000.00
NOT STARTED ⏸️    |                20 |           100,000.00
```

---

### Query 4: Find UTR for Specific Settlement Batch
```sql
-- Get payment proof (UTR) for a batch
SELECT 
  b.id as batch_id,
  b.merchant_id,
  b.net_amount_paise / 100.0 as settlement_amount,
  b.cycle_date,
  bt.utr_number as payment_proof,
  bt.transfer_date,
  bt.status as transfer_status
FROM sp_v2_settlement_batches b
LEFT JOIN sp_v2_settlement_bank_transfers bt ON b.id = bt.settlement_batch_id
WHERE b.id = '4c8569e8-25f4-4ca8-911e-0f5e2f3b7ae6';
```

---

## 🎯 Real Examples from Staging

### Example 1: Money Paid (COMPLETED)
```sql
Transaction: PGW1759415021235
  └─ status = 'SUCCESS'
  └─ settlement_batch_id = 'b529ac0c-09b0-40dd-ba0f-0aae2d424468'
      └─ Settlement Batch:
          ├─ status = 'COMPLETED'
          ├─ transfer_status = 'completed'
          ├─ settled_at = '2025-10-03 14:23:40'
          └─ Bank Transfer:
              ├─ status = 'COMPLETED' ✅
              ├─ utr_number = 'UTR17594150217353' ✅
              └─ transfer_date = '2025-10-03'

💰 MONEY PAID TO MERCHANT! ✅
Amount: ₹16,992.99
Proof: UTR17594150217353
```

---

### Example 2: Waiting for Approval (PENDING_APPROVAL)
```sql
Transaction: PGW1759230107582114
  └─ status = 'SUCCESS'
  └─ settlement_batch_id = '4c8569e8-25f4-4ca8-911e-0f5e2f3b7ae6'
      └─ Settlement Batch:
          ├─ status = 'PENDING_APPROVAL'
          ├─ approval_status = 'pending_approval'
          ├─ transfer_status = 'not_initiated'
          └─ Bank Transfer: NULL (no record yet)

⏸️ MONEY NOT PAID YET
Reason: Waiting for admin approval
Amount calculated: ₹23,011.89
```

---

### Example 3: Not Yet Settled
```sql
Transaction: PGW1759230108999999
  └─ status = 'RECONCILED'
  └─ settlement_batch_id = NULL

⏸️ NOT SETTLED YET
Reason: Settlement batch not created
Next step: Wait for settlement cron job or manual trigger
```

---

## ✅ How to Confirm Money Reached Merchant (Step-by-Step)

### Step 1: Check Transaction Status
```sql
SELECT transaction_id, status, settlement_batch_id 
FROM sp_v2_transactions 
WHERE transaction_id = 'YOUR_TXN_ID';
```

**If `settlement_batch_id IS NULL`:**
- ❌ Not settled yet
- Stop here, money not processed

**If `settlement_batch_id` exists:**
- ✅ Settlement calculated
- Continue to Step 2 ⬇️

---

### Step 2: Check Settlement Batch Status
```sql
SELECT status, transfer_status, settled_at
FROM sp_v2_settlement_batches 
WHERE id = 'BATCH_ID_FROM_STEP_1';
```

**If `transfer_status = 'not_initiated'`:**
- ❌ Bank transfer not started
- Money NOT paid

**If `transfer_status = 'completed'`:**
- ✅ Transfer marked complete
- Continue to Step 3 ⬇️

---

### Step 3: Verify Bank Transfer with UTR
```sql
SELECT status, utr_number, transfer_date
FROM sp_v2_settlement_bank_transfers 
WHERE settlement_batch_id = 'BATCH_ID';
```

**If `status = 'COMPLETED' AND utr_number IS NOT NULL`:**
- ✅✅✅ **MONEY CONFIRMED PAID!**
- UTR is the official proof
- Merchant can verify with bank using UTR

**If `status = 'FAILED'`:**
- ❌ Transfer failed
- Check `failure_reason` column

---

## 🔴 Current Issues Summary

| Issue | Impact | Example |
|-------|--------|---------|
| **Transaction status doesn't update after payment** | Can't tell if paid from transaction alone | `status = 'RECONCILED'` even after money paid |
| **3 different status fields** | Confusing to track | `status`, `approval_status`, `transfer_status` |
| **"COMPLETED" is ambiguous** | Sounds like paid, but might not be | `status = 'COMPLETED'` but `transfer_status = 'not_initiated'` |
| **Must join 3 tables** | Complex queries required | `transactions → batches → bank_transfers` |
| **No single payment flag** | Multiple checks needed | Check 5+ conditions to confirm payment |

---

## 💡 Recommended Improvements

### 1. Add Clear Payment Status to Transactions
```sql
ALTER TABLE sp_v2_transactions 
ADD COLUMN payment_status VARCHAR(20) DEFAULT 'UNPAID';

-- Update via trigger when bank transfer completes
CREATE TRIGGER update_payment_status
AFTER UPDATE OF status ON sp_v2_settlement_bank_transfers
FOR EACH ROW
WHEN (NEW.status = 'COMPLETED' AND NEW.utr_number IS NOT NULL)
EXECUTE FUNCTION fn_mark_transactions_paid();
```

---

### 2. Create Simple Payment Status View
```sql
CREATE VIEW v_transaction_payment_status AS
SELECT 
  t.transaction_id,
  t.merchant_id,
  t.amount_paise,
  t.transaction_date,
  CASE 
    WHEN bt.status = 'COMPLETED' AND bt.utr_number IS NOT NULL 
    THEN 'PAID'
    WHEN bt.status IN ('INITIATED', 'PROCESSING')
    THEN 'PROCESSING'
    WHEN bt.status = 'FAILED'
    THEN 'FAILED'
    WHEN b.transfer_status = 'not_initiated'
    THEN 'APPROVED_NOT_PAID'
    WHEN b.status IN ('PENDING', 'PENDING_APPROVAL')
    THEN 'SETTLEMENT_PENDING'
    WHEN t.settlement_batch_id IS NULL
    THEN 'NOT_SETTLED'
    ELSE 'UNKNOWN'
  END as payment_status,
  bt.utr_number as payment_proof,
  bt.transfer_date as payment_date,
  b.net_amount_paise as settlement_amount
FROM sp_v2_transactions t
LEFT JOIN sp_v2_settlement_batches b ON t.settlement_batch_id = b.id
LEFT JOIN sp_v2_settlement_bank_transfers bt ON b.id = bt.settlement_batch_id;

-- Usage:
SELECT * FROM v_transaction_payment_status 
WHERE transaction_id = 'XYZ';
```

---

### 3. Add Payment Confirmation Notification
When `sp_v2_settlement_bank_transfers.status` becomes `COMPLETED`:
- Update transaction: `payment_status = 'PAID'`
- Send email to merchant: "Your settlement of ₹X has been credited (UTR: XXX)"
- Create notification record

---

## 📝 TL;DR (Quick Answer)

### How to know if money is paid to merchant?

**3-Step Verification:**

1. **Check transaction has settlement batch ID:**
   ```sql
   SELECT settlement_batch_id FROM sp_v2_transactions 
   WHERE transaction_id = 'XYZ';
   ```
   If NULL → Not settled yet ❌

2. **Check transfer status:**
   ```sql
   SELECT transfer_status FROM sp_v2_settlement_batches 
   WHERE id = 'BATCH_ID';
   ```
   If `not_initiated` → Not paid yet ❌

3. **Check bank transfer with UTR:**
   ```sql
   SELECT status, utr_number FROM sp_v2_settlement_bank_transfers 
   WHERE settlement_batch_id = 'BATCH_ID';
   ```
   If `status = 'COMPLETED' AND utr_number IS NOT NULL` → **PAID!** ✅

**Golden Rule:**  
✅ **Money is CONFIRMED paid ONLY when UTR exists in `sp_v2_settlement_bank_transfers` with status `COMPLETED`**

---

**Document Version:** 1.0  
**Created:** October 7, 2025  
**Purpose:** Settlement tracking and payment verification guide
