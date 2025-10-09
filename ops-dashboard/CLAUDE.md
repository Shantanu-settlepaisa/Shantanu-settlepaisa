# SettlePaisa 2.0 Ops Dashboard

## Quick Start
The Ops Dashboard is always running on port **5174**.

### Access URLs
- **Main Dashboard**: http://localhost:5174/ops/overview
- **Root URL**: http://localhost:5174/ (auto-redirects to Ops Overview)

### Starting All Services
```bash
# Start all backend services (PG API, Bank API, Recon API, Overview API)
./start-services.sh

# Start the frontend dev server
npm run dev -- --port 5174

# The server runs in background, logs are at /tmp/vite.log
```

### Backend Services
- **PG API**: Port 5101 (Mock Payment Gateway data)
- **Bank API**: Port 5102 (Mock Bank data)
- **Recon API**: Port 5103 (Reconciliation engine)
- **Overview API**: Port 5108 (Dashboard overview data)
- **Upload API**: Port 5109 (File upload processing)

## Important Context
This is the SettlePaisa 2.0 Ops Dashboard with:
- **Port**: Always 5174 (not 5173)
- **Default Page**: /ops/overview (Reconciliation Overview)
- **Framework**: React + TypeScript + Vite + Tailwind CSS

## Project Structure
```
/Users/shantanusingh/ops-dashboard/
├── src/
│   ├── pages/ops/
│   │   ├── Overview.tsx           # Full-featured overview page
│   │   └── OverviewSimple.tsx     # Currently active overview page
│   ├── components/Overview/
│   │   ├── Kpis.tsx               # KPI cards with sparklines
│   │   ├── BySource.tsx           # Reconciliation by source
│   │   ├── TopReasons.tsx         # Top unreconciled reasons
│   │   ├── ConnectorsHealth.tsx   # Connector health monitoring
│   │   ├── DataQuality.tsx        # Data quality metrics
│   │   └── BankFeedLag.tsx        # Bank feed lag monitoring
│   ├── services/
│   │   └── overview.ts            # Main overview service (fetchOverview)
│   └── router.tsx                 # Routes configuration
```

## Key Features
- **Numerical Consistency**: Mutually exclusive pipeline buckets
- **Real-time Updates**: 30-second refresh interval
- **Interactive Components**: All tiles and segments clickable
- **Data Validation**: Automatic constraint checking (credited ≤ sentToBank)

## Current Configuration
- Router uses `OverviewSimple` component (line 12 in router.tsx)
- Default route "/" redirects to "/ops/overview"
- Dev server runs on port 5174 with HMR enabled

## If Server Stops
```bash
# Check if running
ps aux | grep vite | grep 5174

# Restart if needed
npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &
```

## Notes for Future Sessions
- Always use port 5174 for this dashboard
- The main entry point is /ops/overview
- Service function is `fetchOverview` (not fetchOverviewCounts)
- Data structure: `overview.pipeline.xxx` for pipeline data

## Database Tables - CRITICAL DISTINCTION

### Transaction Tables - DO NOT CONFUSE

| Table | Use When | Schema Key | DON'T Use When |
|-------|----------|------------|----------------|
| **`sp_v2_transactions`** | ✅ Manual uploads (CSV)<br>✅ Recon Workspace<br>✅ File upload API<br>✅ New features<br>✅ Transaction counts | • `transaction_id` VARCHAR<br>• `source_type` field<br>• BIGSERIAL id<br>• Status: PENDING/RECONCILED/EXCEPTION | ❌ Settlement calculations<br>❌ PG webhooks<br>❌ When joined with sp_v2_settlement_items |
| **`sp_v2_transactions_v1`** | ✅ PG webhook ingestion<br>✅ Settlement processing<br>✅ Reconciliation amounts<br>✅ When FK from settlement_items | • `pgw_ref` TEXT<br>• `merchant_id` UUID (FK)<br>• UUID id<br>• Status: SUCCESS/FAILED/PENDING | ❌ Manual uploads<br>❌ Recon workspace<br>❌ File processing |

### Quick Decision Rules

**Ask yourself:**
1. **Is this a file upload/manual operation?** → Use `sp_v2_transactions`
2. **Is this joined with `sp_v2_settlement_items`?** → Use `sp_v2_transactions_v1`
3. **Does it involve webhooks from Razorpay/PayU?** → Use `sp_v2_transactions_v1`
4. **Is it counting transactions?** → Probably `sp_v2_transactions`
5. **Is it calculating settlement amounts?** → Probably `sp_v2_transactions_v1`

### Service-to-Table Mapping

| Service/API | Port | Primary Table |
|------------|------|--------------|
| File Upload API | 5109 | `sp_v2_transactions` |
| Recon API | 5103 | `sp_v2_transactions` |
| PG Ingestion | N/A | `sp_v2_transactions_v1` |
| Settlement Engine | N/A | `sp_v2_transactions_v1` |
| Overview API | 5108 | **BOTH** (counts from v2, amounts from v1) |

### Current Data Status (as of Oct 2025)
- `sp_v2_transactions`: 706 rows (manual uploads)
- `sp_v2_transactions_v1`: Used by settlements (FK from sp_v2_settlement_items)

### Tables That Reference sp_v2_transactions_v1
- `sp_v2_settlement_items` (FOREIGN KEY: txn_id)
- `sp_v2_recon_matches` (via settlement_items join)

### Migration Note
DO NOT attempt to merge these tables without consulting the team. 
They have incompatible schemas (BIGSERIAL vs UUID, different status values, different FK constraints).