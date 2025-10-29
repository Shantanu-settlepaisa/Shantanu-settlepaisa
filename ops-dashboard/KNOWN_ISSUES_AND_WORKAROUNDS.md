# Known Issues and Workarounds
**Purpose:** Track bugs, workarounds, and gotchas
**Last Updated:** 2025-10-22
**Status Legend:** 🔴 Critical | 🟡 High | 🟢 Medium | 🔵 Low

---

## 🔴 CRITICAL ISSUES

### Issue #1: Auto-Approval Doesn't Create Bank Transfers

**Status:** 🔴 Identified, not yet fixed
**Severity:** Critical - Blocks payouts
**Discovered:** 2025-10-22
**Impact:** Auto-approved settlements never get paid out

#### Root Cause

**File:** `services/settlement-engine/settlement-queue-processor.cjs`
**Lines:** 431-435

```javascript
async autoApprove(batchId) {
  await v2Pool.query(`
    UPDATE sp_v2_settlement_batches
    SET status = 'APPROVED', approved_at = NOW()
    WHERE id = $1
  `, [batchId]);

  // NOTE: Bank transfer queue population happens automatically via approval workflow
  // For auto-approved settlements, implement similar logic here if needed
  // ↑↑↑ THIS COMMENT IS WRONG - bank transfers are NOT created automatically!
}
```

**Problem:**
1. `autoApprove()` only updates settlement batch status to 'APPROVED'
2. It does NOT create a record in `sp_v2_settlement_bank_transfers`
3. Manual approval (via API) DOES create bank_transfers (in `settlements.cjs:230-249`)
4. Result: Auto-approved settlements stuck at APPROVED, never move to payout

#### Workaround

**Current:** Use manual approval ONLY
```bash
# Via UI: Settlements page → "Approve" button
# Via API: POST /api/settlements/:batchId/approve
```

**DO NOT use:**
- Auto-approval in settlement queue processor
- Any batch jobs that call `autoApprove()`

#### Fix Plan

**Scheduled:** Phase 1 Day 2 Afternoon (3 hours)
**File to Change:** `settlement-queue-processor.cjs:431-445`

**Fix:**
```javascript
async autoApprove(batchId) {
  // 1. Update batch status
  await v2Pool.query(`
    UPDATE sp_v2_settlement_batches
    SET status = 'APPROVED', approved_at = NOW()
    WHERE id = $1
  `, [batchId]);

  // 2. Get batch details
  const batch = await v2Pool.query(`
    SELECT merchant_id, net_amount_paise, settlement_type
    FROM sp_v2_settlement_batches
    WHERE id = $1
  `, [batchId]);

  // 3. Get merchant bank details
  const merchantConfig = await v2Pool.query(`
    SELECT preferred_transfer_mode, bank_account_number
    FROM sp_v2_merchant_configs
    WHERE merchant_id = $1
  `, [batch.rows[0].merchant_id]);

  // 4. Create bank transfer record
  await v2Pool.query(`
    INSERT INTO sp_v2_settlement_bank_transfers (
      id, settlement_batch_id, merchant_id, amount_paise,
      transfer_mode, status, initiated_at
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4, 'PENDING', NOW()
    )
  `, [
    batchId,
    batch.rows[0].merchant_id,
    batch.rows[0].net_amount_paise,
    merchantConfig.rows[0].preferred_transfer_mode || 'NEFT'
  ]);
}
```

**Testing:**
- Create test settlement batch
- Call `autoApprove()` function
- Verify bank_transfers record created
- Verify status = 'PENDING' (not null)

**Reference:** See `PHASE1_CRITICAL_FIXES_IMPLEMENTATION_GUIDE.md` Day 2 Afternoon

---

### Issue #2: Chargeback/Refund Not Deducted from Settlements

**Status:** 🔴 Identified, not yet fixed
**Severity:** Critical - Financial accuracy
**Discovered:** 2025-10-22
**Impact:** Merchants over-credited for refunded/chargebacked transactions

#### Root Cause

**File:** `services/settlement-engine/settlement-calculator-v1-logic.cjs`
**Lines:** 41-70 (missing queries)

