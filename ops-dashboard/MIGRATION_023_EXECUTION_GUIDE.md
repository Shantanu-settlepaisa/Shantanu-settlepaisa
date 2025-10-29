# Migration 023 Execution Guide
## Complete V1 to V2 Transaction Migration

**Date:** October 7, 2025  
**Status:** ✅ Code Updated, ⏳ Database Migration Pending  
**Environment:** AWS Staging RDS

---

## What Has Been Done

### 1. ✅ Code Changes Committed & Pushed
- **File:** `services/pg-ingestion/pg-ingestion-server.cjs`
- **Change:** Now writes to `sp_v2_transactions` instead of `sp_v2_transactions_v1`
- **Commit:** 385d8d1 "Eliminate sp_v2_transactions_v1 dependencies - single source of truth"
- **Branch:** feat/ops-dashboard-exports

### 2. ✅ Migration Script Created
- **File:** `db/migrations/023_complete_v1_to_v2_migration.sql`
- **What it does:**
  1. Creates merchant ID mapping table (UUID ↔ VARCHAR bridge)
  2. Migrates any remaining v1 transactions to v2
  3. Fixes `sp_v2_settlement_transaction_map` FK (UUID → VARCHAR)
  4. Drops v1 merchant FK constraint
  5. Renames `sp_v2_transactions_v1` → `sp_v2_transactions_v1_deprecated`
  6. Creates webhook query indexes
  7. Runs verification checks

---

## Pre-Migration Verification (Run on Staging)

```bash
# Connect to staging RDS
PGPASSWORD='settlepaisa123' psql \
  -h settlepaisa-v2.c6p8wl0bxygl.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2
```

**Run these queries to verify readiness:**

```sql
-- 1. Count transactions in v1 table
SELECT 'v1_transaction_count' as metric, COUNT(*) as value 
FROM sp_v2_transactions_v1;

-- 2. Count webhook transactions in v2 table
SELECT 'v2_webhook_count' as metric, COUNT(*) as value 
FROM sp_v2_transactions WHERE source_type = 'WEBHOOK';

-- 3. Check settlement_transaction_map FK dependency
SELECT 'settlement_map_count' as metric, COUNT(*) as value 
FROM sp_v2_settlement_transaction_map;

-- 4. Check if merchant mapping would succeed
SELECT 'merchant_mapping_candidates' as metric, COUNT(*) as value
FROM sp_v2_merchants m
JOIN sp_v2_merchant_master mm ON LOWER(m.name) = LOWER(mm.merchant_name);

-- 5. Verify v1 table exists
SELECT tablename FROM pg_tables WHERE tablename = 'sp_v2_transactions_v1';

-- 6. Verify deprecated table does NOT exist yet
SELECT tablename FROM pg_tables WHERE tablename = 'sp_v2_transactions_v1_deprecated';
```

**Expected Results:**
- v1_transaction_count: 376 (or current count)
- v2_webhook_count: 376 (should match v1)
- settlement_map_count: 0 (currently empty on staging)
- merchant_mapping_candidates: >= 0 (any matches found)
- v1 table: EXISTS
- deprecated table: DOES NOT EXIST

---

## Migration Execution Steps

### Step 1: SSH to EC2 Bastion (if needed)
```bash
ssh -i /tmp/settlepaisa-backend-key.pem ec2-user@13.234.63.124
cd /home/ec2-user/ops-dashboard
git pull origin feat/ops-dashboard-exports
```

### Step 2: Run Migration Script
```bash
PGPASSWORD='settlepaisa123' psql \
  -h settlepaisa-v2.c6p8wl0bxygl.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f db/migrations/023_complete_v1_to_v2_migration.sql
```

**Expected Output:**
```
✅ Step 1 Complete: Merchant ID mapping table created with X mappings
✅ Step 2 Complete: All v1 transactions migrated to v2
✅ Step 3 Complete: settlement_transaction_map FK updated (table was empty)
✅ Step 4 Complete: V1 merchant FK constraint dropped
✅ Step 5 Complete: V1 table renamed to sp_v2_transactions_v1_deprecated
✅ Step 6 Complete: Webhook query indexes created

========================================
📊 MIGRATION VERIFICATION SUMMARY
========================================
✅ V1 transactions (deprecated): 376
✅ V2 webhook transactions: 376
✅ Merchant ID mappings: X
✅ Settlement map orphans: 0 (should be 0)

✅✅✅ ALL CHECKS PASSED - Migration Complete!
========================================
```

### Step 3: Post-Migration Verification
```sql
-- 1. Verify v1 table is renamed
SELECT tablename FROM pg_tables 
WHERE tablename IN ('sp_v2_transactions_v1', 'sp_v2_transactions_v1_deprecated');

-- Expected: Only sp_v2_transactions_v1_deprecated should exist

-- 2. Verify webhook transactions in v2
SELECT COUNT(*) FROM sp_v2_transactions WHERE source_type = 'WEBHOOK';

-- Expected: Should match v1_deprecated count

-- 3. Verify settlement FK points to v2
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  confrelid::regclass as foreign_table
FROM pg_constraint
WHERE conname = 'sp_v2_settlement_transaction_map_transaction_id_fkey';

-- Expected: foreign_table = sp_v2_transactions

-- 4. Check merchant ID mapping table
SELECT COUNT(*) FROM sp_v2_merchant_id_mapping;

-- Expected: Number of successfully mapped merchants

-- 5. Test source breakdown query (used by Overview API)
SELECT 
  source_type,
  COUNT(*) as transaction_count,
  SUM(amount_paise)/100 as total_rupees
FROM sp_v2_transactions
GROUP BY source_type
ORDER BY source_type;

-- Expected: Should show WEBHOOK, MANUAL_UPLOAD, API_SYNC
```

