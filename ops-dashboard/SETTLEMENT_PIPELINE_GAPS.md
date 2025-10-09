# Settlement Pipeline - What's Missing?

**Current Status**: Settlement Batch Created ✅
**Version**: 2.32.0
**Batch ID**: `b9501622-c374-4d34-8813-409f93250285`

---

## ✅ What's Already Working

```
┌─────────────────────────────────────────────────────────────┐
│  COMPLETED STEPS                                            │
├─────────────────────────────────────────────────────────────┤
│  1. ✅ Reconciliation (UTR matching)                        │
│  2. ✅ Settlement Calculation (fees, GST, net amount)       │
│  3. ✅ Settlement Batch Creation                            │
│  4. ✅ Settlement Items (transaction-level breakdown)       │
│  5. ✅ Transaction Linking (bidirectional relationship)     │
└─────────────────────────────────────────────────────────────┘

Current State:
  Batch: b9501622-c374-4d34-8813-409f93250285
  Merchant: MERCH_ABC
  Transactions: 23
  Net Amount: ₹102,953.81
  Status: PENDING_APPROVAL ⏳
```

---

## ❌ What's Missing in the Pipeline

### **1. Approval Workflow** ⏳ MISSING

**Table**: `sp_v2_settlement_approvals`

**Current State**:
```
❌ No approval record exists for the batch
```

**What's Needed**:
```sql
INSERT INTO sp_v2_settlement_approvals (
  batch_id,
  approval_level,
  approver_id,
  approver_name,
  approver_role,
  decision,              -- 'approved', 'rejected', 'on_hold'
  approval_notes
) VALUES (
  'b9501622-c374-4d34-8813-409f93250285',
  1,
  'OPS_USER_001',
  'Shantanu Singh',
  'ops_manager',
  'approved',
  'Settlement approved for payout'
);
```

**Then Update Batch**:
```sql
UPDATE sp_v2_settlement_batches
SET status = 'APPROVED', approved_at = NOW()
WHERE id = 'b9501622-c374-4d34-8813-409f93250285';
```

**Workflow Options**:
- **Manual Approval**: Ops team reviews and approves via UI
- **Auto-Approval**: Trusted merchants get auto-approved
- **Two-Level Approval**: Manager + Finance approval for large amounts

---

### **2. Bank Transfer Queue** ⏳ MISSING

**Table**: `sp_v2_settlement_bank_transfers`

**Current State**:
```
❌ No bank transfer record created
```

**What's Needed** (after approval):
```sql
INSERT INTO sp_v2_settlement_bank_transfers (
  batch_id,
  merchant_id,
  beneficiary_name,
  account_number,
  ifsc_code,
  bank_name,
  amount_paise,
  transfer_type,           -- 'IMPS', 'NEFT', 'RTGS'
  transfer_status,         -- 'QUEUED'
  initiated_at
) VALUES (
  'b9501622-c374-4d34-8813-409f93250285',
  'MERCH_ABC',
  'Test Company MERCH ABC',
  '1234567890',
  'HDFC0000123',
  'HDFC Bank',
  10295381,                -- ₹102,953.81
  'NEFT',
  'QUEUED',
  NOW()
);
```

**Trigger**: After batch status → APPROVED

---

### **3. Payout Processor** ⏳ MISSING

**Current State**:
```
❌ No payout processor running
❌ No bank API integration
```

**What's Needed**:
```
Background Job/Queue Processor that:
  1. Polls sp_v2_settlement_bank_transfers (status='QUEUED')
  2. Calls Bank API to initiate transfer (IMPS/NEFT/RTGS)
  3. Updates status: QUEUED → PROCESSING → SUCCESS/FAILED
  4. Records bank UTR/transaction reference
  5. Updates settlement batch status
```

**Implementation Options**:

**Option A: Bank API Integration**
```javascript
// Razorpay Payouts API
const payout = await razorpay.payouts.create({
  account_number: "1234567890",
  amount: 10295381,  // paise
  currency: "INR",
  mode: "NEFT",
  purpose: "settlement",
  fund_account: {
    account_type: "bank_account",
    bank_account: {
      name: "Test Company MERCH ABC",
      ifsc: "HDFC0000123",
      account_number: "1234567890"
    }
  },
  queue_if_low_balance: true
});

// Update database with payout_id and status
```

