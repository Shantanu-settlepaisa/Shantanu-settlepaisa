# Complete Action Plan: Fix & Implement Settlement System

**Date**: October 7, 2025  
**Objective**: Make settlement system fully operational from manual upload to merchant credit confirmation

---

## Current State Summary

### ✅ What's Working
- sp_v2_transactions has all needed columns
- Manual CSV upload works (706 rows)
- Reconciliation matching works
- Settlement calculation logic exists
- settlement_batch_id tracking exists (migration 010)

### ❌ What's Broken
1. **sp_v2_settlement_items** has wrong schema (FK points to v1 table)
2. **Code-schema mismatch** (code expects columns that don't exist)
3. **Manual uploads can't be settled** (FK chain broken)
4. **Bank statement import missing** (no sp_v2_utr_credits population)
5. **Bank transfer worker missing** (no actual bank API calls)

---

## Priority-Based Action Plan

## 🔴 PRIORITY 1: Critical - Blocks All Settlements (3-4 hours)

### Task 1.1: Fix sp_v2_settlement_items Schema ⏱️ 30 min

**Problem**: Migration 003 creates table with `txn_id UUID` referencing v1 table. Migration 007 tries to create with `transaction_id VARCHAR` but fails silently.

**Solution**: Drop and recreate with correct schema

```sql
-- File: db/migrations/018_fix_settlement_items_schema.sql

-- Backup existing data (if any)
CREATE TABLE sp_v2_settlement_items_backup AS 
SELECT * FROM sp_v2_settlement_items;

-- Drop conflicting table
DROP TABLE IF EXISTS sp_v2_settlement_items CASCADE;

-- Recreate with correct schema
CREATE TABLE sp_v2_settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_batch_id UUID NOT NULL REFERENCES sp_v2_settlement_batches(id) ON DELETE CASCADE,
  txn_id BIGINT NOT NULL,                        -- FIXED: BIGINT instead of UUID
  amount_paise BIGINT NOT NULL,
  commission_paise BIGINT DEFAULT 0,
  commission_rate DECIMAL(5,3),
  commission_type VARCHAR(20),
  gst_paise BIGINT DEFAULT 0,
  reserve_paise BIGINT DEFAULT 0,
  net_paise BIGINT NOT NULL,
  payment_mode VARCHAR(50),
  fee_bearer_code VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (txn_id) REFERENCES sp_v2_transactions(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX idx_settlement_items_batch ON sp_v2_settlement_items(settlement_batch_id);
CREATE INDEX idx_settlement_items_txn ON sp_v2_settlement_items(txn_id);

-- Migrate data (if any exists)
-- Note: This requires mapping v1 UUIDs to v2 BIGINTs
INSERT INTO sp_v2_settlement_items (
  settlement_batch_id, txn_id, amount_paise, commission_paise,
  gst_paise, reserve_paise, net_paise, payment_mode, created_at
)
SELECT 
  sib.batch_id,
  t_v2.id,                    -- Get BIGINT from v2 table
  sib.gross_paise,
  sib.commission_paise,
  sib.gst_on_commission_paise,
  sib.reserve_paise,
  sib.net_paise,
  'UNKNOWN',
  sib.created_at
FROM sp_v2_settlement_items_backup sib
JOIN sp_v2_transactions_v1 t_v1 ON sib.txn_id = t_v1.id
JOIN sp_v2_transactions t_v2 ON t_v2.transaction_id = t_v1.pgw_ref
ON CONFLICT DO NOTHING;

-- Drop backup after verification
-- DROP TABLE sp_v2_settlement_items_backup;
```

**Run**:
```bash
psql -U postgres -h localhost -p 5433 -d settlepaisa_v2 -f db/migrations/018_fix_settlement_items_schema.sql
```

---

### Task 1.2: Update Settlement Calculator Code ⏱️ 45 min

**Files to Update**:

**A. settlement-calculator-v1-logic.cjs** (line 347)
```javascript
// BEFORE:
INSERT INTO sp_v2_settlement_items (
  settlement_batch_id, transaction_id, amount_paise, ...
)

// AFTER:
INSERT INTO sp_v2_settlement_items (
  settlement_batch_id, txn_id, amount_paise, ...
)
VALUES ($1, $2, $3, ...)
```

Change line 347-375:
```javascript
// OLD:
await v2Pool.query(
  `INSERT INTO sp_v2_settlement_items 
   (settlement_batch_id, transaction_id, amount_paise, ...)
   VALUES ($1, $2, $3, ...)`,
  [batchId, item.transaction_id, item.gross_amount, ...]
);

// NEW:
await v2Pool.query(
  `INSERT INTO sp_v2_settlement_items 
   (settlement_batch_id, txn_id, amount_paise, ...)
   VALUES ($1, $2, $3, ...)`,
  [batchId, item.txn_id, item.gross_amount, ...]  // Use txn_id (BIGINT)
);
```

**B. settlement-calculator-v2.cjs** (line 158-164)
Same change as above.

**C. settlement-calculator-v3.cjs** (line 247-258)
```javascript
// OLD:
INSERT INTO sp_v2_settlement_items (
  settlement_batch_id, transaction_id, amount_paise, ...
)

// NEW:
INSERT INTO sp_v2_settlement_items (
  settlement_batch_id, txn_id, amount_paise, ...
)
```

**IMPORTANT**: When building settlement items, need to fetch `id` from transactions:

```javascript
// In calculateSettlement function, change:
itemizedSettlements.push({
  transaction_id: txn.transaction_id || txn.pgw_ref,  // OLD: business key
  ...
});

// TO:
itemizedSettlements.push({
  txn_id: txn.id,  // NEW: use BIGINT id from sp_v2_transactions
  transaction_id: txn.transaction_id,  // Keep for reference
  ...
});
```

---

### Task 1.3: Update API Join Queries ⏱️ 30 min

**A. Overview API** (`services/overview-api/overview-v2.js`)

Lines 112, 121 - Keep as is (already correct):
```javascript
JOIN sp_v2_settlement_items si ON t.id = si.txn_id
```

**B. Merchant API** (`services/merchant-api/db.js`)

Line 591:
```javascript
// BEFORE:
INNER JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id

// AFTER:
INNER JOIN sp_v2_transactions t ON si.txn_id = t.id
```

**C. Settlement Analytics API** (`services/settlement-analytics-api/index.js`)

Lines 205, 213:
```javascript
// BEFORE:
JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id

// AFTER:
JOIN sp_v2_transactions t ON si.txn_id = t.id
```

**D. Recon API** (`services/recon-api/routes/reports.js`)

Line 113:
```javascript
// BEFORE:
LEFT JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id

// AFTER:
LEFT JOIN sp_v2_transactions t ON si.txn_id = t.id
```

---

### Task 1.4: Remove Conflicting Migration ⏱️ 5 min

```bash
# Rename migration 007 to prevent confusion
mv db/migrations/007_settlement_tables_v1_logic.sql \
   db/migrations/007_settlement_tables_v1_logic.sql.DEPRECATED

# Add note
cat > db/migrations/007_settlement_tables_v1_logic.sql.DEPRECATED.README << EOF
This migration is deprecated. It conflicted with migration 003.
Migration 018 fixes the schema conflict.
Do not apply this migration.
EOF
```

---

### Task 1.5: Test Settlement Flow ⏱️ 1 hour

**Test Script**:
```javascript
// test-settlement-flow.js

const { SettlementCalculatorV3 } = require('./services/settlement-engine/settlement-calculator-v3.cjs');
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function testSettlementFlow() {
  console.log('=== Testing Settlement Flow ===\n');
  
  // Step 1: Get reconciled transactions
  const txns = await pool.query(`
    SELECT id, transaction_id, merchant_id, amount_paise, 
           payment_method, transaction_date
    FROM sp_v2_transactions
    WHERE status = 'RECONCILED'
      AND settlement_batch_id IS NULL
    LIMIT 5
  `);
  
  console.log(`Found ${txns.rows.length} reconciled transactions`);
  
  if (txns.rows.length === 0) {
    console.log('ERROR: No reconciled transactions found!');
    return;
  }
  
  // Step 2: Calculate settlement
  const calculator = new SettlementCalculatorV3();
  const merchantId = txns.rows[0].merchant_id;
  const cycleDate = new Date().toISOString().split('T')[0];
  
  console.log(`\nCalculating settlement for merchant: ${merchantId}`);
  
  const settlementBatch = await calculator.calculateSettlement(
    merchantId,
    txns.rows,
    cycleDate
  );
  
  console.log(`Gross: ₹${(settlementBatch.grossAmount / 100).toFixed(2)}`);
  console.log(`Net: ₹${(settlementBatch.netAmount / 100).toFixed(2)}`);
  
  // Step 3: Persist settlement
  console.log('\nPersisting settlement batch...');
  const batchId = await calculator.persistSettlement(settlementBatch);
  
  console.log(`✅ Settlement batch created: ${batchId}`);
  
  // Step 4: Verify data
  const verification = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM sp_v2_settlement_batches WHERE id = $1) as batch_exists,
      (SELECT COUNT(*) FROM sp_v2_settlement_items WHERE settlement_batch_id = $1) as items_count,
      (SELECT COUNT(*) FROM sp_v2_transactions WHERE settlement_batch_id = $1) as txns_updated
  `, [batchId]);
  
  console.log('\n=== Verification ===');
  console.log(`Batch exists: ${verification.rows[0].batch_exists === '1' ? 'YES' : 'NO'}`);
  console.log(`Settlement items: ${verification.rows[0].items_count}`);
  console.log(`Transactions updated: ${verification.rows[0].txns_updated}`);
  
  if (verification.rows[0].batch_exists === '1' && 
      verification.rows[0].items_count > 0 && 
      verification.rows[0].txns_updated > 0) {
    console.log('\n✅ TEST PASSED!');
  } else {
    console.log('\n❌ TEST FAILED!');
  }
  
  await pool.end();
  await calculator.close();
}

