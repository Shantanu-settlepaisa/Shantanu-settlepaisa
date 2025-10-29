# SettlePaisa V2 Ops Dashboard - Complete Production Readiness Plan

**Date:** October 22, 2025
**Current Status:** 75% Production Ready
**Target:** 100% Production Ready with Full Industry-Standard Features
**Timeline:** 3-5 weeks for complete implementation

---

## 📊 Executive Summary

Based on comprehensive analysis of V1 vs V2 systems and industry standards (Razorpay, Cashfree, PayU), the Ops Dashboard is **75% production ready**.

### What's Complete (75%):
- ✅ Dashboard UI with real-time KPIs
- ✅ JWT Authentication & RBAC
- ✅ Manual file upload & reconciliation
- ✅ Settlement calculation (commission, GST, rolling reserve)
- ✅ Settlement batch creation
- ✅ Approval workflow
- ✅ NEFT/RTGS/IMPS mode selection
- ✅ Bank transfer record creation

### Critical Gaps (25%):
- ❌ Chargeback/refund deduction from settlements
- ❌ Instant settlement intelligence (priority, SLA, fees)
- ❌ Auto-approval bank transfer creation bug
- ❌ Payout processor service (bank file generation, SFTP)
- ⚠️ Subscription & subvention models (optional)

---

## 🎯 Phase-Wise Implementation Plan

### **PHASE 1: Critical Production Blockers (Week 1) - 5-6 Days**
**Goal:** Fix critical gaps and enable production launch with instant settlements

**Deliverables:**
1. Chargeback & refund deduction in settlement calculation
2. Instant settlement priority queue with SLA monitoring
3. Dynamic fee calculation (instant +0.4%, on-demand +0.2%)
4. Intelligent transfer mode router (IMPS/RTGS/NEFT)
5. Auto-approval bug fix (must create bank_transfers)
6. Manual payout UI (CSV export + UTR entry)

**Production Ready:** 85-90% after Week 1

---

### **PHASE 2: Payout Automation (Week 2-3) - 10-12 Days**
**Goal:** Automate bank file generation and SFTP integration

**Deliverables:**
1. NEFT/RTGS/IMPS file generators (RBI-compliant formats)
2. SFTP client for bank file upload/download
3. Bank response file parser (UTR extraction)
4. Payout processor service (queue poller with retry logic)
5. Status tracking (PENDING → PROCESSING → SUCCESS/FAILED)

**Production Ready:** 95% after Week 3

---

### **PHASE 3: Advanced Settlement Models (Week 4-5) - Optional**
**Goal:** Support subscription & subvention models (if required)

**Deliverables:**
1. Subscription model (100% reserve hold + monthly fee deduction)
2. Subvention model (bank/partner commission split)
3. Enhanced reporting

**Production Ready:** 100% after Week 5

---

## 📋 PHASE 1: Critical Fixes - Detailed Breakdown

### **Day 1 Morning: Chargeback & Refund Deduction (4 hours)**

**Priority:** P0 - BLOCKER
**Complexity:** Medium
**Impact:** High (prevents incorrect payouts)

#### Implementation:

**File:** `services/settlement-engine/settlement-calculator-v1-logic.cjs`

**Changes Required:**

```javascript
// Add after line 41 (in calculateSettlement function)

// Query chargebacks for this merchant
const chargebacksQuery = await v2Pool.query(`
  SELECT COALESCE(SUM(amount_paise), 0) as total_chargebacks
  FROM sp_v2_chargebacks
  WHERE merchant_id = $1
    AND status = 'APPROVED'
    AND settlement_batch_id IS NULL
    AND created_at <= $2
`, [merchantId, cycleDate]);

const totalChargebacks = parseInt(chargebacksQuery.rows[0].total_chargebacks) || 0;

// Query refunds for this merchant
const refundsQuery = await v2Pool.query(`
  SELECT COALESCE(SUM(amount_paise), 0) as total_refunds
  FROM sp_v2_refunds
  WHERE merchant_id = $1
    AND status = 'COMPLETED'
    AND settlement_batch_id IS NULL
    AND created_at <= $2
`, [merchantId, cycleDate]);

const totalRefunds = parseInt(refundsQuery.rows[0].total_refunds) || 0;

// Add to running totals (after line 42)
let totalChargebackDeductions = totalChargebacks;
let totalRefundDeductions = totalRefunds;
```

**Update net settlement calculation (line ~130):**

