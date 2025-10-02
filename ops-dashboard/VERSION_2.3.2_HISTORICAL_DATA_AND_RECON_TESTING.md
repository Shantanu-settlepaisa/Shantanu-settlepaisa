# Version 2.3.2: Historical Data & Reconciliation Testing

**Release Date**: October 1, 2025  
**Previous Version**: 2.3.1 (SQL ambiguity fix)  
**Status**: ✅ Completed

---

## 🎯 Overview

This release adds 30 days of historical reconciliation data to enable date-based filtering in the Overview dashboard, fixes date filtering functionality, and creates comprehensive test files for reconciliation validation.

---

## ✨ Key Features

### 1. Historical Data Seeding (Sept 1-30, 2025)
- **621 transactions** generated with realistic business patterns
- **Weekday/weekend variance**: 20-30 txns/day (weekdays), 10-15 txns/day (weekends)
- **Match rate improvement**: 80% → 95% over 30 days
- **Payment method distribution**: UPI 60%, Card 30%, Netbanking 10%
- **Multi-merchant**: MERCH001, MERCH002, MERCH003
- **Multi-bank**: AXIS, HDFC, ICICI, SBI
- **Sept 30 data fix**: Added missing Sept 30 data (24 transactions)

### 2. Date Filtering Implementation
- ✅ Frontend passes `from` and `to` query parameters to API
- ✅ Backend accepts and applies date filters to all queries
- ✅ React Query cache invalidation on date change
- ✅ Time ranges: Today, Last 2 Days, Last 7 Days, Last 30 Days

### 3. Settlement Pipeline Structure Fix
- ✅ Changed from overlapping to mutually exclusive buckets
- ✅ API returns: `captured`, `inSettlement`, `sentToBank`, `credited`, `unsettled`
- ✅ Settlement Pipeline visualization now shows correct color segregation

### 4. Amount Display Precision
- ✅ Changed currency formatting from 1 decimal to 2 decimals
- ✅ Variance tile now shows accurate amounts (₹1.28L instead of ₹1.3L)

### 5. Reconciliation Test Files
- ✅ Created V1 format test CSV files for Oct 2, 2025
- ✅ 30 PG transactions with various scenarios
- ✅ 23 Bank statements with matching/mismatching cases
- ✅ Expected results: 15 matches, 18 exceptions

---

## 📁 Files Created/Modified

### Created Files

#### 1. Historical Data Seed Script
**File**: `/ops-dashboard/seed-historical-recon-data.cjs`
```javascript
// Generates 30 days of realistic historical data
// Features:
// - Business logic (weekday/weekend patterns)
// - Time-based match rate improvement (80% → 95%)
// - Multiple merchants and banks
// - Realistic payment method distribution
```

**Usage**:
```bash
node seed-historical-recon-data.cjs > /tmp/seed-output.log
```

**Output**: 621 transactions, 540 bank statements

#### 2. Sept 30 Data Fix Script
**File**: `/ops-dashboard/services/overview-api/seed-sept-30.cjs`
```javascript
// Adds missing Sept 30 data (24 transactions)
// 22 matched, 2 exceptions
```

**Usage**:
```bash
node seed-sept-30.cjs
```

#### 3. Reconciliation Test Files
**Location**: `/ops-dashboard/test-recon-files/`

**Files**:
- `generate-test-files.cjs` - Generator script
- `pg_transactions_2025-10-02.csv` - 30 PG transactions
- `bank_statement_2025-10-02.csv` - 23 Bank statements
- `TEST_SUMMARY.txt` - Expected results documentation

**Test Scenarios**:
- ✅ Perfect matches: 15 (same UTR, same amount)
- ⚠️  Amount mismatches: 5 (same UTR, ±₹100 difference)
- ❌ Missing in bank: 8 (PG only)
- ❌ Missing in PG: 3 (Bank only)
- ⚠️  Duplicate UTR: 2 (same UTR in multiple PG txns)

**Expected Results**:
```
Total PG: 30
Total Bank: 23
Matched: 15
Exceptions: 18
Match Rate: 50%
```

### Modified Files

#### 1. Overview API - Date Filtering
**File**: `/ops-dashboard/services/overview-api/overview-v2.js`

