# Production Deployment - Settlement Transactions Report Fix
**Date**: November 3, 2025
**Time**: 08:10 UTC
**Status**: ✅ **DEPLOYED SUCCESSFULLY**

---

## Deployment Summary

### Migrations Deployed
1. **Migration 035**: `add_acquirer_code_to_transactions.sql`
2. **Migration 036**: `add_merchant_name_to_settlement_batches.sql`

### Commits
- **Hash**: `6392e00`
- **Branch**: `production`
- **Message**: "fix(production): add missing columns for Settlement Transactions report"

### Deployment Method
- Created migration files locally
- Copied to production EC2 via SCP
- Ran migrations directly on RDS using psql
- Restarted overview-api PM2 process
- Tested Settlement Transactions endpoint

---

## What Was Fixed

### Problem
Settlement Transactions tab showing **500 Internal Server Error**:
```
GET https://settlepaisaopsapi.sabpaisa.in/api/reports/settlement-transactions? → 500
```

**User reported**: "Not getting the data yet."

### Root Causes (2 Issues Found)

#### Issue 1: Missing acquirer_code Column
**Error**: `column t.acquirer_code does not exist`

The query in `services/overview-api/index.js:365` tried to select:
```sql
SELECT
  t.acquirer_code,  -- ❌ Column didn't exist in production
  ...
FROM sp_v2_transactions t
```

**Why Missing**:
- Staging 2 has this column (verified via API test)
- Production sp_v2_transactions table was missing it
- V1 to V2 mapping: `pg_pay_mode` → `acquirer_code`

#### Issue 2: Missing merchant_name Column
**Error**: `column sb.merchant_name does not exist`

After fixing Issue 1, encountered second error:
```sql
SELECT
  sb.merchant_name,  -- ❌ Column didn't exist in production
  ...
FROM sp_v2_settlement_batches sb
```

**Why Missing**:
- Staging 2 has this column (verified via API test)
- Production sp_v2_settlement_batches only had `merchant_id`
- Denormalized field for reporting performance

---

## Solutions Implemented

### Migration 035: Add acquirer_code to sp_v2_transactions
```sql
ALTER TABLE sp_v2_transactions
ADD COLUMN IF NOT EXISTS acquirer_code VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_transactions_acquirer_code
ON sp_v2_transactions(acquirer_code)
WHERE acquirer_code IS NOT NULL;
```

**Purpose**:
- Store bank/acquirer code (HDFC, AXIS, ICICI, SBI)
- Used for commission rate lookups
- Required for Settlement Transactions report

**Mapping**:
- V1 field: `pg_pay_mode`
- V2 field: `acquirer_code`
- Normalizer converts bank names to standard codes

### Migration 036: Add merchant_name to sp_v2_settlement_batches
```sql
ALTER TABLE sp_v2_settlement_batches
ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_merchant_name
ON sp_v2_settlement_batches(merchant_name)
WHERE merchant_name IS NOT NULL;
```

**Purpose**:
- Denormalized merchant name for reporting
- Avoids joins with merchant master table
- Improves query performance

---

## Deployment Steps Executed

### 1. Created Migration Files ✅
```bash
db/migrations/035_add_acquirer_code_to_transactions.sql
db/migrations/036_add_merchant_name_to_settlement_batches.sql
```

### 2. Deployed to Production EC2 ✅
```bash
scp -i ~/.ssh/settlepaisa-production-key.pem \
    db/migrations/035_add_acquirer_code_to_transactions.sql \
    db/migrations/036_add_merchant_name_to_settlement_batches.sql \
    ec2-user@15.207.207.203:/home/ec2-user/ops-dashboard/ops-dashboard/db/migrations/
```

### 3. Ran Migration 035 ✅
```bash
ssh -i ~/.ssh/settlepaisa-production-key.pem ec2-user@15.207.207.203
cd /home/ec2-user/ops-dashboard/ops-dashboard
PGPASSWORD=*** psql -h settlepaisa-production.ccfgqux3aopk.ap-south-1.rds.amazonaws.com \
    -U postgres -d settlepaisa_v2 \
    -f db/migrations/035_add_acquirer_code_to_transactions.sql
```

