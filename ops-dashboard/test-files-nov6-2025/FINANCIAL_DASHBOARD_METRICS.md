# Financial Dashboard - Expected Metrics
## November 6, 2025 Test Data

---

## Summary Statistics

### Transaction Volumes
| Source | Record Count | UTR Range |
|--------|--------------|-----------|
| **Payment Gateway** | 180 | UTR001-UTR180 |
| **HDFC Bank** | 60 | UTR001-UTR060 |
| **BOB Bank** | 60 | UTR061-UTR120 |
| **AXIS Bank** | 60 | UTR121-UTR180 |
| **Total Bank** | 180 | UTR001-UTR180 |

### Reconciliation Expected Results
- ✅ **Perfect Matches**: 180 (100%)
- ✅ **Exceptions**: 0
- ✅ **Success Rate**: 100%

---

## Payment Mode Distribution

| Payment Mode | Count | Percentage | Fee Rate |
|--------------|-------|------------|----------|
| **UPI** | 108 | 60% | 1.5% |
| **NETBANKING** | 36 | 20% | 1.8% |
| **CARD** | 36 | 20% | 2.0% |
| **Total** | 180 | 100% | Variable |

---

## Financial Metrics - PG Transactions

### Gross Amounts by Payment Mode
```
UPI (108 txns):        ₹5,454,000.00
Netbanking (36 txns):  ₹1,818,000.00
Card (36 txns):        ₹1,818,000.00
──────────────────────────────────
Total PG Gross:        ₹9,090,000.00
```

### Net Amounts by Payment Mode
```
UPI (1.5% fee):        ₹5,372,190.00
Netbanking (1.8% fee): ₹1,785,276.00
Card (2.0% fee):       ₹1,781,640.00
──────────────────────────────────
Total PG Net:          ₹8,939,106.00
```

### PG Fees Collected
```
UPI fees:              ₹81,810.00 (1.5%)
Netbanking fees:       ₹32,724.00 (1.8%)
Card fees:             ₹36,360.00 (2.0%)
──────────────────────────────────
Total PG Fees:         ₹150,894.00
Average Fee Rate:      1.66%
```

---

## Financial Metrics - Bank Statements

### Bank Gross Amounts
```
HDFC (60 txns):        ₹930,000.00
BOB (60 txns):         ₹2,730,000.00
AXIS (60 txns):        ₹5,430,000.00
──────────────────────────────────
Total Bank Gross:      ₹9,090,000.00
```

### Bank Net Amounts
```
HDFC (60 txns):        ₹915,915.00
BOB (60 txns):         ₹2,685,915.00
AXIS (60 txns):        N/A (no net amount)
──────────────────────────────────
Total Bank Net:        ₹3,601,830.00 (HDFC + BOB only)
```

### Bank Fees (Implicit - Gross minus Net)
```
HDFC fees:             ₹14,085.00
BOB fees:              ₹44,085.00
AXIS fees:             N/A (cannot calculate)
──────────────────────────────────
Total Calculable:      ₹58,170.00
```

---

## Financial Dashboard Display

### What WILL Show in Dashboard

#### ✅ Transactions with Bank Fees
- **HDFC**: 60 transactions (fees calculable via Gross - Net)
- **BOB**: 60 transactions (fees calculable via Gross - Net)
- **Total**: 120 transactions with bank fee data

#### ✅ Expected Bank Fee Metrics
```
Total Bank Fees:       ₹58,170.00
Transactions:          120
Average Fee:           ₹484.75 per transaction
Fee Percentage:        1.59% average
```

### What WILL NOT Show in Dashboard

#### ❌ Missing Bank Fee Data
- **AXIS Bank**: 60 transactions WITHOUT net amount
- **Impact**: 33% of bank transactions won't have fee data
- **Reason**: AXIS file format lacks Net Amount column

#### ⚠️ Partial Coverage Warning
```
Bank transactions WITH fees:    120 (66.7%)
Bank transactions WITHOUT fees:  60 (33.3%)
Total bank transactions:        180 (100%)
```

---

## Reconciliation Flow

### Step 1: Upload PG File
```bash
File: test-pg-180-records-nov6.csv
Records: 180
Status: ✅ All valid
```

### Step 2: Upload Bank Files
```bash
HDFC:  test-hdfc-60-records-nov6.csv  → 60 records ✅
BOB:   test-bob-60-records-nov6.csv   → 60 records ✅
AXIS:  test-axis-60-records-nov6.csv  → 60 records ✅
Total: 180 bank records
```

