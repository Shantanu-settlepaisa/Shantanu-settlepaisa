# Migration Guide: Consolidate to sp_v2_transactions

**Date**: October 6, 2025  
**Objective**: Make `sp_v2_transactions` the single source of truth for all transaction data

---

## Executive Summary

Currently we have two transaction tables:
- **sp_v2_transactions**: Manual CSV uploads (706 rows)
- **sp_v2_transactions_v1**: Webhook/API ingestion (unknown rows)

**Problem**: Manual uploads cannot be settled because settlement engine queries v1 table.

**Solution**: Extend `sp_v2_transactions` schema to support all data sources, migrate v1 data, update all services.

---

## Architecture Changes

### Before Migration
```
┌─────────────────────────────────────────────┐
│  Data Sources                               │
├─────────────────────────────────────────────┤
│  CSV Uploads → sp_v2_transactions           │
│  Webhooks    → sp_v2_transactions_v1        │
│  V1 API Poll → sp_v2_transactions_v1        │
└─────────────────────────────────────────────┘
         ↓                    ↓
    ┌──────────┐       ┌──────────┐
    │ Recon    │       │Settlement│  ← BROKEN: Can't settle manual uploads
    │ Engine   │       │ Engine   │
    └──────────┘       └──────────┘
```

### After Migration
```
┌─────────────────────────────────────────────┐
│  All Data Sources                           │
├─────────────────────────────────────────────┤
│  CSV Uploads → sp_v2_transactions           │
│  Webhooks    → sp_v2_transactions           │
│  V1 API Poll → sp_v2_transactions           │
└─────────────────────────────────────────────┘
              ↓
    ┌──────────────────────┐
    │  sp_v2_transactions  │ ← Single Source of Truth
    └──────────────────────┘
         ↓            ↓
    ┌──────────┐ ┌──────────┐
    │ Recon    │ │Settlement│  ✅ FIXED: All txns settleable
    │ Engine   │ │ Engine   │
    └──────────┘ └──────────┘
```

---

## Implementation Steps

### Step 1: Schema Extension (5 minutes)

**What**: Add columns to `sp_v2_transactions` to support webhook data.

```sql
ALTER TABLE sp_v2_transactions 
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(50),
  ADD COLUMN IF NOT EXISTS gateway_txn_id TEXT,
  ADD COLUMN IF NOT EXISTS pgw_ref TEXT,
  ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(15),
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS ingestion_source VARCHAR(50) DEFAULT 'MANUAL_UPLOAD';

-- Update unique constraint
CREATE UNIQUE INDEX idx_transactions_pgw_ref 
  ON sp_v2_transactions(pgw_ref) 
  WHERE pgw_ref IS NOT NULL;
```

**Verification**:
```sql
\d sp_v2_transactions  -- Should show new columns
```

---

### Step 2: Update PG Ingestion Service (10 minutes)

**File**: `/services/pg-ingestion/pg-ingestion-server.cjs`

**Changes**:
1. Line 77-87: Change `INSERT INTO sp_v2_transactions_v1` → `INSERT INTO sp_v2_transactions`
2. Add status mapping function:
```javascript
function mapWebhookStatusToV2Status(webhookStatus) {
  const statusMap = {
    'SUCCESS': 'RECONCILED',
    'CAPTURED': 'RECONCILED',
    'FAILED': 'FAILED',
    'PENDING': 'PENDING',
    'REVERSED': 'FAILED'
  };
  return statusMap[webhookStatus.toUpperCase()] || 'PENDING';
}
```

3. Update INSERT query to include all new fields:
```javascript
INSERT INTO sp_v2_transactions 
(transaction_id, merchant_id, amount_paise, utr, payment_mode, 
 status, gateway, gateway_txn_id, pgw_ref, ingestion_source, 
 transaction_date, source_type, source_name, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
```

**Test**:
```bash
# Trigger manual poll
curl -X POST http://13.201.179.44:5111/api/trigger-poll/v1

# Check if data inserted into v2 table
psql -U postgres -d settlepaisa_v2 -c "SELECT COUNT(*) FROM sp_v2_transactions WHERE ingestion_source = 'WEBHOOK';"
```

---

### Step 3: Update Settlement Engine (5 minutes)

**File**: `/services/settlement-engine/settlement-calculator.cjs`

