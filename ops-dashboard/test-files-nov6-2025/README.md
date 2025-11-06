# Test Files - November 6, 2025

## Overview
Enhanced test files with **variable fee rates** based on payment mode for realistic testing.

## Files Created
- `test-pg-180-records-nov6.csv` - 180 PG transactions
- `test-hdfc-60-records-nov6.csv` - 60 HDFC Bank statements
- `test-bob-60-records-nov6.csv` - 60 BOB Bank statements
- `test-axis-60-records-nov6.csv` - 60 AXIS Bank statements

## Fee Structure (Variable & Realistic)

### Payment Gateway Fees
| Payment Mode | Fee Rate | Distribution | Net Calculation |
|--------------|----------|--------------|-----------------|
| **UPI** | 1.5% | 60% | Net = Gross × 0.985 |
| **NETBANKING** | 1.8% | 20% | Net = Gross × 0.982 |
| **CARD** | 2.0% | 20% | Net = Gross × 0.980 |

### Bank Fee Tracking
| Bank | Has Net Amount? | Fee Calculation | Fee Visible in Dashboard? |
|------|-----------------|-----------------|---------------------------|
| **HDFC** | ✅ Yes | DOMESTIC AMT - Net Amount | ✅ Yes |
| **BOB** | ✅ Yes | Settlement Amount - Net Amount | ✅ Yes |
| **AXIS** | ✅ Yes | GrossAmount - NetAmount | ✅ Yes |

## Transaction Distribution

### UTR Assignment
- **PG**: UTR001 - UTR180 (all 180 transactions)
- **HDFC**: UTR001 - UTR060 (first 60)
- **BOB**: UTR061 - UTR120 (middle 60)
- **AXIS**: UTR121 - UTR180 (last 60)

### Amount Ranges
| File | Record Count | Amount Range | UTR Range |
|------|--------------|--------------|-----------|
| PG | 180 | ₹1,000 - ₹90,500 | UTR001-UTR180 |
| HDFC | 60 | ₹1,000 - ₹30,500 | UTR001-UTR060 |
| BOB | 60 | ₹30,500 - ₹60,500 | UTR061-UTR120 |
| AXIS | 60 | ₹60,500 - ₹90,500 | UTR121-UTR180 |

## Expected Reconciliation Results
- **Total PG Transactions**: 180
- **Total Bank Transactions**: 180 (60 × 3 banks)
- **Perfect Matches**: 180 (100%)
- **Exceptions**: 0

## Financial Dashboard Impact

### Bank Fees Calculable
- **HDFC**: 60 transactions with fees (1.5-2.0% varied)
- **BOB**: 60 transactions with fees (1.5-2.0% varied)
- **AXIS**: 60 transactions with fees (1.5-2.0% varied)
- **Total**: 180 transactions will show bank fees

## Fee Examples

### UPI Transaction (1.5% fee)
```
Gross: ₹10,000.00
Fee: ₹150.00 (1.5%)
Net: ₹9,850.00
```

### Netbanking Transaction (1.8% fee)
```
Gross: ₹10,000.00
Fee: ₹180.00 (1.8%)
Net: ₹9,820.00
```

### Card Transaction (2.0% fee)
```
Gross: ₹10,000.00
Fee: ₹200.00 (2.0%)
Net: ₹9,800.00
```

## Usage Instructions

1. **Upload PG File**: Upload `test-pg-180-records-nov6.csv` first
2. **Upload Bank Files**: Upload HDFC, BOB, and AXIS files
3. **Run Reconciliation**: Should match all 180 transactions
4. **Check Financial Dashboard**:
   - Bank fees visible for all 3 banks (180 transactions)
   - All banks now support bank fee calculation

## Date Format Details
- **PG**: `2025-11-06 HH:MM:SS` (timestamps from 09:00 to 23:59)
- **HDFC**: `06-11-2025` (DD-MM-YYYY)
- **BOB**: `06/11/2025` (DD/MM/YYYY)
- **AXIS**: `06/11/2025` (DD/MM/YYYY)

## Total Amounts
- **PG Gross**: ₹8,190,000.00
- **PG Net**: ~₹8,046,300.00 (varies by fee rate)
- **Bank Gross**: ₹8,190,000.00
- **Bank Net**: ~₹8,046,300.00 (HDFC + BOB only)

Generated on: 2025-11-06T09:51:59.597Z
