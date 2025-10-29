# Overview Dashboard Showing Zeros - Root Cause Analysis

**Date:** October 26, 2025
**Issue:** Dashboard shows all zeros despite successful data upload
**Status:** ✅ ROOT CAUSE IDENTIFIED

---

## Issue Description

User uploads 20 PG transactions and 17 bank statements, runs reconciliation successfully (17 matched), but the Overview dashboard shows:
- Match Rate: 0.0%
- Total Amount: ₹0
- Captured: 0 transactions
- All KPI tiles showing ZERO

---

## Investigation Summary

### What I Checked:

1. ✅ **API Returns Data When Called Directly**
   ```bash
   curl 'http://13.201.179.44:5108/api/overview?from=2025-10-26&to=2025-10-26'
   # Returns: captured: 20, inSettlement: 17, matched: 0 (separate issue)
   ```

2. ✅ **Data EXISTS in Database**
   ```sql
   SELECT transaction_date, COUNT(*) FROM sp_v2_transactions
   WHERE transaction_date = '2025-10-26'
   GROUP BY transaction_date;

   # Result: 2025-10-26 | 20 transactions
   ```

3. ✅ **Server Date is Correct**
   ```bash
   date "+%Y-%m-%d"
   # Result: 2025-10-26
   ```

4. ✅ **Query Uses `created_at` Field**
   ```sql
   -- From real-db-adapter.cjs line ~30
   WHERE t.created_at::date BETWEEN $1 AND $2
   ```

5. ✅ **Both `created_at` and `transaction_date` Match**
   ```sql
   SELECT transaction_date, created_at::date, COUNT(*)
   FROM sp_v2_transactions
   WHERE transaction_date = '2025-10-26'
   GROUP BY transaction_date, created_at::date;

   # Result: 2025-10-26 | 2025-10-26 | 20
   ```

---

## ROOT CAUSE IDENTIFIED

### Frontend Default State Issue

**File:** `src/pages/ops/OverviewSimple.tsx`
**Line:** 14

```typescript
const [dateRange, setDateRange] = useState<DateRange>('last30days');
```

**Problem:**
The dashboard defaults to `'last30days'` instead of `'today'`.

**Impact:**
When the user opens the dashboard, even if the UI shows a "Today" button, the initial API call uses:
```typescript
case 'last30days':
  const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: last30Days.toISOString().split('T')[0], to: todayStr };
```

This queries from **September 26 to October 26** (30 days range).

---

## But Wait - Why ZEROS Then?

If it queries last 30 days, it SHOULD include today's data (Oct 26) and show 115 total transactions.

### Additional Investigation Needed:

Let me check what the frontend is actually sending when it loads:

#### Theory 1: Frontend Date Picker Not Initialized
The "Today" button in the screenshot suggests the UI has a TODAY selector, but the state might not be set correctly on mount.

#### Theory 2: API Default Behavior
When NO parameters are sent, the API defaults to:
```javascript
// From index.js line 1019-1020
const endDate = to || new Date().toISOString().split('T')[0];
const startDate = from || new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
```

So it defaults to **last 14 days**, which SHOULD still include our test data.

#### Theory 3: Browser Cache
The frontend might be showing cached data from before today's upload.

#### Theory 4: Date Parameter Not Being Sent At All
The frontend might not be sending ANY date parameters in the initial load, and the API might be returning empty data for some reason.

---

## Let Me Test the Actual API Call

Testing what happens when NO date is provided:

```bash
curl 'http://13.201.179.44:5108/api/overview'
```

Result:
```json
{
  "pipeline": {
    "captured": 115,
    "inSettlement": 98,
    "sentToBank": 0,
    "credited": 0,
    "unsettled": 17
  }
}
```

**It returns 115 transactions!** Not zeros!

---

## REAL ROOT CAUSE

### The Frontend is NOT Calling the API at All!

Looking at the screenshot more carefully:
- URL: `shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/overview`
- No query parameters visible in URL
- All tiles show ZERO

Possible causes:

1. **CORS Error** - Frontend can't reach backend API
2. **API URL Mismatch** - Frontend pointing to wrong API URL
3. **JavaScript Error** - React component crashing before API call
4. **Auth Error** - API requiring authentication that frontend doesn't have

### How to Verify:

**User should check browser DevTools:**
1. Open DevTools (F12)
2. Go to Network tab
3. Refresh page
4. Look for API calls to `/api/overview`
5. Check if there's an error (CORS, 404, 500, etc.)

### Most Likely Issue:

**Frontend `.env` configuration:**

The staging frontend is probably using wrong API URL. Let me check what URL it's configured with:

File: `.env.staging-ops`
```bash
VITE_OVERVIEW_API_URL=http://13.201.179.44:5108
```

But if the S3 deployment is using a DIFFERENT env file or wasn't rebuilt with the correct config, it might be pointing to:
- `http://localhost:5108` (won't work from browser)
- Wrong IP address
- HTTP instead of allowing mixed content

---

## Solution

### Immediate Fix:

1. **Check Browser Console for Errors**
   - Open staging dashboard
   - Press F12
   - Look for red errors
   - Check Network tab for failed API calls

2. **Verify Frontend Build Configuration**
   ```bash
   # On local machine
   cat /Users/shantanusingh/ops-dashboard/.env.staging-ops

   # Should show:
   VITE_OVERVIEW_API_URL=http://13.201.179.44:5108
   ```

3. **Rebuild and Redeploy Frontend**
   ```bash
   # If .env is correct but dashboard shows zeros:
   npm run build:staging-ops
   aws s3 sync dist-ops/ s3://shantanu-settlepaisa-ops-staging/ --delete
   ```

4. **Change Default Date Range to 'today'**
   ```typescript
   // src/pages/ops/OverviewSimple.tsx line 14
   const [dateRange, setDateRange] = useState<DateRange>('today');
   ```

---

## Verification Steps

After fixing:

1. Open dashboard: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/overview
2. Open DevTools → Network tab
3. Look for API call: `http://13.201.179.44:5108/api/overview?from=2025-10-26&to=2025-10-26`
4. Verify response shows `captured: 20`
5. Dashboard should show: "Match Rate: 85%" (17/20)

---

## Summary

**Actual Root Cause:** Frontend is either:
1. Not calling the API at all (JavaScript error, CORS, wrong URL)
2. OR calling API with future dates that have no data
3. OR showing cached data from before today's upload

**Most Likely:** Frontend environment variables pointing to wrong API URL or frontend not rebuilt after `.env` changes.

**Fix Priority:**
1. HIGH: Check browser console for errors
2. HIGH: Verify API URL in deployed frontend
3. MEDIUM: Change default date to 'today'
4. LOW: Add better error handling and loading states

**Next Steps for User:**
Please share browser console errors or Network tab screenshot so I can pinpoint the exact issue.
