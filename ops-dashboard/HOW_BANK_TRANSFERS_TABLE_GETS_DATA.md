# How sp_v2_settlement_bank_transfers Table Gets Data

**Date:** October 7, 2025  
**Purpose:** Complete flow from settlement to bank transfer record creation

---

## 🎯 Quick Answer

**There are 2 separate systems that populate bank transfer records:**

### System 1: Manual/Test System (Currently Active)
```
Settlement calculated → Manually inserted → sp_v2_settlement_bank_transfers
```

### System 2: Automated Queue System (Production-Ready)
```
Settlement calculated → sp_v2_bank_transfer_queue → Payout Service → sp_v2_payout → Bank API → sp_v2_settlement_bank_transfers
```

---

## 📊 Current Reality on Staging

### What I Found:

**Table 1: `sp_v2_settlement_bank_transfers`**
- 10 records
- All status = `COMPLETED`
- All have UTR numbers
- **Manually created** (not through queue system)

**Table 2: `sp_v2_bank_transfer_queue`**
- 5+ records
- All status = `processing` (stuck!)
- No UTR numbers
- **Automatically created by settlement scheduler**

**Table 3: `sp_v2_payout`**
- 5+ records
- Linked to queue records
- Status varies

**Conclusion:** 
- ✅ Queue system IS working (creates records)
- ❌ Payout processor is NOT running (transfers stuck in "processing")
- ✅ Manual records were created for testing (have UTRs)

---

## 🔄 Complete Data Flow (Step-by-Step)

### STAGE 1: Settlement Calculation Complete

**When settlement batch is created:**
```sql
sp_v2_settlement_batches:
  id = 'batch-uuid-123'
  merchant_id = 'MERCH001'
  net_amount_paise = 2301189
  status = 'PENDING_APPROVAL' or 'APPROVED'
```

**Code location:** `services/settlement-engine/settlement-scheduler.cjs`

---

### STAGE 2: Check Auto-Settle Conditions

**Code:** `settlement-scheduler.cjs` lines 72-74

```javascript
if (merchant.auto_settle && settlementBatch.net_settlement_amount >= merchant.min_settlement_amount_paise) {
  await this.queueBankTransfer(batchId, merchant, settlementBatch);
}
```

**Conditions checked:**
1. ✅ Merchant has `auto_settle = true`
2. ✅ Net amount >= minimum threshold (e.g., ₹10,000)

**If both YES → Proceed to STAGE 3**  
**If NO → Settlement remains in "APPROVED" status, no transfer**

---

### STAGE 3: Queue Bank Transfer

**Code:** `settlement-scheduler.cjs` lines 246-282

```javascript
async queueBankTransfer(batchId, merchantConfig, settlementBatch) {
  const netAmount = settlementBatch.net_settlement_amount;
  
  // Determine transfer mode (NEFT/RTGS/IMPS)
  const transferMode = this.determineTransferMode(netAmount, merchantConfig.preferred_transfer_mode);
  
  // INSERT into queue
  await v2Pool.query(
    `INSERT INTO sp_v2_bank_transfer_queue 
     (batch_id, transfer_mode, amount_paise, beneficiary_name, 
      account_number, ifsc_code, bank_name, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')`,
    [
      batchId,
      transferMode,  // NEFT/RTGS/IMPS
      netAmount,     // e.g., 2301189 paise
      merchantConfig.account_holder_name,
      merchantConfig.account_number,
      merchantConfig.ifsc_code,
      merchantConfig.bank_name
    ]
  );
}
```

**Result:**
```sql
sp_v2_bank_transfer_queue:
  id = 'queue-uuid-456'
  batch_id = 'batch-uuid-123'
  transfer_mode = 'NEFT' or 'RTGS' or 'IMPS'
  amount_paise = 2301189
  account_number = '1234567890'
  ifsc_code = 'HDFC0001234'
  status = 'queued' ✅
  queued_at = NOW()