**Option B: Manual Reconciliation**
```
For now: Ops team manually initiates bank transfer
Then: Update database with bank UTR
System: Marks settlement as CREDITED
```

---

### **4. Settlement Queue Processor** ⏳ MISSING

**Table**: `sp_v2_settlement_queue`

**What's Needed**:
```
Queue system to handle async settlement processing:
  - Retry failed payouts
  - Handle rate limits
  - Process in batches
  - Dead letter queue for failures
```

**Schema** (if table exists):
```sql
INSERT INTO sp_v2_settlement_queue (
  batch_id,
  merchant_id,
  priority,              -- 'high', 'normal', 'low'
  retry_count,
  max_retries,
  status,                -- 'pending', 'processing', 'completed', 'failed'
  scheduled_at,
  processed_at,
  error_message
);
```

---

### **5. Timeline/Audit Trail** ⏳ MISSING

**Table**: `sp_v2_settlement_timeline_events`

**Current State**:
```
❌ No timeline events recorded
```

**What's Needed**:
```sql
-- Event 1: Settlement Created
INSERT INTO sp_v2_settlement_timeline_events (
  batch_id,
  event_type,
  event_data,
  created_by,
  created_at
) VALUES (
  'b9501622-...',
  'SETTLEMENT_CREATED',
  '{"net_amount": 102953.81, "transactions": 23}',
  'SYSTEM',
  '2025-10-09 19:38:13'
);

-- Event 2: Approval
INSERT INTO sp_v2_settlement_timeline_events (
  batch_id,
  event_type,
  event_data,
  created_by,
  created_at
) VALUES (
  'b9501622-...',
  'SETTLEMENT_APPROVED',
  '{"approver": "Shantanu Singh", "notes": "Approved"}',
  'OPS_USER_001',
  '2025-10-09 20:00:00'
);

-- Event 3: Bank Transfer Initiated
-- Event 4: Bank Transfer Success
-- Event 5: Settlement Credited
```

---

### **6. Merchant Settlement Configuration** ⏳ MISSING

**Table**: `sp_v2_merchant_settlement_config`

**Current State**:
```
❌ No config for MERCH_ABC
```

**What's Needed**:
```sql
INSERT INTO sp_v2_merchant_settlement_config (
  merchant_id,
  bank_account_number,
  bank_account_name,
  bank_ifsc_code,
  bank_name,
  bank_branch,
  settlement_frequency,      -- 'T+1', 'T+2', 'T+7', 'WEEKLY', 'MONTHLY'
  auto_approve,              -- true/false
  approval_threshold_paise,  -- Auto-approve if below threshold
  settlement_day,            -- For weekly: 'MONDAY', 'FRIDAY'
  settlement_time,           -- '18:00:00'
  is_active,
  created_at
) VALUES (
  'MERCH_ABC',
  '1234567890',
  'Test Company MERCH ABC',
  'HDFC0000123',
  'HDFC Bank',
  'Mumbai Main Branch',
  'T+2',                     -- Settle after 2 days
  false,                     -- Require manual approval
  500000,                    -- Auto-approve if < ₹5,000
  NULL,
  '18:00:00',
  true,
  NOW()
);
```

---

### **7. Settlement Reports** ⏳ MISSING

**Current State**:
```
❌ No report generation
❌ No email notifications
```

**What's Needed**:

**Report Generation**:
```
PDF Settlement Statement including:
  - Settlement Summary (batch details)
  - Transaction Breakdown (all 23 transactions)
  - Fee Breakdown (commission, GST)
  - Bank Details (where money will be sent)
  - Settlement Timeline
```

**Email Notification**:
```
To: merchant@example.com
Subject: Settlement Statement - ₹102,953.81 (Batch: b9501622...)

Dear MERCH_ABC,

Your settlement for 23 transactions has been processed.

Settlement Details:
- Gross Amount: ₹105,442.25
- Commission: ₹2,108.85
- GST: ₹379.59
- Net Amount: ₹102,953.81

Status: APPROVED
Expected Credit Date: 2025-10-11 (T+2)

Please find attached detailed settlement statement.

Regards,
SettlePaisa Team
```

