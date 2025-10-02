# SettlePaisa Ops Dashboard - Version History

## Current Version: 2.4.0
**Release Date**: October 2, 2025  
**Status**: Production Ready  
**Environment**: Development

---

## Version 2.4.0 - Reconciliation Excellence & Exception Persistence
**Date**: October 2, 2025

### 🎯 Major Features
- ✅ **Complete Exception Persistence** - All 5 types of exceptions now saved to database
  - Missing UTR exceptions
  - Amount mismatch exceptions  
  - Duplicate UTR exceptions
  - Previously: Only 25/30 transactions saved
  - Now: All 30/30 transactions persisted correctly

- ✅ **File Upload Persistence in Recon Workspace**
  - Files remain visible across page navigation
  - localStorage-based metadata persistence
  - "Start New" button to explicitly clear state
  - Mock File objects for display without actual file content

- ✅ **Cash Impact Card Fixes**
  - Fixed variance calculation (now shows ₹71.49K correctly)
  - Removed double-counting of exceptions
  - Aligned with Variance tile data
  - Corrected unreconciled count display

### 🔧 Technical Improvements

#### Backend
- **Reconciliation Engine** (`services/recon-api/jobs/runReconciliation.js`)
  - Added exception transaction persistence loop (lines 758-798)
  - Fixed REPLACE logic to delete old manual uploads before inserting
  - All 30 PG transactions now saved (15 RECONCILED + 15 EXCEPTION)
  - Source type correctly set to MANUAL_UPLOAD vs CONNECTOR
  - Amount conversion: Rupees → Paise with proper rounding

- **Overview API** (`services/overview-api/overview-v2.js`)
  - Fixed unmatchedTransactions calculation (set to 0, as exceptions = unmatched)
  - Corrected financial.unreconciledAmount to use exception amounts
  - Added proper date filtering for Today/Custom ranges

#### Frontend
- **File Persistence** (`src/components/ManualUploadEnhanced.tsx`)
  - localStorage save/restore for file metadata
  - jobId persistence across navigation
  - "Start New" button implementation
  - Automatic result restoration on mount

- **Data Hooks** (`src/hooks/opsOverview.ts`)
  - Fixed unmatchedPgCount = exceptionsCount (not split artificially)
  - unmatchedBankCount = 0 (tracked separately)
  - Removed incorrect Math.floor/ceil splitting logic

- **Overview Page** (`src/pages/Overview.tsx`)
  - Fixed unreconciledCount calculation (removed double-counting)
  - Changed from complex sum to simple exceptionsCount

### 📊 Database Schema Updates
```sql
-- sp_v2_transactions table now correctly stores all exceptions
-- Status values: RECONCILED, EXCEPTION, PENDING
-- Source types: MANUAL_UPLOAD, CONNECTOR, API
```

### 🐛 Bug Fixes
1. **Exception Persistence** - Fixed 5 amount mismatch exceptions not being saved
2. **File Upload State** - Files no longer disappear on navigation
3. **Cash Impact Calculation** - Now matches Variance tile (₹71.49K)
4. **Double Counting** - Removed duplicate exception counting in unreconciledCount
5. **Service Restart** - Fixed multiple node processes issue (pkill -9 all instances)

### 📈 Verified Metrics (2025-10-02 Test)
```
Upload: 30 PG transactions + 23 Bank records

Reconciliation Results:
✅ 15 Matched (RECONCILED) 
✅ 10 Unmatched PG (EXCEPTION - Missing UTR)
✅ 5 Amount Mismatches (EXCEPTION - Amount variance)
✅ 3 Unmatched Bank (not in PG totals)

Database Storage:
✅ 30 transactions in sp_v2_transactions
   - 15 with status='RECONCILED'
   - 15 with status='EXCEPTION'
✅ 3 bank records in sp_v2_bank_statements

Overview Display:
✅ Match Rate: 50.0% (15/30)
✅ Total Amount: ₹1.54L (₹153,911.86)
✅ Reconciled: ₹82.42K (₹82,417.43)
✅ Variance: ₹71.49K (₹71,494.43)
✅ Exceptions: 15
```