```javascript
// OLD:
const netSettlementAmount = totalGrossAmount - totalPGCharge - totalRollingReserve;

// NEW:
const netSettlementAmount = totalGrossAmount
                           - totalPGCharge
                           - totalRollingReserve
                           - totalChargebackDeductions
                           - totalRefundDeductions;

// Return updated settlement batch
return {
  merchant_id: merchantId,
  cycle_date: cycleDate,
  total_transactions: reconciledTransactions.length,
  gross_amount_paise: totalGrossAmount,
  total_commission_paise: totalConvCharges + totalEpCharges,
  total_gst_paise: totalGST,
  total_reserve_paise: totalRollingReserve,
  chargeback_deductions_paise: totalChargebackDeductions,  // NEW
  refund_deductions_paise: totalRefundDeductions,           // NEW
  net_settlement_amount: netSettlementAmount,
  items: itemizedSettlements
};
```

**Database Schema Update:**

```sql
-- Add columns to sp_v2_settlement_batches
ALTER TABLE sp_v2_settlement_batches
ADD COLUMN IF NOT EXISTS chargeback_deductions_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_deductions_paise BIGINT DEFAULT 0;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_chargebacks_settlement_lookup
ON sp_v2_chargebacks(merchant_id, status, settlement_batch_id)
WHERE settlement_batch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_settlement_lookup
ON sp_v2_refunds(merchant_id, status, settlement_batch_id)
WHERE settlement_batch_id IS NULL;
```

**Testing:**

```bash
# Create test file
node test-settlement-with-deductions.cjs
```

**Test Scenario:**
- Merchant has ₹10L in reconciled transactions
- Commission: ₹20K (2%)
- Chargebacks: ₹5K (5 transactions of ₹1K each)
- Refunds: ₹3K (3 transactions)
- Expected net settlement: ₹10L - ₹20K - ₹5K - ₹3K = ₹9.72L

---

### **Day 1 Afternoon: Instant Settlement Intelligence (5 hours)**

**Priority:** P0 - BUSINESS REQUIREMENT
**Complexity:** High
**Impact:** Critical (core business feature)

#### 1. Add Settlement Type to Queue (30 min)

**File:** `services/settlement-engine/settlement-queue-processor.cjs`

**Line 67-80 - Update queue query:**

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
    priority DESC,           -- Instant (2) before on_demand (1) before automatic (0)
    MIN(queued_at) ASC      -- Oldest first within same priority
`, [this.batchSize]);
```

#### 2. Update Fee Calculation (1 hour)

**File:** `services/settlement-engine/settlement-calculator-v1-logic.cjs`

**Add parameter to function signature (line 25):**

```javascript
// OLD:
async calculateSettlement(merchantId, reconciledTransactions, cycleDate) {

// NEW:
async calculateSettlement(merchantId, reconciledTransactions, cycleDate, settlementType = 'automatic') {
```

**Update fee calculation (line ~56-74):**

```javascript
// Get base commission rate from MDR
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

// NEW: Add instant/on-demand premium
let premiumPercentage = 0;
if (settlementType === 'instant') {
  premiumPercentage = 0.4;  // +0.4% for instant
} else if (settlementType === 'on_demand') {
  premiumPercentage = 0.2;  // +0.2% for on-demand
}

const premiumCharge = Math.floor((txn.paid_amount * premiumPercentage) / 100);

const gst = this.calculateGST(
  convCharges + epCharges + premiumCharge,
  mdrRates.gst,
  mdrRates.gsttype
);

const pgCharge = convCharges + epCharges + premiumCharge + gst;
```

**Update return object (line ~125):**

```javascript
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
  chargeback_deductions_paise: totalChargebackDeductions,
  refund_deductions_paise: totalRefundDeductions,
  net_settlement_amount: netSettlementAmount,
  items: itemizedSettlements
};
```

#### 3. Add SLA Monitoring (1 hour)

**File:** `services/settlement-engine/settlement-queue-processor.cjs`

**After batch processing (line ~285):**