---

### **8. Settlement Schedule** ⏳ MISSING

**Current State**:
```
❌ No scheduled settlement runs
❌ Manual trigger only
```

**What's Needed**:

**Daily Settlement Scheduler**:
```javascript
// Cron job: Every day at 6 PM
cron.schedule('0 18 * * *', async () => {
  // Get all merchants with settlement_frequency = 'DAILY' or 'T+1'
  // For each merchant:
  //   - Get reconciled transactions for settlement date
  //   - Calculate settlement
  //   - Create settlement batch
  //   - Trigger approval workflow
});
```

**T+2 Settlement**:
```javascript
// Cron job: Every day at 6 PM
cron.schedule('0 18 * * *', async () => {
  const settlementDate = moment().subtract(2, 'days').format('YYYY-MM-DD');

  // Get all merchants with settlement_frequency = 'T+2'
  // For each merchant:
  //   - Get reconciled transactions for (today - 2 days)
  //   - Calculate settlement
  //   - Create settlement batch
});
```

---

### **9. Settlement Status Tracking** ⏳ MISSING

**Current States Available**:
```sql
-- sp_v2_settlement_batches.status values:
'PENDING_APPROVAL'  -- ✅ Current state
'APPROVED'          -- ❌ Not implemented
'QUEUED'            -- ❌ Not implemented
'PROCESSING'        -- ❌ Not implemented
'TRANSFERRED'       -- ❌ Not implemented
'CREDITED'          -- ❌ Not implemented (final state)
'FAILED'            -- ❌ Not implemented
'ON_HOLD'           -- ❌ Not implemented
'CANCELLED'         -- ❌ Not implemented
```

**Status Flow**:
```
PENDING_APPROVAL (current)
     ↓ (manual/auto approval)
APPROVED
     ↓ (bank transfer initiated)
QUEUED
     ↓ (payout processor picks up)
PROCESSING
     ↓ (bank API call success)
TRANSFERRED (money sent to bank)
     ↓ (verify money reached merchant)
CREDITED (final state - settlement complete) ✅
```

---

### **10. Refund/Chargeback Handling** ⏳ MISSING

**Table**: `sp_v2_settlement_deductions`

**Use Case**:
```
Scenario: Transaction was settled, then customer requested refund

Current Issue:
  - Settlement already done (money sent to merchant)
  - Refund needs to be deducted from NEXT settlement

Solution:
  - Record refund as deduction
  - Next settlement: Gross - Fees - Deductions = Net
```

**What's Needed**:
```sql
INSERT INTO sp_v2_settlement_deductions (
  merchant_id,
  transaction_id,
  deduction_type,        -- 'REFUND', 'CHARGEBACK', 'PENALTY'
  deduction_amount_paise,
  reason,
  reference_settlement_batch_id,  -- Original settlement that paid out
  applied_to_batch_id,            -- Settlement where deduction applied
  status,                         -- 'PENDING', 'APPLIED'
  created_at
) VALUES (
  'MERCH_ABC',
  'TXN_E2E_001',
  'REFUND',
  150000,
  'Customer refund request',
  'b9501622-...',         -- This batch (already paid)
  NULL,                   -- Will be applied to next batch
  'PENDING',
  NOW()
);
```

**In Next Settlement**:
```javascript
const nextSettlement = {
  gross_amount: 200000,
  fees: 4000,
  pending_deductions: 150000,  // From previous refund
  net_amount: 200000 - 4000 - 150000 = 46000
};
```

---

## 📊 Complete Settlement Lifecycle (Target State)

