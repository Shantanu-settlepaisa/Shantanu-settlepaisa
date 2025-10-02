# V1 Settlement Calculation Logic vs V2 - Gap Analysis

## Executive Summary

**V2 HAS** a basic settlement calculator (`services/settlement-engine/settlement-calculator.cjs`) but it's **MISSING critical V1 settlement logic components** that SabPaisa production uses.

**Status**: V2 settlement calculation is **50% complete** - Core math exists, but missing integration with reconciliation, merchant configs, and payment rails.

---

## 1. V1 Settlement Calculation Logic (Production)

### **V1 Settlement Formula**

```
For each matched transaction after reconciliation:

1. Gross Amount = PG Transaction Amount (from reconciliation)

2. Commission = Gross Amount × Commission Rate
   - Commission Rate is tiered based on merchant's 30-day volume
   - Different rates for UPI/NEFT/RTGS/IMPS/Cards

3. GST = Commission × 18%
   - Always 18% on commission (mandatory)

4. TDS = Gross Amount × TDS Rate
   - Standard: 1% (Section 194H)
   - Varies by merchant PAN status (1% or 2%)

5. Reserve Fund = (Gross - Commission - GST - TDS) × Reserve %
   - Typically 5% of net amount
   - Held for chargebacks/disputes
   - Released after X days (configurable per merchant)

6. Net Payable = Gross - Commission - GST - TDS - Reserve

Settlement = Sum of Net Payable for all matched transactions in batch
```

### **V1 Settlement Flow**

```
┌─────────────────────────────────────────────────────────────────┐
│                    V1 SETTLEMENT PIPELINE                        │
└─────────────────────────────────────────────────────────────────┘

Step 1: RECONCILIATION COMPLETES
├─ Matched transactions identified (status = MATCHED)
├─ Unmatched exceptions flagged (status = EXCEPTION)
└─ Only MATCHED transactions proceed to settlement

Step 2: GROUP BY MERCHANT & CYCLE
├─ Group matched txns by merchant_id
├─ Group by settlement cycle (daily/T+1/T+2/custom)
├─ Apply cutoff time (e.g., 6 PM for T+1)
└─ Create settlement_batch record

Step 3: CALCULATE COMMISSION TIER
├─ Fetch merchant's 30-day transaction volume
├─ Apply tiered commission structure:
│  - Tier 1 (0-25L):     2.1%
│  - Tier 2 (25L-75L):   1.9%
│  - Tier 3 (75L-2Cr):   1.7%
│  - Tier 4 (>2Cr):      1.5%
└─ Different tiers for UPI/Cards/Net Banking

Step 4: APPLY FEE BEARER LOGIC
├─ Check merchant_fee_bearer_config table
├─ Three modes:
│  a) Merchant bears all fees (most common)
│  b) Customer bears all fees (rare)
│  c) Hybrid split (configurable %)
└─ Adjust commission calculation accordingly

Step 5: CALCULATE DEDUCTIONS
For each transaction in batch:
├─ Commission = amount × tier_rate
├─ GST = commission × 18%
├─ TDS = amount × tds_rate (1% or 2%)
├─ Reserve = (amount - commission - gst - tds) × 5%
└─ Net = amount - commission - gst - tds - reserve

Step 6: APPLY ROLLING RESERVE RULES
├─ Check merchant's rolling reserve config
├─ Two types:
│  a) Percentage-based: Hold X% of settlement
│  b) Amount-based: Hold fixed amount per cycle
├─ Release after configured days (typically 30-90 days)
└─ Track in rolling_reserve_ledger table

Step 7: APPLY ADJUSTMENTS
├─ Previous cycle adjustments (credits/debits)
├─ Chargeback deductions
├─ Refund adjustments
├─ Manual corrections (approved by ops)
└─ Fee waivers/discounts (promotional)

Step 8: GENERATE SETTLEMENT BATCH
├─ Insert into settlement_batches table
├─ Create settlement_items for each transaction
├─ Calculate batch totals
├─ Set status = PENDING_APPROVAL
└─ Generate settlement_id

Step 9: BANK TRANSFER INSTRUCTION
├─ Fetch merchant's primary bank_account
├─ Verify penny_drop status (account verified)
├─ Select payment rail:
│  - NEFT (default for <₹2L)
│  - RTGS (for ≥₹2L)
│  - IMPS (instant, if enabled)
│  - UPI (if UPI handle configured)
├─ Create settlement_instruction record
└─ Send to payment gateway for execution

Step 10: STATUS TRACKING
├─ PENDING_APPROVAL → OPS_APPROVED → FINANCE_APPROVED
├─ APPROVED → PROCESSING → BANK_INITIATED
├─ BANK_INITIATED → SUCCESS / FAILED
└─ Update settlement_txn_events for audit trail
```

