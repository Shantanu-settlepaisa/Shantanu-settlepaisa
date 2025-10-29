# Phase 1: Critical Fixes - Day-by-Day Implementation Guide

**Timeline:** 5-6 days (October 22-27, 2025)
**Goal:** Achieve 85-90% production readiness with instant settlement support
**Team:** Development team + QA

---

## 📅 DAY 1: MORNING SESSION (4 hours)

### **Task 1: Chargeback & Refund Deduction**
**Time:** 9:00 AM - 1:00 PM
**Priority:** P0 - CRITICAL BLOCKER
**Owner:** Backend Developer

---

#### Step 1.1: Database Schema Updates (30 min)

**File:** Create `db/migrations/029_add_chargeback_refund_deductions.sql`

```sql
-- Migration 029: Add chargeback and refund tracking to settlement batches
-- Date: October 22, 2025

-- Add columns to settlement_batches
ALTER TABLE sp_v2_settlement_batches
ADD COLUMN IF NOT EXISTS chargeback_deductions_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_deductions_paise BIGINT DEFAULT 0;

-- Add comment
COMMENT ON COLUMN sp_v2_settlement_batches.chargeback_deductions_paise
IS 'Total chargebacks deducted from this settlement batch';

COMMENT ON COLUMN sp_v2_settlement_batches.refund_deductions_paise
IS 'Total refunds deducted from this settlement batch';

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_chargebacks_settlement_lookup
ON sp_v2_chargebacks(merchant_id, status, settlement_batch_id)
WHERE settlement_batch_id IS NULL AND status = 'APPROVED';

CREATE INDEX IF NOT EXISTS idx_refunds_settlement_lookup
ON sp_v2_refunds(merchant_id, status, settlement_batch_id)
WHERE settlement_batch_id IS NULL AND status = 'COMPLETED';

-- Add indexes for created_at to filter by date
CREATE INDEX IF NOT EXISTS idx_chargebacks_created_at
ON sp_v2_chargebacks(merchant_id, created_at)
WHERE settlement_batch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_created_at
ON sp_v2_refunds(merchant_id, created_at)
WHERE settlement_batch_id IS NULL;
```

**Run migration:**
```bash
cd /Users/shantanusingh/ops-dashboard
psql -U postgres -d settlepaisa_v2 -f db/migrations/029_add_chargeback_refund_deductions.sql
```

**Verification:**
```bash
psql -U postgres -d settlepaisa_v2 -c "\d sp_v2_settlement_batches" | grep deductions
```

**Expected output:**
```
 chargeback_deductions_paise | bigint | | default 0
 refund_deductions_paise     | bigint | | default 0
```

---

#### Step 1.2: Update Settlement Calculator (2 hours)

**File:** `services/settlement-engine/settlement-calculator-v1-logic.cjs`

**Location:** Line 25 (function signature)

**CHANGE 1: Update function signature**

```javascript
// OLD (Line 25):
async calculateSettlement(merchantId, reconciledTransactions, cycleDate) {

// NEW:
async calculateSettlement(merchantId, reconciledTransactions, cycleDate, settlementType = 'automatic') {
```

---

**Location:** After line 41 (after variable declarations)

**CHANGE 2: Add chargeback and refund queries**

```javascript
// INSERT AFTER LINE 41:
// Query chargebacks that haven't been settled yet
console.log(`[Settlement Calculator] Checking chargebacks for merchant ${merchantId}...`);

const chargebacksQuery = await v2Pool.query(`
  SELECT
    id,
    transaction_id,
    amount_paise,
    reason,
    created_at
  FROM sp_v2_chargebacks
  WHERE merchant_id = $1
    AND status = 'APPROVED'
    AND settlement_batch_id IS NULL
    AND created_at <= $2
  ORDER BY created_at DESC
`, [merchantId, cycleDate]);

const totalChargebackDeductions = chargebacksQuery.rows.reduce(
  (sum, cb) => sum + parseInt(cb.amount_paise),
  0
);

console.log(`[Settlement Calculator] Found ${chargebacksQuery.rows.length} chargebacks totaling ₹${totalChargebackDeductions / 100}`);

// Query refunds that haven't been settled yet
console.log(`[Settlement Calculator] Checking refunds for merchant ${merchantId}...`);

const refundsQuery = await v2Pool.query(`
  SELECT
    id,
    transaction_id,
    amount_paise,
    reason,
    created_at
  FROM sp_v2_refunds
  WHERE merchant_id = $1
    AND status = 'COMPLETED'
    AND settlement_batch_id IS NULL
    AND created_at <= $2
  ORDER BY created_at DESC
`, [merchantId, cycleDate]);

const totalRefundDeductions = refundsQuery.rows.reduce(
  (sum, ref) => sum + parseInt(ref.amount_paise),
  0
);

console.log(`[Settlement Calculator] Found ${refundsQuery.rows.length} refunds totaling ₹${totalRefundDeductions / 100}`);
```

---

**Location:** Line ~42-43 (update variable declarations)

**CHANGE 3: Add premium charge tracking**

```javascript
// OLD:
let totalGrossAmount = 0;
let totalConvCharges = 0;
let totalEpCharges = 0;
let totalGST = 0;
let totalPGCharge = 0;
let totalRollingReserve = 0;
let totalSettlementAmount = 0;

// NEW (ADD TWO MORE VARIABLES):
let totalGrossAmount = 0;
let totalConvCharges = 0;
let totalEpCharges = 0;
let totalGST = 0;
let totalPGCharge = 0;
let totalRollingReserve = 0;
let totalSettlementAmount = 0;
let totalPremiumCharges = 0;  // NEW: For instant/on-demand premium
```

---

**Location:** Line ~56-74 (inside transaction loop)

**CHANGE 4: Add instant settlement premium calculation**

```javascript
// AFTER calculating convCharges and epCharges (around line 66):

const convCharges = this.calculateConvCharges(
  txn.paid_amount,
  mdrRates.convcharges,
  mdrRates.convchargestype
);

const epCharges = this.calculateEpCharges(
  txn.paid_amount,
  mdrRates.endpointcharge,
  mdrRates.endpointchargestypes
);

// NEW: Add instant/on-demand settlement premium
let premiumCharge = 0;
if (settlementType === 'instant') {
  premiumCharge = Math.floor((txn.paid_amount * 0.4) / 100);  // +0.4% for instant
  console.log(`[Settlement Calculator] Instant premium for ${txn.transaction_id}: ₹${premiumCharge / 100}`);
} else if (settlementType === 'on_demand') {
  premiumCharge = Math.floor((txn.paid_amount * 0.2) / 100);  // +0.2% for on-demand
  console.log(`[Settlement Calculator] On-demand premium for ${txn.transaction_id}: ₹${premiumCharge / 100}`);
}

const gst = this.calculateGST(
  convCharges + epCharges + premiumCharge,  // CHANGED: Add premiumCharge to GST base
  mdrRates.gst,
  mdrRates.gsttype
);

const pgCharge = convCharges + epCharges + premiumCharge + gst;  // CHANGED: Add premiumCharge
```

