# Financial Dashboard Expected Values

**Document Version**: 1.0
**Last Updated**: October 27, 2025
**Environment**: Production / Staging 2
**Purpose**: Define expected Financial dashboard metrics and troubleshooting guide

---

## Current Baseline Data (Oct 27, 2025)

After cleanup of duplicate settlement batch, **Oct 27, 2025** serves as our baseline:

### Settlement Summary

| Metric | Value | Notes |
|--------|-------|-------|
| **Settlement Batches** | 1 | Single batch for Oct 27 |
| **Total Transactions** | 18 | From settled sp_v2_transactions |
| **Batch Status** | PENDING_APPROVAL | Awaiting ops team approval |
| **Created At** | 11:36:13 IST | Oct 27, 2025 |

### Financial Metrics

| Metric | Value (₹) | Value (Paise) | % of GMV |
|--------|-----------|---------------|----------|
| **GMV (Gross Merchandise Value)** | ₹4,38,000 | 438000 | 100.00% |
| **Commission (MDR)** | ₹8,760 | 8760 | 2.00% |
| **GST on Commission** | ₹1,576.80 | 1577 | 0.36% |
| **Total Revenue** | ₹10,336.80 | 10337 | 2.36% |
| **Bank Charges** | ₹0 | 0 | 0.00% |
| **SettlePaisa Revenue** | ₹8,760 | 8760 | 2.00% |
| **Refund Deductions** | ₹0 | 0 | 0.00% |
| **Chargeback Deductions** | ₹0 | 0 | 0.00% |
| **Net Payable to Merchant** | ₹4,27,663.20 | 427663 | 97.64% |

### Settlement Status Breakdown

| Status | Count | Notes |
|--------|-------|-------|
| **Pending Approval** | 1 batch | Not yet approved by ops team |
| **Sent to Bank** | 0 | No bank transfers initiated |
| **Credited** | 0 | No bank transfers completed |

---

## Expected Financial Dashboard Values

When viewing Oct 27, 2025 data, the dashboard should show:

### Key Metrics

| Metric | Expected Value | Formula |
|--------|----------------|---------|
| **GMV** | ₹4,38,000 | SUM(gross_amount_paise) from settlement batches |
| **Total Revenue** | ₹10,336.80 | SUM(total_commission_paise + total_gst_paise) |
| **Net Payouts** | ₹4,27,663.20 | SUM(net_amount_paise) from settlement batches |
| **Settlement Batches** | 1 | COUNT(*) WHERE cycle_date = '2025-10-27' |
| **Transaction Count** | 18 | SUM(total_transactions) from batches |
| **Average Transaction Value** | ₹24,333.33 | GMV / Transaction Count |
| **MDR Rate** | 2.00% | (Commission / GMV) × 100 |
| **Net Rate** | 97.64% | (Net Payable / GMV) × 100 |

### Status Pipeline

| Pipeline Stage | Count | Value (₹) | Formula |
|----------------|-------|-----------|---------|
| **Pending Approval** | 1 batch | ₹4,38,000 | WHERE status = 'PENDING_APPROVAL' |
| **Approved** | 0 | ₹0 | WHERE status = 'APPROVED' |
| **Sent to Bank** | 0 | ₹0 | WHERE status = 'SENT_TO_BANK' |
| **Credited** | 0 | ₹0 | WHERE status = 'CREDITED' |

---

## Calculation Formulas

### Settlement Batch Calculations

#### 1. GMV (Gross Merchandise Value)
```
GMV = SUM(transaction amounts from sp_v2_transactions WHERE status = 'SETTLED')
    = 18 transactions × various amounts
    = ₹4,38,000
```

#### 2. Commission (MDR)
```
Commission = GMV × MDR_Rate
           = ₹4,38,000 × 2.00%
           = ₹8,760
```

#### 3. GST on Commission
```
GST = Commission × 18%
    = ₹8,760 × 18%
    = ₹1,576.80
```