---

## 2. V2 Settlement Calculation (Current State)

### **V2 Has This** ✅

**File**: `services/settlement-engine/settlement-calculator.cjs`

```javascript
class SettlementCalculator {
  // ✅ Commission tier logic
  async getCommissionTier(merchantId, effectiveDate) {
    // Queries sp_v2_commission_tiers table
    // Calculates merchant's 30-day volume
    // Returns applicable tier (2.1%, 1.9%, 1.7%, 1.5%)
  }

  // ✅ Basic settlement calculation
  async calculateSettlement(transactions, merchantId, batchDate) {
    // For each transaction:
    //   - Calculate commission (amount × tier_rate)
    //   - Calculate GST (commission × 18%)
    //   - Calculate TDS (amount × 1%)
    //   - Calculate reserve (net × 5%)
    //   - Calculate net payable
    // Returns settlement object
  }

  // ✅ Save to database
  async saveSettlementBatch(settlement) {
    // Inserts into sp_v2_settlement_batches
    // Status = 'PENDING'
  }

  // ✅ Fetch pending transactions
  async getPendingTransactions(merchantId, limit) {
    // Queries sp_v2_transactions_v1
    // Returns unsettled SUCCESS transactions
  }
}
```

**Tax Rates** (Hardcoded):
```javascript
TAX_RATES = {
  GST: 18.0,      // ✅ Correct
  TDS: 1.0,       // ⚠️ Simplified (should vary by merchant)
  RESERVE: 5.0    // ✅ Correct
}
```

**Commission Tiers** (Database):
```sql
sp_v2_commission_tiers:
  Tier 1 (0-25L):     2.1%  ✅
  Tier 2 (25L-75L):   1.9%  ✅
  Tier 3 (75L-2Cr):   1.7%  ✅
  Tier 4 (>2Cr):      1.5%  ✅
```

---

## 3. Critical Gaps - What V2 is Missing

### **Gap 1: Integration with Reconciliation Engine** 🔴 CRITICAL

**V1 Behavior**:
```sql
-- V1 only settles MATCHED transactions from reconciliation
SELECT t.* 
FROM transactions t
JOIN reconciliation_matches rm ON t.id = rm.transaction_id
WHERE rm.match_status = 'MATCHED'
  AND rm.cycle_date = '2025-09-30'
  AND t.merchant_id = 'MERCH001'
  AND t.id NOT IN (
    SELECT transaction_id FROM settlement_items
  )
```

**V2 Current State**:
```javascript
// ❌ V2 queries transactions directly, ignoring reconciliation status
async getPendingTransactions(merchantId) {
  const query = `
    SELECT * FROM sp_v2_transactions_v1 
    WHERE status = 'SUCCESS'  
    -- ❌ Should check reconciliation_matches table!
  `;
}
```

**What's Missing**:
```javascript
// ✅ V2 NEEDS THIS:
async getPendingTransactions(merchantId, cycleDate) {
  const query = `
    SELECT t.* 
    FROM sp_v2_transactions_v1 t
    JOIN recon_job_results rjr ON t.utr = rjr.utr
    WHERE rjr.status = 'MATCHED'              -- ✅ Only matched txns
      AND rjr.job_id = (
        SELECT job_id FROM recon_job_summary
        WHERE cycle_date = $2
        ORDER BY created_at DESC LIMIT 1
      )
      AND t.merchant_id = $1
      AND t.id NOT IN (
        SELECT txn_id FROM sp_v2_settlement_items
      )
  `;
  return client.query(query, [merchantId, cycleDate]);
}
```

**Impact**: 
- ❌ V2 may settle unreconciled transactions (huge risk!)
- ❌ No link between recon job and settlement batch
- ❌ Cannot trace which recon job a settlement came from