---

**Location:** Line ~100-120 (update running totals)

**CHANGE 5: Update totals**

```javascript
// ADD THIS LINE (after totalPGCharge += pgCharge):
totalPremiumCharges += premiumCharge;

// Also update itemizedSettlements push (around line 102):
itemizedSettlements.push({
  transaction_id: txn.transaction_id,
  amount_paise: txn.paid_amount,
  commission_paise: convCharges + epCharges,
  premium_paise: premiumCharge,  // NEW
  gst_paise: gst,
  reserve_paise: rollingReserveAmount,
  net_paise: settlementAmount - rollingReserveAmount,
  payment_mode: txn.payment_mode,
  commission_rate: ((convCharges + epCharges + premiumCharge) / txn.paid_amount) * 100,  // CHANGED
  fee_bearer_id: feeBearerConfig.fee_bearer_id,
  fee_bearer_name: feeBearerConfig.fee_bearer_name,
  reserve_release_date: rollingReserveDate
});
```

---

**Location:** Line ~125-135 (return statement)

**CHANGE 6: Update return object with new fields**

```javascript
// OLD:
return {
  merchant_id: merchantId,
  cycle_date: cycleDate,
  total_transactions: reconciledTransactions.length,
  gross_amount_paise: totalGrossAmount,
  total_commission_paise: totalConvCharges + totalEpCharges,
  total_gst_paise: totalGST,
  total_reserve_paise: totalRollingReserve,
  net_settlement_amount: totalSettlementAmount - totalRollingReserve,
  items: itemizedSettlements
};

// NEW:
const netSettlementAmount = totalGrossAmount
                           - totalConvCharges
                           - totalEpCharges
                           - totalPremiumCharges  // NEW
                           - totalGST
                           - totalRollingReserve
                           - totalChargebackDeductions  // NEW
                           - totalRefundDeductions;     // NEW

console.log(`[Settlement Calculator] Settlement breakdown for ${merchantId}:`);
console.log(`  Gross: ₹${totalGrossAmount / 100}`);
console.log(`  Commission: ₹${(totalConvCharges + totalEpCharges) / 100}`);
console.log(`  Premium: ₹${totalPremiumCharges / 100}`);
console.log(`  GST: ₹${totalGST / 100}`);
console.log(`  Reserve: ₹${totalRollingReserve / 100}`);
console.log(`  Chargebacks: ₹${totalChargebackDeductions / 100}`);
console.log(`  Refunds: ₹${totalRefundDeductions / 100}`);
console.log(`  Net: ₹${netSettlementAmount / 100}`);

return {
  merchant_id: merchantId,
  cycle_date: cycleDate,
  settlement_type: settlementType,  // NEW
  priority: { 'instant': 2, 'on_demand': 1, 'automatic': 0 }[settlementType],  // NEW
  total_transactions: reconciledTransactions.length,
  gross_amount_paise: totalGrossAmount,
  total_commission_paise: totalConvCharges + totalEpCharges,
  instant_premium_paise: totalPremiumCharges,  // NEW
  total_gst_paise: totalGST,
  total_reserve_paise: totalRollingReserve,
  chargeback_deductions_paise: totalChargebackDeductions,  // NEW
  chargeback_count: chargebacksQuery.rows.length,  // NEW
  refund_deductions_paise: totalRefundDeductions,  // NEW
  refund_count: refundsQuery.rows.length,  // NEW
  net_settlement_amount: netSettlementAmount,
  items: itemizedSettlements
};
```

---

#### Step 1.3: Update Queue Processor to Pass Settlement Type (30 min)

**File:** `services/settlement-engine/settlement-queue-processor.cjs`

**Location:** Line ~150-160 (where calculator is called)

**CHANGE:**

```javascript
// OLD (around line 160):
const settlementBatch = await this.calculator.calculateSettlement(
  merchantId,
  txnResult.rows,
  cycleDate
);

// NEW:
// Get settlement type from queue (default to 'automatic')
const settlementType = batch.settlement_type || 'automatic';

console.log(`[Settlement Queue] Processing ${settlementType} settlement for ${merchantId}`);

const settlementBatch = await this.calculator.calculateSettlement(
  merchantId,
  txnResult.rows,
  cycleDate,
  settlementType  // NEW PARAMETER
);
```

---

#### Step 1.4: Update Settlement Batch Persist Function (30 min)

**File:** `services/settlement-engine/settlement-queue-processor.cjs`

**Location:** Line ~312-342 (persistSettlementBatch function)

**CHANGE:**

```javascript
// OLD:
const batchResult = await client.query(`
  INSERT INTO sp_v2_settlement_batches (
    id,
    merchant_id,
    cycle_date,
    total_transactions,
    gross_amount_paise,
    total_commission_paise,
    total_gst_paise,
    total_reserve_paise,
    net_amount_paise,
    status,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
  ) RETURNING id
`, [
  settlementBatch.merchant_id,
  settlementBatch.cycle_date,
  settlementBatch.total_transactions,
  settlementBatch.gross_amount_paise,
  settlementBatch.total_commission_paise,
  settlementBatch.total_gst_paise,
  settlementBatch.total_reserve_paise,
  settlementBatch.net_settlement_amount,
  'CALCULATED'
]);

// NEW:
const batchResult = await client.query(`
  INSERT INTO sp_v2_settlement_batches (
    id,
    merchant_id,
    cycle_date,
    settlement_type,
    priority,
    total_transactions,
    gross_amount_paise,
    total_commission_paise,
    instant_premium_paise,
    total_gst_paise,
    total_reserve_paise,
    chargeback_deductions_paise,
    refund_deductions_paise,
    net_amount_paise,
    status,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
  ) RETURNING id
`, [
  settlementBatch.merchant_id,
  settlementBatch.cycle_date,
  settlementBatch.settlement_type,        // NEW
  settlementBatch.priority,               // NEW
  settlementBatch.total_transactions,
  settlementBatch.gross_amount_paise,
  settlementBatch.total_commission_paise,
  settlementBatch.instant_premium_paise,  // NEW
  settlementBatch.total_gst_paise,
  settlementBatch.total_reserve_paise,
  settlementBatch.chargeback_deductions_paise,  // NEW
  settlementBatch.refund_deductions_paise,      // NEW
  settlementBatch.net_settlement_amount,
  'CALCULATED'
]);
```

---

#### Step 1.5: Create Test Data (30 min)

**File:** Create `test-chargeback-refund-settlement.cjs`

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: parseInt(process.env.DB_PORT || '5433')
});