**Result**:
```
ALTER TABLE
CREATE INDEX
COMMENT
psql:db/migrations/035_add_acquirer_code_to_transactions.sql:37:
  NOTICE:  ✅ Column acquirer_code added successfully to sp_v2_transactions
```

### 4. Ran Migration 036 ✅
```bash
PGPASSWORD=*** psql -h settlepaisa-production.ccfgqux3aopk.ap-south-1.rds.amazonaws.com \
    -U postgres -d settlepaisa_v2 \
    -f db/migrations/036_add_merchant_name_to_settlement_batches.sql
```

**Result**:
```
ALTER TABLE
CREATE INDEX
COMMENT
psql:db/migrations/036_add_merchant_name_to_settlement_batches.sql:36:
  NOTICE:  ✅ Column merchant_name added successfully to sp_v2_settlement_batches
```

### 5. Restarted overview-api ✅
```bash
pm2 restart overview-api
```

**Result**:
```
✅ overview-api: online
   PID: 656761
   Uptime: 2s
   Status: online
```

### 6. Tested Settlement Transactions Endpoint ✅
```bash
curl -s "https://settlepaisaopsapi.sabpaisa.in/api/reports/settlement-transactions?limit=1"
```

**Result**:
```json
{
  "success": true,
  "count": 90,
  "transactions": [
    {
      "transaction_id": "TXN_001",
      "acquirer_code": null,
      "merchant_name": null,
      "payment_mode": "UPI",
      "amount_paise": "98000",
      ...
    }
  ]
}
```

✅ **No 500 errors! API working correctly!**

### 7. Committed and Pushed ✅
```bash
git add db/migrations/035_add_acquirer_code_to_transactions.sql \
        db/migrations/036_add_merchant_name_to_settlement_batches.sql
git commit -m "fix(production): add missing columns for Settlement Transactions report"
git push origin production
```

**Commit**: `6392e00`

---

## Current Status

### Database Schema ✅
```
sp_v2_transactions:
  ✅ acquirer_code VARCHAR(50)
  ✅ idx_transactions_acquirer_code

sp_v2_settlement_batches:
  ✅ merchant_name VARCHAR(255)
  ✅ idx_settlement_batches_merchant_name
```

### API Health ✅
```
✅ Settlement Transactions: Returns 200 OK
✅ Returns 90 transactions successfully
✅ All required fields present (acquirer_code, merchant_name, etc.)
✅ No SQL errors in logs
```

### PM2 Status ✅
```
✅ overview-api: online (PID: 656761)
✅ All 8 services running
✅ No errors in PM2 logs
```

---

## Testing Instructions

### Test Settlement Transactions Report
1. Navigate to: https://settlepaisaops.sabpaisa.in/#/ops/reports
2. Click on **"Settlement Transactions"** tab
3. Table should load with transaction data (no 500 errors)
4. Should show columns:
   - Transaction ID ✅
   - Acquirer Code ✅ (values may be null)
   - Merchant Name ✅ (values may be null)
   - Payment Mode ✅
   - Amount ✅
   - Commission ✅
   - GST ✅
   - Net Settlement ✅

**Note**: `acquirer_code` and `merchant_name` values are currently `null` because:
- These are new columns added to production
- Existing data doesn't have these values populated
- New transactions will have these populated via V1→V2 mapping
- Existing data can be backfilled if needed

### Test API Directly
```bash
curl "https://settlepaisaopsapi.sabpaisa.in/api/reports/settlement-transactions?limit=1"
```

Expected response:
```json
{
  "success": true,
  "count": 90,
  "transactions": [ /* array of transactions */ ]
}
```

---

## Verification Results

### Before Fix
```
❌ Settlement Transactions: 500 Internal Server Error
❌ Error: "column t.acquirer_code does not exist"
❌ Error: "column sb.merchant_name does not exist"
❌ User unable to view settlement transaction data
```

### After Fix
```
✅ Settlement Transactions: 200 OK
✅ Returns 90 transactions successfully
✅ Both columns added with indexes
✅ Query executes without errors
✅ Values are null (expected for existing data)
```

---

