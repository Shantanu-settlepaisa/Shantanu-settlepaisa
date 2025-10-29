# V1-to-V2 Column Mapper Ambiguity Fix - COMPLETE ✅
**Date:** October 23, 2025
**Status:** ✅ FULLY RESOLVED - No ambiguity remaining

---

## Executive Summary

Successfully eliminated **ALL V1-to-V2 column mapping ambiguity** across the entire codebase. Both mapper files are now synchronized and correctly preserve gross/net/fee amounts from legacy V1 CSV uploads.

### What Was Fixed

| Issue | Before | After | Status |
|-------|--------|-------|--------|
| **PG Transactions - File Upload** | `paid_amount` → `amount_paise` ❌ | `paid_amount` → `gross_amount_paise` ✅ | FIXED |
| **PG Transactions - Recon Engine** | `paid_amount` → `amount_paise` ❌ | `paid_amount` → `gross_amount_paise` ✅ | FIXED |
| **Bank Statements - File Upload** | Missing gross/fee mappings ❌ | Complete gross/net/fee mappings ✅ | FIXED |
| **Bank Statements - Recon Engine** | Already had mappings ✅ | No change needed ✅ | VERIFIED |

---

## Files Modified

### 1. `services/api/v1-column-mapper.js` (File Upload API - Port 5109)

**Purpose:** Maps V1 CSV columns to V2 database schema during manual file uploads

**Changes Made:**
```javascript
bank_statements: {
  // BEFORE (BROKEN):
  'paid_amount': 'amount_paise',     // ❌ Lost gross amount!
  'payee_amount': 'amount_paise',
  // Missing fee fields

  // AFTER (FIXED):
  'gross_amount': 'gross_amount_paise',      // ✅ NEW
  'paid_amount': 'gross_amount_paise',       // ✅ FIXED
  'net_amount': 'amount_paise',              // ✅ NEW
  'payee_amount': 'amount_paise',            // ✅ Correct
  'credit_amount': 'amount_paise',           // ✅ NEW
  'bank_fee': 'bank_fee_paise',              // ✅ NEW
  'bank_charges': 'bank_fee_paise',          // ✅ NEW
  'bank_gst': 'bank_gst_paise',              // ✅ NEW
}
```

**Lines Changed:** 88-129 (42 lines total, added 21 new mappings)

---

### 2. `services/recon-api/utils/v1-column-mapper.js` (Recon Engine - Port 5103)

**Purpose:** Maps V1 CSV columns to V2 database schema during reconciliation data normalization

**Changes Made:**
```javascript
pg_transactions: {
  // BEFORE (BROKEN):
  'paid_amount': 'amount_paise',     // ❌ Lost gross amount!

  // AFTER (FIXED):
  'paid_amount': 'gross_amount_paise',       // ✅ FIXED
  'payee_amount': 'amount_paise',            // ✅ Correct (unchanged)
}
```

**Lines Changed:** 61-87 (Added 6 comment lines, changed 1 mapping)

---

## Complete V1-to-V2 Mapping Reference

### PG Transactions (V1 CSV → V2 Database)

| V1 CSV Column | V2 Database Column | Meaning | Conversion |
|---------------|-------------------|---------|------------|
| `transaction_id` | `transaction_id` | Transaction ID | Direct copy |
| `client_code` | `merchant_id` | Merchant ID | Direct copy |
| **`paid_amount`** | **`gross_amount_paise`** | **Customer paid (GROSS)** | **Multiply by 100 ✅** |
| **`payee_amount`** | **`amount_paise`** | **Merchant receives (NET)** | **Multiply by 100 ✅** |
| `amount` | `amount_paise` | Default amount (net) | Multiply by 100 |
| `bank_exclude_amount` | `bank_fee_paise` | Bank fees | Multiply by 100 |
| `utr` | `utr` | UTR reference | Direct copy |
| `rrn` | `rrn` | RRN reference | Direct copy |
| `trans_date` | `transaction_date` | Transaction date | Parse date |
| `payment_mode` | `payment_method` | Payment method | Normalize |
| `bank_name` | `bank_name` | Bank name | Direct copy |
| `transaction_status` | `status` | Status | Map enum |

**Financial Equation:**
```
gross_amount_paise (customer paid) = amount_paise (merchant receives) + fees
100.00 = 97.88 + 2.12
10000 paise = 9788 paise + 212 paise
```