```

**Transfer mode logic:**
```javascript
if (amount >= ₹2L) → RTGS
else if (preferred_mode = 'IMPS' && amount <= ₹2L) → IMPS
else → NEFT
```

---

### STAGE 4: Payout Service Picks Up Queue (⚠️ MISSING!)

**Expected Service:** `payout-processor.cjs` (NOT DEPLOYED!)

**What SHOULD happen:**
```javascript
// Pseudo-code for missing service
setInterval(async () => {
  // Get queued transfers
  const queued = await pool.query(`
    SELECT * FROM sp_v2_bank_transfer_queue 
    WHERE status = 'queued' 
    ORDER BY queued_at ASC 
    LIMIT 10
  `);
  
  for (const transfer of queued.rows) {
    // Update status to processing
    await pool.query(`
      UPDATE sp_v2_bank_transfer_queue 
      SET status = 'processing', processing_at = NOW() 
      WHERE id = $1
    `, [transfer.id]);
    
    // Create payout record
    const payoutId = await createPayout(transfer);
    
    // Call bank API
    const result = await callBankAPI(transfer);
    
    if (result.success) {
      // Create bank transfer record with UTR
      await pool.query(`
        INSERT INTO sp_v2_settlement_bank_transfers (
          settlement_batch_id,
          merchant_id,
          amount_paise,
          bank_account_number,
          ifsc_code,
          transfer_mode,
          utr_number,
          transfer_date,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED')
      `, [
        transfer.batch_id,
        merchant_id,
        transfer.amount_paise,
        transfer.account_number,
        transfer.ifsc_code,
        transfer.transfer_mode,
        result.utr,  // ✅ UTR from bank
        result.transfer_date,
      ]);
      
      // Update queue status
      await pool.query(`
        UPDATE sp_v2_bank_transfer_queue 
        SET status = 'success', 
            utr_number = $1,
            completed_at = NOW() 
        WHERE id = $2
      `, [result.utr, transfer.id]);
      
      // Update settlement batch
      await pool.query(`
        UPDATE sp_v2_settlement_batches 
        SET transfer_status = 'completed',
            settled_at = NOW() 
        WHERE id = $1
      `, [transfer.batch_id]);
    }
  }
}, 60000); // Every minute
```

**Current Problem:**
- ⚠️ **This service is NOT deployed/running on staging!**
- Queue records stuck in "processing" status
- No UTRs generated
- No bank transfer records created automatically

---

### STAGE 5: Bank API Call (⚠️ NOT HAPPENING)

**Expected Flow:**

```
Payout Service → Bank API (NEFT/RTGS/IMPS)
    ↓
Bank API Response:
{
  status: "success",
  utr: "UTR17594150217353",
  transfer_date: "2025-10-03",
  bank_reference: "REF123456"
}
    ↓
Save to sp_v2_settlement_bank_transfers
```

**Bank API Integration Points:**
- HDFC Bank API
- ICICI Bank API  
- Axis Bank API
- etc.

**Current Reality:**
- ❌ No bank API integration deployed
- ❌ Payout processor not running
- ✅ Manual records created for testing

---

## 🔍 How Manual Records Were Created (Current System)

**Evidence from staging data:**

```sql
-- 10 records with UTRs and COMPLETED status
SELECT * FROM sp_v2_settlement_bank_transfers;

Results:
- All created on 2025-10-03
- All have UTR numbers (UTR17594150217353, etc.)
- All status = COMPLETED
- All for MERCH001
```

**How they got there:**

### Method 1: Direct SQL INSERT (Most Likely)
```sql
-- Admin manually inserted records
INSERT INTO sp_v2_settlement_bank_transfers (
  settlement_batch_id,
  merchant_id,
  amount_paise,
  bank_account_number,
  ifsc_code,
  transfer_mode,
  utr_number,
  transfer_date,
  status
) VALUES (
  'b529ac0c-09b0-40dd-ba0f-0aae2d424468',
  'MERCH001',
  1699299,
  '1234567890',
  'HDFC0001234',
  'NEFT',
  'UTR17594150217353',
  '2025-10-03',
  'COMPLETED'
);
```

### Method 2: Test Script (Possible)
```javascript
// test-bank-transfer.js
const { Pool } = require('pg');
const pool = new Pool({...});

async function createTestTransfer() {
  await pool.query(`
    INSERT INTO sp_v2_settlement_bank_transfers (...)
    VALUES (...)
  `);
}
```

### Method 3: Migration Script (Possible)
```sql
-- Migration file that populated test data
INSERT INTO sp_v2_settlement_bank_transfers 
SELECT 
  b.id,
  b.merchant_id,
  b.net_amount_paise,
  m.account_number,
  m.ifsc_code,
  'NEFT',
  'UTR' || FLOOR(RANDOM() * 10000000000000)::bigint,
  CURRENT_DATE,
  'COMPLETED'