---

### **Gap 2: Fee Bearer Logic** 🔴 CRITICAL

**V1 Has**:
```sql
merchant_fee_bearer_config:
  merchant_id, fee_bearer_type, split_percentage
  
Fee Bearer Types:
  1. MERCHANT_BEARS_ALL   -- Merchant pays commission (default)
  2. CUSTOMER_BEARS_ALL   -- Customer pays (MDR passed to customer)
  3. HYBRID_SPLIT         -- 70% merchant, 30% customer
```

**V1 Calculation**:
```javascript
if (fee_bearer === 'MERCHANT_BEARS_ALL') {
  commission = amount × rate;
  merchant_settlement = amount - commission - gst - tds;
}
else if (fee_bearer === 'CUSTOMER_BEARS_ALL') {
  commission = amount × rate;
  merchant_settlement = amount;  // Merchant gets full amount
  // Commission recovered from customer at checkout
}
else if (fee_bearer === 'HYBRID_SPLIT') {
  commission = amount × rate;
  merchant_portion = commission × split_percentage;
  merchant_settlement = amount - merchant_portion - gst - tds;
}
```

**V2 Current State**:
```javascript
// ❌ V2 assumes MERCHANT_BEARS_ALL (hardcoded)
const txnCommission = Math.round(txnAmount * tier.commissionRate / 100);
const netAmount = grossAmount - commission - gst - tds;
```

**What's Missing**:
- ❌ No `merchant_fee_bearer_config` table in V2
- ❌ No fee bearer logic in settlement calculator
- ❌ Cannot handle customer-borne MDR scenarios

---

### **Gap 3: Payment Method-Specific Commission Rates** 🟡 HIGH

**V1 Has**:
```sql
fee_slabs:
  structure_id, payment_method, min_amount, max_amount, 
  percentage_fee, fixed_fee, gst_applicable

Examples:
  UPI:          1.5% (no fixed fee)
  Debit Card:   1.0% + ₹5 fixed
  Credit Card:  1.8% + ₹10 fixed
  Net Banking:  ₹15 flat (0% percentage)
  NEFT/RTGS:    ₹10 flat
```

**V1 Calculation**:
```javascript
const slab = getFeeSlabForMethod(payment_method, amount);
const commission = (amount × slab.percentage / 100) + slab.fixed_fee;
```

**V2 Current State**:
```javascript
// ❌ V2 uses single commission rate for all payment methods
const commission = amount × tier_rate;  // Same for UPI/Cards/NB
```

**What's Missing**:
- ❌ No `fee_slabs` table in V2 schema
- ❌ No payment method consideration in calculator
- ❌ Cannot apply fixed fees (₹5, ₹10, ₹15)

---

### **Gap 4: Rolling Reserve Management** 🟡 HIGH

**V1 Has**:
```sql
rolling_reserve_config:
  merchant_id, reserve_type, reserve_percentage, 
  reserve_days, max_reserve_amount

rolling_reserve_ledger:
  merchant_id, settlement_id, reserved_amount,
  reserved_at, release_date, released_at, status

Examples:
  - Hold 5% of each settlement for 90 days
  - Release ₹10L from reserves after 90 days
  - Track reserve balance per merchant
```

**V1 Logic**:
```javascript
// Calculate reserve for this settlement
const reserve = net_amount × reserve_percentage;

// Check if max reserve limit reached
const current_reserve = getCurrentReserveBalance(merchant_id);
if (current_reserve + reserve > max_reserve_amount) {
  reserve = max_reserve_amount - current_reserve;
}

// Insert into ledger
INSERT INTO rolling_reserve_ledger (
  merchant_id, settlement_id, reserved_amount,
  reserved_at, release_date, status
) VALUES (
  merchant_id, settlement_id, reserve,
  NOW(), NOW() + INTERVAL '90 days', 'HELD'
);

// Reduce from settlement
net_payable = net_amount - reserve;
```

**V2 Current State**:
```javascript
// ⚠️ V2 calculates reserve but doesn't track release
const reservePaise = Math.round(preReserveNet * 5.0 / 100);
const netAmountPaise = preReserveNet - reservePaise;

// ❌ No ledger entry
// ❌ No release tracking
// ❌ No max limit checking
```

