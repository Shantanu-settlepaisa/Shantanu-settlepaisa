# E2E Test Plan - Execution Summary

## Phase 0: Database Cleanup ✅ COMPLETED

**Status:** All transactional data deleted successfully
- Cleaned tables: transactions, bank_statements, recon_matches, settlements, etc.
- Verified: All counts = 0
- Financial Dashboard: ₹0.00 GMV, ₹0.00 MDR, ₹0.00 Revenue

## Phase 1: Test Data Created ✅ COMPLETED

### File 1: PG Transactions (V1 Format)
**Filename:** `test-pg-transactions-2025-10-25.csv`
- **Transactions:** 50
- **Date:** 2025-10-25
- **Merchant:** MERCH001
- **Total GMV:** ₹13,73,000.00 (₹13.73 L)
- **Payment Methods:**
  - UPI: 30 transactions
  - CARD: 15 transactions
  - Net Banking: 5 transactions
- **Format:** V1 (transaction id, client code, payee amount, paid amount, payment mode, trans complete date, status)

### File 2: HDFC Bank Statements
**Filename:** `test-hdfc-statements-2025-10-25.csv`
- **Entries:** 35 (70% of PG transactions)
- **Total Amount:** ₹9,80,500.00
- **Matching TXNs:** TXN001-TXN039 (skipping TXN004, TXN013, TXN024, TXN035, TXN040-050)
- **Format:** HDFC V1 (Date, UTR, Transaction ID, Amount, Status, Narration)

### File 3: Axis Bank Statements
**Filename:** `test-axis-statements-2025-10-25.csv`
- **Entries:** 10 (20% of PG transactions)
- **Total Amount:** ₹3,01,000.00
- **Matching TXNs:** TXN004, TXN013, TXN024, TXN035, TXN040-TXN045
- **Format:** Axis V1 (Date, Ref No, Transaction Ref, Debit, Credit, Status)

### File 4: ICICI Bank Statements
**Filename:** `test-icici-statements-2025-10-25.csv`
- **Entries:** 5 (10% of PG transactions)
- **Total Amount:** ₹29,500.00
- **Matching TXNs:** TXN046, TXN047, TXN048, TXN049, TXN050
- **Format:** ICICI V1 (Transaction Date, Value Date, Cheque Number, Transaction Remarks, Withdrawal Amount, Deposit Amount, Balance)

## Expected Reconciliation Results

### 100% Match Rate
- **Total PG Transactions:** 50
- **Total Bank Entries:** 50 (35 HDFC + 10 Axis + 5 ICICI)
- **Expected Matched:** 50 (100%)
- **Expected Unmatched PG:** 0
- **Expected Unmatched Bank:** 0
- **Expected Exceptions:** 0

### Bank-wise Breakdown
| Bank | Entries | Amount | % of Total |
|------|---------|--------|------------|
| HDFC | 35 | ₹9,80,500 | 70% |
| Axis | 10 | ₹3,01,000 | 20% |
| ICICI | 5 | ₹29,500 | 10% |
| **Total** | **50** | **₹13,11,000** | **100%** |

## Expected Settlement Calculation

### Batch Details
- **Merchant:** MERCH001
- **Cycle Date:** 2025-10-25
- **Total Transactions:** 50
- **Gross Amount:** ₹13,73,000.00

### Fee Calculation
- **MDR Rate:** 2%
- **MDR Amount:** ₹27,460.00
- **GST on MDR:** ₹4,942.80 (18%)
- **Reserve:** ₹0 (if no reserve configured)
- **Bank Charges:** ₹0 (or calculated if tracking enabled)

### Final Settlement
- **Total Deductions:** ₹32,402.80
- **Net Amount:** ₹13,40,597.20

### Settlement Status
- **Expected Status:** APPROVED (if < ₹10k auto-approval threshold applies to net amount > threshold, will be PENDING)
- **Settlement Type:** AUTOMATIC (T+1 standard cycle)

## Expected Dashboard Updates

### Financial Dashboard (Last 30 Days)
**Before (Baseline):**
- GMV: ₹0.00
- MDR: ₹0.00
- Revenue: ₹0.00
- Net Settled: ₹0.00

**After Upload:**
- GMV: ₹13.73 L (+₹13.73 L)
- MDR Collected: ₹27.46 K (+₹27.46 K)
- Revenue: ₹27.46 K (+₹27.46 K) [if bank charges = 0]
- Net Settled: ₹13.41 L (+₹13.41 L)
- Transaction Count: 50 (+50)
- Batch Count: 1 (+1)

### Overview Dashboard
- **Captured:** 50 (+50)
- **In Settlement:** 1 batch (+1)
- **Reconciliation Matched:** 50 (+50)
- **Reconciliation Rate:** 100%

## Expected Report Data

### 1. Settlement Summary Report
- 1 row for MERCH001, cycle date 2025-10-25
- Columns: gross_amount, total_commission, total_gst, net_amount, bank_charges, revenue, etc.

### 2. Settlement Transactions Report
- 50 rows (one per transaction)
- 16 columns including: transaction_id, amount, mdr, gst, net_amount, bank, status

### 3. Bank MIS Report
- 50 rows (bank statement entries)
- Bank-wise breakdown visible
- HDFC: 35, Axis: 10, ICICI: 5

### 4. Recon Outcome Report
- Summary: 50 matched, 0 unmatched, 0 exceptions
- 100% match rate

## Files Location
```
/Users/shantanusingh/ops-dashboard/test-pg-transactions-2025-10-25.csv
/Users/shantanusingh/ops-dashboard/test-hdfc-statements-2025-10-25.csv
/Users/shantanusingh/ops-dashboard/test-axis-statements-2025-10-25.csv
/Users/shantanusingh/ops-dashboard/test-icici-statements-2025-10-25.csv
```

## Next Steps
1. Upload all 4 files to staging via UI
2. Run reconciliation
3. Verify results match expectations
4. Test all 4 reports
5. Verify Financial Dashboard updates

---

**Test Execution Date:** 2025-10-24
**Status:** Ready for Manual Upload