### 📝 Documentation Added
- `OVERVIEW_TILES_REPORT.md` - Complete analysis of all Overview tiles
- `CASH_IMPACT_CARD_ANALYSIS.md` - Cash Impact card formula documentation
- `SETTLEMENT_V1_LOGIC_IMPLEMENTATION_COMPLETE.md` - Settlement logic reference
- `V2.3.1_SQL_AMBIGUITY_FIX_CONTEXT.md` - SQL query fixes

### 🔄 Breaking Changes
None - All changes backward compatible

### ⚠️ Known Issues
- Connector Health Card still uses mock data (not production-ready)
- Settlement calculation fails for missing merchant config (expected for test data)

---

## Version 2.3.1 - SQL Ambiguity Fix
**Date**: September 23, 2025

### Bug Fixes
- Fixed SQL column ambiguity in reconAmountQuery
- Added explicit table aliases (rm.created_at)

---

## Version 2.3.0 - V2 Dashboard Integration
**Date**: September 20, 2025

### Features
- Complete V2 Dashboard integration with original layout
- Real-time reconciliation metrics
- Enhanced KPI cards with sparklines

---

## Version 2.2.0 - SFTP Ingestion
**Date**: September 15, 2025

### Features
- SFTP-based file ingestion
- Automated bank statement processing
- Scheduled reconciliation jobs

---

## Version 2.1.1 - Service Monitoring
**Date**: August 10, 2025

### Features
- Enterprise-grade service monitoring
- Health check endpoints
- Automated restart capabilities

---

## Version 2.0.0 - Initial Ops Dashboard
**Date**: January 17, 2025

### Features
- Complete merchant settlements dashboard
- Settlement timeline visualization
- Instant settlement capabilities
- Interactive timeline drawer

---

## Versioning Strategy

### Semantic Versioning (SemVer)
We follow Semantic Versioning 2.0.0:
- **MAJOR** version (X.0.0): Incompatible API changes
- **MINOR** version (0.X.0): New functionality, backwards-compatible
- **PATCH** version (0.0.X): Backwards-compatible bug fixes

---

## Compatibility Matrix

| Component | Version | Compatible With | Notes |
|-----------|---------|----------------|-------|
| Frontend | 2.4.0 | API 2.4.0 | Full compatibility |
| Recon API | 2.4.0 | Frontend 2.4.0 | Exception persistence |
| Overview API | 2.4.0 | Frontend 2.4.0 | Fixed calculations |
| Database | settlepaisa_v2 | API 2.4.0 | Schema stable |
| Node.js | >=24.0.0 | All components | Current: v24.4.1 |
| PostgreSQL | 5433 | Backend | settlepaisa_v2 DB |

---

## Deployment Information

### Development Environment
- **Frontend URL**: http://localhost:5174/ops/overview
- **Recon API**: http://localhost:5103
- **Overview API**: http://localhost:5108
- **Database**: PostgreSQL settlepaisa_v2 (localhost:5433)

### Service Management
```bash
# Start all services
./start-services.sh

# Frontend dev server
npm run dev -- --port 5174

# Recon API
cd services/recon-api && node index.js

# Overview API  
cd services/overview-api && node overview-v2.js
```

---

## Version 2.4.0 Testing Checklist

- [x] Exception persistence (all 30 transactions saved)
- [x] File upload state preservation
- [x] Cash Impact card shows correct variance
- [x] Overview tiles dynamically update from database
- [x] REPLACE logic deletes old manual uploads
- [x] Source type categorization (MANUAL_UPLOAD vs CONNECTOR)
- [x] Amount conversion (rupees to paise)
- [x] Match rate calculation (50.0% for 15/30)
- [x] Variance tile matches Cash Impact card
- [x] Exception count displays correctly (15)

---

## Git Tag
```bash
git tag -a v2.4.0 -m "Reconciliation excellence with exception persistence and file upload state management"
```

---

## License
Proprietary - SettlePaisa 2025

---

**Last Updated**: October 2, 2025  
**Next Version**: 2.5.0 (Planned - Real connector health monitoring)
