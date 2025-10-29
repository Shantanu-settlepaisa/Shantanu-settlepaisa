# How We Know Merchant is Credited

**Date**: October 7, 2025  
**Question**: Once settlement batch is created, how do we track that the merchant actually received the money?

---

## Settlement Lifecycle

```
1. RECONCILIATION → Transaction marked as RECONCILED
2. SETTLEMENT BATCH → Batch created (PENDING_APPROVAL)
3. APPROVAL → Batch approved (APPROVED)
4. BANK TRANSFER → Money sent to bank (PROCESSING/SENT)
5. BANK CONFIRMATION → Bank confirms transfer (SUCCESS)
6. CREDIT VERIFICATION → Verify credit in merchant account (COMPLETED)
```

---

## Tables Tracking Credit Status

### **1. sp_v2_settlement_batches (Batch-level status)**

```sql
CREATE TABLE sp_v2_settlement_batches (
  id UUID PRIMARY KEY,
  merchant_id VARCHAR(50),
  status VARCHAR(30) DEFAULT 'PENDING_APPROVAL',  -- Batch lifecycle status
  settlement_completed_at TIMESTAMP,              -- When credited
  bank_reference_number VARCHAR(100),             -- Bank UTR reference
  approved_at TIMESTAMP,
  approved_by VARCHAR(100),
  ...
);
```

**Status Values:**
- `PENDING_APPROVAL` - Waiting for ops approval
- `APPROVED` - Approved, ready for transfer
- `PROCESSING` - Transfer initiated
- `COMPLETED` - Money credited to merchant
- `FAILED` - Transfer failed

**Query: Check if batch is credited**
```sql
SELECT * FROM sp_v2_settlement_batches 
WHERE id = 'batch-uuid' 
  AND status = 'COMPLETED' 
  AND settlement_completed_at IS NOT NULL;
```

---

### **2. sp_v2_bank_transfer_queue (Transfer-level tracking)**

```sql
CREATE TABLE sp_v2_bank_transfer_queue (
  id UUID PRIMARY KEY,
  batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  
  -- Transfer Details
  transfer_mode VARCHAR(20),  -- NEFT, RTGS, IMPS, UPI
  amount_paise BIGINT,
  
  -- Beneficiary
  beneficiary_name VARCHAR(200),
  account_number VARCHAR(30),
  ifsc_code VARCHAR(11),
  
  -- Status Tracking
  status VARCHAR(30) DEFAULT 'queued',  -- queued → processing → sent → success
  utr_number VARCHAR(50),               -- Bank UTR (proof of transfer)
  bank_reference_number VARCHAR(100),
  
  -- Timestamps
  queued_at TIMESTAMP,
  processing_at TIMESTAMP,
  sent_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Confirmation
  bank_confirmed BOOLEAN DEFAULT false,  -- Bank confirmed receipt
  bank_confirmation_date DATE,
  
  ...
);
```

**Status Values:**
- `queued` - In queue, not yet sent
- `processing` - Being processed by bank API
- `sent` - Submitted to bank
- `success` - Bank confirmed transfer
- `failed` - Transfer failed
- `reversed` - Transfer reversed

**Query: Check if transfer succeeded**
```sql
SELECT * FROM sp_v2_bank_transfer_queue 
WHERE batch_id = 'batch-uuid'
  AND status = 'success'
  AND bank_confirmed = true
  AND utr_number IS NOT NULL;
```

---

### **3. sp_v2_settlement_bank_transfers (Simplified tracking)**