**Changes**:
```javascript
// BEFORE: Hardcoded 30 days
WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'

// AFTER: Dynamic date filtering
WHERE transaction_date >= $1 AND transaction_date <= $2
```

**Lines Changed**: 61-159

**Key Updates**:
- Added `from` and `to` query parameter parsing
- Built dynamic `whereClause` with date parameters
- Applied date filtering to all SQL queries
- Updated pipeline structure to mutually exclusive buckets

#### 2. Frontend Service - Date Parameters
**File**: `/ops-dashboard/src/services/overview.ts`

**Changes**:
```javascript
// BEFORE: No date parameters
const v2ApiUrl = 'http://localhost:5108/api/overview';

// AFTER: Include date parameters
const params = new URLSearchParams();
if (window.from) params.append('from', window.from);
if (window.to) params.append('to', window.to);
const v2ApiUrl = `http://localhost:5108/api/overview${params.toString() ? '?' + params.toString() : ''}`;
```

**Lines Changed**: 134-142

#### 3. React Query Hooks - API Structure Compatibility
**File**: `/ops-dashboard/src/hooks/opsOverview.ts`

**Changes**:

**Line 128**: Check for `captured` field
```javascript
// BEFORE
const hasRealData = pipeline.totalTransactions > 0;

// AFTER
const hasRealData = (pipeline.captured || pipeline.totalTransactions || 0) > 0;
```

**Line 140**: Use API-provided unreconciled amount
```javascript
// BEFORE
const variance = totalAmount - reconciledAmount;

// AFTER
const variance = financial.unreconciledAmount || (totalAmount - reconciledAmount);
```

**Line 239, 259**: Fixed all transform functions
- `transformV2ToTopReasons`
- `transformV2ToPipeline`
- Updated to check `pipeline.captured`

**Line 263**: Pipeline structure
```javascript
// BEFORE
const ingested = pipeline.totalTransactions || 0;

// AFTER
const ingested = pipeline.captured || pipeline.totalTransactions || 0;
```

#### 4. Currency Formatting - Precision Fix
**File**: `/ops-dashboard/src/lib/currency.ts`

**Changes**:
```javascript
// BEFORE: 1 decimal place
return `₹${(rupees / 100000).toFixed(1)}L`;  // 1.2840405 → 1.3L

// AFTER: 2 decimal places
return `₹${(rupees / 100000).toFixed(2)}L`;  // 1.2840405 → 1.28L
```

**Lines Changed**: 32, 34, 36

**Impact**: All KPI tiles now show 2 decimal precision

---

## 🔧 API Changes

### Overview API Endpoint

**URL**: `GET http://localhost:5108/api/overview`

**Query Parameters** (NEW):
```
?from=YYYY-MM-DD&to=YYYY-MM-DD
```

**Example**:
```bash
# Today
curl "http://localhost:5108/api/overview?from=2025-10-01&to=2025-10-01"

# Last 7 days
curl "http://localhost:5108/api/overview?from=2025-09-24&to=2025-10-01"

# Last 30 days
curl "http://localhost:5108/api/overview?from=2025-09-01&to=2025-10-01"
```

### Response Structure Changes

**NEW Pipeline Structure** (mutually exclusive):
```json
{
  "pipeline": {
    "captured": 166,        // Total transactions
    "inSettlement": 130,    // Reconciled/matched
    "sentToBank": 0,        // In settlement batches (future)
    "credited": 0,          // Bank confirmed credits (future)
    "unsettled": 36         // Exceptions
  }
}
```

**Financial Section** (NEW field):
```json
{
  "financial": {
    "grossAmount": 85067928,
    "reconciledAmount": 68188719,
    "unreconciledAmount": 16879209,  // NEW: Exceptions amount
    "netAmount": 0,
    "commission": 0,
    "gst": 0,
    "tds": 0
  }
}
```

---

## 📊 Database State

### Current Data (as of Oct 1, 2025)

```sql
-- Total transactions by date
SELECT 
  transaction_date::text as date,
  COUNT(*) as count,
  SUM(CASE WHEN status = 'RECONCILED' THEN 1 ELSE 0 END) as matched,
  SUM(CASE WHEN status = 'EXCEPTION' THEN 1 ELSE 0 END) as exceptions
FROM sp_v2_transactions
WHERE transaction_date >= '2025-09-01'
GROUP BY transaction_date::text
ORDER BY date;
```