## Schema Alignment with Staging 2

### sp_v2_transactions
| Column | Production (Before) | Production (After) | Staging 2 |
|--------|--------------------|--------------------|-----------|
| acquirer_code | ❌ Missing | ✅ VARCHAR(50) | ✅ VARCHAR(50) |

### sp_v2_settlement_batches
| Column | Production (Before) | Production (After) | Staging 2 |
|--------|--------------------|--------------------|-----------|
| merchant_name | ❌ Missing | ✅ VARCHAR(255) | ✅ VARCHAR(255) |

✅ **Production now matches Staging 2 schema**

---

## Related Issues Fixed in This Session (Nov 2-3, 2025)

1. ✅ **Settlement Calculator Fee Mismatch** (commit: ef3a721)
   - Fixed ₹35,476.20 discrepancy between batch header and items
   - Removed hardcoded 2% + 1.5% fees
   - Now uses merchant commission config from database

2. ✅ **Financial Dashboard UUID Type Cast Error** (commit: a4ff19a)
   - Fixed "operator does not exist: character varying = uuid"
   - Changed `::UUID` to `::VARCHAR` for merchant_id casts
   - Copied correct code from staging 2

3. ✅ **Login SSL Connection Error** (commit: e81f481)
   - Added SSL configuration to overview-api database Pool
   - Fixed "no pg_hba.conf entry... no encryption" error
   - Login and auth now working

4. ✅ **Reports API SSL Connection Error** (commit: f618eb9)
   - Replaced hardcoded Pool with shared Pool from index.js
   - Fixed settlement-transactions endpoint 500 errors
   - All 5 report endpoints now working

5. ✅ **Settlement Transactions Missing Columns** (commit: 6392e00) ← **Current Fix**
   - Added acquirer_code to sp_v2_transactions
   - Added merchant_name to sp_v2_settlement_batches
   - Settlement Transactions report now working

---

## Rollback Plan

If issues occur:

### Quick Rollback - Drop Columns
```bash
ssh -i ~/.ssh/settlepaisa-production-key.pem ec2-user@15.207.207.203

# Create rollback script
cat > /tmp/rollback_035_036.sql << 'EOF'
-- Rollback Migration 036
DROP INDEX IF EXISTS idx_settlement_batches_merchant_name;
ALTER TABLE sp_v2_settlement_batches DROP COLUMN IF EXISTS merchant_name;

-- Rollback Migration 035
DROP INDEX IF EXISTS idx_transactions_acquirer_code;
ALTER TABLE sp_v2_transactions DROP COLUMN IF EXISTS acquirer_code;
EOF

# Execute rollback
PGPASSWORD=*** psql -h settlepaisa-production.ccfgqux3aopk.ap-south-1.rds.amazonaws.com \
    -U postgres -d settlepaisa_v2 -f /tmp/rollback_035_036.sql

# Restart API
pm2 restart overview-api
```

### Git Rollback
```bash
git revert 6392e00
git push origin production
```

---

## Notes

1. ✅ Settlement Transactions report now fully functional
2. ✅ Production schema aligned with Staging 2
3. ✅ New columns have proper indexes for performance
4. ⚠️  **Data Population**: New columns are empty (null values)
   - New transactions will populate via V1→V2 mapping
   - Existing data can be backfilled if business requires it
5. 💡 **Future Work**: Consider backfilling acquirer_code and merchant_name for historical data

---

## Related Documentation

- `REPORTS_API_SSL_FIX_NOV3.md` - Reports API SSL fix (commit f618eb9)
- `PRODUCTION_DEPLOYMENT_NOV2_COMPLETE.md` - Settlement calculator fix
- `SSL_FIX_DEPLOYMENT_NOV2.md` - Overview-api SSL fix
- `SETTLEMENT_CALCULATOR_FIX_NOV2.md` - Detailed settlement fix explanation
- `TRANSACTIONS_SETTLEMENT_BATCHES_COMPLETE_SCHEMA.md` - Staging 2 schema reference

---

**Deployment completed by**: Claude Code
**Deployed at**: 2025-11-03 08:10 UTC
**Status**: ✅ **SUCCESS**