```sql
CREATE TABLE sp_v2_settlement_bank_transfers (
  id UUID PRIMARY KEY,
  settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  merchant_id VARCHAR(50),
  amount_paise BIGINT,
  
  -- Bank Details
  bank_account_number VARCHAR(30),
  ifsc_code VARCHAR(11),
  transfer_mode VARCHAR(20),  -- NEFT/RTGS/IMPS
  
  -- Transfer Status
  utr_number VARCHAR(50),     -- Proof of credit
  transfer_date DATE,
  status VARCHAR(20) DEFAULT 'PENDING',  -- PENDING/SUCCESS/FAILED
  failure_reason TEXT,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Query: Check merchant credit**
```sql
SELECT 
  sbt.*,
  sb.merchant_id,
  sb.net_amount_paise,
  sb.settlement_completed_at
FROM sp_v2_settlement_bank_transfers sbt
JOIN sp_v2_settlement_batches sb ON sbt.settlement_batch_id = sb.id
WHERE sbt.merchant_id = 'MERCH_001'
  AND sbt.status = 'SUCCESS'
  AND sbt.utr_number IS NOT NULL;
```

---

### **4. sp_v2_utr_credits (Bank reconciliation)**

```sql
CREATE TABLE sp_v2_utr_credits (
  id UUID PRIMARY KEY,
  acquirer TEXT,              -- Bank name (ICICI, HDFC, etc.)
  utr TEXT NOT NULL,          -- Bank UTR from statement
  amount_paise BIGINT,
  credited_at TIMESTAMP,      -- Actual credit timestamp
  cycle_date DATE,
  bank_reference VARCHAR(100),
  reconciled BOOLEAN DEFAULT false,
  ...
);
```

**Purpose:** Store bank statement entries showing actual credits to our account.

**Query: Verify bank credited our account**
```sql
SELECT uc.* 
FROM sp_v2_utr_credits uc
JOIN sp_v2_bank_transfer_queue btq ON btq.utr_number = uc.utr
WHERE btq.batch_id = 'batch-uuid'
  AND uc.reconciled = true;
```

---

### **5. sp_v2_transactions (Transaction-level tracking)**

```sql
ALTER TABLE sp_v2_transactions
  ADD COLUMN settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  ADD COLUMN settled_at TIMESTAMP;  -- When merchant was credited
```

**Query: Check if transaction is credited**
```sql
SELECT 
  t.*,
  sb.status as batch_status,
  sb.settlement_completed_at,
  btq.utr_number,
  btq.bank_confirmed
FROM sp_v2_transactions t
JOIN sp_v2_settlement_batches sb ON t.settlement_batch_id = sb.id
LEFT JOIN sp_v2_bank_transfer_queue btq ON btq.batch_id = sb.id
WHERE t.transaction_id = 'TXN_001'
  AND sb.status = 'COMPLETED';
```

---

## Complete Credit Verification Flow

### **Step 1: Settlement Batch Created**
```sql
INSERT INTO sp_v2_settlement_batches (
  merchant_id, net_amount_paise, status
) VALUES ('MERCH_001', 95000, 'PENDING_APPROVAL');

-- Update transactions
UPDATE sp_v2_transactions 
SET settlement_batch_id = 'batch-uuid-1'
WHERE transaction_id IN ('TXN_001', 'TXN_002');
```

### **Step 2: Ops Approves Settlement**
```sql
UPDATE sp_v2_settlement_batches 
SET 
  status = 'APPROVED',
  approved_at = NOW(),
  approved_by = 'ops_user_123'
WHERE id = 'batch-uuid-1';
```

### **Step 3: Transfer Initiated**
```sql
INSERT INTO sp_v2_bank_transfer_queue (
  batch_id, transfer_mode, amount_paise,
  beneficiary_name, account_number, ifsc_code,
  status
) VALUES (
  'batch-uuid-1', 'NEFT', 95000,
  'Merchant Company Ltd', '1234567890', 'ICIC0001234',
  'queued'
);

-- Update batch status
UPDATE sp_v2_settlement_batches 
SET status = 'PROCESSING'
WHERE id = 'batch-uuid-1';
```

### **Step 4: Bank Transfer Sent**
```sql
-- Payment gateway/bank API returns UTR
UPDATE sp_v2_bank_transfer_queue 
SET 
  status = 'sent',
  utr_number = 'UTR241007001234',
  sent_at = NOW(),
  api_response = '{"status": "SUCCESS", "utr": "UTR241007001234"}'