```javascript
// Check SLA compliance
const slaMinutes = {
  'instant': 15,
  'on_demand': 120,
  'automatic': 1440  // 24 hours
}[settlementType];

const queuedMinutes = Math.floor((Date.now() - new Date(batch.oldest_queued).getTime()) / 60000);

if (queuedMinutes > slaMinutes) {
  console.warn(`⚠️  SLA BREACH: ${settlementType} settlement for ${merchantId} took ${queuedMinutes} min (SLA: ${slaMinutes} min)`);

  // Log to SLA breach table
  await v2Pool.query(`
    INSERT INTO sp_v2_settlement_sla_breaches (
      settlement_batch_id,
      merchant_id,
      settlement_type,
      sla_minutes,
      actual_minutes,
      breach_amount_minutes,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `, [batchId, merchantId, settlementType, slaMinutes, queuedMinutes, queuedMinutes - slaMinutes]);

  // Send alert (email/SMS/Slack)
  await this.sendSLABreachAlert({
    merchant_id: merchantId,
    settlement_type: settlementType,
    sla_minutes: slaMinutes,
    actual_minutes: queuedMinutes
  });
} else {
  console.log(`✅ SLA MET: ${settlementType} settlement for ${merchantId} completed in ${queuedMinutes} min (SLA: ${slaMinutes} min)`);
}
```

**Create SLA breach table:**

```sql
CREATE TABLE IF NOT EXISTS sp_v2_settlement_sla_breaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  merchant_id VARCHAR(50),
  settlement_type VARCHAR(20),
  sla_minutes INTEGER,
  actual_minutes INTEGER,
  breach_amount_minutes INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sla_breach_lookup ON sp_v2_settlement_sla_breaches(merchant_id, created_at DESC);
```

#### 4. Update Database Schema (30 min)

```sql
-- Add settlement_type and priority to settlement_batches
ALTER TABLE sp_v2_settlement_batches
ADD COLUMN IF NOT EXISTS settlement_type VARCHAR(20) DEFAULT 'automatic',
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS instant_premium_paise BIGINT DEFAULT 0;

-- Add check constraint
ALTER TABLE sp_v2_settlement_batches
ADD CONSTRAINT chk_settlement_type
CHECK (settlement_type IN ('automatic', 'on_demand', 'instant'));

ALTER TABLE sp_v2_settlement_batches
ADD CONSTRAINT chk_priority
CHECK (priority IN (0, 1, 2));

-- Add settlement_type to queue table
ALTER TABLE sp_v2_settlement_queue
ADD COLUMN IF NOT EXISTS settlement_type VARCHAR(20) DEFAULT 'automatic',
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Add index for priority-based querying
CREATE INDEX IF NOT EXISTS idx_settlement_queue_priority
ON sp_v2_settlement_queue(priority DESC, queued_at ASC)
WHERE status = 'PENDING';
```

---

### **Day 2 Morning: Transfer Mode Router (4 hours)**

**Priority:** P0 - REQUIRED FOR INSTANT
**Complexity:** Medium
**Impact:** High (ensures instant settlements use IMPS)

#### Implementation:

**File:** `services/overview-api/settlements.cjs`

**Add helper functions (before endpoint definitions):**

```javascript
/**
 * Intelligently select transfer mode based on settlement type, amount, and time
 */
function selectTransferMode(settlementType, amountPaise, currentTime = new Date()) {
  // Instant settlements MUST use IMPS (24x7 availability)
  if (settlementType === 'instant') {
    if (amountPaise > 200000 * 100) {  // ₹2L is IMPS limit
      console.warn(`⚠️  Instant settlement amount ₹${amountPaise/100} exceeds IMPS limit (₹2L). Using RTGS if available.`);
      if (isRTGSHours(currentTime)) {
        return 'RTGS';
      } else {
        // Split into multiple IMPS transactions
        return 'IMPS_SPLIT';
      }
    }
    return 'IMPS';
  }

  // On-demand settlements: RTGS for large amounts during banking hours
  if (settlementType === 'on_demand') {
    if (amountPaise >= 200000 * 100 && isRTGSHours(currentTime)) {
      return 'RTGS';  // Faster for ₹2L+
    }
    return 'NEFT';
  }

  // Automatic settlements: Use merchant's preferred mode or NEFT
  return 'NEFT';
}

/**
 * Check if current time is within RTGS operating hours
 * Monday-Friday: 9:00 AM - 4:30 PM IST
 */
function isRTGSHours(time = new Date()) {
  const hour = time.getHours();
  const minute = time.getMinutes();
  const day = time.getDay();

  // Weekend check (Saturday=6, Sunday=0)
  if (day === 0 || day === 6) {
    return false;
  }

  // Banking hours: 9:00 AM - 4:30 PM
  if (hour < 9 || hour > 16) {
    return false;
  }

  if (hour === 16 && minute > 30) {
    return false;
  }

  return true;
}

/**
 * Check if current time is within NEFT operating hours
 * Monday-Saturday: 8:00 AM - 7:00 PM IST
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
```

**Update approval endpoint (line 230-249):**

```javascript
// Get merchant bank details and settlement info
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

// Intelligently select transfer mode
const transferMode = selectTransferMode(
  config.settlement_type || 'automatic',
  config.net_amount_paise,
  new Date()
);

console.log(`[Settlements API] Selected transfer mode: ${transferMode} for ${config.settlement_type} settlement`);

// Create bank transfer record
await client.query(`
  INSERT INTO sp_v2_settlement_bank_transfers (
    settlement_batch_id,
    merchant_id,
    bank_account_number,
    ifsc_code,
    amount_paise,
    transfer_mode,
    priority,
    status,
    initiated_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', NOW())
`, [
  batchId,
  config.merchant_id,
  config.bank_account_number,
  config.bank_ifsc_code,
  batch.net_amount_paise,
  transferMode,
  config.priority || 0
]);
```

---

### **Day 2 Afternoon: Auto-Approval Bug Fix (3 hours)**

**Priority:** P0 - CRITICAL BUG
**Complexity:** Medium
**Impact:** Critical (instant settlements stuck without this)

#### Current Bug:

**File:** `services/settlement-engine/settlement-queue-processor.cjs` (Line 420-435)

**Current Code:**
```javascript
async autoApprove(batchId) {
  await v2Pool.query(`
    UPDATE sp_v2_settlement_batches
    SET status = 'APPROVED',
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
  `, [batchId]);

  console.log(`[Settlement Queue] ✅ Batch ${batchId} auto-approved`);

  // NOTE: Bank transfer queue population happens automatically via approval workflow
  // The Ops Dashboard approval endpoint (POST /api/settlements/:batchId/approve)
  // creates the bank_transfers record when a settlement is approved
  // For auto-approved settlements, implement similar logic here if needed
}
```

**Problem:** Auto-approved batches have status 'APPROVED' but NO bank_transfers record is created!

#### Fix:

**Replace entire autoApprove function:**

```javascript
async autoApprove(batchId, settlementBatch, merchantId) {
  const client = await v2Pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`[Settlement Queue] Auto-approving batch ${batchId}...`);

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
        ifsc_code,
        account_holder_name,
        bank_name,
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

    // 4. Create bank transfer record (THIS WAS MISSING!)
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
        priority,
        status,
        initiated_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', NOW(), 'SYSTEM_AUTO_APPROVAL')
    `, [
      batchId,
      merchantId,
      config.account_number,
      config.account_holder_name,
      config.ifsc_code,
      config.bank_name,
      settlementBatch.net_settlement_amount,
      transferMode,
      priority
    ]);

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
        settlement_type: settlementType,
        priority: priority
      })
    ]);

    await client.query('COMMIT');

    console.log(`[Settlement Queue] ✅ Batch ${batchId} auto-approved with bank transfer created (${transferMode})`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Settlement Queue] Auto-approval failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Helper method for transfer mode selection (same logic as settlements.cjs)
 */