testSettlementFlow().catch(console.error);
```

**Run**:
```bash
node test-settlement-flow.js
```

---

## 🟠 PRIORITY 2: Important - Blocks Production Use (4-6 hours)

### Task 2.1: Implement Bank Statement Import Service ⏱️ 3 hours

**Create**: `services/bank-statement-processor/index.js`

```javascript
const { Pool } = require('pg');
const Papa = require('papaparse');
const fs = require('fs');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

class BankStatementProcessor {
  
  async processBankStatement(filePath, bankName) {
    console.log(`Processing bank statement: ${filePath}`);
    
    // Parse statement
    const entries = await this.parseStatement(filePath, bankName);
    console.log(`Parsed ${entries.length} entries`);
    
    // Filter credit entries only
    const credits = entries.filter(e => 
      e.debit_credit === 'CREDIT' && 
      e.utr && 
      e.amount_paise > 0
    );
    
    console.log(`Found ${credits.length} credit entries`);
    
    // Insert into utr_credits
    let inserted = 0;
    for (const credit of credits) {
      try {
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
        inserted++;
      } catch (error) {
        console.error(`Error inserting UTR ${credit.utr}:`, error.message);
      }
    }
    
    console.log(`✅ Inserted ${inserted} UTR credits`);
    return { total: entries.length, credits: credits.length, inserted };
  }
  