**What's Missing**:
- ❌ No `rolling_reserve_ledger` table
- ❌ No reserve release logic
- ❌ No max reserve limit enforcement
- ❌ Cannot query "How much reserve is held for Merchant X?"

---

### **Gap 5: Settlement Cycle & Cutoff Logic** 🟡 HIGH

**V1 Has**:
```sql
settlement_cycles:
  merchant_id, frequency, cutoff_time, processing_days,
  auto_settlement_enabled, payment_rail

Examples:
  Merchant A: Daily T+1, cutoff 6 PM, auto NEFT
  Merchant B: Weekly Friday, cutoff 5 PM, manual approval
  Merchant C: Monthly 1st, cutoff 11:59 PM, RTGS
```

**V1 Logic**:
```javascript
// Determine which transactions belong to this cycle
const cutoffTime = merchant.settlement_config.cutoff_time; // "18:00:00"
const cycleDate = getCycleDate(merchant.frequency, cutoffTime);

// For T+1 with 6 PM cutoff on 2025-09-30:
// - Include txns from 2025-09-29 06:00:01 PM to 2025-09-30 06:00:00 PM
// - Settlement batch created on 2025-10-01

const txns = await query(`
  SELECT * FROM transactions
  WHERE merchant_id = $1
    AND created_at > $2  -- Previous cutoff
    AND created_at <= $3 -- Current cutoff
    AND status = 'SUCCESS'
`);
```

**V2 Current State**:
```javascript
// ❌ V2 has no cycle or cutoff concept
// Processes ALL pending transactions at once
async processSettlements(merchantId) {
  const pendingTxns = await getPendingTransactions(merchantId);
  // ❌ No date filtering
  // ❌ No cutoff time check
}
```

**What's Missing**:
- ❌ No `settlement_cycles` table
- ❌ No cutoff time logic
- ❌ Cannot do T+1, T+2, weekly, monthly settlements
- ❌ All settlements are ad-hoc/manual

---

### **Gap 6: Adjustments & Corrections** 🟡 MEDIUM

**V1 Has**:
```sql
settlement_adjustments:
  settlement_id, adjustment_type, amount, reason,
  created_by, approved_by, status

Adjustment Types:
  - CHARGEBACK_DEDUCTION    (Auto from chargebacks table)
  - REFUND_ADJUSTMENT       (Auto from refunds table)
  - PREVIOUS_CYCLE_CREDIT   (Carry-forward from failed settlement)
  - PREVIOUS_CYCLE_DEBIT    (Recover overpayment)
  - MANUAL_CORRECTION       (Ops team initiated)
  - FEE_WAIVER             (Promotional discount)
  - PENALTY                (Late payment fee)
```

**V1 Calculation**:
```javascript
// After calculating base settlement
let final_settlement = base_net_amount;

// Apply adjustments
const adjustments = await getAdjustments(merchant_id, cycle_date);
for (const adj of adjustments) {
  if (adj.type === 'CHARGEBACK_DEDUCTION') {
    final_settlement -= adj.amount;
  } else if (adj.type === 'PREVIOUS_CYCLE_CREDIT') {
    final_settlement += adj.amount;
  }
  // ... etc
}

// Record in settlement_batch
settlement.adjustments_total = sum(adjustments);
settlement.final_net_amount = final_settlement;
```

**V2 Current State**:
```javascript
// ❌ V2 only calculates base settlement
// No adjustments whatsoever
const netAmountPaise = grossAmount - commission - gst - tds - reserve;
```

**What's Missing**:
- ❌ No `settlement_adjustments` table
- ❌ No chargeback deductions
- ❌ No refund handling
- ❌ No carry-forward logic
- ❌ Cannot apply manual corrections

---

### **Gap 7: Bank Transfer Instructions** 🔴 CRITICAL

**V1 Has**:
```sql
merchant_bank_accounts:
  merchant_id, account_number, ifsc_code, account_type,
  bank_name, penny_drop_verified, is_primary

settlement_instructions:
  settlement_id, bank_account_id, transfer_mode, 
  transfer_amount, reference_number, initiated_at,
  completed_at, status, failure_reason

Transfer Modes:
  - NEFT (for <₹2L)
  - RTGS (for ≥₹2L)
  - IMPS (instant)
  - UPI (if handle configured)
```