selectTransferMode(settlementType, amountPaise, currentTime = new Date()) {
  if (settlementType === 'instant') {
    if (amountPaise > 200000 * 100) {  // ₹2L IMPS limit
      const hour = currentTime.getHours();
      const day = currentTime.getDay();
      if (day >= 1 && day <= 5 && hour >= 9 && hour < 16) {
        return 'RTGS';
      }
      return 'IMPS_SPLIT';
    }
    return 'IMPS';
  }

  if (settlementType === 'on_demand') {
    if (amountPaise >= 200000 * 100) {
      const hour = currentTime.getHours();
      const day = currentTime.getDay();
      if (day >= 1 && day <= 5 && hour >= 9 && hour < 16) {
        return 'RTGS';
      }
    }
    return 'NEFT';
  }

  return 'NEFT';
}
```

**Update function call (line ~288-291):**

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
  await this.autoApprove(batchId, settlementBatch, resolvedMerchantId);
}
```

---

### **Day 3: Manual Payout UI (5 hours)**

**Priority:** P1 - FALLBACK MECHANISM
**Complexity:** Medium
**Impact:** Medium (enables manual intervention when needed)

#### 1. CSV Export Endpoint (1 hour)

**File:** `services/overview-api/settlements.cjs`

**Add endpoint:**

```javascript
/**
 * Export pending payouts as CSV for manual processing
 */
app.get('/api/settlements/pending-payouts/export', async (req, res) => {
  try {
    console.log('[Settlements API] Exporting pending payouts CSV');

    const result = await v2Pool.query(`
      SELECT
        bt.id,
        bt.settlement_batch_id,
        bt.merchant_id,
        m.name as merchant_name,
        bt.bank_account_number,
        bt.bank_account_name,
        bt.ifsc_code,
        bt.bank_name,
        ROUND(bt.amount_paise / 100.0, 2) as amount_rupees,
        bt.transfer_mode,
        CASE bt.priority
          WHEN 2 THEN 'INSTANT'
          WHEN 1 THEN 'ON_DEMAND'
          ELSE 'AUTOMATIC'
        END as settlement_type,
        bt.initiated_at,
        EXTRACT(EPOCH FROM (NOW() - bt.initiated_at)) / 60 as minutes_pending
      FROM sp_v2_settlement_bank_transfers bt
      LEFT JOIN sp_v2_merchant_settlement_config m ON bt.merchant_id = m.merchant_id
      WHERE bt.status = 'PENDING'
      ORDER BY bt.priority DESC, bt.initiated_at ASC
    `);

    // Convert to CSV
    const headers = [
      'Transfer ID',
      'Batch ID',
      'Merchant ID',
      'Merchant Name',
      'Account Number',
      'Account Name',
      'IFSC Code',
      'Bank Name',
      'Amount (₹)',
      'Transfer Mode',
      'Settlement Type',
      'Initiated At',
      'Minutes Pending'
    ];

    const rows = result.rows.map(row => [
      row.id,
      row.settlement_batch_id,
      row.merchant_id,
      row.merchant_name || 'N/A',
      row.bank_account_number,
      row.bank_account_name,
      row.ifsc_code,
      row.bank_name || 'N/A',
      row.amount_rupees,
      row.transfer_mode,
      row.settlement_type,
      row.initiated_at,
      Math.floor(row.minutes_pending)
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=pending-payouts.csv');
    res.send(csv);

    console.log(`[Settlements API] Exported ${result.rows.length} pending payouts`);

  } catch (error) {
    console.error('[Settlements API] Error exporting payouts:', error);
    res.status(500).json({ error: error.message });
  }
});
```