  async parseStatement(filePath, bankName) {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Parse CSV
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true
    });
    
    // Normalize columns based on bank
    return result.data.map(row => this.normalizeRow(row, bankName));
  }
  
  normalizeRow(row, bankName) {
    // Map bank-specific columns to standard format
    const mappings = {
      'ICICI Bank': {
        utr: row['UTR Number'] || row['UTR'],
        amount: row['Credit'] || row['Amount'],
        timestamp: row['Transaction Date'],
        value_date: row['Value Date'],
        bank_ref: row['Cheque Number'],
        debit_credit: row['Credit'] ? 'CREDIT' : 'DEBIT'
      },
      'HDFC Bank': {
        utr: row['UTR No'],
        amount: row['Credit Amount'],
        timestamp: row['Date'],
        value_date: row['Value Dt'],
        bank_ref: row['Reference No'],
        debit_credit: row['Credit Amount'] ? 'CREDIT' : 'DEBIT'
      }
    };
    
    const mapping = mappings[bankName] || {};
    
    return {
      utr: mapping.utr,
      amount_paise: Math.round(parseFloat(mapping.amount || 0) * 100),
      timestamp: mapping.timestamp,
      value_date: mapping.value_date,
      bank_ref: mapping.bank_ref,
      debit_credit: mapping.debit_credit
    };
  }
}