**Changes**:
- Line 29: Change `FROM sp_v2_transactions_v1` → `FROM sp_v2_transactions`
- Line 31: Change `status = 'SUCCESS'` → `status IN ('RECONCILED', 'PENDING')`
- Line 204: Change `FROM sp_v2_transactions_v1` → `FROM sp_v2_transactions`
- Line 205: Change `status = 'SUCCESS'` → `status = 'RECONCILED'`

**Test**:
```javascript
const SettlementCalculator = require('./settlement-calculator.cjs');
const calc = new SettlementCalculator();

// Should now calculate settlements for ALL transactions (manual + webhook)
await calc.processSettlements();
```

---

### Step 4: Data Migration (20 minutes)

**File**: `/db/migrations/migrate_v1_to_v2_transactions.sql`

**What**: Migrate existing data from `sp_v2_transactions_v1` → `sp_v2_transactions` and update FK references.

**Steps**:
```bash
# Backup first
pg_dump -U postgres settlepaisa_v2 > backup_before_migration_$(date +%Y%m%d).sql

# Run migration
psql -U postgres -d settlepaisa_v2 -f /Users/shantanusingh/ops-dashboard/db/migrations/migrate_v1_to_v2_transactions.sql
```

**What it does**:
1. Migrates all rows from v1 to v2 (with status mapping)
2. Creates temporary mapping table (UUID → BIGINT)
3. Updates `sp_v2_settlement_items.txn_id` to reference v2 table
4. Updates `sp_v2_settlement_transaction_map.transaction_id` 
5. Renames v1 table to `_deprecated`

**Verification queries** (run after migration):
```sql
-- Should show combined count
SELECT COUNT(*) FROM sp_v2_transactions;

-- Should show data from all sources
SELECT ingestion_source, COUNT(*) 
FROM sp_v2_transactions 
GROUP BY ingestion_source;

-- Should be 0 (no orphaned settlement items)
SELECT COUNT(*) 
FROM sp_v2_settlement_items si
LEFT JOIN sp_v2_transactions t ON si.txn_id = t.id
WHERE t.id IS NULL;
```

---

### Step 5: Update Overview API (5 minutes)

**File**: `/services/overview-api/overview-v2.js`

**Changes**:
- Line 112, 121: Change `JOIN sp_v2_transactions_v1` → `JOIN sp_v2_transactions`
- Line 368: Change `'sp_v2_transactions_v1'` → `'sp_v2_transactions'` in stats array
- Line 489: Change `FROM sp_v2_transactions_v1` → `FROM sp_v2_transactions`
- Line 493: Change `WHERE t.status = 'SUCCESS'` → `WHERE t.status = 'RECONCILED'`
- Line 564: Change `FROM sp_v2_transactions_v1` → `FROM sp_v2_transactions`

**Test**:
```bash
# Restart overview API
pm2 restart overview-api

# Test endpoint
curl http://13.201.179.44:5108/api/overview/v2
```

---

### Step 6: Update Documentation (5 minutes)

**Files to update**:
- `CLAUDE.md`: Remove v1 table references
- `DATABASE_TABLE_GUIDE.md`: Mark as deprecated
- `.claude_context/table_usage_rules.json`: Update rules

**Changes**:
```json
{
  "critical_rules": {
    "rule_1": "ALL data goes into sp_v2_transactions",
    "rule_2": "sp_v2_transactions_v1_deprecated is read-only archive"
  }
}
```

---

## Rollback Plan

If migration fails:

```sql
BEGIN;

-- Restore v1 table name
ALTER TABLE sp_v2_transactions_v1_deprecated 
  RENAME TO sp_v2_transactions_v1;

-- Restore FK constraints
ALTER TABLE sp_v2_settlement_items 
  ADD CONSTRAINT sp_v2_settlement_items_txn_id_fkey 
  FOREIGN KEY (txn_id) REFERENCES sp_v2_transactions_v1(id);

-- Restore service code from git
cd /home/ubuntu/ops-dashboard
git checkout HEAD -- services/pg-ingestion/pg-ingestion-server.cjs
git checkout HEAD -- services/settlement-engine/settlement-calculator.cjs
git checkout HEAD -- services/overview-api/overview-v2.js

COMMIT;
```

---

