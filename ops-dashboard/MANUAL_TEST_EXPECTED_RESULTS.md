# Manual Test - Expected Results Quick Reference

**Date:** October 28, 2025
**Test Files:** test-manual-pg-v1-oct28.csv + test-manual-hdfc-bank-v1-oct28.csv

---

## 📊 Expected Numbers - At a Glance

### Financial Summary
```
┌────────────────────────────────┬─────────────┐
│ Metric                         │ Value       │
├────────────────────────────────┼─────────────┤
│ Total Transactions             │ 10          │
│ Gross GMV                      │ ₹2,20,000   │
│ Commission (2% MDR)            │ ₹4,400      │
│ GST (18% on commission)        │ ₹792        │
│ MDR Collected (Comm + GST)     │ ₹5,192      │
│ Bank Charges                   │ ₹0          │
│ SettlePaisa Revenue            │ ₹4,400      │
│ Net Payout to Merchant         │ ₹2,14,808   │
│ Gross Margin                   │ 2.36%       │
│ Reconciliation Rate            │ 100%        │
└────────────────────────────────┴─────────────┘
```

### Payment Mode Distribution
```
┌──────────────┬───────┬───────────┬──────────┐
│ Mode         │ Count │ Amount    │ % of GMV │
├──────────────┼───────┼───────────┼──────────┤
│ UPI          │   5   │ ₹85,000   │ 38.6%    │
│ NEFT         │   2   │ ₹65,000   │ 29.5%    │
│ CARD         │   2   │ ₹43,000   │ 19.5%    │
│ NETBANKING   │   1   │ ₹27,000   │ 12.3%    │
└──────────────┴───────┴───────────┴──────────┘
```

---

## ✅ Database Verification Queries

### Quick Check #1: Upload Successful?
```sql
SELECT COUNT(*) FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001' AND DATE(transaction_date) = '2025-10-28';
```
**Expected:** 10

### Quick Check #2: All Reconciled?
```sql
SELECT COUNT(*) FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
  AND DATE(transaction_date) = '2025-10-28'
  AND status = 'RECONCILED';
```
**Expected:** 10

### Quick Check #3: Settlement Created?
```sql
SELECT
  gross_amount_paise / 100.0 as gross,
  net_amount_paise / 100.0 as net,
  status
FROM sp_v2_settlement_batches
WHERE merchant_id = 'MERCH001' AND cycle_date = '2025-10-28';
```
**Expected:** 1 row with gross=220000, net=214808, status=CALCULATED

### Quick Check #4: Financial Dashboard Data?
```bash
curl "http://localhost:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28" | jq '.data.gmv.rupees'
```
**Expected:** 220000

---

## 🔍 Per-Transaction Expected Results

| TXN ID | Gross | Comm | GST | Net | Status |
|--------|-------|------|-----|-----|--------|
| TXN20251028001 | ₹10,000 | ₹200 | ₹36 | ₹9,764 | SETTLED |
| TXN20251028002 | ₹25,000 | ₹500 | ₹90 | ₹24,410 | SETTLED |
| TXN20251028003 | ₹15,000 | ₹300 | ₹54 | ₹14,646 | SETTLED |
| TXN20251028004 | ₹35,000 | ₹700 | ₹126 | ₹34,174 | SETTLED |
| TXN20251028005 | ₹20,000 | ₹400 | ₹72 | ₹19,528 | SETTLED |
| TXN20251028006 | ₹40,000 | ₹800 | ₹144 | ₹39,056 | SETTLED |
| TXN20251028007 | ₹18,000 | ₹360 | ₹65 | ₹17,575 | SETTLED |
| TXN20251028008 | ₹28,000 | ₹560 | ₹101 | ₹27,339 | SETTLED |
| TXN20251028009 | ₹12,000 | ₹240 | ₹43 | ₹11,717 | SETTLED |
| TXN20251028010 | ₹17,000 | ₹340 | ₹61 | ₹16,599 | SETTLED |

---

## 🎯 Pass/Fail Criteria