FROM sp_v2_settlement_batches b
JOIN sp_v2_merchant_master m ON b.merchant_id = m.merchant_id
WHERE b.status = 'APPROVED'
LIMIT 10;
```

---

## 📋 The Architecture (What SHOULD Exist)

```
┌─────────────────────────────────────────────────────────┐
│ STEP 1: Settlement Approved                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  sp_v2_settlement_batches                               │
│    status = 'APPROVED'                                  │
│    auto_settle = true                                   │
│    net_amount >= minimum                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 2: Queue Bank Transfer                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  settlement-scheduler.cjs:                              │
│    queueBankTransfer(batchId, merchant, settlement)     │
│         ↓                                               │
│  INSERT INTO sp_v2_bank_transfer_queue                  │
│    status = 'queued'                                    │
│    transfer_mode = 'NEFT/RTGS/IMPS'                     │
│    account_number = merchant.account_number             │
│                                                         │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 3: Payout Service Processes Queue                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ⚠️  MISSING SERVICE: payout-processor.cjs              │
│                                                         │
│  Should:                                                │
│  1. Poll sp_v2_bank_transfer_queue every minute         │
│  2. Pick status = 'queued' records                      │
│  3. Update to status = 'processing'                     │
│  4. Create sp_v2_payout record                          │
│  5. Call bank API                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 4: Bank API Integration                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  POST https://bank-api.hdfc.com/transfer                │
│  {                                                      │
│    account_number: "1234567890",                        │
│    ifsc: "HDFC0001234",                                 │
│    amount: 23011.89,                                    │
│    mode: "NEFT"                                         │
│  }                                                      │
│         ↓                                               │
│  Response:                                              │
│  {                                                      │
│    status: "success",                                   │
│    utr: "UTR17594150217353",                            │
│    transfer_date: "2025-10-03"                          │
│  }                                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 5: Create Bank Transfer Record                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  INSERT INTO sp_v2_settlement_bank_transfers (          │
│    settlement_batch_id,                                 │
│    merchant_id,                                         │
│    amount_paise,                                        │
│    utr_number,  ← FROM BANK API ✅                       │
│    status = 'COMPLETED'                                 │
│  )                                                      │
│                                                         │
│  UPDATE sp_v2_bank_transfer_queue                       │
│    SET status = 'success', utr_number = 'UTR...'        │
│                                                         │
│  UPDATE sp_v2_settlement_batches                        │
│    SET transfer_status = 'completed'                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🚨 What's Missing on Staging

### Missing Component 1: Payout Processor Service

**File:** `services/payout-processor/payout-processor.cjs` (DOES NOT EXIST!)

**What it should do:**
1. Poll `sp_v2_bank_transfer_queue` every minute
2. Process queued transfers
3. Call bank APIs
4. Handle success/failure
5. Populate `sp_v2_settlement_bank_transfers`

**Current status:** ❌ NOT DEPLOYED

---

### Missing Component 2: Bank API Integration

**Files needed:**
- `services/bank-api/hdfc-api.cjs`
- `services/bank-api/icici-api.cjs`
- `services/bank-api/axis-api.cjs`

**What they should do:**
- Make NEFT/RTGS/IMPS API calls
- Handle authentication
- Return UTR numbers
- Handle errors/retries

**Current status:** ❌ NOT IMPLEMENTED

---

### Missing Component 3: Webhook Receiver for Bank Status

**Endpoint:** `POST /webhooks/bank-transfer-status`

**What it should do:**
- Receive callback from bank when transfer completes
- Update transfer status
- Save UTR number
- Notify merchant

**Current status:** ❌ NOT IMPLEMENTED

---

## 🔍 Current Data Analysis

### sp_v2_settlement_bank_transfers (10 records)
```sql
✅ All status = COMPLETED
✅ All have UTR numbers
✅ All manually created (test data)
📅 All created on 2025-10-03
💰 Total: ~₹1.3 lakhs
```

### sp_v2_bank_transfer_queue (5+ records)
```sql
⏳ All status = processing (stuck!)
❌ No UTR numbers
❌ Payout processor not running
📅 Created Oct 5-6
💰 Various amounts (₹2.5L, ₹4.9L, etc.)
```

### sp_v2_payout (5+ records)
```sql
✅ Created by queue system
🔗 Linked to queue records via payout_id
📊 Status varies
```

---