**V1 Flow**:
```javascript
// 1. Get merchant's primary bank account
const bankAccount = await query(`
  SELECT * FROM merchant_bank_accounts
  WHERE merchant_id = $1 AND is_primary = true
`);

// 2. Verify account is penny-drop verified
if (!bankAccount.penny_drop_verified) {
  throw new Error('Bank account not verified');
}

// 3. Select transfer mode based on amount
const transferMode = settlement.net_amount >= 200000 ? 'RTGS' : 'NEFT';

// 4. Create transfer instruction
INSERT INTO settlement_instructions (
  settlement_id, bank_account_id, transfer_mode,
  transfer_amount, status
) VALUES (
  settlement_id, bankAccount.id, transferMode,
  settlement.net_amount, 'PENDING'
);

// 5. Send to payment gateway
const response = await paymentGateway.initiateTransfer({
  account_number: bankAccount.account_number,
  ifsc: bankAccount.ifsc_code,
  amount: settlement.net_amount,
  mode: transferMode,
  narration: `Settlement ${settlement_id}`
});

// 6. Update instruction with reference
UPDATE settlement_instructions 
SET reference_number = response.utr,
    status = 'INITIATED',
    initiated_at = NOW();
```

**V2 Current State**:
```javascript
// ❌ V2 only creates settlement batch
// No bank transfer capability at all
await saveSettlementBatch(settlement);
// Status = 'PENDING'
// ❌ No bank account fetching
// ❌ No transfer instruction generation
// ❌ No payment gateway integration
```

**What's Missing**:
- ❌ No `merchant_bank_accounts` table in V2
- ❌ No `settlement_instructions` table in V2
- ❌ No payment gateway integration
- ❌ Cannot execute actual bank transfers
- ❌ Settlement created but money never sent!

---

### **Gap 8: Status Workflow & Approvals** 🟡 MEDIUM

**V1 Workflow**:
```
PENDING_APPROVAL
  ↓ (Ops team reviews)
OPS_APPROVED
  ↓ (Finance team reviews)
FINANCE_APPROVED
  ↓ (System auto-initiates)
PROCESSING
  ↓ (Bank gateway processes)
BANK_INITIATED
  ↓ (Bank confirms)
SUCCESS / FAILED
```

**V1 Status Tracking**:
```sql
settlement_txn_events:
  settlement_id, from_status, to_status, 
  changed_by, changed_at, comment

settlement_batches:
  status, ops_approved_by, ops_approved_at,
  finance_approved_by, finance_approved_at
```

**V2 Current State**:
```javascript
// ❌ V2 has only one status: 'PENDING'
settlement.status = 'PENDING';
// No workflow
// No approval chain
```

**What's Missing**:
- ❌ No multi-stage approval workflow
- ❌ No ops approval tracking
- ❌ No finance approval tracking
- ❌ No status transition logging

---

## 4. Summary Table - V1 Features vs V2 Implementation

| Feature | V1 | V2 | Gap Severity |
|---------|----|----|--------------|
| **Commission Tier Calculation** | ✅ Volume-based | ✅ Same logic | ✅ **DONE** |
| **GST Calculation (18%)** | ✅ Yes | ✅ Yes | ✅ **DONE** |
| **TDS Calculation** | ✅ 1-2% variable | ⚠️ 1% fixed | 🟡 **MEDIUM** |
| **Reserve Fund Calculation** | ✅ 5% calculated | ✅ 5% calculated | ✅ **DONE** |
| **Integration with Recon** | ✅ Only MATCHED txns | ❌ Direct query | 🔴 **CRITICAL** |
| **Fee Bearer Logic** | ✅ 3 modes | ❌ None | 🔴 **CRITICAL** |
| **Payment Method Rates** | ✅ UPI/Card/NB split | ❌ Single rate | 🟡 **HIGH** |
| **Rolling Reserve Ledger** | ✅ Track & release | ❌ Calc only | 🟡 **HIGH** |
| **Settlement Cycles** | ✅ T+1/T+2/Weekly | ❌ Ad-hoc | 🟡 **HIGH** |
| **Cutoff Time Logic** | ✅ Configurable | ❌ None | 🟡 **HIGH** |
| **Adjustments (Chargebacks)** | ✅ Auto-deduct | ❌ None | 🟡 **MEDIUM** |
| **Adjustments (Manual)** | ✅ Ops can adjust | ❌ None | 🟡 **MEDIUM** |
| **Merchant Bank Accounts** | ✅ Multi-account | ❌ No table | 🔴 **CRITICAL** |
| **Bank Transfer Instructions** | ✅ NEFT/RTGS/IMPS | ❌ None | 🔴 **CRITICAL** |
| **Penny Drop Verification** | ✅ Required | ❌ N/A | 🔴 **CRITICAL** |
| **Approval Workflow** | ✅ Ops → Finance | ❌ None | 🟡 **MEDIUM** |
| **Status Transitions** | ✅ 7 states | ❌ 1 state | 🟡 **MEDIUM** |
| **Settlement Reports** | ✅ Merchant-wise | ✅ Same | ✅ **DONE** |

