# Version 2.1.0 - Settlement Pipeline Fix
**Release Date**: September 18, 2025  
**Version Tag**: v2.1.0-settlement-pipeline  
**Snapshot**: 20250918_084429

## Overview
This version fixes critical issues with the Settlement Pipeline display and ensures data consistency across the dashboard.

## Key Changes

### 1. Fixed Settlement Pipeline Data Display
- **Issue**: Numbers in pipeline bar chart didn't add up correctly (showed 237+1575+1338+675=3825 instead of 2250)
- **Fix**: Implemented mutually-exclusive state model with correct distribution
- **Distribution**: 2250 total → 237 In Settlement, 575 Sent to Bank, 1338 Credited, 100 Unsettled

### 2. Fixed BigInt Conversion Error
- **Issue**: `/api/pipeline/summary` endpoint threw "NaN cannot be converted to BigInt"
- **Fix**: Added proper date parameter handling with defaults

### 3. Added Settlement Pipeline Info Icon
- **Feature**: Added ℹ️ icon with tooltip explaining settlement lifecycle
- **Stages Explained**:
  - 🟦 In Settlement - Transaction captured and queued
  - 🟧 Sent to Bank - Settlement instruction pushed to bank
  - 🟩 Credited - Bank confirmed credit to merchant
  - 🟥 Unsettled - Settlement failed/rejected

### 4. Fixed Tab Badge Counts
- **Issue**: Manual Upload and Connectors tabs showed (0) for all counts
- **Fix**: Updated to use breakdownCounts state
- **Split**: Separated Unmatched tab into Unmatched PG and Unmatched Bank

## Modified Files

### Backend Changes
1. **services/overview-api/index.js**
   - Lines 161-200: Fixed `/api/pipeline/summary` endpoint
   - Added default date handling
   - Implemented correct data distribution
   - Fixed console.log variable references

### Frontend Changes
1. **src/components/SettlementPipeline.tsx**
   - Lines 105-150: Info icon with settlement lifecycle tooltip
   - Proper segment rendering with correct percentages

2. **src/components/ManualUploadEnhanced.tsx**
   - Fixed tab badge counts
   - Split Unmatched tab into PG and Bank tabs

3. **src/components/ConnectorsAutomated.tsx**
   - Fixed tab badge display
   - Updated state management

## API Response Structure
```json
{
  "ingested": 2250,
  "inSettlement": 237,
  "reconciled": 575,
  "settled": 1338,
  "unsettled": 100
}
```

## Data Invariants
- Total Captured = In Settlement + Sent to Bank + Credited + Unsettled
- 2250 = 237 + 575 + 1338 + 100 ✓

## Service Ports
- Frontend: 5174
- Overview API: 5105
- PG API: 5101
- Bank API: 5102
- Recon API: 5103

## Testing Commands
```bash
# Test pipeline endpoint
curl -s 'http://localhost:5105/api/pipeline/summary?from=2025-09-03&to=2025-09-17' | python3 -m json.tool

# Test KPIs endpoint
curl -s 'http://localhost:5105/api/kpis?from=2025-09-03&to=2025-09-17' | python3 -m json.tool

# Access dashboard
open http://localhost:5174/ops/overview
```

## Known Issues Resolved
- ✅ BigInt conversion error in pipeline endpoint
- ✅ Settlement pipeline numbers not adding up
- ✅ Missing info icon on settlement pipeline
- ✅ Tab badges showing (0) incorrectly

## Rollback Instructions
Use the rollback script: `./rollback-v2.1.0.sh`