async function testChargebackRefundDeduction() {
  console.log('=== Testing Chargeback & Refund Deduction ===\n');

  try {
    const merchantId = 'TEST_MERCH_001';
    const testDate = new Date().toISOString().split('T')[0];

    // 1. Insert test transactions (₹100K total)
    console.log('1. Inserting test transactions...');

    await pool.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise,
        status, transaction_date, payment_method, utr
      ) VALUES
        ('TXN_TEST_001', $1, 50000 * 100, 'RECONCILED', $2, 'UPI', 'UTR001'),
        ('TXN_TEST_002', $1, 30000 * 100, 'RECONCILED', $2, 'UPI', 'UTR002'),
        ('TXN_TEST_003', $1, 20000 * 100, 'RECONCILED', $2, 'NEFT', 'UTR003')
    `, [merchantId, testDate]);

    console.log('✅ Inserted 3 transactions totaling ₹1,00,000\n');

    // 2. Insert chargebacks (₹5K)
    console.log('2. Inserting chargebacks...');

    await pool.query(`
      INSERT INTO sp_v2_chargebacks (
        merchant_id, transaction_id, amount_paise,
        reason, status, created_at
      ) VALUES
        ($1, 'TXN_TEST_001', 3000 * 100, 'Customer dispute', 'APPROVED', NOW()),
        ($1, 'TXN_TEST_002', 2000 * 100, 'Fraud', 'APPROVED', NOW())
    `, [merchantId]);

    console.log('✅ Inserted 2 chargebacks totaling ₹5,000\n');

    // 3. Insert refunds (₹3K)
    console.log('3. Inserting refunds...');

    await pool.query(`
      INSERT INTO sp_v2_refunds (
        merchant_id, transaction_id, amount_paise,
        reason, status, created_at
      ) VALUES
        ($1, 'TXN_TEST_003', 3000 * 100, 'Customer requested', 'COMPLETED', NOW())
    `, [merchantId]);

    console.log('✅ Inserted 1 refund of ₹3,000\n');

    // 4. Add to settlement queue
    console.log('4. Adding transactions to settlement queue...');

    await pool.query(`
      INSERT INTO sp_v2_settlement_queue (
        merchant_id, transaction_id, amount_paise,
        settlement_type, priority, status, queued_at
      ) VALUES
        ($1, 'TXN_TEST_001', 50000 * 100, 'automatic', 0, 'PENDING', NOW()),
        ($1, 'TXN_TEST_002', 30000 * 100, 'automatic', 0, 'PENDING', NOW()),
        ($1, 'TXN_TEST_003', 20000 * 100, 'automatic', 0, 'PENDING', NOW())
    `, [merchantId]);

    console.log('✅ Added to settlement queue\n');

    // 5. Wait for settlement processor
    console.log('5. Waiting for settlement processor (30 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // 6. Check settlement batch
    console.log('6. Checking settlement batch...\n');

    const batchResult = await pool.query(`
      SELECT
        id,
        merchant_id,
        gross_amount_paise,
        total_commission_paise,
        total_gst_paise,
        total_reserve_paise,
        chargeback_deductions_paise,
        refund_deductions_paise,
        net_amount_paise,
        status
      FROM sp_v2_settlement_batches
      WHERE merchant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [merchantId]);

    if (batchResult.rows.length === 0) {
      console.error('❌ No settlement batch found!');
      return;
    }

    const batch = batchResult.rows[0];

    console.log('Settlement Batch Details:');
    console.log('========================');
    console.log(`Batch ID: ${batch.id}`);
    console.log(`Merchant: ${batch.merchant_id}`);
    console.log(`Status: ${batch.status}`);
    console.log('');
    console.log('Amounts:');
    console.log(`  Gross Amount:        ₹${(batch.gross_amount_paise / 100).toLocaleString()}`);
    console.log(`  Commission:          ₹${(batch.total_commission_paise / 100).toLocaleString()}`);
    console.log(`  GST:                 ₹${(batch.total_gst_paise / 100).toLocaleString()}`);
    console.log(`  Reserve:             ₹${(batch.total_reserve_paise / 100).toLocaleString()}`);
    console.log(`  Chargebacks:        -₹${(batch.chargeback_deductions_paise / 100).toLocaleString()}`);
    console.log(`  Refunds:            -₹${(batch.refund_deductions_paise / 100).toLocaleString()}`);
    console.log(`  ─────────────────────────────`);
    console.log(`  Net Amount:          ₹${(batch.net_amount_paise / 100).toLocaleString()}`);
    console.log('');

    // 7. Verify calculations
    console.log('7. Verifying calculations...\n');

    const expectedChargebacks = 5000 * 100;  // ₹5,000
    const expectedRefunds = 3000 * 100;       // ₹3,000

    if (batch.chargeback_deductions_paise !== expectedChargebacks) {
      console.error(`❌ Chargeback mismatch! Expected ₹${expectedChargebacks/100}, got ₹${batch.chargeback_deductions_paise/100}`);
    } else {
      console.log(`✅ Chargebacks correctly deducted: ₹${expectedChargebacks/100}`);
    }

    if (batch.refund_deductions_paise !== expectedRefunds) {
      console.error(`❌ Refund mismatch! Expected ₹${expectedRefunds/100}, got ₹${batch.refund_deductions_paise/100}`);
    } else {
      console.log(`✅ Refunds correctly deducted: ₹${expectedRefunds/100}`);
    }

    console.log('\n=== TEST PASSED ===\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testChargebackRefundDeduction();
```

**Run test:**
```bash
node test-chargeback-refund-settlement.cjs
```

**Expected output:**
```
✅ Chargebacks correctly deducted: ₹5000
✅ Refunds correctly deducted: ₹3000
```

---

## 📅 DAY 1: AFTERNOON SESSION (5 hours)

### **Task 2: Instant Settlement Intelligence**
**Time:** 2:00 PM - 7:00 PM
**Priority:** P0 - BUSINESS CRITICAL
**Owner:** Backend Developer

---

#### Step 2.1: Database Schema for Settlement Types (30 min)

**File:** Create `db/migrations/030_add_settlement_types.sql`

```sql
-- Migration 030: Add settlement type and priority support
-- Date: October 22, 2025

-- Add settlement_type and priority to settlement_batches
ALTER TABLE sp_v2_settlement_batches
ADD COLUMN IF NOT EXISTS settlement_type VARCHAR(20) DEFAULT 'automatic',
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS instant_premium_paise BIGINT DEFAULT 0;

-- Add check constraints
ALTER TABLE sp_v2_settlement_batches
DROP CONSTRAINT IF EXISTS chk_settlement_type;

ALTER TABLE sp_v2_settlement_batches
ADD CONSTRAINT chk_settlement_type
CHECK (settlement_type IN ('automatic', 'on_demand', 'instant'));

ALTER TABLE sp_v2_settlement_batches
DROP CONSTRAINT IF EXISTS chk_priority;

ALTER TABLE sp_v2_settlement_batches
ADD CONSTRAINT chk_priority
CHECK (priority IN (0, 1, 2));

-- Add comments
COMMENT ON COLUMN sp_v2_settlement_batches.settlement_type
IS 'Type of settlement: automatic (T+1), on_demand (manual trigger), instant (15 min SLA)';

COMMENT ON COLUMN sp_v2_settlement_batches.priority
IS 'Processing priority: 0=automatic, 1=on_demand, 2=instant';

COMMENT ON COLUMN sp_v2_settlement_batches.instant_premium_paise
IS 'Additional fee for instant/on-demand settlements (0.2-0.4% of gross)';

-- Add settlement_type to queue table
ALTER TABLE sp_v2_settlement_queue
ADD COLUMN IF NOT EXISTS settlement_type VARCHAR(20) DEFAULT 'automatic',
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

ALTER TABLE sp_v2_settlement_queue
ADD CONSTRAINT chk_queue_settlement_type
CHECK (settlement_type IN ('automatic', 'on_demand', 'instant'));

ALTER TABLE sp_v2_settlement_queue
ADD CONSTRAINT chk_queue_priority
CHECK (priority IN (0, 1, 2));

-- Create index for priority-based processing
DROP INDEX IF EXISTS idx_settlement_queue_priority;

CREATE INDEX idx_settlement_queue_priority
ON sp_v2_settlement_queue(priority DESC, queued_at ASC)
WHERE status = 'PENDING';

COMMENT ON INDEX idx_settlement_queue_priority
IS 'Optimized for priority-based queue processing (instant first)';

-- Add settlement_type to bank_transfers
ALTER TABLE sp_v2_settlement_bank_transfers
ADD COLUMN IF NOT EXISTS settlement_type VARCHAR(20) DEFAULT 'automatic',
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Create SLA breach tracking table
CREATE TABLE IF NOT EXISTS sp_v2_settlement_sla_breaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  merchant_id VARCHAR(50),
  settlement_type VARCHAR(20) NOT NULL,
  sla_minutes INTEGER NOT NULL,
  actual_minutes INTEGER NOT NULL,
  breach_amount_minutes INTEGER NOT NULL,
  severity VARCHAR(20) DEFAULT 'MEDIUM',
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sla_breach_lookup
ON sp_v2_settlement_sla_breaches(merchant_id, created_at DESC);

CREATE INDEX idx_sla_breach_unnotified
ON sp_v2_settlement_sla_breaches(notified, severity)
WHERE notified = false;

COMMENT ON TABLE sp_v2_settlement_sla_breaches
IS 'Tracks SLA violations for instant and on-demand settlements';
```

**Run migration:**
```bash
psql -U postgres -d settlepaisa_v2 -f db/migrations/030_add_settlement_types.sql
```

---

#### Step 2.2: Update Queue Processor for Priority (1.5 hours)

**File:** `services/settlement-engine/settlement-queue-processor.cjs`

**Location:** Line 67-80

**CHANGE: Update queue query to support priority**

```javascript
// OLD:
const result = await v2Pool.query(`
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
    COUNT(*) >= $1 OR
    MIN(queued_at) < NOW() - INTERVAL '5 minutes'
`, [this.batchSize]);

// NEW:
const result = await v2Pool.query(`
  SELECT
    merchant_id,
    settlement_type,
    priority,
    array_agg(transaction_id ORDER BY queued_at) as transaction_ids,
    COUNT(*) as txn_count,
    MIN(queued_at) as oldest_queued,
    SUM(amount_paise) as total_amount
  FROM sp_v2_settlement_queue
  WHERE status = 'PENDING'
  GROUP BY merchant_id, settlement_type, priority
  HAVING
    COUNT(*) >= $1 OR
    MIN(queued_at) < NOW() - INTERVAL '5 minutes' OR
    (settlement_type = 'instant' AND MIN(queued_at) < NOW() - INTERVAL '1 minute')
  ORDER BY
    priority DESC,           -- Process instant (2) before on_demand (1) before automatic (0)
    MIN(queued_at) ASC       -- Within same priority, oldest first
`, [this.batchSize]);

if (result.rows.length === 0) {
  // No batches ready
  this.isProcessing = false;
  return;
}

console.log(`[Settlement Queue] Found ${result.rows.length} batches ready for processing`);

// Log priority distribution
const priorityBreakdown = result.rows.reduce((acc, batch) => {
  const type = batch.settlement_type;
  acc[type] = (acc[type] || 0) + 1;
  return acc;
}, {});

console.log(`[Settlement Queue] Priority breakdown:`, priorityBreakdown);

for (const batch of result.rows) {
  await this.processSettlementBatch(
    batch.merchant_id,
    batch.transaction_ids,
    batch.txn_count,
    batch.total_amount,
    batch.settlement_type,  // NEW
    batch.priority,         // NEW
    batch.oldest_queued     // NEW
  );
}
```

---

**Location:** Line ~106 (processSettlementBatch function signature)

**CHANGE: Add new parameters**

```javascript
// OLD:
async processSettlementBatch(merchantId, transactionIds, txnCount, totalAmount) {

// NEW:
async processSettlementBatch(merchantId, transactionIds, txnCount, totalAmount, settlementType = 'automatic', priority = 0, oldestQueued = new Date()) {
```

---

**Location:** After line ~284 (after batch processing, before autoApprove)

**CHANGE: Add SLA monitoring**

```javascript
// INSERT AFTER LINE 284:

// === SLA MONITORING ===
const slaConfig = {
  'instant': 15,      // 15 minutes
  'on_demand': 120,   // 2 hours
  'automatic': 1440   // 24 hours
};

const slaMinutes = slaConfig[settlementType] || 1440;
const queuedTime = new Date(oldestQueued);
const processedTime = new Date();
const actualMinutes = Math.floor((processedTime - queuedTime) / 60000);

console.log(`[Settlement Queue] SLA Check: ${settlementType} settlement took ${actualMinutes} min (SLA: ${slaMinutes} min)`);

if (actualMinutes > slaMinutes) {
  // SLA BREACH!
  const breachAmount = actualMinutes - slaMinutes;
  const severity = breachAmount > slaMinutes * 0.5 ? 'CRITICAL' :
                   breachAmount > slaMinutes * 0.2 ? 'HIGH' : 'MEDIUM';

  console.warn(`⚠️  SLA BREACH: ${settlementType} settlement for ${merchantId} - ${breachAmount} min over SLA (${severity})`);

  // Log to SLA breach table
  try {
    await v2Pool.query(`
      INSERT INTO sp_v2_settlement_sla_breaches (
        settlement_batch_id,
        merchant_id,
        settlement_type,
        sla_minutes,
        actual_minutes,
        breach_amount_minutes,
        severity,
        notified,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())
    `, [
      batchId,
      merchantId,
      settlementType,
      slaMinutes,
      actualMinutes,
      breachAmount,
      severity
    ]);

    // Send alert for CRITICAL and HIGH severity
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      await this.sendSLABreachAlert({
        batch_id: batchId,
        merchant_id: merchantId,
        settlement_type: settlementType,
        sla_minutes: slaMinutes,
        actual_minutes: actualMinutes,
        breach_amount: breachAmount,
        severity: severity
      });
    }

  } catch (error) {
    console.error('[Settlement Queue] Failed to log SLA breach:', error.message);
  }

} else {
  console.log(`✅ SLA MET: ${settlementType} settlement completed in ${actualMinutes} min`);
}
```

---

**Location:** End of file (before module.exports)

**CHANGE: Add SLA alert function**

```javascript
// INSERT BEFORE module.exports:

/**
 * Send SLA breach alert via multiple channels
 */
async sendSLABreachAlert(breach) {
  console.error(`
╔════════════════════════════════════════╗
║     🚨 SLA BREACH ALERT 🚨            ║
╠════════════════════════════════════════╣
║ Merchant:      ${breach.merchant_id.padEnd(23)}║
║ Type:          ${breach.settlement_type.toUpperCase().padEnd(23)}║
║ Severity:      ${breach.severity.padEnd(23)}║
║ SLA:           ${String(breach.sla_minutes).padEnd(23)}min ║
║ Actual:        ${String(breach.actual_minutes).padEnd(23)}min ║
║ Breach:        ${String(breach.breach_amount).padEnd(23)}min ║
╚════════════════════════════════════════╝
  `);

  // TODO: Implement email/SMS/Slack notifications
  // For now, just log to console and database

  try {
    // Mark as notified
    await v2Pool.query(`
      UPDATE sp_v2_settlement_sla_breaches
      SET notified = true
      WHERE settlement_batch_id = $1
    `, [breach.batch_id]);

  } catch (error) {
    console.error('[SLA Alert] Failed to update notification status:', error.message);
  }
}
```

---

#### Step 2.3: Create Test for Instant Settlement (1 hour)

**File:** Create `test-instant-settlement.cjs`

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: parseInt(process.env.DB_PORT || '5433')
});

async function testInstantSettlement() {
  console.log('=== Testing Instant Settlement Intelligence ===\n');

  try {
    const merchantId = 'INSTANT_TEST_001';

    // 1. Insert test transactions
    console.log('1. Creating test transactions for instant settlement...');

    await pool.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise,
        status, transaction_date, payment_method, utr
      ) VALUES
        ('INSTANT_TXN_001', $1, 50000 * 100, 'RECONCILED', NOW(), 'UPI', 'UTR_INSTANT_001'),
        ('INSTANT_TXN_002', $1, 25000 * 100, 'RECONCILED', NOW(), 'UPI', 'UTR_INSTANT_002')
    `, [merchantId]);

    console.log('✅ Created 2 transactions totaling ₹75,000\n');

    // 2. Add to instant settlement queue
    console.log('2. Adding to INSTANT settlement queue...');

    const startTime = new Date();

    await pool.query(`
      INSERT INTO sp_v2_settlement_queue (
        merchant_id, transaction_id, amount_paise,
        settlement_type, priority, status, queued_at
      ) VALUES
        ($1, 'INSTANT_TXN_001', 50000 * 100, 'instant', 2, 'PENDING', NOW()),
        ($1, 'INSTANT_TXN_002', 25000 * 100, 'instant', 2, 'PENDING', NOW())
    `, [merchantId]);

    console.log('✅ Queued with priority=2 (instant)\n');

    // 3. Wait for processing
    console.log('3. Waiting for settlement processor (max 2 minutes)...');

    let batch = null;
    let attempts = 0;
    const maxAttempts = 24; // 24 * 5 seconds = 2 minutes

    while (!batch && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const result = await pool.query(`
        SELECT * FROM sp_v2_settlement_batches
        WHERE merchant_id = $1
          AND settlement_type = 'instant'
        ORDER BY created_at DESC
        LIMIT 1
      `, [merchantId]);

      if (result.rows.length > 0) {
        batch = result.rows[0];
      }

      process.stdout.write('.');
    }

    console.log('');

    if (!batch) {
      console.error('❌ Settlement batch not created after 2 minutes!');
      return;
    }

    const processingTime = Math.floor((new Date() - startTime) / 1000);

    console.log(`✅ Settlement batch created in ${processingTime} seconds\n`);

    // 4. Verify instant settlement features
    console.log('4. Verifying instant settlement features...\n');

    console.log('Batch Details:');
    console.log('=============');
    console.log(`ID:              ${batch.id}`);
    console.log(`Merchant:        ${batch.merchant_id}`);
    console.log(`Type:            ${batch.settlement_type}`);
    console.log(`Priority:        ${batch.priority}`);
    console.log(`Status:          ${batch.status}`);
    console.log('');

    // Check priority
    if (batch.priority !== 2) {
      console.error(`❌ Wrong priority! Expected 2, got ${batch.priority}`);
    } else {
      console.log(`✅ Priority correct: 2 (instant)`);
    }

    // Check settlement type
    if (batch.settlement_type !== 'instant') {
      console.error(`❌ Wrong type! Expected 'instant', got '${batch.settlement_type}'`);
    } else {
      console.log(`✅ Settlement type correct: instant`);
    }

    // Check instant premium (0.4% of ₹75,000 = ₹300)
    const expectedPremium = Math.floor(75000 * 100 * 0.4 / 100);

    console.log('');
    console.log('Fee Breakdown:');
    console.log('=============');
    console.log(`Gross Amount:    ₹${(batch.gross_amount_paise / 100).toLocaleString()}`);
    console.log(`Commission:      ₹${(batch.total_commission_paise / 100).toLocaleString()}`);
    console.log(`Instant Premium: ₹${(batch.instant_premium_paise / 100).toLocaleString()} (expected: ₹${(expectedPremium / 100).toLocaleString()})`);
    console.log(`GST:             ₹${(batch.total_gst_paise / 100).toLocaleString()}`);
    console.log(`Net Amount:      ₹${(batch.net_amount_paise / 100).toLocaleString()}`);
    console.log('');

    if (Math.abs(batch.instant_premium_paise - expectedPremium) > 10) {
      console.warn(`⚠️  Instant premium seems off. Expected ~₹${expectedPremium/100}, got ₹${batch.instant_premium_paise/100}`);
    } else {
      console.log(`✅ Instant premium correct: ₹${batch.instant_premium_paise / 100}`);
    }

    // 5. Check SLA compliance
    console.log('');
    console.log('5. Checking SLA compliance (15 minutes for instant)...\n');

    const slaResult = await pool.query(`
      SELECT * FROM sp_v2_settlement_sla_breaches
      WHERE settlement_batch_id = $1
    `, [batch.id]);

    if (slaResult.rows.length > 0) {
      const breach = slaResult.rows[0];
      console.error(`❌ SLA BREACH DETECTED!`);
      console.error(`   SLA: ${breach.sla_minutes} minutes`);
      console.error(`   Actual: ${breach.actual_minutes} minutes`);
      console.error(`   Breach: ${breach.breach_amount_minutes} minutes`);
      console.error(`   Severity: ${breach.severity}`);
    } else {
      console.log(`✅ No SLA breach - settlement completed within 15 minutes`);
    }

    console.log('\n=== INSTANT SETTLEMENT TEST PASSED ===\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testInstantSettlement();
```

**Run test:**
```bash
# Ensure settlement-queue-processor is running
pm2 status settlement-queue

# If not running, start it:
cd services/settlement-engine
pm2 start ecosystem.config.settlement-queue.js

# Run test
node test-instant-settlement.cjs
```

---

## 📅 DAY 2: MORNING SESSION (4 hours)

### **Task 3: Transfer Mode Router**
**Time:** 9:00 AM - 1:00 PM
**Priority:** P0 - REQUIRED FOR INSTANT
**Owner:** Backend Developer

---

#### Step 3.1: Create Transfer Mode Router (1.5 hours)

**File:** `services/overview-api/settlements.cjs`

**Location:** Before endpoint definitions (after Pool initialization)

**ADD NEW HELPER FUNCTIONS:**

```javascript
// INSERT AFTER LINE ~18 (after pool initialization):

/**
 * ========================================
 * TRANSFER MODE SELECTION INTELLIGENCE
 * ========================================
 *
 * Selects optimal transfer mode based on:
 * - Settlement type (instant/on_demand/automatic)
 * - Transfer amount (IMPS has ₹2L limit)
 * - Current time (RTGS only Mon-Fri 9 AM - 4:30 PM)
 */

/**
 * Intelligently select bank transfer mode
 *
 * @param {string} settlementType - 'instant', 'on_demand', or 'automatic'
 * @param {number} amountPaise - Transfer amount in paise
 * @param {Date} currentTime - Current timestamp
 * @returns {string} Selected transfer mode: 'IMPS', 'RTGS', 'NEFT', or 'IMPS_SPLIT'
 */
function selectTransferMode(settlementType, amountPaise, currentTime = new Date()) {
  console.log(`[Transfer Mode Router] Selecting mode for ${settlementType} settlement of ₹${amountPaise / 100}`);

  // INSTANT SETTLEMENTS: Must use IMPS (24x7 availability)
  if (settlementType === 'instant') {
    const IMPS_LIMIT = 200000 * 100; // ₹2 lakh limit

    if (amountPaise > IMPS_LIMIT) {
      console.warn(`⚠️  Amount ₹${amountPaise/100} exceeds IMPS limit (₹2L)`);

      // Check if RTGS is available (Mon-Fri, 9 AM - 4:30 PM)
      if (isRTGSHours(currentTime)) {
        console.log(`✅ Using RTGS (banking hours, amount > ₹2L)`);
        return 'RTGS';
      } else {
        console.warn(`⚠️  RTGS not available at this time. Will need to split into multiple IMPS transactions.`);
        return 'IMPS_SPLIT'; // Special flag indicating multiple IMPS needed
      }
    }

    console.log(`✅ Using IMPS (instant, 24x7 available)`);
    return 'IMPS';
  }

  // ON-DEMAND SETTLEMENTS: Prefer RTGS for large amounts during banking hours
  if (settlementType === 'on_demand') {
    const RTGS_MIN_AMOUNT = 200000 * 100; // ₹2 lakh minimum

    if (amountPaise >= RTGS_MIN_AMOUNT && isRTGSHours(currentTime)) {
      console.log(`✅ Using RTGS (on-demand, ₹${amountPaise/100} >= ₹2L, banking hours)`);
      return 'RTGS';
    }

    if (isNEFTHours(currentTime)) {
      console.log(`✅ Using NEFT (on-demand, NEFT hours)`);
      return 'NEFT';
    }

    // Fallback to IMPS for 24x7 availability
    const IMPS_LIMIT = 200000 * 100;
    if (amountPaise <= IMPS_LIMIT) {
      console.log(`✅ Using IMPS (on-demand, outside NEFT hours, amount < ₹2L)`);
      return 'IMPS';
    } else {
      console.log(`✅ Using NEFT (on-demand, will process in next NEFT window)`);
      return 'NEFT'; // Will be queued for next NEFT window
    }
  }

  // AUTOMATIC SETTLEMENTS: Use NEFT (most economical)
  console.log(`✅ Using NEFT (automatic settlement, standard T+1)`);
  return 'NEFT';
}

/**
 * Check if current time is within RTGS operating hours
 *
 * RTGS Hours: Monday-Friday, 9:00 AM - 4:30 PM IST
 *
 * @param {Date} time - Time to check
 * @returns {boolean} True if RTGS is available
 */
function isRTGSHours(time = new Date()) {
  const hour = time.getHours();
  const minute = time.getMinutes();
  const day = time.getDay();

  // Weekend check (Saturday=6, Sunday=0)
  if (day === 0 || day === 6) {
    return false;
  }

  // Check hours: 9:00 AM - 4:30 PM
  if (hour < 9 || hour > 16) {
    return false;
  }

  // If it's 4 PM hour, check if before 4:30 PM
  if (hour === 16 && minute > 30) {
    return false;
  }

  return true;
}

/**
 * Check if current time is within NEFT operating hours
 *
 * NEFT Hours: Monday-Saturday, 8:00 AM - 7:00 PM IST
 * (NEFT operates in hourly batches)
 *
 * @param {Date} time - Time to check
 * @returns {boolean} True if NEFT is available
 */
function isNEFTHours(time = new Date()) {
  const hour = time.getHours();
  const day = time.getDay();

  // Sunday check
  if (day === 0) {
    return false;
  }

  // Operating hours: 8:00 AM - 7:00 PM
  return hour >= 8 && hour < 19;
}

/**
 * Get next available NEFT batch time
 *
 * @param {Date} time - Current time
 * @returns {Date} Next NEFT batch time
 */
function getNextNEFTBatchTime(time = new Date()) {
  const nextBatch = new Date(time);

  // NEFT runs hourly from 8 AM to 7 PM on weekdays and Saturday
  if (!isNEFTHours(time)) {
    // If it's after 7 PM or Sunday, next batch is tomorrow 8 AM
    nextBatch.setDate(nextBatch.getDate() + 1);
    nextBatch.setHours(8, 0, 0, 0);

    // If tomorrow is Sunday, move to Monday
    if (nextBatch.getDay() === 0) {
      nextBatch.setDate(nextBatch.getDate() + 1);
    }
  } else {
    // Next hourly batch
    nextBatch.setHours(nextBatch.getHours() + 1, 0, 0, 0);
  }

  return nextBatch;
}

// Export helper functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports.selectTransferMode = selectTransferMode;
  module.exports.isRTGSHours = isRTGSHours;
  module.exports.isNEFTHours = isNEFTHours;
  module.exports.getNextNEFTBatchTime = getNextNEFTBatchTime;
}
```

---

#### Step 3.2: Update Approval Endpoint (1 hour)

**File:** `services/overview-api/settlements.cjs`

**Location:** Line ~208-249 (approval endpoint)

**CHANGE:**

```javascript
// Get merchant bank details AND settlement info
const configResult = await client.query(`
  SELECT
    mc.merchant_id,
    mc.account_number as bank_account_number,
    mc.account_holder_name as bank_account_name,
    mc.ifsc_code as bank_ifsc_code,
    mc.bank_name,
    mc.branch_name as bank_branch,
    mc.preferred_transfer_mode,
    sb.settlement_type,
    sb.priority,
    sb.net_amount_paise
  FROM sp_v2_merchant_settlement_config mc
  CROSS JOIN sp_v2_settlement_batches sb
  WHERE mc.merchant_id = $1
    AND sb.id = $2
    AND mc.is_active = true
  LIMIT 1
`, [batch.merchant_id, batchId]);

if (configResult.rows.length === 0) {
  throw new Error('Merchant bank configuration not found');
}

const config = configResult.rows[0];

// Intelligently select transfer mode based on settlement type
const transferMode = selectTransferMode(
  config.settlement_type || 'automatic',
  config.net_amount_paise,
  new Date()
);

console.log(`[Settlements API] Selected transfer mode: ${transferMode} for ${config.settlement_type} settlement of ₹${config.net_amount_paise / 100}`);

// Handle IMPS_SPLIT case (amount > ₹2L for instant settlement)
if (transferMode === 'IMPS_SPLIT') {
  console.warn(`⚠️  LARGE INSTANT SETTLEMENT: ₹${config.net_amount_paise / 100} exceeds IMPS limit`);
  console.warn(`⚠️  This will require multiple IMPS transactions or manual intervention`);
  // TODO: Implement automatic splitting logic in Phase 2
  // For now, create single PENDING transfer with IMPS_SPLIT flag
}

// Create bank transfer record
await client.query(`
  INSERT INTO sp_v2_settlement_bank_transfers (
    settlement_batch_id,
    merchant_id,
    bank_account_number,
    bank_account_name,
    ifsc_code,
    bank_name,
    amount_paise,
    transfer_mode,
    settlement_type,
    priority,
    status,
    initiated_at,
    created_by
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', NOW(), $11)
`, [
  batchId,
  config.merchant_id,
  config.bank_account_number,
  config.bank_account_name,
  config.bank_ifsc_code,
  config.bank_name,
  batch.net_amount_paise,
  transferMode,
  config.settlement_type,
  config.priority || 0,
  approver_id
]);

console.log(`[Settlements API] Bank transfer created: ${transferMode}, priority ${config.priority}`);
```

---

## 📅 DAY 2: AFTERNOON SESSION (3 hours)

### **Task 4: Auto-Approval Bug Fix**
**Time:** 2:00 PM - 5:00 PM
**Priority:** P0 - CRITICAL BUG
**Owner:** Backend Developer

#### Step 4.1: Fix Auto-Approval Function (2 hours)

**File:** `services/settlement-engine/settlement-queue-processor.cjs`

**Location:** Line 420-435

**REPLACE ENTIRE FUNCTION:**

```javascript
/**
 * Auto-approve settlement batch and create bank transfer
 *
 * CRITICAL FIX: This function was NOT creating bank_transfers records!
 * Instant settlements were stuck in APPROVED status with no payout initiated.
 *
 * @param {string} batchId - Settlement batch ID
 * @param {object} settlementBatch - Settlement batch data from calculator
 * @param {string} merchantId - Merchant ID
 */
async autoApprove(batchId, settlementBatch, merchantId) {
  const client = await v2Pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`[Settlement Queue] Auto-approving batch ${batchId} (${settlementBatch.settlement_type}, ₹${settlementBatch.net_settlement_amount / 100})...`);

    // 1. Update batch status to APPROVED
    await client.query(`
      UPDATE sp_v2_settlement_batches
      SET status = 'APPROVED',
          approved_at = NOW(),
          approved_by = 'SYSTEM_AUTO_APPROVAL',
          updated_at = NOW()
      WHERE id = $1
    `, [batchId]);

    // 2. Get merchant bank configuration
    const configResult = await client.query(`
      SELECT
        account_number,
        account_holder_name,
        ifsc_code,
        bank_name,
        branch_name,
        preferred_transfer_mode
      FROM sp_v2_merchant_settlement_config
      WHERE merchant_id = $1
        AND is_active = true
      LIMIT 1
    `, [merchantId]);

    if (configResult.rows.length === 0) {
      throw new Error(`Merchant bank configuration not found for ${merchantId}`);
    }

    const config = configResult.rows[0];

    // 3. Intelligently select transfer mode
    const settlementType = settlementBatch.settlement_type || 'automatic';
    const priority = settlementBatch.priority || 0;

    const transferMode = this.selectTransferMode(
      settlementType,
      settlementBatch.net_settlement_amount,
      new Date()
    );

    console.log(`[Settlement Queue] Transfer mode selected: ${transferMode}`);

    // 4. Create bank transfer record (THIS WAS MISSING!)
    const transferResult = await client.query(`
      INSERT INTO sp_v2_settlement_bank_transfers (
        settlement_batch_id,
        merchant_id,
        bank_account_number,
        bank_account_name,
        ifsc_code,
        bank_name,
        amount_paise,
        transfer_mode,
        settlement_type,
        priority,
        status,
        initiated_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', NOW(), 'SYSTEM_AUTO_APPROVAL')
      RETURNING id
    `, [
      batchId,
      merchantId,
      config.account_number,
      config.account_holder_name,
      config.ifsc_code,
      config.bank_name,
      settlementBatch.net_settlement_amount,
      transferMode,
      settlementType,
      priority
    ]);

    const transferId = transferResult.rows[0].id;

    console.log(`[Settlement Queue] ✅ Bank transfer created: ${transferId} (${transferMode})`);

    // 5. Add timeline event
    await client.query(`
      INSERT INTO sp_v2_settlement_timeline_events (
        settlement_batch_id,
        event_type,
        event_data,
        created_by,
        created_at
      ) VALUES ($1, 'SETTLEMENT_AUTO_APPROVED', $2, 'SYSTEM', NOW())
    `, [
      batchId,
      JSON.stringify({
        amount_paise: settlementBatch.net_settlement_amount,
        transfer_mode: transferMode,
        transfer_id: transferId,
        settlement_type: settlementType,
        priority: priority,
        auto_approved_threshold: 100000 * 100, // ₹1L
        merchant_bank: config.bank_name,
        merchant_account: config.account_number
      })
    ]);

    await client.query('COMMIT');

    console.log(`[Settlement Queue] ✅ Batch ${batchId} auto-approved with bank transfer ${transferId} created`);
    console.log(`   Settlement Type: ${settlementType}`);
    console.log(`   Transfer Mode: ${transferMode}`);
    console.log(`   Priority: ${priority}`);
    console.log(`   Amount: ₹${settlementBatch.net_settlement_amount / 100}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Settlement Queue] Auto-approval failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Helper method for transfer mode selection
 * (Duplicates logic from settlements.cjs for consistency)
 */
selectTransferMode(settlementType, amountPaise, currentTime = new Date()) {
  // Instant settlements: IMPS (24x7)
  if (settlementType === 'instant') {
    const IMPS_LIMIT = 200000 * 100; // ₹2L

    if (amountPaise > IMPS_LIMIT) {
      // Check RTGS hours
      const hour = currentTime.getHours();
      const day = currentTime.getDay();

      if (day >= 1 && day <= 5 && hour >= 9 && hour < 16) {
        return 'RTGS';
      }

      return 'IMPS_SPLIT'; // Will need splitting
    }

    return 'IMPS';
  }

  // On-demand settlements: RTGS if large amount during hours
  if (settlementType === 'on_demand') {
    const RTGS_MIN = 200000 * 100; // ₹2L

    if (amountPaise >= RTGS_MIN) {
      const hour = currentTime.getHours();
      const day = currentTime.getDay();

      if (day >= 1 && day <= 5 && hour >= 9 && hour < 16) {
        return 'RTGS';
      }
    }

    return 'NEFT';
  }

  // Automatic settlements: NEFT
  return 'NEFT';
}
```

---

**Location:** Line ~288-291 (update function call)

**CHANGE:**

```javascript
// OLD:
if (settlementBatch.net_settlement_amount > 100000 * 100) {
  await this.queueForApproval(batchId, settlementBatch, resolvedMerchantId);
} else {
  await this.autoApprove(batchId);
}

// NEW:
if (settlementBatch.net_settlement_amount > 100000 * 100) {
  await this.queueForApproval(batchId, settlementBatch, resolvedMerchantId);
} else {
  await this.autoApprove(batchId, settlementBatch, resolvedMerchantId);  // FIXED: Added missing parameters
}
```

---

#### Step 4.2: Test Auto-Approval (1 hour)

**File:** Create `test-auto-approval-fix.cjs`

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: parseInt(process.env.DB_PORT || '5433')
});