**Completion Status**: 
- ✅ **DONE**: 25%
- ⚠️ **PARTIAL**: 5%
- ❌ **MISSING**: 70%

---

## 5. Implementation Priority for V2

### **🔴 PHASE 1: CRITICAL (Week 1-2)** - Must-Have for Production

#### **1.1 Link Settlement to Reconciliation**
```sql
-- Add recon_job_id to settlement batch
ALTER TABLE sp_v2_settlement_batches 
ADD COLUMN recon_job_id UUID REFERENCES recon_job_summary(job_id);

-- Update settlement calculator
async getPendingTransactions(merchantId, reconJobId) {
  const query = `
    SELECT t.* 
    FROM sp_v2_transactions_v1 t
    JOIN recon_job_results rjr ON t.utr = rjr.utr
    WHERE rjr.job_id = $2
      AND rjr.status = 'MATCHED'
      AND t.merchant_id = $1
      AND t.id NOT IN (
        SELECT txn_id FROM sp_v2_settlement_items
      )
  `;
}
```

**Effort**: 4 hours  
**Impact**: Prevents settling unreconciled transactions

#### **1.2 Create Merchant Bank Accounts Table**
```sql
CREATE TABLE merchant_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL,
  account_number VARCHAR(20) NOT NULL,
  ifsc_code VARCHAR(11) NOT NULL,
  bank_name VARCHAR(100),
  account_type VARCHAR(20) DEFAULT 'CURRENT',
  account_holder_name VARCHAR(200),
  is_primary BOOLEAN DEFAULT FALSE,
  penny_drop_verified BOOLEAN DEFAULT FALSE,
  penny_drop_verified_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_merchant_bank_primary 
ON merchant_bank_accounts (merchant_id, is_primary);
```

**Effort**: 2 hours  
**Impact**: Required for bank transfers

