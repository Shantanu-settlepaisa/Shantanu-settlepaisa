# UTR Mapping Fix - Root Cause Analysis (Oct 29, 2025)

## ✅ ROOT CAUSE IDENTIFIED

### The REAL Problem

**The reconciliation was using the WRONG DATE: 2025-10-27 instead of 2025-10-29**

### Evidence

1. **Reconciliation Job (ID: 2397e100-dc18-44de-aa02-35e43d1fc3ef)**:
   ```json
   {
     "date_from": "2025-10-27",
     "date_to": "2025-10-27",
     "total_pg_records": 50,
     "total_bank_records": 20  // ❌ Only fetched 20 instead of 50!
   }
   ```

2. **Actual Data in Database**:
   - **PG Transactions**: 50 records, ALL dated **2025-10-29**
   - **Bank Statements**: 50 records (30 HDFC + 10 AXIS + 10 BOB), ALL dated **2025-10-29**

3. **Exception Message from Results**:
   ```
   "Date exceeds T+2 window: PG 2025-10-29T10:35:00.000Z vs Bank 2025-10-27 (2 days apart)"
   ```

### Why Only 20 Bank Records Were Fetched

The reconciliation query filters by date:
```javascript
// runReconciliation.js, fetchBankFromDatabase()
WHERE DATE(transaction_date) = $1  // $1 = 2025-10-27
```

On **2025-10-27**, only 20 old bank records existed. The 50 new records uploaded on **2025-10-29** were NOT included in the reconciliation.

### Why HDFC Showed as Exceptions (Not AXIS/BOB)

The reconciliation **DID find UTR matches** between PG and Bank data! But it marked them as EXCEPTIONS because:

1. **UTR matching worked** (after our V1-V2 mapper fixes)
2. **Date validation failed** - PG date (2025-10-29) was 2 days after the reconciliation date (2025-10-27)
3. **Result**: 30 HDFC marked as `DATE_OUT_OF_WINDOW` exceptions
4. **AXIS/BOB**: The old 20 bank records from 2025-10-27 didn't have matching UTRs with the new PG data

---

## 🎯 THE SOLUTION

### Re-run Reconciliation with Correct Date

Go to the Recon Workspace and trigger a new reconciliation with date **2025-10-29**:

1. Navigate to: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon
2. Select date: **2025-10-29** (October 29, 2025)
3. Click "Run Reconciliation"
4. **Expected Result**:
   - ✅ Matched: 50/50
   - ✅ Unmatched PG: 0
   - ✅ Unmatched Bank: 0
   - ✅ Exceptions: 0

---

## 📊 Current Database State

### PG Transactions (sp_v2_transactions)

| Source Type | Count | Test UTRs | Date |
|-------------|-------|-----------|------|
| MANUAL_UPLOAD | 50 | 50 (UTR00001-UTR00050) | 2025-10-29 |
| CONNECTOR | 18 | 0 | 2025-10-27 |

### Bank Statements (sp_v2_bank_statements)

| Bank | Count | UTRs with Test Data | Dates |
|------|-------|-------------------|-------|
| HDFC BANK | 110 | 30 (UTR00001-30) | 2025-10-28 to 2025-10-29 |
| AXIS BANK | 50 | 10 (UTR00031-40) | 2025-10-28 to 2025-10-29 |
| BOB | 10 | 10 (UTR00041-50) | 2025-10-29 |

**Note**: Extra records are from earlier uploads. The 50 test records all have transaction_date = 2025-10-29.

### Sample Data Verification

```
PG Transaction: TXN00031 → UTR00031, date=2025-10-29
Bank Statement (AXIS): UTR00031, date=2025-10-29

✅ UTRs match! ✅ Dates match! Just need to reconcile with correct date.
```

---

## ✅ What We Fixed Today

### Fix 1: V1-to-V2 Column Mapping

**File**: `services/shared/v1-column-mapper.cjs`
- Line 297: `'prnno': 'utr'` (was `'bank_ref'`)
- Line 301: `'merchant_track_id': 'utr'` (was `'bank_ref'`)

**Impact**: AXIS and BOB UTRs now stored in correct `utr` field.

### Fix 2: Database Column Mappings

Updated `sp_v2_bank_column_mappings` table:
- AXIS BANK: Added `PRNNo: 'utr'`, removed conflicting `transaction_id`
- BOB: Added `Merchant Track ID: 'utr'`, removed conflicting `transaction_id`

### Fix 3: Reconciliation Engine Fallback

**File**: `services/recon-api/jobs/runReconciliation.js`, Line 981

Simplified:
```javascript
utr: (r.utr || r.bank_ref || '').toString().trim().toUpperCase()
```

---

## 🧪 Testing Instructions

### Step 1: Run New Reconciliation

1. Open: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/ops/recon
2. Select date: **October 29, 2025**
3. Click "Run Reconciliation"
4. Wait for completion

### Step 2: Verify Results

**Expected**:
```
✅ Matched: 50/50
✅ Unmatched PG: 0
✅ Unmatched Bank: 0
✅ Exceptions: 0
```

**Console should show**:
- No "Invariant Violation" errors
- No date warnings
- All 50 UTRs matched (UTR00001 through UTR00050)

---

## 🎉 Summary

### What Was Wrong

1. **Primary Issue**: Reconciliation used date **2025-10-27**, but data was from **2025-10-29**
2. **Secondary Issue**: V1-to-V2 mapper stored AXIS/BOB UTRs in wrong field

### What Was Fixed

1. ✅ V1-to-V2 mapper corrected for AXIS and BOB
2. ✅ Database mappings updated
3. ✅ All 50 test records have correct UTRs in database
4. ✅ Services restarted with fixes deployed

### What You Need to Do

**Run reconciliation with date 2025-10-29 to see 50/50 matches!**

---

**Next Step**: Select date **2025-10-29** in the Recon Workspace and click "Run Reconciliation" 🚀