---

### Bank Statements (V1 CSV → V2 Database)

| V1 CSV Column | V2 Database Column | Meaning | Conversion |
|---------------|-------------------|---------|------------|
| `utr` | `utr` | UTR reference | Direct copy |
| `rrn` | `rrn` | RRN reference | Direct copy |
| `transaction_id` | `bank_ref` | Bank reference | Direct copy |
| **`gross_amount`** | **`gross_amount_paise`** | **Customer paid (GROSS)** | **Multiply by 100 ✅** |
| **`paid_amount`** | **`gross_amount_paise`** | **Alias for gross** | **Multiply by 100 ✅** |
| **`net_amount`** | **`amount_paise`** | **Merchant credited (NET)** | **Multiply by 100 ✅** |
| **`payee_amount`** | **`amount_paise`** | **Alias for net** | **Multiply by 100 ✅** |
| **`credit_amount`** | **`amount_paise`** | **Alias for net** | **Multiply by 100 ✅** |
| `amount` | `amount_paise` | Default amount (net) | Multiply by 100 |
| **`bank_fee`** | **`bank_fee_paise`** | **Bank charges (excl GST)** | **Multiply by 100 ✅** |
| **`bank_charges`** | **`bank_fee_paise`** | **Alias for bank_fee** | **Multiply by 100 ✅** |
| **`bank_gst`** | **`bank_gst_paise`** | **GST on charges** | **Multiply by 100 ✅** |
| `trans_date` | `transaction_date` | Transaction date | Parse date |
| `bank_name` | `bank_name` | Bank name | Direct copy |
| `remarks` | `remarks` | Bank notes | Direct copy |

**Financial Equation:**
```
gross_amount_paise = amount_paise + bank_fee_paise + bank_gst_paise
100.00 = 97.88 + 2.00 + 0.12
10000 paise = 9788 paise + 200 paise + 12 paise
```

---

## Data Flow Impact

### Before Fix (BROKEN)

```
V1 CSV Upload
├── paid_amount: 100.00
├── payee_amount: 97.88
└── bank_fee: 2.00

    ↓ V1 Mapper (BROKEN)

Database (DATA LOSS!)
├── amount_paise: 9788 ❌ (only net stored)
├── gross_amount_paise: NULL ❌ (gross lost!)
└── bank_fee_paise: NULL ❌ (fee lost!)

Result: Cannot calculate bank fees, reconciliation fails
```

### After Fix (WORKING)

```
V1 CSV Upload
├── paid_amount: 100.00
├── payee_amount: 97.88
└── bank_fee: 2.00

    ↓ V1 Mapper (FIXED)

Database (ALL DATA PRESERVED!)
├── amount_paise: 9788 ✅ (net preserved)
├── gross_amount_paise: 10000 ✅ (gross preserved)
└── bank_fee_paise: 200 ✅ (fee preserved)

Result: Full data available for reconciliation and fee tracking
```

---

## Services Affected

| Service | Port | File | Impact |
|---------|------|------|--------|
| **File Upload API** | 5109 | `services/api/file-upload-v2.cjs` | ✅ Now preserves gross/fee from manual CSV uploads |
| **Recon Engine** | 5103 | `services/recon-api/jobs/runReconciliation.js` | ✅ Now uses gross amounts for matching |

---

## Database Tables Affected

| Table | Columns Updated | Impact |
|-------|----------------|--------|
| `sp_v2_transactions` | `gross_amount_paise`, `amount_paise` | ✅ Both gross and net now populated correctly |
| `sp_v2_bank_statements` | `gross_amount_paise`, `amount_paise`, `bank_fee_paise`, `bank_gst_paise` | ✅ All four amount fields now populated correctly |

---

## Test Results

### Test Setup
- **Test Date:** 2025-10-23
- **Test Files:**
  - `test-v1-mapper-fix-pg.csv` (5 PG transactions)
  - `test-v1-mapper-fix-bank.csv` (5 bank statements)

### Verification Results

**PG Transactions:**
```
✅ net (payee_amount):  9788 paise (₹97.88) - CORRECT
✅ gross (paid_amount): 10000 paise (₹100.00) - CORRECT
✅ Data flow: V1 CSV → Mapper → Database - WORKING
```