#### 4. Net Payable
```
Net Payable = GMV - Commission - GST - Bank Charges - Refunds - Chargebacks
            = ₹4,38,000 - ₹8,760 - ₹1,576.80 - ₹0 - ₹0 - ₹0
            = ₹4,27,663.20
```

### From Database

```sql
-- Settlement batches for Oct 27
SELECT
  id,
  merchant_id,
  total_transactions,
  gross_amount_paise,
  total_commission_paise,
  total_gst_paise,
  net_amount_paise,
  status
FROM sp_v2_settlement_batches
WHERE DATE(cycle_date) = '2025-10-27';

-- Expected result:
-- id: 287c82b4-3791-4c6b-90fc-3203a8d38003
-- total_transactions: 18
-- gross_amount_paise: 438000
-- total_commission_paise: 8760
-- total_gst_paise: 1577
-- net_amount_paise: 427663
-- status: PENDING_APPROVAL
```

```sql
-- Settlement items for Oct 27
SELECT
  COUNT(*) as total_items,
  COUNT(DISTINCT transaction_id) as unique_txns,
  SUM(amount_paise) as total_amount
FROM sp_v2_settlement_items
WHERE settlement_batch_id IN (
  SELECT id FROM sp_v2_settlement_batches
  WHERE DATE(cycle_date) = '2025-10-27'
);

-- Expected result:
-- total_items: 18
-- unique_txns: 18
-- total_amount: 438000
```

---

## Troubleshooting Guide

### Issue 1: Total Amount Doubled (₹8.76L instead of ₹4.38L)

**Symptom**: Financial Dashboard shows ₹8,76,000 GMV instead of ₹4,38,000

**Root Cause**: Duplicate settlement batches - same transactions added to multiple batches

**Check**:
```sql
-- Find duplicate transactions in settlement items
SELECT
  transaction_id,
  COUNT(*) as count,
  array_agg(settlement_batch_id::text) as batch_ids
FROM sp_v2_settlement_items
WHERE settlement_batch_id IN (
  SELECT id FROM sp_v2_settlement_batches
  WHERE DATE(cycle_date) = '2025-10-27'
)
GROUP BY transaction_id
HAVING COUNT(*) > 1;
```

**Fix**:
1. Use `cleanup-duplicate-settlement-batch.cjs` script
2. Identify which batch to keep (usually the older one)
3. Delete duplicate batch and its items
4. Verify: Only 18 unique settlement items remain

**Files to Check**:
- `services/settlement-engine/` (settlement batch creation logic)
- Check for race conditions or missing duplicate checks

### Issue 2: Settlement Items Don't Match Settled Transactions

**Symptom**: Settlement items count ≠ sp_v2_transactions SETTLED count

**Root Cause**: Mismatch between settled transactions and settlement batch creation

**Check**:
```sql
-- Compare counts
SELECT
  (SELECT COUNT(*) FROM sp_v2_settlement_items
   WHERE settlement_batch_id IN (
     SELECT id FROM sp_v2_settlement_batches
     WHERE DATE(cycle_date) = '2025-10-27'
   )) as settlement_items,
  (SELECT COUNT(*) FROM sp_v2_transactions
   WHERE DATE(transaction_date) = '2025-10-27'
   AND status = 'SETTLED') as settled_txns;
```

**Expected**: Both should be 18

**Fix**:
- If settlement_items < settled_txns: Some settled transactions not added to batch
- If settlement_items > settled_txns: Duplicate items or transactions from other dates

### Issue 3: Multiple Batches for Same Date

**Symptom**: Multiple settlement batches with same cycle_date for same merchant

**Root Cause**: Settlement engine ran multiple times without duplicate check