WHERE batch_id = 'batch-uuid-1';
```

### **Step 5: Bank Confirms Transfer**
```sql
-- Bank webhook or polling confirms success
UPDATE sp_v2_bank_transfer_queue 
SET 
  status = 'success',
  bank_confirmed = true,
  bank_confirmation_date = CURRENT_DATE,
  completed_at = NOW()
WHERE batch_id = 'batch-uuid-1';
```

### **Step 6: Mark Settlement as Completed**
```sql
UPDATE sp_v2_settlement_batches 
SET 
  status = 'COMPLETED',
  settlement_completed_at = NOW(),
  bank_reference_number = 'UTR241007001234'
WHERE id = 'batch-uuid-1';

-- Also update individual transactions
UPDATE sp_v2_transactions 
SET settled_at = NOW()
WHERE settlement_batch_id = 'batch-uuid-1';
```

### **Step 7: Reconcile with Bank Statement (Optional)**
```sql
-- When bank statement arrives, verify credit
INSERT INTO sp_v2_utr_credits (
  acquirer, utr, amount_paise, credited_at, cycle_date
) VALUES (
  'ICICI Bank', 'UTR241007001234', 95000, NOW(), CURRENT_DATE
);

-- Match with our transfer
UPDATE sp_v2_utr_credits 
SET reconciled = true
WHERE utr = 'UTR241007001234';
```

---

## Queries to Answer "Is Merchant Credited?"

### **Query 1: Simple Check (Batch Level)**
```sql
SELECT 
  merchant_id,
  net_amount_paise,
  status,
  settlement_completed_at,
  bank_reference_number
FROM sp_v2_settlement_batches
WHERE id = 'batch-uuid'
  AND status = 'COMPLETED'
  AND settlement_completed_at IS NOT NULL;
```

### **Query 2: Full Transfer Details**
```sql
SELECT 
  sb.merchant_id,
  sb.net_amount_paise / 100.0 as amount_inr,
  sb.status as batch_status,
  sb.settlement_completed_at,
  btq.status as transfer_status,
  btq.utr_number,
  btq.bank_confirmed,
  btq.completed_at as transfer_completed_at,
  btq.transfer_mode
FROM sp_v2_settlement_batches sb
LEFT JOIN sp_v2_bank_transfer_queue btq ON btq.batch_id = sb.id
WHERE sb.id = 'batch-uuid';
```

### **Query 3: Transaction-Level Credit Status**
```sql
SELECT 
  t.transaction_id,
  t.amount_paise / 100.0 as txn_amount_inr,
  t.settled_at,
  sb.status as batch_status,
  sb.settlement_completed_at,
  btq.utr_number,
  btq.bank_confirmed
FROM sp_v2_transactions t
JOIN sp_v2_settlement_batches sb ON t.settlement_batch_id = sb.id
LEFT JOIN sp_v2_bank_transfer_queue btq ON btq.batch_id = sb.id
WHERE t.transaction_id = 'TXN_001';
```

### **Query 4: Bank Statement Verification**
```sql
SELECT 
  btq.batch_id,
  btq.utr_number,
  btq.amount_paise / 100.0 as transferred_amount,
  btq.completed_at as transfer_time,
  uc.credited_at as bank_credit_time,
  uc.amount_paise / 100.0 as bank_credited_amount,
  uc.reconciled as bank_reconciled