module.exports = { BankStatementProcessor };
```

**API Endpoint**: Add to recon-api or create separate service

```javascript
// services/bank-statement-processor/api.js

const express = require('express');
const multer = require('multer');
const { BankStatementProcessor } = require('./index');

const app = express();
const upload = multer({ dest: '/tmp/bank-statements/' });
const processor = new BankStatementProcessor();

app.post('/api/bank-statements/upload', upload.single('file'), async (req, res) => {
  try {
    const { bankName } = req.body;
    const filePath = req.file.path;
    
    const result = await processor.processBankStatement(filePath, bankName);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(5112, () => {
  console.log('Bank Statement Processor running on port 5112');
});
```

---

### Task 2.2: Implement UTR Reconciliation Job ⏱️ 2 hours

**Create**: `services/bank-statement-processor/reconcile-utrs.js`

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function reconcileUTRCredits() {
  console.log('=== Starting UTR Reconciliation ===\n');
  
  // Get unreconciled bank credits
  const unreconciled = await pool.query(`
    SELECT * FROM sp_v2_utr_credits 
    WHERE reconciled = false
    ORDER BY credited_at DESC
  `);
  
  console.log(`Found ${unreconciled.rows.length} unreconciled UTR credits`);
  
  let matched = 0;
  let updated = 0;
  
  for (const credit of unreconciled.rows) {
    // Find matching transfer
    const transfer = await pool.query(`
      SELECT btq.*, sb.merchant_id
      FROM sp_v2_bank_transfer_queue btq
      JOIN sp_v2_settlement_batches sb ON btq.batch_id = sb.id
      WHERE btq.utr_number = $1 
        AND btq.status IN ('sent', 'success')
        AND ABS(btq.amount_paise - $2) < 100
    `, [credit.utr, credit.amount_paise]);
    
    if (transfer.rows.length > 0) {
      matched++;
      const t = transfer.rows[0];
      
      console.log(`✅ Matched UTR ${credit.utr} (₹${(credit.amount_paise/100).toFixed(2)})`);
      
      // Mark credit as reconciled
      await pool.query(`
        UPDATE sp_v2_utr_credits 
        SET reconciled = true 
        WHERE id = $1
      `, [credit.id]);
      
      // Update transfer status
      await pool.query(`
        UPDATE sp_v2_bank_transfer_queue 
        SET status = 'success',
            bank_confirmed = true,
            bank_confirmation_date = CURRENT_DATE,
            completed_at = NOW()
        WHERE id = $1
      `, [t.id]);
      
      // Update settlement batch
      await pool.query(`
        UPDATE sp_v2_settlement_batches 
        SET status = 'COMPLETED',
            settlement_completed_at = NOW(),
            bank_reference_number = $1
        WHERE id = $2
      `, [credit.utr, t.batch_id]);
      
      // Update transactions
      await pool.query(`
        UPDATE sp_v2_transactions 
        SET settled_at = NOW()
        WHERE settlement_batch_id = $1
      `, [t.batch_id]);
      
      updated++;
    }
  }
  
  console.log(`\n=== Reconciliation Complete ===`);
  console.log(`Matched: ${matched}`);
  console.log(`Updated: ${updated}`);
  
  await pool.end();
}

// Run immediately
reconcileUTRCredits().catch(console.error);

// Export for cron
module.exports = { reconcileUTRCredits };
```

**Add Cron Job**:
```javascript
// Add to settlement-scheduler.cjs or create new scheduler
const cron = require('node-cron');
const { reconcileUTRCredits } = require('./reconcile-utrs');

// Run every hour
cron.schedule('0 * * * *', async () => {
  console.log('[CRON] Running UTR reconciliation...');
  await reconcileUTRCredits();
});
```

---

## 🟡 PRIORITY 3: Enhancement - Improves UX (3-4 hours)

### Task 3.1: Create Approval Workflow UI ⏱️ 2 hours

**Frontend Component**: `src/pages/ops/SettlementApproval.tsx`

```typescript
import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';

export function SettlementApproval() {
  const { data: pendingBatches } = useQuery({
    queryKey: ['pending-settlements'],
    queryFn: async () => {
      const res = await axios.get('http://localhost:5108/api/settlements/pending');
      return res.data;
    },
    refetchInterval: 30000
  });

  const approveMutation = useMutation({
    mutationFn: async (batchId: string) => {
      return axios.post(`http://localhost:5108/api/settlements/${batchId}/approve`);
    },
    onSuccess: () => {
      // Refetch list
    }
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Settlement Approvals</h1>
      
      <div className="space-y-4">
        {pendingBatches?.map(batch => (
          <div key={batch.id} className="border p-4 rounded">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{batch.merchant_name}</h3>
                <p className="text-sm text-gray-600">
                  Cycle: {batch.cycle_date} | Txns: {batch.total_transactions}
                </p>
                <p className="text-lg font-bold">
                  ₹{(batch.net_amount_paise / 100).toFixed(2)}
                </p>
              </div>
              
              <div className="space-x-2">
                <button
                  onClick={() => approveMutation.mutate(batch.id)}
                  className="bg-green-600 text-white px-4 py-2 rounded"
                >
                  Approve
                </button>
                <button className="bg-red-600 text-white px-4 py-2 rounded">
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Backend API Endpoint**: Add to overview-api

```javascript
// services/overview-api/settlement-approvals.js

app.get('/api/settlements/pending', async (req, res) => {
  const result = await pool.query(`
    SELECT * FROM sp_v2_settlement_batches
    WHERE status = 'PENDING_APPROVAL'
    ORDER BY cycle_date DESC
  `);
  
  res.json(result.rows);
});

app.post('/api/settlements/:batchId/approve', async (req, res) => {
  const { batchId } = req.params;
  const { userId } = req.body; // From auth
  
  await pool.query(`
    UPDATE sp_v2_settlement_batches
    SET status = 'APPROVED',
        approved_at = NOW(),
        approved_by = $1
    WHERE id = $2
  `, [userId, batchId]);
  
  res.json({ success: true });
});
```

---

### Task 3.2: Bank Transfer Mock Worker (For Testing) ⏱️ 1 hour

**Create**: `services/bank-transfer-worker/mock-worker.js`

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function processBankTransfers() {
  console.log('[Bank Worker] Checking queue...');
  
  const queued = await pool.query(`
    SELECT * FROM sp_v2_bank_transfer_queue
    WHERE status = 'queued'
    ORDER BY queued_at ASC
    LIMIT 10
  `);
  
  console.log(`[Bank Worker] Found ${queued.rows.length} queued transfers`);
  
  for (const transfer of queued.rows) {
    try {
      // Update to processing
      await pool.query(`
        UPDATE sp_v2_bank_transfer_queue
        SET status = 'processing', processing_at = NOW()
        WHERE id = $1
      `, [transfer.id]);
      
      // MOCK: Generate UTR (in production, call actual bank API)
      const mockUTR = `UTR${Date.now()}${Math.floor(Math.random() * 1000)}`;
      
      console.log(`[Bank Worker] Processing transfer ${transfer.id} (${transfer.transfer_mode})`);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update to sent
      await pool.query(`
        UPDATE sp_v2_bank_transfer_queue
        SET status = 'sent',
            utr_number = $1,
            sent_at = NOW()
        WHERE id = $2
      `, [mockUTR, transfer.id]);
      
      console.log(`[Bank Worker] ✅ Transfer sent: ${mockUTR}`);
      
    } catch (error) {
      console.error(`[Bank Worker] Error processing transfer ${transfer.id}:`, error.message);
      
      await pool.query(`
        UPDATE sp_v2_bank_transfer_queue
        SET status = 'failed',
            last_error = $1,
            retry_count = retry_count + 1
        WHERE id = $2
      `, [error.message, transfer.id]);
    }
  }
}

// Run every 5 minutes
setInterval(processBankTransfers, 5 * 60 * 1000);

// Run immediately on start
processBankTransfers();

console.log('[Bank Worker] Started - polling every 5 minutes');
```

**Run**:
```bash
node services/bank-transfer-worker/mock-worker.js &
```

---

## 📋 Execution Checklist

### Phase 1: Fix Critical Schema Issues (Day 1 Morning - 4 hours)
- [ ] Run migration 018 (fix settlement_items schema)
- [ ] Update settlement-calculator-v1-logic.cjs
- [ ] Update settlement-calculator-v2.cjs
- [ ] Update settlement-calculator-v3.cjs
- [ ] Update merchant-api/db.js joins
- [ ] Update settlement-analytics-api joins
- [ ] Update recon-api joins
- [ ] Remove migration 007
- [ ] Run test-settlement-flow.js
- [ ] Verify: Manual upload → settlement batch works

### Phase 2: Implement Missing Services (Day 1 Afternoon - 5 hours)
- [ ] Create bank-statement-processor service
- [ ] Create bank-statement upload API
- [ ] Create UTR reconciliation job
- [ ] Create mock bank transfer worker
- [ ] Test: Upload bank statement → UTR credits created
- [ ] Test: UTR reconciliation matches transfers

### Phase 3: Build Approval UI (Day 2 Morning - 3 hours)
- [ ] Create SettlementApproval.tsx component
- [ ] Add approval API endpoints
- [ ] Add to router
- [ ] Test: Approve batch → triggers transfer queue

### Phase 4: End-to-End Testing (Day 2 Afternoon - 2 hours)
- [ ] Upload CSV (PG + Bank)
- [ ] Run reconciliation
- [ ] Verify settlement batch created
- [ ] Approve batch
- [ ] Verify transfer queued
- [ ] Mock worker processes transfer
- [ ] Upload bank statement
- [ ] UTR reconciliation runs
- [ ] Verify batch marked COMPLETED
- [ ] Verify transactions marked settled_at

---

## Total Time Estimate

| Priority | Tasks | Time |
|----------|-------|------|
| Priority 1 (Critical) | Schema fix + code updates | 3-4 hours |
| Priority 2 (Important) | Bank import + reconciliation | 4-6 hours |
| Priority 3 (Enhancement) | Approval UI + mock worker | 3-4 hours |
| **TOTAL** | | **10-14 hours** (2 days) |

---

## Success Criteria

After completion, the following should work end-to-end:

1. ✅ Manual CSV upload → sp_v2_transactions
2. ✅ Reconciliation → status = RECONCILED
3. ✅ Settlement batch auto-created → sp_v2_settlement_batches
4. ✅ Settlement items created → sp_v2_settlement_items (with correct FK)
5. ✅ Ops approves batch → status = APPROVED
6. ✅ Transfer queued → sp_v2_bank_transfer_queue
7. ✅ Worker processes → UTR generated
8. ✅ Bank statement uploaded → sp_v2_utr_credits
9. ✅ UTR reconciliation → batch = COMPLETED
10. ✅ Merchant dashboard shows credited settlements

---

## Quick Start (Minimum Viable)

If you need to get settlements working ASAP (just Priority 1):

```bash
# 1. Fix schema (30 min)
psql -U postgres -h localhost -p 5433 -d settlepaisa_v2 -f db/migrations/018_fix_settlement_items_schema.sql

# 2. Update code (1 hour)
# Edit the 3 calculator files + 3 API files (see Task 1.2 & 1.3)

# 3. Test (30 min)
node test-settlement-flow.js

# 4. Deploy
pm2 restart all
```

This gives you working settlements (manual upload → batch creation).  
Bank transfers and UTR reconciliation can be added later (Priority 2 & 3).

---

## Next Steps

**Start with**: Priority 1, Task 1.1 - Fix the schema  
**Then**: Update code files  
**Then**: Test with real data  
**Finally**: Add bank integration when ready

Created: `/Users/shantanusingh/ops-dashboard/ACTION_PLAN_COMPLETE_SETTLEMENT_SYSTEM.md`