**Check**:
```sql
SELECT
  merchant_id,
  DATE(cycle_date) as cycle_date,
  COUNT(*) as batch_count,
  array_agg(id::text) as batch_ids,
  array_agg(created_at) as created_times
FROM sp_v2_settlement_batches
WHERE DATE(cycle_date) = '2025-10-27'
GROUP BY merchant_id, DATE(cycle_date)
HAVING COUNT(*) > 1;
```

**Fix**:
- Delete duplicate batches using cleanup script
- Add duplicate prevention in settlement engine
- Add unique constraint: (merchant_id, cycle_date, status)

### Issue 4: Amount Mismatch Between Batch and Items

**Symptom**: Settlement batch gross_amount ≠ SUM(settlement items amounts)

**Root Cause**: Data integrity issue or calculation error

**Check**:
```sql
SELECT
  sb.id,
  sb.gross_amount_paise as batch_gross,
  SUM(si.amount_paise) as items_sum,
  sb.gross_amount_paise - SUM(si.amount_paise) as difference
FROM sp_v2_settlement_batches sb
LEFT JOIN sp_v2_settlement_items si ON si.settlement_batch_id = sb.id
WHERE DATE(sb.cycle_date) = '2025-10-27'
GROUP BY sb.id, sb.gross_amount_paise;
```

**Expected**: difference = 0

**Fix**: Investigate settlement engine calculation logic

### Issue 5: Zero Data on Financial Dashboard

**Symptom**: All financial metrics show 0 or "No data"

**Root Causes**:
1. No settlement batches created for the date
2. API not connected to correct database
3. Wrong date filter
4. Settlement engine not running

**Diagnostic Steps**:
1. Check if settlement batches exist: `SELECT * FROM sp_v2_settlement_batches WHERE DATE(cycle_date) = '2025-10-27'`
2. Check if transactions are SETTLED: `SELECT COUNT(*) FROM sp_v2_transactions WHERE status = 'SETTLED' AND DATE(transaction_date) = '2025-10-27'`
3. Verify settlement engine logs: `pm2 logs settlement-engine`
4. Check API connectivity: `curl http://localhost:5110/api/settlements?date=2025-10-27`

---

## Data Consistency Rules

### Critical Invariants

These must ALWAYS be true:

1. **No Duplicate Transactions in Items**
   ```sql
   -- This query should return 0 rows
   SELECT transaction_id, COUNT(*)
   FROM sp_v2_settlement_items
   WHERE settlement_batch_id IN (
     SELECT id FROM sp_v2_settlement_batches
     WHERE DATE(cycle_date) = '2025-10-27'
   )
   GROUP BY transaction_id
   HAVING COUNT(*) > 1;
   ```

2. **Settlement Items Match Batch Gross**
   ```sql
   -- difference should be 0 for all batches
   SELECT
     batch_id,
     batch_gross,
     items_sum,
     batch_gross - items_sum as difference
   FROM (
     SELECT
       sb.id as batch_id,
       sb.gross_amount_paise as batch_gross,
       SUM(si.amount_paise) as items_sum
     FROM sp_v2_settlement_batches sb
     LEFT JOIN sp_v2_settlement_items si ON si.settlement_batch_id = sb.id
     WHERE DATE(sb.cycle_date) = '2025-10-27'
     GROUP BY sb.id, sb.gross_amount_paise
   ) check_amounts
   WHERE batch_gross - items_sum != 0;
   ```

3. **One Batch Per Merchant Per Day**
   ```sql
   -- This query should return 0 rows
   SELECT merchant_id, DATE(cycle_date), COUNT(*)
   FROM sp_v2_settlement_batches
   WHERE DATE(cycle_date) = '2025-10-27'
   GROUP BY merchant_id, DATE(cycle_date)
   HAVING COUNT(*) > 1;
   ```

