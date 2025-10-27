# Overview Dashboard Expected Values

**Document Version**: 1.0
**Last Updated**: October 27, 2025
**Environment**: Production / Staging 2
**Purpose**: Define expected Overview dashboard metrics and troubleshooting guide

---

## Current Baseline Data (Oct 27, 2025)

After cleanup of old test data, **Oct 27, 2025** serves as our baseline:

### Transaction Summary

| Metric | Value | Notes |
|--------|-------|-------|
| **Total Transactions** | 25 | All transactions for Oct 27 |
| **Total Amount** | ₹6,44,500 (644500 paise) | Gross transaction value |
| **SETTLED Status** | 18 transactions | Reconciled and settled |
| **UNMATCHED Status** | 7 transactions | Not yet matched with bank |
| **SUCCESS Status** | 0 | (if any) Successful but not reconciled |
| **PENDING Status** | 0 | (if any) Awaiting processing |

### Bank Statement Summary

| Metric | Value | Notes |
|--------|-------|-------|
| **Total Bank Records** | 18 | Manual upload from bank statements |
| **Total Bank Amount** | ₹4,38,000 (438000 paise) | Credit entries |
| **Source Type** | MANUAL_UPLOAD | File upload via Recon Workspace |

### Settlement Summary

| Metric | Value | Notes |
|--------|-------|-------|
| **Settlement Batches** | 2 | Created for SETTLED transactions |
| **Total Settlement Amount** | ₹8,76,000 (876000 paise) | Across both batches |
| **Settlement Items** | 36 | Individual transactions in batches |

---

## Expected Overview Dashboard Values

When viewing Oct 27, 2025 data, the dashboard should show:

### Pipeline Metrics

| Pipeline Stage | Count | Formula / Logic |
|----------------|-------|-----------------|
| **Captured** | 25 | All transactions (regardless of status) |
| **In Settlement** | 18 | Transactions with status = 'SETTLED' or 'RECONCILED' |
| **Sent to Bank** | 0 | Batches with bank_transfer initiated |
| **Credited** | 0 | Batches with bank_transfer completed |
| **Unsettled** | 7 | Transactions with status = 'PENDING' or 'SUCCESS' or 'UNMATCHED' |

**Critical Rule**: `Captured = In Settlement + Unsettled` (must balance)

### Reconciliation Metrics

| Metric | Value | Formula |
|--------|-------|---------|
| **By Source - Manual** | 18 | `COUNT(*) WHERE source_type = 'MANUAL_UPLOAD'` |
| **By Source - Connector** | 7 | `COUNT(*) WHERE source_type != 'MANUAL_UPLOAD'` |
| **Matched** | 18 | `COUNT(*) WHERE status IN ('RECONCILED', 'SETTLED')` |
| **Unmatched** | 7 | `COUNT(*) WHERE status IN ('PENDING', 'SUCCESS', 'UNMATCHED')` |
| **Exceptions** | 0 | `COUNT(*) WHERE status = 'EXCEPTION'` |
| **Match Rate** | 72% | `(Matched / Captured) * 100` = (18 / 25) * 100 |

### Financial Metrics

| Metric | Value (₹) | Value (Paise) | Calculation |
|--------|-----------|---------------|-------------|
| **Gross Amount** | ₹6,44,500 | 644500 | `SUM(amount_paise)` from all transactions |
| **Reconciled Amount** | ₹4,38,000 | 438000 | `SUM(amount_paise)` from SETTLED transactions |
| **Unreconciled Amount** | ₹2,06,500 | 206500 | Gross - Reconciled |

---

## Calculation Formulas

### Key Performance Indicators (KPIs)

#### 1. Match Rate
```
Match Rate (%) = (Matched Transactions / Total Transactions) * 100
                = (18 / 25) * 100
                = 72%
```

#### 2. Settlement Rate
```
Settlement Rate (%) = (In Settlement / Captured) * 100
                    = (18 / 25) * 100
                    = 72%
```

#### 3. Exception Rate
```
Exception Rate (%) = (Exceptions / Total Transactions) * 100
                   = (0 / 25) * 100
                   = 0%
```

### Pipeline Stage Calculations

**From Database**:
```sql
-- Captured (all transactions)
SELECT COUNT(*) as captured
FROM sp_v2_transactions
WHERE DATE(transaction_date) = '2025-10-27';

-- In Settlement (reconciled/settled)
SELECT COUNT(*) as in_settlement
FROM sp_v2_transactions
WHERE DATE(transaction_date) = '2025-10-27'
AND status IN ('RECONCILED', 'SETTLED');

-- Unsettled (pending/unmatched)
SELECT COUNT(*) as unsettled
FROM sp_v2_transactions
WHERE DATE(transaction_date) = '2025-10-27'
AND status IN ('PENDING', 'SUCCESS', 'UNMATCHED');
```

### By Source Breakdown

```sql
-- Manual Upload transactions
SELECT COUNT(*) as manual_count, SUM(amount_paise) as manual_amount
FROM sp_v2_transactions
WHERE DATE(transaction_date) = '2025-10-27'
AND source_type = 'MANUAL_UPLOAD';

-- Connector/API transactions
SELECT COUNT(*) as connector_count, SUM(amount_paise) as connector_amount
FROM sp_v2_transactions
WHERE DATE(transaction_date) = '2025-10-27'
AND source_type != 'MANUAL_UPLOAD';
```

---