### Must Pass (Critical)
- [ ] All 10 transactions uploaded (status = PENDING)
- [ ] All 10 transactions reconciled (status = RECONCILED)
- [ ] 1 settlement batch created
- [ ] All 10 transactions settled (status = SETTLED)
- [ ] Financial dashboard GMV = ₹2.20 L

### Should Pass (Important)
- [ ] Bank fees calculated (all ₹0)
- [ ] Commission = ₹4,400
- [ ] GST = ₹792
- [ ] Net payout = ₹2,14,808
- [ ] Gross margin = 2.36%

### Nice to Have (Optional)
- [ ] Reports show correct data
- [ ] Settlement items created (10 rows)
- [ ] Revenue split correctly calculated

---

## 🚨 Red Flags - Stop Testing If You See:

### Upload Phase
- ❌ Records inserted != 10
- ❌ HTTP 500 errors
- ❌ "Duplicate transaction" errors
- ❌ Database connection errors

### Reconciliation Phase
- ❌ Matched count != 10
- ❌ Exceptions > 0
- ❌ Job status = failed
- ❌ status still PENDING after 2 minutes

### Settlement Phase
- ❌ No settlement batch created after 5 minutes
- ❌ Batch totals wildly off (>5% variance)
- ❌ status still RECONCILED after 10 minutes
- ❌ Multiple batches for same merchant + date

### Dashboard Phase
- ❌ GMV shows ₹0
- ❌ All metrics show ₹0
- ❌ HTTP errors when loading dashboard
- ❌ Infinite loading spinners

---

## 💡 Formula Reference

### Commission Calculation
```
Commission = Amount × MDR Rate
          = ₹10,000 × 2%
          = ₹200
```

### GST Calculation
```
GST = Commission × GST Rate
    = ₹200 × 18%
    = ₹36
```

### Net Payout Calculation
```
Net Payout = Gross - Commission - GST - Reserve - Bank Charges - Refunds - Chargebacks
           = ₹10,000 - ₹200 - ₹36 - ₹0 - ₹0 - ₹0 - ₹0
           = ₹9,764
```

### Gross Margin Calculation
```
Gross Margin = ((Commission + GST) / GMV) × 100
             = ((₹4,400 + ₹792) / ₹2,20,000) × 100
             = (₹5,192 / ₹2,20,000) × 100
             = 2.36%
```

### SettlePaisa Revenue
```
Revenue = (Commission + GST) - Bank Charges
        = ₹5,192 - ₹0
        = ₹5,192

OR (simplified when no bank charges):
Revenue = Commission
        = ₹4,400
```

---

## 📱 Quick Commands Reference

### Upload PG File
```bash
curl -X POST http://localhost:5107/api/upload \
  -F "file=@test-manual-pg-v1-oct28.csv" \
  -F "type=pg" \
  -F "merchant_id=MERCH001" \
  -F "date=2025-10-28"
```

### Upload Bank File
```bash
curl -X POST http://localhost:5107/api/upload \
  -F "file=@test-manual-hdfc-bank-v1-oct28.csv" \
  -F "type=bank" \
  -F "merchant_id=MERCH001" \
  -F "date=2025-10-28" \
  -F "bank=HDFC BANK"
```

### Run Reconciliation
```bash
curl -X POST http://localhost:5103/recon/run \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-10-28","merchantId":"MERCH001"}'
```

### Check Financial Dashboard
```bash
curl "http://localhost:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28" | jq
```

### Quick Count Check
```bash
psql -d settlepaisa_v2 -c "SELECT COUNT(*), status FROM sp_v2_transactions WHERE merchant_id = 'MERCH001' AND DATE(transaction_date) = '2025-10-28' GROUP BY status;"
```

---

## 🎬 Test Execution Summary

```
1. Upload files → 10 + 10 records ✅
2. Run recon → 10 matched ✅
3. Wait 5 min → Settlement created ✅
4. Check dashboard → All metrics correct ✅
5. Check reports → Data visible ✅
```

**Total Time:** ~15 minutes
**Success Rate Expected:** 100%
**Critical Failures Allowed:** 0

---

**Generated:** October 28, 2025
**For:** Manual E2E Testing
**Status:** Ready to Execute