4. **Settlement Items Reference Valid Transactions**
   ```sql
   -- This query should return 0 rows (all items have matching txns)
   SELECT si.transaction_id
   FROM sp_v2_settlement_items si
   LEFT JOIN sp_v2_transactions t ON t.transaction_id = si.transaction_id
   WHERE si.settlement_batch_id IN (
     SELECT id FROM sp_v2_settlement_batches
     WHERE DATE(cycle_date) = '2025-10-27'
   )
   AND t.transaction_id IS NULL;
   ```

---

## Production Readiness Checklist

Before deploying to production, verify:

- [ ] Only valid settlement batches exist (no duplicates)
- [ ] Settlement items match settled transactions (count and amount)
- [ ] No duplicate transactions in settlement items
- [ ] Batch gross amounts match sum of items
- [ ] One batch per merchant per cycle date
- [ ] Settlement engine has duplicate prevention logic
- [ ] Database constraint on (merchant_id, cycle_date, status) exists
- [ ] All financial calculations are accurate (GMV, Commission, GST, Net)
- [ ] Settlement status pipeline is correct
- [ ] Financial Dashboard API returns correct data
- [ ] Documentation up to date with latest schema changes

---

## Quick Reference: Oct 27 Baseline

**Copy-paste for verification queries:**

```sql
-- Complete financial snapshot
SELECT
  COUNT(*) as batch_count,
  SUM(total_transactions) as total_txns,
  SUM(gross_amount_paise) as gmv,
  SUM(total_commission_paise) as commission,
  SUM(total_gst_paise) as gst,
  SUM(net_amount_paise) as net_payable
FROM sp_v2_settlement_batches
WHERE DATE(cycle_date) = '2025-10-27';

-- Expected result:
-- batch_count: 1
-- total_txns: 18
-- gmv: 438000
-- commission: 8760
-- gst: 1577
-- net_payable: 427663
```

```sql
-- Settlement items verification
SELECT
  COUNT(*) as total_items,
  COUNT(DISTINCT transaction_id) as unique_txns,
  SUM(amount_paise) as total_amount
FROM sp_v2_settlement_items si
WHERE settlement_batch_id IN (
  SELECT id FROM sp_v2_settlement_batches
  WHERE DATE(cycle_date) = '2025-10-27'
);

-- Expected result:
-- total_items: 18
-- unique_txns: 18
-- total_amount: 438000
```

---

## Alignment with Overview Dashboard

The Financial Dashboard and Overview Dashboard track different aspects but should align:

| Metric | Overview Dashboard | Financial Dashboard | Should Match? |
|--------|-------------------|---------------------|---------------|
| **Total Transactions** | 25 (all Oct 27) | 18 (settled only) | ❌ Different scope |
| **Settled Transactions** | 18 | 18 | ✅ Must match |
| **Settled Amount** | ₹4,38,000 | ₹4,38,000 (GMV) | ✅ Must match |
| **Settlement Batches** | N/A | 1 | N/A |
| **Unmatched Transactions** | 7 | N/A | N/A |

**Critical Alignment Check**:
```sql
-- This query verifies alignment
SELECT
  (SELECT COUNT(*) FILTER (WHERE status = 'SETTLED')
   FROM sp_v2_transactions
   WHERE DATE(transaction_date) = '2025-10-27') as overview_settled,
  (SELECT SUM(total_transactions)
   FROM sp_v2_settlement_batches
   WHERE DATE(cycle_date) = '2025-10-27') as financial_txns,
  (SELECT SUM(amount_paise) FILTER (WHERE status = 'SETTLED')
   FROM sp_v2_transactions
   WHERE DATE(transaction_date) = '2025-10-27') as overview_amount,
  (SELECT SUM(gross_amount_paise)
   FROM sp_v2_settlement_batches
   WHERE DATE(cycle_date) = '2025-10-27') as financial_gmv;

-- Expected: overview_settled = financial_txns = 18
--           overview_amount = financial_gmv = 438000
```

---

**Document Maintainer**: Ops Dashboard Team
**Last Verified**: October 27, 2025
**Next Review**: When schema or settlement logic changes occur