```
┌────────────────────────────────────────────────────────────────┐
│  COMPLETE SETTLEMENT FLOW (What Should Happen)                 │
└────────────────────────────────────────────────────────────────┘

1. Reconciliation Complete
   └─> 23 transactions matched ✅

2. Settlement Calculation Triggered
   └─> Settlement batch created ✅
   └─> Status: PENDING_APPROVAL ✅

3. Approval Workflow ⏳ MISSING
   ├─> Ops team reviews batch
   ├─> Approval decision (approve/reject/hold)
   └─> Status: PENDING_APPROVAL → APPROVED

4. Bank Transfer Queue Population ⏳ MISSING
   ├─> Create bank_transfers record
   ├─> Merchant bank details included
   └─> Status: APPROVED → QUEUED

5. Payout Processing ⏳ MISSING
   ├─> Payout processor picks up queued transfer
   ├─> Call bank API (IMPS/NEFT/RTGS)
   ├─> Bank returns transaction reference (UTR)
   └─> Status: QUEUED → PROCESSING → TRANSFERRED

6. Settlement Reconciliation ⏳ MISSING
   ├─> Verify money reached merchant account
   ├─> Match bank UTR with settlement
   └─> Status: TRANSFERRED → CREDITED ✅

7. Notification & Reporting ⏳ MISSING
   ├─> Generate PDF settlement statement
   ├─> Email merchant with details
   └─> Dashboard update (merchant can view status)

8. Timeline Tracking ⏳ MISSING
   └─> Audit trail: CREATED → APPROVED → TRANSFERRED → CREDITED
```

---

## 🎯 Priority Order for Implementation

### **Phase 1: Critical (Blocks Payout)**
1. ✅ Settlement Batch Creation (DONE)
2. ⏳ Approval Workflow (blocks everything else)
3. ⏳ Bank Transfer Queue Population
4. ⏳ Merchant Settlement Config (bank details)

### **Phase 2: Core Payout**
5. ⏳ Payout Processor (manual or API integration)
6. ⏳ Settlement Status Tracking
7. ⏳ Timeline/Audit Events

### **Phase 3: Automation & UX**
8. ⏳ Settlement Schedule (daily/T+2 automation)
9. ⏳ Reports & Email Notifications
10. ⏳ Queue Processor (retry, error handling)

### **Phase 4: Edge Cases**
11. ⏳ Refund/Chargeback Deductions
12. ⏳ Multi-level Approval
13. ⏳ Settlement Holds/Freezes

---

## 💡 Quick Implementation Guide

### **Immediate Next Step: Approval Workflow**

**Code Location**: Create new file `services/settlement-engine/approval-workflow.cjs`

```javascript
class ApprovalWorkflow {

  async approveSettlement(batchId, approverData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Insert approval record
      await client.query(`
        INSERT INTO sp_v2_settlement_approvals (
          batch_id, approver_id, approver_name,
          approver_role, decision, approval_notes
        ) VALUES ($1, $2, $3, $4, 'approved', $5)
      `, [batchId, approverData.id, approverData.name,
          approverData.role, approverData.notes]);

      // 2. Update batch status
      await client.query(`
        UPDATE sp_v2_settlement_batches
        SET status = 'APPROVED', approved_at = NOW()
        WHERE id = $1
      `, [batchId]);

      // 3. Create bank transfer record
      const merchantConfig = await this.getMerchantConfig(batchId);

      await client.query(`
        INSERT INTO sp_v2_settlement_bank_transfers (
          batch_id, merchant_id, account_number,
          ifsc_code, amount_paise, transfer_status
        ) VALUES ($1, $2, $3, $4, $5, 'QUEUED')
      `, [batchId, merchantConfig.merchant_id,
          merchantConfig.account_number,
          merchantConfig.ifsc_code,
          merchantConfig.net_amount_paise]);

      // 4. Add timeline event
      await client.query(`
        INSERT INTO sp_v2_settlement_timeline_events (
          batch_id, event_type, event_data, created_by
        ) VALUES ($1, 'SETTLEMENT_APPROVED', $2, $3)
      `, [batchId, JSON.stringify(approverData), approverData.id]);

      await client.query('COMMIT');

      console.log(`✅ Settlement ${batchId} approved`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

---

## 📝 Summary

**Current State**: Settlement batch created, stuck at PENDING_APPROVAL

**Immediate Blocker**: No approval workflow

**Next 3 Steps**:
1. Implement approval workflow (manual approval)
2. Add merchant bank config
3. Create bank transfer queue entry

**Final Goal**: Complete automation from reconciliation → settlement → payout → credited

---

**Generated**: October 9, 2025
**Version**: 2.32.0
**Status**: Settlement creation ✅ | Payout pipeline ⏳