## Testing Checklist

After migration, verify:

- [ ] CSV upload works (`POST /api/upload/multiple`)
- [ ] Webhooks insert into v2 table
- [ ] V1 API polling inserts into v2 table
- [ ] Recon engine works with all transactions
- [ ] Settlement calculator processes manual uploads
- [ ] Overview API shows correct metrics
- [ ] No orphaned FK references
- [ ] All 706 manual uploads are settleable

---

## Data Flow After Migration

### CSV Upload Flow
```
User uploads CSV
  ↓
Upload API (port 5109)
  ↓
INSERT INTO sp_v2_transactions
  (ingestion_source = 'MANUAL_UPLOAD')
  ↓
Recon Engine matches
  ↓
Settlement Engine processes
  ✅ NOW WORKS!
```

### Webhook Flow
```
Razorpay/PayU/Paytm webhook
  ↓
PG Ingestion Service (port 5111)
  ↓
INSERT INTO sp_v2_transactions
  (ingestion_source = 'WEBHOOK')
  ↓
Auto-reconciled (status = 'RECONCILED')
  ↓
Settlement Engine processes
  ✅ NOW WORKS!
```

### V1 API Polling Flow
```
Cron job (every 2 mins)
  ↓
PG Ingestion Service polls V1 API
  ↓
INSERT INTO sp_v2_transactions
  (ingestion_source = 'V1_API_POLL')
  ↓
Settlement Engine processes
  ✅ NOW WORKS!
```

---

## Schema Comparison

| Column | sp_v2_transactions (NEW) | sp_v2_transactions_v1 (OLD) |
|--------|-------------------------|----------------------------|
| id | BIGSERIAL ✅ | UUID ❌ |
| transaction_id | VARCHAR(100) UNIQUE ✅ | N/A |
| pgw_ref | TEXT (nullable) ✅ | TEXT UNIQUE ❌ |
| merchant_id | VARCHAR(50) ✅ | UUID (FK) ❌ |
| status | PENDING/RECONCILED/EXCEPTION/FAILED ✅ | SUCCESS/FAILED/PENDING ❌ |
| gateway | VARCHAR(50) ✅ | VARCHAR(50) ✅ |
| ingestion_source | NEW COLUMN ✅ | N/A |
| metadata | JSONB ✅ | JSONB ✅ |

---

## Status Mapping

| Webhook Status | v1 Table (OLD) | v2 Table (NEW) |
|---------------|---------------|---------------|
| SUCCESS | SUCCESS | RECONCILED |
| CAPTURED | SUCCESS | RECONCILED |
| FAILED | FAILED | FAILED |
| PENDING | PENDING | PENDING |
| REVERSED | PENDING | FAILED |

---

## Estimated Downtime

**Total**: ~30 minutes

| Step | Duration | Can Run in Background? |
|------|----------|----------------------|
| Schema extension | 5 min | No (requires exclusive lock) |
| Code updates | 15 min | Yes |
| Data migration | 10 min | No (requires exclusive lock) |
| Service restarts | 5 min | No |

**Recommended**: Run during low-traffic window (2-4 AM IST)

---

## Success Metrics

After migration:

1. **Data integrity**:
   - Row count: `sp_v2_transactions` = old v2 count + old v1 count
   - No orphaned FKs

2. **Functional tests**:
   - Upload 3 CSV rows → should appear in v2 table
   - Trigger webhook → should appear in v2 table
   - Run settlement → should process all transactions

3. **Performance**:
   - Query time for settlement calculation < 500ms
   - Overview API response < 2s

---

## Post-Migration Cleanup (After 1 Week)

Once verified stable:

```sql
-- Archive v1 data
pg_dump -U postgres -t sp_v2_transactions_v1_deprecated settlepaisa_v2 > v1_archive.sql

-- Drop deprecated table
DROP TABLE sp_v2_transactions_v1_deprecated CASCADE;

-- Vacuum to reclaim space
VACUUM FULL sp_v2_transactions;
```

---

## Contact

**Questions?** Check:
- `DATABASE_TABLE_GUIDE.md` - Schema reference
- `CLAUDE.md` - AI assistant context
- Migration script: `/db/migrations/migrate_v1_to_v2_transactions.sql`

**Deployment Date**: TBD (after testing in staging)
