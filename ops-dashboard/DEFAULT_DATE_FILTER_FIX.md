# Default Date Filter Fix - Overview Dashboard

**Date**: 2025-10-05  
**Issue**: Dashboard defaulting to "Last 7 Days" instead of "Today"  
**Root Cause**: Global time filter store with persisted localStorage

---

## Problem

1. **Dashboard shows "Last 7 Days" by default** on every page load
2. **Shows 47 transactions** instead of 0 for today
3. **localStorage persistence** keeps the old "Last 7 Days" filter even after hard refresh

---

## Root Cause Analysis

### File: `src/stores/timeFilterStore.ts`

The global time filter store had:

```typescript
// OLD (PROBLEMATIC)
const defaultFilter: TimeFilter = {
  from: getDateString(7),     // 7 days ago ❌
  to: getDateString(0),       // today
  label: 'Last 7 Days'        // ❌
};

export const useTimeFilterStore = create<TimeFilterStore>()(
  persist(
    (set, get) => ({ ... }),
    {
      name: 'time-filter-storage',  // ❌ Persisted in localStorage
      // No version key ❌
    }
  )
);
```

**Why This Caused Issues:**

1. Default filter was "Last 7 Days" (Oct 5 - 7 days = Sep 28)
2. Zustand `persist` middleware saves this to localStorage
3. Even after code changes and hard refresh, localStorage value persists
4. All dashboard pages use this global filter via `useTimeFilterStore()`

**Console Evidence:**
```
📡 [V2 Hooks] Calling V2 API: http://localhost:5108/api/overview?from=2025-09-28&to=2025-10-05
```

Shows it was fetching last 7 days (Sep 28 to Oct 5) instead of just today (Oct 5).

---

## The Fix

### Change 1: Update Default Filter to "Today"

```typescript
// NEW (FIXED)
const defaultFilter: TimeFilter = {
  from: getDateString(0),  // ✅ Today
  to: getDateString(0),    // ✅ Today
  label: 'Today'           // ✅
};
```

### Change 2: Add Version to Clear Old Cache

```typescript
export const useTimeFilterStore = create<TimeFilterStore>()(
  persist(
    (set, get) => ({ ... }),
    {
      name: 'time-filter-storage',
      version: 2, // ✅ Increment version to invalidate old cache
      merge: (persistedState, currentState) => { ... }
    }
  )
);
```

**What `version: 2` does:**
- Zustand checks the version in localStorage
- If stored version ≠ current version, it **discards the cached data**
- Falls back to the new `defaultFilter` (Today)

---

## How It Works Now

### Before:
```
1. Page loads
2. Zustand reads localStorage: { filter: { label: 'Last 7 Days', from: '2025-09-28', to: '2025-10-05' } }
3. Dashboard shows Last 7 Days data (47 transactions)
```

### After:
```
1. Page loads
2. Zustand checks localStorage version: version 1 (old) ≠ version 2 (new)
3. Discards old cache
4. Uses new defaultFilter: { label: 'Today', from: '2025-10-05', to: '2025-10-05' }
5. Dashboard shows Today data (0 transactions) ✅
```

---

## Testing

After the fix:

1. **Refresh the browser** - Page will show "Today" by default
2. **Check console logs**:
   ```
   📡 [V2 Hooks] Calling V2 API: http://localhost:5108/api/overview?from=2025-10-05&to=2025-10-05
   ```
3. **Verify dashboard shows 0 transactions** for today (Oct 5, 2025)
4. **Date filter dropdown** should show "Today" as selected

---

## Additional Benefits

### Before:
- ❌ Showed 7 days of data by default (confusing for daily ops)
- ❌ High initial data load (unnecessary API calls)
- ❌ Users had to manually change to "Today" every time

### After:
- ✅ Shows today's data by default (relevant for daily ops)
- ✅ Lighter initial load (only today's data)
- ✅ Users can still select other ranges (Last 7 Days, Last 30 Days, etc.)

---

## No Restart Required

The Vite dev server is running and will hot-reload these changes.

**Just refresh your browser** and the dashboard will:
1. Default to "Today"
2. Show 0 transactions (since there are none for Oct 5, 2025)
3. Clear the old localStorage cache automatically

---

## Impact on Other Pages

This fix affects **ALL pages** that use the global time filter:

✅ **Overview** (`/ops/overview`) - Now defaults to Today  
✅ **Analytics** (`/ops/analytics`) - Now defaults to Today  
✅ **Exceptions** (`/ops/exceptions`) - Now defaults to Today  
✅ **Any other page using `useTimeFilterStore()`**

---

## localStorage Cache Details

**Storage Key**: `time-filter-storage`  
**Old Value** (version 1):
```json
{
  "state": {
    "filter": {
      "from": "2025-09-28",
      "to": "2025-10-05",
      "label": "Last 7 Days"
    }
  },
  "version": 1
}
```

**New Value** (version 2):
```json
{
  "state": {
    "filter": {
      "from": "2025-10-05",
      "to": "2025-10-05",
      "label": "Today"
    }
  },
  "version": 2
}
```

---

## Manual localStorage Clear (Optional)

If the auto-migration doesn't work, you can manually clear localStorage:

1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Expand **Local Storage** → `http://localhost:5174`
4. Delete the key `time-filter-storage`
5. Refresh the page

---

**Status**: ✅ Fixed  
**Impact**: Dashboard now defaults to "Today" instead of "Last 7 Days"  
**No Breaking Changes**: Users can still select any date range manually