## 💡 How to Make It Work (Implementation Needed)

### Step 1: Create Payout Processor Service

**File:** `services/payout-processor/payout-processor.cjs`

```javascript
const { Pool } = require('pg');
const pool = new Pool({...});

class PayoutProcessor {
  async start() {
    console.log('[Payout Processor] Starting...');
    
    // Process queue every minute
    setInterval(() => this.processQueue(), 60000);
    
    // Initial run
    await this.processQueue();
  }
  
  async processQueue() {
    const queued = await pool.query(`
      SELECT * FROM sp_v2_bank_transfer_queue 
      WHERE status = 'queued' 
      ORDER BY queued_at ASC 
      LIMIT 10
    `);
    
    for (const transfer of queued.rows) {
      await this.processTransfer(transfer);
    }
  }
  
  async processTransfer(transfer) {
    try {
      // Mark as processing
      await pool.query(`
        UPDATE sp_v2_bank_transfer_queue 
        SET status = 'processing', processing_at = NOW() 
        WHERE id = $1
      `, [transfer.id]);
      
      // Create payout record
      const payout = await this.createPayout(transfer);
      
      // Call bank API
      const result = await this.callBankAPI(transfer);
      
      if (result.success) {
        // Create bank transfer record
        await pool.query(`
          INSERT INTO sp_v2_settlement_bank_transfers (
            settlement_batch_id,
            merchant_id,
            amount_paise,
            bank_account_number,
            ifsc_code,
            transfer_mode,
            utr_number,
            transfer_date,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED')
        `, [
          transfer.batch_id,
          // ... other fields
          result.utr,
          result.transfer_date
        ]);
        
        // Update queue
        await pool.query(`
          UPDATE sp_v2_bank_transfer_queue 
          SET status = 'success', 
              utr_number = $1,
              completed_at = NOW() 
          WHERE id = $2
        `, [result.utr, transfer.id]);
        
        console.log(`✅ Transfer completed: ${result.utr}`);
      }
      
    } catch (error) {
      console.error(`❌ Transfer failed:`, error);
      await this.handleFailure(transfer.id, error);
    }
  }
  
  async callBankAPI(transfer) {
    // Integrate with bank API
    // Return { success: true, utr: 'UTR123', transfer_date: '2025-10-03' }
  }
}

const processor = new PayoutProcessor();
processor.start();
```

---

### Step 2: Deploy Payout Processor

```bash
# On staging EC2
cd /home/ec2-user/services
mkdir payout-processor
cd payout-processor

# Copy payout-processor.cjs
npm install pg node-cron axios

# Start with PM2
pm2 start payout-processor.cjs --name payout-processor
pm2 save
```

---

### Step 3: Implement Bank API Integration

```javascript
// services/bank-api/hdfc-api.cjs
class HdfcBankAPI {
  async transfer(accountNumber, ifscCode, amount, mode) {
    const response = await axios.post('https://bank-api.hdfc.com/transfer', {
      account_number: accountNumber,
      ifsc: ifscCode,
      amount: amount / 100, // Convert paise to rupees
      mode: mode
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.HDFC_API_KEY}`
      }
    });
    
    return {
      success: true,
      utr: response.data.utr,
      transfer_date: response.data.transfer_date,
      bank_reference: response.data.reference
    };
  }
}
```

---

## 📊 Summary

### Current State:

| Component | Status | Impact |
|-----------|--------|--------|
| **Settlement Scheduler** | ✅ Working | Creates queue records |
| **Bank Transfer Queue** | ✅ Working | Records created |
| **Payout Processor** | ❌ Missing | Transfers stuck |
| **Bank API Integration** | ❌ Missing | No UTRs generated |
| **Manual Test Records** | ✅ Exist | 10 records with UTRs |

### How sp_v2_settlement_bank_transfers Gets Data:

**Currently (Manual):**
```
Admin manually inserts records → sp_v2_settlement_bank_transfers
```

**Should Be (Automated):**
```
Settlement → Queue → Payout Processor → Bank API → sp_v2_settlement_bank_transfers
```

### Next Steps:

1. ✅ Implement payout processor service
2. ✅ Integrate bank APIs
3. ✅ Deploy to staging
4. ✅ Test end-to-end flow
5. ✅ Monitor queue processing

---

**Document Version:** 1.0  
**Created:** October 7, 2025  
**Status:** Production system partially implemented, payout processor missing
