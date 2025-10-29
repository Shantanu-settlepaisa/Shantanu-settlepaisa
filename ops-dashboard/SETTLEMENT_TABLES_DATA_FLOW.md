# How Data Flows Into Settlement Tables

**Date**: October 7, 2025  
**Question**: How does data come into sp_v2_settlement_batches, sp_v2_bank_transfer_queue, and sp_v2_utr_credits?

---

## Overview

```
Transaction Flow:
CSV Upload → sp_v2_transactions → Reconciliation → Settlement Batch → Bank Transfer Queue → UTR Credits
```

---

## 1. sp_v2_settlement_batches (Settlement Batch Creation)

### **Data Source**: Settlement Calculator

**Trigger**: Reconciliation job completes with matched transactions

### **Flow:**

```
Step 1: Recon Job Completes
  ↓
Step 2: runReconciliation.js (line 309-361)
  ↓
  if (job.counters.matched > 0) {
    const calculator = new SettlementCalculatorV1Logic();
    
    // Group by merchant
    merchantGroups.forEach(merchant => {
      transactions = matched transactions for this merchant
    });
  }
  ↓
Step 3: calculator.calculateSettlement(merchantId, transactions, cycleDate)
  ↓
  Calculates:
  - Gross amount
  - Commission (based on MDR)
  - GST (18% on commission)
  - TDS (if applicable)
  - Reserve fund (rolling reserve %)
  - Net amount = Gross - Commission - GST - TDS - Reserve
  ↓
Step 4: calculator.persistSettlement(settlementBatch)
  ↓
  INSERT INTO sp_v2_settlement_batches ✅
```

### **Code Location:**

**File**: `services/settlement-engine/settlement-calculator-v3.cjs` (line 223)

