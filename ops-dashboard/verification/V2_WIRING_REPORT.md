# V2 Database Wiring Verification Report
    
**Generated:** 4/10/2025, 12:32:11 pm (Asia/Kolkata)  
**Merchant ID:** 11111111-1111-1111-1111-111111111111  
**API Base:** http://localhost:8080  
**Database:** postgresql://***:***@localhost:5433/settlepaisa_v2

## Summary

**Total Checks:** 12  
**Passed:** 12  
**Failed:** 0  
**Skipped:** 0

✅ **ALL CHECKS PASSED**

## Detailed Results

| Check | Status | Expected | Actual | Notes |
|-------|--------|----------|--------|--------|
| API Health Check | PASS | - | {"status":"OK","timestamp":"2025-10-04T07:02:11.95 | - |\n| Current Balance Accuracy | PASS | "17199418 ±5000 paise" | "17199418 paise" | Difference: 0 paise |\n| Last Settlement Amount | PASS | "4929200 paise" | "4929200 paise" | - |\n| Last Settlement Status | PASS | "SETTLED" | "SETTLED" | - |\n| Settlement Schedule Config | PASS | "T+1, 840min" | "T+1, 840min" | - |\n| Settlement History Order | PASS | "DESC by createdAt" | "Correct order" | - |\n| Completed Settlement UTR | PASS | "Non-empty UTR for completed" | "No completed settlement" | - |\n| Timeline Events Exist | PASS | "≥1 event" | "3 events" | - |\n| Timeline Last Event Detail | PASS | "Has detail or meta" | "Present" | - |\n| Insights Trend Data | PASS | "Array with length > 0" | "Array with length 30" | - |\n| Status Vocabulary | PASS | "Only valid V2 statuses" | "All valid" | - |\n| No NaN Values | PASS | "All numeric fields are numbers" | "All valid numbers" | - |

## Database Truth (Raw)

```json
{
  "unsettled_net_paise": 17199418,
  "last_completed": {
  "id": "60d5e9c6-02f5-4a51-8ee0-d5e6d8ada61e",
  "net_amount_paise": "4929200",
  "settled_at": "2025-10-03T22:11:26.547Z"
},
  "settlement_config": {
  "t_plus_days": 1,
  "cutoff_minutes_ist": "840"
},
  "one_processing_id": "fe7066ca-5075-4698-8579-aaf79bcca44e",
  "completed_with_utr": {
  "id": "60d5e9c6-02f5-4a51-8ee0-d5e6d8ada61e",
  "utr": null,
  "bank_ref": "INST1759556486.547853"
}
}
```

## API Responses (Sample)

### Dashboard Summary
```json
{
  "currentBalance": 17199418,
  "nextSettlementDue": "2025-10-05T08:30:00.000Z",
  "nextSettlementAmount": 17199418,
  "lastSettlement": {
    "date": "2025-10-03T22:11:26.547Z",
    "amount": 4929200,
    "status": "SETTLED"
  },
  "awaitingBankFile": false,
  "pendingHolds": 4061527,
  "unreconciled": 0
}
```

### Settlements (First 2)
```json
[
  {
    "id": "60d5e9c6-02f5-4a51-8ee0-d5e6d8ada61e",
    "type": "regular",
    "amount": 4929200,
    "fees": 60000,
    "tax": 10800,
    "utr": "INST1759556486.547853",
    "rrn": "-",
    "status": "settled",
    "createdAt": "2025-10-03T22:11:26.547Z",
    "settledAt": "2025-10-03T22:11:26.547Z",
    "bankAccount": "HDFC Bank ****3456",
    "transactionCount": 19
  },
  {
    "id": "fe7066ca-5075-4698-8579-aaf79bcca44e",
    "type": "regular",
    "amount": 5738186,
    "fees": 123548,
    "tax": 22239,
    "utr": "-",
    "rrn": "-",
    "status": "processing",
    "createdAt": "2025-10-03T20:30:00.000Z",
    "settledAt": null,
    "bankAccount": "HDFC Bank ****3456",
    "transactionCount": 22
  }
]
```

### Schedule
```json
{
  "tPlusDays": 1,
  "cutoffMinutesIST": 840,
  "effectiveFrom": "2025-10-04",
  "lastChangedAt": "2025-10-04T00:11:26.542Z"
}
```

## ✅ All checks passed - V2 database is properly wired!

## Runbook

### How to re-run verification:
```bash
npm run verify:v2
```

### How to update config:
```bash
cp verification/verify.config.json.sample verification/verify.config.json
# Edit PG_URL, API_BASE, MERCHANT_ID as needed
```

### Where to read results:
- This file: `verification/V2_WIRING_REPORT.md`
- Console output during `npm run verify:v2`