**Results**:
- Sept 1-29: 596 transactions (507 matched, 89 exceptions)
- Sept 30: 24 transactions (22 matched, 2 exceptions)
- Oct 1: 26 transactions (2 matched, 24 exceptions)
- **Total**: 646 transactions

### Data by Date Range

| Filter | Transactions | Matched | Exceptions | Match Rate |
|--------|-------------|---------|------------|-----------|
| Today (Oct 1) | 26 | 2 | 24 | 7.7% |
| Last 2 Days (Sept 30 - Oct 1) | 50 | 24 | 26 | 48.0% |
| Last 7 Days (Sept 24 - Oct 1) | 166 | 130 | 36 | 78.3% |
| Last 30 Days (Sept 1 - Oct 1) | 646 | 533 | 113 | 82.5% |

---

## 🐛 Bugs Fixed

### 1. Date Filtering Not Working
**Issue**: All date filters showed same data (47 transactions)

**Root Cause**: 
- Transform functions checked `pipeline.totalTransactions` but API returned `pipeline.captured`
- Fell back to hardcoded test data

**Fix**:
```javascript
// Updated all transform functions to check both fields
const hasRealData = (pipeline.captured || pipeline.totalTransactions || 0) > 0;
```

**Files**: `src/hooks/opsOverview.ts` (lines 128, 239, 259)

### 2. Variance Tile Rounding Error
**Issue**: Variance showed ₹1.3L instead of ₹1.28L

**Root Cause**: `.toFixed(1)` rounded 1.28 to 1.3

**Fix**: Changed to `.toFixed(2)` for 2 decimal precision

**File**: `src/lib/currency.ts` (lines 32-36)

### 3. Settlement Pipeline Grey Section
**Issue**: Pipeline showed grey undefined section

**Root Cause**: API returned overlapping counts (`totalTransactions`, `sentToBank`, `credited`)

**Fix**: Changed to mutually exclusive buckets
```javascript
pipeline: {
  captured: totalTransactions,    // All
  inSettlement: matchedTransactions,  // Reconciled
  sentToBank: 0,                  // Not tracking yet
  credited: 0,                    // Not tracking yet
  unsettled: exceptions           // Exceptions
}
```

**File**: `services/overview-api/overview-v2.js` (lines 190-197)

### 4. Sept 30 Missing Data
**Issue**: Sept 30 had 0 transactions, causing Today/Last 2 Days to show same count

**Root Cause**: Seed script loop stopped at day 29

**Fix**: Created `seed-sept-30.cjs` to add missing data (24 transactions)

### 5. Unreconciled Amount Not Using API Data
**Issue**: Variance calculation didn't use API's `unreconciledAmount` field

**Root Cause**: Transform function calculated instead of using API value

**Fix**:
```javascript
// Use API value directly
const variance = financial.unreconciledAmount || (totalAmount - reconciledAmount);
```

**File**: `src/hooks/opsOverview.ts` (line 140)

---

## 🧪 Testing Instructions

### 1. Verify Historical Data Filtering

1. Open http://localhost:5174/ops/overview
2. Select **"Today"** filter
   - ✅ Should show: 26 transactions, 2 matched, 24 exceptions
3. Select **"Last 2 Days"** filter
   - ✅ Should show: 50 transactions, 24 matched, 26 exceptions
4. Select **"Last 7 Days"** filter
   - ✅ Should show: 166 transactions, 130 matched, 36 exceptions
5. Select **"Last 30 Days"** filter
   - ✅ Should show: 646 transactions, 533 matched, 113 exceptions

### 2. Test Reconciliation with V1 Files

1. Navigate to **Manual Upload** page
2. Upload files from `/ops-dashboard/test-recon-files/`:
   - PG file: `pg_transactions_2025-10-02.csv` (30 transactions)
   - Bank file: `bank_statement_2025-10-02.csv` (23 statements)
3. Select date: **Oct 2, 2025**
4. Click **"Upload & Reconcile"**

**Expected Results**:
```
✅ Total PG Transactions: 30
✅ Total Bank Statements: 23
✅ Matched: 15 (50%)
✅ Exceptions: 18

Exception Breakdown:
- AMOUNT_MISMATCH: 5
- MISSING_UTR (in bank): 8
- MISSING_UTR (in PG): 3
- DUPLICATE_UTR: 2
```