```javascript
const batchResult = await this.v2Pool.query(`
  INSERT INTO sp_v2_settlement_batches (
    merchant_id, merchant_name, cycle_date, total_transactions,
    gross_amount_paise, total_commission_paise, total_gst_paise,
    total_reserve_paise, net_amount_paise, status
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_APPROVAL')
  RETURNING id
`, [
  settlementBatch.merchantId,
  settlementBatch.merchantName,
  settlementBatch.cycleDate,
  settlementBatch.transactionCount,
  settlementBatch.grossAmount,
  settlementBatch.totalCommission,
  settlementBatch.totalGST,
  settlementBatch.totalReserve,
  settlementBatch.netAmount
]);
```

### **When It Happens:**

**Automatic (via Recon Job)**:
```javascript
// services/recon-api/jobs/runReconciliation.js (line 309-361)
if (job.counters.matched > 0 && matchResult.matched.length > 0) {
  const calculator = new SettlementCalculatorV1Logic();
  
  // Group matched transactions by merchant
  const merchantGroups = {};
  matchResult.matched.forEach(match => {
    const merchantId = match.pg.merchant_id;
    merchantGroups[merchantId].push({...});
  });
  
  // Create settlement batch for each merchant
  for (const [merchantId, transactions] of Object.entries(merchantGroups)) {
    const settlementBatch = await calculator.calculateSettlement(
      merchantId, transactions, params.toDate
    );
    
    const batchId = await calculator.persistSettlement(settlementBatch);
    // ↑ This inserts into sp_v2_settlement_batches
  }
}
```

**Scheduled (via Cron Job)**:
```javascript
// services/settlement-engine/settlement-scheduler.cjs
class SettlementScheduler {
  constructor() {
    this.calculator = new SettlementCalculatorV3();
  }
  
  async runSettlement(triggerType = 'cron') {
    // Get merchants eligible for settlement
    const merchants = await this.getMerchantsForSettlement();
    
    for (const merchant of merchants) {
      // Get reconciled transactions
      const transactions = await this.getReconciledTransactions(
        merchant.merchant_id
      );
      
      // Calculate and persist settlement
      const settlementBatch = await this.calculator.calculateSettlement(
        merchant.merchant_id, transactions, cycleDate
      );
      
      const batchId = await this.calculator.persistSettlement(settlementBatch);
      // ↑ This inserts into sp_v2_settlement_batches
    }
  }
}

// Start cron job (runs daily at 6 PM IST)
cron.schedule('0 18 * * *', async () => {
  await scheduler.runSettlement('cron', 'system');
});
```

### **Sample Data:**

```sql
INSERT INTO sp_v2_settlement_batches VALUES (
  '550e8400-e29b-41d4-a716-446655440000',  -- id
  'MERCH_001',                             -- merchant_id
  'Merchant Company Pvt Ltd',              -- merchant_name
  '2025-10-07',                            -- cycle_date
  15,                                      -- total_transactions
  1500000,                                 -- gross_amount_paise (₹15,000)
  30000,                                   -- total_commission_paise (2%)
  5400,                                    -- total_gst_paise (18% of commission)
  75000,                                   -- total_reserve_paise (5%)
  1389600,                                 -- net_amount_paise (₹13,896)
  'PENDING_APPROVAL',                      -- status
  NOW(),                                   -- created_at
  NOW()                                    -- updated_at
);
```

### **Status Lifecycle:**

```
PENDING_APPROVAL → APPROVED → PROCESSING → COMPLETED
                       ↓
                    FAILED (if error)
```

---

## 2. sp_v2_bank_transfer_queue (Bank Transfer Initiation)

### **Data Source**: Settlement Scheduler

**Trigger**: Settlement batch is approved AND merchant has auto-settle enabled

### **Flow:**

```
Step 1: Settlement Batch Created (status = PENDING_APPROVAL)
  ↓
Step 2: Ops/Admin Approves Batch
  ↓
  UPDATE sp_v2_settlement_batches 
  SET status = 'APPROVED'
  WHERE id = batch_uuid;
  ↓
Step 3: Settlement Scheduler Checks for Auto-Settle
  ↓
  if (merchant.auto_settle && netAmount >= merchant.min_settlement_amount) {
    await queueBankTransfer(batchId, merchant, settlementBatch);
  }
  ↓
Step 4: Determine Transfer Mode
  ↓
  if (amount >= ₹2 lakhs) → RTGS
  else if (preferred = IMPS && amount <= ₹2 lakhs) → IMPS
  else → NEFT
  ↓
Step 5: Insert into Queue
  ↓
  INSERT INTO sp_v2_bank_transfer_queue ✅
```

### **Code Location:**

**File**: `services/settlement-engine/settlement-scheduler.cjs` (line 260)

```javascript
async queueBankTransfer(batchId, merchantConfig, settlementBatch) {
  const netAmount = settlementBatch.net_settlement_amount;
  
  // Determine transfer mode (NEFT/RTGS/IMPS)
  const transferMode = this.determineTransferMode(
    netAmount,
    merchantConfig.preferred_transfer_mode
  );
  
  await v2Pool.query(
    `INSERT INTO sp_v2_bank_transfer_queue 
     (batch_id, transfer_mode, amount_paise, beneficiary_name, 
      account_number, ifsc_code, bank_name, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')`,
    [
      batchId,
      transferMode,                                    // NEFT/RTGS/IMPS
      netAmount,
      merchantConfig.account_holder_name,
      merchantConfig.account_number,
      merchantConfig.ifsc_code,
      merchantConfig.bank_name,
    ]
  );
}
```

### **When It Happens:**

**Option 1: Auto-Settle (Immediate after approval)**:
```javascript
// After settlement batch is approved
if (merchant.auto_settle && 
    netAmount >= merchant.min_settlement_amount_paise) {
  await this.queueBankTransfer(batchId, merchant, settlementBatch);
  // ↑ This inserts into sp_v2_bank_transfer_queue
}
```

**Option 2: Manual Trigger (Ops initiates)**:
```javascript
// API endpoint: POST /api/settlements/:batchId/initiate-transfer
async initiateTransfer(batchId) {
  const batch = await getBatch(batchId);
  const merchant = await getMerchantConfig(batch.merchant_id);
  
  if (batch.status !== 'APPROVED') {
    throw new Error('Batch must be approved first');
  }
  
  await queueBankTransfer(batchId, merchant, batch);
}
```

### **Transfer Mode Logic:**

```javascript
determineTransferMode(amountPaise, preferredMode) {
  const amountRupees = amountPaise / 100;
  
  if (amountRupees >= 200000) {
    return 'RTGS';  // Mandatory for ≥₹2L
  } else if (preferredMode === 'IMPS' && amountRupees <= 200000) {
    return 'IMPS';  // Fast transfer for <₹2L
  } else {
    return 'NEFT';  // Default
  }
}
```

### **Sample Data:**

```sql
INSERT INTO sp_v2_bank_transfer_queue VALUES (
  '660e8400-e29b-41d4-a716-446655440001',  -- id
  '550e8400-e29b-41d4-a716-446655440000',  -- batch_id (FK)
  'NEFT',                                  -- transfer_mode
  1389600,                                 -- amount_paise (₹13,896)
  'Merchant Company Pvt Ltd',              -- beneficiary_name
  '1234567890',                            -- account_number
  'ICIC0001234',                           -- ifsc_code
  'ICICI Bank',                            -- bank_name
  'queued',                                -- status
  NULL,                                    -- utr_number (not yet transferred)
  NOW(),                                   -- queued_at
  NULL,                                    -- processing_at
  NULL,                                    -- sent_at
  NULL,                                    -- completed_at
  0,                                       -- retry_count
  3                                        -- max_retries
);
```

### **Status Lifecycle:**

```
queued → processing → sent → success
           ↓            ↓       ↓
         failed ← failed ← failed
                     ↓
                 reversed (if needed)
