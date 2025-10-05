# V2 Functional Audit Report

**Generated:** 04/10/2025, 01:05:49 pm (Asia/Kolkata)  
**Merchant ID:** 11111111-1111-1111-1111-111111111111  
**API Base:** http://localhost:8080  
**Database:** postgresql://***:***@localhost:5433/settlepaisa_v2

## Summary

**Total Checks:** 14  
**Passed:** 7  
**Failed:** 7  
**Skipped:** 0

❌ **FUNCTIONAL AUDIT FAILED**

## Detailed Results

| Check | Status | Notes |
|-------|--------|-------|
| API Health | PASS | 200 OK: {"status":"OK","timestamp":"2025-10-04T07:35:49.488Z"} |\n| Tiles Math (currentBalance) | PASS | DB 17199418 ↔ API 17199418 (diff: 0) |\n| Last Settlement Amount | PASS | DB 4929200 vs API 4929200 |\n| Last Settlement Status | PASS | Status: SETTLED |\n| Schedule PUT + DB persist | FAIL | HTTP 400: Bad Request for http://localhost:8080/merchant/settlement/schedule |\n| History Parity & Order | FAIL | column b.settlement_type does not exist |\n| Export Parity | PASS | CSV rows=31 vs API rows=31 |\n| Export Money Sums | PASS | CSV sum=123336823 vs API sum=123336823 |\n| Timeline Truth | FAIL | column "settlement_batch_id" does not exist |\n| Completed Row UTR | FAIL | column "settled_at" does not exist |\n| Break-up Math | FAIL | column b.fees_paise does not exist |\n| Filters/Search/Pagination | FAIL | Instant filter failed |\n| Pagination Functionality | PASS | Pagination works correctly |\n| Instant Settlement Flow | FAIL | HTTP 400: Bad Request for http://localhost:8080/v1/merchant/settlements/instant |


## FIXME Section

The following functional tests failed:


### Schedule PUT + DB persist
**Issue:** HTTP 400: Bad Request for http://localhost:8080/merchant/settlement/schedule
**Expected:** null
**Actual:** null
**Likely Fix:** Review the corresponding API endpoint implementation
\n
### History Parity & Order
**Issue:** column b.settlement_type does not exist
**Expected:** null
**Actual:** null
**Likely Fix:** Review the corresponding API endpoint implementation
\n
### Timeline Truth
**Issue:** column "settlement_batch_id" does not exist
**Expected:** null
**Actual:** null
**Likely Fix:** Review the corresponding API endpoint implementation
\n
### Completed Row UTR
**Issue:** column "settled_at" does not exist
**Expected:** null
**Actual:** null
**Likely Fix:** Review the corresponding API endpoint implementation
\n
### Break-up Math
**Issue:** column b.fees_paise does not exist
**Expected:** null
**Actual:** null
**Likely Fix:** Review the corresponding API endpoint implementation
\n
### Filters/Search/Pagination
**Issue:** Instant filter failed
**Expected:** All instant
**Actual:** Mixed types
**Likely Fix:** Review the corresponding API endpoint implementation
\n
### Instant Settlement Flow
**Issue:** HTTP 400: Bad Request for http://localhost:8080/v1/merchant/settlements/instant
**Expected:** null
**Actual:** null
**Likely Fix:** Review the corresponding API endpoint implementation



## Runbook

### Re-run audit:
```bash
cp verification/verify.config.json.sample verification/verify.config.json
# fill PG_URL, API_BASE, MERCHANT_ID
npm run audit:v2
```

### Read results:
```bash
open verification/V2_FUNCTIONAL_AUDIT.md
```

### Configuration:
- Config: `verification/verify.config.json`
- Artifacts: `undefined/`
- Tolerance: ±5000 paise