## Troubleshooting Guide

### Issue 1: Total Count Mismatch

**Symptom**: Dashboard shows different total than expected (e.g., 75 instead of 25)

**Root Cause**: Multiple test dates in database, API defaulting to wide date range

**Check**:
```sql
SELECT DATE(transaction_date) as txn_date, COUNT(*) as count
FROM sp_v2_transactions
GROUP BY DATE(transaction_date)
ORDER BY txn_date DESC;
```

**Fix**:
1. Clean up old test data using `cleanup-old-test-data-staging2.cjs`
2. Verify API defaults to today (`WHERE DATE(transaction_date) = CURRENT_DATE`)
3. Check frontend date picker defaults to today

**Files to Check**:
- `services/overview-api/overview-v2.js` (line 105)
- `src/pages/ops/Overview.tsx` (lines 18-22)

### Issue 2: Pipeline Doesn't Balance

**Symptom**: `Captured ≠ In Settlement + Unsettled`

**Root Cause**: Status values inconsistency or missing transactions

**Check**:
```sql
SELECT status, COUNT(*) as count
FROM sp_v2_transactions
WHERE DATE(transaction_date) = '2025-10-27'
GROUP BY status;
```

**Expected Statuses**: SETTLED, RECONCILED, UNMATCHED, PENDING, SUCCESS, EXCEPTION

**Fix**:
- Ensure all transactions have valid status
- Check if any transactions have unexpected status values
- Verify pipeline calculation logic includes all status mappings

### Issue 3: Match Rate Incorrect

**Symptom**: Match rate shows wrong percentage

**Root Cause**: Wrong status used for "matched" calculation

**Correct Formula**:
```javascript
const matched = transactions.filter(t =>
  t.status === 'RECONCILED' || t.status === 'SETTLED'
).length;
const matchRate = (matched / totalTransactions) * 100;
```

**Check Database**:
```sql
SELECT
  COUNT(*) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')) as matched,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')) / COUNT(*), 2) as match_rate_pct
FROM sp_v2_transactions
WHERE DATE(transaction_date) = '2025-10-27';
```

### Issue 4: Zero Data on Dashboard

**Symptom**: All KPIs show 0 or "No data"

**Root Causes**:
1. API not connected to database
2. Wrong date filter (future date)
3. Database connection credentials wrong
4. Service not running

**Diagnostic Steps**:
1. Check API is running: `curl http://localhost:5108/api/overview`
2. Check database connectivity: `psql -h [host] -U postgres -d settlepaisa_v2`
3. Verify date filter: Check browser DevTools → Network → API call params
4. Check logs: `pm2 logs overview-api`

### Issue 5: Settlement Batch Amount Mismatch

**Symptom**: Settlement batch total ≠ sum of SETTLED transaction amounts

**Root Cause**: Settlement items not syncing with transactions

**Check**:
```sql
SELECT
  sb.id as batch_id,
  sb.gross_amount_paise as batch_amount,
  SUM(si.amount_paise) as items_amount,
  sb.gross_amount_paise - SUM(si.amount_paise) as difference
FROM sp_v2_settlement_batches sb
LEFT JOIN sp_v2_settlement_items si ON si.settlement_batch_id = sb.id
WHERE DATE(sb.cycle_date) = '2025-10-27'
GROUP BY sb.id;
```

**Fix**: Re-run settlement batch creation or check settlement engine logic

---

## Date Filtering Behavior

### Default Behavior (After Fix)

| Component | Default Filter | Logic |
|-----------|----------------|-------|
| **Backend API** | Today only | `WHERE DATE(transaction_date) = CURRENT_DATE` |
| **Frontend** | Today only | `from: today, to: today` |
| **User Selection** | Custom range | Uses DATE() function for accurate comparison |

### API Query Parameters

**Example API Call**:
```
GET /api/overview?from=2025-10-27&to=2025-10-27
```

**Query Logic**:
```sql
WHERE DATE(transaction_date) >= '2025-10-27'
  AND DATE(transaction_date) <= '2025-10-27'
```

---

## Production Readiness Checklist

Before deploying to production, verify:

- [ ] Only current/valid date data exists in database
- [ ] API defaults to `CURRENT_DATE` (not 30-day range)
- [ ] Frontend defaults to today (not last 7 days)
- [ ] All pipeline metrics balance (Captured = In Settlement + Unsettled)
- [ ] Match rate calculation uses correct statuses (RECONCILED, SETTLED)
- [ ] Settlement batches link correctly to transactions
- [ ] Date filters use `DATE()` function for accurate comparison
- [ ] No foreign key constraint violations during data cleanup
- [ ] Documentation up to date with latest schema/logic changes

---

## Quick Reference: Oct 27 Baseline

**Copy-paste for verification queries:**

```sql
-- Current data snapshot
SELECT
  COUNT(*) as total_txns,
  SUM(amount_paise) as total_amount,
  COUNT(*) FILTER (WHERE status = 'SETTLED') as settled_count,
  COUNT(*) FILTER (WHERE status = 'UNMATCHED') as unmatched_count
FROM sp_v2_transactions
WHERE DATE(transaction_date) = '2025-10-27';

-- Expected result:
-- total_txns: 25
-- total_amount: 644500
-- settled_count: 18
-- unmatched_count: 7
```

---

**Document Maintainer**: Ops Dashboard Team
**Last Verified**: October 27, 2025
**Next Review**: When schema or logic changes occur