```

### **Bank API Processing:**

```javascript
// Separate worker process polls the queue
async function processBankTransferQueue() {
  const queuedTransfers = await getQueuedTransfers();
  
  for (const transfer of queuedTransfers) {
    try {
      // Update status to processing
      await updateTransferStatus(transfer.id, 'processing');
      
      // Call bank API (ICICI/HDFC/etc)
      const response = await bankAPI.initiateTransfer({
        amount: transfer.amount_paise / 100,
        beneficiary_account: transfer.account_number,
        ifsc: transfer.ifsc_code,
        mode: transfer.transfer_mode
      });
      
      if (response.status === 'SUCCESS') {
        // Update with UTR from bank
        await updateTransferStatus(transfer.id, 'sent', {
          utr_number: response.utr,
          bank_reference: response.reference,
          sent_at: new Date()
        });
      }
      
    } catch (error) {
      await handleTransferError(transfer, error);
    }
  }
}

// Run every 5 minutes
setInterval(processBankTransferQueue, 5 * 60 * 1000);
```

---

## 3. sp_v2_utr_credits (Bank Statement Reconciliation)

### **Data Source**: Bank Statement Import

**Trigger**: Daily bank statement file received (SFTP/Email/Manual upload)

### **Flow:**

```
Step 1: Bank Sends Statement File
  ↓
  Methods:
  - SFTP: File lands in /incoming/
  - Email: Attachment extracted
  - Manual: Ops uploads via UI
  ↓
Step 2: Parse Bank Statement
  ↓
  Supported formats:
  - CSV (ICICI, HDFC, Axis)
  - Excel (SBI, BOI)
  - MT940 (Swift format)
  ↓
Step 3: Extract Credit Entries
  ↓
  Filter rows where:
  - debit_credit = 'CREDIT'
  - amount > 0
  - utr IS NOT NULL
  ↓
Step 4: Insert into sp_v2_utr_credits
  ↓
  INSERT INTO sp_v2_utr_credits ✅
```

### **Code Location:**

**Currently**: Only seed data in migrations!

```sql
-- db/migrations/003_create_v1_recon_schema.sql (line 244)
INSERT INTO sp_v2_utr_credits (
  acquirer, utr, amount_paise, credited_at, cycle_date, bank_reference
) VALUES
('ICICI Bank', 'UTR240929001001', 10000, '2024-09-29 14:30:00+00', '2024-09-29', 'ICICI_REF_001'),
('ICICI Bank', 'UTR240929001002', 25000, '2024-09-29 14:45:00+00', '2024-09-29', 'ICICI_REF_002');
```

### **Missing Implementation** ⚠️:

**Need to create**: Bank statement import service

```javascript
// services/bank-statement-processor/index.js (TO BE CREATED)

class BankStatementProcessor {
  async processBankStatement(filePath, bankName) {
    // Parse statement file
    const entries = await this.parseStatement(filePath, bankName);
    
    // Filter credit entries
    const credits = entries.filter(e => 
      e.debit_credit === 'CREDIT' && e.utr
    );
    
    // Insert into utr_credits
    for (const credit of credits) {
      await pool.query(`
        INSERT INTO sp_v2_utr_credits (
          acquirer, utr, amount_paise, credited_at,
          cycle_date, bank_reference, reconciled
        ) VALUES ($1, $2, $3, $4, $5, $6, false)
        ON CONFLICT (acquirer, utr) DO UPDATE SET
          amount_paise = EXCLUDED.amount_paise,
          credited_at = EXCLUDED.credited_at
      `, [
        bankName,
        credit.utr,
        credit.amount_paise,
        credit.timestamp,
        credit.value_date,
        credit.bank_ref
      ]);
    }
  }
  