**Bank Statements:**
```
✅ net (payee_amount):  9788 paise (₹97.88) - CORRECT
✅ gross (paid_amount): 10000 paise (₹100.00) - CORRECT
✅ bank_fee:            200 paise (₹2.00) - CORRECT
✅ bank_gst:            12 paise (₹0.12) - CORRECT
✅ Data flow: V1 CSV → Mapper → Database - WORKING
```

---

## Migration Status

**No migration required** ✅

The database schema already has the necessary columns from previous migrations:
- Migration 031: Added `gross_amount_paise`, `bank_fee_paise`, `bank_gst_paise` to `sp_v2_bank_statements`
- Migration 032: Added `gross_amount_paise` to `sp_v2_transactions`

This fix only changes the **mapper logic**, not the database schema.

---

## Backward Compatibility

✅ **Fully backward compatible**

- Old uploads (before this fix): Will have `gross_amount_paise = NULL` (acceptable)
- New uploads (after this fix): Will have all fields populated
- Reconciliation engine handles both cases with fallback logic
- No breaking changes to existing code

---

## Example: Complete Row Transformation

### Input: V1 CSV Row
```csv
transaction_id,paid_amount,payee_amount,bank_exclude_amount,utr,trans_date
TXN001,100.00,97.88,2.12,UTR001,2025-10-23
```

### Output: V2 Database Row
```sql
INSERT INTO sp_v2_transactions (
  transaction_id,
  gross_amount_paise,    -- ✅ From paid_amount
  amount_paise,          -- ✅ From payee_amount
  bank_fee_paise,        -- ✅ From bank_exclude_amount
  utr,
  transaction_date
) VALUES (
  'TXN001',
  10000,                 -- ✅ 100.00 × 100
  9788,                  -- ✅ 97.88 × 100
  212,                   -- ✅ 2.12 × 100
  'UTR001',
  '2025-10-23'
);
```

---

## Key Takeaways

### ✅ What's Fixed
1. **PG Transactions**: `paid_amount` now correctly maps to `gross_amount_paise` (not `amount_paise`)
2. **Bank Statements**: Complete gross/net/fee/gst mappings added
3. **Both Mappers**: Synchronized and consistent across all services
4. **Data Preservation**: No more data loss during V1→V2 conversion

### ✅ What This Enables
1. **Accurate Reconciliation**: Can match by gross amounts (customer-paid)
2. **Bank Fee Tracking**: Can calculate fees as `gross - net`
3. **Settlement Accuracy**: Can deduct correct fees from merchant payouts
4. **Analytics**: Can analyze fee trends and revenue split

### ✅ What Users See
1. **Manual CSV Uploads**: Now preserve all amount data
2. **Reconciliation Results**: Higher match rates (gross-to-gross matching)
3. **Bank Fee Reports**: Accurate fee calculations
4. **Settlement Reports**: Correct net payout amounts

---

## Next Steps (Optional Enhancements)

1. **Backfill Old Data**: Optionally re-process old V1 CSVs to populate missing gross amounts
2. **Validation Rules**: Add CHECK constraints to ensure `gross >= net`
3. **UI Indicators**: Show users when gross amounts are available vs fallback to net
4. **Analytics Dashboard**: Add gross vs net comparison charts

---

## Deployment Checklist

- [x] Mapper files updated (both `services/api` and `services/recon-api`)
- [x] Test CSV files created
- [x] E2E verification completed
- [x] Database schema already supports new fields (migrations 031-032)
- [x] Backward compatibility verified
- [x] No breaking changes introduced
- [ ] Deploy to staging
- [ ] Smoke test on staging with real bank files
- [ ] Deploy to production

---

## Files in This Change

### Modified (2 files)
1. `/Users/shantanusingh/ops-dashboard/services/api/v1-column-mapper.js`
2. `/Users/shantanusingh/ops-dashboard/services/recon-api/utils/v1-column-mapper.js`

### Created (3 test files)
1. `/Users/shantanusingh/ops-dashboard/test-v1-mapper-fix-pg.csv`
2. `/Users/shantanusingh/ops-dashboard/test-v1-mapper-fix-bank.csv`
3. `/Users/shantanusingh/ops-dashboard/test-v1-mapper-fix-e2e.cjs`

---

**Implementation:** ✅ COMPLETE
**Testing:** ✅ VERIFIED
**Documentation:** ✅ COMPLETE
**Ready for:** 🚀 STAGING DEPLOYMENT

---

*End of Documentation*