#### 2. Manual UTR Entry API (1 hour)

**Add endpoint:**

```javascript
/**
 * Mark bank transfer as completed with manual UTR entry
 */
app.post('/api/settlements/bank-transfers/:id/complete', async (req, res) => {
  const { id } = req.params;
  const { utr_number, completed_by, notes } = req.body;

  try {
    console.log(`[Settlements API] Marking bank transfer ${id} as completed with UTR ${utr_number}`);

    const client = await v2Pool.connect();

    try {
      await client.query('BEGIN');

      // Validate UTR format (example: ICICI12345678901234)
      if (!utr_number || utr_number.length < 10) {
        throw new Error('Invalid UTR number format');
      }

      // Check if transfer exists and is PENDING
      const checkResult = await client.query(`
        SELECT * FROM sp_v2_settlement_bank_transfers
        WHERE id = $1
      `, [id]);

      if (checkResult.rows.length === 0) {
        throw new Error('Bank transfer not found');
      }

      const transfer = checkResult.rows[0];

      if (transfer.status !== 'PENDING') {
        throw new Error(`Bank transfer is already ${transfer.status}`);
      }

      // Update status to SUCCESS with UTR
      await client.query(`
        UPDATE sp_v2_settlement_bank_transfers
        SET status = 'SUCCESS',
            utr_number = $1,
            completed_at = NOW(),
            updated_by = $2,
            notes = $3,
            updated_at = NOW()
        WHERE id = $4
      `, [utr_number, completed_by, notes, id]);

      // Update settlement batch status to COMPLETED
      await client.query(`
        UPDATE sp_v2_settlement_batches
        SET status = 'COMPLETED',
            settled_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [transfer.settlement_batch_id]);

      // Add timeline event
      await client.query(`
        INSERT INTO sp_v2_settlement_timeline_events (
          settlement_batch_id,
          event_type,
          event_data,
          created_by,
          created_at
        ) VALUES ($1, 'PAYOUT_MANUAL_COMPLETED', $2, $3, NOW())
      `, [
        transfer.settlement_batch_id,
        JSON.stringify({
          bank_transfer_id: id,
          utr_number: utr_number,
          notes: notes
        }),
        completed_by
      ]);

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Bank transfer marked as completed',
        utr_number: utr_number
      });

      console.log(`[Settlements API] ✅ Bank transfer ${id} completed with UTR ${utr_number}`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('[Settlements API] Error completing bank transfer:', error);
    res.status(500).json({ error: error.message });
  }
});
```

#### 3. Frontend UI Component (3 hours)

**File:** `src/pages/ops/PendingPayouts.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Download, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

interface PendingPayout {
  id: string;
  merchant_id: string;
  merchant_name: string;
  amount_rupees: number;
  transfer_mode: string;
  settlement_type: string;
  initiated_at: string;
  minutes_pending: number;
  bank_account_number: string;
  ifsc_code: string;
}