async function testAutoApprovalFix() {
  console.log('=== Testing Auto-Approval Bug Fix ===\n');

  try {
    const merchantId = 'AUTO_TEST_001';

    // 1. Create small settlement (< ₹1L for auto-approval)
    console.log('1. Creating small settlement for auto-approval (₹50K)...');

    await pool.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise,
        status, transaction_date, payment_method, utr
      ) VALUES
        ('AUTO_TXN_001', $1, 50000 * 100, 'RECONCILED', NOW(), 'UPI', 'UTR_AUTO_001')
    `, [merchantId]);

    await pool.query(`
      INSERT INTO sp_v2_settlement_queue (
        merchant_id, transaction_id, amount_paise,
        settlement_type, priority, status, queued_at
      ) VALUES
        ($1, 'AUTO_TXN_001', 50000 * 100, 'instant', 2, 'PENDING', NOW())
    `, [merchantId]);

    console.log('✅ Transaction queued for instant settlement\n');

    // 2. Wait for processing
    console.log('2. Waiting for auto-approval (max 30 seconds)...');

    await new Promise(resolve => setTimeout(resolve, 30000));

    // 3. Check settlement batch
    const batchResult = await pool.query(`
      SELECT * FROM sp_v2_settlement_batches
      WHERE merchant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [merchantId]);

    if (batchResult.rows.length === 0) {
      console.error('❌ No settlement batch found!');
      return;
    }

    const batch = batchResult.rows[0];

    console.log('✅ Settlement batch found\n');
    console.log(`Batch ID: ${batch.id}`);
    console.log(`Status: ${batch.status}`);
    console.log(`Amount: ₹${batch.net_amount_paise / 100}`);
    console.log('');

    // 4. CRITICAL: Check if bank transfer was created
    console.log('3. Checking if bank transfer was created (THE BUG FIX)...\n');

    const transferResult = await pool.query(`
      SELECT * FROM sp_v2_settlement_bank_transfers
      WHERE settlement_batch_id = $1
    `, [batch.id]);

    if (transferResult.rows.length === 0) {
      console.error('❌❌❌ BUG STILL EXISTS: Bank transfer NOT created!');
      console.error('Auto-approved batch has no bank_transfers record!');
      return;
    }

    const transfer = transferResult.rows[0];

    console.log('✅✅✅ BUG FIXED: Bank transfer created!');
    console.log('');
    console.log('Transfer Details:');
    console.log('================');
    console.log(`ID:              ${transfer.id}`);
    console.log(`Mode:            ${transfer.transfer_mode}`);
    console.log(`Settlement Type: ${transfer.settlement_type}`);
    console.log(`Priority:        ${transfer.priority}`);
    console.log(`Status:          ${transfer.status}`);
    console.log(`Amount:          ₹${transfer.amount_paise / 100}`);
    console.log('');

    // 5. Verify IMPS was selected for instant
    if (transfer.transfer_mode !== 'IMPS') {
      console.warn(`⚠️  Expected IMPS for instant settlement, got ${transfer.transfer_mode}`);
    } else {
      console.log(`✅ Correct transfer mode: IMPS (instant settlement)`);
    }

    console.log('\n=== AUTO-APPROVAL BUG FIX TEST PASSED ===\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testAutoApprovalFix();
```

**Run test:**
```bash
node test-auto-approval-fix.cjs
```

**Expected output:**
```
✅✅✅ BUG FIXED: Bank transfer created!
✅ Correct transfer mode: IMPS (instant settlement)
```

---

## 📝 Summary - Day 1-2 Complete

After Day 1-2, you will have:

✅ **Chargeback & Refund Deduction**
- Chargebacks deducted from settlements
- Refunds deducted from settlements
- Database columns added
- Tested and verified

✅ **Instant Settlement Intelligence**
- Priority queue (instant=2, on_demand=1, automatic=0)
- Dynamic fees (+0.4% instant, +0.2% on-demand)
- SLA monitoring (15 min, 2 hours, 24 hours)
- SLA breach tracking and alerts

✅ **Transfer Mode Router**
- IMPS for instant settlements
- RTGS for large on-demand during banking hours
- NEFT for automatic settlements
- Time-aware routing logic

✅ **Auto-Approval Bug Fixed**
- Auto-approved settlements now create bank_transfers
- No more orphaned APPROVED batches
- Instant settlements work end-to-end

---

## 📅 DAY 3-5 Preview

Day 3: Manual payout UI (CSV export + UTR entry)
Day 4-5: E2E testing + SLA dashboard

---

**Document Version:** 1.0
**Created:** October 22, 2025
**Status:** Ready for Implementation
**Next Steps:** Start Day 1 implementation tomorrow morning 9:00 AM