**Problem:**
1. Settlement calculator only sums successful transactions
2. No query for `sp_v2_chargebacks` table
3. No query for `sp_v2_refunds` table
4. Result: Settlement amount = gross amount (doesn't subtract chargebacks/refunds)

**Example:**
```
Merchant has:
- 10 successful transactions: ₹10,000
- 2 refunds: ₹2,000
- 1 chargeback: ₹500

Current calculation:
  settlement_amount = ₹10,000 ✅

Correct calculation:
  settlement_amount = ₹10,000 - ₹2,000 - ₹500 = ₹7,500 ✅
```

#### Workaround

**Current:** Manual adjustment
1. Calculate chargebacks/refunds manually:
   ```sql
   SELECT COALESCE(SUM(amount_paise), 0) FROM sp_v2_chargebacks
   WHERE merchant_id = 'MERCH001' AND status = 'APPROVED' AND settlement_batch_id IS NULL;
   ```
2. Deduct from settlement before approval
3. Update settlement batch:
   ```sql
   UPDATE sp_v2_settlement_batches
   SET net_amount_paise = net_amount_paise - [chargeback_total]
   WHERE id = [batch_id];
   ```

**Limitation:** Requires manual intervention for every settlement

#### Fix Plan

**Scheduled:** Phase 1 Day 1 Morning (4 hours)
**Files to Change:**
1. `settlement-calculator-v1-logic.cjs` (add queries)
2. `db/migrations/029_add_chargeback_refund_deductions.sql` (schema)

**Migration 029:**
```sql
-- Add deduction tracking columns
ALTER TABLE sp_v2_settlement_batches
ADD COLUMN IF NOT EXISTS chargeback_deductions_paise BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_deductions_paise BIGINT DEFAULT 0;

-- Create chargebacks table (if not exists)
CREATE TABLE IF NOT EXISTS sp_v2_chargebacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(100),
  amount_paise BIGINT NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create refunds table (if not exists)
CREATE TABLE IF NOT EXISTS sp_v2_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(100),
  amount_paise BIGINT NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED
  settlement_batch_id UUID REFERENCES sp_v2_settlement_batches(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for settlement lookups
CREATE INDEX idx_chargebacks_settlement_lookup
ON sp_v2_chargebacks(merchant_id, status, settlement_batch_id)
WHERE settlement_batch_id IS NULL AND status = 'APPROVED';

CREATE INDEX idx_refunds_settlement_lookup
ON sp_v2_refunds(merchant_id, status, settlement_batch_id)
WHERE settlement_batch_id IS NULL AND status = 'COMPLETED';
```

**Code Fix (settlement-calculator-v1-logic.cjs):**
```javascript
async calculateSettlement(merchantId, reconciledTransactions, cycleDate, settlementType = 'automatic') {
  // ... existing transaction sum logic ...

  // NEW: Query chargebacks
  const chargebacksQuery = await v2Pool.query(`
    SELECT COALESCE(SUM(amount_paise), 0) as total_chargebacks
    FROM sp_v2_chargebacks
    WHERE merchant_id = $1
      AND status = 'APPROVED'
      AND settlement_batch_id IS NULL
  `, [merchantId]);

  const chargebackDeductions = parseInt(chargebacksQuery.rows[0].total_chargebacks);

  // NEW: Query refunds
  const refundsQuery = await v2Pool.query(`
    SELECT COALESCE(SUM(amount_paise), 0) as total_refunds
    FROM sp_v2_refunds
    WHERE merchant_id = $1
      AND status = 'COMPLETED'
      AND settlement_batch_id IS NULL
  `, [merchantId]);

  const refundDeductions = parseInt(refundsQuery.rows[0].total_refunds);

  // Calculate net amount
  const grossAmount = totalSettlementAmount; // from existing logic
  const netAmount = grossAmount - chargebackDeductions - refundDeductions;

  // Store in batch
  await v2Pool.query(`
    INSERT INTO sp_v2_settlement_batches (
      ...,
      gross_amount_paise,
      chargeback_deductions_paise,
      refund_deductions_paise,
      net_amount_paise
    ) VALUES (
      ...,
      $1, $2, $3, $4
    )
  `, [grossAmount, chargebackDeductions, refundDeductions, netAmount]);

  // Mark chargebacks/refunds as processed
  await v2Pool.query(`
    UPDATE sp_v2_chargebacks
    SET settlement_batch_id = $1
    WHERE merchant_id = $2 AND status = 'APPROVED' AND settlement_batch_id IS NULL
  `, [batchId, merchantId]);

  await v2Pool.query(`
    UPDATE sp_v2_refunds
    SET settlement_batch_id = $1
    WHERE merchant_id = $2 AND status = 'COMPLETED' AND settlement_batch_id IS NULL
  `, [batchId, merchantId]);
}
```

**Testing:**
- Create test transactions with refunds
- Run settlement calculation
- Verify `chargeback_deductions_paise` and `refund_deductions_paise` populated
- Verify `net_amount_paise` = gross - chargebacks - refunds
- Verify chargebacks/refunds marked with settlement_batch_id

**Reference:** See `PHASE1_CRITICAL_FIXES_IMPLEMENTATION_GUIDE.md` Day 1 Morning

---

## 🟡 HIGH SEVERITY ISSUES

### Issue #3: Transaction Table Confusion

**Status:** 🟡 Permanent architectural issue
**Severity:** High - Causes data loss if misused
**Discovered:** Early V2 development
**Impact:** Wrong table usage leads to missing data or FK constraint errors

#### The Problem

Two transaction tables with similar names but different purposes:

| Table | Primary Key | Used By | Don't Use For |
|-------|------------|---------|---------------|
| `sp_v2_transactions` | BIGSERIAL id | File uploads, recon workspace | Settlements, PG webhooks |
| `sp_v2_transactions_v1` | UUID id | Settlements, PG webhooks | Manual uploads, file processing |

**Why This Exists:**
- V1 used UUID primary keys
- V2 uses BIGSERIAL for better performance
- Both needed during transition period
- Can't merge without breaking FK constraints

#### Common Mistakes

**Mistake 1:** Using `sp_v2_transactions` for settlements
```javascript
// ❌ WRONG - This will fail with FK constraint error
const settlements = await pool.query(`
  INSERT INTO sp_v2_settlement_items (txn_id, ...)
  SELECT id FROM sp_v2_transactions  -- ❌ BIGSERIAL, FK expects UUID
`);
```

**Mistake 2:** Using `sp_v2_transactions_v1` for file uploads
```javascript
// ❌ WRONG - Upload API populates sp_v2_transactions
await pool.query(`
  SELECT * FROM sp_v2_transactions_v1
  WHERE upload_batch_id = $1  -- ❌ This field doesn't exist in v1 table
`);
```

#### Workaround

**Decision Rule:**
1. **Check FK constraints first**
   ```sql
   -- If joining with settlement_items, use v1
   SELECT * FROM sp_v2_settlement_items si
   JOIN sp_v2_transactions_v1 t ON si.txn_id = t.id  -- ✅ FK constraint matches
   ```

2. **Check which service created the data**
   - Upload API → `sp_v2_transactions`
   - PG webhook → `sp_v2_transactions_v1`
   - Settlement engine → `sp_v2_transactions_v1`

3. **Check the operation type**
   - Counting transactions → Probably `sp_v2_transactions`
   - Calculating amounts → Probably `sp_v2_transactions_v1`

#### Permanent Solution

**Option A:** Migrate all v1 data to v2 table
- Convert UUIDs to BIGSERIAL
- Update all FK constraints
- Drop v1 table

**Option B:** Keep both, enforce with naming
- Rename `sp_v2_transactions_v1` → `sp_v2_settlement_transactions`
- Makes purpose clear from name

**Status:** No decision yet (requires business approval)

**Reference:** See `PROJECT_CONTEXT.md` for detailed table guide

---

### Issue #4: Instant Settlement Missing Priority Queue

**Status:** 🟡 Identified, fix scheduled
**Severity:** High - SLA breach risk
**Discovered:** 2025-10-22
**Impact:** Instant settlements processed same as regular (no priority)

#### The Problem

**File:** `services/settlement-engine/settlement-queue-processor.cjs:67-80`

**Current Query:**
```javascript
const queueQuery = await v2Pool.query(`
  SELECT
    merchant_id,
    array_agg(transaction_id) as transaction_ids
  FROM sp_v2_settlement_queue
  WHERE status = 'PENDING'
  GROUP BY merchant_id
  ORDER BY MIN(queued_at) ASC  -- ❌ No priority consideration
`);
```

**Problem:**
- All settlements processed in FIFO order (first-in-first-out)
- Instant settlement (15 min SLA) might wait behind 50 regular settlements
- SLA breach risk

**Example:**
```
Queue at 10:00 AM:
1. Regular settlement (queued 9:00 AM)    ← Processed first
2. Regular settlement (queued 9:15 AM)
3. Regular settlement (queued 9:30 AM)
4. Instant settlement (queued 9:45 AM)    ← Should be first! SLA = 10:00 AM
5. Regular settlement (queued 9:50 AM)

Result: Instant settlement processed at 10:30 AM (SLA missed by 30 min)
```

#### Workaround

**Current:** Manual monitoring
1. Ops team monitors instant settlements in real-time
2. Manually triggers processing for instant settlements if delayed
3. Post-incident SLA breach reports

**Limitation:** Requires 24x7 ops monitoring

#### Fix Plan

**Scheduled:** Phase 1 Day 1 Afternoon (5 hours)
**Files to Change:**
1. `db/migrations/030_add_settlement_types.sql` (add priority columns)
2. `settlement-queue-processor.cjs` (update query)

**Migration 030:**
```sql
ALTER TABLE sp_v2_settlement_queue
ADD COLUMN IF NOT EXISTS settlement_type VARCHAR(20) DEFAULT 'automatic',
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Priority values: 0=automatic, 1=on_demand, 2=instant

CREATE INDEX idx_settlement_queue_priority
ON sp_v2_settlement_queue(priority DESC, queued_at ASC)
WHERE status = 'PENDING';
```

**Fixed Query:**
```javascript
const queueQuery = await v2Pool.query(`
  SELECT
    merchant_id,
    settlement_type,
    priority,
    array_agg(transaction_id) as transaction_ids
  FROM sp_v2_settlement_queue
  WHERE status = 'PENDING'
  GROUP BY merchant_id, settlement_type, priority
  ORDER BY
    priority DESC,           -- ✅ Instant (2) first, then on_demand (1), then automatic (0)
    MIN(queued_at) ASC       -- ✅ Within same priority, FIFO
  LIMIT 100
`);
```

**Testing:**
- Create 10 regular settlements (priority=0)
- Create 1 instant settlement (priority=2)
- Run queue processor
- Verify instant settlement processed first

**Reference:** See `PHASE1_CRITICAL_FIXES_IMPLEMENTATION_GUIDE.md` Day 1 Afternoon

---

## 🟢 MEDIUM SEVERITY ISSUES

### Issue #5: NEFT File Line Endings

**Status:** 🟢 Recurring issue
**Severity:** Medium - Bank rejection
**Discovered:** Early Phase 2 development
**Impact:** Banks reject files with Unix line endings

#### The Problem

**NEFT/RTGS files MUST use CRLF (`\r\n`), NOT LF (`\n`)**

**Why It Matters:**
- SFMS (bank file format) specification requires CRLF
- Unix systems default to LF
- Banks silently reject files with wrong line endings

**Example:**
```javascript
// ❌ WRONG - Unix line ending
return record + '\n';

// ✅ CORRECT - Windows line ending
return record + '\r\n';
```

#### Symptoms

- File generates successfully
- SFTP upload succeeds
- Bank response: "Invalid file format" (error code 10)
- No specific error about line endings

#### Workaround

**Prevention:**
```javascript
// Always use explicit CRLF
function buildNEFTRecord(data) {
  const record = /* ... build 135-char record ... */;
  return record + '\r\n';  // ✅ Explicit CRLF
}

// Alternative: Use Buffer
const content = lines.join('\r\n');
fs.writeFileSync(filePath, content, { encoding: 'ascii', flag: 'w' });
```

**Verification:**
```bash
# Check line endings
file bank-file.txt
# Should show: "ASCII text, with CRLF line terminators"

# Or use hexdump
hexdump -C bank-file.txt | tail
# Should show: 0d 0a (CRLF) at end of lines
```

**Fix After Generation:**
```bash
# Convert LF to CRLF (use unix2dos)
unix2dos bank-file.txt

# Or use sed
sed -i 's/$/\r/' bank-file.txt
```

#### Permanent Solution

**Code Review Checklist:**
- [ ] All NEFT/RTGS builders use `\r\n`
- [ ] File write uses ASCII encoding
- [ ] Test includes line ending verification

**Reference:** See `BANK_FILE_FORMAT_SPECIFICATIONS.md` - Troubleshooting section

---

### Issue #6: Overview API Port Conflict

**Status:** 🟢 Recurring
**Severity:** Low - Easy workaround
**Discovered:** Frequent during development
**Impact:** Overview API fails to start

#### The Problem

**Error:**
```
Error: listen EADDRINUSE: address already in use :::5108
```

**Cause:**
- Port 5108 already bound by previous process
- Happens after improper shutdown (Ctrl+C doesn't kill process)
- PM2 restart without stopping previous instance

#### Workaround

**Option 1: Kill existing process**
```bash
# Find process on port 5108
lsof -ti:5108

# Kill it
lsof -ti:5108 | xargs kill -9
```

**Option 2: Use different port**
```bash
PORT=5109 node services/overview-api/index.js
```

**Option 3: Use PM2 properly**
```bash
# Stop all processes first
pm2 stop all
pm2 delete all

# Then start
pm2 start services/overview-api/index.js
```

#### Permanent Solution

**Add port check to startup script:**
```javascript
// services/overview-api/index.js
const PORT = process.env.PORT || 5108;

const server = app.listen(PORT, () => {
  console.log(`[Overview API] Listening on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Overview API] Port ${PORT} already in use. Try: lsof -ti:${PORT} | xargs kill -9`);
    process.exit(1);
  }
  throw err;
});
```

**Reference:** See `/tmp/overview-api.log` for errors

---

## 🔵 LOW SEVERITY ISSUES

### Issue #7: Frontend Port Confusion (5173 vs 5174)

**Status:** 🔵 Known quirk
**Severity:** Low - Documentation issue
**Impact:** Developers try wrong port

#### The Problem

- **Standard Vite port:** 5173
- **This project uses:** 5174
- Developers instinctively try `localhost:5173` (doesn't work)

#### Workaround

**Always use port 5174:**
```bash
# Start frontend
npm run dev -- --port 5174

# Or background
npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &
```

**Check if running:**
```bash
lsof -i :5174
```

#### Permanent Solution

**Update package.json:**
```json
{
  "scripts": {
    "dev": "vite --port 5174",
    "start": "vite --port 5174"
  }
}
```

**Reference:** See `PROJECT_CONTEXT.md` - Service Ports section

---

## 📋 Issue Tracking Template

**Use this template when adding new issues:**

```markdown
### Issue #X: [Title]

**Status:** [🔴 Critical | 🟡 High | 🟢 Medium | 🔵 Low]
**Severity:** [Description]
**Discovered:** [Date]
**Impact:** [What breaks, business impact]

#### The Problem

[Detailed description]

**File:** [File path]
**Lines:** [Line numbers]

[Code snippet showing the bug]

#### Symptoms

- [What users see]
- [Error messages]
- [Unexpected behavior]

#### Workaround

**Current:** [Temporary solution]

[Code or steps]

**Limitation:** [What doesn't work with workaround]

#### Fix Plan

**Scheduled:** [Phase/Day]
**Files to Change:** [List]

[Code showing the fix]

**Testing:** [How to verify fix]

**Reference:** [Link to implementation guide]
```

---

## 🔄 Document Update Instructions

**When to Add Issue:**
- Bug discovered during development
- User reports unexpected behavior
- System fails in production/staging

**When to Mark Resolved:**
- Fix deployed to production
- Verified by testing
- User confirms resolution

**How to Mark Resolved:**
```markdown
### Issue #X: [Title] ✅ RESOLVED

**Resolved:** [Date]
**Resolution:** [Brief description]

[Strike through the workaround section]

#### Original Issue (For Reference)
...
```

---

**Maintained By:** SettlePaisa Engineering Team
**Last Updated:** 2025-10-22
**Total Open Issues:** 7 (2 Critical, 2 High, 2 Medium, 1 Low)
