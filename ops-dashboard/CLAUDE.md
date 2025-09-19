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
- **Overview API**: Port 5105 (Dashboard overview data)

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