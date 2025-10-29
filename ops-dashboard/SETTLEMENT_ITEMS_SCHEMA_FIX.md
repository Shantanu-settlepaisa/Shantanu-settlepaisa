# Settlement Items Schema Fix

## Problem

`sp_v2_settlement_items` table has column name ambiguity:
- **Actual schema** (from migration 003): Has `txn_id UUID` column
- **Code expectation** (merchant-api): Uses `transaction_id VARCHAR` column that doesn't exist
- **Result**: Merchant API queries WILL FAIL with "column does not exist" error

## Current Working Schema

```sql
CREATE TABLE sp_v2_settlement_items (
    id UUID PRIMARY KEY,
    batch_id UUID NOT NULL,
    txn_id UUID NOT NULL,  -- ← This is what exists
    gross_paise BIGINT,
    commission_paise BIGINT,
    gst_on_commission_paise BIGINT,
    tds_paise BIGINT,
    reserve_paise BIGINT,
    net_paise BIGINT,
    commission_tier VARCHAR(50),
    FOREIGN KEY (batch_id) REFERENCES sp_v2_settlement_batches(id),
    FOREIGN KEY (txn_id) REFERENCES sp_v2_transactions_v1(id)
);
```

## Solution: Migrate to `txn_id BIGINT` Pattern

### Step 1: Verify Current Usage

**Services using `txn_id` (WORKING):**
- `services/overview-api/overview-v2.js` lines 112, 121

**Services using `transaction_id` (BROKEN):**
- `services/merchant-api/db.js` line 591
- `services/merchant-api/disputes.js` lines 86, 217, 407
- `services/settlement-analytics-api/index.js` lines 205, 213
- `services/recon-api/routes/reports.js` line 113

### Step 2: Update All Broken Code

#### File: `services/merchant-api/db.js` (line 591)
```sql
-- BEFORE (BROKEN):
INNER JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id

-- AFTER (FIXED):
INNER JOIN sp_v2_transactions t ON si.txn_id = t.id
```

#### File: `services/merchant-api/disputes.js` (lines 86, 217, 407)
```sql
-- BEFORE (BROKEN):
LEFT JOIN sp_v2_transactions t ON d.transaction_id = t.transaction_id

-- AFTER (FIXED):
LEFT JOIN sp_v2_transactions t ON d.transaction_id = t.transaction_id
-- (This is correct - disputes table has transaction_id VARCHAR)
```

#### File: `services/settlement-analytics-api/index.js` (lines 205, 213)
```sql
-- BEFORE (BROKEN):
JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id

-- AFTER (FIXED):
JOIN sp_v2_transactions t ON si.txn_id = t.id
```

#### File: `services/recon-api/routes/reports.js` (line 113)
```sql
-- BEFORE (BROKEN):
LEFT JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id

-- AFTER (FIXED):
LEFT JOIN sp_v2_transactions t ON si.txn_id = t.id
```

### Step 3: Migrate Schema for sp_v2_transactions

After migrating to unified `sp_v2_transactions`, update FK:

```sql
-- Change txn_id from UUID to BIGINT
ALTER TABLE sp_v2_settlement_items 
  ALTER COLUMN txn_id TYPE BIGINT USING txn_id::text::bigint;

-- Update FK constraint
ALTER TABLE sp_v2_settlement_items 
  DROP CONSTRAINT IF EXISTS sp_v2_settlement_items_txn_id_fkey;

ALTER TABLE sp_v2_settlement_items 
  ADD CONSTRAINT fk_settlement_items_txn 
  FOREIGN KEY (txn_id) REFERENCES sp_v2_transactions(id) ON DELETE CASCADE;
```

## Testing Checklist

After fixes:

```sql
-- Test 1: Verify column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sp_v2_settlement_items' 
  AND column_name IN ('txn_id', 'transaction_id');
-- Should show: txn_id | bigint

-- Test 2: Test merchant API query
SELECT si.*, t.transaction_id
FROM sp_v2_settlement_items si
INNER JOIN sp_v2_transactions t ON si.txn_id = t.id
LIMIT 1;
-- Should return rows without error

-- Test 3: Test analytics API query
SELECT 
  sb.id,
  COUNT(si.id) as txn_count,
  SUM(t.amount_paise) as total_amount
FROM sp_v2_settlement_batches sb
JOIN sp_v2_settlement_items si ON si.batch_id = sb.id
JOIN sp_v2_transactions t ON si.txn_id = t.id
GROUP BY sb.id;
-- Should return aggregated data
```

## Migration Impact

| Service | File | Line | Status | Fix Required |
|---------|------|------|--------|--------------|
| Overview API | overview-v2.js | 112, 121 | ✅ Working | None |
| Merchant API | db.js | 591 | ❌ Broken | Change to txn_id |
| Merchant API | disputes.js | 86, 217, 407 | ⚠️ Mixed | Keep as-is (disputes has transaction_id) |
| Analytics API | index.js | 205, 213 | ❌ Broken | Change to txn_id |
| Recon API | reports.js | 113 | ❌ Broken | Change to txn_id |

## Deployment Order

1. Fix merchant-api code (change transaction_id → txn_id in joins)
2. Fix analytics-api code
3. Fix recon-api code
4. Test all endpoints
5. Run schema migration (UUID → BIGINT)
6. Verify FK integrity