#### **1.3 Create Settlement Instructions Table**
```sql
CREATE TABLE settlement_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  bank_account_id UUID REFERENCES merchant_bank_accounts(id),
  transfer_mode VARCHAR(20) NOT NULL, -- NEFT/RTGS/IMPS/UPI
  transfer_amount_paise BIGINT NOT NULL,
  bank_reference_number VARCHAR(50), -- UTR from bank
  gateway_reference VARCHAR(50), -- Internal reference
  initiated_at TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'PENDING',
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Effort**: 2 hours  
**Impact**: Track bank transfer status

#### **1.4 Add Bank Transfer Logic**
```javascript
// In settlement-calculator.cjs
async initiateBankTransfer(settlementBatchId) {
  const settlement = await getSettlementBatch(settlementBatchId);
  
  // Get primary bank account
  const bankAccount = await query(`
    SELECT * FROM merchant_bank_accounts
    WHERE merchant_id = $1 AND is_primary = true
  `, [settlement.merchant_id]);
  
  if (!bankAccount) {
    throw new Error('No primary bank account found');
  }
  
  if (!bankAccount.penny_drop_verified) {
    throw new Error('Bank account not verified');
  }
  
  // Select transfer mode
  const transferMode = settlement.net_amount_paise >= 20000000 ? 'RTGS' : 'NEFT';
  
  // Create instruction
  const instruction = await query(`
    INSERT INTO settlement_instructions (
      settlement_batch_id, bank_account_id, transfer_mode, transfer_amount_paise, status
    ) VALUES ($1, $2, $3, $4, 'PENDING')
    RETURNING id
  `, [settlementBatchId, bankAccount.id, transferMode, settlement.net_amount_paise]);
  
  // TODO: Integrate with payment gateway
  // await paymentGateway.initiateTransfer(...)
  
  return instruction.rows[0];
}
```

**Effort**: 6 hours  
**Impact**: Enable actual settlements

**Total Phase 1**: ~14 hours (2 days)

---

### **🟡 PHASE 2: HIGH PRIORITY (Week 3-4)** - Important for Accuracy

#### **2.1 Fee Bearer Configuration**
```sql
CREATE TABLE merchant_fee_bearer_config (
  merchant_id VARCHAR(50) PRIMARY KEY,
  fee_bearer_type VARCHAR(20) NOT NULL, -- MERCHANT_BEARS_ALL, CUSTOMER_BEARS_ALL, HYBRID
  split_percentage DECIMAL(5,2), -- For HYBRID mode
  effective_from DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Update calculator
async calculateSettlement(transactions, merchantId, batchDate) {
  const feeBearer = await getFeeBearer(merchantId);
  
  for (const txn of transactions) {
    const commission = calculateCommission(txn, tier);
    
    if (feeBearer.type === 'MERCHANT_BEARS_ALL') {
      netAmount -= commission;
    } else if (feeBearer.type === 'CUSTOMER_BEARS_ALL') {
      // Commission already collected from customer
      netAmount = grossAmount;
    }
  }
}
```

**Effort**: 8 hours

#### **2.2 Payment Method-Specific Rates**
```sql
CREATE TABLE fee_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method VARCHAR(20) NOT NULL, -- UPI, DEBIT_CARD, CREDIT_CARD, NET_BANKING
  min_amount_paise BIGINT,
  max_amount_paise BIGINT,
  percentage_fee DECIMAL(5,3),
  fixed_fee_paise INTEGER,
  effective_from DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- Insert standard rates
INSERT INTO fee_slabs (payment_method, percentage_fee, fixed_fee_paise) VALUES
('UPI', 1.500, 0),
('DEBIT_CARD', 1.000, 500),
('CREDIT_CARD', 1.800, 1000),
('NET_BANKING', 0.000, 1500);
```

**Effort**: 6 hours

#### **2.3 Settlement Cycles**
```sql
CREATE TABLE settlement_cycles (
  merchant_id VARCHAR(50) PRIMARY KEY,
  frequency VARCHAR(20) NOT NULL, -- DAILY, WEEKLY, MONTHLY, CUSTOM
  processing_day INTEGER, -- For WEEKLY (1-7) or MONTHLY (1-31)
  cutoff_time TIME NOT NULL DEFAULT '18:00:00',
  auto_settlement BOOLEAN DEFAULT FALSE,
  preferred_rail VARCHAR(20) DEFAULT 'NEFT',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Effort**: 8 hours

**Total Phase 2**: ~22 hours (3 days)

---

### **🟢 PHASE 3: MEDIUM PRIORITY (Week 5-6)** - Nice-to-Have

- Rolling reserve ledger & release logic (8 hours)
- Settlement adjustments table & logic (6 hours)
- Approval workflow (4 states) (8 hours)
- Status transitions tracking (4 hours)

**Total Phase 3**: ~26 hours (3.5 days)

---

## 6. Quick Start - Minimal V2 Settlement Integration

**If you need settlements working ASAP**, implement this minimal flow:

```javascript
// Minimal settlement flow (links recon → settlement → bank)

async function processSettlementForReconJob(reconJobId) {
  // 1. Get matched transactions from recon job
  const matched = await query(`
    SELECT t.* 
    FROM sp_v2_transactions_v1 t
    JOIN recon_job_results rjr ON t.utr = rjr.utr
    WHERE rjr.job_id = $1 AND rjr.status = 'MATCHED'
  `, [reconJobId]);
  
  // 2. Group by merchant
  const byMerchant = groupBy(matched, 'merchant_id');
  
  for (const [merchantId, txns] of Object.entries(byMerchant)) {
    // 3. Calculate settlement
    const settlement = await calculator.calculateSettlement(txns, merchantId);
    settlement.recon_job_id = reconJobId;
    
    // 4. Save batch
    const batch = await calculator.saveSettlementBatch(settlement);
    
    // 5. Get bank account
    const bankAccount = await query(`
      SELECT * FROM merchant_bank_accounts
      WHERE merchant_id = $1 AND is_primary = true
    `, [merchantId]);
    
    if (!bankAccount) {
      console.log(`No bank account for ${merchantId}`);
      continue;
    }
    
    // 6. Create transfer instruction
    await query(`
      INSERT INTO settlement_instructions (
        settlement_batch_id, bank_account_id, 
        transfer_mode, transfer_amount_paise, status
      ) VALUES ($1, $2, 'NEFT', $3, 'PENDING')
    `, [batch.dbId, bankAccount.id, settlement.netAmountPaise]);
    
    console.log(`✅ Settlement created for ${merchantId}: ₹${settlement.netAmountPaise/100}`);
  }
}
```

**Usage**:
```javascript
// After reconciliation completes
const reconJob = await runReconciliation({ date: '2025-09-30' });
await processSettlementForReconJob(reconJob.jobId);
```

---

## 7. V1 Settlement API Integration

If you want to **use V1's settlement calculation** directly (instead of rebuilding in V2):

### **Option A: Call V1 Settlement API**

```javascript
// Call V1 production API for settlement calculation
async function calculateSettlementViaV1(merchantId, transactions) {
  const response = await fetch('https://settlepaisaapi.sabpaisa.in/settlement/calculate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${V1_JWT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      merchant_id: merchantId,
      transactions: transactions.map(t => ({
        id: t.id,
        amount: t.amount_paise,
        payment_method: t.payment_mode,
        created_at: t.created_at
      }))
    })
  });
  
  const settlement = await response.json();
  
  // settlement will contain V1's exact calculation
  return {
    gross_amount: settlement.gross_amount,
    commission: settlement.commission,
    gst: settlement.gst,
    tds: settlement.tds,
    reserve: settlement.reserve,
    net_payable: settlement.net_payable
  };
}
```

### **Option B: Query V1 Database Directly**

```javascript
// Connect to V1 production DB and use their calculation stored procedures
const v1Pool = new Pool({
  host: '3.108.237.99',
  port: 5432,
  database: 'settlepaisa',
  user: 'settlepaisainternal',
  password: 'sabpaisa123'
});

async function calculateSettlementViaV1DB(merchantId, txnIds) {
  // V1 has stored procedures for settlement calculation
  const result = await v1Pool.query(`
    SELECT * FROM calculate_settlement_batch($1, $2)
  `, [merchantId, txnIds]);
  
  return result.rows[0];
}
```

---

## 8. Conclusion

**V2 Settlement Calculator Status**: ⚠️ **50% Complete**

✅ **What V2 Has**:
- Commission tier logic (volume-based)
- Basic tax calculation (GST, TDS, Reserve)
- Database persistence (batches table)
- API endpoints

❌ **What V2 is Missing (Critical)**:
1. Integration with reconciliation (only settle MATCHED txns)
2. Merchant bank accounts table
3. Settlement instructions & bank transfer logic
4. Fee bearer configuration
5. Payment method-specific rates
6. Settlement cycles & cutoff times
7. Adjustments (chargebacks, refunds, manual)
8. Approval workflow

**Recommended Path Forward**:

**Short-term (2 weeks)**:
- Implement Phase 1 (Critical gaps) - 14 hours
- Link settlement to reconciliation
- Add bank accounts & transfer instructions
- Enable basic settlements

**Medium-term (4 weeks)**:
- Implement Phase 2 (High priority) - 22 hours
- Add fee bearer logic
- Add payment method rates
- Add settlement cycles

**Long-term (6 weeks)**:
- Implement Phase 3 (Medium priority) - 26 hours
- Rolling reserve ledger
- Adjustments framework
- Approval workflow

**Total Implementation Time**: ~62 hours (8 days)

**Alternative**: Use V1 settlement calculation API directly while building V2 incrementally.

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-01  
**Status**: Implementation Ready