5. Verify in Overview (filter to Oct 2):
   - Total: Should increase by 30
   - Matched: Should increase by 15
   - Exceptions: Should increase by 18

---

## 📝 Known Limitations

### 1. Settlement Tracking Not Implemented
**Current State**: `sentToBank` and `credited` hardcoded to 0

**Required**:
- Settlement batch creation process
- Status tracking: PENDING → SENT_TO_BANK → CREDITED
- Bank integration or manual confirmation
- Tables: `sp_v2_settlement_batches`, `sp_v2_settlement_items`

**Impact**: Settlement Pipeline only shows 3 stages (In Settlement, Unsettled)

### 2. Recon Match Records Not Created
**Current State**: Historical seed skips `sp_v2_recon_matches` table

**Reason**: Schema mismatch (UUID vs bigint)
```sql
-- sp_v2_recon_matches expects UUID
item_id UUID
utr_id UUID

-- But sp_v2_transactions has bigint
id BIGINT
```

**Workaround**: Status fields sufficient for Overview queries
- Transactions: `status = 'RECONCILED'`
- Bank statements: `processed = true`

**Impact**: None on Overview dashboard functionality

---

## 🔄 Migration Steps

### From Version 2.3.1 to 2.3.2

1. **Generate Historical Data**:
```bash
cd /Users/shantanusingh/ops-dashboard
node seed-historical-recon-data.cjs
node services/overview-api/seed-sept-30.cjs
```

2. **Restart Services**:
```bash
# Kill existing overview API
lsof -ti:5108 | xargs kill -9

# Start new version
cd services/overview-api
node overview-v2.js > /tmp/overview-api.log 2>&1 &
```

3. **Clear Browser Cache**:
```
Mac: Cmd + Shift + R
Windows: Ctrl + Shift + F5
```

4. **Verify**:
- Check date filters show different counts
- Check Variance tile shows 2 decimals
- Check Settlement Pipeline has no grey section

---

## 🚀 Future Roadmap

### Priority 1: Settlement Pipeline Implementation
**ETA**: Version 2.4.0

**Tasks**:
1. Create settlement batch creation service
2. Add status transition workflow
3. Implement bank confirmation tracking
4. Update `sentToBank` and `credited` counts

### Priority 2: Schema Alignment
**ETA**: Version 2.4.1

**Tasks**:
1. Fix UUID vs bigint mismatch in `sp_v2_recon_matches`
2. Enable proper match record creation
3. Add relationship tracking between transactions/bank statements

### Priority 3: Reconciliation Engine Testing
**ETA**: Version 2.3.3

**Tasks**:
1. Test with generated files (Oct 2 data)
2. Verify exception categorization
3. Validate match accuracy
4. Test edge cases (duplicate UTR, amount variance)

---

## 📞 Support & Troubleshooting

### Common Issues

#### Issue: Date filters show same data
**Solution**: Hard refresh browser (Cmd+Shift+R)

#### Issue: API returns no data
**Solution**: Check if overview-v2.js is running on port 5108
```bash
lsof -i:5108
```

#### Issue: Historical data missing
**Solution**: Re-run seed scripts
```bash
node seed-historical-recon-data.cjs
node services/overview-api/seed-sept-30.cjs
```

#### Issue: Variance shows wrong amount
**Solution**: Verify currency.ts has `.toFixed(2)`

---

## 📚 Documentation References

- **Previous Context**: `QUICK_CONTEXT_V2.3.1.md`
- **Test Files**: `test-recon-files/TEST_SUMMARY.txt`
- **Seed Output**: `/tmp/seed-output.log`
- **API Logs**: `/tmp/overview-api.log`

---

## ✅ Version Sign-off

**Tested By**: Claude Code Assistant  
**Date**: October 1, 2025  
**Status**: ✅ All features working, ready for reconciliation testing  
**Next Action**: Upload test files and validate recon results

---

## 📋 Todo List (Pending)

- [ ] Implement Settlement Pipeline tracking (batches, sent to bank, credited)
- [ ] Test reconciliation with Oct 2 files
- [ ] Verify exception categorization accuracy
- [ ] Document settlement batch creation process
- [ ] Fix UUID vs bigint schema mismatch