### Step 3: Run Reconciliation
```
Expected Results:
- Matched:     180 (100%)
- Unmatched:   0
- Exceptions:  0
```

### Step 4: Check Financial Dashboard
```
Expected Bank Fee Display:
- HDFC fees: ₹14,085.00 (60 txns) ✅
- BOB fees:  ₹44,085.00 (60 txns) ✅
- AXIS fees: Not displayed (60 txns) ❌
- Total:     ₹58,170.00 (120/180 txns)
```

---

## Fee Breakdown by UTR Range

| UTR Range | Bank | Gross Amount | Net Amount | Fees | Fee % |
|-----------|------|--------------|------------|------|-------|
| UTR001-060 | HDFC | ₹930,000 | ₹915,915 | ₹14,085 | 1.51% |
| UTR061-120 | BOB | ₹2,730,000 | ₹2,685,915 | ₹44,085 | 1.61% |
| UTR121-180 | AXIS | ₹5,430,000 | N/A | N/A | N/A |

---

## Testing Checklist

### ✅ Pre-Upload Verification
- [ ] All 4 files present in `test-files-nov6-2025/`
- [ ] File sizes correct (PG ~15KB, banks ~2-3KB each)
- [ ] Line counts correct (PG: 181, banks: 61 each)

### ✅ Upload Testing
- [ ] PG file uploads successfully (180 records)
- [ ] HDFC file uploads successfully (60 records)
- [ ] BOB file uploads successfully (60 records)
- [ ] AXIS file uploads successfully (60 records)

### ✅ Reconciliation Testing
- [ ] Run reconciliation job
- [ ] Verify 180 matches (100%)
- [ ] Verify 0 exceptions
- [ ] Check reconciliation results display

### ✅ Financial Dashboard Testing
- [ ] Navigate to Financial Dashboard
- [ ] Verify bank fee metrics display
- [ ] Confirm HDFC fees visible (~₹14,085)
- [ ] Confirm BOB fees visible (~₹44,085)
- [ ] Confirm AXIS fees NOT visible (expected)
- [ ] Total bank fees ~₹58,170 (for 120 txns)

### ✅ Expected vs Actual
- [ ] Total transactions: 180
- [ ] Total matched: 180
- [ ] Bank fee coverage: 66.7% (120/180)
- [ ] Average bank fee: ~₹484.75

---

## Notes

### Variable Fee Structure
This test data uses realistic variable fees by payment mode:
- **UPI**: 1.5% (most common, lowest fee)
- **Netbanking**: 1.8% (medium fee)
- **Card**: 2.0% (highest fee)

### AXIS Bank Limitation
AXIS Bank file format does NOT include net amount column, which means:
- ❌ Cannot calculate bank fees for AXIS transactions
- ❌ AXIS fees won't appear in Financial Dashboard
- ✅ This is by design (matches production AXIS format)

### Reconciliation Note
Even though AXIS lacks net amount:
- ✅ Reconciliation will still work (uses UTR matching)
- ✅ All 60 AXIS transactions will match
- ❌ Only fee metrics will be missing

---

## Total Financial Summary

```
┌─────────────────────────────────────────────────┐
│  Payment Gateway (PG)                           │
├─────────────────────────────────────────────────┤
│  Gross Amount:     ₹9,090,000.00               │
│  Net Amount:       ₹8,939,106.00               │
│  PG Fees:          ₹150,894.00 (1.66% avg)     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Bank Statements (Combined)                     │
├─────────────────────────────────────────────────┤
│  Gross Amount:     ₹9,090,000.00               │
│  Net Amount:       ₹3,601,830.00 (HDFC+BOB)    │
│  Bank Fees:        ₹58,170.00 (120 txns)       │
│  Missing:          60 AXIS txns (no net amt)   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Reconciliation Match                           │
├─────────────────────────────────────────────────┤
│  Matches:          180 (100%)                   │
│  PG vs Bank:       ₹9,090,000 = ₹9,090,000 ✅  │
│  Status:           Perfect match                │
└─────────────────────────────────────────────────┘
```

---

Generated: November 6, 2025
Test Data Version: v2.0 (Variable Fees)
Location: `/Users/shantanusingh/ops-dashboard/test-files-nov6-2025/`