  async parseStatement(filePath, bankName) {
    const parser = this.getParserForBank(bankName);
    return await parser.parse(filePath);
  }
}
```

### **Reconciliation Flow:**

```javascript
// Match bank credits with our transfers
async function reconcileBankCredits() {
  const unreconciled = await pool.query(`
    SELECT * FROM sp_v2_utr_credits 
    WHERE reconciled = false
  `);
  
  for (const credit of unreconciled.rows) {
    // Find matching transfer in queue
    const transfer = await pool.query(`
      SELECT * FROM sp_v2_bank_transfer_queue
      WHERE utr_number = $1 AND status = 'sent'
    `, [credit.utr]);
    
    if (transfer.rows.length > 0) {
      // Mark as reconciled
      await pool.query(`
        UPDATE sp_v2_utr_credits 
        SET reconciled = true 
        WHERE id = $1
      `, [credit.id]);
      
      // Update transfer status to success
      await pool.query(`
        UPDATE sp_v2_bank_transfer_queue 
        SET status = 'success', 
            bank_confirmed = true,
            completed_at = NOW()
        WHERE id = $1
      `, [transfer.rows[0].id]);
      
      // Update settlement batch
      await pool.query(`
        UPDATE sp_v2_settlement_batches 
        SET status = 'COMPLETED',
            settlement_completed_at = NOW(),
            bank_reference_number = $1
        WHERE id = $2
      `, [credit.utr, transfer.rows[0].batch_id]);
    }
  }
}
```

### **Sample Data:**

```sql
INSERT INTO sp_v2_utr_credits VALUES (
  '770e8400-e29b-41d4-a716-446655440002',  -- id
  'ICICI Bank',                            -- acquirer
  'UTR241007123456',                       -- utr (matches bank transfer)
  1389600,                                 -- amount_paise
  '2025-10-07 15:30:00+00',               -- credited_at
  '2025-10-07',                           -- cycle_date
  'ICICI_REF_789',                        -- bank_reference
  'BANK_FILE_ID_123',                     -- bank_file_id
  true,                                    -- reconciled
  NOW()                                    -- created_at
);
```

---

## Complete End-to-End Flow

### **Day 1: Transaction & Reconciliation**
```
09:00 AM - Merchant uploads CSV
  ↓ INSERT INTO sp_v2_transactions (706 rows)
  
10:00 AM - Ops runs reconciliation
  ↓ Matches PG with Bank statements
  ↓ UPDATE sp_v2_transactions SET status = 'RECONCILED'
  ↓ Triggers settlement calculation
  ↓ INSERT INTO sp_v2_settlement_batches (status = PENDING_APPROVAL)
  ↓ UPDATE sp_v2_transactions SET settlement_batch_id = batch_uuid
```

### **Day 1: Approval & Transfer**
```
06:00 PM - Settlement scheduler runs (cron)
  ↓ OR: Ops manually approves batch
  ↓ UPDATE sp_v2_settlement_batches SET status = 'APPROVED'
  
06:05 PM - Auto-settle check passes
  ↓ INSERT INTO sp_v2_bank_transfer_queue (status = queued)
  
06:10 PM - Bank transfer worker runs
  ↓ UPDATE sp_v2_bank_transfer_queue SET status = 'processing'
  ↓ Calls bank API
  ↓ Gets UTR: UTR241007123456
  ↓ UPDATE sp_v2_bank_transfer_queue 
      SET status = 'sent', utr_number = 'UTR241007123456'
```

### **Day 2: Bank Confirmation**
```
08:00 AM - Bank statement file received
  ↓ Parse bank statement
  ↓ Extract credit entries
  ↓ INSERT INTO sp_v2_utr_credits (utr = 'UTR241007123456')
  
09:00 AM - Reconciliation cron runs
  ↓ Matches sp_v2_utr_credits.utr with sp_v2_bank_transfer_queue.utr_number
  ↓ UPDATE sp_v2_utr_credits SET reconciled = true
  ↓ UPDATE sp_v2_bank_transfer_queue SET status = 'success', bank_confirmed = true
  ↓ UPDATE sp_v2_settlement_batches SET status = 'COMPLETED'
  ↓ UPDATE sp_v2_transactions SET settled_at = NOW()
  
✅ MERCHANT CREDITED (100% confirmed)
```

---

## Summary Table

| Table | Populated By | Trigger | Frequency |
|-------|-------------|---------|-----------|
| **sp_v2_settlement_batches** | Settlement Calculator | Recon job completes | After each recon OR Daily 6 PM cron |
| **sp_v2_bank_transfer_queue** | Settlement Scheduler | Batch approved + auto-settle | Within minutes of approval |
| **sp_v2_utr_credits** | Bank Statement Processor | Bank statement arrives | Daily (morning) |

---

## Missing Components ⚠️

1. **Bank Statement Import Service** - Currently only seed data exists
2. **Bank Transfer Worker** - Polls queue and calls bank APIs
3. **UTR Reconciliation Job** - Matches bank credits with transfers
4. **Approval Workflow** - UI for ops to approve batches

---

## Next Steps

To make the system fully operational:

1. ✅ Implement bank statement parser
2. ✅ Create bank transfer worker (ICICI/HDFC APIs)
3. ✅ Build approval workflow in merchant dashboard
4. ✅ Add UTR reconciliation cron job
5. ✅ Create monitoring dashboard for transfer status