---

## Deploy Updated pg-ingestion-server.cjs

### Option A: Using Docker (Recommended)
```bash
# Build new Docker image
cd /home/ec2-user/ops-dashboard
docker build -t pg-ingestion-server:v2 -f services/pg-ingestion/Dockerfile services/pg-ingestion/

# Stop old container
docker stop pg-ingestion || true
docker rm pg-ingestion || true

# Start new container
docker run -d \
  --name pg-ingestion \
  --restart unless-stopped \
  -p 5111:5111 \
  -e DB_HOST=settlepaisa-v2.c6p8wl0bxygl.ap-south-1.rds.amazonaws.com \
  -e DB_PORT=5432 \
  -e DB_NAME=settlepaisa_v2 \
  -e DB_USER=postgres \
  -e DB_PASSWORD=settlepaisa123 \
  -e PG_INGESTION_PORT=5111 \
  pg-ingestion-server:v2

# Verify logs
docker logs -f pg-ingestion
```

### Option B: Using PM2 (Alternative)
```bash
cd /home/ec2-user/ops-dashboard/services/pg-ingestion

# Install dependencies if needed
npm install

# Start with PM2
pm2 start pg-ingestion-server.cjs \
  --name pg-ingestion \
  --env DB_HOST=settlepaisa-v2.c6p8wl0bxygl.ap-south-1.rds.amazonaws.com \
  --env DB_PORT=5432 \
  --env DB_NAME=settlepaisa_v2 \
  --env DB_USER=postgres \
  --env DB_PASSWORD=settlepaisa123

# Check logs
pm2 logs pg-ingestion
```

---

## Test Webhook Ingestion

### Test Razorpay Webhook
```bash
curl -X POST http://localhost:5111/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -d '{
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_TEST123456",
          "amount": 100000,
          "method": "upi",
          "status": "captured",
          "created_at": 1696723200,
          "acquirer_data": {
            "utr": "TEST_UTR_12345"
          },
          "notes": {
            "merchant_id": "MERCHANT_001"
          }
        }
      }
    }
  }'
```

**Expected Response:**
```json
{"status": "ok"}
```

**Verify in Database:**
```sql
SELECT * FROM sp_v2_transactions 
WHERE transaction_id = 'pay_TEST123456' 
  AND source_type = 'WEBHOOK';
```

### Check Service Stats
```bash
curl http://localhost:5111/api/stats
```

**Expected:**
```json
{
  "by_source": [
    {
      "gateway": "RAZORPAY",
      "total_transactions": 1,
      "successful_transactions": 1,
      "total_amount_paise": 100000,
      "last_transaction": "2025-10-07T..."
    }
  ],
  "cache_size": 1,
  "uptime": 123.45
}
```

---

## Verification Checklist

- [ ] Pre-migration verification queries run successfully
- [ ] Migration script executed without errors
- [ ] v1 table renamed to `sp_v2_transactions_v1_deprecated`
- [ ] Webhook transactions exist in `sp_v2_transactions` with `source_type='WEBHOOK'`
- [ ] Settlement FK points to `sp_v2_transactions.transaction_id`
- [ ] Merchant ID mapping table created and populated
- [ ] pg-ingestion-server.cjs deployed to staging
- [ ] Test webhook received and stored in v2 table
- [ ] Service stats endpoint returns correct data
- [ ] No code references `sp_v2_transactions_v1` (except deprecated table)

---

## Rollback Plan (Emergency Only)

If migration causes issues, rollback steps:

```sql
BEGIN;

-- 1. Rename deprecated table back to v1
ALTER TABLE sp_v2_transactions_v1_deprecated RENAME TO sp_v2_transactions_v1;

-- 2. Restore v1 merchant FK
ALTER TABLE sp_v2_transactions_v1
  ADD CONSTRAINT sp_v2_transactions_v1_merchant_id_fkey
  FOREIGN KEY (merchant_id) REFERENCES sp_v2_merchants(id);

-- 3. If settlement_transaction_map had data, restore UUID FK
-- (Skip if table was empty during migration)

COMMIT;
```

**Then redeploy old pg-ingestion-server.cjs:**
```bash
git checkout <previous_commit_hash>
# Redeploy service
```

---

## Post-Migration Monitoring

### Monitor for 48 Hours:
1. **Webhook Ingestion Rate**
   ```sql
   SELECT COUNT(*) FROM sp_v2_transactions 
   WHERE source_type = 'WEBHOOK' 
     AND created_at > NOW() - INTERVAL '1 hour';
   ```

2. **Settlement Processing**
   ```sql
   SELECT COUNT(*) FROM sp_v2_settlement_items
   WHERE created_at > NOW() - INTERVAL '1 hour';
   ```

3. **Error Logs**
   ```bash
   docker logs pg-ingestion 2>&1 | grep ERROR
   ```

### After 30 Days (2025-11-07):
If all is stable, drop the deprecated table:

```sql
-- Final cleanup after 30 days
DROP TABLE IF EXISTS sp_v2_transactions_v1_deprecated;

-- Drop merchant ID mapping if not needed
DROP TABLE IF EXISTS sp_v2_merchant_id_mapping;
```

---

## Current Status Summary

✅ **COMPLETED:**
- Code updated to use `sp_v2_transactions`
- Migration script created and committed
- Changes pushed to git

⏳ **PENDING:**
- Run migration script on staging RDS
- Deploy updated pg-ingestion-server.cjs
- Test webhook ingestion flow
- Verify all systems working

🎯 **GOAL:**
Make `sp_v2_transactions` the single source of truth for ALL transaction data (webhooks, manual uploads, API sync).

---

**Document Version:** 1.0  
**Author:** Claude Code  
**Last Updated:** October 7, 2025