export function PendingPayouts() {
  const [payouts, setPayouts] = useState<PendingPayout[]>([]);
  const [selectedPayout, setSelectedPayout] = useState<PendingPayout | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingPayouts();
    const interval = setInterval(fetchPendingPayouts, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchPendingPayouts = async () => {
    try {
      const response = await fetch('/api/settlements/pending-payouts');
      const data = await response.json();
      setPayouts(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch pending payouts',
        variant: 'destructive'
      });
    }
  };

  const handleExportCSV = () => {
    window.location.href = '/api/settlements/pending-payouts/export';
  };

  const handleCompletePayout = async () => {
    if (!selectedPayout || !utrNumber) {
      toast({
        title: 'Validation Error',
        description: 'Please enter UTR number',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetch(`/api/settlements/bank-transfers/${selectedPayout.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utr_number: utrNumber,
          completed_by: 'admin@sabpaisa.in', // Get from auth context
          notes: notes
        })
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: `Payout completed with UTR ${utrNumber}`,
        });
        setSelectedPayout(null);
        setUtrNumber('');
        setNotes('');
        fetchPendingPayouts();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to complete payout',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Pending Payouts</h1>
        <Button onClick={handleExportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4">
        {payouts.map(payout => (
          <div key={payout.id} className="border rounded-lg p-4 hover:bg-gray-50">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{payout.merchant_name}</div>
                <div className="text-sm text-gray-600">
                  {payout.merchant_id} • {payout.bank_account_number}
                </div>
                <div className="text-sm text-gray-600">
                  IFSC: {payout.ifsc_code} • {payout.transfer_mode}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold">₹{payout.amount_rupees.toLocaleString()}</div>
                <div className={`text-sm ${
                  payout.settlement_type === 'INSTANT' ? 'text-red-600 font-semibold' :
                  payout.settlement_type === 'ON_DEMAND' ? 'text-orange-600' :
                  'text-gray-600'
                }`}>
                  {payout.settlement_type}
                </div>
                <div className="text-xs text-gray-500">
                  Pending {Math.floor(payout.minutes_pending)} min
                </div>
              </div>
            </div>

            <div className="mt-4">
              <Button
                size="sm"
                onClick={() => setSelectedPayout(payout)}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark as Completed
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* UTR Entry Modal */}
      {selectedPayout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Complete Payout</h2>

            <div className="space-y-4">
              <div>
                <Label>Merchant</Label>
                <div className="text-sm">{selectedPayout.merchant_name}</div>
              </div>

              <div>
                <Label>Amount</Label>
                <div className="text-lg font-bold">₹{selectedPayout.amount_rupees.toLocaleString()}</div>
              </div>

              <div>
                <Label htmlFor="utr">UTR Number *</Label>
                <Input
                  id="utr"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  placeholder="Enter bank UTR number"
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this payout"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCompletePayout}>Complete Payout</Button>
                <Button variant="outline" onClick={() => setSelectedPayout(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Add route in `src/router.tsx`:**

```typescript
{
  path: '/ops/pending-payouts',
  element: <PendingPayouts />
}
```

---

### **Day 4-5: Testing & SLA Dashboard (2 days)**

**Priority:** P0 - VALIDATION
**Complexity:** Medium
**Impact:** Critical (must verify before production)

#### Day 4: End-to-End Testing

**Create test file:** `test-instant-settlement-e2e.cjs`

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433
});

async function runE2ETest() {
  console.log('=== Instant Settlement E2E Test ===\n');

  try {
    // Test 1: Instant Settlement (₹50K, IMPS, 15 min SLA)
    console.log('Test 1: Creating instant settlement...');

    const startTime = Date.now();

    // Insert test transactions
    await pool.query(`
      INSERT INTO sp_v2_settlement_queue (
        merchant_id, transaction_id, amount_paise,
        settlement_type, priority, status, queued_at
      ) VALUES
        ('MERCH001', 'TXN_INSTANT_001', 50000 * 100, 'instant', 2, 'PENDING', NOW()),
        ('MERCH001', 'TXN_INSTANT_002', 25000 * 100, 'instant', 2, 'PENDING', NOW())
    `);

    // Wait for queue processor
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check settlement batch
    const batchResult = await pool.query(`
      SELECT * FROM sp_v2_settlement_batches
      WHERE merchant_id = 'MERCH001'
        AND settlement_type = 'instant'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (batchResult.rows.length === 0) {
      throw new Error('Settlement batch not created!');
    }

    const batch = batchResult.rows[0];
    console.log(`✅ Batch created: ${batch.id}`);
    console.log(`   Amount: ₹${batch.net_amount_paise / 100}`);
    console.log(`   Status: ${batch.status}`);
    console.log(`   Priority: ${batch.priority}`);

    // Check bank transfer
    const transferResult = await pool.query(`
      SELECT * FROM sp_v2_settlement_bank_transfers
      WHERE settlement_batch_id = $1
    `, [batch.id]);

    if (transferResult.rows.length === 0) {
      throw new Error('Bank transfer not created!');
    }

    const transfer = transferResult.rows[0];
    console.log(`✅ Bank transfer created: ${transfer.id}`);
    console.log(`   Mode: ${transfer.transfer_mode}`);
    console.log(`   Priority: ${transfer.priority}`);

    // Verify IMPS was selected for instant
    if (transfer.transfer_mode !== 'IMPS') {
      throw new Error(`Expected IMPS, got ${transfer.transfer_mode}`);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Test 1 passed in ${duration}ms\n`);

    // Test 2: On-Demand Settlement (₹3L, RTGS during hours or NEFT)
    console.log('Test 2: Creating on-demand settlement...');

    await pool.query(`
      INSERT INTO sp_v2_settlement_queue (
        merchant_id, transaction_id, amount_paise,
        settlement_type, priority, status, queued_at
      ) VALUES
        ('MERCH002', 'TXN_ONDEMAND_001', 300000 * 100, 'on_demand', 1, 'PENDING', NOW())
    `);

    await new Promise(resolve => setTimeout(resolve, 5000));

    const batch2 = await pool.query(`
      SELECT * FROM sp_v2_settlement_batches
      WHERE merchant_id = 'MERCH002'
        AND settlement_type = 'on_demand'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    console.log(`✅ On-demand batch created: ${batch2.rows[0].id}`);

    const transfer2 = await pool.query(`
      SELECT * FROM sp_v2_settlement_bank_transfers
      WHERE settlement_batch_id = $1
    `, [batch2.rows[0].id]);

    console.log(`✅ Transfer mode: ${transfer2.rows[0].transfer_mode}`);
    console.log(`✅ Test 2 passed\n`);

    // Test 3: Chargeback Deduction
    console.log('Test 3: Testing chargeback deduction...');

    await pool.query(`
      INSERT INTO sp_v2_chargebacks (
        merchant_id, transaction_id, amount_paise,
        status, created_at
      ) VALUES
        ('MERCH003', 'TXN_CB_001', 5000 * 100, 'APPROVED', NOW())
    `);

    await pool.query(`
      INSERT INTO sp_v2_settlement_queue (
        merchant_id, transaction_id, amount_paise,
        settlement_type, priority, status, queued_at
      ) VALUES
        ('MERCH003', 'TXN_TEST_001', 100000 * 100, 'automatic', 0, 'PENDING', NOW())
    `);

    await new Promise(resolve => setTimeout(resolve, 5000));

    const batch3 = await pool.query(`
      SELECT * FROM sp_v2_settlement_batches
      WHERE merchant_id = 'MERCH003'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const chargebackDeduction = batch3.rows[0].chargeback_deductions_paise;
    console.log(`✅ Chargeback deducted: ₹${chargebackDeduction / 100}`);

    if (chargebackDeduction !== 5000 * 100) {
      throw new Error(`Expected ₹5000 chargeback, got ₹${chargebackDeduction / 100}`);
    }

    console.log(`✅ Test 3 passed\n`);

    console.log('=== ALL TESTS PASSED ===');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

runE2ETest();
```

**Run test:**
```bash
node test-instant-settlement-e2e.cjs
```

#### Day 5: SLA Monitoring Dashboard

**Create SLA compliance tile:**

**File:** `src/components/overview/SLAComplianceTile.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface SLAMetrics {
  settlement_type: string;
  total_batches: number;
  within_sla: number;
  sla_breach: number;
}

export function SLAComplianceTile() {
  const [metrics, setMetrics] = useState<SLAMetrics[]>([]);

  useEffect(() => {
    fetchSLAMetrics();
    const interval = setInterval(fetchSLAMetrics, 60000); // Every minute
    return () => clearInterval(interval);
  }, []);

  const fetchSLAMetrics = async () => {
    try {
      const response = await fetch('/api/settlements/sla-status');
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch SLA metrics', error);
    }
  };

  const calculateCompliance = (metric: SLAMetrics) => {
    if (metric.total_batches === 0) return 100;
    return Math.round((metric.within_sla / metric.total_batches) * 100);
  };

  return (
    <div className="border rounded-lg p-6 bg-white">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Clock className="mr-2 h-5 w-5" />
        Settlement SLA Compliance (24h)
      </h3>

      <div className="space-y-4">
        {metrics.map(metric => {
          const compliance = calculateCompliance(metric);
          const isGood = compliance >= 95;

          return (
            <div key={metric.settlement_type} className="border-l-4 pl-4" style={{
              borderColor: isGood ? '#10b981' : '#ef4444'
            }}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold uppercase text-sm">
                    {metric.settlement_type}
                  </div>
                  <div className="text-xs text-gray-600">
                    {metric.total_batches} total batches
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${
                    isGood ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {compliance}%
                  </div>
                  <div className="text-xs text-gray-600">
                    {metric.within_sla} on time
                  </div>
                </div>
              </div>

              {metric.sla_breach > 0 && (
                <div className="mt-2 flex items-center text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  {metric.sla_breach} SLA breaches
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t text-xs text-gray-600">
        <div>Instant SLA: 15 minutes</div>
        <div>On-Demand SLA: 2 hours</div>
        <div>Automatic SLA: 24 hours</div>
      </div>
    </div>
  );
}
```

**Add SLA endpoint in `services/overview-api/index.js`:**

```javascript
app.get('/api/settlements/sla-status', async (req, res) => {
  try {
    const result = await v2Pool.query(`
      SELECT
        settlement_type,
        COUNT(*) as total_batches,
        COUNT(*) FILTER (
          WHERE status IN ('APPROVED', 'COMPLETED') AND
          (EXTRACT(EPOCH FROM (approved_at - created_at)) / 60) <=
          CASE settlement_type
            WHEN 'instant' THEN 15
            WHEN 'on_demand' THEN 120
            ELSE 1440
          END
        ) as within_sla,
        COUNT(*) FILTER (
          WHERE status IN ('APPROVED', 'COMPLETED') AND
          (EXTRACT(EPOCH FROM (approved_at - created_at)) / 60) >
          CASE settlement_type
            WHEN 'instant' THEN 15
            WHEN 'on_demand' THEN 120
            ELSE 1440
          END
        ) as sla_breach
      FROM sp_v2_settlement_batches
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY settlement_type
      ORDER BY
        CASE settlement_type
          WHEN 'instant' THEN 1
          WHEN 'on_demand' THEN 2
          ELSE 3
        END
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('[SLA API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## 📈 Success Metrics - Phase 1

### **Day 1 Complete:**
- ✅ Chargebacks deducted from settlements
- ✅ Refunds deducted from settlements
- ✅ Instant settlement premium fees calculated (+0.4%)
- ✅ On-demand settlement premium fees calculated (+0.2%)
- ✅ Priority queue processing (instant > on-demand > automatic)
- ✅ SLA monitoring infrastructure

### **Day 2 Complete:**
- ✅ IMPS selected for instant settlements
- ✅ RTGS selected for large on-demand during banking hours
- ✅ NEFT fallback for automatic settlements
- ✅ Auto-approval creates bank_transfers records
- ✅ No more orphaned approved batches

### **Day 3 Complete:**
- ✅ Manual payout CSV export
- ✅ Admin can enter UTR manually
- ✅ Fallback mechanism for failed automation

### **Day 4-5 Complete:**
- ✅ All E2E tests passing
- ✅ SLA dashboard showing compliance
- ✅ Ready for staging deployment

---

## 🚀 PHASE 2: Payout Automation - Summary

### **Week 2-3 Deliverables:**

1. **NEFT/RTGS/IMPS File Generators**
   - RBI-compliant file formats
   - Bank-specific format support (ICICI, HDFC, Axis)
   - Validation and error handling

2. **SFTP Integration**
   - File upload to bank servers
   - Response file download
   - UTR extraction and status updates

3. **Payout Processor Service**
   - Queue poller (every 5 minutes)
   - Priority-based processing
   - Retry logic for failures
   - PM2 deployment

**Effort:** 10-12 days
**Result:** Full automation, 95% production ready

---

## 📊 PHASE 3: Advanced Models - Summary

### **Week 4-5 Deliverables (Optional):**

1. **Subscription Model**
   - 100% reserve hold
   - Monthly fee deduction on release
   - Subscription ledger tracking

2. **Subvention Model**
   - Bank/partner commission split
   - Subvention reports
   - Government partnership support

**Effort:** 8-10 days
**Result:** Feature parity with V1, 100% production ready

---

## 🎯 Critical Path to Production

### **Minimum Viable Product (Week 1):**
✅ Chargeback/refund deduction
✅ Instant settlement intelligence
✅ Manual payout UI
**Production Ready:** 85-90%

### **Full Automation (Week 3):**
✅ Payout processor
✅ Bank file generation
✅ SFTP integration
**Production Ready:** 95%

### **Feature Complete (Week 5):**
✅ Subscription model
✅ Subvention model
**Production Ready:** 100%

---

## 📝 Implementation Checklist

### **Phase 1 (Week 1) - CRITICAL:**
- [ ] Day 1: Chargeback & refund deduction
- [ ] Day 1: Instant settlement fees & priority
- [ ] Day 2: Transfer mode router
- [ ] Day 2: Auto-approval bug fix
- [ ] Day 3: Manual payout UI
- [ ] Day 4: E2E testing
- [ ] Day 5: SLA dashboard
- [ ] Deploy to staging
- [ ] User acceptance testing
- [ ] Deploy to production

### **Phase 2 (Week 2-3) - HIGH PRIORITY:**
- [ ] Week 2: NEFT/RTGS/IMPS generators
- [ ] Week 2: SFTP client
- [ ] Week 3: Payout processor
- [ ] Week 3: Testing & deployment

### **Phase 3 (Week 4-5) - OPTIONAL:**
- [ ] Week 4: Subscription model
- [ ] Week 5: Subvention model

---

**Document Version:** 1.0
**Created:** October 22, 2025, 00:45 IST
**Status:** Ready for Implementation
**Next Steps:** Create detailed day-by-day breakdown for Phase 1

---

## 🔗 Related Documents

- `PHASE1_INSTANT_SETTLEMENT_IMPLEMENTATION.md` - Day-by-day Phase 1 guide
- `PAYOUT_AUTOMATION_TECHNICAL_DESIGN.md` - Phase 2 architecture
- `BANK_FILE_FORMAT_SPECIFICATIONS.md` - NEFT/RTGS/IMPS formats
- `TESTING_STRATEGY.md` - E2E test scenarios
