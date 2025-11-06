# Test Files Package - November 6, 2025

Complete reconciliation test package with bank fee calculation support for all banks.

## Quick Start

### Files in This Folder

1. **test-pg-180-records-nov6.csv** - 180 PG transactions (UTR001-UTR180)
2. **test-hdfc-60-records-nov6.csv** - 60 HDFC bank statements (UTR001-UTR060)
3. **test-bob-60-records-nov6.csv** - 60 BOB bank statements (UTR061-UTR120)
4. **test-axis-60-records-nov6.csv** - 60 AXIS bank statements (UTR121-UTR180) ✨ **WITH BANK FEES**
5. **RECONCILIATION_RESULTS.md** - Complete documentation and expected results

## Upload Order

```
1. Upload PG file (180 records)
2. Upload HDFC file (60 records)
3. Upload BOB file (60 records)
4. Upload AXIS file (60 records)
5. Run reconciliation
6. Check Financial Dashboard
```

## Expected Results

| Metric | Value |
|--------|-------|
| Total PG Transactions | 180 |
| Total Bank Statements | 180 |
| Expected Matches | 180 (100%) |
| Expected Exceptions | 0 |
| Bank Fees Calculable | ✅ 180 (100%) |

## What's New

### AXIS Bank Fee Support ✨

**Before**: AXIS bank fees showed as ₹0 (not calculable)

**After**: AXIS bank fees now calculated correctly with proper gross and net amounts

**Change**:
- File structure: `GrossAmount~NetAmount~PRNNo~Date` (4 columns)
- Database config: Separate mappings for gross and net amounts
- Result: All 180 transactions now show bank fees

## File Details

### PG File Format (CSV)
```csv
transaction_id,client_code,payee_amount,paid_amount,payment_mode,trans_complete_date,status,utr,pg_name
TXN_001,MERCH001,985.00,1000.00,UPI,2025-11-06 09:00:00,SUCCESS,UTR001,RAZORPAY
```

### HDFC File Format (CSV)
```csv
MERCHANT_TRACKID,DOMESTIC AMT,Net Amount,SETTLE DATE,TRANS DATE
UTR001,1000.00,985.00,06-11-2025,06-11-2025
```

### BOB File Format (CSV)
```csv
Settlement Amount,Net Amount,Merchant Track ID,Payment Date,Transaction Date,Onus Indicator
30500.00,30042.50,UTR061,06/11/2025,06/11/2025,Y
```

### AXIS File Format (Tilde-delimited)
```csv
GrossAmount~NetAmount~PRNNo~Date
60500.00~59592.50~UTR121~06/11/2025
```

## Financial Metrics

### Expected Bank Fees

- **HDFC**: ~₹14,550 (60 transactions)
- **BOB**: ~₹43,650 (60 transactions)
- **AXIS**: ~₹85,500 (60 transactions) ✨ **NOW CALCULABLE**
- **Total**: ~₹1,43,700 (180 transactions)

### Fee Rate Distribution

| Payment Mode | Fee Rate | Distribution |
|--------------|----------|--------------|
| UPI | 1.5% | 60% (108 txns) |
| NETBANKING | 1.8% | 20% (36 txns) |
| CARD | 2.0% | 20% (36 txns) |

## Troubleshooting

If AXIS bank fees don't appear:

1. Check V1 configuration in database
2. Verify test file has 4 columns (GrossAmount~NetAmount~PRNNo~Date)
3. Check database values after upload
4. See RECONCILIATION_RESULTS.md for detailed troubleshooting

## Documentation

For complete details, testing workflow, verification queries, and troubleshooting, see:
**RECONCILIATION_RESULTS.md**

## Summary

✅ All files ready for testing
✅ All banks support bank fee calculation
✅ 100% match expected
✅ Complete financial metrics available
✅ AXIS BANK issue resolved

**Total Impact**: Increased bank fee visibility from 66.7% to 100% of transactions.
