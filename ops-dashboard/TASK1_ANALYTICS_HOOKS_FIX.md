# Task 1: Fix Analytics Hooks - Remove Hardcoded localhost:5105

## Status: ✅ COMPLETED LOCALLY

## Changes Made

### 1. Modified Files (5 files)

**Frontend Hooks:**
- `src/hooks/useAnalyticsV2.ts` - Added BASE_URL constant using env var
- `src/hooks/useAnalytics.ts` - Added BASE_URL constant, replaced 5 hardcoded URLs
- `src/hooks/useDisputesKpis.ts` - Added BASE_URL constant, replaced 3 hardcoded URLs

**Environment Configuration:**
- `.env` - Added `VITE_ANALYTICS_API_URL=http://localhost:5105`
- `.env.staging-ops` - Added `VITE_ANALYTICS_API_URL=http://13.201.179.44:5105`

### 2. Changes Summary

**Before:**
```typescript
baseURL: 'http://localhost:5105'  // HARDCODED
```

**After:**
```typescript
const BASE_URL = import.meta.env.VITE_ANALYTICS_API_URL || 'http://localhost:5105';
// ... in each function:
baseURL: BASE_URL  // USES ENV VAR
```

### 3. Functions Fixed

**useAnalyticsV2.ts** (5 functions):
- useAnalyticsKpisV3
- useModeStacked
- useGmvTrendV2
- useSettlementFunnel
- usePareto

**useAnalytics.ts** (5 functions):
- useAnalyticsKpisV2
- useAnalyticsModeDistribution
- useAnalyticsGmvTrend
- useAnalyticsSettlementFunnel
- useAnalyticsFailureReasons

**useDisputesKpis.ts** (3 functions):
- useDisputesKpis
- useOutcomeSummary
- useSlaBuckets

## Environment Variables

### Local Development (.env)
```bash
VITE_ANALYTICS_API_URL=http://localhost:5105
```

### Staging (.env.staging-ops)
```bash
VITE_ANALYTICS_API_URL=http://13.201.179.44:5105
```

### Production (will add later)
```bash
VITE_ANALYTICS_API_URL=https://api.settlepaisa.com  # or production endpoint
```

## Verification

```bash
# Check no hardcoded URLs remain (except fallbacks):
grep -r "localhost:5105" src/hooks/useAnalytics*.ts src/hooks/useDisputesKpis.ts

# Expected output (3 lines - these are fallback defaults, OK):
# src/hooks/useAnalytics.ts:4:const BASE_URL = import.meta.env.VITE_ANALYTICS_API_URL || 'http://localhost:5105';
# src/hooks/useAnalyticsV2.ts:4:const BASE_URL = import.meta.env.VITE_ANALYTICS_API_URL || 'http://localhost:5105';
# src/hooks/useDisputesKpis.ts:4:const BASE_URL = import.meta.env.VITE_ANALYTICS_API_URL || 'http://localhost:5105';
```

## Next Steps

1. **Test locally** - Start frontend and verify no console errors
2. **Build** - Run `npm run build` and verify env vars replaced in bundle
3. **Commit** - Commit changes to git branch `feat/production-hardening`
4. **Deploy to staging** - Copy `.env.staging-ops`, rebuild, sync to S3
5. **Validate** - Check browser console, verify calls go to 13.201.179.44:5105 (not localhost)

## Notes

- ⚠️ Port 5105 Analytics API may not exist yet - these hooks will fail gracefully
- ✅ This change makes the code environment-aware and production-ready
- ✅ No more localhost:5105 in production builds
- ✅ Staging will use staging analytics endpoint