FROM sp_v2_bank_transfer_queue btq
LEFT JOIN sp_v2_utr_credits uc ON uc.utr = btq.utr_number
WHERE btq.batch_id = 'batch-uuid';
```

### **Query 5: Merchant Dashboard View**
```sql
SELECT 
  sb.id as batch_id,
  sb.cycle_date,
  sb.total_transactions,
  sb.net_amount_paise / 100.0 as amount_inr,
  sb.status,
  sb.settlement_completed_at,
  CASE 
    WHEN sb.status = 'COMPLETED' THEN 'Credited'
    WHEN sb.status = 'PROCESSING' THEN 'In Progress'
    WHEN sb.status = 'APPROVED' THEN 'Approved (Pending Transfer)'
    WHEN sb.status = 'PENDING_APPROVAL' THEN 'Pending Approval'
    ELSE sb.status
  END as merchant_friendly_status,
  btq.utr_number as payment_reference
FROM sp_v2_settlement_batches sb
LEFT JOIN sp_v2_bank_transfer_queue btq ON btq.batch_id = sb.id
WHERE sb.merchant_id = 'MERCH_001'
ORDER BY sb.cycle_date DESC;
```

---

## Status Hierarchy (Most Reliable to Least)

1. **✅ GOLD STANDARD**: `sp_v2_utr_credits.reconciled = true` + matching UTR
   - Bank statement confirms money in our account
   - We sent money to merchant from this account
   - **100% proof merchant is credited**

2. **✅ HIGH CONFIDENCE**: `sp_v2_bank_transfer_queue.status = 'success'` + `bank_confirmed = true`
   - Bank API confirmed transfer
   - UTR generated
   - **~99% confidence**

3. **⚠️ MEDIUM CONFIDENCE**: `sp_v2_settlement_batches.status = 'COMPLETED'` + `settlement_completed_at` set
   - Internal status updated
   - May not have bank confirmation yet
   - **~90% confidence**

4. **⏳ LOW CONFIDENCE**: `sp_v2_settlement_batches.status = 'PROCESSING'`
   - Transfer initiated
   - Awaiting confirmation
   - **~50% confidence**

---

## V1 vs V2 Comparison

| Aspect | V1 | V2 |
|--------|----|----|
| **Credit tracking** | `settlement_items.status = 'SUCCESS'` | `sp_v2_settlement_batches.status = 'COMPLETED'` |
| **UTR storage** | `settlement_items.bank_reference` | `sp_v2_bank_transfer_queue.utr_number` |
| **Bank confirmation** | Manual reconciliation | `sp_v2_utr_credits` + auto-matching |
| **Transfer queue** | No queue system | `sp_v2_bank_transfer_queue` with retry |
| **Timestamp** | `settlement_items.settlement_date` | `sp_v2_settlement_batches.settlement_completed_at` |

---

## APIs to Check Credit Status

### **Merchant API Endpoint**
```javascript
GET /api/settlements/:settlementId

Response:
{
  "id": "uuid",
  "status": "COMPLETED",
  "netAmount": 950.00,
  "settlementDate": "2025-10-07",
  "bankReference": "UTR241007001234",
  "isCredited": true,  // Derived from status = COMPLETED
  "creditedAt": "2025-10-07T14:30:00Z"
}
```

### **Ops Dashboard Query**
```javascript
GET /api/settlements/verify-credit/:batchId

Response:
{
  "batchId": "uuid",
  "merchantId": "MERCH_001",
  "status": "COMPLETED",
  "transferStatus": "success",
  "bankConfirmed": true,
  "utrNumber": "UTR241007001234",
  "bankReconciled": true,
  "creditConfidence": "GOLD_STANDARD"
}
```

---

## Summary

**Answer:** We know merchant is credited through a 3-tier verification system:

1. **Internal Status**: `sp_v2_settlement_batches.status = 'COMPLETED'`
2. **Bank Transfer Confirmation**: `sp_v2_bank_transfer_queue.bank_confirmed = true`
3. **Bank Statement Reconciliation**: `sp_v2_utr_credits.reconciled = true`

The gold standard is when all three match - internal records show completed, bank API confirmed transfer, and bank statement shows matching UTR credit.
